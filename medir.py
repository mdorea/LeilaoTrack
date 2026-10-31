import sys, json, re
sys.path.insert(0, ".")
import coletar_nuvem as c, coletores as K
c.baixar_anterior("lotes.json", {})
L = (c._SB_ANTERIOR or {}).get("lotes", [])
http = K.Http(pausa=2)
out = []
def trecho(t, pad, n=4, larg=110):
    return [t[max(0, m.start()-40):m.start()+larg].replace("\n", " ") for m in re.finditer(pad, t, re.I)][:n]
for site in ["Mega", "Frazão", "Zuk", "Biasi"]:
    ls = [l for l in L if l["site"] == site and not l.get("encerrado") and l.get("ativo") and (l.get("lances") or 0) > 0][:1] or \
         [l for l in L if l["site"] == site and not l.get("encerrado") and l.get("ativo")][:1]
    for l in ls:
        try:
            h = http.get(l["url"])
        except Exception as e:
            out.append(f"{site} ERRO {e}"); continue
        t = K.texto(h)
        out.append(f"{site} lances={l.get('lances')} valor={l.get('valor')} DETALHE: " + " || ".join(trecho(t, r"[úu]ltimo lance|lance atual|maior lance|lance vencedor|valor atual")))
        out.append(f"{site} HTML: " + " || ".join(trecho(h, r"[úu]ltimo lance|lance atual|maior lance|lance vencedor|valor atual|current.?bid|last.?bid", 4, 300)))
# card da lista da Mega
h = http.get(K.MEGA + "/imoveis?pagina=1")
blocos = K._blocos(h, '<div class="card ')
com = [b for b in blocos if re.search(r"lance", b, re.I)][:1]
out.append("MEGA CARD: " + (re.sub(r"\s+", " ", com[0])[:1500] if com else "sem"))
T = " ¦ ".join(out); print(T)
for i in range(0, len(T), 3500): print("::notice title=est::" + T[i:i+3500])
