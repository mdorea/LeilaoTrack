# -*- coding: utf-8 -*-
"""Coletores dos sites de leilão (Frazão, Portal Zuk, Mega Leilões e Biasi Leilões).

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


# ---- área construída x área do terreno (o que mais distorce o preço por m²) ----
_NUM = r"(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)"
_M2 = r"\s*m(?:²|2)"
_AREAS = {
    "constr": [r"[áa]rea\s+(?:total\s+)?constru[íi]da(?:\s+total)?(?:\s+conforme\s+matr[íi]cula)?\s*(?:de|:|com|é\s+de)?\s*" + _NUM + _M2,
               r"\bconstru[íi]da\s+(?:conforme\s+matr[íi]cula\s+)?de\s+" + _NUM + _M2,
               r"metragem\s+constru[íi]da\s*:?\s*" + _NUM + _M2,
               _NUM + _M2 + r"\s*(?:de\s+)?(?:[áa]rea\s+)?(?:total\s+)?constru[íi]da",
               r"edificad[ao][^.;]{0,90}?\bcom\s+(?:a\s+)?(?:[áa]rea\s+(?:constru[íi]da\s+)?(?:de\s+)?)?" + _NUM + _M2],
    "priv": [r"[áa]rea\s+(?:privativa|[úu]til)(?:\s+total)?\s*(?:de|:|com|é\s+de)?\s*" + _NUM + _M2,
             r"metragem\s+[úu]til\s*:?\s*" + _NUM + _M2,
             _NUM + _M2 + r"\s*(?:de\s+)?(?:[áa]rea\s+)?(?:privativa|[úu]til)\b"],
    "terreno": [r"[áa]rea\s+(?:de\s+|do\s+)?terreno\s*(?:de|:|com|é\s+de)?\s*" + _NUM + _M2,
                r"metragem\s+(?:do\s+)?terreno\s*:?\s*" + _NUM + _M2,
                _NUM + _M2 + r"\s*(?:de\s+)?(?:[áa]rea\s+(?:de\s+|do\s+)?)?terreno",
                r"\bterreno\s+(?:urbano\s+)?(?:com|de|medindo)\s+(?:a\s+)?(?:[áa]rea\s+(?:total\s+)?(?:de\s+)?)?" + _NUM + _M2],
}


def _num_br(s):
    try:
        return round(float(s.replace(".", "").replace(",", ".")), 2)
    except ValueError:
        return None


def areas_de(t):
    """{'constr': m², 'terreno': m²} lidos de um texto. A privativa/útil conta como construída
    (é a área de uso do imóvel). Pega a primeira menção de cada uma."""
    t = t or ""
    achou = {}
    for k, pads in _AREAS.items():
        melhor = None
        for pad in pads:
            m = re.search(pad, t, re.I)
            if m and (melhor is None or m.start() < melhor[0]):
                v = _num_br(m.group(1))
                if v and 8 <= v <= 500000:
                    melhor = (m.start(), v)
        if melhor:
            achou[k] = melhor[1]
    r = {}
    c = achou.get("priv") or achou.get("constr")
    if c and c <= 20000:
        r["area_constr"] = c
    if achou.get("terreno"):
        r["area_terreno"] = achou["terreno"]
    return r


def lance_da_pagina(html):
    """(último lance, incremento) da página do lote. Mega: 'Último Lance R$ ...';
    Frazão: 'Maior lance atual: R$ ...'; outros: 'Lance atual'."""
    t = texto(html)
    m = re.search(r"(?:[úu]ltimo lance|maior lance(?: atual)?|lance atual)\s*:?\s*R\$\s*([\d\.]+(?:,\d{1,2})?)", t, re.I)
    i = re.search(r"incremento(?: m[íi]nimo)?\s*:?\s*\+?\s*R\$\s*([\d\.]+(?:,\d{1,2})?)", t, re.I)
    return (dinheiro("R$ " + m.group(1)) if m else None), (dinheiro("R$ " + i.group(1)) if i else None)


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
        ar_zuk = areas_de(" ; ".join(infos))
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
            **ar_zuk,
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
            **({"area_terreno": area} if area and re.search(r"casa|sobrado|terreno|lote|rural|ch[áa]cara|s[íi]tio", (tipo_site or "") + " " + tit, re.I) else {}),
        }))
    return lotes


FRAZAO_DETALHES_POR_LEITURA = 120


_RUIDO_END = re.compile(r"\b(apto|apt|apartamento|torre|bloco|bl|unidade|unid|condom[íi]nio|cond|edif[íi]cio|ed|loteamento|lote|quadra|sala|andar|casa\s*\d|conjunto|garagem|vaga)\b", re.I)


def endereco_maps(txt):
    """Endereço limpo para o Google Maps: rua, número, bairro, cidade/UF e CEP (sem apto, torre, condomínio)."""
    txt = re.sub(r"\s+", " ", str(txt or "")).strip(" ,.-")
    partes = [p.strip() for p in txt.split(",") if p.strip()]
    ok = []
    for i, p in enumerate(partes):
        if i >= 2 and _RUIDO_END.search(p):
            continue
        p = re.sub(r"\b(n[º°o]\.?)\s*(?=\d)", "", p, flags=re.I).strip()
        if p:
            ok.append(p)
    return ", ".join(ok)[:250]


def frazao_detalhe(html):
    """Áreas da página do lote: 'Área(s): 177,02 m² de área de terreno, 190,26 m² de área construída'."""
    t = texto(html)
    corte = re.search(r"(Lotes? relacionados|Veja tamb[ée]m|Outros lotes)", t, re.I)
    if corte:
        t = t[:corte.start()]
    d = {"v": 3}
    d.update(areas_de(t))
    # endereço exato: "Endereço Completo RUA X, 10, BAIRRO, Cidade, UF, CEP Características..." ou "Endereço: Av. Y, nº 720 - Bairro, Cidade/UF - CEP: 11740-000"
    m = re.search(r"Endere[çc]o Completo\s+(.+?)\s+Caracter[íi]sticas do Im[óo]vel", t)
    if m:
        d["end_maps"] = endereco_maps(m.group(1))
    else:
        m = re.search(r"Endere[çc]o:\s*(.{8,200}?CEP:?\s*\d{5}-?\d{3})", t)
        if m:
            d["end_maps"] = re.sub(r"CEP:?\s*", "", re.sub(r"\s+-\s+", ", ", endereco_maps(m.group(1).replace("/", ", "))))
    return d


def coletar_frazao(http, log, anteriores=None, limite=4000, completo=True):
    anteriores = anteriores or {}
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
    # página de cada lote (só uma vez; fica guardada em _det) para separar área construída x terreno
    feitos = 0
    for l in vistos.values():
        det = (anteriores.get(l["id"]) or {}).get("_det")
        if (not det or det.get("v") != 3) and feitos < FRAZAO_DETALHES_POR_LEITURA and l.get("tipo") != "Veículo":
            try:
                det = frazao_detalhe(http.get(l["url"], {"Referer": FRAZAO + "/"}))
                feitos += 1
            except Exception as e:
                log(f"Frazão: falha no lote {l['id']}: {e}")
        if det:
            l["_det"] = det
            for k in ("area_constr", "area_terreno", "end_maps"):
                if det.get(k):
                    l[k] = det[k]
    log(f"Frazão: {len(vistos)} lotes, {feitos} páginas de detalhe")
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
        # título tipo "Casa 436 m² - Senhor do Bonfim-BA - Rua Atahualpa de Menezes, 191 - Centro"
        rua_mega = ""
        for x in ps[1:]:
            if re.match(r"(rua|r\.|avenida|av\.?|alameda|al\.|travessa|tv\.|estrada|rodovia|rod\.|pra[çc]a|largo|beco|via|viela)\b", x, re.I):
                rua_mega = x
                break
        if rua_mega:
            outros = [x for x in ps[1:] if x != rua_mega and not re.search(r"[-/]\s*[A-Z]{2}$", x)]
            bairro = outros[-1] if outros else ""
        area, area_txt = area_m2(tit)
        ar_mega = {}
        mt = re.search(r"terreno\s+(?:de\s+)?" + _NUM + _M2, tit, re.I)
        if mt:
            ar_mega["area_terreno"] = _num_br(mt.group(1))
        if area and not (mt and tit.lower().find(area_txt.lower()) >= mt.start()):
            ar_mega["area_constr"] = area
        lotes.append(finalizar({
            "id": f"mega:{cod or partes[-1]}", "site": "Mega", "url": url, "codigo": cod,
            "titulo": tit, "endereco": rua_mega, "bairro": bairro, "cidade": cidade, "uf": uf,
            "tipo": classificar(cat, tit), "tipo_site": cat,
            "imagem": img.group(1) if img else "", "area": area, "area_txt": area_txt,
            "pracas": pracas, "ocupacao": "Desocupado" if re.search(r"desocupad", tit, re.I) else "",
            "comitente": comit, "status": st, "instancia": instancia,
            "visitas": int(nums[0]) if len(nums) > 0 else None,
            "lances": int(nums[1]) if len(nums) > 1 else None,
            "desconto": int(desc.group(1)) if desc else 0,
            **ar_mega,
        }))
    return lotes


_COORD = re.compile(r"^\s*-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+\s*$")


def mega_endereco(html):
    """Endereço da página do lote da Mega: (texto da linha "Localização", coordenadas do mapa, q do mapa).
    O texto é o endereço exato que o site mostra; o mapa às vezes traz só coordenadas (e já vieram erradas)."""
    t = texto(html)
    m = re.search(r"Localiza[çc][ãa]o\s+([^|]{6,200}?,\s*[A-Z]{2})\s+Comitente", t)
    end = re.sub(r"\s+", " ", m.group(1)).strip() if m else ""
    q = re.search(r'maps/embed/v1/place\?[^"]*?[?&;]q=([^"&]+)', html)
    q = re.sub(r"\s+", " ", urllib.parse.unquote_plus(_html.unescape(q.group(1)))).strip()[:250] if q else ""
    return end, (q if _COORD.match(q) else ""), ("" if _COORD.match(q) else q)


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


# ---------------------------------------------------------------- Biasi Leilões
BIASI = "https://www.biasileiloes.com.br"
BIASI_DETALHES_POR_LEITURA = 150   # páginas de detalhe por ciclo (o resto fica para os próximos)


def _biasi_local(tit):
    """'Apartamento - Jardim Capitão - Sorocaba/SP' ou 'Casa no Centro em Muriaé/MG' -> (bairro, cidade, uf)."""
    t = re.sub(r"\s+", " ", tit or "").strip()
    partes = [p.strip() for p in t.split(" - ")]
    ultimo = partes[-1]
    if " em " in ultimo:
        ultimo = ultimo.rsplit(" em ", 1)[1]
    m = re.search(r"([^/]+?)\s*/\s*([A-Z]{2})\s*$", ultimo)
    cidade, uf = (m.group(1).strip(), m.group(2)) if m and m.group(2) in UFS else ("", "")
    bairro = ""
    if len(partes) >= 3:
        bairro = partes[-2]
    else:
        mb = re.search(r"\b(?:no|na|nos|nas|em)\s+(?:Bairro\s+|Setor\s+)?(.+?)(?:\s+em\s+[^/]+/[A-Z]{2})?$", partes[0])
        if mb:
            bairro = mb.group(1).strip(' "')
    return bairro, cidade, uf


def _biasi_tipo(*pistas):
    """Biasi só vende imóveis: tira a cidade do título (ex.: 'Lagoa do Carro') antes de classificar."""
    limpas = [re.split(r"\s+-\s+[^-]+/[A-Z]{2}\s*$|\s+em\s+[^/]+/[A-Z]{2}\s*$", p or "")[0] for p in pistas]
    t = classificar(*limpas)
    return "Outros" if t == "Veículo" else t


def biasi_parse(html):
    lotes = []
    for b in _blocos(html, '<a href="/sale/detail?id=')[0:]:
        m = re.match(r'<a href="/sale/detail\?id=(\d+)"', b)
        if not m:
            continue
        lid = m.group(1)
        tit = texto((re.search(r'class="card-title[^"]*"[^>]*>(.*?)</h5>', b, re.S) or [None, ""])[1])
        if not tit:
            continue
        img = re.search(r"background-image:\s*url\(([^)\"']+)", b)
        img = img.group(1).strip() if img else ""
        pracas = []
        for mm in re.finditer(r'<div class="([^"]*)">\s*<span[^>]*>\s*(\d)º Leil[ãa]o:\s*</span>\s*<span[^>]*>([^<]*)<', b):
            v = dinheiro(mm.group(3))
            if v:
                pracas.append({"nome": f"{mm.group(2)}ª praça", "data": None, "valor": v, "_passou": "expired" in mm.group(1)})
        if not pracas:
            v = dinheiro(texto((re.search(r'class="price-leiloes">(.*?)</div>\s*</div>', b, re.S) or [None, ""])[1]))
            if v:
                pracas.append({"nome": "Praça única", "data": None, "valor": v, "_passou": False})
        lan = re.search(r"(\d+)\s*Lances?\b", b)
        st = texto((re.search(r'class="label-md status-[a-z]+">(.*?)</div>', b, re.S) or [None, ""])[1])
        bairro, cidade, uf = _biasi_local(tit)
        area, area_txt = area_m2(tit)
        lotes.append({
            "id": f"biasi:{lid}", "site": "Biasi", "url": f"{BIASI}/sale/detail?id={lid}",
            "titulo": tit, "endereco": "", "bairro": bairro, "cidade": cidade, "uf": uf,
            "tipo": _biasi_tipo(tit), "tipo_site": "",
            "imagem": img, "area": area, "area_txt": area_txt, "pracas": pracas,
            "ocupacao": "Desocupado" if re.search(r"desocupad", tit, re.I) else ("Ocupado" if re.search(r"\bocupad", tit, re.I) else ""),
            "comitente": "", "status": st, "lances": int(lan.group(1)) if lan else None,
        })
    return lotes


def biasi_detalhe(html):
    """Datas das praças, endereço, área, ocupação e tipo, da página do lote."""
    t = texto(html)
    d = {"datas": {}, "v": 2}
    for mm in re.finditer(r"(\d)º Leil[ãa]o dia (\d{2}/\d{2}/\d{4}\s*às\s*\d{1,2}h\d{2})", t):
        d["datas"][mm.group(1)] = data_iso(mm.group(2))
    mm = re.search(r"\bData:\s*(\d{2}/\d{2}/\d{4}\s*às\s*\d{1,2}h\d{2})", t)
    if mm and not d["datas"]:
        d["datas"]["0"] = data_iso(mm.group(1))
    og = re.search(r'<meta property="og:description" content="([^"]*)"', html)
    if og:
        d["endereco"] = _html.unescape(og.group(1)).strip()
    oc = re.search(r'class="situacao-label">([^<]*)<', html)
    if oc and texto(oc.group(1)):
        d["ocupacao"] = texto(oc.group(1)).capitalize()
    tp = re.search(r"<strong>Tipo do Im[óo]vel:\s*</strong>\s*<span>([^<]*)<", html)
    if tp:
        d["tipo_site"] = texto(tp.group(1)).capitalize()
    for rot in ("Privativa", "Constru[íi]da", "Total", "do Terreno", "Útil"):
        ma = re.search(r"<strong>[ÁA]rea " + rot + r"[^<]*:\s*</strong>\s*<span>([^<]*)<", html)
        if ma:
            a, txt = area_m2(texto(ma.group(1)))
            if a:
                d["area"], d["area_txt"] = a, txt
                break
    if "area" not in d:
        desc = re.search(r"<strong>Descri[çc][ãa]o:\s*</strong>\s*<span>(.*?)</span>", html, re.S)
        a, txt = area_m2(texto(desc.group(1)) if desc else "")
        if not a:  # lotes do Itaú: "com a área de 275,00 m²" no texto da descrição
            ma = re.search(r"[áa]rea (?:total |constru[íi]da |privativa |[úu]til )?(?:de |com )?([\d\.]+(?:,\d+)?\s*m²)", t, re.I)
            a, txt = area_m2(ma.group(1)) if ma else (None, "")
        if a:
            d["area"], d["area_txt"] = a, txt
    rotulos = " ; ".join(f"Área {texto(a)} {texto(b)}" for a, b in re.findall(r"<strong>[ÁA]rea ([^<:]*):?\s*</strong>\s*<span>([^<]*)<", html))
    desc_t = re.search(r"<strong>Descri[çc][ãa]o:\s*</strong>\s*<span>(.*?)</span>", html, re.S)
    d.update(areas_de(rotulos + " ; " + (texto(desc_t.group(1)) if desc_t else "")))
    vi = re.search(r"Visitas\s*-\s*([\d\.]+)", t)
    if vi:
        d["visitas"] = int(vi.group(1).replace(".", ""))
    alvo = re.search(r"Valor alvo do Banco para Venda:\s*(R\$\s*[\d\.,]+)", t)
    if alvo:
        d["valor_alvo"] = dinheiro(alvo.group(1))
    return d


def _biasi_aplicar(l, d):
    datas = d.get("datas") or {}
    for i, p in enumerate(l["pracas"]):
        n = p["nome"][0] if p["nome"][0].isdigit() else "0"
        p["data"] = datas.get(n) or (datas.get("0") if len(l["pracas"]) == 1 else None) or datas.get(str(i + 1))
    for k in ("endereco", "ocupacao", "tipo_site", "area", "area_txt", "visitas", "valor_alvo", "area_constr", "area_terreno"):
        if d.get(k):
            l[k] = d[k]
    if d.get("tipo_site"):
        l["tipo"] = _biasi_tipo(d["tipo_site"], l["titulo"])
    if d.get("endereco") and not l.get("bairro"):
        partes = [p.strip() for p in d["endereco"].split(",")]
        if len(partes) >= 3:
            l["bairro"] = partes[-2]


def coletar_biasi(http, log, anteriores=None, limite=4000, completo=True):
    anteriores = anteriores or {}
    h = http.get(BIASI + "/")
    m = re.search(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', h)
    tok = m.group(1) if m else ""
    slugs = []
    for s in re.findall(r'href="/leiloes/([^"/?#]+)"', h):
        s = urllib.parse.unquote(s)
        if s not in slugs:
            slugs.append(s)

    def lista(slug):
        q = urllib.parse.urlencode({"categoria": "", "subcategoria": "", "term": "", "start": 0, "limit": 1000, "listaId": "",
                                    "slug": slug, "buscaImovel": "false", "estado": "", "bairro": "", "cidade": "",
                                    "segmento": "", "uf": "", "cid": "", "__RequestVerificationToken": tok})
        return http.get(f"{BIASI}/Sale/LotListSearch?{q}", {"X-Requested-With": "XMLHttpRequest", "Referer": BIASI + "/"})

    pagina = lista("")
    total = re.search(r'total="(\d+)"', pagina)
    lotes = {l["id"]: l for l in biasi_parse(pagina)}
    # nome do vendedor (banco): cada vendedor tem a própria lista
    for s in slugs[:12]:
        try:
            ids = set(re.findall(r"/sale/detail\?id=(\d+)", lista(s)))
        except Exception as e:
            log(f"Biasi: falha ao ler a lista de {s}: {e}")
            continue
        nome = {"itau": "Itaú", "santander": "Santander"}.get(s.lower(), s.replace("-", " ").title())
        for i in ids:
            if f"biasi:{i}" in lotes:
                lotes[f"biasi:{i}"]["comitente"] = nome
    agora = datetime.now().strftime("%Y-%m-%dT%H:%M")
    feitos = 0
    for l in lotes.values():
        ant = anteriores.get(l["id"]) or {}
        det = ant.get("_det")
        datas_ant = [p.get("data") for p in ant.get("pracas", []) if p.get("data")]
        precisa = not det or det.get("v") != 2 or len(ant.get("pracas", [])) != len(l["pracas"]) or (datas_ant and max(datas_ant) < agora)
        if precisa and feitos < BIASI_DETALHES_POR_LEITURA:
            try:
                det = biasi_detalhe(http.get(l["url"], {"Referer": BIASI + "/"}))
                feitos += 1
            except Exception as e:
                log(f"Biasi: falha no lote {l['id']}: {e}")
        if det:
            l["_det"] = det
            _biasi_aplicar(l, det)
        if not l.get("comitente") and ant.get("comitente"):
            l["comitente"] = ant["comitente"]
        tem_data = any(p.get("data") for p in l["pracas"])
        passou = [p.pop("_passou", False) for p in l["pracas"]]
        finalizar(l)
        if not tem_data:  # ainda sem a página de detalhe: praça atual = a que não passou
            atual = next((p for p, x in zip(l["pracas"], passou) if not x), l["pracas"][-1] if l["pracas"] else None)
            if atual:
                l["valor"], l["praca_atual"], l["encerrado"] = atual["valor"], atual["nome"], False
    log(f"Biasi: {len(lotes)} lotes (site diz {total.group(1) if total else '?'}), {feitos} páginas de detalhe")
    ok = bool(lotes) and (not total or len(lotes) >= int(total.group(1)) * 0.9)
    return list(lotes.values()), ok


# ---------------------------------------------------------------- Lance Judicial (Grupo Lance)
LJ = "https://www.lancejudicial.com.br"
LJ_DETALHES_POR_LEITURA = 150
_LJ_ABREV = [(r"^R\.\s*", "Rua "), (r"^Av\.?\s+", "Avenida "), (r"^Al\.\s*", "Alameda "), (r"^Tv\.\s*", "Travessa "),
             (r"^Rod\.\s*", "Rodovia "), (r"^Est\.\s*", "Estrada "), (r"^Pç\.?\s*", "Praça ")]
_LJ_FEATURE = re.compile(r"\b(quartos?|su[íi]tes?|vagas?|andar|banheiros?|dormit[óo]rios?|salas?|cozinha)\b|\d\s*m[²2]|^\s*(AT|AU|AC)\b", re.I)


def _lj_rua(s):
    s = re.sub(r"\s+", " ", s or "").strip(" ,.-")
    for rx, rep in _LJ_ABREV:
        s = re.sub(rx, rep, s, flags=re.I)
    return s


def lj_parse_lista(html, cat):
    """Cartões da lista de uma categoria (casas/apartamentos): link, título, valor, praças, judicial/extrajudicial."""
    ordem = []
    for b in html.split('<div class="card-item')[1:]:
        k = re.search(r'data-key="(\d+)"', b)
        t = re.search(r'class="card-title"\s+href="([^"]+)"[^>]*>(.*?)</a>', b, re.S)
        if not k or not t:
            continue
        href = _html.unescape(t.group(1))
        m = re.match(r"(?:https?://[^/]+)?/([a-z]{2})/[^/]+/imoveis/" + cat + r"/", href)
        if not m:
            continue
        url = href if href.startswith("http") else "https://www.grupolance.com.br" + href
        pracas = []
        for mm in re.finditer(r'badge[^"]*">\s*(\d)ª\s*Praça\s*</span>.*?<li>([^<]*)</li>\s*<li>([^<]*)</li>\s*<li[^>]*>\s*(R\$[^<]*)<', b, re.S):
            v = dinheiro(mm.group(4))
            if v:
                pracas.append({"nome": f"{mm.group(1)}ª praça", "data": data_iso(mm.group(3)), "valor": v})
        corpo = texto(b)
        ordem.append({
            "url": url, "uf_url": m.group(1).upper(), "lid": k.group(1), "titulo_site": texto(t.group(2)),
            "pracas": pracas, "valor_lista": dinheiro(corpo),
            "tag": "Extrajudicial" if re.search(r">\s*Extrajudicial\s*<", b) else ("Judicial" if re.search(r">\s*Judicial\s*<", b) else "")})
    return ordem


def lj_titulo(tit_site, cat, rua="", bairro_det=""):
    """('Casa 161 m² - Rua X, 249 - Bairro - Cidade - SP', tipo, bairro, cidade, uf, area) no mesmo padrão dos outros sites."""
    partes = [p.strip() for p in (tit_site or "").split(",") if p.strip()]
    cidade = uf = bairro = ""
    if partes:
        m = re.search(r"^(.*?)\s*/\s*([A-Z]{2})\s*$", partes[-1])
        if m:
            cidade, uf = m.group(1).strip(), m.group(2)
            partes = partes[:-1] if len(partes) > 1 else [partes[0]]
        elif len(partes) > 1 and re.fullmatch(r"[A-Z]{2}", partes[-1]):
            uf = partes[-1]
            partes = partes[:-1]
    mc = re.match(r"^(\d+\s+(?:casas|apartamentos))\s+em\s+(.+)$", cidade, re.I)
    if mc:
        partes = [mc.group(1)]
        cidade = mc.group(2).strip()
    rotulo = partes[0] if partes else ""
    multi = re.match(r"^(\d+)\s+(casas|apartamentos)\b", rotulo, re.I)
    if multi:
        m2 = re.search(r"\s+em\s+(.+)$", rotulo)
        if m2 and not cidade:
            cidade = m2.group(1).strip()
        rotulo = f"{multi.group(1)} {multi.group(2).lower()}"
        resto = []
    else:
        resto = partes[1:]
        rotulo = "Apartamento" if cat == "apartamentos" else "Casa"
        if partes and re.match(r"^(casa|sobrado|apartamento|cobertura|kitnet|flat|studio)", partes[0], re.I):
            rotulo = re.split(r"\s+", partes[0])[0].capitalize()
            if rotulo.lower() in ("cobertura", "kitnet", "flat", "studio"):
                rotulo = rotulo
    feat = [x for x in resto if _LJ_FEATURE.search(x)]
    livres = [x for x in resto if x not in feat]
    bairro = bairro_det or (livres[-1] if livres else "")
    area, _ = area_m2(" ".join(feat))
    vagas = ""
    for x in feat:
        mv = re.search(r"(\d+)\s*vagas?", x, re.I)
        if mv:
            vagas = f" ({int(mv.group(1)):02d} vaga{'s' if int(mv.group(1)) > 1 else ''})"
    tipo = "Apartamento" if cat == "apartamentos" else "Casa"
    ar_txt = f" {str(area).rstrip('0').rstrip('.').replace('.', ',')} m²" if area else ""
    cabeca = f"{rotulo[0].upper() + rotulo[1:]}{ar_txt}{vagas}"
    seg = [cabeca] + [x for x in (rua, bairro, cidade, uf) if x]
    return " - ".join(seg), tipo, bairro, cidade, uf, area


def lj_detalhe(html):
    """Página do lote: valores, praças, endereço exato, imagem. None = lote que não vale (Comprei/PGFN)."""
    t = texto(html)
    d = {"v": 1}
    if re.search(r"comprei\.pgfn\.gov\.br|LANCES OFERTADOS AQUI N[ÃA]O S[ÃA]O V[ÁA]LIDOS", t, re.I):
        d["comprei"] = True
        return d
    img = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', html) or \
        re.search(r'<meta[^>]+content="([^"]+)"[^>]+property="og:image"', html)
    d["imagem"] = _html.unescape(img.group(1)) if img else ""
    corte = re.search(r"(Lotes que podem te interessar|Veja tamb[ée]m)", t)
    corpo = t[:corte.start()] if corte else t
    ini = corpo.find("Descrição do lote")
    topo = corpo
    pracas = []
    d["av"] = dinheiro((re.search(r"Valor de avalia[çc][ãa]o\s*(R\$\s*[\d\.]+,\d{2})", topo) or [None, ""])[1])
    atual = dinheiro((re.search(r"Valor atual\s*(R\$\s*[\d\.]+,\d{2})", topo) or [None, ""])[1])
    inicial = dinheiro((re.search(r"(R\$\s*[\d\.]+,\d{2})\s*\(Valor inicial\)", topo) or [None, ""])[1])
    enc = data_iso((re.search(r"Encerramento do leil[ãa]o\s*(\d{2}/\d{2}/\d{4}[^R]{0,20})", topo) or [None, ""])[1])
    d["enc"] = enc
    if not pracas:
        v = atual or inicial
        if v:
            pracas = [{"nome": "Praça única", "data": enc, "valor": v}]
    d["pracas"] = pracas
    desc = corpo[ini:] if ini > 0 else corpo
    locs = re.findall(r"Localiza[çc][ãa]o\s+((?:R\.|Rua|Av\.?|Avenida|Al\.|Alameda|Tv\.|Travessa|Rod\.|Rodovia|Est\.|Estrada|Pra[çc]a|Largo|Via|Viela|Beco)[^|]{3,160}?),\s*([^,]{2,60}),\s*([A-Z]{2})\b", desc)
    if locs:
        rua, cidade, uf = locs[-1]
        pr = [x.strip() for x in rua.split(",")]
        _num = r"(?:n[º°o]\.?\s*)?\d+[A-Za-z]?|s/?n"
        if len(pr) >= 3 and re.fullmatch(_num, pr[1], re.I):
            d["bairro"] = ", ".join(pr[2:])
            rua = ", ".join(pr[:2])
        elif len(pr) >= 2 and not re.fullmatch(_num, pr[1], re.I):
            d["bairro"] = ", ".join(pr[1:])
            rua = pr[0]
        d["rua"] = _lj_rua(rua)
        d["cidade"], d["uf"] = cidade.strip(), uf
    d["desc"] = desc[:3000]
    d.update(areas_de(desc))
    if re.search(r"desocupad", desc, re.I):
        d["ocupacao"] = "Desocupado"
    elif re.search(r"\bocupad[oa]s?\b", desc, re.I) and not re.search(r"n[ãa]o foi poss[íi]vel verificar", desc, re.I):
        d["ocupacao"] = "Ocupado"
    return d


def coletar_lancejudicial(http, log, anteriores=None, limite=4000, completo=True):
    anteriores = anteriores or {}
    achados = {}
    esperado = {}
    ok = True
    for cat in ("casas", "apartamentos"):
        for pag in range(1, 8):
            url = f"{LJ}/imoveis/{cat}" + (f"?pagina={pag}" if pag > 1 else "")
            try:
                h = http.get(url)
            except Bloqueado:
                raise
            except Exception as e:
                log(f"Lance Judicial: falha na lista {cat} p{pag}: {e}")
                ok = ok and pag > 1
                break
            ls = lj_parse_lista(h, cat)
            novos = [l for l in ls if l["lid"] not in achados]
            for l in novos:
                l["cat"] = cat
                achados[l["lid"]] = l
            if pag == 1:
                tot = re.search(r"%s\s+(\d+)" % ("Casas" if cat == "casas" else "Apartamentos"), texto(h))
                esperado[cat] = int(tot.group(1)) if tot else 0
            if not novos:
                break
        n = sum(1 for l in achados.values() if l["cat"] == cat)
        log(f"Lance Judicial/{cat}: {n} lotes (site diz {esperado.get(cat)})")
        if esperado.get(cat) and n < esperado[cat] * 0.9:
            ok = False
    agora = datetime.now().strftime("%Y-%m-%dT%H:%M")
    lotes, feitos, comprei = [], 0, 0
    for lid, c in achados.items():
        id_ = f"lj:{lid}"
        ant = anteriores.get(id_) or {}
        det = ant.get("_det")
        datas = [p.get("data") for p in ant.get("pracas", []) if p.get("data")]
        precisa = not det or det.get("v") != 1 or (datas and max(datas) < agora)
        if precisa and feitos < LJ_DETALHES_POR_LEITURA:
            try:
                det = lj_detalhe(http.get(c["url"], {"Referer": LJ + "/"}))
                feitos += 1
            except Bloqueado:
                raise
            except Exception as e:
                log(f"Lance Judicial: falha no lote {lid}: {e}")
        det = det or {}
        if det.get("comprei"):
            comprei += 1
            continue
        titulo, tipo, bairro, cidade, uf, area = lj_titulo(c["titulo_site"], c["cat"], det.get("rua", ""), det.get("bairro", ""))
        cidade = det.get("cidade") or cidade
        uf = det.get("uf") or uf or c["uf_url"]
        pracas = c.get("pracas") or det.get("pracas") or ([{"nome": "Praça única", "data": None, "valor": c["valor_lista"]}] if c.get("valor_lista") else [])
        if not det and not pracas:
            continue
        l = {"id": id_, "site": "Lance Judicial", "url": c["url"], "codigo": lid,
             "titulo": titulo, "endereco": det.get("rua", ""), "bairro": bairro, "cidade": cidade, "uf": uf,
             "tipo": tipo, "tipo_site": "", "imagem": det.get("imagem", ""),
             "area": area, "area_txt": f"{area} m²" if area else "", "pracas": pracas,
             "ocupacao": det.get("ocupacao", ""), "comitente": c.get("tag", ""), "status": ""}
        if det.get("rua"):
            l["end_maps"] = endereco_maps(f"{det['rua']}, {cidade}, {uf}")
        for k in ("area_constr", "area_terreno"):
            if det.get(k):
                l[k] = det[k]
        if area and not l.get("area_constr") and tipo == "Apartamento":
            l["area_constr"] = area
        if det.get("av"):
            l["avaliacao"] = det["av"]
        if det:
            l["_det"] = {k: v for k, v in det.items() if k != "desc"}
        if len(pracas) == 1 and det.get("av") and pracas[0]["valor"] and pracas[0]["valor"] < det["av"]:
            l["desconto"] = round((1 - pracas[0]["valor"] / det["av"]) * 100)
        lotes.append(finalizar(l))
    log(f"Lance Judicial: {len(lotes)} lotes ({comprei} do Comprei/PGFN ignorados), {feitos} páginas de detalhe")
    return lotes, ok and bool(achados)


SITES = {
    "Mega": coletar_mega,
    "Frazão": coletar_frazao,
    "Zuk": coletar_zuk,
    "Biasi": coletar_biasi,
    "Lance Judicial": coletar_lancejudicial,
}
