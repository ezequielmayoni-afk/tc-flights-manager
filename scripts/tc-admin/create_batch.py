import sys,re,json,time,os
sys.path.insert(0,'.'); from themes_create import *
T=json.load(open('themes_batch.json')); IMG='/private/tmp/claude-501/-Users-ezequielmayoni-hub/c8dbe48f-9029-4df8-80f6-79bf5fcefaf5/scratchpad/gen_imgs/'
PLACEHOLDER='https://tr2storage.blob.core.windows.net/themes/xxVdYOZh7ico9S5M3C-KnNrS6B05E4gnrk.jpeg'
only=set(sys.argv[1].split(',')) if len(sys.argv)>1 else None
res=json.load(open('created_themes.json')) if os.path.exists('created_themes.json') else {}
def set_image_file(vs,tid,code,path):
    vs,rows=filter_list(vs,code); row=next((r for r in rows if r['id']==tid),None)
    vs,form,vals=open_edit(vs,row['row']); before=vals.get('ThemeEditForm:j_id_ek:url')
    vs,ok,msg=upload_image_file(vs,vals,path,1536,512)
    if not ok: return vs,False,'upload '+msg
    vs,ok2,growl=save_theme(vs,vals,{'ThemeEditForm:j_id_ek:showCropper_hidden':'true','ThemeEditForm:j_id_ek:the-cropper_coords':'0_0_1536_512'})
    vs,rows=filter_list(vs,code); row=next((r for r in rows if r['id']==tid),None); vs,form,vals2=open_edit(vs,row['row']); after=vals2.get('ThemeEditForm:j_id_ek:url')
    return vs,(ok2 and after!=before),f'{before[-30:] if before else None} → {after[-30:] if after else None}'
for t in T:
    if only and t['slug'] not in only: continue
    vs=session()
    if t['slug'] not in res:
        vs,rows=filter_list(vs,t['code']); ex=next((r for r in rows if r['codigo'].strip()==t['code']),None)
        if ex: res[t['slug']]=ex['id']; print('EXISTE',t['code'],ex['id'])
        else:
            vs,form,vals=open_create(vs)
            vs,ok,msg=upload_image_url(vs,vals,PLACEHOLDER)
            if not ok: print('IMG URL FALLÓ',t['slug'],msg); continue
            ch={'ThemeEditForm:code':t['code'],'ThemeEditForm:order':'0','ThemeEditForm:iconClass:iconClass_input':t['icon'],'ThemeEditForm:iconClass:iconClass_hinput':t['icon'],'ThemeEditForm:j_id_ek:url':PLACEHOLDER,'ThemeEditForm:j_id_ek:showCropper_hidden':'true','ThemeEditForm:j_id_ek:the-cropper_coords':'0_0_1875_624'}
            for idx in (0,35): set_lang_fields(ch,idx,titulo=t['titulo'],seo_title=t['seo'],seo_meta=t['meta'],desc_html='<p>'+t['desc']+'</p>')
            vs,ok,growl=save_theme(vs,vals,ch); m=re.search(r'summary:"([^"]*)"',growl)
            vs,rows=filter_list(vs,t['code']); row=next((r for r in rows if r['codigo'].strip()==t['code']),None)
            print(t['slug'],'creado →','OK' if ok else 'FALLÓ','|',(m.group(1) if m else '')[:60],'| id:',row['id'] if row else None)
            if not (ok and row): continue
            res[t['slug']]=row['id']; json.dump(res,open('created_themes.json','w'),ensure_ascii=False,indent=1)
    vs,ok,msg=set_image_file(vs,res[t['slug']],t['code'],IMG+t['slug']+'.jpg'); print('  imagen',t['slug'],'→',ok,msg); time.sleep(0.5)
vs=session(); vs,ok,msg=set_image_file(vs,'22662','Florianópolis',IMG+'florianopolis.jpg'); print('florianopolis imagen →',ok,msg)
json.dump(res,open('created_themes.json','w'),ensure_ascii=False,indent=1); print(res)
