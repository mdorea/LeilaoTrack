"""Sonda temporária: testa se o coletor consegue ler o Portal Bayit a partir do GitHub."""
import json, re
B = "https://www.portalbayit.com.br/"
def teste(nome, s):
    try:
        r = s.get(B + "busca/", timeout=40)
        print(nome, "GET busca", r.status_code, len(r.text), "cf" if "challenge" in r.text[:5000] else "")
        m = re.search(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', r.text)
        tok = m.group(1) if m else ""
        corpo = {"RangeValores":0,"Scopo":1,"IgnoreScopo":0,"OrientacaoBusca":0,"Busca":"","ID_Categoria":56,"ID_Estado":0,"ID_Cidade":0,"Bairro":"","ID_Regiao":0,"ValorMinSelecionado":0,"ValorMaxSelecionado":0,"CFGs":"","sInL":"","Pagina":1,"Ordem":0,"OrdSt":0,"QtdPorPagina":500,"Mapa":"","SubStatus":[],"ID_Leiloes_Status":[],"BuscaProcesso":"","NomesPartes":"","CodLeilao":"","TiposLeiloes":[],"PaginaIndex":1,"PracaAtual":0,"DataAbertura":"","DataEncerramento":""}
        r2 = s.post(B + "ApiEngine/GetBusca/1/1/0", data=json.dumps(corpo), headers={"Content-Type": "application/json; charset=utf-8", "__RVT": tok, "Referer": B + "busca/"}, timeout=40)
        print(nome, "POST GetBusca", r2.status_code, r2.text[:160].replace("\n", " "))
    except Exception as e:
        print(nome, "ERRO", e)
import requests
s = requests.Session(); s.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept-Language": "pt-BR,pt;q=0.9", "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"})
teste("requests", s)
try:
    from curl_cffi import requests as cr
    for imp in ("chrome", "safari", "firefox"):
        teste("curl_cffi-" + imp, cr.Session(impersonate=imp))
except Exception as e:
    print("curl_cffi indisponível", e)
