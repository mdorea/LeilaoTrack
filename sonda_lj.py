import sys, json, os, collections
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3500])
log = lambda m: nota("LOG " + m)
try:
    http = c.Http(pausa=2.5)
    lotes, ok = c.coletar_lancejudicial(http, log, anteriores={})
    nota(f"TOTAL {len(lotes)} ok={ok}")
    cont = collections.Counter((l["tipo"], l["uf"]) for l in lotes)
    nota("TIPO/UF " + str(dict(cont)))
    nota("SEM rua=%d sem imagem=%d sem bairro=%d sem valor=%d 2pracas=%d" % (
        sum(not l["endereco"] for l in lotes), sum(not l["imagem"] for l in lotes),
        sum(not l["bairro"] for l in lotes), sum(not l["valor"] for l in lotes), sum(len(l["pracas"]) > 1 for l in lotes)))
    for l in lotes[:6] + lotes[-4:]:
        nota(json.dumps({k: l.get(k) for k in ("id","titulo","tipo","bairro","cidade","uf","endereco","valor","referencia","desconto","praca_atual","encerra","comitente","ocupacao","area_constr","area_terreno","imagem")}, ensure_ascii=False))
except Exception as e:
    import traceback; nota("ERRO " + traceback.format_exc()[-1500:])
