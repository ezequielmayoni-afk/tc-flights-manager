# HUB — Acceso read-only a la DB del CRM y guía del reporte de atribución

> Para el dev que construye el sistema interno.
> Base de datos **productiva**: la usan los vendedores en este momento.

---

## 1. Conexión

```
host:     crm-postgres.cufmmosckui5.us-east-1.rds.amazonaws.com
puerto:   5432
database: crm_db
usuario:  hub
password: (te la pasa Agustín por separado)
sslmode:  require
```

El usuario es **read-only estricto**, verificado: `INSERT`, `UPDATE`, `DELETE`, `CREATE TABLE` y
`DROP` están todos bloqueados a nivel de sesión (`default_transaction_read_only = on`). No podés
romper nada, tampoco por accidente.

Límites que trae puestos: `statement_timeout = 120s` (una consulta pesada se corta sola en vez de
tumbar la base), `idle_in_transaction_session_timeout = 60s` y **máximo 10 conexiones simultáneas**.
Si necesitás más, pedilo — no es un límite arbitrario, la base tiene un pool compartido con la app.

---

## 2. Tres reglas que no se negocian

**1. Filtrá SIEMPRE por `tenant_id`.** El CRM es multi-tenant. Todas las tablas lo tienen. El tenant
de Sí Viajo es:

```sql
'6c15c044-4499-48b6-aba9-bbf5fdfe5110'
```

Sin ese filtro los números salen mal y las consultas escanean de más.

**2. `messages` pesa 18 GB y tiene 9,87 millones de filas.** Nunca la consultes sin acotar por
`tenant_id` + rango de fechas. Un `SELECT` sin filtros ahí puede degradar el CRM productivo.

| tabla | filas | peso |
|---|---|---|
| `messages` | 9.870.252 | **18 GB** ⚠️ |
| `contacts` | 344.706 | 914 MB |
| `activity_logs` | 1.716.816 | 860 MB |
| `conversations` | 241.932 | 283 MB |
| `contact_identities` | 387.647 | 261 MB |
| `opportunities` | 56.670 | 78 MB |
| `quotations` | 30.739 | 75 MB |
| `conversion_events` | 104.633 | 58 MB |
| `contact_attribution_history` | 42.637 | 30 MB |
| `meta_ads_ads` | 987 | 2,6 MB |

**3. Consultá en horario de baja carga.** El pico de uso es de 6 a 14 h (hasta 115.000 requests/hora).
Después de las 15 h baja al 30%. Para cargas completas, mejor de noche.

---

## 3. El dato que te va a morder si no lo sabés

**El teléfono de la ficha del contacto NO es necesariamente el número por el que la persona chatea.**

- `contacts.phone` → lo que se cargó al crear el contacto (formulario del anuncio, importación, carga manual)
- `contact_identities.external_id` → el número real desde el que escribe por WhatsApp

**Difieren en 35.266 casos: el 9,1%, uno de cada once.** Pasa porque la persona deja un teléfono en
un formulario y escribe desde otro, o porque se cargó con un dígito cambiado.

Para identificar a una persona de forma confiable usá `contact_identities`, no `contacts.phone`.
Un contacto puede tener **varias** identidades (cambió de número, o escribió desde dos).

---

## 4. Bloque A — Atribución de marketing (Meta)

La tabla es **`contact_attribution_history`** (42.637 filas, desde el 25-may-2026). Hoy el 100% de
los registros son `event_type='ad_click'` con `utm_source='meta_ads'`: son clicks en anuncios de
Meta que abren WhatsApp (**CTWA**, Click-To-WhatsApp).

Columnas propias: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`,
`referrer_url`, `landing_page`, `timestamp`.

Lo bueno está en **`metadata` (jsonb)**:

```json
{
  "adId": "52609696770132",
  "sourceId": "52609696770132",
  "adTitle": "Costa Mujeres te Espera",
  "headline": "Costa Mujeres te Espera",
  "mediaType": "image",
  "sourceType": "ad",
  "ctwaClickId": "AfhhZUXThM3CtwKSTDLedlTkfbg8hHu8Zk3...",
  "source": "ctwa_inbound_message",
  "isFirstTouch": false
}
```

- **`adId`** → el anuncio de Meta. Es la llave para enriquecer (ver abajo).
- **`ctwaClickId`** → el click id de Meta; es lo que permite cerrar el círculo con la Conversions API.
- **`isFirstTouch`** → si fue el primer contacto o una reincidencia. Sirve para separar
  first-touch de last-touch sin inventar la lógica.

### Enriquecer el anuncio hasta la campaña

`metadata->>'adId'` se une con **`meta_ads_ads.id`** (ojo: la columna se llama `id`, no `ad_id`),
y de ahí a `meta_ads_adsets` y `meta_ads_campaigns`:

```sql
SELECT
  ah.contact_id,
  ah."timestamp"                AS click_at,
  ah.metadata->>'adId'          AS ad_id,
  ah.metadata->>'adTitle'       AS creatividad,
  ah.metadata->>'ctwaClickId'   AS ctwa_click_id,
  (ah.metadata->>'isFirstTouch')::boolean AS first_touch,
  a.name                        AS anuncio,
  s.name                        AS adset,
  c.name                        AS campania
