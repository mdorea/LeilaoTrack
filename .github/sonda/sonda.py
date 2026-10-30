"""Sonda temporária: roda só o coletor da Biasi e grava o resultado."""
import json, sys, time
sys.path.insert(0, ".")
import coletores
coletores.BIASI_DETALHES_POR_LEITURA = 25
ini = time.time()
http = coletores.Http(pausa=1.5)
lotes, ok = coletores.coletar_biasi(http, print)
print("ok", ok, "lotes", len(lotes), "segundos", round(time.time() - ini))
json.dump(lotes, open("saida/biasi.json", "w"), ensure_ascii=False, indent=1)
# segunda passada usando o cache (deve pedir só os que faltam)
coletores.BIASI_DETALHES_POR_LEITURA = 5
l2, ok2 = coletores.coletar_biasi(http, print, anteriores={l["id"]: l for l in lotes})
print("segunda passada", ok2, len(l2), sum(1 for l in l2 if l.get("_det")))
