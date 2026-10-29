# -*- coding: utf-8 -*-
"""Gera site/novo/js/config.js com o endereço do Supabase e a chave PÚBLICA (anon/publishable).
Recusa a chave secreta (service_role / sb_secret_), para ela nunca ir parar no site."""
import base64
import json
import os
import re
import sys

url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
chave = os.environ.get("SUPABASE_ANON_KEY", "").strip()
destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site", "novo", "js", "config.js")


def papel_jwt(k):
    try:
        meio = k.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(meio + "=" * (-len(meio) % 4))).get("role", "")
    except Exception:
        return ""


ok = bool(re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co", url)) and len(chave) > 30
if chave.startswith("sb_secret_") or papel_jwt(chave) == "service_role":
    sys.exit("ERRO: SUPABASE_ANON_KEY recebeu a chave SECRETA. Use a chave pública (anon ou publishable).")
if not re.fullmatch(r"[A-Za-z0-9._-]+", chave or "-"):
    ok = False
conteudo = ("/* gerado automaticamente na publicação */\n"
            f"window.LT_CONFIG = {{url: {json.dumps(url if ok else '')}, chave: {json.dumps(chave if ok else '')}}};\n")
with open(destino, "w", encoding="utf-8") as f:
    f.write(conteudo)
# a política de segurança do site passa a aceitar só ESTE projeto do Supabase (não qualquer *.supabase.co)
if ok:
    pagina = os.path.join(os.path.dirname(destino), "..", "index.html")
    with open(pagina, encoding="utf-8") as f:
        h = f.read()
    with open(pagina, "w", encoding="utf-8") as f:
        f.write(h.replace("connect-src 'self' https://*.supabase.co", f"connect-src 'self' {url}"))
print("config do app novo:", "pronta" if ok else "ainda sem Supabase (o site mostra 'em configuração')")
