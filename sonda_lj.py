import re
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
http = c.Http(pausa=2.0, timeout=25)
B = "https://seuimovelbb.com.br"
try:
    h = http.get(B + "/catalogo/categoria/residenciais")
    js = [u for u in re.findall(r'src="([^"]+\.js[^"]*)"', h) if not u.startswith("http")]
    nota("BB js proprios " + " ; ".join(js))
    for u in js[:3]:
        j = http.get(B + "/" + u.lstrip("/"))
        ap = sorted(set(re.findall(r"""['"`]([^'"`\s]{0,70}(?:api|ajax|listar|buscar|catalogo|pesquisa|filtro|imoveis|paginacao)[^'"`\s]{0,60})['"`]""", j, re.I)))
        nota(f"BB {u} {len(j)}B: " + " ; ".join(ap)[:1200])
        for m in list(re.finditer(r"(\$\.(?:get|post|ajax|getJSON)|fetch)\(", j))[:4]:
            nota("BB chamada " + re.sub(r"\s+", " ", j[m.start():m.start()+260]))
except Exception as e:
    import traceback; nota("BB ERRO " + traceback.format_exc()[-400:])
F = "https://www.freitasleiloeiro.com.br"
try:
    h = http.get(f"{F}/Leiloes/Pesquisar?Categoria=2")
    k = h.find("IMÓVEIS EM LEILÃO")
    nota("FR corpo " + re.sub(r"\s+", " ", h[k:k+2200]))
    i = h.lower().find("carregar mais")
    nota("FR carregar " + re.sub(r"\s+", " ", h[max(0, i-300):i+300]))
    js = [u for u in re.findall(r'src="([^"]+\.js[^"]*)"', h) if "freitas" in u or not u.startswith("http")]
    inl = " ".join(re.findall(r"<script(?![^>]*src)[^>]*>(.*?)</script>", h, re.S))
    nota("FR ajax " + " ; ".join(sorted(set(re.findall(r"""['"`](/[A-Za-z]+/[A-Za-z/]*(?:Carregar|Lotes|Buscar|Pesquisar|Mais)[^'"`\s]{0,80})['"`]""", inl + h)))[:8]) + " js=" + " ; ".join(js)[:300])
except Exception as e:
    import traceback; nota("FR ERRO " + traceback.format_exc()[-400:])
