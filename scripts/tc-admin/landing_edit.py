"""Landings personalizadas del CMS de TC por HTTP (landing-manager): título/H1/meta por idioma, imagen y secciones.
Mismo esquema que home_edit.py pero con el form LandingEditForm y la URL landing.xhtml?landingPage=CUSTOM&landingId=…"""
import sys,re,json,html as H,time,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); from tcadmin import *
from home_edit import form_fields
F='LandingEditForm'
def path(lid): return f'/admin/cms/landing-manager/landing.xhtml?landingPage=CUSTOM&landingId={lid}&micrositeId=siviajo'
def open_landing(lid):
    page,st,url=get(path(lid)); assert F in page,'sin sesión o landing inexistente'; return viewstate(page),page
def post_form(lid,vs,fields,src,execute,render,formid=F):
    f=dict(fields); f.update({'javax.faces.partial.ajax':'true','javax.faces.source':src,'javax.faces.partial.execute':execute,'javax.faces.partial.render':render,src:src,formid+'_SUBMIT':'1','javax.faces.ViewState':vs})
    t,st=post(path(lid),f); return (viewstate(t) or vs),t
def title_vals(page):
    vals=form_fields(page,F+':')
    return {k:v for k,v in vals.items() if 'bannerSectionsTable' not in k and 'customHeaderImages' not in k and 'ImageSelector' not in k and 'SearchBox' not in k.lower()}
def save_title(lid,vs,page,changes):
    vals=title_vals(page); vals.update(changes)
    vs,t=post_form(lid,vs,vals,F+':tabs:btSaveTitle','@all',F+':tabs:tabTranslations '+F)
    return vs,t,re.findall(r'summary:"([^"]*)"',t)
def ajax(lid,vs,src,execute,render,fields=None,formid=F,event=None,extra=None):
    f=dict(fields or {})
    f.update({'javax.faces.partial.ajax':'true','javax.faces.source':src,'javax.faces.partial.execute':execute,'javax.faces.partial.render':render,formid+'_SUBMIT':'1','javax.faces.ViewState':vs})
    if event: f.update({'javax.faces.behavior.event':event,'javax.faces.partial.event':event})
    else: f[src]=src
    if extra: f.update(extra)
    t,st=post(path(lid),f); return (viewstate(t) or vs),t
def msgs(t): return re.findall(r'summary:"([^"]*)"',t)
def set_header_image(lid,vs,page,url,coords):
    """Imagen principal por URL + recorte (x_y_w_h en píxeles) + guardar."""
    C=F+':tabs:customHeaderImages'; K=C+':0:custom-image-cropper'
    vs,t=ajax(lid,vs,C+':j_id_fk',C+':j_id_fk',C)
    vs,t=ajax(lid,vs,K+':upload-url',K+':image-inputs',K+':cropper '+K+':errorMessages '+K+':buttons '+K+':image-crop-modal',{K+':url':url})
    err=re.sub(r'<[^>]+>',' ',updates(t).get(K+':errorMessages','')).strip()
    vs,t2=ajax(lid,vs,K+':save',K+':the-cropper_coords @(.image-crop-preview) @(.alt)','@(.image-crop-preview) '+K+':errorMessages',{K+':the-cropper_coords':coords,K+':showCropper_hidden':'true',K+':url':url},extra={'crop-clientId':K})
    vf=re.search(r'validationFailed[^,}]*',t2); err2=re.sub(r'<[^>]+>',' ',updates(t2).get(K+':errorMessages','')).strip()
    vs,t3=ajax(lid,vs,K+':actionsOnCorrectUploadImage',K+':actionsOnCorrectUploadImage','@none')
    vals=title_vals(page); vals.update({K+':the-cropper_coords':coords,K+':showCropper_hidden':'true',K+':url':url})
    vs,t4=ajax(lid,vs,C+':btSaveImages','@all',C,vals)
    return vs,{'upload_err':err[:200],'save_err':err2[:200],'save_msgs':msgs(t4),'vf':vf.group(0) if vf else None,'frag':updates(t4).get(C,'')}
