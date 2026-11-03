import sys, re, html as H
sys.path.insert(0, ".")
import coletores
def nota(t): print("::notice title=lj::" + t.replace("\n", " ")[:1700], flush=True)
h = coletores.Http(pausa=2.5, timeout=30)
B = "https://www.lancejudicial.com.br"
def txt(d): return re.sub(r"\s+", " ", H.unescape(re.sub(r"<(script|style)[^>]*>.*?</\1>|<[^>]+>", " ", d, flags=re.S)))
for cat in ("apartamentos", "casas"):
    for u in (f"{B}/imoveis/{cat}", f"{B}/?imoveis=8&categoria={cat}"):
        try:
            t = h.get(u)
            lots = list(dict.fromkeys(re.findall(r'href="((?:https://www\.(?:lancejudicial|grupolance)\.com\.br)?/[a-z]{2}/[^"/]+/imoveis/%s/[^"?#]+)"' % cat, t)))
            pag = sorted(set(re.findall(r'[?&;]page=(\d+)', t)), key=int)
            nota(f"{u} OK {len(t)}B lotes={len(lots)} paginas={pag[-4:]} 1o={lots[:1]}")
            if lots:
                globals()[cat] = lots; break
        except Exception as e:
            nota(f"{u} ERRO {type(e).__name__} {str(e)[:100]}")
for cat in ("apartamentos", "casas"):
    L = globals().get(cat)
    if not L: continue
    u = L[0] if L[0].startswith("http") else B + L[0]
    d = h.get(u); x = txt(d)
    nota(f"DETALHE {cat} {u} {len(d)}B")
    i = x.find("Descrição do lote")
    nota("corpo: " + x[max(0, i-250):i+1400])
    for k in ("Avaliação", "Lance", "Praça", "Endereço", "Matrícula", "Ocup", "R\\$"):
        m = [x[max(0, a.start()-60):a.start()+140] for a in re.finditer(k, x)][:3]
        if m: nota(f"[{k}] " + " ~~ ".join(m))
    nota("imgs: " + " ; ".join(dict.fromkeys(re.findall(r'(?:src|data-src)="(//?cdn\.grupolance[^"]+)"', d)))[:500])
    nota("og: " + " ; ".join(re.findall(r'<meta property="og:(?:title|description|image)" content="([^"]*)"', d))[:700])
