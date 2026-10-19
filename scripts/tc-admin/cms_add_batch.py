import sys,re,json,time
sys.path.insert(0,'.'); from cms_themes import *
created=json.load(open('created_themes.json')); T={t['slug']:t for t in json.load(open('themes_batch.json'))}
only=set(sys.argv[1].split(',')) if len(sys.argv)>1 else None
done=json.load(open('cms_added.json')) if __import__('os').path.exists('cms_added.json') else {}
for slug,tid in created.items():
    if only and slug not in only: continue
    if slug in done: print('ya',slug); continue
    vs,page=session(); q=T[slug]['titulo'][:12]
    vs,sug=suggest(vs,q); hit=next((s for s in sug if s[0]==tid),None)
    if not hit: print('NO SUGERIDO',slug,tid,q,sug[:3]); continue
    vs,t,tv=add_theme(vs,hit[0],hit[1],active=True); msgs=re.findall(r'summary:"([^"]*)"',t); print(slug,tid,'→',msgs)
    if 'Guardado' in msgs: done[slug]=tid; json.dump(done,open('cms_added.json','w'),indent=1)
    time.sleep(0.5)
