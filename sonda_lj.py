import re
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
http = c.Http(pausa=2.0, timeout=25)
try:
    B = "https://seuimovelbb.com.br"
    h = http.get(B + "/catalogo/categoria/residenciais")
    t = c.texto(h)
    nota("BB res ids=%d  titulo=%s  tot=%s" % (len(set(re.findall(r"/imovel/id/(\d+)", h))), re.search(r"<title>(.*?)</title>", h, re.S).group(1).strip()[:60], re.findall(r"(\d[\d\.]*)\s+(?:im[óo]veis|resultados|ofertas)", t)[:4]))
    for m in list(re.finditer(r'(?i)(pagina|page|p=|carregar|ver mais|proxim)', h))[:6]:
        nota("BB pag " + re.sub(r"\s+", " ", h[max(0, m.start()-100):m.start()+200]))
    i = h.find("/imovel/id/")
    k = h.find('class="card carta"')
    nota("BB card " + re.sub(r"\s+", " ", h[k:k+2600]))
    for p in ("?p=1", "?pagina=2", "?page=2"):
        try:
            h2 = http.get(B + "/catalogo/categoria/residenciais" + p)
            nota(f"BB {p}: ids={sorted(set(re.findall(r'/imovel/id/(\d+)', h2)))[:4]}")
        except Exception as e:
            nota(f"BB {p} erro {e}")
except Exception as e:
    import traceback; nota("BB ERRO " + traceback.format_exc()[-600:])
try:
    F = "https://www.freitasleiloeiro.com.br"
    for cat in (2, 3):
        h = http.get(f"{F}/Leiloes/Pesquisar?Categoria={cat}")
        t = c.texto(h)
        k = t.find("Refine sua busca")
        nota(f"FR cat{cat} {re.search(r'<title>(.*?)</title>', h, re.S).group(1).strip()[:70]} ids={len(set(re.findall(r'/Leiloes/(?:Lote|Detalhe)[^\"]*', h)))} | " + t[k:k+500])
        nota(f"FR cat{cat} links " + " ; ".join(sorted(set(re.findall(r'href="(/[^"#]{6,100})"', h)))[:25]))
except Exception as e:
    import traceback; nota("FR ERRO " + traceback.format_exc()[-600:])
