import re
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
try:
    http = c.Http(pausa=2.0, timeout=25)
    B = "https://seuimovelbb.com.br"
    h = http.get(B)
    cat = sorted(set(re.findall(r'href="(/catalogo[^"]*)"', h)))[:15]
    nota("BB catalogo " + " ; ".join(cat))
    i = h.find("/imovel/id/10470")
    nota("BB card " + re.sub(r"\s+", " ", h[max(0, i-700):i+900]))
    d = http.get(B + "/imovel/id/10470")
    t = c.texto(d)
    nota("BB detalhe " + t[:2200])
    pg = re.findall(r'(?:pagina|page|p)=\d+', h)[:6]
    nota("BB paginacao " + str(pg) + " total_ids=" + str(len(set(re.findall(r"/imovel/id/(\d+)", h)))))
except Exception as e:
    import traceback; nota("BB ERRO " + traceback.format_exc()[-800:])
try:
    F = "https://www.freitasleiloeiro.com.br"
    h = http.get(F + "/Leiloes/Pesquisar?Categoria=1&TipoLoteId=1")
    t = c.texto(h)
    nota("FR lista %dB " % len(h) + t[:1500])
    nota("FR links " + " ; ".join(sorted(set(re.findall(r'href="(/[^"#]*(?:Lote|lote|Detalhe)[^"#]*)"', h)))[:10]))
    h0 = http.get(F)
    nota("FR menu " + " ; ".join(sorted(set(re.findall(r'href="(/Leiloes/Pesquisar[^"]*)"[^>]*>([^<]{0,40})', h0)))[:0] or [f"{a}={b.strip()}" for a, b in re.findall(r'href="(/Leiloes/Pesquisar[^"]*)"[^>]*>\s*([^<]{0,40})', h0)][:12]))
except Exception as e:
    import traceback; nota("FR ERRO " + traceback.format_exc()[-800:])
try:
    S = "https://satoleiloes.com.br"
    h = http.get(S)
    nota("SATO links " + " ; ".join(sorted(set(re.findall(r'href="([^"#]{4,90})"', h)))[:40]))
except Exception as e:
    nota("SATO ERRO " + str(e)[:200])
