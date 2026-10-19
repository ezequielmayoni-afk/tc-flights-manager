import sys,re,json,html as H
sys.path.insert(0,'.'); from themes_edit import *
def open_create(vs):
    src='ThemeListForm:themesDataList:createButton'
    f={'javax.faces.partial.ajax':'true','javax.faces.source':src,'javax.faces.partial.execute':src,'javax.faces.partial.render':'ThemeEditForm',src:src,'ThemeListForm_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(PATH,f); vs=viewstate(t) or vs
    form=updates(t).get('ThemeEditForm','')
    vals={}
    for m in re.finditer(r'<input\s[^>]*>', form):
        tag=m.group(0); n=re.search(r'\bname="([^"]+)"', tag); v=re.search(r'\bvalue="([^"]*)"', tag); ty=re.search(r'\btype="([^"]+)"', tag)
        if not n: continue
        typ=(ty.group(1) if ty else 'text')
        if typ in ('checkbox','radio'):
            if 'checked' in tag: vals[n.group(1)]=H.unescape(v.group(1)) if v else 'on'
        elif typ=='file': continue
        else: vals[n.group(1)]=H.unescape(v.group(1)) if v else ''
    for m in re.finditer(r'<textarea\s[^>]*name="([^"]+)"[^>]*>(.*?)</textarea>', form, re.S): vals[m.group(1)]=H.unescape(m.group(2))
    return vs, form, vals
def create_theme(vs, code, titulo, seo_title, seo_meta, desc_html, icon='fa-solid fa-umbrella-beach', order='0'):
    vs,form,vals=open_create(vs)
    ch={'ThemeEditForm:code':code,'ThemeEditForm:order':order,'ThemeEditForm:iconClass:iconClass_input':icon,'ThemeEditForm:iconClass:iconClass_hinput':icon}
    for idx in (0,35): set_lang_fields(ch, idx, titulo=titulo, seo_title=seo_title, seo_meta=seo_meta, desc_html=desc_html)
    return save_theme(vs, vals, ch)
if __name__=='__main__':
    D="Concierge 24/7 durante el viaje, 4,9★ en 1.972 opiniones de Google y cuotas."
    vs=session()
    vs,ok,growl=create_theme(vs,'Florianópolis','Florianópolis','Paquetes a Florianópolis desde Argentina | Sí, Viajo',
        'Paquetes a Florianópolis con vuelo, hotel y traslados, salidas confirmadas desde Buenos Aires, Córdoba y Rosario. Concierge 24/7 y 4,9★ en Google. Cuotas.',
        '<p>Paquetes a Florianópolis con vuelo, hotel y traslados: Canasvieiras, Jurerê e Ingleses, con salidas confirmadas desde Buenos Aires, Córdoba y Rosario en verano. '+D+'</p>')
    print('creado:',ok,'|',growl[:150])
    vs,rows=filter_list(vs,'Florianópolis'); print(rows)

def upload_image_url(vs, vals, url, w=1875, h=624):
    """Sube imagen por URL al formulario abierto (create/edit): upload-url → coords → save del cropper."""
    IK='ThemeEditForm:j_id_ek'
    f={k:v for k,v in vals.items() if k.startswith('ThemeEditForm')}
    f.update({'javax.faces.partial.ajax':'true','javax.faces.source':IK+':upload-url','javax.faces.partial.execute':IK+':image-inputs','javax.faces.partial.render':IK+':cropper '+IK+':errorMessages '+IK+':buttons',IK+':upload-url':IK+':upload-url',IK+':url':url,'ThemeEditForm_SUBMIT':'1','javax.faces.ViewState':vs})
    t,st=post(PATH,f); vs=viewstate(t) or vs
    err=re.sub(r'<[^>]+>','',updates(t).get(IK+':errorMessages','')).strip()
    if err or 'the-cropper_coords' not in t: return vs,False,'upload-url: '+(err or t[:200])
    f={k:v for k,v in vals.items() if k.startswith('ThemeEditForm')}
    f.update({IK+':url':url,IK+':showCropper_hidden':'true',IK+':the-cropper_coords':f'0_0_{w}_{h}'})
    f.update({'javax.faces.partial.ajax':'true','javax.faces.source':IK+':save','javax.faces.partial.execute':IK+':the-cropper_coords @(.image-crop-preview) @(.alt)','javax.faces.partial.render':'@(.image-crop-preview) '+IK+':errorMessages',IK+':save':IK+':save','crop-clientId':IK,'ThemeEditForm_SUBMIT':'1','javax.faces.ViewState':vs})
    t,st=post(PATH,f); vs=viewstate(t) or vs
    err=re.sub(r'<[^>]+>','',updates(t).get(IK+':errorMessages','')).strip()
    vf='validationFailed' in t and 'true' in re.findall(r'validationFailed[^}]*',t)[0] if 'validationFailed' in t else False
    open('crop_save_resp.xml','w').write(t)
    return vs,(not err and not vf),(err or 'ok')

def post_multipart(path, fields, filefield, filepath):
    import uuid, mimetypes, urllib.request
    boundary='----WebKitFormBoundary'+uuid.uuid4().hex[:16]
    body=b''
    for k,v in fields.items():
        body+=f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    fn=filepath.split('/')[-1]; ct=mimetypes.guess_type(fn)[0] or 'application/octet-stream'
    body+=f'--{boundary}\r\nContent-Disposition: form-data; name="{filefield}"; filename="{fn}"\r\nContent-Type: {ct}\r\n\r\n'.encode()+open(filepath,'rb').read()+f'\r\n--{boundary}--\r\n'.encode()
    h={'User-Agent':UA,'Cookie':COOKIE,'Content-Type':f'multipart/form-data; boundary={boundary}','Accept':'application/xml, text/xml, */*; q=0.01','X-Requested-With':'XMLHttpRequest','Faces-Request':'partial/ajax','Referer':BASE+path}
    r=urllib.request.Request(BASE+path, data=body, headers=h, method='POST')
    with urllib.request.urlopen(r, timeout=180) as resp: return resp.read().decode('utf-8','ignore'), resp.status

def upload_image_file(vs, vals, filepath, w, h):
    IK='ThemeEditForm:j_id_ek'
    f={k:v for k,v in vals.items() if k.startswith('ThemeEditForm')}
    f.update({'javax.faces.partial.ajax':'true','javax.faces.source':IK+':imageFileUpload','javax.faces.partial.execute':IK+':imageFileUpload','javax.faces.partial.render':IK+':cropper '+IK+':errorMessages '+IK+':buttons @(.ui-growl-pl)','ThemeEditForm_SUBMIT':'1','javax.faces.ViewState':vs})
    t,st=post_multipart(PATH,f,IK+':imageFileUpload_input',filepath); vs=viewstate(t) or vs
    open('file_upload_resp.xml','w').write(t)
    err=re.sub(r'<[^>]+>','',updates(t).get(IK+':errorMessages','')).strip()
    if err or 'the-cropper_coords' not in t: return vs,False,'upload: '+(err or re.sub(r'\s+',' ',t)[:300])
    f={k:v for k,v in vals.items() if k.startswith('ThemeEditForm')}
    f.update({IK+':showCropper_hidden':'true',IK+':the-cropper_coords':f'0_0_{w}_{h}'})
    f.update({'javax.faces.partial.ajax':'true','javax.faces.source':IK+':save','javax.faces.partial.execute':IK+':the-cropper_coords @(.image-crop-preview) @(.alt)','javax.faces.partial.render':'@(.image-crop-preview) '+IK+':errorMessages',IK+':save':IK+':save','crop-clientId':IK,'ThemeEditForm_SUBMIT':'1','javax.faces.ViewState':vs})
    t,st=post(PATH,f); vs=viewstate(t) or vs
    err=re.sub(r'<[^>]+>','',updates(t).get(IK+':errorMessages','')).strip()
    return vs,(not err),(err or 'ok')
