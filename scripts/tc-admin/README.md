# tc-admin — backoffice de Travel Compositor por HTTP

Replica los requests JSF/PrimeFaces del backoffice (`https://www.siviajo.com/admin/...`) sin navegador,
siguiendo el mismo criterio que `~/CRM/cotizador-bot/search/jsf_client.py`. Python 3 sin dependencias.

## Sesión

Necesita la sesión exportada del navegador logueado (login web de HUBSIVIAJO con OTP por mail) en
`~/hub/.playwright-mcp/siviajo-admin-state.json` (git-ignored; `chmod 600`). Expira a los ~23 min sin uso.
`tcadmin.py` arma la cookie, hace `get`/`post` (`Faces-Request: partial/ajax`), extrae el `ViewState`
y los `<update>` de la respuesta parcial.

## Módulos

| Archivo | Página | Qué hace |
|---|---|---|
| `themes_edit.py` | `/admin/themes/List.xhtml` | filtrar, abrir "Editar", guardar; campos por idioma (0 = inglés, 35 = español): nombre, descripción (≤ 300), title y meta SEO |
| `themes_create.py` | ídem | "Crear" + imagen (por URL o archivo multipart + recorte 3:1, mín. 1440×480) |
| `cms_themes.py`, `cms_add_batch.py` | `/admin/cms/Themes.xhtml` | agregar una temática al microsite (si no está, la página pública da 404) |
| `holidays_edit.py` | `/admin/holidays/List.xhtml` ("Paquetes vacacionales") | buscar (con paginación), abrir editor, guardar: meta título, meta descripción, alt, temáticas, visible… |
| `assign_theme.py`, `assign_batch.py` | ídem | agregar una temática a N paquetes y verificar campo por campo que nada más cambió |
| `apply_pkg_meta.py` | ídem | aplica `meta_title_propuesto` / `meta_description_propuesta` / `image_alt_propuesto` del CSV de títulos |
| `apply_themes.py`, `create_batch.py`, `themes_batch.json` | temáticas | lotes del 2026-10-19 (sirven de ejemplo) |
| `hl_list.py` | `/admin/hotel-landing/List.xhtml` | lista todos los hoteles de un destino (`hl_<código>.json`) para `scripts/seo-hotel-sitemap.ts hotels --admin=<carpeta>` |

## Reglas

- Siempre reenviar el formulario completo (`execute=@all`) con los valores leídos + los cambios, y
  después reabrir y comparar: TC normaliza el HTML de Quill (`<ol data-list>` → `<ul>`) sin cambiar el texto.
- Las acciones de fila usan el índice de la fila del listado en el servidor: **no correr dos procesos
  sobre la misma página al mismo tiempo** (sí sobre páginas distintas).
- Las 16 temáticas "General" (Caribe, Brasil, Europe, Punta Cana, Cancún, Río, Búzios, Disney…) no se
  pueden editar: se reemplazan por temáticas propias.
- Guardar siempre un backup (`backup_theme_<id>.json`, `backup_pkg_<id>.json`) antes de escribir.

## apply_calendar.py — calendario de una ficha = fechas de cupo
`python3 apply_calendar.py dry|apply targets.json` con `{"<idFicha>": ["2027-01-18","2027-02-02",...]}`.
Deja la ficha ofreciendo exactamente esas fechas: rango = min..max, días de operación = los días de semana de
esas fechas, y stop sales en los huecos (acotados a días de operación: TC rechaza un stop sale cuyo inicio o
fin no sea día de operación, y rechaza solapamientos). Orden: borra los stop sales actuales
(`tableStopSalesDate:{i}:removeStopSale`), guarda días + rango, reabre, agrega stop sales
(`stopSalesSettings:stopSales` con `startDateStopSale_input`/`endDateStopSale_input`, execute/render
`stop_sales_panel`), guarda. `dry` sólo imprime actual vs objetivo. Verificar después con la API
(`dateSettings`): fechas ofrecidas = rango ∩ días − stop sales. Usado el 2026-10-22 en 12 fichas.

## login_http.py — sesión nueva sin navegador (2026-10-23)
`TC_USERNAME`/`TC_PASSWORD` en el entorno; correr en el VPS (`/root/tc-admin`, con `tcadmin.py` apuntando
`STATE='/root/tc-admin/state.json'`): hace login, pide el código por mail (EMAIL), espera `otp.txt` hasta 30 min,
manda cada dígito (`marcadorCodigo:{i}:d`, evento `change`) y reenvía `login:signin`; guarda las cookies en `state.json`.
Por HTTP no hay contador de página: con Playwright la pantalla de login muestra "La sesión expiró" a los pocos minutos
y el código llega tarde. El formulario ignora Enter. No volcar la página de login: trae la contraseña en el campo.

## set_range.py — rango de fechas de fichas
`python3 set_range.py dry|apply <ids...>` cambia `startDate`/`endDate` del editor (rango de la ficha) con backup
`backup_range_<id>.json` y verificación al reabrir. La API REST de TC no permite cambiar fechas (el PUT de paquete
sólo acepta título, descripciones, temáticas, visible y orden). El viaje base (vuelos y hotel) no cambia: hay que
recotizar en TC para moverlo dentro del rango nuevo. Usado el 2026-10-23 en 7 fichas "Temporada baja 2026" → 15/03–30/06/2027.
