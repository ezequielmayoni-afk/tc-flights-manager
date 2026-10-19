"""Menú de navegación (CMS) por HTTP: leer y corregir links de submenús."""
import sys,re,json,html as H,time
sys.path.insert(0,'.'); from tcadmin import *
PATH='/admin/cms/navigation-menu.xhtml'
def session():
    page,st,url=get(PATH); assert 'NavigationMenuForm' in page,'sin sesión'; return viewstate(page),page
def open_parent(vs,row):
    src=f'NavigationMenuForm:navigationMenu:{row}:editSubmenuButton'
    f={'javax.faces.partial.ajax':'true','javax.faces.source':src,'javax.faces.partial.execute':src,'javax.faces.partial.render':'menuForm submenuForm',src:src,'NavigationMenuForm_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(PATH,f); vs=viewstate(t) or vs; u=updates(t)
    rows=[]
    for ri,body in re.findall(r'<tr[^>]*data-ri="(\d+)"[^>]*>(.*?)</tr>',u.get('submenuForm',''),re.S):
        tds=[re.sub(r'\s+',' ',H.unescape(re.sub(r'<[^>]+>',' ',re.sub(r'<script.*?</script>','',td,flags=re.S)))).strip() for td in re.findall(r'<td[^>]*>(.*?)</td>',body,re.S)]
        rows.append({'ri':int(ri),'orden':tds[1],'name':tds[2],'url':tds[3]})
    return vs,rows,u
def inputs(frag,prefix):
    return {n:H.unescape(v) for n,v in re.findall(r'<input[^>]*name="('+prefix+r'[^"]+)"[^>]*value="([^"]*)"',frag) if 'SUBMIT' not in n and 'ViewState' not in n}
def edit_sub(vs,ri):
    src=f'submenuForm:navigationSubMenu:{ri}:editSubmenu'
    f={'javax.faces.partial.ajax':'true','javax.faces.source':src,'javax.faces.partial.execute':src,'javax.faces.partial.render':'submenuForm',src:src,'submenuForm_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(PATH,f); vs=viewstate(t) or vs; sf=updates(t).get('submenuForm','')
    return vs,inputs(sf,'submenuForm:')
def save_sub(vs,vals,changes):
    f=dict(vals); f.update(changes)
    src='submenuForm:saveSubmenu'
    f.update({'javax.faces.partial.ajax':'true','javax.faces.source':src,'javax.faces.partial.execute':'@all','javax.faces.partial.render':'submenuForm NavigationMenuForm:messages',src:src,'submenuForm_SUBMIT':'1','javax.faces.ViewState':vs})
    t,st=post(PATH,f); vs=viewstate(t) or vs
    return vs,re.findall(r'summary:"([^"]*)"',t),t
def set_sub_url(vs,parent_row,name,url,new_name=None):
    vs,rows,u=open_parent(vs,parent_row); r=next((x for x in rows if x['name']==name),None)
    if not r: return vs,False,'no está '+name
    vs,vals=edit_sub(vs,r['ri'])
    ch={'submenuForm:urlLanguages:0:url':url,'submenuForm:urlLanguages:1:url':url}
    if new_name: ch['submenuForm:urlLanguages:0:name']=new_name; ch['submenuForm:urlLanguages:1:name']=new_name
    vs,msgs,t=save_sub(vs,vals,ch)
    vs,rows,u=open_parent(vs,parent_row); r2=next((x for x in rows if x['name']==(new_name or name)),None)
    return vs,(r2 is not None and r2['url']==url),f"{msgs} → {r2['url'] if r2 else None}"
if __name__=='__main__':
    vs,page=session()
    print('new-menu links:',[(a,re.sub(r'<[^>]+>','',b).strip()) for a,b in re.findall(r'<a[^>]*id="(NavigationMenuForm:[^"]+)"[^>]*>(.*?)</a>',page,re.S) if 'navigationMenu:' not in a][:10])
    print('buttons:',[(m[0],re.sub(r'<[^>]+>','',m[1]).strip()) for m in re.findall(r'<button[^>]*id="(NavigationMenuForm:[^"]+)"[^>]*>(.*?)</button>',page,re.S) if 'navigationMenu:' not in m[0]])
    # piloto: Aruba → URL plana
    vs,ok,msg=set_sub_url(vs,9,'Aruba','https://www.siviajo.com/es/12462/aruba/moreideas'); print('Aruba:',ok,msg)