FROM contact_attribution_history ah
LEFT JOIN meta_ads_ads      a ON a.id = ah.metadata->>'adId'
LEFT JOIN meta_ads_adsets   s ON s.id = a.adset_id
LEFT JOIN meta_ads_campaigns c ON c.id = a.campaign_id
WHERE ah.tenant_id = '6c15c044-4499-48b6-aba9-bbf5fdfe5110'
  AND ah."timestamp" >= now() - interval '30 days';
```

**Sinceridad sobre la cobertura: el join resuelve el 57%** (6.068 de 10.587 clicks en 30 días).
El resto son anuncios que ya no existen en la cuenta o que no se sincronizaron. Usá `LEFT JOIN` y
tratá el `NULL` como "anuncio no catalogado" — no descartes esas filas, siguen teniendo `adTitle`.

Tablas complementarias: `meta_ads_insights_daily` (gasto e impresiones por día, para costo por lead),
`meta_ads_accounts`, `meta_ads_sync_logs`.

---

## 5. Bloque B — Códigos SIV en los mensajes

**Hay dos formatos y significan cosas distintas. No los mezcles.**

| formato | dirección | ejemplo | qué es |
|---|---|---|---|
| `SIV 44495922` — 8 dígitos, espacio | **inbound** | *"Hola! Quiero mas info de la promo SIV 55069673 (no borrar)"* | **código de promo/publicación** |
| `SIV-2759` — 4 dígitos, guion | **outbound** | *"Su FILE es SIV-2622"* | **número de file/reserva** interno |

El primero es el que te interesa para atribución: viene **prellenado en el anuncio de Meta**, el
cliente lo manda sin tocarlo (por eso el "(no borrar)"). Identifica **qué paquete puntual** motivó
el contacto. En 30 días hay **9.493 mensajes inbound** con ese código.

**No existe ninguna tabla de promos ni ningún campo del CRM que guarde el código.** Vive solamente
en el texto del mensaje: hay que extraerlo con regex.

Usá **`messages.searchable_text`** (tipo `text`), NO `messages.content` — ese es `jsonb` y no acepta
operadores de texto. `searchable_text` además ya incluye transcripciones de audio y OCR de imágenes.

```sql
SELECT
  cv.contact_id,
  m.created_at,
  (regexp_matches(m.searchable_text, 'SIV[ -]?([0-9]{6,8})', 'i'))[1] AS codigo_siv
FROM messages m
JOIN conversations cv ON cv.id = m.conversation_id
WHERE m.tenant_id = '6c15c044-4499-48b6-aba9-bbf5fdfe5110'
  AND m.created_at >= now() - interval '30 days'   -- OBLIGATORIO
  AND m.direction = 'inbound'
  AND m.searchable_text ~* 'SIV[ ][0-9]{6,8}';     -- 8 dígitos = promo
```

### El cruce que da valor

**El código SIV también aparece en el nombre del adset de Meta.** Ejemplo real:

```
adset: "GRUPALES_OCTUBRE_ID_SIV_ 42684558 - ok"
```

Eso te da **dos caminos independientes** hacia el mismo paquete —el mensaje del cliente y el nombre
del adset— y podés cruzarlos para validar. Ojo con el espacio irregular después de `SIV_`: normalizá
con regex, no con `LIKE`.

**8.162 contactos en 30 días tienen código SIV *y* registro de atribución de Meta.** Ese cruce
—qué anuncio trajo a la persona y por qué paquete preguntó— es lo más accionable del reporte.

---

## 6. Bloque C — Oportunidades y flujo por el pipeline

`opportunities` guarda **solo la etapa actual** (`stage` + `stage_changed_at`). El historial no está ahí.

**El flujo por etapas está en `activity_logs`**, con `action = 'opportunity.stage_changed'`:

```sql
SELECT
  al.entity_id                    AS opportunity_id,
  al.created_at                   AS entro_a_la_etapa,
  al.changes->'stage'->>'old'     AS etapa_anterior,
  al.changes->'stage'->>'new'     AS etapa_nueva,
  al.actor_type,                            -- 'user' | 'bot' | 'system'
  al.actor_user_id
