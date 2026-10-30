"""Sonda temporária: testa acesso às listas públicas de imóveis da Caixa a partir do GitHub."""
import requests, io
s = requests.Session(); s.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept-Language": "pt-BR,pt;q=0.9"})
for u in ["https://venda-imoveis.caixa.gov.br/sistema/download-lista.asp",
          "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_SP.csv",
          "https://venda-imoveis.caixa.gov.br/listaweb/Lista_imoveis_geral.csv"]:
    try:
        r = s.get(u, timeout=60)
        b = r.content
        print("###", u, r.status_code, r.headers.get("content-type"), len(b))
        try: t = b.decode("latin-1")
        except Exception: t = str(b[:500])
        print(t[:1500].replace("\r", ""))
        if u.endswith(".csv"): print("LINHAS", t.count("\n"))
    except Exception as e:
        print("###", u, "ERRO", e)
