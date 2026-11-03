import sys, re, collections
sys.path.insert(0, ".")
import coletores
def nota(t): print("::notice title=lj::" + t.replace("\n", " ")[:1400], flush=True)
h = coletores.Http(pausa=1.0, timeout=30)
B = "https://www.lancejudicial.com.br"
try:
    t = h.get(B + "/robots.txt"); nota("robots: " + t[:700])
except Exception as e: nota(f"robots ERRO {e}")
t = h.get(B + "/")
links = sorted(set(re.findall(r'href="([^"#]+)"', t)))
rel = [l for l in links if re.search(r"imove|imóv|casa|apart|leilao|leiloes|lote|busca|categoria", l, re.I)]
nota(f"{len(links)} links; relevantes: " + " ; ".join(rel)[:1300])
for pista in ("__NEXT_DATA__", "wp-content", "ng-version", "nuxt", "application/ld+json", "/api/", "graphql", "data-lote", "cdn."):
    nota(f"pista {pista}: {len(re.findall(re.escape(pista), t))}")
api = sorted(set(re.findall(r'https?://[^"\' ]*api[^"\' ]*', t)))[:8]
nota("api: " + " ; ".join(api))
