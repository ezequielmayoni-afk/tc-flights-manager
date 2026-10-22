"""Deja el calendario de una ficha de TC ofreciendo exactamente las fechas pedidas: rango, días de operación y stop sales."""
import sys,re,json,datetime as dt,time
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import holidays_edit as H, tcadmin as T
E='HolidayPackageEditForm'; SS=E+':tabView:stopSalesSettings'
WD=['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
def D(s): return dt.date.fromisoformat(str(s)[:10])
def f(d): return d.strftime('%d/%m/%Y')
def gaps(desired):
    days={d.weekday() for d in desired}; ds=sorted(desired); out=[]
    for a,b in zip(ds,ds[1:]):
        g=[a+dt.timedelta(days=i) for i in range(1,(b-a).days) if (a+dt.timedelta(days=i)).weekday() in days]
        if g: out.append((g[0],g[-1]))
    return out
def table_rows(frag):
    tb=re.search(r'id="'+re.escape(SS)+r':tableStopSalesDate_data".*?</tbody>',frag,re.S)
    if not tb: return []
    rows=[]
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>',tb.group(0),re.S):
        btn=re.search(r'id="('+re.escape(SS)+r':tableStopSalesDate:\d+:removeStopSale)"',tr)
        dates=re.findall(r'\b(\d{2}/\d{2}/\d{4})\b',re.sub(r'<script.*?</script>','',tr,flags=re.S))
        if btn and len(dates)>=2: rows.append((btn.group(1),dates[0],dates[1]))
    return rows
def ajax(vs,src,extra):
    fld={'javax.faces.partial.ajax':'true','javax.faces.source':src,'javax.faces.partial.execute':SS+':stop_sales_panel','javax.faces.partial.render':SS+':stop_sales_panel',src:src,E+'_SUBMIT':'1','javax.faces.ViewState':vs}
    fld.update(extra); t,st=T.post(H.PATH,fld); vs=T.viewstate(t) or vs
    panel=T.updates(t).get(SS+':stop_sales_panel','')
    return vs,panel,re.findall(r'summary:"([^"]*)"',t)
def apply(pid,desired,dry=True):
    desired={D(x) for x in desired}; days={WD[d.weekday()] for d in desired}
    vs=H.session(); vs,found,form,vals=H.open_pkg(vs,str(pid),str(pid))
    if not found: return {'id':pid,'error':'no se pudo abrir'}
    cur_rows=table_rows(form)
    cur={'start':vals.get(E+':tabView:startDate_input'),'end':vals.get(E+':tabView:endDate_input'),'days':sorted(w for w in WD if vals.get(E+':tabView:%s_input'%w)),'stop':[(a,b) for _,a,b in cur_rows]}
    want_stop=[(f(a),f(b)) for a,b in gaps(desired)]
    want={'start':f(min(desired)),'end':f(max(desired)),'days':sorted(days),'stop':want_stop}
    plan={'id':pid,'titulo':found['title'][:60],'actual':cur,'objetivo':want,'cambia':cur!=want}
    if dry or cur==want: return plan
    # 1) borrar todos los stop sales actuales (de atrás para adelante)
    for btn,_,_ in reversed(cur_rows):
        vs,panel,msgs=ajax(vs,btn,{})
        if msgs: plan.setdefault('msgs',[]).append(('remove',btn[-20:],msgs))
    # 2) días y rango primero (la validación de stop sales exige que caigan en días de operación), guardar
    changes={}
    for w in WD:
        k=E+':tabView:%s_input'%w
        if w in days: changes[k]=['on']
        else: vals.pop(k,None)
    changes[E+':tabView:startDate_input']=want['start']; changes[E+':tabView:endDate_input']=want['end']
    vs,t,msgs=H.save(vs,vals,changes); plan['save1']=msgs
    if 'Successfully saved!' not in msgs: return plan
    if not want_stop: return plan
    # 3) reabrir, agregar stop sales, guardar
    time.sleep(1); vs=H.session(); vs,found,form,vals=H.open_pkg(vs,str(pid),str(pid))
    if not found: plan['error']='no reabrió'; return plan
    for a,b in want_stop:
        vs,panel,msgs=ajax(vs,SS+':stopSales',{SS+':startDateStopSale_input':a,SS+':endDateStopSale_input':b})
        if msgs: plan.setdefault('msgs',[]).append(('add',a,b,msgs))
    vs,t,msgs=H.save(vs,vals,{}); plan['save2']=msgs
    return plan
if __name__=='__main__':
    mode=sys.argv[1]; targets=json.load(open(sys.argv[2]))
    out=[]
    for pid,dates in targets.items():
        r=apply(pid,dates,dry=(mode=='dry')); out.append(r)
        print(json.dumps(r,ensure_ascii=False,default=str))
    json.dump(out,open('/private/tmp/claude-501/-Users-ezequielmayoni-hub/c8dbe48f-9029-4df8-80f6-79bf5fcefaf5/scratchpad/apply_result_%s.json'%mode,'w'),ensure_ascii=False,default=str,indent=1)
