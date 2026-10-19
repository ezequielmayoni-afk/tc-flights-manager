import json, sys, re, html as H
sys.path.insert(0,'.'); from tcadmin import *
PATH='/admin/themes/List.xhtml'; LIST='ThemeListForm:themesDataList'
def session():
    page,st,url=get(PATH); assert 'ThemeListForm' in page, 'sin sesión'
    return viewstate(page)
def filter_list(vs, text):
    fields={'javax.faces.partial.ajax':'true','javax.faces.source':LIST+':textFilter','javax.faces.partial.execute':LIST+':textFilter','javax.faces.partial.render':LIST,
            'javax.faces.behavior.event':'keyup','javax.faces.partial.event':'keyup', LIST+':textFilter':text,'javax.faces.ViewState':vs}
    t,st=post(PATH, fields); vs=viewstate(t) or vs
    frag=updates(t).get(LIST,'')
    rows=[]
    for tr in re.findall(r'<tr[^>]*data-ri="(\d+)"[^>]*>(.*?)</tr>', frag, re.S):
        ri, body = tr
        tds=[H.unescape(re.sub(r'<[^>]+>','',td)).strip() for td in re.findall(r'<td[^>]*>(.*?)</td>', body, re.S)]
        m=re.search(r'menuButton",\{id:"'+re.escape(LIST)+r':(\d+):menuButton"', body)
        rows.append({'ri':int(ri),'row':int(m.group(1)) if m else int(ri),'id':tds[1] if len(tds)>1 else '','creador':tds[2] if len(tds)>2 else '','codigo':tds[3] if len(tds)>3 else ''})
    return vs, rows
def open_edit(vs, row):
    src=f'{LIST}:{row}:j_id_bj'
    fields={'javax.faces.partial.ajax':'true','javax.faces.source':src,'javax.faces.partial.execute':src,'javax.faces.partial.render':'ThemeEditForm', src:src,'javax.faces.ViewState':vs}
    t,st=post(PATH, fields); vs=viewstate(t) or vs
    form=updates(t).get('ThemeEditForm','')
    # inputs
    vals={}
    for m in re.finditer(r'<input\s[^>]*>', form):
        tag=m.group(0); n=re.search(r'\bname="([^"]+)"', tag); v=re.search(r'\bvalue="([^"]*)"', tag); ty=re.search(r'\btype="([^"]+)"', tag)
        if not n: continue
        typ=(ty.group(1) if ty else 'text')
        if typ in ('checkbox','radio'):
            if 'checked' in tag: vals[n.group(1)]=H.unescape(v.group(1)) if v else 'on'
        else: vals[n.group(1)]=H.unescape(v.group(1)) if v else ''
    for m in re.finditer(r'<textarea\s[^>]*name="([^"]+)"[^>]*>(.*?)</textarea>', form, re.S): vals[m.group(1)]=H.unescape(m.group(2))
    for m in re.finditer(r'<select\s[^>]*name="([^"]+)"[^>]*>(.*?)</select>', form, re.S):
        sel=re.search(r'<option[^>]*selected[^>]*value="([^"]*)"', m.group(2)) or re.search(r'<option[^>]*value="([^"]*)"[^>]*selected', m.group(2))
        vals[m.group(1)]=H.unescape(sel.group(1)) if sel else ''
    return vs, form, vals
if __name__=='__main__':
    vs=session(); vs,rows=filter_list(vs,'Bayahibe'); print('rows:', rows)
    r=next(x for x in rows if x['id']=='9537')
    vs,form,vals=open_edit(vs, r['row'])
    print('form len', len(form), '| campos', len(vals))
    for k,v in vals.items():
        if re.search(r'code$|order$|descriptions:(0|35):|iconClass|destinationType', k): print(' ', k[-60:], '=', v[:100])
    open('form_bayahibe.html','w').write(form)

def save_theme(vs, vals, changes):
    """Reenvía el formulario completo con los cambios (dict name→value). Devuelve (vs, ok, growl)."""
    fields={}
    for k,v in vals.items():
        if k.startswith('ThemeEditForm'): fields[k]=v
    fields.update(changes)
    fields.update({'javax.faces.partial.ajax':'true','javax.faces.source':'ThemeEditForm:j_id_gw','javax.faces.partial.execute':'@all',
                   'javax.faces.partial.render':LIST,'ThemeEditForm:j_id_gw':'ThemeEditForm:j_id_gw','ThemeEditForm_SUBMIT':'1','javax.faces.ViewState':vs})
    t,st=post(PATH, fields); vs=viewstate(t) or vs
    growl=H.unescape(re.sub(r'<[^>]+>',' ',updates(t).get('ThemeListForm:growl',''))).strip()
    growl=re.sub(r'\s+',' ',growl)
    return vs, ('successfully' in t), growl[:200]

def set_lang_fields(changes, idx, titulo=None, seo_title=None, seo_meta=None, desc_html=None):
    p=f'ThemeEditForm:descriptions:{idx}:'
    if titulo is not None: changes[p+'descriptionLang']=titulo
    if seo_title is not None: changes[p+'seoTitleLang']=seo_title
    if seo_meta is not None: changes[p+'seoMetaDescriptionLang']=seo_meta
    if desc_html is not None: changes[p+'customDescription:textEditor_input']=desc_html
    return changes
