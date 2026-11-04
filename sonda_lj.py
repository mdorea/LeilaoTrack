import re, json
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
http = c.Http(pausa=2.0, timeout=25)
F = "https://www.freitasleiloeiro.com.br"
H = {"X-Requested-With": "XMLHttpRequest", "Referer": F + "/Leiloes/Pesquisar?Categoria=2"}
tot = 0; links = []
try:
    for p in range(1, 40):
        r = http.get(F + f"/Leiloes/PesquisarLotes?Categoria=2&TipoLoteId=0&PageNumber={p}&TopRows=12&ClienteSclId=0", H)
        if "Nenhum lote localizado" in r:
            nota(f"FR fim na pagina {p}"); break
        ls = re.findall(r'href="(/Leiloes/LoteDetalhes\?leilaoId=\d+&(?:amp;)?loteNumero=\d+)"', r)
        novos = [x for x in dict.fromkeys(ls) if x not in links]
        links += novos
        if not novos:
            nota(f"FR sem novos na pagina {p}"); break
    nota(f"FR total lotes={len(links)} 1o={links[:2]}")
    for u in (links[0], links[len(links)//2]):
        d = http.get(F + u.replace("&amp;", "&"))
        t = c.texto(d)
        k = t.find("Descrição")
        nota("FR detalhe " + u + " :: " + t[k:k+1500] if k >= 0 else "FR detalhe sem Descrição :: " + t[:1500])
    r = http.get(F + "/Leiloes/PesquisarLotes?Categoria=2&TipoLoteId=0&PageNumber=1&TopRows=12&ClienteSclId=0", H)
    b = r.split('class="cardlote"')[1:3]
    nota("FR card html " + re.sub(r"\s+", " ", b[1][:3000]))
except Exception as e:
    import traceback; nota("FR ERRO " + traceback.format_exc()[-500:])