def add_seo_section(lid,vs,name,title,subtitle,html_body,lang_idx=1,image=None,coords=None,also_idx0=False):
    E='editSectionBannersForm'; T=f'{E}:tabSectionLanguages'
    vs,t=ajax(lid,vs,F+':tabs:bannerSectionsTable:addHomeSection',F+':tabs:bannerSectionsTable:addHomeSection','@all')
    fr=re.search(r'<form[^>]*id="'+E+r'".*?</form>',' '.join(updates(t).values()),re.S).group(0)
    vals=form_fields(fr,E); vals[E+':sectionType']='SEO_CONTENT'
    vs,t=ajax(lid,vs,E+':sectionType',E+':sectionType',E+':sectionConfig '+E+':sectionContent '+E+':preview-panel '+E+':confirmSection @(.section-btSave) @(.dev-tabView)',vals,formid=E,event='change')
    out={'change_msgs':msgs(t)}
    if image:
        for idx in ([lang_idx]+([0] if also_idx0 else [])):
            K=f'{T}:{idx}:imageBanner'
            vs,tu=ajax(lid,vs,K+':upload-url',K+':image-inputs',K+':cropper '+K+':errorMessages '+K+':buttons',{K+':url':image},formid=E)
            vs,tc=ajax(lid,vs,K+':save',K+':the-cropper_coords @(.image-crop-preview) @(.alt)','@(.image-crop-preview) '+K+':errorMessages',{K+':the-cropper_coords':coords,K+':showCropper_hidden':'true',K+':url':image},formid=E,extra={'crop-clientId':K})
            out[f'img{idx}_err']=re.sub(r'<[^>]+>',' ',updates(tc).get(K+':errorMessages','')).strip()[:200]
    fields={E+':sectionName':name,E+':sectionType':'SEO_CONTENT',E+':device':'ALL',E+':publicationStartDate_input':'',E+':publicationEndDate_input':'',f'{T}_activeIndex':str(lang_idx)}
    for idx in ([lang_idx]+([0] if also_idx0 else [])):
        fields.update({f'{T}:{idx}:homeBannerSectionTitle':title,f'{T}:{idx}:bannerSubtitle':subtitle,f'{T}:{idx}:seoBannerDescription:textEditor_input':html_body})
        if image: fields.update({f'{T}:{idx}:imageBanner:url':image,f'{T}:{idx}:imageBanner:the-cropper_coords':coords,f'{T}:{idx}:imageBanner:showCropper_hidden':'true'})
    vs,t=ajax(lid,vs,E+':btSave',E,'@(.sectionsTable) '+E,fields,formid=E)
    out['save_msgs']=msgs(t); out['vf']=(re.search(r'validationFailed[^,}]*',t) or [None]) and (re.search(r'validationFailed[^,}]*',t).group(0) if re.search(r'validationFailed[^,}]*',t) else None)
    tb=updates(t); out['tabla']=re.sub(r'\s+',' ',H.unescape(re.sub(r'<[^>]+>',' ',' '.join(v for k,v in tb.items() if 'bannerSectionsTable' in k))))[:300]
    vs,t2=ajax(lid,vs,F+':tabs:bannerSectionsTable:btSaveNewHome',F+':tabs:bannerSectionsTable:btSaveNewHome','@none')
    out['persist_msgs']=msgs(t2); out['persist_len']=len(t2)
    return vs,out

