import sys, json, collections
sys.path.insert(0, ".")
import coletar_nuvem as c
c.baixar_anterior("lotes.json", {})
P = c._SB_ANTERIOR or {}
L = [l for l in P.get("lotes", []) if l.get("ativo") and not l.get("encerrado")]
out = [f"estado.itbi_sp={P.get('estado', {}).get('itbi_sp')}", f"historico={len(P.get('historico', []))}"]
com = [l for l in L if (l.get("lances") or 0) > 0]
la = [l for l in com if l.get("lance_atual")]
out.append(f"com lances={len(com)} com lance_atual={len(la)} por site={dict(collections.Counter(l['site'] for l in la))} de={dict(collections.Counter(l['site'] for l in com))}")
acima = [l for l in la if l["lance_atual"] > (l.get("valor") or 0) * 1.001]
out.append(f"lance acima do mínimo={len(acima)}")
for l in acima[:4]: out.append(f"  {l['site']} {l['titulo'][:45]} min={l['valor']} lance={l['lance_atual']} inc={l.get('lance_inc')} lances={l['lances']}")
j = [l for l in L if "Ruy Barbosa" in (l.get("titulo") or "") and "Jundia" in (l.get("titulo") or "")]
for l in j: out.append(f"JUNDIAI: min={l.get('valor')} lance={l.get('lance_atual')} inc={l.get('lance_inc')} lances={l.get('lances')} praca={l.get('praca_atual')}")
it = [l for l in L if l.get("itbi")]
out.append(f"lotes com itbi={len(it)} niveis={dict(collections.Counter(l['itbi']['nivel'] for l in it))}")
ac = collections.Counter((l['site'], bool(l.get('area_constr'))) for l in L if l.get('tipo') in ('Casa','Apartamento'))
out.append("area_constr=" + str(dict(ac)))
T = " ¦ ".join(out); print(T)
for i in range(0, len(T), 3000): print("::notice title=est::" + T[i:i+3000])
