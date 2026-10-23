"""Genera las 4 secciones (<4.096 chars) de una landing a partir del borrador docs/seo/landings/<key>.md, con fichas y precios vigentes (all_fichas.json) y reseñas reales de Google (reviews_google.json).
Uso: python3 landing_sections.py <key> <regex reseñas> <texto WhatsApp urlencoded> [ids extra separados por coma] [regex reseñas de respaldo]
Los JSON de datos se leen de la carpeta que indique LANDING_DATA (default: ./data)."""
import json,re,html,sys,datetime as dt
import os
S=os.environ.get('LANDING_DATA','./data').rstrip('/')+'/'
fichas=json.load(open(S+'all_fichas.json')); reviews=json.load(open(S+'reviews_google.json'))
MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
def fecha(s): y,m,d=s[:10].split('-'); return f"{int(d)} de {MESES[int(m)-1]} de {y}"
def money(x): return 'US$ {:,.0f}'.format(x).replace(',','.')
def inline(s):
    s=html.escape(s,quote=False); s=re.sub(r'\[([^\]]+)\]\(([^)]+)\)',r'<a href="\2">\1</a>',s); return re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',s)
def para(lines):
    out=[]; p=[]; inl=False
    for ln in lines+['']:
        if ln.startswith('### '):
            if p: out.append('<p>'+inline(' '.join(p))+'</p>'); p=[]
            if inl: out.append('</ul>'); inl=False
            out.append('<h3>'+inline(ln[4:])+'</h3>')
        elif ln.startswith('- '):
            if p: out.append('<p>'+inline(' '.join(p))+'</p>'); p=[]
            if not inl: out.append('<ul>'); inl=True
            out.append('<li>'+inline(ln[2:])+'</li>')
        elif ln.strip()=='':
            if p: out.append('<p>'+inline(' '.join(p))+'</p>'); p=[]
            if inl: out.append('</ul>'); inl=False
        else: p.append(ln)
    return ''.join(out)
def noemoji(t):
    return re.sub(r'[\U0001F000-\U0001FFFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D\u2705\u2714\u2728\u274C]','',t)
def stars(cat): m=re.search(r'(\d)',str(cat or '')); return f"{m.group(1)} estrellas" if m else ''
def desc_ficha(v):
    hs=v.get('hotels') or []; parts=[]
    for h in hs:
        if not h.get('name'): continue
        s=stars(h.get('cat')); meal={'ALL INCLUSIVE':'all inclusive','BREAKFAST':'con desayuno','HALF BOARD':'media pensión','ROOM ONLY':'sólo alojamiento'}.get(str(h.get('meal') or '').upper(),'')
        parts.append(f"{h['nights']} noches en {html.escape(h['name'])}"+(f" ({s})" if s else '')+(f", {meal}" if meal and len(hs)==1 else ''))
    tr=v.get('tr') or {}; comp=tr.get('company'); org={'EZE':'Buenos Aires','AEP':'Buenos Aires','COR':'Córdoba','ROS':'Rosario','MDZ':'Mendoza'}.get(tr.get('origin') or '','')
    d=('; '.join(parts)+'.') if parts else ''
    if comp: d+=f" Vuelo {html.escape(comp)}"+(f" desde {org}" if org else '')+'.'
    return d
