import sys, re, html as H
sys.path.insert(0, ".")
import coletores
def nota(t): print("::notice title=lj::" + t[:1650], flush=True)
h = coletores.Http(pausa=2.5, timeout=30)
B = "https://www.lancejudicial.com.br"
def limpo(d):
    d = re.sub(r"<(script|style|svg|noscript)[^>]*>.*?</\1>", "", d, flags=re.S)
    d = re.sub(r"<!--.*?-->", "", d, flags=re.S)
    d = re.sub(r"<(\w+)((?:\s+[\w:-]+=\"[^\"]*\")*)\s*/?>", lambda m: "<" + m.group(1) + "".join(" " + a for a in re.findall(r'\b(class|id|itemprop|href)="[^"]{0,60}"', m.group(2)) ) + ">", d)
    return re.sub(r"\s+", " ", d)
def txt(d): return re.sub(r"\s+", " ", H.unescape(re.sub(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", " ", d, flags=re.S)))
pag = {}
for cat in ("casas", "apartamentos"):
    t = h.get(f"{B}/imoveis/{cat}")
    pag[cat] = list(dict.fromkeys(re.findall(r'href="(https://www\.(?:lancejudicial|grupolance)\.com\.br/[a-z]{2}/[^"/]+/imoveis/%s/[^"?#]+)"' % cat, t)))
    nota(f"{cat}: {len(pag[cat])} links; lista simples: " + limpo(t[t.find(pag[cat][1]) - 300: t.find(pag[cat][1]) + 1400])[:1200])
u = pag["casas"][1]
d = h.get(u); nota("URL " + u)
s = limpo(d); i = s.find("<h1")
for k in range(3):
    nota(f"casa HTML[{k}]: " + s[i + k * 1600: i + (k + 1) * 1600])
for cat, k in (("casas", 2), ("casas", 3), ("apartamentos", 1), ("apartamentos", 2)):
    u = pag[cat][k]; x = txt(h.get(u)); j = x.find("Descrição do lote")
    nota(f"{cat}#{k} {u.split('/')[-1]} :: " + x[j:j + 1100])
