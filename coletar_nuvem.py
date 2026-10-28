# -*- coding: utf-8 -*-
"""LeilãoTrack — coleta na nuvem (GitHub Actions).

A cada execução: baixa os dados publicados da última vez, lê os sites,
registra o que mudou e grava a pasta `site/dados/` para ser publicada.
Só usa a biblioteca padrão do Python.
"""
import os
import sys
import json
import time
import base64
import gzip
import hashlib
import traceback
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import coletores  # noqa: E402

BR = timezone(timedelta(hours=-3))
AGORA = datetime.now(BR).replace(tzinfo=None)
AGORA_S = AGORA.strftime("%Y-%m-%dT%H:%M:%S")
SAIDA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site", "dados")
os.makedirs(SAIDA, exist_ok=True)
URL_PUBLICADA = os.environ.get("URL_PUBLICADA", "").rstrip("/")
CFG_ARQ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
CFG = {"incluir_veiculos": False, "zuk_intervalo_minutos": 120,
       "alerta": {"tipos": [], "cidades": [], "ufs": [], "valor_max": 0, "desconto_min": 0}}
if os.path.exists(CFG_ARQ):
    with open(CFG_ARQ, encoding="utf-8") as f:
        CFG.update(json.load(f))

LOGS = []

# ---- acesso protegido: os dados são publicados criptografados (AES-GCM) ----
SAL = base64.b64decode(CFG["sal"]) if CFG.get("sal") else b""
ITER = int(CFG.get("iteracoes", 310000))


def chave_de(acesso):
    usuario, _, senha = acesso.partition(":")
    frase = f"{usuario.strip().lower()}:{senha}".encode("utf-8")
    return hashlib.pbkdf2_hmac("sha256", frase, SAL, ITER, dklen=32)


ACESSO = os.environ.get("LT_ACESSO", "").strip()
CHAVE = chave_de(ACESSO) if ACESSO and ":" in ACESSO and SAL else None


def cifrar(obj):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    iv = os.urandom(12)
    bruto = gzip.compress(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9)
    ct = AESGCM(CHAVE).encrypt(iv, bruto, None)
    return {"v": 1, "iv": base64.b64encode(iv).decode(), "dados": base64.b64encode(ct).decode()}


def decifrar(env):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    bruto = AESGCM(CHAVE).decrypt(base64.b64decode(env["iv"]), base64.b64decode(env["dados"]), None)
    return json.loads(gzip.decompress(bruto).decode("utf-8"))


def log(m):
    linha = f"{datetime.now(BR):%d/%m %H:%M:%S}  {m}"
    LOGS.append(linha)
    print(linha, flush=True)


