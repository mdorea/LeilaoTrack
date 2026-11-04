import re
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
http = c.Http(pausa=2.0, timeout=25)
B = "https://seuimovelbb.com.br"
try:
    h = http.get(B + "/catalogo/categoria/residenciais")
    js = sorted(set(re.findall(r'src="([^"]+\.js[^"]*)"', h)))
    nota("BB js " + " ; ".join(js)[:600])
    inline = " ".join(re.findall(r"<script(?![^>]*src)[^>]*>(.*?)</script>", h, re.S))
    ap = sorted(set(re.findall(r"""['"`](/(?:api|ajax|catalogo|busca|imovel)[^'"`\s]{0,80})['"`]""", inline)))
    nota("BB inline endpoints " + " ; ".join(ap)[:700])
    for u in js:
        if "google" in u or "bootstrap" in u or "jquery" in u:
            continue
        uu = u if u.startswith("http") else B + u
        if not uu.startswith(B):
            continue
        j = http.get(uu)
        ap = sorted(set(re.findall(r"""['"`]((?:/|https?://)[^'"`\s]{0,90}(?:api|ajax|listar|buscar|catalogo|pesquisa|imoveis)[^'"`\s]{0,60})['"`]""", j, re.I)))
        nota(f"BB {u} {len(j)}B endpoints: " + " ; ".join(ap)[:900])
except Exception as e:
    import traceback; nota("BB ERRO " + traceback.format_exc()[-500:])
F = "https://www.freitasleiloeiro.com.br"
for cat in (2, 3):
    try:
        h = http.get(f"{F}/Leiloes/Pesquisar?Categoria={cat}")
        t = c.texto(h)
        k = t.find("Refine sua busca")
        nota(f"FR cat{cat} " + re.search(r"<title>(.*?)</title>", h, re.S).group(1).strip()[:60] + " | " + t[k:k+260] + " | links " + " ; ".join(sorted(set(re.findall(r'href="(/[Ll]eiloes/[^"#]{4,100})"', h)))[:6]))
    except Exception as e:
        nota(f"FR cat{cat} erro {e}")
