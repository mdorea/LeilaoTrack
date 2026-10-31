import sys, json
sys.path.insert(0, ".")
import coletar_nuvem as c
c.baixar_anterior("lotes.json", {})
d = c._SB_ANTERIOR or {}
json.dump({"lotes": d.get("lotes", []), "historico": d.get("historico", [])}, open("/tmp/l.json", "w"))
