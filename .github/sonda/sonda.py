"""Sonda temporária: baixa páginas do Portal Bayit para estudar a estrutura."""
import os, re, sys, urllib.request
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
os.makedirs("saida", exist_ok=True)
urls = sys.argv[1:]
for i, u in enumerate(urls):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": UA, "Accept-Language": "pt-BR"}), timeout=40)
        b = r.read(); st = r.status; fin = r.geturl(); ct = r.headers.get("content-type")
    except Exception as e:
        print(f"### {u} ERRO {e}"); continue
    open(f"saida/p{i}.html", "wb").write(b)
    h = b.decode("utf-8", "replace")
    print(f"### {u} -> {st} {fin} {ct} {len(b)} bytes")
    links = sorted(set(re.findall(r'href="([^"]+)"', h)))
    print("LINKS:", [l for l in links if "bayit" in l or l.startswith("/")][:150])
    print("SCRIPTS:", re.findall(r'<script[^>]+src="([^"]+)"', h)[:40])
    import base64, zlib
    print("HTMLZ:" + base64.b64encode(zlib.compress(b, 9)).decode())
    print("API:", sorted(set(re.findall(r'["\'](/?(?:api|ajax|wp-json)[^"\']{0,80})["\']', h)))[:40])
