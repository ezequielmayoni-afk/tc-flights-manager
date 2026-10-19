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
