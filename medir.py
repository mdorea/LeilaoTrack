import sys, json, re, urllib.parse
sys.path.insert(0, ".")
import coletores as K
http = K.Http(pausa=1.5)
out = []
# Mega: card-price x valor da praça, para cards com lances
dif = 0; tot = 0; ex = []
for p in range(1, 6):
    h = http.get(f"{K.MEGA}/imoveis?pagina={p}")
    for b in K._blocos(h, '<div class="card '):
        cp = re.search(r'card-price">([^<]*)<', b); vb = re.search(r'card-views-bids[^"]*">(.*?)</div>', b, re.S)
        nums = re.findall(r"\b(\d+)\b", K.texto(vb.group(1))) if vb else []
        ls = K.mega_parse('<div class="card ' + b)
        if not cp or not ls: continue
        l = ls[0]; preco = K.dinheiro(cp.group(1)); lan = int(nums[1]) if len(nums) > 1 else 0
        if lan > 0:
            tot += 1
            if preco != l["valor"]: dif += 1
            if len(ex) < 6: ex.append(f"{l['id']} lances={lan} card-price={preco} praça_atual={l['valor']} pracas={[p['valor'] for p in l['pracas']]}")
out.append(f"MEGA com lances={tot} card-price≠praça={dif}")
out += ["  " + e for e in ex]
# Frazão: procurar 'value_bid' ou 'Maior lance' na lista
ids = re.findall(r"/leilao/(\d+)/", http.get(K.FRAZAO + "/Home/Calendario"))[:3]
for bid in ids:
    q = urllib.parse.urlencode({"bid": bid, "categoria": "", "subcategoria": "", "uf": "", "cidade": "", "bairro": "", "tipoimovel": "", "subtipoImovel": "", "area": "", "preco": "", "term": "", "start": 0, "limit": 36, "page": 1, "vendaDireta": "false", "FilterByNumber": "true"})
    h = http.get(f"{K.FRAZAO}/Sale/SearchLotResult?{q}", {"X-Requested-With": "XMLHttpRequest", "Referer": f"{K.FRAZAO}/leilao/{bid}/"})
    for b in K._blocos(h, "thumbnail-vitrine-lot")[:40]:
        st = re.search(r'stats-tag">(.*?)</div>', b, re.S)
        nums = re.findall(r"\b(\d+)\b", K.texto(st.group(1))) if st else []
        if len(nums) > 1 and int(nums[1]) > 0:
            t = K.texto(b)
            out.append("FRAZAO LISTA lote c/ lance: " + t[:600])
            break
    else:
        continue
    break
# Zuk e Biasi: página de um lote qualquer, trechos com 'lance'
for nome, url in (("ZUK", K.ZUK if hasattr(K, "ZUK") else ""), ("BIASI", K.BIASI)):
    pass
T = " ¦ ".join(out); print(T)
for i in range(0, len(T), 3000): print("::notice title=est::" + T[i:i+3000])
