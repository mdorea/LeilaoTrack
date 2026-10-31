import sys, json, time, urllib.request, collections
sys.path.insert(0, ".")
import coletar_nuvem as c
import itbi_sp as I
out = []
c.baixar_anterior("lotes.json", {})
L = (c._SB_ANTERIOR or {}).get("lotes", [])
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": I.UA}), timeout=120).read().decode("utf-8", "replace")
t = time.time()
links = I.links_planilhas(get)
out.append(f"links={len(links)} primeiros={[urllib.request.unquote(u).split('/')[-1] for u in links[:3]]}")
vendas = []
for u in links[:2]:
    dados = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": I.UA}), timeout=300).read()
    open("/tmp/p.xlsx", "wb").write(dados)
    v = I.ler_planilha("/tmp/p.xlsx", meses=18)
    out.append(f"{urllib.request.unquote(u).split('/')[-1]}: {len(dados)//1048576}MB vendas_ok={len(v)}")
    vendas += v
res = I.resumir(vendas)
out.append(f"tempo={time.time()-t:.0f}s vendas={len(vendas)} ruas={len(res['r'])} bairros={len(res['b'])} tamanho_json={len(json.dumps(res))//1024}KB")
cnt = collections.Counter(v[0] for v in vendas); out.append("tipos=" + str(dict(cnt)))
sp = [l for l in L if l.get("uf") == "SP" and I.chave_bairro(l.get("cidade")) == "SAO PAULO" and l.get("tipo") in ("Casa", "Apartamento") and not l.get("encerrado")]
out.append(f"lotes SP capital casa/apto={len(sp)} com area_constr={sum(1 for l in sp if l.get('area_constr'))}")
q = lambda a, p: a[int((len(a)-1)*p)] if a else None
por = collections.defaultdict(list); casados = collections.Counter()
for l in sp:
    e = I.para_lote(l, res)
    if not e: continue
    casados[e["nivel"]] += 1
    if l.get("area_constr") and l.get("referencia") and not c.RUIM_HIST.search(l.get("titulo") or ""):
        por[(l["tipo"], e["nivel"])].append(l["referencia"] / (e["m2"] * l["area_constr"]))
out.append("casados=" + str(dict(casados)))
for k, r in sorted(por.items()):
    r.sort(); w = sum(1 for x in r if .8 <= x <= 1.25)
    out.append(f"{k}: n={len(r)} ref/itbi p10={q(r,.1):.2f} p25={q(r,.25):.2f} p50={q(r,.5):.2f} p75={q(r,.75):.2f} p90={q(r,.9):.2f} dentro±20%={round(100*w/len(r))}%")
# exemplos de não casados (sem dado pessoal: endereço de imóvel em leilão)
nc = [l for l in sp if not I.para_lote(l, res)][:8]
for l in nc: out.append(f"nao_casou: {l['site']} {l['tipo']} end='{(l.get('endereco') or '')[:50]}' bairro='{l.get('bairro')}' → rua='{I.chave_rua(l.get('endereco'))}' b='{I.chave_bairro(l.get('bairro'))}'")
T = " ¦ ".join(out); print(T)
for i in range(0, len(T), 3500): print("::notice title=est::" + T[i:i+3500])
