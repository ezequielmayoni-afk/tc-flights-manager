"""Cambia meta título y/o meta descripción de un paquete en el backoffice (Paquetes vacacionales).

Uso: python3 -I set_pkg_meta.py <tc_id> "<texto para buscar la ficha>" [--title-head "..."] [--meta-description "..."]

Abre la ficha verificando el título (el listado se reordena en vivo), guarda backup, reenvía el
formulario completo con los cambios y reabre para comprobar que sólo cambiaron esos campos.
"""
import sys, re, json, argparse
sys.path.insert(0, __import__('os').path.dirname(__file__))
from holidays_edit import *  # noqa: E402,F403

ap = argparse.ArgumentParser()
ap.add_argument('tc_id'); ap.add_argument('query')
ap.add_argument('--title-head'); ap.add_argument('--meta-description')
a = ap.parse_args()
P = E + ':tabView:languages:0:'
ch = {}
if a.title_head: ch[P + 'title-head'] = a.title_head
if a.meta_description: ch[P + 'meta-description'] = a.meta_description
if not ch: sys.exit('nada que cambiar')
strip = lambda x: re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', str(x))).strip()
vs = session()
vs, f, form, vals = open_pkg(vs, a.tc_id, a.query)
if not f: sys.exit(f'no encontré la ficha {a.tc_id} buscando "{a.query}"')
json.dump(vals, open(f'backup_pkg_{a.tc_id}_meta.json', 'w'), ensure_ascii=False)
vs, t, msgs = save(vs, vals, ch)
vs, f2, form2, vals2 = open_pkg(vs, a.tc_id, a.query)
diff = [k.split('tabView:')[-1] for k in set(vals) | set(vals2) if vals.get(k) != vals2.get(k) and not (k.endswith('textEditor_input') and strip(vals.get(k)) == strip(vals2.get(k)))]
print(a.tc_id, f['title'][:50], '→', msgs, '| cambiaron:', diff)
for k in ch: print('  ', k.split(':')[-1], '=', vals2.get(k))
