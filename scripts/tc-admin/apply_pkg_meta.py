import sys,re,json,csv,time
sys.path.insert(0,'.'); from holidays_edit import *
rows=list(csv.DictReader(open('/Users/ezequielmayoni/hub/docs/seo/titulos-propuestos-2026-10-17.csv',encoding='utf-8')))
P=E+':tabView:languages:0:'
vs=session(); done=[]; miss=[]; bad=[]
for r in rows:
    pid=r['tc_id']
    if pid in ('38203321','38742558'): continue
    found=None
    for pref in [r['title_propuesto'].split(' – ')[0], r['title_propuesto'].split(':')[0], r['title_actual'][:40]]:
        vs,lst,total=search(vs,pref.strip()); found=next((x for x in lst if x['id']==pid),None)
        if found: break
    if not found: miss.append((pid,r['title_propuesto'][:50])); print('MISS',pid,r['title_propuesto'][:50]); continue
    vs,form,vals=open_edit(vs,found['src']); json.dump(vals,open(f'backup_pkg_{pid}.json','w'),ensure_ascii=False)
    ch={P+'title-head':r['meta_title_propuesto'],P+'meta-description':r['meta_description_propuesta'],E+':tabView:imageDescription':r['image_alt_propuesto']}
    vs,t,msgs=save(vs,vals,ch)
    ok='Successfully saved!' in msgs
    vs,lst,total=search(vs,pref.strip()); f2=next((x for x in lst if x['id']==pid),None)
    vs,form2,vals2=open_edit(vs,f2['src']) if f2 else (vs,'',{})
    diff=sorted(k.split('tabView:')[-1] for k in set(vals)|set(vals2) if vals.get(k)!=vals2.get(k))
    strip=lambda x: re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',str(x))).strip()
    extra=[d for d in diff if d not in ('languages:0:title-head','languages:0:meta-description','imageDescription') and not (d.endswith('textEditor_input') and strip(vals.get(E+':tabView:'+d))==strip(vals2.get(E+':tabView:'+d)))]
    print(pid, found['title'][:45], '→', 'OK' if ok else msgs, '| diff:', diff if extra else 'esperado')
    if extra: bad.append((pid,extra)); break
    done.append(pid); time.sleep(0.3)
print('hechos',len(done),'| no encontrados',len(miss),miss,'| raros',bad)
