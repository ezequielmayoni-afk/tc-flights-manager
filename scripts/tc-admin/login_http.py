"""Login web de HUBSIVIAJO por HTTP (sin navegador ni contador de página). Pide el código por mail, espera
/root/tc-admin/otp.txt hasta 30 min, valida y guarda la sesión en state.json. No imprime valores de campos."""
import os, re, json, time, html, urllib.request, urllib.parse, http.cookiejar
BASE = 'https://www.siviajo.com'; UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
jar = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def get(path):
    with op.open(urllib.request.Request(BASE + path, headers={'User-Agent': UA}), timeout=90) as r: return r.read().decode('utf-8', 'ignore')
def post(path, fields, ref):
    data = urllib.parse.urlencode(fields, doseq=True).encode()
    h = {'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Faces-Request': 'partial/ajax', 'X-Requested-With': 'XMLHttpRequest', 'Referer': BASE + ref}
    with op.open(urllib.request.Request(BASE + path, data=data, headers=h), timeout=90) as r: return r.read().decode('utf-8', 'ignore')
def vs_of(t, cur=None):
    m = re.search(r'javax\.faces\.ViewState[^>]*?value="([^"]+)"', t) or re.search(r'<update id="[^"]*ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]>', t)
    return m.group(1) if m else cur
def val(t, name):
    m = re.search(r'name="' + re.escape(name) + r'"[^>]*value="([^"]*)"', t) or re.search(r'value="([^"]*)"[^>]*name="' + re.escape(name) + r'"', t)
    return html.unescape(m.group(1)) if m else ''
def ab(t, src):
    """Parámetros PrimeFaces.ab del elemento `src`: process (execute) y update (render)."""
    m = re.search(r'PrimeFaces\.ab\(\{s:&quot;' + re.escape(src) + r'&quot;(.*?)\}\)', t) or re.search(r'PrimeFaces\.ab\(\{s:"' + re.escape(src) + r'"(.*?)\}\)', t)
    if not m: return None, None
    body = html.unescape(m.group(1))
    p = re.search(r'p:"([^"]*)"', body); u = re.search(r'u:"([^"]*)"', body)
    return (p.group(1) if p else src), (u.group(1) if u else '@form')
L = 'login-form:login-content:login:'
page = get('/admin/holidays/List.xhtml'); vs = vs_of(page)
f = {'javax.faces.partial.ajax': 'true', 'javax.faces.source': L + 'signin', 'javax.faces.partial.execute': 'login-form:login-content:login-form-content login-form:login-content:login:login-form-content',
     'javax.faces.partial.render': 'login-form:login-content:login-form-content login-form:login-content:login:login-form-content', L + 'signin': L + 'signin', 'micrositeId': 'siviajo',
     L + 'requestURI': '/admin/holidays/List.xhtml', L + 'token': val(page, L + 'token'), L + 'Email': os.environ['TC_USERNAME'], L + 'j_password': os.environ['TC_PASSWORD'], L + 'remember': 'true', 'javax.faces.ViewState': vs}
t1 = post('/login.xhtml', f, '/admin/holidays/List.xhtml'); vs = vs_of(t1, vs)
send = L + 'j_id_a_26:sendValidationCode'
print('paso factor:', send in t1)
ex, rn = ab(t1, send)
f2 = {'javax.faces.partial.ajax': 'true', 'javax.faces.source': send, 'javax.faces.partial.execute': '@all', 'javax.faces.partial.render': '@all', send: send, 'micrositeId': 'siviajo',
      L + 'j_id_a_26:authenticationOption': 'EMAIL', 'login-form_SUBMIT': '1', 'javax.faces.ViewState': vs}
t2 = post('/login.xhtml', f2, '/admin/holidays/List.xhtml'); vs = vs_of(t2, vs)
names_all = sorted(set(n for n in re.findall(r'name="([^"]+)"', t2) if n.startswith('login-form')))
code_names = [n for n in names_all if re.search(r'code|otp|digit|validation|verif', n, re.I) and not n.endswith('_clone')]
links = [i for i in re.findall(r'<a[^>]*id="(login-form[^"]+)"', t2) if re.search(r'valid|verif|confirm|check|next|siguiente|login2fa|codeSubmit', i, re.I) and 'send' not in i.lower() and 'resend' not in i.lower()]
print('todos los campos:', names_all); print('todos los links:', re.findall(r'<a[^>]*id="(login-form[^"]+)"', t2))
print('código enviado:', bool(re.search(r'enviado|sent', t2, re.I)), '| campos de código:', code_names, '| botones:', links)
open('/root/tc-admin/step2.html', 'w').write(re.sub(r'value="[^"]*"', 'value=""', t2))
t0 = time.time()
while not os.path.exists('/root/tc-admin/otp.txt'):
    if time.time() - t0 > 1800: print('sin código'); raise SystemExit(2)
    time.sleep(3)
code = open('/root/tc-admin/otp.txt').read().strip(); os.remove('/root/tc-admin/otp.txt')
D = L + 'j_id_a_26:marcadorCodigo:%d:d'
for i, dgt in enumerate(code[:6]):   # cada dígito dispara su "change" en la página
    fd = {'javax.faces.partial.ajax': 'true', 'javax.faces.source': D % i, 'javax.faces.partial.execute': D % i, 'javax.faces.partial.render': '@none', 'javax.faces.behavior.event': 'change', 'javax.faces.partial.event': 'change',
          (D % i) + '_input': dgt, (D % i) + '_hinput': dgt, 'login-form_SUBMIT': '1', 'micrositeId': 'siviajo', 'javax.faces.ViewState': vs}
    vs = vs_of(post('/login.xhtml', fd, '/admin/holidays/List.xhtml'), vs)
f3 = {'javax.faces.partial.ajax': 'true', 'javax.faces.source': L + 'signin', 'javax.faces.partial.execute': 'login-form', 'javax.faces.partial.render': '@all', L + 'signin': L + 'signin',
      'micrositeId': 'siviajo', 'login-form_SUBMIT': '1', 'javax.faces.ViewState': vs, L + 'requestURI': '/admin/holidays/List.xhtml', L + 'token': '', L + 'remember': 'true',
      L + 'Email': os.environ['TC_USERNAME'], L + 'j_password': os.environ['TC_PASSWORD'], L + 'j_id_a_26:authenticationOption': 'EMAIL'}
for i, dgt in enumerate(code[:6]): f3[(D % i) + '_input'] = dgt; f3[(D % i) + '_hinput'] = dgt
t3 = post('/login.xhtml', f3, '/admin/holidays/List.xhtml')
open('/root/tc-admin/step3.html', 'w').write(re.sub(r'value="[^"]*"', 'value=""', t3))
m = re.search(r'<redirect url="([^"]+)"', t3); print('validación:', 'redirige' if m else re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', t3))[:200])
if m: get(html.unescape(m.group(1)).replace(BASE, ''))
ok = 'HolidayPackagesListForm' in get('/admin/holidays/List.xhtml')
json.dump({'cookies': [{'name': c.name, 'value': c.value, 'domain': c.domain} for c in jar]}, open('/root/tc-admin/state.json', 'w')); os.chmod('/root/tc-admin/state.json', 0o600)
print('logueado:', ok)
