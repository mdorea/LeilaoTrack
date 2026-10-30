"""Sonda temporária: testa acesso ao Seu Imóvel BB a partir do GitHub."""
import re, requests
s = requests.Session(); s.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "Accept-Language": "pt-BR,pt;q=0.9", "Accept": "text/html,*/*"})
for u in ["https://www.seuimovelbb.com.br/", "https://www.seuimovelbb.com.br/catalogo/categoria/urbanos", "https://www.seuimovelbb.com.br/imovel/id/12386"]:
    try:
        r = s.get(u, timeout=60)
        print("###", u, r.status_code, len(r.text), "CHALLENGE" if "Just a moment" in r.text or "cf_chl" in r.text else "", len(set(re.findall(r"/imovel/id/\d+", r.text))))
        print(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", r.text))[:600])
    except Exception as e:
        print("###", u, "ERRO", e)
