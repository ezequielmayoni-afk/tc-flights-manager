"""Agrega una temática a paquetes por HTTP (formulario Paquetes vacacionales). Uso: python3 -I assign_theme.py THEME_ID pkgid,pkgid,... [texto-de-búsqueda]"""
import sys,re,json,time
sys.path.insert(0,'.'); from holidays_edit import *
pk={str(r['id']):r for r in json.load(open('../tc_packages.json'))}
PQ=json.load(open('pkg_queries.json')) if __import__('os').path.exists('pkg_queries.json') else {}
theme=sys.argv[1]; ids=sys.argv[2].split(','); Q=sys.argv[3] if len(sys.argv)>3 else None
vs=session(); ok_n=0
for pid in ids:
    title=(pk.get(pid) or {}).get('title') or ''
    found=None
    for pref in ([Q] if Q else [PQ.get(pid,''), title.split(' – ')[0].strip(), title.split(':')[0].strip(), title[:30].strip()]):
        if not pref: continue
        vs,found,form,vals=open_pkg(vs,pid,pref)
        if found: break
    if not found: print('MISS',pid,title[:50]); continue
    json.dump(vals,open(f'backup_pkg_{pid}.json','w'),ensure_ascii=False)
    main=re.search(r'name="'+E+r':tabView:mainThemes"[^>]*value="'+theme+'"',form); sec=re.search(r'name="'+E+r':tabView:secondaryThemes"[^>]*value="'+theme+'"',form)
    key=E+':tabView:mainThemes' if main else (E+':tabView:secondaryThemes' if sec else None)
    if not key: print('SIN CHECKBOX para',theme,'en',pid); break
    cur=list(vals.get(key) or [])
    if theme in cur: print(pid,'ya tenía',theme); continue
    vs,t,msgs=save(vs,vals,{key:cur+[theme]})
    vs,f2,form2,vals2=open_pkg(vs,pid,pref)
    if not f2: print(pid,'guardado pero no pude reabrir para verificar'); continue
    strip=lambda x: re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',str(x))).strip()
    diff=[k.split('tabView:')[-1] for k in set(vals)|set(vals2) if vals.get(k)!=vals2.get(k) and not (k.endswith('textEditor_input') and strip(vals.get(k))==strip(vals2.get(k)))]
    print(pid,found['title'][:45],'→',msgs,'| temas:',vals2.get(key),'| diff:',diff)
    ok_n+=('Successfully saved!' in msgs and diff==[key.split('tabView:')[-1]]); time.sleep(0.3)
print('ok',ok_n,'/',len(ids))
