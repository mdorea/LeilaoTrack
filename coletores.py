# -*- coding: utf-8 -*-
"""Coletores dos sites de leilão (Frazão, Portal Zuk e Mega Leilões).

Só lê as páginas públicas de listagem, com pausas entre as requisições.
Usa apenas a biblioteca padrão do Python (não precisa instalar nada).
"""
import re
import time
import json
import html as _html
import http.cookiejar
import urllib.request
import urllib.parse
from datetime import datetime

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/130.0 Safari/537.36")


# ---------------------------------------------------------------- utilidades
class Bloqueado(Exception):
    """O site pediu para esperar (429) ou mostrou verificação anti-robô."""


class Http:
    def __init__(self, pausa=1.0, timeout=40):
        self.pausa = pausa
        self.timeout = timeout
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self._ultimo = 0.0

    def _esperar(self):
        falta = self.pausa - (time.time() - self._ultimo)
        if falta > 0:
            time.sleep(falta)
        self._ultimo = time.time()

    def _abrir(self, req):
        for tentativa in range(4):
            self._esperar()
            espera = 3 * (tentativa + 1)
            try:
                with self.op.open(req, timeout=self.timeout) as r:
                    dados = r.read()
                    cs = r.headers.get_content_charset() or "utf-8"
                    return dados.decode(cs, errors="replace")
            except urllib.error.HTTPError as e:
                corpo = ""
                try:
                    corpo = e.read(4000).decode("utf-8", "replace")
                except Exception:
                    pass
                if e.code in (403, 503) and ("cf_chl" in corpo or "Just a moment" in corpo or "challenge" in corpo):
                    raise Bloqueado("o site ativou a verificação anti-robô (Cloudflare)")
                if e.code == 429:
                    # pediu para ir mais devagar: não insiste, tenta só no próximo ciclo
                    raise Bloqueado("o site pediu para diminuir a frequência (429)")
                if e.code in (403, 404) or tentativa == 3:
                    raise
            except Exception:
                if tentativa == 3:
                    raise
            time.sleep(espera)

    def get(self, url, headers=None):
        h = {"User-Agent": UA, "Accept": "text/html,*/*", "Accept-Language": "pt-BR,pt;q=0.9"}
        h.update(headers or {})
        return self._abrir(urllib.request.Request(url, headers=h))

    def post(self, url, dados, headers=None):
        h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "pt-BR,pt;q=0.9",
             "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"}
        h.update(headers or {})
        corpo = urllib.parse.urlencode(dados).encode("utf-8")
        return self._abrir(urllib.request.Request(url, data=corpo, headers=h, method="POST"))


