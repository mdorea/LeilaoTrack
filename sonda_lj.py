import re, json
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
http = c.Http(pausa=2.0, timeout=25)
B = "https://seuimovelbb.com.br"
try:
    h = http.get(B + "/catalogo")
    tok = re.search(r'id="_cppnp"[^>]*>([^<]+)<', h).group(1).strip()
    base = {"pagina": 1, "categorias": "", "tipoVenda": "", "tipoPagamento": "", "evolua": "", "localidade": "", "minimo": "", "maximo": "", "texto": "", "ordem": 0, "contento": 50, "cppnp": tok}
    o = json.loads(http.post(B + "/catalogo", base, {"X-Requested-With": "XMLHttpRequest", "Referer": B + "/catalogo"}))
    cards = o["lista"].split('class="card carta"')[1:]
    for k in (0, 2):
        nota(f"BB card{k} texto " + c.texto(cards[k])[:500])
    k = cards[2].find('class="localidade"')
    nota("BB card2 html fim " + re.sub(r"\s+", " ", cards[2][k-200:k+1300]))
    tipos = {}
    for cd in cards:
        m = re.search(r'class="tipo"><i[^>]*></i>\s*([^<]+)', cd)
        tipos[m.group(1).strip() if m else "?"] = tipos.get(m.group(1).strip() if m else "?", 0) + 1
    nota("BB tipos pag1 " + str(tipos))
    d = http.get(B + "/imovel/id/12772")
    t = c.texto(d)
    i = t.find("Compartilhar")
    nota("BB det12772 " + t[i:i+900] + " ... FIM: " + t[-600:])
    nota("BB img " + " ; ".join(sorted(set(re.findall(r'(/imagem/imovel/12772_\d+\.jpg)', d)))[:3]) + " fotos_og=" + str(re.findall(r'og:image" content="([^"]+)', d)[:1]))
except Exception as e:
    import traceback; nota("BB ERRO " + traceback.format_exc()[-500:])
F = "https://www.freitasleiloeiro.com.br"
try:
    h = http.get(f"{F}/Leiloes/Pesquisar?Categoria=2")
    inl = "\n".join(re.findall(r"<script(?![^>]*src)[^>]*>(.*?)</script>", h, re.S))
    i = inl.find("var pesquisa")
    nota("FR obj " + re.sub(r"\s+", " ", inl[i:i+700]))
    r = http.get(F + "/Leiloes/PesquisarLotes?Categoria=2&TipoLoteId=0&PageNumber=1&TopRows=12&ClienteSclId=0", {"X-Requested-With": "XMLHttpRequest", "Referer": F + "/Leiloes/Pesquisar?Categoria=2"})
    nota("FR resp %dB cards=%d " % (len(r), r.count('class="card')) + re.sub(r"\s+", " ", r[:1800]))
    nota("FR texto " + c.texto(r)[:900])
except Exception as e:
    import traceback; nota("FR ERRO " + traceback.format_exc()[-500:])