def baixar_anterior(nome, padrao):
    if not URL_PUBLICADA:
        return padrao
    try:
        req = urllib.request.Request(f"{URL_PUBLICADA}/dados/{nome.replace('.json', '.enc')}?t={int(time.time())}",
                                     headers={"User-Agent": "LeilaoTrack"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return decifrar(json.loads(r.read().decode("utf-8")))
    except Exception as e:
        log(f"Sem dados anteriores de {nome} ({e}) — começando do zero")
        return padrao


def brl(v):
    return "—" if v is None else "R$ " + f"{v:,.0f}".replace(",", ".")


def telegram(msg):
    tok, chat = os.environ.get("TELEGRAM_TOKEN", ""), os.environ.get("TELEGRAM_CHAT_ID", "")
    if not tok or not chat:
        return
    try:
        dados = urllib.parse.urlencode({"chat_id": chat, "text": msg, "parse_mode": "HTML"}).encode()
        urllib.request.urlopen(f"https://api.telegram.org/bot{tok}/sendMessage", dados, timeout=20).read()
    except Exception as e:
        log(f"Telegram falhou: {e}")


def bate_alerta(l):
    a = CFG.get("alerta", {})
    if a.get("tipos") and l.get("tipo") not in a["tipos"]:
        return False
    if a.get("ufs") and l.get("uf") not in a["ufs"]:
        return False
    if a.get("cidades") and l.get("cidade") not in a["cidades"]:
        return False
    if a.get("valor_max") and (l.get("valor") or 0) > float(a["valor_max"]):
        return False
    if a.get("desconto_min") and (l.get("desconto") or 0) < float(a["desconto_min"]):
        return False
    return True


def main():
    if not CHAVE:
        sys.exit("ERRO: crie o segredo LT_ACESSO (usuario:senha) em Settings > Secrets and variables > Actions. "
                 "Sem ele os dados não são publicados, para não ficarem abertos.")
    ant = baixar_anterior("lotes.json", {"lotes": [], "estado": {"sites": {}}})
    eventos = baixar_anterior("eventos.json", [])
    excluir = set(CFG.get("tipos_excluidos", []))
    lotes = {l["id"]: l for l in ant.get("lotes", []) if l.get("tipo") not in excluir}
    estado = ant.get("estado", {}) or {}
    sites_info = estado.get("sites", {}) or {}
    pausas = {"Mega": 1.5, "Frazão": 1.5, "Zuk": 4.0}
    novos_alerta = []

    for site, func in coletores.SITES.items():
        info = sites_info.setdefault(site, {})
        if info.get("pausado_ate", "") > AGORA_S:
            log(f"{site}: em pausa até {info['pausado_ate']}")
            continue
        if site == "Zuk" and info.get("status") == "ok" and info.get("quando"):
            prox = datetime.strptime(info["quando"], "%Y-%m-%dT%H:%M:%S") + \
                timedelta(minutes=int(CFG.get("zuk_intervalo_minutos", 120)) - 10)
            if prox > AGORA:
                continue
        ini = time.time()
        try:
            http = coletores.Http(pausa=pausas.get(site, 1.5))
            if site == "Mega":
                cats = ("imoveis", "veiculos") if CFG.get("incluir_veiculos") else ("imoveis",)
                lidos, completo = func(http, log, categorias=cats)
            else:
                lidos, completo = func(http, log)
            if not CFG.get("incluir_veiculos"):
                lidos = [l for l in lidos if l.get("tipo") != "Veículo"]
            excluir = set(CFG.get("tipos_excluidos", []))
            lidos = [l for l in lidos if l.get("tipo") not in excluir]
            primeira_vez = not any(l["site"] == site for l in lotes.values())
            ids = set()
            n_novos = 0
            for l in lidos:
                ids.add(l["id"])
                velho = lotes.get(l["id"])
                if velho is None:
                    l["visto"] = AGORA_S
                    l["ativo"] = True
                    l["primeira_leitura"] = primeira_vez
                    lotes[l["id"]] = l
                    if not primeira_vez:
                        n_novos += 1
                        eventos.insert(0, {"id": l["id"], "quando": AGORA_S, "tipo": "novo",
                                           "texto": f"Novo lote: {l['titulo']} — {brl(l.get('valor'))}"})
                        if bate_alerta(l):
                            novos_alerta.append(l)
                    continue
                textos = []
                if velho.get("valor") != l.get("valor") and l.get("valor"):
                    textos.append(("valor", f"Valor {brl(velho.get('valor'))} → {brl(l.get('valor'))} ({l.get('praca_atual', '')})"))
                if (l.get("lances") or 0) > (velho.get("lances") or 0):
                    textos.append(("lance", f"Lances: {velho.get('lances') or 0} → {l['lances']}"))
                if velho.get("status") != l.get("status") and l.get("status"):
                    textos.append(("status", f"Situação: {velho.get('status') or '—'} → {l['status']}"))
                if velho.get("encerra") and l.get("encerra") and velho.get("encerra") != l.get("encerra"):
                    textos.append(("data", f"Data alterada para {l['encerra'].replace('T', ' ')}"))
                for tipo, t in textos:
                    eventos.insert(0, {"id": l["id"], "quando": AGORA_S, "tipo": tipo, "texto": t})
                l["visto"] = velho.get("visto", AGORA_S)
                l["primeira_leitura"] = velho.get("primeira_leitura", False)
                l["ativo"] = True
                lotes[l["id"]] = l
            if completo and lidos:
                sumiram = [i for i, l in lotes.items() if l["site"] == site and l.get("ativo") and i not in ids]
                if len(sumiram) < max(50, len(ids) * 0.6):
                    for i in sumiram:
                        lotes[i]["ativo"] = False
                        lotes[i]["saiu"] = AGORA_S
                        eventos.insert(0, {"id": i, "quando": AGORA_S, "tipo": "saiu",
                                           "texto": "Saiu da listagem do site (encerrado, vendido ou retirado)"})
            info.update(status="ok", lidos=len(lidos), novos=n_novos, erro="", quando=AGORA_S,
                        segundos=round(time.time() - ini),
                        lotes=sum(1 for l in lotes.values() if l["site"] == site and l.get("ativo")))
            info.pop("pausado_ate", None)
            log(f"{site}: {len(lidos)} lidos, {n_novos} novos, {round(time.time() - ini)}s")
        except coletores.Bloqueado as e:
            horas = 6 if site == "Zuk" else 2
            info.update(status="pausado", erro=f"{e}. Tentando de novo em {horas}h.", quando=AGORA_S,
                        pausado_ate=(AGORA + timedelta(hours=horas)).strftime("%Y-%m-%dT%H:%M:%S"))
            log(f"{site}: {e}")
        except Exception as e:
            info.update(status="erro", erro=str(e)[:300], quando=AGORA_S)
            log(f"{site}: ERRO {e}\n{traceback.format_exc()}")

    # tira os tipos que você não quer acompanhar (config.json > tipos_excluidos)
    excluir = set(CFG.get("tipos_excluidos", []))
    for i in [i for i, l in lotes.items() if l.get("tipo") in excluir]:
        del lotes[i]
    eventos = [e for e in eventos if e.get("id") in lotes]  # só eventos de lotes que ainda existem
    # limpeza: tira lotes encerrados/inativos há mais de 30 dias
    limite = (AGORA - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M")
    for i in [i for i, l in lotes.items()
              if (l.get("encerra") or "9999") < limite or (not l.get("ativo") and l.get("saiu", "9999") < limite)]:
        del lotes[i]
    eventos = eventos[:400]
    for l in lotes.values():
        coletores.finalizar(l)

    estado = {"ultima": AGORA_S, "sites": sites_info, "proxima": (AGORA + timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S"),
              "intervalo": 120, "nuvem": True}
    publicar = {"lotes": {"lotes": list(lotes.values()), "estado": estado, "gerado": AGORA_S},
                "eventos": eventos, "estado": estado}
    for nome, obj in publicar.items():
        with open(os.path.join(SAIDA, nome + ".enc"), "w", encoding="utf-8") as f:
            json.dump(cifrar(obj), f)
    with open(os.path.join(SAIDA, "acesso.json"), "w", encoding="utf-8") as f:
        json.dump({"sal": CFG["sal"], "iteracoes": ITER}, f)

    for l in novos_alerta[:15]:
        telegram(f"🏠 <b>Novo lote · {l['site']}</b>\n{l['titulo']}\n{l.get('cidade', '')}/{l.get('uf', '')}\n"
                 f"<b>{brl(l.get('valor'))}</b>" + (f"  (-{l['desconto']}%)" if l.get("desconto") else "") +
                 f"\n{l['url']}")
    if len(novos_alerta) > 15:
        telegram(f"…e mais {len(novos_alerta) - 15} lotes novos no LeilãoTrack.")
    log(f"Pronto: {sum(1 for l in lotes.values() if l.get('ativo'))} lotes ativos")


if __name__ == "__main__":
    main()
