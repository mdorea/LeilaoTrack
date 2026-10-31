"""Localização de cada lote no mapa: endereço -> coordenadas (Nominatim/OpenStreetMap).

Roda aos poucos (GEO_POR_LEITURA consultas por coleta, 1 por segundo, como a política do
serviço pede). O resultado fica guardado no próprio lote em l["geo"] = [lat, lng, nivel]
(nivel "rua" = rua/número achados; "bairro" = só o bairro) e não é pedido de novo.
Resultados longe do centro do município são descartados (endereço ambíguo).
"""
import json
import math
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

GEO_POR_LEITURA = 150
UA = "LeilaoTrack/1.0 (+https://github.com/mdorea/LeilaoTrack)"
URL = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&addressdetails=0&q="
RAIO_MAX_KM = 45


def _sem(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _km(a, b):
    p = math.pi / 180
    h = math.sin((b[0] - a[0]) * p / 2) ** 2 + math.cos(a[0] * p) * math.cos(b[0] * p) * math.sin((b[1] - a[1]) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def consultas(l):
    """Lista de (texto, nivel) da mais precisa para a menos precisa."""
    cid, uf, bai = l.get("cidade") or "", l.get("uf") or "", l.get("bairro") or ""
    if not cid or not uf:
        return []
    fim = f"{cid}, {uf}"
    out = []
    em = (l.get("end_maps") or "").strip()
    rua = (l.get("endereco") or "").strip()
    base = em or (", ".join(x for x in (rua, bai, fim) if x) if rua and re.search(r"\d|rua|av|alameda|estrada|rodovia|travessa", rua, re.I) else "")
    if base:
        out.append((base, "rua"))
        sem_num = re.sub(r",?\s*\d{5}-?\d{3}\b", "", base)      # tira o CEP
        sem_num = re.sub(r",\s*\d+[A-Za-z]?\b", "", sem_num, count=1)  # tira o número
        if sem_num != base and len(sem_num) > 8:
            out.append((sem_num.strip(" ,"), "rua"))
    if bai:
        out.append((f"{bai}, {fim}", "bairro"))
    return out


def precisa(l):
    """0 = não precisa; senão, prioridade (menor primeiro)."""
    cs = consultas(l)
    if not cs:
        return 0
    g = l.get("geo")
    tem_rua = cs[0][1] == "rua"
    if not g:
        if l.get("geo_tent", "") >= _dias_atras(7):
            return 0
        return 1 if tem_rua else 3
    if g[2] != "rua" and tem_rua and l.get("geo_q") != cs[0][0] and l.get("geo_tent", "") < _dias_atras(7):
        return 2
    return 0


def _dias_atras(n):
    from datetime import datetime, timedelta
    return (datetime.now() - timedelta(days=n)).strftime("%Y-%m-%d")


def _buscar(q, log):
    req = urllib.request.Request(URL + urllib.parse.quote(q), headers={"User-Agent": UA, "Accept-Language": "pt-BR"})
    with urllib.request.urlopen(req, timeout=25) as r:
        d = json.loads(r.read().decode("utf-8"))
    return (float(d[0]["lat"]), float(d[0]["lon"])) if d else None


def atualizar(lotes, municipios, log, limite=GEO_POR_LEITURA):
    """lotes: dict id -> lote (ativos). municipios: {'cidade|UF': [lat, lng]}."""
    hoje = _dias_atras(0)
    fila = sorted((precisa(l), i) for i, l in lotes.items() if l.get("ativo", True) and not l.get("encerrado") and precisa(l))
    feitos = achou = 0
    for _, i in fila:
        if feitos >= limite:
            break
        l = lotes[i]
        centro = municipios.get(_sem(l.get("cidade")) + "|" + (l.get("uf") or ""))
        res = None
        for q, nivel in consultas(l):
            if feitos >= limite:
                break
            try:
                p = _buscar(q, log)
            except urllib.error.HTTPError as e:
                log(f"Mapa: geocodificador respondeu {e.code}; paro por hoje")
                return achou
            except Exception as e:
                log(f"Mapa: falha ao localizar {l['id']} ({e})")
                feitos += 1
                time.sleep(1.2)
                continue
            feitos += 1
            time.sleep(1.2)
            if p and (not centro or _km(p, centro) <= RAIO_MAX_KM):
                res = (p, nivel, q)
                break
        l["geo_tent"] = hoje
        if res:
            (la, lo), nivel, q = res
            l["geo"] = [round(la, 5), round(lo, 5), nivel]
            l["geo_q"] = consultas(l)[0][0] if nivel == "rua" else q
            achou += 1
    if feitos:
        log(f"Mapa: {feitos} consultas, {achou} lotes localizados")
        print(f"::notice title=geo::{feitos} consultas, {achou} localizados, {sum(1 for x in lotes.values() if x.get('geo'))} no total")
    return achou
