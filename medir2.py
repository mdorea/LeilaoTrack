import json, re, sys
sys.path.insert(0, ".")
import coletores as c
L = json.load(open("/tmp/l.json"))
http = c.Http(pausa=2)
out = []
def amostra(site, tipo, n):
    ls = [l for l in L if l["site"] == site and l["tipo"] == tipo and not l.get("encerrado") and l.get("url")][:n]
    for l in ls:
        try:
            h = http.get(l["url"])
        except Exception as e:
            out.append(f"{site} ERRO {e}"); continue
        t = c.texto(h)
        hits = []
        for m in re.finditer(r"[ÁáAa]rea[^\n]{0,70}?m(?:²|2)", t):
            hits.append(m.group(0)[:90])
        hits2 = [m.group(0)[:100] for m in re.finditer(r".{0,40}(constru[íi]d|terreno|privativ|[úu]til)[^.]{0,50}", t, re.I)][:8]
        out.append(f"{site} {tipo} area={l.get('area')} tit={l['titulo'][:50]} :: AREAS={hits[:8]} :: KW={hits2}")
amostra("Mega", "Casa", 3); amostra("Mega", "Apartamento", 1)
amostra("Frazão", "Casa", 3); amostra("Frazão", "Apartamento", 2)
amostra("Zuk", "Casa", 1); amostra("Zuk", "Apartamento", 2)
amostra("Biasi", "Casa", 2)
T = " ¦ ".join(out)
print(T.replace(" ¦ ", "\n"))
for i in range(0, len(T), 3500): print("::notice title=est::" + T[i:i+3500])
