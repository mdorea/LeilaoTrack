import re
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
http = c.Http(pausa=2.0, timeout=25)
S = "https://satoleiloes.com.br"
try:
    j = http.get(S + "/assets/js/app.a5d65882.js")
    hosts = sorted(set(re.findall(r"https?://[A-Za-z0-9.\-]*(?:satoleiloes|sato)[A-Za-z0-9.\-]*(?:/[A-Za-z0-9_\-/]*)?", j)))
    nota("SATO hosts " + " ; ".join(hosts)[:900])
    ch = sorted(set(re.findall(r"""(?:\.get|\.post)\(\s*[`'"]([^`'"]{3,90})[`'"]""", j)))
    nota("SATO chamadas " + " ; ".join(ch)[:1800])
    for m in list(re.finditer(r"(?:baseURL|base_url|API_BASE|apiBase)", j))[:3]:
        nota("SATO base " + re.sub(r"\s+", " ", j[max(0, m.start()-80):m.start()+200]))
    sm = http.get("https://www.satoleiloes.com.br/sitemap.xml.gz") if False else ""
except Exception as e:
    import traceback; nota("SATO ERRO " + traceback.format_exc()[-500:])
