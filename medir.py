import sys, json
sys.path.insert(0, ".")
import coletar_nuvem as c
d = c.baixar_anterior("lotes.json", {})
json.dump(d.get("lotes", []), open("/tmp/l.json", "w"))
