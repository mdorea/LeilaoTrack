import re
import coletores as c
def nota(t): print("::notice::" + t.replace("\n", " %0A ")[:3800])
SITES = {
 "Sold": "https://www.sold.com.br",
 "Sato": "https://satoleiloes.com.br",
 "Freitas": "https://www.freitasleiloeiro.com.br",
 "Bradesco": "https://vitrinebradesco.com.br",
 "Itau": "https://www.itau.com.br/leiloes-imoveis/",
 "Santander": "https://www.santanderimoveis.com.br",
 "BB": "https://seuimovelbb.com.br",
}
for nome, url in SITES.items():
    http = c.Http(pausa=2.0, timeout=25)
    out = [nome]
    base = re.match(r"https?://[^/]+", url).group(0)
    try:
        r = http.get(base + "/robots.txt")
        dis = [l.strip() for l in r.splitlines() if re.match(r"(?i)(user-agent|disallow|crawl-delay)", l.strip())][:14]
        out.append("ROBOTS " + " | ".join(dis)[:500])
    except Exception as e:
        out.append("ROBOTS erro " + str(e)[:80])
    try:
        h = http.get(url)
        t = c.texto(h)
        out.append(f"HOME {len(h)}B anti-robo={bool(re.search(r'captcha|radware|just a moment|cf-chl|access denied', h, re.I))} imoveis={len(re.findall(r'(?i)im[óo]vel|im[óo]veis', t))} titulo={re.search(r'<title>(.*?)</title>', h, re.S).group(1).strip()[:80] if re.search(r'<title>', h) else ''}")
        links = sorted(set(re.findall(r'href="([^"#]*(?:imove|lote|leilao|detalhe|oferta|venda)[^"#]*)"', h, re.I)))[:12]
        out.append("LINKS " + " ; ".join(links)[:500])
    except c.Bloqueado as e:
        out.append("BLOQUEADO " + str(e))
    except Exception as e:
        out.append("HOME erro " + str(e)[:100])
    nota(" || ".join(out))
