import json, collections
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
logs = []
try:
    lotes, ok = c.coletar_freitas(c.Http(pausa=2.0), logs.append, anteriores={})
    nota(f"TOTAL {len(lotes)} ok={ok} | " + " | ".join(logs) + " | " + str(dict(collections.Counter(l["tipo"] for l in lotes))))
    nota("SEM rua=%d bairro=%d cidade=%d uf=%d imagem=%d encerra=%d 2pracas=%d area=%d" % tuple(
        [sum(not l[k] for l in lotes) for k in ("endereco","bairro","cidade","uf","imagem")] + [sum(not l["encerra"] for l in lotes), sum(len(l["pracas"]) > 1 for l in lotes), sum(bool(l.get("area")) for l in lotes)]))
    nota("TITULOS " + " || ".join(f'{l["titulo"]} [{l["valor"]}, {l["desconto"]}%, {l["encerra"]}, {l["ocupacao"]}]' for l in lotes[:25]))
    nota("TITULOS2 " + " || ".join(l["titulo"] for l in lotes[25:80]))
except Exception as e:
    import traceback; nota("ERRO " + traceback.format_exc()[-1200:])
