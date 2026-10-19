"""Lista hoteles del backoffice (hotel-landing) por destino, por HTTP. Uso: python3 -I hl_list.py "Bayah" [--all]"""
import sys,re,html as H,json,time
sys.path.insert(0,'.'); from tcadmin import *
PATH='/admin/hotel-landing/List.xhtml'; D='HotelList:hotelList:destination'; T='HotelList:hotelList'; S='HotelList:hotelList:search'
def session():
    page,st,url=get(PATH); assert 'HotelList' in page,'sin sesión'; return viewstate(page)
def suggest(vs,q):
    f={'javax.faces.partial.ajax':'true','javax.faces.source':D,'javax.faces.partial.execute':D,'javax.faces.partial.render':D,'javax.faces.behavior.event':'query','javax.faces.partial.event':'query',D+'_query':q,D+'_input':q,D+'_hinput':'','HotelList_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(PATH,f); vs=viewstate(t) or vs
    return vs,re.findall(r'data-item-value="([^"]*)" data-item-label="([^"]*)"',updates(t).get(D,''))
def parse(frag):
    rows=[]
    for ri,body in re.findall(r'<tr[^>]*data-ri="(\d+)"[^>]*>(.*?)</tr>',frag,re.S):
        tds=[H.unescape(re.sub(r'<[^>]+>',' ',td)).strip() for td in re.findall(r'<td[^>]*>(.*?)</td>',body,re.S)]
        rows.append({'ri':int(ri),'code':tds[1],'name':tds[2],'country':tds[3]})
    m=re.search(r'\((\d+) - (\d+) of (\d+)\)',frag)
    return rows,(int(m.group(3)) if m else None)
def search(vs,code,label,rows=50):
    f={'javax.faces.partial.ajax':'true','javax.faces.source':D,'javax.faces.partial.execute':D,'javax.faces.partial.render':D,'javax.faces.behavior.event':'itemSelect','javax.faces.partial.event':'itemSelect',D+'_input':label,D+'_hinput':code,'HotelList_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(PATH,f); vs=viewstate(t) or vs
    f={'javax.faces.partial.ajax':'true','javax.faces.source':S,'javax.faces.partial.execute':'@all','javax.faces.partial.render':T+' HotelList:messages',S:S,D+'_input':label,D+'_hinput':code,T+'_rppDD':str(rows),'HotelList_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(PATH,f); vs=viewstate(t) or vs
    out,total=parse(updates(t).get(T,''))
    return vs,out,total
def page(vs,first,rows=50):
    f={'javax.faces.partial.ajax':'true','javax.faces.source':T,'javax.faces.partial.execute':T,'javax.faces.partial.render':T,T+'_pagination':'true',T+'_first':str(first),T+'_rows':str(rows),T+'_skipChildren':'true',T+'_encodeFeature':'true','HotelList_SUBMIT':'1','javax.faces.ViewState':vs}
    t,st=post(PATH,f); vs=viewstate(t) or vs
    out,total=parse(updates(t).get(T,''))
    return vs,out
def list_destination(vs,code,label):
    vs,out,total=search(vs,code,label)
    allrows=list(out)
    first=len(out)
    while total and first<total:
        vs,more=page(vs,first); 
        if not more: break
        allrows+=more; first+=len(more); time.sleep(0.2)
    seen=set(); uniq=[r for r in allrows if not (r['code'] in seen or seen.add(r['code']))]
    return vs,uniq,total
if __name__=='__main__':
    vs=session(); vs,sug=suggest(vs,sys.argv[1]); print('sugerencias:',sug)
    code,label=sug[0]
    vs,rows,total=list_destination(vs,code,label)
    print(code,label,'total:',total,'obtenidos:',len(rows)); print(rows[:3], rows[-2:])
    json.dump({'code':code,'label':label,'total':total,'rows':rows},open(f'hl_{code}.json','w'),ensure_ascii=False)
