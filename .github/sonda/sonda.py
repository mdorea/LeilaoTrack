"""Sonda temporária: testa se o coletor consegue ler a Biasi Leilões a partir do GitHub."""
import re, requests
B = "https://www.biasileiloes.com.br"
s = requests.Session(); s.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept-Language": "pt-BR,pt;q=0.9"})
r = s.get(B + "/leiloes/santander", timeout=40); print("GET pagina", r.status_code, len(r.text))
m = re.search(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', r.text); tok = m.group(1) if m else ""
print("token", bool(tok))
r2 = s.get(B + "/Sale/LotListSearch", params={"categoria": "", "subcategoria": "", "term": "", "start": 0, "limit": 500, "listaId": "", "slug": "", "buscaImovel": "false", "estado": "", "bairro": "", "cidade": "", "segmento": "", "uf": "", "cid": "", "__RequestVerificationToken": tok}, timeout=60)
print("GET lista", r2.status_code, len(r2.text), re.search(r'total="(\d+)"', r2.text), len(set(re.findall(r"sale/detail\?id=(\d+)", r2.text))))
r3 = s.get(B + "/sale/detail?id=64397", timeout=40); print("GET detalhe", r3.status_code, len(r3.text))