FROM activity_logs al
WHERE al.tenant_id = '6c15c044-4499-48b6-aba9-bbf5fdfe5110'
  AND al.action = 'opportunity.stage_changed'
  AND al.entity_id = :opportunity_id
ORDER BY al.created_at;
```

**Cobertura: 84.117 transiciones desde el 17-ene-2026.** Las oportunidades anteriores a esa fecha
no tienen historial — para esas solo hay `stage_changed_at` (la última transición). Tenelo en cuenta
antes de calcular tiempos medios por etapa sobre períodos viejos.

Otras acciones útiles en la misma tabla: `opportunity.created` (55.018), `opportunity.lost` (34.178),
`opportunity.won` (1.295), `opportunity.assigned` (5.776 — desde el 30-jul-2026).

### Las etapas reales

```
new → quote_pending → quoted → negotiating → ready_to_book → won | lost
```

Distribución actual: `lost` 50.060 · `new` 3.747 · `won` 1.476 · `quoted` 929 · `negotiating` 99 ·
`quote_pending` 96 · `ready_to_book` 26.

**No asumas que el flujo es lineal.** Hay retrocesos reales (vi `quoted → quote_pending`). Si vas a
medir "tiempo en etapa", contemplá que una oportunidad puede entrar dos veces a la misma.

### Campos de `opportunities` que valen

`title`, `destinations` (jsonb), `travel_date_start` / `travel_date_end`, `travelers_count`,
`estimated_value` / `quoted_value` / `final_value`, `currency`, `profit`, `closed_reason`,
`closed_at`, `assigned_user_id`, `quotation_count`, `is_primary`.

⚠️ **`deleted_at IS NULL`** — hay borrado lógico. Filtralo siempre o vas a contar de más.
⚠️ Un contacto puede tener **varias** oportunidades; `is_primary` marca la principal.

---

## 7. Lo que yo sumaría (no lo pediste, pero está y cambia el análisis)

**`quotations`** (30.739) — las cotizaciones enviadas, con `contact_id` y `opportunity_id`. Permite
separar "le cotizamos y no compró" de "ni llegamos a cotizar", que son dos problemas distintos.
`opportunities.quotation_count` ya trae el conteo si no querés el detalle.

**`closed_reason`** — el motivo de pérdida sobre 50.060 oportunidades perdidas. Cruzado con el
anuncio de origen te dice **qué creatividad trae gente que no compra y por qué**. Probablemente sea
el dato más accionable de todo el reporte para el equipo de marketing.

**`conversations`** (241.932) — tiempo hasta la primera respuesta y quién atendió. Hay bots y
humanos; `messages.sender_type` los distingue. La velocidad de respuesta suele explicar más de la
conversión que la creatividad, y acá se puede medir de verdad.

**`conversion_events`** (104.633) y **`capi_event_logs`** (105.720) — lo que se le reportó a Meta
por la Conversions API. Sirve para auditar si Meta está recibiendo las conversiones que
corresponden. Aviso: hay un bug conocido de moneda hardcodeada que infla los Purchase de ARS a USD,
así que no tomes esos valores monetarios como verdad sin validarlos.

**`reservations`** y **`bookings`** — la venta efectivamente concretada, que no es lo mismo que una
oportunidad en `won`.

**`users`** — el vendedor asignado (`opportunities.assigned_user_id`). Permite cortar por vendedor.

**`timeline_events`** — la línea de tiempo unificada por contacto, si querés reconstruir el
recorrido completo sin armar la unión a mano.

### El embudo completo, de punta a punta

Con todo lo anterior podés armar esto, que es lo que nadie tiene hoy en un solo lugar:

```
anuncio de Meta (campaña/adset/creatividad)
   → click CTWA (ctwaClickId, first-touch o no)
      → mensaje con el código SIV (qué paquete puntual)
         → conversación (cuánto tardamos en responder, bot o humano)
            → oportunidad (destino, valor, vendedor)
               → recorrido por el pipeline (cuánto tardó en cada etapa)
                  → won/lost + motivo de pérdida
                     → reserva y profit real
```

Un consejo sobre el modelo: **la unidad de análisis debería ser el contacto, no la oportunidad**.
Una persona puede hacer click en tres anuncios distintos, preguntar por dos paquetes y abrir cuatro
oportunidades. Si armás el reporte por oportunidad, vas a duplicar el gasto publicitario en la
atribución y los números de ROI van a dar mal.

---

## 8. Si algo no cierra

Antes de dar un número por bueno, contrastalo contra el CRM en pantalla. Varias tablas tienen
particularidades históricas —el backfill masivo de identidades del 2-mar-2026 creó 281.833 filas de
una, y los datos anteriores a enero-2026 tienen cobertura desigual— y es fácil sacar conclusiones de
un artefacto de migración.

Cualquier duda de modelo, preguntá antes de asumir.
