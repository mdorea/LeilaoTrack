import sys, re, html as H
sys.path.insert(0, ".")
import coletores
def nota(t): print("::notice title=lj::" + t.replace("\n", " ")[:1500], flush=True)
h = coletores.Http(pausa=2.5, timeout=30)
B = "https://www.lancejudicial.com.br"
t = h.get(B + "/?imoveis=8&per-page=48&sort=padrao")
nota(f"lista {len(t)}B title={re.search(r'<title>(.*?)</title>', t, re.S).group(1).strip()[:90]}")
hrefs = re.findall(r'href="(https?://[^"]*lancejudicial[^"]*|/[^"#]*)"', t)
cand = [x for x in dict.fromkeys(hrefs) if re.search(r"/(lote|leilao|imovel|item)s?/|\d{4,}", x) and "?" not in x]
nota(f"{len(cand)} links tipo lote: " + " ; ".join(cand[:12]))
pag = sorted(set(re.findall(r'[?&]page=(\d+)', t)), key=int)
nota("paginas: " + ",".join(pag[-6:]) + " | total? " + " ; ".join(re.findall(r"(\d[\d\.]*)\s*(?:resultados|lotes|im[óo]veis encontrados)", t, re.I)[:4]))
i = t.find(cand[0].replace(B, "")) if cand else -1
if i > 0:
    bloco = re.sub(r"\s+", " ", re.sub(r"<(script|style)[^>]*>.*?</\1>", "", t[max(0, i-600):i+1400], flags=re.S))
    nota("card: " + bloco)
if cand:
    u = cand[0] if cand[0].startswith("http") else B + cand[0]
    d = h.get(u)
    nota(f"detalhe {u} {len(d)}B")
    txt = re.sub(r"\s+", " ", H.unescape(re.sub(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", " ", d, flags=re.S)))
    nota("texto: " + txt[:1400])
    nota("ld+json: " + " | ".join(re.findall(r'application/ld\+json">(.*?)</script>', d, re.S))[:1200])