def texto(s):
    if s is None:
        return ""
    s = re.sub(r"<!--.*?-->", " ", s, flags=re.S)
    s = re.sub(r"<svg.*?</svg>", " ", s, flags=re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    s = _html.unescape(s).replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip()


def dinheiro(s):
    m = re.search(r"R\$\s*([\d\.]+(?:,\d{1,2})?)", s or "")
    if not m:
        return None
    try:
        return float(m.group(1).replace(".", "").replace(",", "."))
    except ValueError:
        return None


_RE_DATA = re.compile(r"(\d{2})/(\d{2})/(\d{4})(?:\s*(?:às|as|-)?\s*(\d{1,2})\s*[:h]\s*(\d{2}))?")


def data_iso(s):
    m = _RE_DATA.search(s or "")
    if not m:
        return None
    d, mo, a, h, mi = m.groups()
    try:
        return datetime(int(a), int(mo), int(d), int(h or 0), int(mi or 0)).strftime("%Y-%m-%dT%H:%M")
    except ValueError:
        return None


def area_m2(s):
    m = re.search(r"([\d\.]+(?:,\d+)?)\s*(m²|m2|ha)", s or "", flags=re.I)
    if not m:
        return None, ""
    v = float(m.group(1).replace(".", "").replace(",", "."))
    if m.group(2).lower() == "ha":
        v *= 10000
    return round(v, 2), m.group(0)


TIPOS = [
    ("Veículo", r"ve[ií]culo|carro|moto\b|caminh[aã]o|[ôo]nibus|autom[oó]vel"),
    ("Rural", r"rural|rurais|fazenda|s[ií]tio|ch[áa]cara|gleba|\bha\b"),
    ("Galpão", r"galp[aã]o|armaz[ée]m|dep[oó]sito"),
    ("Comercial", r"comercial|industrial|loja|sala|escrit[oó]rio|pr[ée]dio|ag[êe]ncia|hotel|posto|conjunto"),
    ("Apartamento", r"apartamento|\bapto\b|\bap\b|flat|cobertura|kitnet|studio|est[úu]dio"),
    ("Casa", r"\bcasa|sobrado|resid[êe]ncia\b|moradia"),
    ("Terreno", r"terreno|\blote\b|lote no|lote em|[áa]rea de terra|gleba"),
    ("Vaga", r"\bvaga|box de garagem|garagem"),
]


def classificar(*pistas):
    """A primeira pista (categoria informada pelo site) tem prioridade."""
    for p in pistas:
        s = (p or "").lower()
        if not s:
            continue
        for nome, rx in TIPOS:
            if re.search(rx, s):
                return nome
    return "Outros"


def cidade_uf(s):
    """Tenta achar 'Cidade/UF', 'Cidade - UF' ou 'Cidade, UF' no fim do texto."""
    s = (s or "").strip().rstrip(".")
    for rx in (r"([^,\-/|]+?)\s*/\s*([A-Z]{2})\s*$", r"([^,\-/|]+?)\s*-\s*([A-Z]{2})\s*$",
               r"([^,\-/|]+?)\s*,\s*([A-Z]{2})\s*$"):
        m = re.search(rx, s)
        if m:
            return m.group(1).strip(), m.group(2)
    return "", ""


def finalizar(lote):
    """Calcula valor atual, próxima data e desconto a partir das praças."""
    agora = datetime.now().strftime("%Y-%m-%dT%H:%M")
    pr = [p for p in lote.get("pracas", []) if p.get("valor")]
    futuras = [p for p in pr if p.get("data") and p["data"] >= agora]
    atual = futuras[0] if futuras else (pr[-1] if pr else None)
    lote["valor"] = atual["valor"] if atual else None
    lote["encerra"] = atual["data"] if atual else None
    lote["praca_atual"] = atual["nome"] if atual else ""
    ref = pr[0]["valor"] if pr else None
    desc = lote.get("desconto")
    if ref and lote["valor"] and lote["valor"] < ref:
        desc = round((1 - lote["valor"] / ref) * 100)
    lote["desconto"] = desc or 0
    lote["referencia"] = ref
    lote["encerrado"] = bool(pr) and not futuras
    return lote


def _blocos(html, marcador):
    partes = html.split(marcador)
    return [marcador + p for p in partes[1:]]


# ---------------------------------------------------------------- Portal Zuk
ZUK = "https://www.portalzuk.com.br/leilao-de-imoveis"


def zuk_parse(html):
    lotes = []
    for b in _blocos(html, '<div class="card-property card_lotes_div"'):
        m = re.search(r'href="(https://www\.portalzuk\.com\.br/imovel/[^"]+)"', b)
        if not m:
            continue
        url = m.group(1)
        lid = re.search(r'card-property-favorite[^"]*"\s+id="(\d+)"', b)
        lid = lid.group(1) if lid else url.rstrip("/").split("-")[-1]
        tit = re.search(r'title="([^"]*)"', b)
        tit = _html.unescape(tit.group(1)) if tit else ""
        comit = ""
        if "|" in tit:
            esq = tit.split("|")[0]
            comit = esq.split(" - ")[-1].strip()
        img = re.search(r'<img[^>]+src="([^"]+)"', b)
        tipo_site = texto((re.search(r'card-property-price-lote">(.*?)</span>', b, re.S) or [None, ""])[1])
        end = re.search(r"<address[^>]*>(.*?)</address>", b, re.S)
        cidade = uf = bairro = rua = ""
        if end:
            a = re.search(r"<a[^>]*>(.*?)</a>\s*-?\s*([^<]*)</span>", end.group(1), re.S)
            if a:
                c = texto(a.group(1))
                if "/" in c:
                    cidade, uf = [x.strip() for x in c.rsplit("/", 1)]
                bairro = texto(a.group(2)).lstrip("- ").strip()
            spans = re.findall(r"<span[^>]*>(.*?)</span>", end.group(1), re.S)
            if len(spans) >= 2:
                rua = texto(spans[-1])
        infos = [texto(x) for x in re.findall(r'card-property-info-label">(.*?)</span>', b, re.S)]
        area, area_txt = None, ""
        for i in infos:
            area, area_txt = area_m2(i)
            if area:
                area_txt = i
                break
        pracas = []
        for seg in b.split("card-property-price-label")[1:]:
            nome = texto(seg.split("</span>")[0].lstrip('">'))
            v = dinheiro(texto(seg))
            d = data_iso(seg)
            if v:
                pracas.append({"nome": nome.capitalize(), "data": d, "valor": v})
        ocup = re.search(r'card-property-news">(.*?)</span>', b, re.S)
        ocup = texto(ocup.group(1)) if ocup else ""
        titulo = f"{tipo_site or 'Imóvel'}" + (f" — {bairro}" if bairro else "")
        lotes.append(finalizar({
            "id": f"zuk:{lid}", "site": "Zuk", "url": url,
            "titulo": titulo, "endereco": rua, "bairro": bairro, "cidade": cidade, "uf": uf,
            "tipo": classificar(tipo_site, rua), "tipo_site": tipo_site,
            "imagem": img.group(1) if img else "", "area": area, "area_txt": area_txt,
            "pracas": pracas, "ocupacao": ocup, "comitente": comit,
            "status": "", "lances": None, "visitas": None,
            "parceiro": 'data-parceiro="0"' not in b[:80],
        }))
    return lotes


def coletar_zuk(http, log, limite=4000, completo=True, max_paginas=3):
    """O Portal Zuk tem proteção anti-robô: lemos só as primeiras páginas, com calma."""
    h = http.get(ZUK)
    if "cf_chl" in h[:5000] or "Just a moment" in h[:3000]:
        raise Bloqueado("o site ativou a verificação anti-robô (Cloudflare)")
    tok = re.search(r'<input[^>]*name="_token"[^>]*value="([^"]+)"', h) or \
        re.search(r'<input[^>]*value="([^"]+)"[^>]*name="_token"', h)
    vistos = {}
    for l in zuk_parse(h):
        vistos[l["id"]] = l
    if not completo:
        return list(vistos.values()), False
    if not tok:
        log("Zuk: token de paginação não encontrado; lendo só a 1ª página")
        return list(vistos.values()), False
    tok = tok.group(1)
    proprios = sum(1 for l in vistos.values() if not l.get("parceiro"))
    http.pausa = max(http.pausa, 4.0)
    pag = 1
    while len(vistos) < limite and pag <= max_paginas:
        pag += 1
        try:
            resp = http.post(ZUK + "/mais", {
            "limit": len(vistos), "count_imovel_zuk": proprios, "path": ZUK,
                "order": "data_leilao", "div_parceiro_count": 0, "_token": tok,
            }, {"X-Requested-With": "XMLHttpRequest", "Referer": ZUK})
        except Bloqueado as e:
            log(f"Zuk: parei na página {pag} ({e}); continuo no próximo ciclo")
            return list(vistos.values()), False
        novos = [l for l in zuk_parse(resp) if l["id"] not in vistos]
        for l in novos:
            vistos[l["id"]] = l
            if not l.get("parceiro"):
                proprios += 1
        if len(novos) < 5:
            break
    return list(vistos.values()), False


# ---------------------------------------------------------------- Frazão
FRAZAO = "https://www.frazaoleiloes.com.br"


UFS = set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split())


