# Loop producto → venta · estado de las fases

Documento de seguimiento. Se actualiza al cerrar cada fase. El plan completo, con el detalle
técnico de cada una, está en `~/.claude/plans/perfecto-ahora-una-vez-abstract-meteor.md`.

**Última actualización: 2026-09-10.** Fases 0 y 1 hechas; Fase 2 desplegada en modo sombra; Fase 3 desplegada,
en validación.

## De un vistazo

| Fase | Qué resuelve | Estado | Depende de |
|---|---|---|---|
| 0 | Kernel de jobs, kill switches, crontab sin secretos | ✅ Hecha 2026-09-09 | — |
| 1 | Tendencias: qué destinos busca el mercado | ✅ Hecha 2026-09-09 | 0 |
| 2 | Guard de marketing: pausar anuncios de paquetes vencidos o agotados, insights por cron | 🟡 En sombra desde 2026-09-10 | 0 |
| 3 | Perfiles de destino, fechas con vuelos-siviajo (Sabre), cotización real, ideas de paquete | 🟡 Desplegada 2026-09-10, validando | 1 |
| 4 | Criterio marketing vs web y temáticas | ⏳ | 2, 3 |
| 5 | Lanzar conjuntos y anuncios en Meta desde HUB (en pausa) | ⏳ | 4 |
| 6 | Guardar idea en siviajo.com sin navegador; N salidas = N paquetes | ⏳ | 3 |
| 7 | Cupos: tiradas, pedido a aéreos en HUB + Slack, carga del cupo | ⏳ | 2, 3 |
| 8 | Tablero paquete × CRM: mensajes, ganadas, perdidas, CPA | ⏳ | 2 |
| 9 | Autopilot de anuncios: reglas, fatiga → diseño, re-subida | ⏳ | 5, 8 |
| 10 | Recotización con fecha alternativa | ⏳ | 6 |
| 11 | Instagram: promocionar posts existentes (opcional) | ⏳ | 5 |
| 12 | Catálogo de paquetes para retargeting en Meta | ⏳ | 5 |
| 13 | Competencia: Ad Library de Meta y anuncios de Google | ⏳ | 1 |
| 14 | Search Console: indexar paquetes y hoteles, desindexar bajas | ⏳ | 2 |
| 15 | Cierre: absorber media-os, documentación, panel del loop | ⏳ | todas |

Orden previsto: 0 → 1 → 2 → 3 → 4 → 5 → {6, 8, 12, 13, 14} → {7, 9, 10, 11} → 15.

## Decisiones ya tomadas (no se vuelven a discutir)

- El orquestador vive en HUB; media-os se absorbe y después se archiva.
- **Cambiado el 2026-09-09**: las fechas y el precio de referencia del aéreo los da `vuelos-siviajo` (matrix
  sobre el buscador de siviajo.com + Sabre con PCC propio), no SerpAPI Google Flights. El precio real del
  paquete sigue saliendo del cotizador-bot. SerpAPI queda sólo para Tendencias y Competencia.
- "Guardar idea" en siviajo.com se automatiza por ingeniería inversa del JSF dentro del cotizador-bot.
- Diseño sigue humano vía Drive; no hay generación de imágenes con IA.
- El pedido a aéreos es un tablero en HUB + aviso en Slack. Sin mail.
- Instagram: sólo promocionar posts existentes.
- HUB crea conjuntos y anuncios en Meta en PAUSADO; Ezequiel activa.
- Se empezó por Tendencias.
- **Tendencias mide sólo demanda de mercado: nada de siviajo.com** (Search Console queda para la Fase 14).
- Se suman catálogo de Meta (12), competencia dentro de Tendencias (13) y Search Console (14).

---

## Fase 0 — Saneamiento + kernel de jobs · ✅ Hecha

**Qué hay**: cola de jobs en Postgres (`hub_jobs`) que el crontab del VPS drena cada minuto; lanes por
proveedor con ventanas horarias (cotizador de noche, CRM en baja carga); kill switches en
`/automatizacion`; presupuesto por proveedor; crontab versionado en `ops/crontab.vps` sin secretos.