def build(mdfile,review_pat,wa_text,hoy=dt.date(2026,10,23),max_items=9,extra_ids=(),review_fallback=None):
    md=open(mdfile).read(); fm,body=md.split('---\n',2)[1:]
    meta=dict(l.split(': ',1) for l in fm.strip().split('\n'))
    blocks={}; cur=None
    for ln in body.strip('\n').split('\n'):
        if ln.startswith('## '): cur=ln[3:].strip(); blocks[cur]=[]
        elif cur is None: blocks.setdefault('_intro',[]).append(ln)
        else: blocks[cur].append(ln)
    h2=list(blocks.keys())
    k_list=h2[1]; k_incl=h2[2]; k_when=h2[3]; k_faq=h2[4]; k_other=h2[5]; k_cta=h2[6]
    ids=re.findall(r'idea/(\d+)',''.join(blocks[k_list]))+[x for x in extra_ids if x not in re.findall(r'idea/(\d+)',''.join(blocks[k_list]))]
    items=[]
    for pid in ids:
        v=fichas.get(pid) or {}
        if not v.get('active') or not v.get('dep') or v['dep']<str(hoy): continue
        cu=' Cuotas.' if 'cuotas' in (v.get('ribbon') or '').lower() else ''
        items.append((v['dep'],f'<li><a href="https://www.siviajo.com/es/idea/{pid}/x">{html.escape(v["title"])}</a>: {desc_ficha(v)} Salida {fecha(v["dep"])}. Desde {money(v["pp"])} por persona.{cu}</li>',v['pp']))
    items.sort(); items=items[:max_items]
    lista='<ul>'+''.join(i[1] for i in items)+'</ul>'; minpp=min((i[2] for i in items),default=None)
    intro=para(blocks['_intro']).replace('1.972 reseñas de Google','más de 1.900 reseñas de Google').replace('1.972 opiniones','más de 1.900 opiniones')
    rest=para([l for l in blocks[k_list] if not l.startswith('- ')])
    rest=rest.replace('</p>','</p>'+lista,1) if rest else lista
    rv=[r for r in reviews if re.search(review_pat,r.get('snippet') or '',re.I) and r.get('rating',0)>=5][:3]
    if len(rv)<3 and review_fallback: rv=(rv+[r for r in reviews if re.search(review_fallback,r.get('snippet') or '',re.I) and r.get('rating',0)>=5 and r not in rv])[:3]
    res='<p>Opiniones reales en Google de clientes de Sí, Viajo (4,9 estrellas en más de 1.900 reseñas):</p><ul>'+''.join(f'<li><strong>{html.escape(r["user"]["name"])}</strong> (5 estrellas, {fecha(r["iso_date"])}): “{html.escape(noemoji(r["snippet"]).strip())}”</li>' for r in rv)+'</ul>'
    wa=f'<p><a href="https://wa.me/5491135181235?text={wa_text}">Escribinos por WhatsApp</a> o llamanos al +54 9 11 3518-1235.</p>'
    faq=re.sub(r'<p>\[RESEÑAS.*?</p>','',para(blocks[k_faq]))
    cta=re.sub(r'<p>\[WHATSAPP\]</p>',wa,para(blocks[k_cta]))
    name=re.sub(r'^Paquetes a (la )?','',k_list).replace(' con salida confirmada','')
    secs=[dict(name=f'SEO 1 {name} salidas',title=k_list,subtitle='Precios por persona, base doble, con vuelo, hotel, traslados y concierge 24/7.',html=intro+rest),
          dict(name=f'SEO 2 {name} incluye',title=k_incl.replace('de Sí, Viajo?',f'a {name} de Sí, Viajo?'),subtitle='Aéreo, hotel, traslados, asistencia y un concierge que te acompaña las 24 horas.',html=para(blocks[k_incl])+f'<h2>{html.escape(k_when)}</h2>'+para(blocks[k_when])),
          dict(name=f'SEO 3 {name} FAQ',title=f'Preguntas frecuentes sobre viajar a {name}',subtitle='Lo que más nos preguntan antes de reservar.',html=faq),
          dict(name=f'SEO 4 {name} reseñas',title=f'Lo que dicen quienes ya viajaron a {name}',subtitle='4,9 estrellas en Google. Reseñas reales de clientes de Sí, Viajo.',html=res+f'<h2>{html.escape(k_other)}</h2>'+para(blocks[k_other])+f'<h2>{html.escape(k_cta)}</h2>'+cta)]
    return meta,secs,items,minpp,rv
if __name__=='__main__':
    key=sys.argv[1]; pat=sys.argv[2]; wa=sys.argv[3]; extra=sys.argv[4].split(',') if len(sys.argv)>4 and sys.argv[4] else (); fb=sys.argv[5] if len(sys.argv)>5 else None
    meta,secs,items,minpp,rv=build(f'/Users/ezequielmayoni/hub/docs/seo/landings/{key}.md',pat,wa,extra_ids=extra,review_fallback=fb)
    for s in secs: print(s['name'],'| chars',len(s['html']),'| palabras',len(re.sub(r'<[^>]+>',' ',s['html']).split()),'| OK' if len(s['html'])<4096 else 'LARGO')
    print('fichas:',len(items),'min pp',minpp,'| reseñas:',[r['user']['name'] for r in rv])
    faqp=re.findall(r'US\$ ?[\d.]+[^.<]{0,60}',secs[2]['html']); print('precios en FAQ/intro:',faqp[:8], re.findall(r'desde US\$ ?[\d.]+',secs[0]['html'])[:3])
    json.dump(dict(meta=meta,sections=secs),open(S+f'landing_{key}_spec.json','w'),ensure_ascii=False,indent=1)