def frazao_local(tit):
    """Títulos da Frazão: 'Casa na Vila Guilherme, São Paulo SP' ou 'Casa em Atibaia SP'.
    Devolve (bairro, cidade, uf) ou None."""
    t = (tit or "").strip().rstrip(".")
    m = re.search(r"^(.*?)[\s,/\-]+([A-Z]{2})$", t)
    if not m or m.group(2) not in UFS:
        return None
    resto, uf = m.group(1), m.group(2)
    if "," in resto:
        antes, cid = resto.rsplit(",", 1)
        mb = re.search(r"\b(?:no|na|nos|nas|em|do|da)\s+(.+)$", antes)
        bairro, cid = (mb.group(1).strip() if mb else ""), cid.strip()
    else:
        mc = re.search(r"\bem\s+(.+)$", resto)
        bairro, cid = "", (mc.group(1).strip() if mc else "")
    return (bairro, cid, uf) if cid else None


def frazao_parse(html):
    lotes = []
    for b in _blocos(html, "thumbnail-vitrine-lot"):
        m = re.search(r'href="(/lote/[^"]+)"[^>]*data-lote-id="(\d+)"', b)
        if not m:
            continue
        url, lid = FRAZAO + m.group(1), m.group(2)
        tipo_site = (re.search(r'data-tipo="([^"]*)"', b) or [None, ""])[1]
        addr = _html.unescape((re.search(r'data-addr="([^"]*)"', b) or [None, ""])[1])
        img = re.search(r'class="photo-lot">\s*<img[^>]+src="([^"]+)"', b)
        img = img.group(1) if img else ""
        if "lote_default" in img:
            img = ""
        elif img.startswith("/"):
            img = FRAZAO + img
        tit = re.search(r'<b title="([^"]*)"', b)
        tit = _html.unescape(tit.group(1)).strip() if tit else ""
        comit = re.search(r'comitente-logo-ico"[^>]*alt="Logo ([^"]*)"', b)
        comit = _html.unescape(comit.group(1)) if comit else ""
        cap = re.search(r'lot-info-cap">.*?align-self-center">(.*?)</div>', b, re.S)
        cap = texto(cap.group(1)) if cap else ""
        if not addr and cap and cap.lower() not in ("veículos", "veiculos", "diversos"):
            addr = cap
        ar = re.search(r'lot-area-cap">(.*?)</div>\s*</div>', b, re.S)
        area, area_txt = area_m2(texto(ar.group(1)) if ar else "")
        stats = re.search(r'stats-tag">(.*?)</div>', b, re.S)
        nums = re.findall(r"\b(\d+)\b", texto(stats.group(1))) if stats else []
        cal = re.search(r'inf-leilao-calendar">(.*?)<input', b, re.S)
        pracas = []
        if cal:
            for mm in re.finditer(r"(?:(\d)º\s*)?Leil[ãa]o:\s*(\d{2}/\d{2}/\d{4}\s*às\s*\d{1,2}h\d{2})(.*?)(?=(?:\d)º\s*Leil|Leil[ãa]o:|$)",
                                  texto(cal.group(1))):
                n, d, resto = mm.groups()
                v = dinheiro(resto)
                if v:
                    pracas.append({"nome": f"{n}ª praça" if n else "Praça única", "data": data_iso(d), "valor": v})
        st = re.search(r'label-md status-[a-z]+">([^<]*)<', b)
        loc = frazao_local(tit)
        if loc:
            bairro, cidade, uf = loc
        else:
            cidade, uf = cidade_uf(tit)
            bairro = ""
            mb = re.search(r"\b(?:no|na|em)\s+(.+?),\s*[^,]+,\s*[A-Z]{2}\s*$", tit)
            if mb:
                bairro = mb.group(1)
            else:
                partes = [p.strip() for p in tit.split(" - ")]
                if len(partes) >= 3:
                    bairro = partes[-2]
        lotes.append(finalizar({
            "id": f"frazao:{lid}", "site": "Frazão", "url": url,
            "titulo": tit, "endereco": addr, "bairro": bairro, "cidade": cidade, "uf": uf,
            "tipo": classificar(tipo_site, cap if cap.lower().startswith("ve") else "", tit),
            "tipo_site": tipo_site or cap,
            "imagem": img, "area": area, "area_txt": area_txt, "pracas": pracas,
            "ocupacao": "Desocupado" if re.search(r"desocupad", tit, re.I) else ("Ocupado" if re.search(r"\bocupad", tit, re.I) else ""),
            "comitente": comit, "status": (st.group(1).strip().capitalize() if st else ""),
            "visitas": int(nums[0]) if len(nums) > 0 else None,
            "lances": int(nums[1]) if len(nums) > 1 else None,
        }))
    return lotes


