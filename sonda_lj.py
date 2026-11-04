import re
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
http = c.Http(pausa=2.0, timeout=25)
S = "https://satoleiloes.com.br"
try:
    r = http.get(S + "/robots.txt")
    nota("SATO robots " + re.sub(r"\s+", " ", r)[:500])
    h = http.get(S)
    js = [u for u in re.findall(r'src="(/assets/js/[^"]+)"', h)]
    for u in js:
        j = http.get(S + u)
        ap = sorted(set(re.findall(r"""['"`]((?:https?://[^'"`\s]*api[^'"`\s]*|/api/[^'"`\s]*|/[a-z\-]+/[a-z\-/]*(?:lote|imove|leilao|busca|search)[^'"`\s]*))['"`]""", j, re.I)))
        nota(f"SATO {u} {len(j)}B: " + " ; ".join(ap)[:1500])
        base = re.findall(r"""(?:baseURL|VUE_APP_API\w*|apiUrl|API_URL)['"]?\s*[:=]\s*['"`]([^'"`]+)""", j)
        nota("SATO base " + str(base[:6]))
except Exception as e:
    import traceback; nota("SATO ERRO " + traceback.format_exc()[-500:])
