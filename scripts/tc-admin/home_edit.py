"""Home del CMS de TC por HTTP: SEO/H1 del slider y secciones."""
import sys,re,json,html as H,time
sys.path.insert(0,'.'); from tcadmin import *
PATH='/admin/cms/home-configuration/home-configuration.xhtml?landingPage=HOME'; F='j_id_8b'
def session():
    page,st,url=get(PATH); assert 'bannerSectionsTable' in page,'sin sesión'; return viewstate(page),page
def form_fields(frag,prefix):
    vals={}
    for m in re.finditer(r'<input\s[^>]*>',frag):
        tag=m.group(0); n=re.search(r'\bname="([^"]+)"',tag); v=re.search(r'\bvalue="([^"]*)"',tag); ty=re.search(r'\btype="([^"]+)"',tag)
        if not n or not n.group(1).startswith(prefix): continue
        typ=(ty.group(1) if ty else 'text')
        if typ in ('checkbox','radio'):
            if 'checked' in tag: vals.setdefault(n.group(1),[]).append(H.unescape(v.group(1)) if v else 'on')
        elif typ=='file': continue
        else: vals[n.group(1)]=H.unescape(v.group(1)) if v else ''
    for m in re.finditer(r'<textarea\s[^>]*name="([^"]+)"[^>]*>(.*?)</textarea>',frag,re.S):
        if m.group(1).startswith(prefix): vals[m.group(1)]=H.unescape(m.group(2))
    for m in re.finditer(r'<select\s[^>]*name="([^"]+)"[^>]*>(.*?)</select>',frag,re.S):
        if not m.group(1).startswith(prefix): continue
        sel=re.findall(r'<option[^>]*value="([^"]*)"[^>]*selected',m.group(2)) or re.findall(r'<option[^>]*selected[^>]*value="([^"]*)"',m.group(2))
        if sel: vals[m.group(1)]=[H.unescape(x) for x in sel]
    return vals
def post_form(vs,fields,src,execute,render,formid):
    f={k:v for k,v in fields.items()}
    f.update({'javax.faces.partial.ajax':'true','javax.faces.source':src,'javax.faces.partial.execute':execute,'javax.faces.partial.render':render,src:src,formid+'_SUBMIT':'1','javax.faces.ViewState':vs})
    t,st=post(PATH,f); return (viewstate(t) or vs),t
def save_title(vs,page,changes):
    vals=form_fields(page,F+':')
    vals={k:v for k,v in vals.items() if 'bannerSectionsTable' not in k and 'ImageSelector' not in k}
    vals.update(changes)
    vs,t=post_form(vs,vals,F+':tabs:btSaveTitle','@all',F+':tabs:tabTranslations '+F,F)
    return vs,t,re.findall(r'summary:"([^"]*)"',t)
if __name__=='__main__':
    vs,page=session(); vals=form_fields(page,F+':tabs:tabTranslations')
    json.dump(vals,open('backup_home_title.json','w'),ensure_ascii=False,indent=1); print({k.split(':')[-2]+':'+k.split(':')[-1]:v[:70] for k,v in vals.items() if isinstance(v,str)})