def coletar_frazao(http, log, limite=4000, completo=True):
    ids = []
    for pag in ("/Home/Calendario", "/"):
        try:
            h = http.get(FRAZAO + pag)
            for i in re.findall(r"/leilao/(\d+)/", h):
                if i not in ids:
                    ids.append(i)
        except Exception as e:
            log(f"Frazão: falha ao ler {pag}: {e}")
    vistos = {}
    for bid in ids:
        for p in range(1, 40):
            q = urllib.parse.urlencode({
                "bid": bid, "categoria": "", "subcategoria": "", "uf": "", "cidade": "", "bairro": "",
                "tipoimovel": "", "subtipoImovel": "", "area": "", "preco": "", "term": "",
                "start": (p - 1) * 36, "limit": 36, "page": p, "vendaDireta": "false", "FilterByNumber": "true"})
            h = http.get(f"{FRAZAO}/Sale/SearchLotResult?{q}",
                         {"X-Requested-With": "XMLHttpRequest", "Referer": f"{FRAZAO}/leilao/{bid}/"})
            ls = frazao_parse(h)
            novos = 0
            for l in ls:
                if l["id"] not in vistos:
                    l["leilao"] = bid
                    vistos[l["id"]] = l
                    novos += 1
            if len(ls) < 36 or not novos or len(vistos) >= limite:
                break
    return list(vistos.values()), bool(ids)