**Cambios respecto del plan**: el primer deploy borró el script del cron porque el rsync lleva
`--delete`; ahora vive en `/opt/hub-cron/`. Nada que no venga del build puede vivir en `/opt/hub`.

**Pendiente de Ezequiel**: revocar el token viejo de GitHub que llevaba el remote de tc-requote-bot.

## Fase 1 — Tendencias · ✅ Hecha

**Qué hay**: `/producto/tendencias`. Corre sola los lunes 05:00 (hora Argentina) o con "Correr ahora".
Cinco fuentes, todas de Google y YouTube para Argentina: autocompletado de Google con expansión por
letra, búsquedas relacionadas de "paquetes/viajes/vuelos/vacaciones/all inclusive/escapadas/crucero",
comparación en Google Trends de 41 destinos con "paquetes X", "viaje X" y "vuelos X", autocompletado de
YouTube y "tendencias ahora". Cruce con el catálogo → oportunidad / hueco / saturado / en baja. Alertas
por picos, huecos y búsquedas en alza. Panel "qué se busca y de qué se habla". Cada fila abre la
evidencia por fuente. Señales macro: dólar (BCRA) y fines de semana largos.

**Costo**: 42 búsquedas de SerpAPI por corrida (~180 al mes). Tope diario 250, mensual 2.500.

**Cambios respecto del plan**: media-os nunca cruzaba con el catálogo (leía una columna que no existe);
su extractor devolvía "Cancún Todo Incluido" como destino. Google Trends compara de a 5 con un 100 por
grupo: se usa un ancla mediana en todos los grupos. Los destinos con paquetes siempre se comparan.
Bayahibe: el mercado lo busca ~40 % de Punta Cana; queda rango 20–26, es fortaleza de SiViajo.

**Listo cuando (falta)**: dos lunes seguidos con corrida automática completa. Primera: 2026-09-14.

**Lo que puede ajustar Ezequiel sin código**: pesos de las fuentes y frases de Trends (una línea en
`src/lib/tendencias/config.ts`); tope de SerpAPI en `/automatizacion`.

**Decisión abierta**: TikTok/Instagram no publican datos de búsqueda; sólo con proveedor pago
(Apify/ScrapeCreators, 5–30 USD/mes, zona gris). Volúmenes absolutos: Google Ads Keyword Planner o
DataForSEO. Ninguno está incluido.

## Fase 2 — Guard de marketing, insights por cron, salud de integraciones · 🟡 Desplegada en sombra (2026-09-10)

**Qué hay**: insights de Meta cada hora (estaban congelados desde junio); vínculos cupo↔paquete persistidos y
refrescados a diario; el guard corre después de cada sincronización y registra en `/tareas` qué haría con cada
anuncio; salud diaria del token y la cuenta de Meta, del cotizador y de vuelos; reconciliación nocturna contra TC;
digest diario a Slack a las 7 de la mañana. Acciones nuevas en la tabla de paquetes: "Agrupar salidas" y "Volver a
visible". El bot del CRM ya resuelve las redirecciones del SIV. El umbral de cambio de precio es uno solo, el de la
pantalla de configuración (antes el cron usaba 5 % y los imports 10 %, fijos).

**Modo**: sombra. Pasa a semi cuando haya 14 días sin falsos positivos con ≥ 3 casos reales (se decide en
`/automatizacion`).


**Qué va a resolver**: hoy los insights de Meta están congelados desde junio porque se sincronizan a
mano, y ningún anuncio se apaga cuando el paquete vence, se oculta en TC o el cupo se agota.

**Qué entrega**: insights cada hora; reglas del guard (vencido → pausar; no visible → pausar; cupo
agotado con vínculo confirmado → pausar; precio distinto al de la creatividad → pedido de diseño;
CTR o costo por conversación fuera de umbral → alerta); decisiones en `/tareas` con aprobar, rechazar
y deshacer; chequeo diario del token de Meta; reconciliación nocturna con TC.

