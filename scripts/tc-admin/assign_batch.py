import json,subprocess,sys
created=json.load(open('created_themes.json')); A=json.load(open('assignments.json'))
only=set(sys.argv[1].split(',')) if len(sys.argv)>1 else None
for slug,ids in A.items():
    if only and slug not in only: continue
    tid=created.get(slug)
    if not tid: print('SIN TEMA',slug); continue
    print('=====',slug,tid,len(ids))
    r=subprocess.run([sys.executable,'-I','assign_theme.py',str(tid),','.join(map(str,ids))],capture_output=True,text=True); print(r.stdout[-3000:]); print(r.stderr[-500:])
