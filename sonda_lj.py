import re
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
try:
    http = c.Http(pausa=2.5)
    B = "https://www.lancejudicial.com.br/imoveis/casas"
    for q in ("?pagina=2", "?pagina=3"):
        h2 = http.get(B + q)
        ids = re.findall(r'data-key="(\d+)"', h2)
        nota(f"{q}: {len(ids)} cards {ids[:3]}...{ids[-2:]}")
    h = http.get(B)
    nota("TOTAIS " + str(re.findall(r"(?:Casas|Apartamentos|Im[óo]veis)\s*(\d+)", c.texto(h)))[:200] + " cards=" + str(len(re.findall(r'data-key="(\d+)"', h))))
    d = http.get("https://www.grupolance.com.br/sp/itanhaem/imoveis/casas/imovel-residencial-125m2-itanhaem-sp-28950")
    t = c.texto(d)
    k = t.find("Valor atual")
    nota("TEXTO_DET k=%d " % k + t[max(0, k-200):k+700])
    k = t.find("1ª Praça")
    nota("PRACA k=%d " % k + t[max(0, k-300):k+500])
    i = d.find("Encerramento")
    nota("HTML_ENC " + re.sub(r"\s+", " ", d[max(0, i-600):i+500]))
except Exception as e:
    import traceback; nota("ERRO " + traceback.format_exc()[-1500:])
