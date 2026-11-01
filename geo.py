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

GEO_POR_LEITURA = 200
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


_COORD = re.compile(r"^\s*-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+\s*$")


def partes(l):
    """Endereço do lote em pedaços, sem CEP e sem 'Cidade, UF' repetidos no fim."""
    cru = l.get("end_maps") or ""
    if not cru or _COORD.match(cru):
        cru = l.get("endereco") or ""
    toks = [x.strip() for x in re.sub(r"\s+", " ", cru).replace("/", ", ").split(",") if x.strip()]
    toks = [x for x in toks if not re.fullmatch(r"\d{5}-?\d{3}", x)]
    if toks and l.get("uf") and _sem(toks[-1]) == _sem(l["uf"]):
        toks.pop()
    if toks and l.get("cidade") and _sem(toks[-1]) == _sem(l["cidade"]):
        toks.pop()
    return toks


def consultas(l):
    """Lista de (texto, nivel) da mais precisa para a menos precisa."""
    cid, uf, bai = l.get("cidade") or "", l.get("uf") or "", l.get("bairro") or ""
    if not cid or not uf:
        return []
    fim = f"{cid}, {uf}"
    out = []
    toks = partes(l)
    rua = toks[0] if toks else ""
    tem_via = bool(re.search(r"\d|^(rua|r|av|avenida|alameda|al|travessa|tv|estrada|est|rodovia|rod|pra[çc]a|largo|via|beco|viela)\b", rua, re.I))
    if rua and (tem_via or any(re.fullmatch(r"\d+[A-Za-z]?|s/?n", x, re.I) for x in toks[1:3])):
        com = list(toks)
        if bai and _sem(bai) not in _sem(" ".join(com)):
            com.append(bai)
        base = ", ".join(com + [fim])
        out.append((base, "rua"))
        sem_num = [x for x in com if not re.fullmatch(r"\d+[A-Za-z]?|s/?n", x, re.I)]
        if sem_num != com and sem_num:
            out.append((", ".join(sem_num + [fim]), "rua"))
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
        if l.get("geo_tent", "") >= _dias_atras(7) and (not tem_rua or l.get("geo_qt") == cs[0][0]):
            return 0
        return 1 if tem_rua else 3
    if tem_rua and l.get("geo_q") != cs[0][0] and l.get("geo_qt") != cs[0][0]:
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
        cs0 = consultas(l)
        if cs0 and cs0[0][1] == "rua":
            l["geo_qt"] = cs0[0][0]
        if res:
            (la, lo), nivel, q = res
            l["geo"] = [round(la, 5), round(lo, 5), nivel]
            l["geo_q"] = consultas(l)[0][0] if nivel == "rua" else q
            achou += 1
    if feitos:
        log(f"Mapa: {feitos} consultas, {achou} lotes localizados")
        print(f"::notice title=geo::{feitos} consultas, {achou} localizados, {sum(1 for x in lotes.values() if x.get('geo'))} no total")
    return achou
