import os, re, json, gzip, sys, collections
sys.path.insert(0, ".")
import coletar_nuvem as c
d = c.baixar_anterior("lotes.json", {})
L = [l for l in d.get("lotes", []) if not l.get("encerrado")]
def tem(l, k): return bool(l.get(k))
def av(l):
    p = [x.get("valor") for x in l.get("pracas", []) if x.get("valor")]
    return max(p) if p else None
out = []
out.append(f"ativos={len(L)}")
por = collections.defaultdict(list)
for l in L: por[l.get("site")].append(l)
rua = re.compile(r"\b(rua|r\.|av\.?|avenida|alameda|travessa|estrada|rodovia|rod\.|pra[cç]a|quadra|qd|lote)\b", re.I)
def num(e): return bool(re.search(r"\d", e or ""))
for s, ls in [("TOTAL", L)] + sorted(por.items()):
    n = len(ls)
    e = sum(1 for l in ls if tem(l, "endereco"))
    er = sum(1 for l in ls if rua.search(l.get("endereco") or "") and num(l.get("endereco")))
    b = sum(1 for l in ls if tem(l, "bairro"))
    a = sum(1 for l in ls if l.get("area"))
    v = sum(1 for l in ls if av(l))
    t = collections.Counter((l.get("tipo") or "?") for l in ls)
    ok = sum(1 for l in ls if l.get("area") and av(l) and l.get("cidade") and (l.get("bairro") or rua.search(l.get("endereco") or "")))
    out.append(f"{s}: n={n} endereco={e} rua+num={er} bairro={b} area={a} valor_ref={v} utilizaveis={ok}")
tipos = collections.Counter((l.get("tipo") or "?") for l in L)
out.append("tipos=" + json.dumps(tipos.most_common(12), ensure_ascii=False))
# bairros com >=3 comparaveis (area+valor, mesmo tipo)
g = collections.Counter((l.get("cidade"), l.get("uf"), l.get("bairro"), l.get("tipo")) for l in L if l.get("area") and av(l) and l.get("bairro"))
out.append(f"grupos_bairro_tipo>=3={sum(1 for v in g.values() if v>=3)} lotes_neles={sum(v for v in g.values() if v>=3)}")
gc = collections.Counter((l.get("cidade"), l.get("uf"), l.get("tipo")) for l in L if l.get("area") and av(l))
out.append(f"grupos_cidade_tipo>=5={sum(1 for v in gc.values() if v>=5)} lotes_neles={sum(v for v in gc.values() if v>=5)}")
# amostra de formato de endereco (3 por site, sem dado pessoal: endereco de imovel)
for s, ls in sorted(por.items()):
    ex = [l.get("endereco") for l in ls if l.get("endereco")][:2]
    out.append(f"ex {s}: " + " || ".join(str(x)[:90] for x in ex))
txt = "\n".join(out)
print(txt)
for linha in out: print("::notice title=medicao::" + linha)
