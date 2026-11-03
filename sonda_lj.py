import json, collections
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
logs = []
try:
    http = c.Http(pausa=2.5)
    lotes, ok = c.coletar_lancejudicial(http, logs.append, anteriores={})
    cont = collections.Counter((l["tipo"], l["uf"]) for l in lotes)
    nota(f"TOTAL {len(lotes)} ok={ok} | " + " | ".join(logs) + " | " + str(dict(cont)))
    nota("SEM rua=%d imagem=%d bairro=%d valor=%d encerra=%d | 2pracas=%d area_constr=%d" % (
        sum(not l["endereco"] for l in lotes), sum(not l["imagem"] for l in lotes), sum(not l["bairro"] for l in lotes),
        sum(not l["valor"] for l in lotes), sum(not l["encerra"] for l in lotes), sum(len(l["pracas"]) > 1 for l in lotes),
        sum(bool(l.get("area_constr")) for l in lotes)))
    nota("TITULOS " + " || ".join(f'{l["titulo"]} [{l["comitente"]}, R$ {l["valor"]}, {l["desconto"]}%, {l["encerra"]}]' for l in lotes[:10]))
    nota("TITULOS2 " + " || ".join(l["titulo"] for l in lotes[14:70]))
except Exception as e:
    import traceback; nota("ERRO " + traceback.format_exc()[-1500:])
