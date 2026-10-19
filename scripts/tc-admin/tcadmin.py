"""Cliente HTTP mínimo para el backoffice JSF de siviajo.com usando la sesión exportada del navegador."""
import json, re, html as H, urllib.request, urllib.parse, http.cookiejar, sys, time
STATE='/Users/ezequielmayoni/hub/.playwright-mcp/siviajo-admin-state.json'
BASE='https://www.siviajo.com'
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
def cookie_header():
    st=json.load(open(STATE))
    cs=[c for c in st['cookies'] if 'siviajo.com' in c['domain']]
    return '; '.join(f"{c['name']}={c['value']}" for c in cs)
COOKIE=cookie_header()
def get(path):
    r=urllib.request.Request(BASE+path, headers={'User-Agent':UA,'Cookie':COOKIE,'Accept':'text/html'})
    with urllib.request.urlopen(r, timeout=120) as resp: return resp.read().decode('utf-8','ignore'), resp.status, resp.geturl()
def post(path, fields, partial=True):
    data=urllib.parse.urlencode(fields, doseq=True).encode()
    h={'User-Agent':UA,'Cookie':COOKIE,'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','Accept':'application/xml, text/xml, */*; q=0.01','X-Requested-With':'XMLHttpRequest','Referer':BASE+path}
    if partial: h['Faces-Request']='partial/ajax'
    r=urllib.request.Request(BASE+path, data=data, headers=h, method='POST')
    with urllib.request.urlopen(r, timeout=120) as resp: return resp.read().decode('utf-8','ignore'), resp.status
def viewstate(text):
    m=re.search(r'<update id="[^"]*javax\.faces\.ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]></update>', text)
    if m: return m.group(1)
    for m in re.finditer(r'<input\s[^>]*name="javax\.faces\.ViewState[^"]*"[^>]*>', text):
        v=re.search(r'\bvalue="([^"]+)"', m.group(0))
        if v: return v.group(1)
    return None
def updates(text):
    return {m.group(1): m.group(2) for m in re.finditer(r'<update id="([^"]+)"><!\[CDATA\[(.*?)\]\]></update>', text, re.S)}
def rows_from_table(htmlfrag):
    out=[]
    for tr in re.findall(r'<tr[^>]*>(.*?)</tr>', htmlfrag, re.S):
        tds=[H.unescape(re.sub(r'<[^>]+>','',td)).strip() for td in re.findall(r'<td[^>]*>(.*?)</td>', tr, re.S)]
        if tds: out.append(tds)
    return out
