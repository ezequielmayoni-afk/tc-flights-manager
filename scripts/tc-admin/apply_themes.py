import sys, csv, re, json, time
sys.path.insert(0,'.'); from themes_edit import *
plan={r['id']:r for r in csv.DictReader(open('/Users/ezequielmayoni/hub/docs/seo/tematicas-plan-2026-10-19.csv',encoding='utf-8'))}
D="Concierge 24/7 durante el viaje, 4,9★ en 1.972 opiniones de Google y cuotas."
BLURBS={
 '5611':("Verano 2027","Paquetes para el verano 2027 al Caribe y Brasil con vuelo, hotel y traslados, salidas confirmadas en enero y febrero desde Buenos Aires, Córdoba y Rosario. "+D),
 '5614':("Argentina","Paquetes por Argentina con vuelo, hotel y traslados: Ushuaia, El Calafate, Bariloche, Mendoza, Salta e Iguazú, con salidas confirmadas y asesor propio. "+D),
 '8009':("Mejores ofertas","Las ofertas de la semana en paquetes con vuelo, hotel y traslados, con cupos propios y salida confirmada. "+D),
 '9216':("Estados Unidos","Paquetes a Estados Unidos con vuelo, hotel y traslados: Orlando y Disney, Nueva York y Las Vegas, con asistencia al viajero. "+D),
 '9333':("Vacaciones de invierno","Paquetes para las vacaciones de invierno al Caribe, Brasil y Disney con vuelo, hotel y traslados, salidas confirmadas en julio. "+D),
 '9543':("Riviera Maya","Paquetes a la Riviera Maya y Playa del Carmen con vuelo, hotel all inclusive y traslados; cenotes, Tulum y Chichén Itzá cerca. "+D),
 '9663':("Sudamérica","Paquetes a Sudamérica con vuelo, hotel y traslados: Perú y Machu Picchu, Cartagena y destinos de Argentina, con salidas confirmadas. "+D),
 '12432':("Exóticos","Paquetes a destinos exóticos con vuelo, hoteles y guía: Dubái, Egipto, Turquía, Sudáfrica y Asia, en salidas grupales o a medida. "+D),
 '12450':("Jamaica","Paquetes a Jamaica con vuelo, hotel all inclusive en Montego Bay y traslados, con salidas confirmadas desde Buenos Aires. "+D),
 '12462':("Aruba","Paquetes a Aruba con vuelo, hotel y traslados, también combinados con Curazao; playas de arena blanca y clima estable todo el año. "+D),
 '12480':("Curazao","Paquetes a Curazao con vuelo, hotel all inclusive y traslados, también combinados con Aruba; playas, buceo y Willemstad. "+D),
 '12519':("Circuitos por Europa","Circuitos por España, Italia, Francia y Europa central con hoteles, traslados y guía en castellano, con salidas durante todo el año. "+D),
 '14140':("Rugby","Paquetes para ver rugby con entrada incluida, vuelo y hotel: test matches de Los Pumas y el Seis Naciones. "+D),
 '14143':("Eventos deportivos","Paquetes a eventos deportivos con entrada, vuelo y hotel: Fórmula 1, rugby y Mundial, con asistencia durante el evento. "+D),
 '17112':("Salidas grupales acompañadas","Salidas grupales acompañadas por un coordinador de Sí, Viajo a Europa, Turquía, Dubái, Perú y el Caribe, con vuelo, hoteles y traslados. "+D),
 '9636':("Fórmula 1","Paquetes de Fórmula 1 con entrada incluida, vuelo y hotel: Interlagos, GP de México, Austin y Las Vegas, con asistencia durante la carrera. "+D),
}
only=set(sys.argv[1].split(',')) if len(sys.argv)>1 else None
vs=session()
res=[]
for tid,(titulo,blurb) in BLURBS.items():
    if only and tid not in only: continue
    r=plan.get(tid); 
    if not r or not r['title_seo']:
        r={'title_seo':f"Paquetes {titulo} | Sí, Viajo",'meta_description':blurb[:150]}
    assert len(blurb)<=300, (tid, len(blurb))
    code=json.load(open('themes_byid.json'))[tid]['codigo']
    vs,rows=filter_list(vs, code.strip())
    row=next((x for x in rows if x['id']==tid), None)
    if not row: print('NO ROW', tid, code); continue
    vs,form,vals=open_edit(vs,row['row'])
    json.dump(vals, open(f'backup_theme_{tid}.json','w'), ensure_ascii=False)
    changes={}
    for idx in (0,35): set_lang_fields(changes, idx, titulo=titulo, seo_title=r['title_seo'], seo_meta=r['meta_description'], desc_html='<p>'+blurb+'</p>')
    vs,ok,growl=save_theme(vs, vals, changes)
    msg=re.search(r'summary:"([^"]*)"', growl); print(tid, titulo, '→', 'OK' if ok else 'FALLÓ', '|', (msg.group(1) if msg else growl)[:100])
    res.append((tid,titulo,ok)); time.sleep(0.5)
print('aplicadas:', sum(1 for x in res if x[2]), '/', len(res))
