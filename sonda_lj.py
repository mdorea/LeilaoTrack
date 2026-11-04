import re
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
http = c.Http(pausa=2.0, timeout=25)
B = "https://seuimovelbb.com.br"
try:
    j = http.get(B + "/js/catalogo_vs_5.js")
    i = j.find("$.post('/catalogo', {pagina")
    nota("BB codigo " + re.sub(r"\s+", " ", j[max(0, i-500):i+1500]))
    h = http.get(B + "/catalogo/categoria/residenciais")
    nota("BB cppnp/vars " + " | ".join(re.sub(r"\s+", " ", m)[:160] for m in re.findall(r"(?:id=\"_cppnp\"[^>]*>[^<]{0,80}|var\s+_(?:pagina|categorias|tipoVenda|contento)[^;]{0,80};)", h)[:8]))
except Exception as e:
    import traceback; nota("BB ERRO " + traceback.format_exc()[-400:])
F = "https://www.freitasleiloeiro.com.br"
try:
    j = http.get(F + "/js/site.js")
    i = j.find("function pesquisarLotes")
    nota("FR codigo " + re.sub(r"\s+", " ", j[i:i+2400]))
except Exception as e:
    nota("FR ERRO " + str(e)[:200])
