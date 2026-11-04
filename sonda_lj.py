import re, json
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
http = c.Http(pausa=2.0, timeout=25)
B = "https://seuimovelbb.com.br"
try:
    h = http.get(B + "/catalogo")
    tok = re.search(r'id="_cppnp"[^>]*>([^<]+)<', h).group(1).strip()
    nota("BB vars " + " | ".join(re.sub(r"\s+", " ", m)[:90] for m in re.findall(r"var\s+_(?:pagina|categorias|tipoVenda|tipoPagamento|evolua|localidade|minimo|maximo|texto|ordem|contento)\s*=[^;]*;", http.get(B + "/js/catalogo_vs_5.js") + h)[:14]))
    base = {"pagina": 1, "categorias": "", "tipoVenda": "", "tipoPagamento": "", "evolua": "", "localidade": "", "minimo": "", "maximo": "", "texto": "", "ordem": 0, "contento": 50, "cppnp": tok}
    r = http.post(B + "/catalogo", base, {"X-Requested-With": "XMLHttpRequest", "Referer": B + "/catalogo"})
    o = json.loads(r)
    nota("BB resp keys=%s imoveis=%s ids=%d pag=%s" % (list(o), o.get("imoveis"), len(set(re.findall(r"/imovel/id/(\d+)", o.get("lista", "")))), c.texto(o.get("paginacao", ""))[:120]))
    L = o.get("lista", "")
    k = L.find('class="card carta"')
    nota("BB card " + re.sub(r"\s+", " ", L[k:k+2600]))
except Exception as e:
    import traceback; nota("BB ERRO " + traceback.format_exc()[-500:])
F = "https://www.freitasleiloeiro.com.br"
try:
    h = http.get(f"{F}/Leiloes/Pesquisar?Categoria=2")
    inl = "\n".join(re.findall(r"<script(?![^>]*src)[^>]*>(.*?)</script>", h, re.S))
    i = inl.find("PesquisarLotes")
    nota("FR inline " + re.sub(r"\s+", " ", inl[max(0, i-1200):i+1500]))
    j = http.get(F + "/js/site.js")
    i = j.find("PesquisarLotes")
    nota("FR sitejs %dB " % len(j) + re.sub(r"\s+", " ", j[max(0, i-800):i+1200]))
except Exception as e:
    import traceback; nota("FR ERRO " + traceback.format_exc()[-400:])
