import sys, re, os
sys.path.insert(0, ".")
import coletores
h = coletores.Http(pausa=2.5, timeout=30)
os.makedirs("saida", exist_ok=True)
B = "https://www.lancejudicial.com.br"
for cat in ("casas", "apartamentos"):
    t = h.get(f"{B}/imoveis/{cat}")
    open(f"saida/lista_{cat}.html", "w", encoding="utf-8").write(t)
    lots = list(dict.fromkeys(re.findall(r'href="(https://www\.(?:lancejudicial|grupolance)\.com\.br/[a-z]{2}/[^"/]+/imoveis/%s/[^"?#]+)"' % cat, t)))
    for k, u in enumerate(lots[1:6]):
        open(f"saida/{cat}_{k}.html", "w", encoding="utf-8").write(h.get(u))
        open(f"saida/{cat}_{k}.url", "w").write(u)
print("salvo", os.listdir("saida"))