**Salidas múltiples** (agregado 2026-09-09): un destino con 3 cupos son 3 paquetes con 3 IDs, pero en
Meta se publica uno solo. Cuando ese ID se agota **no se pausa el anuncio ni se edita el mensaje en
Meta** (los creativos son inmutables y cambiarlos reinicia el aprendizaje). HUB redirige el ID: el bot
del CRM consulta el SIV en HUB y HUB le devuelve la siguiente salida con lugares, con la nota "la salida
del 12/03 se agotó; hay lugar el 26/03". En paralelo pide a diseño la creatividad con la fecha nueva y,
cuando está, relanza el anuncio con el ID nuevo y pausa el viejo. Sólo si no queda ninguna salida con
lugares se pausa. Requiere agrupar las salidas en `/packages` ("Agrupar salidas"); en la Fase 6 se
agrupan solas al nacer de una idea.

**Modo**: 14 días en sombra (sólo propone), después semi (pausa y avisa con deshacer).

**Necesita de Ezequiel**: autorizar la prueba de `PUT {active:true, visible:true}` y de temáticas sobre
un paquete de prueba; decidir el flag "ocultar en TC cuando el cupo se agota" (default apagado).

## Fase 3 — Perfiles de destino, fechas con vuelos-siviajo (Sabre), cotización, ideas · 🟡 Desplegada (2026-09-10)

**Qué hay**: `/producto/perfiles` con 45 destinos cargados con las reglas del consultor (editables en línea);
`/producto/ideas` para crear una idea con los defaults del destino, verla sondear y cotizar sola con el precio real
de siviajo.com, aprobarla o rechazarla, y pegar el ID cuando la guardás a mano. La regla directo/escala corre con
dos cotizaciones como máximo. "Crear idea" desde una alerta de Tendencias. Auditoría semanal de los paquetes
activos contra su perfil.

**Lo que falta para "listo"**: que valides 10 ideas contra Google Flights y siviajo.com (misma fecha, misma
decisión directo/escala, mismo hotel); desplegar vuelos-siviajo en el VPS para tener el calendario del mes (sin
él, el cotizador elige la fecha con sus 5 sondas); revisar el seed de perfiles destino por destino.


Reemplaza "abrir Google Flights, probar fechas, decidir directo o escala, cotizar a mano" (30–40 min
por paquete). Una idea nace con los usos y costumbres del destino (régimen obligatorio, noches,
categoría, umbral directo/escala por segmento), el sistema elige la fecha con el mapa de precios de
`vuelos-siviajo` (tarifas vendibles, número de vuelo, clase y asientos vía Sabre) y cotiza el paquete
completo con el precio real del cotizador. Habilita "Crear idea" desde una alerta de Tendencias.
**Necesita**: desplegar `vuelos-siviajo` en el VPS (hoy sólo Docker local); confirmar que el contrato
de Sabre admite el volumen (una idea ≈ 30 consultas de disponibilidad); decidir si queda una columna de
comparación con Google Flights (Flybondi no está en Sabre); validar el seed de perfiles destino por
destino; `COTIZADOR_API_KEY` en el VPS.

## Fase 4 — Criterio marketing vs web, temáticas · ⏳

Cada paquete importado llega con recomendación fundamentada (marketing / web / manual / excluido) y un
score con pesos editables; las temáticas se editan en HUB y viajan a TC.
**Necesita**: calibrar pesos con el dry-run sobre los 122 paquetes; por familia de destino: campaña,
conjunto plantilla, presupuesto y objetivos.

## Fase 5 — Lanzamiento en Meta desde HUB · ⏳

Al terminar diseño, HUB crea el conjunto con el nombre que el CRM ya lee (`FAMILIA_MMM_ID_SIV_<id>`),
sube creativos, genera copys y deja los anuncios en PAUSADO.
**Necesita**: IDs de campaña y de conjunto plantilla por familia.

## Fase 6 — Guardar idea por JSF, N salidas = N paquetes · ⏳

La de mayor riesgo técnico. Va con verificación por API de cada idea creada, ideas ocultas en modo
semi, canary diario y fallback a Playwright.
**Necesita**: HTML del botón "Guardar idea" y un HAR de una sesión creando una idea y recotizando;
usuario del bot en siviajo.com.

