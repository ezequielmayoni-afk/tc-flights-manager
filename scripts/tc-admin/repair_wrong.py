import sys,re,json,time; sys.path.insert(0,'.'); from holidays_edit import *
P=E+':tabView:languages:0:title'
def strip(x): return re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',str(x))).strip()
vs=session()
for title,theme in [('Su viaje a Punta Cana y Bayahíbe sergio','22683'),('Armação de Búzios, Brazil','22692')]:
    vs,rows,total=search(vs,title); cands=[r for r in rows if r['title'].strip()[:35]==title[:35]]
    print('==',title,'→',total,'filas; candidatos:',[(r['id'],r['title'][:45]) for r in cands])
    for c in cands:
        vs,f,form,vals=open_pkg(vs,c['id'],title)
        if not f: print('  no pude abrir',c['id']); continue
        sec=list(vals.get(E+':tabView:secondaryThemes') or []); main=list(vals.get(E+':tabView:mainThemes') or [])
        print('  ',c['id'],'sec:',sec,'main:',main)
        if theme in sec or theme in main:
            json.dump(vals,open(f'backup_pkg_{c["id"]}_wrong.json','w'),ensure_ascii=False)
            ch={}
            if theme in sec: ch[E+':tabView:secondaryThemes']=[x for x in sec if x!=theme]
            if theme in main: ch[E+':tabView:mainThemes']=[x for x in main if x!=theme]
            # si la lista queda vacía hay que no enviar el campo (checkbox sin marcar)
            vals2={k:v for k,v in vals.items()}
            for k,v in ch.items():
                if v: vals2[k]=v
                else: vals2.pop(k,None)
            vs,t,msgs=save(vs,vals2,{}); print('   quitado',theme,'→',msgs)
            vs,f3,form3,vals3=open_pkg(vs,c['id'],title); print('   ahora sec:',vals3.get(E+':tabView:secondaryThemes'),'main:',vals3.get(E+':tabView:mainThemes'))
