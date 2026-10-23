"""Cambia el rango de fechas (availRange) de fichas de paquete en el backoffice de TC. dry|apply ids..."""
import sys, json, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import holidays_edit as H
E = 'HolidayPackageEditForm'
START, END = '15/03/2027', '30/06/2027'
mode, ids = sys.argv[1], sys.argv[2:]
out = []
for pid in ids:
    vs = H.session(); vs, found, form, vals = H.open_pkg(vs, pid, pid)
    if not found: out.append({'id': pid, 'error': 'no se pudo abrir'}); print(json.dumps(out[-1])); continue
    cur = {'start': vals.get(E + ':tabView:startDate_input'), 'end': vals.get(E + ':tabView:endDate_input')}
    r = {'id': pid, 'titulo': found['title'][:70], 'antes': cur, 'despues': {'start': START, 'end': END}}
    if mode == 'apply' and cur != r['despues']:
        json.dump(vals, open(f'/root/tc-admin/backup_range_{pid}.json', 'w'), ensure_ascii=False)
        vs, t, msgs = H.save(vs, vals, {E + ':tabView:startDate_input': START, E + ':tabView:endDate_input': END})
        r['guardado'] = msgs
        time.sleep(1); vs = H.session(); vs, f2, form2, v2 = H.open_pkg(vs, pid, pid)
        r['verificado'] = {'start': v2.get(E + ':tabView:startDate_input'), 'end': v2.get(E + ':tabView:endDate_input')} if f2 else 'no reabrió'
    out.append(r); print(json.dumps(r, ensure_ascii=False))
json.dump(out, open(f'/root/tc-admin/set_range_{mode}.json', 'w'), ensure_ascii=False, indent=1)
