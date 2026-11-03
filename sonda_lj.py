import re
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
try:
    http = c.Http(pausa=2.5)
    d = http.get("https://www.grupolance.com.br/sp/itanhaem/imoveis/casas/imovel-residencial-125m2-itanhaem-sp-28950")
    r = c.lj_detalhe(d); r.pop("desc", None)
    nota("DET " + str(r))
    t = c.texto(d)
    k = t.find("Encerramento do")
    nota("ENC " + repr(t[k:k+120]) + " ini=" + str(t.find("Lotes que podem te interessar")) + " k=" + str(k))
except Exception as e:
    import traceback; nota("ERRO " + traceback.format_exc()[-1500:])