# ---------------------------------------------------------------- Mega Leilões
MEGA = "https://www.megaleiloes.com.br"


def mega_parse(html):
    lotes = []
    for b in _blocos(html, '<div class="card ')[0:]:
        m = re.search(r'class="card-title"\s+href="([^"?]+)[^"]*"[^>]*>(.*?)</a>', b, re.S)
        if not m:
            continue
        url, tit = m.group(1), texto(m.group(2))
        cod = texto((re.search(r'card-number[^"]*">(.*?)</div>', b, re.S) or [None, ""])[1])
        img = re.search(r'data-bg="([^"]+)"', b)
        loc = re.search(r'card-locality"[^>]*title="([^"]+)"', b)
        cidade, uf = cidade_uf(loc.group(1) if loc else tit)
        st = texto((re.search(r'card-status">(.*?)</div>', b, re.S) or [None, ""])[1])
        vb = re.search(r'card-views-bids[^"]*">(.*?)</div>', b, re.S)
        nums = re.findall(r"\b(\d+)\b", texto(vb.group(1))) if vb else []
        pracas = []
        for mm in re.finditer(r"<b>([^<]*)</b>\s*([^<]*)</span>\s*<span class=\"card-instance-value\">([^<]*)<", b):
            nome, d, v = mm.groups()
            v = dinheiro(v)
            if v:
                nome = texto(nome).rstrip(":")
                pracas.append({"nome": nome.replace("Praça", "praça"), "data": data_iso(d), "valor": v})
        desc = re.search(r'card-down">.*?class="value">(\d+)%', b, re.S)
        partes = url.split("/")
        cat = partes[4] if len(partes) > 4 else ""
        instancia = texto((re.search(r'card-instance-title">\s*<a[^>]*>(.*?)</a>', b, re.S) or [None, ""])[1])
        banco = re.search(r"bank_icons/([^\.\"]+)", b)
        comit = banco.group(1).replace("leilao-", "").replace("-", " ").title() if banco else instancia
        ps = [p.strip() for p in tit.split(" - ")]
        bairro = ps[1] if len(ps) >= 4 else ""
        area, area_txt = area_m2(tit)
        lotes.append(finalizar({
            "id": f"mega:{cod or partes[-1]}", "site": "Mega", "url": url, "codigo": cod,
            "titulo": tit, "endereco": "", "bairro": bairro, "cidade": cidade, "uf": uf,
            "tipo": classificar(cat, tit), "tipo_site": cat,
            "imagem": img.group(1) if img else "", "area": area, "area_txt": area_txt,
            "pracas": pracas, "ocupacao": "Desocupado" if re.search(r"desocupad", tit, re.I) else "",
            "comitente": comit, "status": st, "instancia": instancia,
            "visitas": int(nums[0]) if len(nums) > 0 else None,
            "lances": int(nums[1]) if len(nums) > 1 else None,
            "desconto": int(desc.group(1)) if desc else 0,
        }))
    return lotes


def coletar_mega(http, log, limite=4000, categorias=("imoveis",), completo=True):
    vistos = {}
    ok = True
    for cat in categorias:
        total = 0
        p = 1
        while p <= 150:
            h = http.get(f"{MEGA}/{cat}?pagina={p}")
            t = re.search(r"P(?:á|a|&aacute;)gina\s+\d+\s+de\s+(\d+)", h)
            if t:
                total = int(t.group(1))
            else:
                nums = [int(x) for x in re.findall(r"[?&](?:amp;)?pagina=(\d+)", h)]
                if nums:
                    total = max(total, max(nums))
            ls = mega_parse(h)
            novos = [l for l in ls if l["id"] not in vistos]
            for l in novos:
                vistos[l["id"]] = l
            if not novos:
                if total and p < total:
                    ok = False
                break
            if (total and p >= total) or len(vistos) >= limite:
                break
            p += 1
        log(f"Mega/{cat}: {p} páginas")
    return list(vistos.values()), ok


SITES = {
    "Mega": coletar_mega,
    "Frazão": coletar_frazao,
    "Zuk": coletar_zuk,
}