## Fase 7 — Cupos: tiradas, pedido a aéreos, carga del cupo · ⏳

Reemplaza el Excel "SALIDAS 2027" y los mails. Tiradas con disponibilidad y precio por clase de Sabre
(número de vuelo incluido) y precio de sistema del cotizador, pedido con
estado y fecha, aéreos carga precios en HUB, comparación, confirmación y alta del cupo con costo por
plaza. Mide cuánto tarda aéreos. Siempre con clic humano.
**Necesita**: usuario/rol de aéreos en HUB; canal `#aereos` en Slack.

## Fase 8 — Tablero paquete × CRM · ⏳

Filas = paquete; columnas = mensajes, perdidas, ganadas, eventos CAPI, gasto, costo por conversación,
CPA real. Filtros obligatorios de fecha y agente/equipo. Rollup nocturno de sólo lectura sobre el RDS
del CRM. Suma la señal de consultas de WhatsApp a Tendencias.
**Necesita**: credenciales read-only del RDS en el VPS (ya existen en local); confirmar "venta" =
oportunidad ganada y cómo se define "equipo".

## Fase 9 — Autopilot de anuncios · ⏳

Prender/apagar con reglas objetivas (gasto sin conversaciones, sin cotizaciones, CPA fuera de
objetivo, fatiga → pedido de diseño, escasez → "últimos lugares"), re-subir creatividades nuevas.
Arranca en sombra; nunca pausa el último anuncio activo de un paquete sin humano.
**Necesita**: objetivos por familia (costo por conversación, CPA).

## Fase 10 — Recotización con fecha alternativa · ⏳

Cuando el bot marca "cotización manual" por suba de precio, HUB busca una fecha en la misma temporada
con aéreo más barato, recotiza y propone. Aceptar aplica la fecha en siviajo.com.

## Fase 11 — Instagram: promocionar posts existentes · ⏳ (opcional)

Grilla de los últimos posts y "ponerle plata" desde HUB, en PAUSADO.
**Necesita**: verificar `instagram_basic` en el token y cuenta Business vinculada.

## Fase 12 — Catálogo de paquetes para Meta · ⏳

Feed con un ítem por paquete activo para retargeting dinámico; `content_ids` en el pixel vía GTM.
**Necesita**: `catalog_management` en el token de Meta; publicar la versión de GTM.

## Fase 13 — Competencia dentro de Tendencias · ⏳

Qué destinos, precios y ángulos empujan Despegar, Almundo, Avantrip y las mayoristas; cuánto hace que
corre cada anuncio. Google vía Transparency Center (oficial). Meta sólo con proveedor pago.
**Necesita**: lista definitiva de competidores con IDs de anunciante; decidir proveedor para Meta.

## Fase 14 — Search Console · ⏳

Sitemaps de paquetes y hoteles servidos desde HUB y enviados por API; inspección de URLs para confirmar
indexación y retiro de las bajas; auditoría de títulos; clics e impresiones por paquete y hotel.
La Service Account de HUB ya tiene acceso a la propiedad.

## Fase 15 — Cierre · ⏳

`docs/LOOP.md` con máquinas de estado y runbooks; borrado de tablas de media-os (con dump previo);
panel del loop en `/dashboard`; checklist mensual (token de Meta, presupuesto SerpAPI, credenciales).

---

## Dónde está cada cosa

- HUB en producción: `hub.siviajo.com`, VPS `148.230.72.17`, PM2 `hub`. Deploy: push a `main`.
- Tendencias: `/producto/tendencias`. Automatización (kill switches, jobs, presupuesto): `/automatizacion`.
- Operación del VPS y del runner: `docs/OPERACION-VPS.md`. Consultas al CRM: `docs/CRM-DB-READONLY.md`.
- Código del loop: `src/lib/jobs/` (kernel), `src/lib/tendencias/` (Fase 1), `src/lib/serpapi/`.
- Migraciones aplicadas: `20260910_automation_kernel`, `20260910_rls_media_os_tables`,
  `20260911_kernel_rpc_grants`, `20260912_trends`, `20260913_trends_sources`.
