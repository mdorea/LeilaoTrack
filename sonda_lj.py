import re
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
try:
    http = c.Http(pausa=2.5)
    h = http.get("https://www.lancejudicial.com.br/imoveis/casas")
    i = h.find("28950")
    nota("CARTAO " + re.sub(r"\s+", " ", h[max(0, i-900):i+700]))
    for m in list(re.finditer(r"(page=|pagina=|offset|load-more|carregar mais|data-url|data-page|infinite|ajax)", h, re.I))[:12]:
        nota("HINT " + re.sub(r"\s+", " ", h[max(0, m.start()-120):m.start()+200]))
    for q in ("?page=2", "?pagina=2", "?p=2"):
        try:
            h2 = http.get("https://www.lancejudicial.com.br/imoveis/casas" + q)
            ids = set(re.findall(r"imoveis/casas/[^\"?#]+?-(\d+)\"", h2))
            nota(f"{q}: {len(ids)} ids, primeiro {sorted(ids)[:3]}")
        except Exception as e:
            nota(f"{q}: erro {e}")
    d = http.get("https://www.grupolance.com.br/sp/itanhaem/imoveis/casas/imovel-residencial-125m2-itanhaem-sp-28950")
    t = c.texto(d)
    k = t.find("Valor atual")
    nota("TEXTO_DET " + t[max(0, k-300):k+900])
    k = t.find("Praça")
    nota("PRACA " + t[max(0, k-200):k+500])
except Exception as e:
    import traceback; nota("ERRO " + traceback.format_exc()[-1500:])