# ---------- pipeline completo (verificado 2026-10-23 con la landing 20370 Punta Cana) ----------
LM='/admin/cms/landing-manager/landing-manager.xhtml'
def create_landing():
    """Añadir landing → Landing personalizada. Devuelve el landingId nuevo (lo da el redirect)."""
    page,st,url=get(LM); vs=viewstate(page)
    f={'javax.faces.partial.ajax':'true','javax.faces.source':'LandingManagerForm:btnAddLanding','javax.faces.partial.execute':'@all','javax.faces.partial.render':'add-landing-form','LandingManagerForm:btnAddLanding':'LandingManagerForm:btnAddLanding','LandingManagerForm:admin-filters:microsite-filter_input':'siviajo','LandingManagerForm_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(LM,f); vs=viewstate(t) or vs
    f={'javax.faces.partial.ajax':'true','javax.faces.source':'add-landing-form:add-landing-content:landingType','javax.faces.partial.execute':'add-landing-form:add-landing-content:landingType','javax.faces.partial.render':'add-landing-form:add-landing-content:saveLandingPanel','javax.faces.behavior.event':'change','javax.faces.partial.event':'change','add-landing-form:add-landing-content:landingType':'CUSTOM','add-landing-form_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(LM,f); vs=viewstate(t) or vs
    f={'javax.faces.partial.ajax':'true','javax.faces.source':'add-landing-form:add-landing-content:btSave','javax.faces.partial.execute':'add-landing-form','javax.faces.partial.render':'add-landing-form','add-landing-form:add-landing-content:btSave':'add-landing-form:add-landing-content:btSave','add-landing-form:add-landing-content:landingType':'CUSTOM','add-landing-form_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(LM,f)
    m=re.search(r'landingId=(\d+)',t); return int(m.group(1)) if m else None
def set_titles(lid,fields,langs=(1,)):
    """fields: urlTitle, sliderTitle, sliderDescription, keywords, meta-title, meta-description, imageDescription.
    El slug (url) lo genera TC con el evento blur de urlTitle; 1 = Spanish, 0 = English."""
    vs,page=open_landing(lid)
    for idx in langs:
        k=f'{F}:tabs:tabTranslations:{idx}:urlTitle'
        vs,t=ajax(lid,vs,k,k,f'{F}:tabs:tabTranslations:{idx}:url',{k:fields['urlTitle']},event='blur')
    changes={}
    for idx in langs:
        for k,v in fields.items(): changes[f'{F}:tabs:tabTranslations:{idx}:{k}']=v
    changes[f'{F}:tabs:tabTranslations_activeIndex']=str(langs[0])
    vs,t,m=save_title(lid,vs,page,changes)
    vs,page=open_landing(lid); after=form_fields(page,F+':tabs:tabTranslations')
    return m,{k.split(':')[-1]:after.get(f'{F}:tabs:tabTranslations:{langs[0]}:{k.split(":")[-1]}') for k in ['urlTitle','url','sliderTitle','meta-title']}
def section_rows(page):
    T=F+':tabs:bannerSectionsTable'; tb=re.search(r'id="'+T+r'_data".*?</tbody>',page,re.S)
    if not tb: return []
    out=[]
    for ri,tr in re.findall(r'<tr[^>]*data-ri="(\d+)"[^>]*>(.*?)</tr>',tb.group(0),re.S):
        cells=[re.sub(r'\s+',' ',H.unescape(re.sub(r'<[^>]+>',' ',re.sub(r'<script.*?</script>','',c,flags=re.S)))).strip() for c in re.findall(r'<td[^>]*>(.*?)</td>',tr,re.S)]
        act='ui-icon-check' in tr[tr.find('toggleSectionActive"'):tr.find('toggleSectionActive"')+900]
        out.append({'ri':ri,'name':cells[2] if len(cells)>2 else '','type':cells[3] if len(cells)>3 else '','active':act})
    return out
def _dialog(t):
    E='editSectionBannersForm'; return re.search(r'<form[^>]*id="'+E+r'".*?</form>',' '.join(updates(t).values()),re.S).group(0)
def put_sections(lid,sections,image_first=None,coords=None):
    """sections: [{name,title,subtitle,html}] (html < 4.096 chars c/u). Edita las filas existentes en orden y agrega las que falten.
    Español = tabSectionLanguages:0. Persiste con btSaveNewHome."""
    T=F+':tabs:bannerSectionsTable'; E='editSectionBannersForm'; TL=E+':tabSectionLanguages'
    vs,page=open_landing(lid); rows=section_rows(page); log=[]
    for i,s in enumerate(sections):
        assert len(s['html'])<4096, f"sección {s['name']} supera 4.096 chars ({len(s['html'])})"
        if i<len(rows):
            vs,t=ajax(lid,vs,f'{T}:{i}:editSection',f'{T}:{i}:editSection','@all'); base=form_fields(_dialog(t),E)
        else:
            vs,t=ajax(lid,vs,T+':addHomeSection',T+':addHomeSection','@all'); base=form_fields(_dialog(t),E); base[E+':sectionType']='SEO_CONTENT'
            vs,t=ajax(lid,vs,E+':sectionType',E+':sectionType',E+':sectionConfig '+E+':sectionContent '+E+':preview-panel '+E+':confirmSection',base,formid=E,event='change')
        if i==0 and image_first:
            K=f'{TL}:0:imageBanner'
            vs,tu=ajax(lid,vs,K+':upload-url',K+':image-inputs',K+':cropper '+K+':errorMessages '+K+':buttons',{K+':url':image_first},formid=E)
            vs,tc=ajax(lid,vs,K+':save',K+':the-cropper_coords @(.image-crop-preview) @(.alt)','@(.image-crop-preview) '+K+':errorMessages',{K+':the-cropper_coords':coords,K+':showCropper_hidden':'true',K+':url':image_first},formid=E,extra={'crop-clientId':K})
        vals=dict(base); vals.update({E+':sectionName':s['name'],E+':sectionType':'SEO_CONTENT',E+':device':'ALL',TL+'_activeIndex':'0',TL+':0:homeBannerSectionTitle':s['title'],TL+':0:bannerSubtitle':s['subtitle'],TL+':0:seoBannerDescription:textEditor_input':s['html']})
        vs,t=ajax(lid,vs,E+':btSave',E,E+' '+T,vals,formid=E); log.append((s['name'],msgs(t)[:1]))
    vs,t=ajax(lid,vs,T+':btSaveNewHome',T+':btSaveNewHome','@none'); log.append(('persist',msgs(t)))
    return log
def public_check(lid,slug,tries=6):
    """Muestra qué backends ya sirven las secciones (la página pública se cachea por servidor)."""
    import urllib.request
    out=[]
    for i in range(tries):
        r=urllib.request.Request(f'https://www.siviajo.com/es/landing/{lid}/{slug}',headers={'User-Agent':UA})
        with urllib.request.urlopen(r,timeout=60) as resp: body=resp.read().decode('utf-8','ignore'); be=re.search(r'backend=([^;]+)',resp.headers.get('Set-Cookie','') or '')
        out.append((be.group(1) if be else '?',body.count('c-seo-banner__main-info-title'),len(re.sub(r'<[^>]+>',' ',body).split())))
    return out

def post_multipart(p, fields, filefield, filepath):
    import uuid, mimetypes, urllib.request
    boundary='----WebKitFormBoundary'+uuid.uuid4().hex[:16]; body=b''
    for k,v in fields.items():
        if isinstance(v,list): v=v[0] if v else ''
        body+=f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    fn=filepath.split('/')[-1]; ct=mimetypes.guess_type(fn)[0] or 'application/octet-stream'
    body+=f'--{boundary}\r\nContent-Disposition: form-data; name="{filefield}"; filename="{fn}"\r\nContent-Type: {ct}\r\n\r\n'.encode()+open(filepath,'rb').read()+f'\r\n--{boundary}--\r\n'.encode()
    h={'User-Agent':UA,'Cookie':COOKIE,'Content-Type':f'multipart/form-data; boundary={boundary}','Accept':'application/xml, text/xml, */*; q=0.01','X-Requested-With':'XMLHttpRequest','Faces-Request':'partial/ajax','Referer':BASE+p}
    r=urllib.request.Request(BASE+p, data=body, headers=h, method='POST')
    with urllib.request.urlopen(r, timeout=180) as resp: return resp.read().decode('utf-8','ignore'), resp.status
def header_rows(page):
    C=F+':tabs:customHeaderImages'; tb=re.search(r'id="'+C+r'_data".*?</tbody>',page,re.S)
    return re.findall(r'data-ri="(\d+)"',tb.group(0)) if tb else []
def set_header_image_file(lid,vs,page,filepath,coords,remove_existing=True):
    """Imagen principal subiendo un archivo (≥1920 px de ancho): quita las filas existentes, agrega fila, sube archivo, recorta, guarda."""
    C=F+':tabs:customHeaderImages'; K=C+':0:custom-image-cropper'
    if remove_existing:
        for ri in reversed(header_rows(page)):
            vs,t=ajax(lid,vs,f'{C}:{ri}:j_id_kh',f'{C}:{ri}:j_id_kh',C)
    vs,t=ajax(lid,vs,C+':j_id_fk',C+':j_id_fk',C)
    f={'javax.faces.partial.ajax':'true','javax.faces.source':K+':imageFileUpload','javax.faces.partial.execute':K+':imageFileUpload','javax.faces.partial.render':K+':cropper '+K+':errorMessages '+K+':buttons '+K+':image-crop-modal',F+'_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post_multipart(path(lid),f,K+':imageFileUpload_input',filepath); vs=viewstate(t) or vs
    err=re.sub(r'<[^>]+>',' ',updates(t).get(K+':errorMessages','')).strip()
    if err or 'the-cropper_coords' not in t: return vs,{'upload_err':err or re.sub(r'\s+',' ',t)[:300]}
    vs,t2=ajax(lid,vs,K+':save',K+':the-cropper_coords @(.image-crop-preview) @(.alt)','@(.image-crop-preview) '+K+':errorMessages',{K+':the-cropper_coords':coords,K+':showCropper_hidden':'true'},extra={'crop-clientId':K})
    err2=re.sub(r'<[^>]+>',' ',updates(t2).get(K+':errorMessages','')).strip()
    vs,t3=ajax(lid,vs,K+':actionsOnCorrectUploadImage',K+':actionsOnCorrectUploadImage','@none')
    vals=title_vals(page); vals.update({K+':the-cropper_coords':coords,K+':showCropper_hidden':'true'})
    vs,t4=ajax(lid,vs,C+':btSaveImages','@all',C,vals)
    return vs,{'save_err':err2[:200],'save_msgs':msgs(t4),'imgs':re.findall(r'headerimages/[^"\']+',updates(t4).get(C,''))[:2]}
