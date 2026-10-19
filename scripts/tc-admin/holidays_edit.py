"""Edición de paquetes (Paquetes vacacionales) del backoffice TC por HTTP."""
import sys,re,json,html as H,time
sys.path.insert(0,'.'); from tcadmin import *
PATH='/admin/holidays/List.xhtml'; F='HolidayPackagesListForm:idea-filters'; L='HolidayPackagesListForm:holidaysDataList'; S=F+':search'; E='HolidayPackageEditForm'
def session():
    page,st,url=get(PATH); assert 'HolidayPackagesListForm' in page,'sin sesión'; return viewstate(page)
def search(vs,text):
    f={'javax.faces.partial.ajax':'true','javax.faces.source':S,'javax.faces.partial.execute':'@all','javax.faces.partial.render':L+' HolidayPackagesListForm:messages',S:S,F+':searchText':text,'HolidayPackagesListForm_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(PATH,f); vs=viewstate(t) or vs; frag=updates(t).get(L,'')
    rows=[]
    for ri,body in re.findall(r'<tr[^>]*data-ri="(\d+)"[^>]*>(.*?)</tr>',frag,re.S):
        ideaid=re.search(r'/es/idea/(\d+)/',body); tds=re.findall(r'<td[^>]*>(.*?)</td>',body,re.S)
        src=re.search(r'PrimeFaces\.ab\(\{s:&quot;('+re.escape(L)+r':\d+:j_id_\w+)&quot;,f:&quot;HolidayPackagesListForm&quot;,u:&quot;'+E+'&quot;',body)
        rows.append({'ri':int(ri),'id':ideaid.group(1) if ideaid else None,'title':H.unescape(re.sub(r'<[^>]+>','',tds[10])).strip(),'src':src.group(1) if src else None})
    m=re.search(r'\((\d+) - (\d+) of (\d+)\)',frag); total=int(m.group(3)) if m else None
    first=len(rows)
    while total and first<total and first<400:
        f={'javax.faces.partial.ajax':'true','javax.faces.source':L,'javax.faces.partial.execute':L,'javax.faces.partial.render':L,L+'_pagination':'true',L+'_first':str(first),L+'_rows':'20',L+'_skipChildren':'true',L+'_encodeFeature':'true','HolidayPackagesListForm_SUBMIT':'1','javax.faces.ViewState':vs}
        t,st=post(PATH,f); vs=viewstate(t) or vs; frag=updates(t).get(L,'')
        more=[]
        for ri,body in re.findall(r'<tr[^>]*data-ri="(\d+)"[^>]*>(.*?)</tr>',frag,re.S):
            ideaid=re.search(r'/es/idea/(\d+)/',body); tds=re.findall(r'<td[^>]*>(.*?)</td>',body,re.S)
            src=re.search(r'PrimeFaces\.ab\(\{s:&quot;('+re.escape(L)+r':\d+:j_id_\w+)&quot;,f:&quot;HolidayPackagesListForm&quot;,u:&quot;'+E+'&quot;',body)
            more.append({'ri':int(ri),'id':ideaid.group(1) if ideaid else None,'title':H.unescape(re.sub(r'<[^>]+>','',tds[10])).strip(),'src':src.group(1) if src else None})
        if not more: break
        rows+=more; first+=len(more)
    return vs,rows,total
def parse_form(form):
    vals={}
    for m in re.finditer(r'<input\s[^>]*>', form):
        tag=m.group(0); n=re.search(r'\bname="([^"]+)"', tag); v=re.search(r'\bvalue="([^"]*)"', tag); ty=re.search(r'\btype="([^"]+)"', tag)
        if not n: continue
        typ=(ty.group(1) if ty else 'text')
        if typ in ('checkbox','radio'):
            if 'checked' in tag: vals.setdefault(n.group(1),[]).append(H.unescape(v.group(1)) if v else 'on')
        elif typ=='file': continue
        else: vals[n.group(1)]=H.unescape(v.group(1)) if v else ''
    for m in re.finditer(r'<textarea\s[^>]*name="([^"]+)"[^>]*>(.*?)</textarea>', form, re.S): vals[m.group(1)]=H.unescape(m.group(2))
    for m in re.finditer(r'<select\s[^>]*name="([^"]+)"[^>]*>(.*?)</select>', form, re.S):
        sel=re.findall(r'<option[^>]*selected[^>]*value="([^"]*)"', m.group(2)) or re.findall(r'<option[^>]*value="([^"]*)"[^>]*selected', m.group(2))
        vals[m.group(1)]=[H.unescape(x) for x in sel] if sel else ''
    return vals
def goto_page(vs,first):
    f={'javax.faces.partial.ajax':'true','javax.faces.source':L,'javax.faces.partial.execute':L,'javax.faces.partial.render':L,L+'_pagination':'true',L+'_first':str(first),L+'_rows':'20',L+'_skipChildren':'true',L+'_encodeFeature':'true','HolidayPackagesListForm_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(PATH,f); return viewstate(t) or vs
def open_edit(vs,src,ri=None):
    # El índice de fila se resuelve contra la página actual del listado en el servidor: antes de abrir,
    # ir a la página que contiene la fila (la búsqueda paginada deja al servidor en la última página).
    if ri is None: ri=int(src.split(':')[2])
    vs=goto_page(vs,(ri//20)*20)
    f={'javax.faces.partial.ajax':'true','javax.faces.source':src,'javax.faces.partial.execute':src,'javax.faces.partial.render':E,src:src,'HolidayPackagesListForm_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(PATH,f); vs=viewstate(t) or vs; form=updates(t).get(E,'')
    vals=parse_form(form)
    return vs,form,vals
def open_pkg(vs,pid,query,tries=4):
    """Busca y abre el paquete `pid` verificando que el formulario abierto sea el de la fila encontrada
    (el listado se reordena en vivo con los presupuestos de los vendedores). Devuelve (vs, found, form, vals) o (vs, None, '', {})."""
    for i in range(tries):
        vs,rows,total=search(vs,query); f=next((r for r in rows if r['id']==pid),None)
        if not f: return vs,None,'',{}
        vs,form,vals=open_edit(vs,f['src'])
        t=vals.get(E+':tabView:languages:0:title','')
        if t.strip()[:40]==f['title'].strip()[:40] and t.strip(): return vs,f,form,vals
        time.sleep(1.5)
    return vs,None,'',{}
def save(vs,vals,changes):
    fields={k:v for k,v in vals.items() if k.startswith(E)}
    fields.update(changes)
    src=E+':saveHolidayPackage'
    fields.update({'javax.faces.partial.ajax':'true','javax.faces.source':src,'javax.faces.partial.execute':'@all','javax.faces.partial.render':L+' HolidayPackagesListForm:messages '+E,src:src,E+'_SUBMIT':'1','javax.faces.ViewState':vs})
    t,st=post(PATH,fields); vs=viewstate(t) or vs
    msgs=re.findall(r'summary:"([^"]*)"',t)
    return vs,t,msgs
if __name__=='__main__':
    vs=session(); vs,rows,total=search(vs,sys.argv[1]); print(total,[(r['id'],r['title'][:50]) for r in rows])
    r=rows[0]; vs,form,vals=open_edit(vs,r['src']); print('campos',len(vals))
    for k in [E+':tabView:languages:0:title',E+':tabView:languages:0:title-head',E+':tabView:languages:0:meta-description',E+':tabView:mainThemes',E+':tabView:secondaryThemes',E+':tabView:visible_input',E+':tabView:Order']: print(' ',k.split('tabView:')[1],'=',vals.get(k))
    json.dump(vals,open(f'backup_pkg_{r["id"]}.json','w'),ensure_ascii=False)
