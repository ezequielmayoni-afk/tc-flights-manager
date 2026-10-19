"""CMS > Temáticas del microsite por HTTP: agregar temática, listar."""
import sys,re,json,html as H
sys.path.insert(0,'.'); from tcadmin import *
PATH='/admin/cms/Themes.xhtml'; A='add-theme-form:add-theme-content:themes'; T='ThemeForm:themesMicrositeTable'
def session():
    page,st,url=get(PATH); assert 'ThemeForm' in page,'sin sesión'; return viewstate(page),page
def suggest(vs,q):
    f={'javax.faces.partial.ajax':'true','javax.faces.source':A,'javax.faces.partial.execute':A,'javax.faces.partial.render':A,'javax.faces.behavior.event':'query','javax.faces.partial.event':'query',A+'_query':q,A+'_input':q,A+'_hinput':'','add-theme-form_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(PATH,f); vs=viewstate(t) or vs
    return vs,re.findall(r'data-item-value="([^"]*)" data-item-label="([^"]*)"',updates(t).get(A,''))
def add_theme(vs,value,label,active=True):
    f={'javax.faces.partial.ajax':'true','javax.faces.source':A,'javax.faces.partial.execute':A,'javax.faces.partial.render':'add-theme-form:add-theme-content:theme-values','javax.faces.behavior.event':'itemSelect','javax.faces.partial.event':'itemSelect',A+'_input':label,A+'_hinput':value,'add-theme-form_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(PATH,f); vs=viewstate(t) or vs; tv=updates(t).get('add-theme-form:add-theme-content:theme-values','')
    S='add-theme-form:add-theme-content:btSave'
    f={'javax.faces.partial.ajax':'true','javax.faces.source':S,'javax.faces.partial.execute':'@all','javax.faces.partial.render':T+' ThemeForm:messages @(.ui-growl-pl)',S:S,A+'_input':label,A+'_hinput':value,'add-theme-form_SUBMIT':'1','javax.faces.ViewState':vs}
    if active: f['add-theme-form:add-theme-content:activeTheme_input']='on'
    t,st=post(PATH,f); vs=viewstate(t) or vs
    return vs,t,tv
def rows(frag):
    out=[]
    for ri,body in re.findall(r'<tr[^>]*data-ri="(\d+)"[^>]*>(.*?)</tr>',frag,re.S):
        tds=[H.unescape(re.sub(r'<script.*?</script>','',td,flags=re.S)) for td in re.findall(r'<td[^>]*>(.*?)</td>',body,re.S)]
        tds=[re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',x)).strip() for x in tds]
        out.append({'ri':int(ri),'tipo':tds[1],'activo':tds[2],'orden':tds[3],'tema':tds[4]})
    return out
if __name__=='__main__':
    vs,page=session(); vs,sug=suggest(vs,sys.argv[1]); print('sugerencias:',sug)
