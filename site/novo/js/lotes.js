/* LeilãoTrack · lotes: lista, filtros, Top 15, ficha do lote, alertas e calculadora */
"use strict";
const ORDENS = [
  ["desconto", "Maior desconto", "sobre a 1ª praça"], ["menor", "Menor valor", ""], ["maior", "Maior valor", ""],
  ["encerra", "Encerra primeiro", "próximos leilões no topo"], ["recentes", "Mais recentes", "entrou por último"], ["lances", "Mais lances", "mais disputados"]];
const FILTRO0 = {sites: [], tipos: [], pracas: [], ocup: [], ufs: [], cidades: [], vmin: 0, vmax: 0, dmin: 0, prazo: "", novos: false, fecham: false, top: true};
const VMAX = 3000000;
const CHAVES_LISTA = ["sites", "tipos", "pracas", "ocup", "ufs", "cidades"];

function filtroSalvo() {
  const f = Object.assign(JSON.parse(JSON.stringify(FILTRO0)), LS.get("filtro", {}));
  for (const k of CHAVES_LISTA) if (!Array.isArray(f[k])) f[k] = []; else f[k] = f[k].filter(x => typeof x === "string").slice(0, 60);
  for (const k of ["vmin", "vmax", "dmin"]) f[k] = Math.max(0, Number(f[k]) || 0);
  if (!["", "hoje", "7", "30"].includes(f.prazo)) f.prazo = "";
  f.novos = !!f.novos; f.fecham = !!f.fecham; f.top = !!f.top;
  return f;
}
const S = {lotes: [], eventos: [], estado: {}, versao: null, filtro: filtroSalvo(),
  ordem: ORDENS.some(o => o[0] === LS.get("ordem")) ? LS.get("ordem") : "desconto",
  busca: "", aba: "inicio", lista: [], mostrados: 0, rascunho: null, cidadeBusca: "", top: null};

/* ---------------- dados (arquivo privado, só para quem está logado) ---------------- */
async function lerJSON(buf) {
  const u = new Uint8Array(buf);
  let txt;
  if (u[0] === 0x1f && u[1] === 0x8b) txt = await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  else txt = new TextDecoder().decode(u);
  return JSON.parse(txt);
}
async function baixarLotes(forcar) {
  const v = await lerJSON(await SB.arquivo("versao.json"));
  if (!forcar && S.versao && S.versao === v.gerado) return false;
  const arq = /^lotes-[a-f0-9]{32}\.json\.gz$/.test(v.arquivo || "") ? v.arquivo : "lotes.json.gz";
  const p = await lerJSON(await SB.arquivo(arq));
  aplicarPacote(p); S.versao = v.gerado;
  return true;
}
function aplicarPacote(p) {
  const corte = fmtLocal(Date.now() - 864e5);
  S.lotes = (Array.isArray(p.lotes) ? p.lotes : []).filter(l => l && typeof l.id === "string" && l.id.length < 90 && typeof l.titulo === "string");
  S.eventos = (Array.isArray(p.eventos) ? p.eventos : []).filter(e => e && typeof e.id === "string" && typeof e.quando === "string").slice(0, 500);
  S.estado = p.estado && typeof p.estado === "object" ? p.estado : {};
  for (const l of S.lotes) {
    l.fav = CONTA.favs.has(l.id);
    l.novo = !l.primeira_leitura && (l.visto || "") >= corte;
    l._busca = semAcento([l.titulo, l.bairro, l.cidade, l.uf, l.endereco, l.codigo, l.id, l.comitente, l.tipo, l.site].join(" "));
    l._enc = l.encerra ? dt(l.encerra).getTime() : Infinity;
    if (isNaN(l._enc)) l._enc = Infinity;
  }
  _rankCache = {k: null, v: null};
}
function marcarFavs() { for (const l of S.lotes) l.fav = CONTA.favs.has(l.id); }

/* ---------------- filtros ---------------- */
const pracaCurta = n => { n = (n || "").toLowerCase(); if (/2/.test(n)) return "2ª praça"; if (/1/.test(n)) return "1ª praça"; if (/[uú]nic/.test(n)) return "Praça única"; return n ? n.charAt(0).toUpperCase() + n.slice(1) : "Leilão"; };
const pracaChave = n => { n = (n || "").toLowerCase(); if (/2/.test(n)) return "2ª praça"; if (/1/.test(n)) return "1ª praça"; return "Praça única"; };
function ocupChave(l) { const o = (l.ocupacao || "").toLowerCase(); if (o.includes("desocup")) return "Desocupado"; if (o.includes("ocup")) return "Ocupado"; return "Não informado"; }
function bateComPerfil(l) {
  const p = CONTA.prefs;
  if (p.ufs.length && !p.ufs.includes(l.uf)) return false;
  if (p.tipos.length && !p.tipos.includes(l.tipo)) return false;
  return true;
}
function filtrar(base, f, ignorar) {
  const agora = Date.now(); const q = semAcento(S.busca).trim().split(/\s+/).filter(Boolean);
  return base.filter(l => {
    if (!l.ativo && S.aba !== "favoritos") return false;
    if (l.encerrado && S.aba !== "favoritos") return false;
    if (q.length && !q.every(w => l._busca.includes(w))) return false;
    if (f.sites.length && !f.sites.includes(l.site)) return false;
    if (f.tipos.length && !f.tipos.includes(l.tipo)) return false;
    if (f.pracas.length && !f.pracas.includes(pracaChave(l.praca_atual))) return false;
    if (f.ocup.length && !f.ocup.includes(ocupChave(l))) return false;
    if (f.ufs.length && !f.ufs.includes(l.uf)) return false;
    if (ignorar !== "cidades" && f.cidades.length && !f.cidades.includes(l.cidade + "/" + l.uf)) return false;
    if (f.vmin && (l.valor || 0) < f.vmin) return false;
    if (f.vmax && f.vmax < VMAX && (l.valor || 0) > f.vmax) return false;
    if (f.dmin && (l.desconto || 0) < f.dmin) return false;
    if (f.prazo) { const lim = {hoje: new Date().setHours(23, 59, 59, 999), "7": agora + 7 * 864e5, "30": agora + 30 * 864e5}[f.prazo]; if (!(l._enc <= lim)) return false; }
    if (f.novos && !l.novo) return false;
    if (f.fecham && !(l._enc - agora <= 48 * 36e5)) return false;
    return true;
  });
}
function ordenar(a) {
  const by = {
    desconto: (x, y) => (y.desconto || 0) - (x.desconto || 0) || (x.valor || 0) - (y.valor || 0),
    menor: (x, y) => (x.valor || 9e12) - (y.valor || 9e12), maior: (x, y) => (y.valor || 0) - (x.valor || 0),
    encerra: (x, y) => x._enc - y._enc, recentes: (x, y) => (y.visto || "").localeCompare(x.visto || "") || x._enc - y._enc,
    lances: (x, y) => (y.lances || 0) - (x.lances || 0)}[S.ordem];
  return a.sort(by);
}
function qtdFiltros(f) { return CHAVES_LISTA.reduce((n, k) => n + (f[k].length ? 1 : 0), 0) + (f.vmin || (f.vmax && f.vmax < VMAX) ? 1 : 0) + (f.dmin ? 1 : 0) + (f.prazo ? 1 : 0); }
function salvarFiltro() { LS.set("filtro", S.filtro); }

/* ---------------- Top 15: triagem pelos dados do anúncio, no perfil de cada pessoa ---------------- */
const RUIM_TOP = /direito|parte ideal|fra[çc][ãa]o|nua[ -]propriedade|usufruto|mea[çc][ãa]o|\d+(,\d+)?\s*%|cota parte|quinh/i;
const GRANDE_TOP = new Set(["são paulo", "santo andré", "são bernardo do campo", "são caetano do sul", "guarulhos", "osasco", "barueri", "santos", "campinas", "jundiaí", "diadema", "mauá", "carapicuíba", "taboão da serra", "cotia", "mogi das cruzes", "rio de janeiro", "niterói", "belo horizonte", "curitiba", "porto alegre", "brasília", "salvador", "recife", "fortaleza", "florianópolis", "goiânia"]);
const MEDIA_TOP = new Set(["sorocaba", "ribeirão preto", "são josé dos campos", "praia grande", "são vicente", "guarujá", "bauru", "piracicaba", "taubaté", "santana de parnaíba", "indaiatuba", "valinhos", "americana", "limeira", "são josé do rio preto", "franca", "atibaia", "londrina", "maringá", "joinville", "uberlândia", "juiz de fora", "contagem", "são gonçalo", "nova iguaçu", "duque de caxias", "vila velha", "vitória", "natal", "joão pessoa", "maceió", "aracaju", "cuiabá", "campo grande", "balneário camboriú"]);
let _rankCache = {k: null, v: null};
function rankear(lista) {
  const chave = (S.versao || "") + "|" + CONTA.prefs.tipos.join() + "|" + lista.length + "|" + (lista[0] || {}).id + "|" + (lista[lista.length - 1] || {}).id;
  if (_rankCache.k === chave) return _rankCache.v;
  const v = rankearCalc(lista); _rankCache = {k: chave, v}; return v;
}
function rankearCalc(lista) {
  const tipos = CONTA.prefs.tipos.length ? CONTA.prefs.tipos : ["Casa", "Apartamento"];
  const agora = Date.now(), med = new Map(), medT = new Map();
  const ok = lista.filter(l => tipos.includes(l.tipo) && l.ativo !== false && !l.encerrado);
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const l of ok) if (l.area >= 25 && l.referencia) { const m = l.referencia / l.area; push(med, l.cidade + "|" + l.tipo, m); push(medT, l.tipo, m); }
  const mediana = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  const res = [];
  for (const l of ok) {
    if (RUIM_TOP.test(l.titulo) || !(l.area >= 25) || !(l.valor >= 30000) || !l.referencia || l._enc - agora < 60 * 36e5) continue;
    const dfe = Math.max(0, 1 - l.valor / l.referencia), m2 = l.valor / l.area;
    const lc = med.get(l.cidade + "|" + l.tipo) || [];
    const ref = lc.length >= 5 ? mediana(lc) : mediana(medT.get(l.tipo) || [m2]);
    const rel = m2 / ref, cid = (l.cidade || "").toLowerCase();
    const banco = /santander|bradesco|ita[uú]|daycoval|caixa|inter|enforce|banco/i.test(l.comitente || "");
    const desocup = /desocup/i.test(l.ocupacao || "");
    let s = Math.min(dfe, .6) / .6 * 35 + Math.max(0, Math.min(1, (1 - rel) / .6)) * 25;
    s += GRANDE_TOP.has(cid) ? 15 : MEDIA_TOP.has(cid) ? 9 : 4; s += l.tipo === "Apartamento" ? 3 : 0; s += banco ? 10 : 4; s += desocup ? 7 : 0; s += l.valor >= 120000 && l.valor <= 900000 ? 5 : 0;
    const motivos = [], alertas = [];
    if (dfe >= .2) motivos.push(`${Math.round(dfe * 100)}% abaixo da avaliação`);
    if (rel < .85) motivos.push(`R$ ${Math.round(m2).toLocaleString("pt-BR")}/m² (referência R$ ${Math.round(ref).toLocaleString("pt-BR")}/m²)`);
    if (GRANDE_TOP.has(cid)) motivos.push("cidade com muita procura"); else if (MEDIA_TOP.has(cid)) motivos.push("cidade com boa procura");
    if (banco) motivos.push("venda de banco: matrícula tende a ser mais limpa"); else alertas.push("leilão judicial: conferir matrícula, herdeiros e débitos");
    if (desocup) motivos.push("anunciado como desocupado"); else alertas.push("ocupação não informada");
    if (/terreno de/i.test(l.titulo) && l.tipo !== "Terreno") alertas.push("a área é do terreno, não a construída");
    if (rel < .35) alertas.push("preço por m² baixo demais: conferir área e estado do imóvel");
    if ((l.lances || 0) > 0) alertas.push(`${l.lances} lance(s) já dados`);
    res.push({l, s, motivos, alertas});
  }
  res.sort((a, b) => b.s - a.s);
  return res;
}
function textoPerfil() {
  const p = CONTA.prefs;
  return `${p.ufs.length ? juntar(p.ufs) : "Todos os estados"} · ${p.tipos.length ? juntar(p.tipos) : "Casa e Apartamento"}`;
}

/* ---------------- lista ---------------- */
function render() {
  if (S.aba !== "inicio" && S.aba !== "favoritos") return;
  const base = S.aba === "favoritos" ? S.lotes.filter(l => l.fav) : S.lotes;
  const f = S.filtro;
  const top = f.top && S.aba === "inicio";
  S.top = null;
  if (top) {
    const r = rankear(filtrar(base, Object.assign({}, f, {top: false, novos: false, fecham: false})).filter(bateComPerfil)).slice(0, 15);
    S.top = new Map(r.map((x, i) => [x.l.id, Object.assign({}, x, {pos: i + 1})])); S.lista = r.map(x => x.l);
  } else S.lista = ordenar(filtrar(base, f));
  const semRapido = filtrar(base, Object.assign({}, f, {novos: false, fecham: false}));
  const agora = Date.now();
  $("#c-ativos").textContent = semRapido.length.toLocaleString("pt-BR");
  $("#c-novos").textContent = semRapido.filter(l => l.novo).length;
  $("#c-fecham").textContent = semRapido.filter(l => l._enc - agora <= 48 * 36e5 && l._enc > agora).length;
  $("#n-ativos").classList.toggle("on", !f.novos && !f.fecham && !top); $("#n-top").classList.toggle("on", top); $("#btn-ordem").hidden = top;
  $("#n-novos").classList.toggle("on", f.novos); $("#n-fecham").classList.toggle("on", f.fecham);
  $(".numeros").hidden = S.aba === "favoritos";
  const n = qtdFiltros(f); const b = $("#badge"); b.hidden = !n; b.textContent = n;
  $("#ordem-nome").textContent = ORDENS.find(o => o[0] === S.ordem)[1];
  $("#titulo-lista").textContent = S.aba === "favoritos" ? "Favoritos" : top ? "Seu Top 15" : f.novos ? "Novidades" : f.fecham ? "Fecham em 48h" : "Lotes";
  $("#qtd").textContent = `${S.lista.length.toLocaleString("pt-BR")} lotes`;
  $("#top-pref").hidden = !top; $("#top-pref-txt").textContent = textoPerfil();
  renderChips();
  S.mostrados = 0;
  $("#grade").innerHTML = top && S.lista.length ? `<div class="nota-top vidro"><b>Ranking automático</b>, refeito a cada leitura dos sites, no seu perfil e nos filtros que você escolher. Pesa desconto sobre a avaliação, preço por m², procura na cidade, venda de banco e ocupação. Ficam de fora direitos, frações e lotes que fecham em menos de 60 horas. É uma triagem: faça a perícia antes de dar lance.</div>` : "";
  maisCards();
  if (!S.lista.length) $("#grade").innerHTML = `<div class="vazio vidro">${!S.lotes.length ? "Ainda não há lotes. A primeira leitura dos sites pode levar alguns minutos." : S.aba === "favoritos" ? "Toque no ♡ de um lote para acompanhá-lo aqui." : top ? "Nenhum lote do seu perfil entrou no ranking agora. Toque em <b>Ajustar</b> para ampliar estados ou tipos." : "Nenhum lote com esses filtros."}</div>`;
}
const coracao = on => `<svg width="19" height="19" viewBox="0 0 24 24" fill="${on ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`;
function card(l) {
  const urg = l._enc - Date.now() < 48 * 36e5;
  const t = S.top && S.top.get(l.id);
  const desc = Math.round(Number(l.desconto) || 0);
  return `<button class="card vidro" data-id="${esc(l.id)}">
    ${foto(l)}
    <div class="info">
      <div>
        <div class="topo-card">${t ? `<span class="rank">#${t.pos}</span>` : ""}<i class="dot" style="background:${SITE_COR[l.site] || "#999"}"></i>${esc(l.site)}${l.novo ? '<span class="novo">· novo</span>' : ""}${!l.ativo ? " · saiu do site" : ""}</div>
        <div class="tit">${esc(l.titulo)}</div>
        ${t ? `<div class="motivo">${esc(t.motivos.slice(0, 2).join(" · "))}</div>` : ""}
        <div class="loc">${esc([l.bairro && !l.titulo.includes(l.bairro) ? l.bairro : "", l.cidade && (l.cidade + (l.uf ? " · " + l.uf : ""))].filter(Boolean).join(" · ") || l.tipo)}</div>
      </div>
      <div class="baixo"><span class="preco">${fmtBRL(l.valor)}</span><span class="quando ${urg ? "urg" : ""}">${esc(pracaCurta(l.praca_atual))} · ${l.encerra ? esc(fmtData(l.encerra).split(" ")[0]) : "—"}</span></div>
    </div>
    ${desc > 0 ? `<span class="desc">-${desc}%</span>` : ""}
    <span class="coracao ${l.fav ? "on" : ""}" data-fav="${esc(l.id)}" role="button" aria-label="Favoritar">${coracao(l.fav)}</span>
  </button>`;
}
function maisCards() {
  const prox = S.lista.slice(S.mostrados, S.mostrados + 40); if (!prox.length) return;
  $("#grade").insertAdjacentHTML("beforeend", prox.map(card).join("")); S.mostrados += prox.length;
}
new IntersectionObserver(es => { if (es[0].isIntersecting) maisCards(); }, {rootMargin: "600px"}).observe($("#sentinela"));

function renderChips() {
  const f = S.filtro; const c = [];
  const rem = (k, v, t) => c.push(`<button class="chip on" data-rem="${k}" data-v="${esc(v)}">${esc(t)} <span class="x">×</span></button>`);
  f.tipos.forEach(t => rem("tipos", t, t)); f.ufs.forEach(t => rem("ufs", t, t)); f.cidades.forEach(t => rem("cidades", t, t.split("/")[0]));
  f.sites.forEach(t => rem("sites", t, t)); f.pracas.forEach(t => rem("pracas", t, t)); f.ocup.forEach(t => rem("ocup", t, t));
  if (f.vmin || (f.vmax && f.vmax < VMAX)) rem("valor", "", f.vmin && f.vmax && f.vmax < VMAX ? `${fmtCurto(f.vmin)}–${fmtCurto(f.vmax).replace("R$ ", "")}` : f.vmin ? `a partir de ${fmtCurto(f.vmin)}` : `até ${fmtCurto(f.vmax)}`);
  if (f.dmin) rem("dmin", "", `${f.dmin}%+ off`);
  if (f.prazo) rem("prazo", "", {hoje: "Fecha hoje", "7": "Até 7 dias", "30": "Até 30 dias"}[f.prazo]);
  [["Desocupado", "ocup"]].filter(([v, k]) => !f[k].includes(v)).forEach(([v, k]) => c.push(`<button class="chip vidro" data-add="${k}" data-v="${v}">${v}</button>`));
  if (!f.dmin) c.push(`<button class="chip vidro" data-add="dmin" data-v="30">Desconto 30%+</button>`);
  if (!f.vmax) c.push(`<button class="chip vidro" data-add="vmax" data-v="400000">Até R$ 400 mil</button>`);
  $("#chips").innerHTML = c.join("");
}
$("#chips").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return; const f = S.filtro;
  if (b.dataset.rem) { const k = b.dataset.rem, v = b.dataset.v;
    if (k === "valor") { f.vmin = 0; f.vmax = 0; } else if (k === "dmin") f.dmin = 0; else if (k === "prazo") f.prazo = ""; else if (CHAVES_LISTA.includes(k)) f[k] = f[k].filter(x => x !== v); }
  if (b.dataset.add) { const k = b.dataset.add, v = b.dataset.v; if (k === "dmin") f.dmin = +v; else if (k === "vmax") f.vmax = +v; else if (CHAVES_LISTA.includes(k)) f[k].push(v); }
  salvarFiltro(); render();
});
$("#grade").addEventListener("click", async e => {
  const fav = e.target.closest("[data-fav]");
  if (fav) { e.stopPropagation(); const on = await alternarFav(fav.dataset.fav); fav.classList.toggle("on", on); fav.innerHTML = coracao(on); return; }
  const c = e.target.closest(".card"); if (c) abrirLote(c.dataset.id);
});
async function alternarFav(id) {
  const l = S.lotes.find(x => x.id === id); if (!l) return false;
  const on = !l.fav; l.fav = on;
  toast(on ? "Adicionado aos favoritos" : "Removido dos favoritos");
  const ok = await CONTA.favoritar(id, on);
  if (!ok) { l.fav = !on; toast("Não consegui salvar o favorito. Confira a conexão."); }
  if (S.aba === "favoritos") render();
  return l.fav;
}
let tBusca; $("#busca").addEventListener("input", e => { clearTimeout(tBusca); tBusca = setTimeout(() => { S.busca = e.target.value.slice(0, 80); render(); }, 180); });
$("#n-ativos").addEventListener("click", () => { S.filtro.novos = false; S.filtro.fecham = false; S.filtro.top = false; salvarFiltro(); render(); });
$("#n-top").addEventListener("click", () => { S.filtro.top = !S.filtro.top; S.filtro.novos = false; S.filtro.fecham = false; salvarFiltro(); render(); window.scrollTo({top: 0, behavior: "smooth"}); });
$("#n-novos").addEventListener("click", () => { S.filtro.novos = !S.filtro.novos; S.filtro.fecham = false; S.filtro.top = false; salvarFiltro(); render(); });
$("#n-fecham").addEventListener("click", () => { S.filtro.fecham = !S.filtro.fecham; S.filtro.novos = false; S.filtro.top = false; salvarFiltro(); render(); });
$("#top-pref-ajustar").addEventListener("click", () => abrirPref(false));

/* ---------------- folha de filtros ---------------- */
$("#btn-filtros").addEventListener("click", () => { S.rascunho = JSON.parse(JSON.stringify(S.filtro)); S.cidadeBusca = ""; renderFiltros(); abrir("#folha-filtros"); });
function contar(arr, fn) { const m = new Map(); arr.forEach(l => { const k = fn(l); if (k) m.set(k, (m.get(k) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); }
function grupo(titulo, chave, opcoes) {
  const f = S.rascunho;
  return `<div class="sec">${titulo}</div><div class="chips wrap">${opcoes.map(([v, n]) => `<button class="chip ${f[chave].includes(v) ? "on" : "vidro"}" data-k="${chave}" data-v="${esc(v)}">${esc(String(v).split("/")[0])}${n != null ? ` <small style="opacity:.6">${n}</small>` : ""}</button>`).join("")}</div>`;
}
function renderFiltros() {
  const f = S.rascunho; const vivos = S.lotes.filter(l => l.ativo && !l.encerrado);
  const ufs = contar(vivos, l => l.uf);
  const baseCid = f.ufs.length ? vivos.filter(l => f.ufs.includes(l.uf)) : vivos;
  let cids = contar(baseCid, l => l.cidade ? l.cidade + "/" + l.uf : "");
  const qb = semAcento(S.cidadeBusca);
  if (qb) cids = cids.filter(([c]) => semAcento(c).includes(qb));
  const selCid = f.cidades.filter(c => !cids.slice(0, 14).some(x => x[0] === c)).map(c => [c, null]);
  const vmax = f.vmax || VMAX;
  $("#corpo-filtros").innerHTML =
    grupo("Sites", "sites", ["Frazão", "Zuk", "Mega"].map(s => [s, vivos.filter(l => l.site === s).length])) +
    grupo("Tipo de bem", "tipos", contar(vivos, l => l.tipo)) +
    grupo("Praça", "pracas", ["1ª praça", "2ª praça", "Praça única"].map(p => [p, null])) +
    grupo("Ocupação", "ocup", ["Desocupado", "Ocupado", "Não informado"].map(p => [p, null])) +
    `<div class="sec">Faixa de valor <span id="lbl-valor"></span></div>
     <div class="faixa"><div class="trilho"></div><div class="ativo" id="faixa-ativa"></div>
       <input type="range" id="vmin" min="0" max="${VMAX}" step="10000" value="${f.vmin || 0}" aria-label="Valor mínimo">
       <input type="range" id="vmax" min="0" max="${VMAX}" step="10000" value="${vmax}" aria-label="Valor máximo"></div>
     <div class="chips wrap" style="margin-top:8px">${[150000, 300000, 500000, 1000000].map(v => `<button class="chip ${f.vmax === v && !f.vmin ? "on" : "vidro"}" data-vmax="${v}">até ${fmtCurto(v)}</button>`).join("")}</div>
     <div class="sec">Desconto mínimo <span id="lbl-desc"></span></div>
     <div class="faixa laranja"><div class="trilho"></div><div class="ativo" id="desc-ativa"></div>
       <input type="range" id="dmin" min="0" max="80" step="5" value="${f.dmin || 0}" aria-label="Desconto mínimo"></div>` +
    `<div class="sec">Encerra em</div><div class="chips wrap">${[["hoje", "Hoje"], ["7", "7 dias"], ["30", "30 dias"], ["", "Qualquer data"]].map(([v, t]) => `<button class="chip ${f.prazo === v ? "on" : "vidro"}" data-prazo="${v}">${t}</button>`).join("")}</div>` +
    grupo("Estado", "ufs", ufs) +
    `<div class="sec">Cidade</div><input class="mini-busca" id="busca-cidade" placeholder="Procurar cidade…" maxlength="60" value="${esc(S.cidadeBusca)}">` +
    `<div class="chips wrap">${selCid.concat(cids.slice(0, 14)).map(([v, n]) => `<button class="chip ${f.cidades.includes(v) ? "on" : "vidro"}" data-k="cidades" data-v="${esc(v)}">${esc(v.split("/")[0])} <small style="opacity:.6">${n ?? ""}</small></button>`).join("") || '<span class="texto-ajuda">Nenhuma cidade encontrada.</span>'}</div>`;
  atualizarFaixas();
  const bc = $("#busca-cidade");
  bc.addEventListener("input", () => { S.cidadeBusca = bc.value; const pos = bc.selectionStart; renderFiltros(); const n = $("#busca-cidade"); n.focus(); n.setSelectionRange(pos, pos); });
  ["vmin", "vmax", "dmin"].forEach(id => $("#" + id).addEventListener("input", atualizarFaixas));
}
function atualizarFaixas() {
  const f = S.rascunho; let a = +$("#vmin").value, b = +$("#vmax").value; if (a > b) [a, b] = [b, a];
  f.vmin = a; f.vmax = b >= VMAX ? 0 : b; f.dmin = +$("#dmin").value;
  $("#faixa-ativa").style.left = a / VMAX * 100 + "%"; $("#faixa-ativa").style.width = (b - a) / VMAX * 100 + "%";
  $("#desc-ativa").style.left = "0"; $("#desc-ativa").style.width = f.dmin / 80 * 100 + "%";
  $("#lbl-valor").textContent = `${a ? fmtCurto(a) : "R$ 0"} – ${b >= VMAX ? "sem limite" : fmtCurto(b)}`;
  $("#lbl-desc").textContent = f.dmin ? f.dmin + "%" : "qualquer";
  clearTimeout(window._ct); window._ct = setTimeout(contarRascunho, 80);
}
function contarRascunho() {
  const n = filtrar(S.aba === "favoritos" ? S.lotes.filter(l => l.fav) : S.lotes, S.rascunho).length;
  $("#aplicar").textContent = `Ver ${n.toLocaleString("pt-BR")} lotes`;
}
$("#corpo-filtros").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return; const f = S.rascunho;
  if (b.dataset.k && CHAVES_LISTA.includes(b.dataset.k)) { const k = b.dataset.k, v = b.dataset.v; f[k] = f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v];
    if (k === "ufs") f.cidades = f.cidades.filter(c => !f.ufs.length || f.ufs.includes(c.split("/").pop())); }
  if (b.dataset.vmax) { f.vmin = 0; f.vmax = f.vmax === +b.dataset.vmax ? 0 : +b.dataset.vmax; }
  if (b.dataset.prazo != null) f.prazo = b.dataset.prazo;
  if (b.dataset.k && b.dataset.k !== "ufs") { const on = f[b.dataset.k].includes(b.dataset.v); b.classList.toggle("on", on); b.classList.toggle("vidro", !on); clearTimeout(window._ct); window._ct = setTimeout(contarRascunho, 60); return; }
  const sc = $("#corpo-filtros").scrollTop; renderFiltros(); $("#corpo-filtros").scrollTop = sc;
});
$("#limpar").addEventListener("click", () => { S.rascunho = Object.assign(JSON.parse(JSON.stringify(FILTRO0)), {novos: S.filtro.novos, fecham: S.filtro.fecham, top: S.filtro.top}); renderFiltros(); });
$("#aplicar").addEventListener("click", () => { S.filtro = S.rascunho; salvarFiltro(); fechar(); render(); window.scrollTo({top: 0, behavior: "smooth"}); });

/* ---------------- ordenação ---------------- */
$("#btn-ordem").addEventListener("click", () => {
  $("#corpo-ordem").innerHTML = ORDENS.map(([k, t, s]) => `<button class="opcao ${S.ordem === k ? "on" : ""}" data-o="${k}"><span><b>${t}</b>${s ? `<small>${s}</small>` : ""}</span><i class="radio"></i></button>`).join("");
  abrir("#folha-ordem");
});
$("#corpo-ordem").addEventListener("click", e => { const b = e.target.closest("[data-o]"); if (!b) return; S.ordem = b.dataset.o; LS.set("ordem", S.ordem); setTimeout(() => { fechar(); render(); }, 120); b.parentNode.querySelectorAll(".opcao").forEach(o => o.classList.toggle("on", o === b)); });

/* ---------------- ficha do lote ---------------- */
function abrirLote(id) {
  const l = S.lotes.find(x => x.id === id); if (!l) return;
  const pr = (Array.isArray(l.pracas) ? l.pracas : []).map(p => `<div class="${p.data && p.data < fmtLocal() ? "praca-passada" : ""}"><span>${esc(pracaCurta(p.nome))} · ${esc(fmtData(p.data))}</span><span>${fmtBRL(p.valor)}</span></div>`).join("");
  const linhas = [["Tipo", l.tipo_site && String(l.tipo_site).toLowerCase() !== String(l.tipo).toLowerCase() ? `${l.tipo} (${l.tipo_site})` : l.tipo], ["Área", l.area_txt], ["Ocupação", l.ocupacao || "Não informado no anúncio"], ["Situação", l.status], ["Vendedor", l.comitente], ["Lances", l.lances != null ? String(l.lances) : ""], ["Visualizações", l.visitas != null ? Number(l.visitas).toLocaleString("pt-BR") : ""], ["Código", l.codigo || l.id.split(":")[1]]].filter(x => x[1]);
  const t = S.top && S.top.get(l.id);
  const src = urlSegura(l.imagem), oficial = urlSegura(l.url);
  const desc = Math.round(Number(l.desconto) || 0);
  const ev = S.eventos.filter(e => e.id === id).slice(0, 50);
  $("#corpo-lote").innerHTML = `
    <div class="det-foto" style="background:${grad(l.id)}">${src ? `<img referrerpolicy="no-referrer" src="${esc(src)}" alt="">` : `<div style="display:grid;place-items:center;height:100%">${CASA.replace("42%", "90")}</div>`}</div>
    <div class="det-site"><i class="dot" style="background:${SITE_COR[l.site] || "#999"}"></i><span style="color:${SITE_COR[l.site] || "inherit"}">${esc(SITE_NOME[l.site] || l.site)}</span>${l.novo ? '<span class="novo">· novo</span>' : ""}</div>
    <h3 class="det-tit">${esc(l.titulo)}</h3>
    <div class="det-end">${esc([l.endereco, l.bairro && !(l.endereco || "").includes(l.bairro) ? l.bairro : "", l.cidade && `${l.cidade}/${l.uf}`].filter(Boolean).join(" · "))}</div>
    <div class="caixa vidro">
      <div class="r"><div><div class="rot">${esc(pracaCurta(l.praca_atual))} · lance mínimo</div><div class="valor-grande">${fmtBRL(l.valor)}</div></div>${desc > 0 ? `<span class="pill">-${desc}% da 1ª praça</span>` : ""}</div>
      <div class="sep"></div>
      <div class="r rot"><span>${l.encerra ? "Leilão " + esc(fmtData(l.encerra)) : ""}</span><span style="color:var(--acc2);font-weight:600">${esc(falta(l.encerra))}</span></div>
    </div>
    ${t ? `<div class="sec">Por que está no seu Top 15 (#${t.pos})</div><ul class="top-motivos">${t.motivos.map(m => `<li>${esc(m)}</li>`).join("")}${t.alertas.map(m => `<li style="color:var(--hot)">Atenção: ${esc(m)}</li>`).join("")}</ul>` : ""}
    ${pr ? `<div class="sec">Praças</div><div class="linhas">${pr}</div>` : ""}
    <div class="sec">Detalhes</div><div class="linhas">${linhas.map(([a, b]) => `<div><span>${a}</span><span>${esc(b)}</span></div>`).join("")}</div>
    <div class="sec">Histórico</div><div class="eventos">${ev.map(e => `<div><time>${esc(new Date(e.quando).toLocaleString("pt-BR", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}))}</time><span>${esc(e.texto)}</span></div>`).join("")}${l.visto ? `<div><time>${esc(new Date(l.visto).toLocaleString("pt-BR", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}))}</time><span>Começamos a acompanhar este lote</span></div>` : ""}</div>
    <p class="texto-ajuda" style="margin-top:14px">Edital, matrícula e o lance ficam no site oficial. Confira sempre o edital antes de dar lance.</p>`;
  $("#pe-lote").innerHTML = `<button class="btn-sec vidro" id="fav-lote">${l.fav ? "♥ Nos favoritos: aviso as mudanças" : "♡ Favoritar e me avisar de mudanças"}</button>
    <button class="btn-sec vidro" id="abrir-calc">Calculadora: quanto posso dar de lance?</button>
    <button class="btn-sec vidro" id="abrir-pericia">Fazer perícia com os documentos ›</button>
    ${oficial ? `<a class="btn-grande btn-acc" style="display:grid;place-items:center;text-decoration:none" href="${esc(oficial)}" target="_blank" rel="noopener noreferrer">Ir para o anúncio oficial ›</a>` : ""}`;
  $("#abrir-calc").addEventListener("click", () => abrirCalc(l));
  $("#abrir-pericia").addEventListener("click", () => { fechar(); trocarAba("pericia"); Pericia.comLote(l); });
  $("#fav-lote").addEventListener("click", async () => {
    const on = await alternarFav(l.id);
    $("#fav-lote").textContent = on ? "♥ Nos favoritos: aviso as mudanças" : "♡ Favoritar e me avisar de mudanças";
    const c = document.querySelector(`[data-fav="${CSS.escape(l.id)}"]`); if (c) { c.classList.toggle("on", on); c.innerHTML = coracao(on); }
  });
  $("#corpo-lote").scrollTop = 0; abrir("#folha-lote");
}

/* ---------------- calculadora do lote (salva na conta) ---------------- */
let _calcLote = null;
function abrirCalc(l, daPericia) {
  _calcLote = l;
  const soTerreno = /terreno de/i.test(l.titulo);
  $("#calc-tit").innerHTML = `<b>${esc(l.titulo)}</b><br>Valores iniciais estimados a partir do anúncio. Ajuste com o que estiver no edital.`;
  const salvo = CONTA.calculos.get(l.id);
  const dados = {lance: l.valor, avaliacao: l.referencia && l.referencia > l.valor ? l.referencia : null, area: soTerreno ? null : l.area, cidade: l.cidade, tipo: l.tipo,
    ocupado: !/desocup/i.test(l.ocupacao || ""), fixos: Object.assign({}, salvo || {}, daPericia || {})};
  Calc.render($("#calc-corpo"), dados);
  const fonte = $("#calc-fonte");
  fonte.hidden = !(salvo || daPericia);
  fonte.textContent = daPericia ? "Preenchido com as estimativas da perícia. Toque em Salvar para guardar neste lote." : salvo ? "Mostrando os valores que você salvou para este lote." : "";
  abrir("#folha-calc");
}
$("#calc-salvar").addEventListener("click", async () => {
  if (!_calcLote) return;
  const v = $("#calc-corpo")._valores(); const limpo = {};
  for (const [k, x] of Object.entries(v)) if (typeof x === "number" && isFinite(x)) limpo[k] = Math.round(x * 100) / 100;
  const ok = await CONTA.salvarCalculo(_calcLote.id, limpo);
  toast(ok ? "Cálculo salvo neste lote" : "Não consegui salvar agora");
  if (ok) { $("#calc-fonte").hidden = false; $("#calc-fonte").textContent = "Salvo. Aparece aqui sempre que você abrir a calculadora deste lote."; }
});

/* ---------------- alertas ---------------- */
let filtroEv = ["todos", "favoritos", "novos", "mudancas"].includes(LS.get("filtro_ev")) ? LS.get("filtro_ev") : "todos";
let _vistoVisita = null;
const ehFav = e => CONTA.favs.has(e.id);
function eventosVisiveis() {
  const porId = new Map(S.lotes.map(l => [l.id, l]));
  return S.eventos.map(e => Object.assign({}, e, {lote: porId.get(e.id)}))
    .filter(e => e.lote && (ehFav(e) || (e.tipo !== "saiu" && bateComPerfil(e.lote))))
    .slice(0, 250);
}
function atualizarBadge() {
  const ev = eventosVisiveis(); const v = CONTA.prefs.alertas_visto || "";
  const favNao = ev.filter(e => e.quando > v && ehFav(e)).length, todosNao = ev.filter(e => e.quando > v).length;
  const b = $("#badge-alertas"); b.hidden = !todosNao; b.textContent = favNao ? (favNao > 99 ? "99+" : favNao) : "";
  b.style.minWidth = favNao ? "17px" : "9px"; b.style.height = favNao ? "17px" : "9px"; b.style.padding = favNao ? "0 4px" : "0";
}
function renderAlertas() {
  const box = $("#lista-ev");
  const todos = eventosVisiveis(); const visto = _vistoVisita ?? (CONTA.prefs.alertas_visto || "");
  const grupos = {todos: ["Todos", () => true], favoritos: ["Favoritos", ehFav], novos: ["Lotes novos", e => e.tipo === "novo"], mudancas: ["Mudanças", e => e.tipo !== "novo"]};
  $("#filtro-ev").innerHTML = Object.entries(grupos).map(([k, [t, fn]]) => { const n = todos.filter(e => fn(e) && e.quando > visto).length;
    return `<button class="chip ${filtroEv === k ? "on" : "vidro"}" data-fev="${k}">${t}${n ? ` <span style="background:var(--danger);color:#fff;border-radius:8px;padding:0 6px;font-size:10.5px;font-weight:700">${n}</span>` : ""}</button>`; }).join("");
  const ev = todos.filter(grupos[filtroEv][1]);
  if (!ev.length) {
    box.innerHTML = `<div class="vazio vidro">${filtroEv === "favoritos" ? "Nenhuma mudança nos seus favoritos ainda. Quando um lote favorito mudar de valor, lance, data ou sair do site, aparece aqui." : "Ainda sem novidades no seu perfil. Lotes novos e mudanças aparecem a cada leitura dos sites."}</div>`;
  } else {
    const naoLidos = ev.filter(e => e.quando > visto).length;
    let dia = ""; const out = [`<div class="cab-ev"><span class="texto-ajuda">${naoLidos ? `<b>${naoLidos} não lido${naoLidos > 1 ? "s" : ""}</b>` : "Tudo lido"}</span></div>`];
    const nomes = {novo: "NOVO", valor: "VALOR", lance: "LANCE", status: "SITUAÇÃO", data: "DATA", saiu: "SAIU"};
    for (const e of ev) {
      const d = new Date(e.quando).toLocaleDateString("pt-BR", {weekday: "long", day: "numeric", month: "long"});
      if (d !== dia) { dia = d; out.push(`<div class="dia">${esc(d.charAt(0).toUpperCase() + d.slice(1))}</div>`); }
      const l = e.lote, novo = e.quando > visto;
      out.push(`<button class="ev vidro ${novo ? "nao-lido" : ""}" data-id="${esc(e.id)}">${foto({id: e.id, imagem: l.imagem})}<div style="min-width:0;flex:1"><p><span class="tag">${esc(nomes[e.tipo] || e.tipo)}</span>${ehFav(e) ? "♥ " : ""}${esc(l.titulo)}</p><small>${esc(e.tipo === "novo" ? `${l.site} · ${l.cidade || ""}/${l.uf || ""} · ${fmtBRL(l.valor)}` : e.texto)} · ${esc(new Date(e.quando).toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"}))}</small></div>${novo ? '<i class="ponto" aria-label="não lido"></i>' : ""}</button>`);
    }
    box.innerHTML = out.join("");
  }
  // abriu a aba: tudo fica lido (os destaques continuam até sair dela)
  const ultimo = todos[0] && todos[0].quando;
  if (ultimo && ultimo > (CONTA.prefs.alertas_visto || "")) CONTA.salvarVisto(ultimo);
  atualizarBadge();
}
$("#filtro-ev").addEventListener("click", e => { const b = e.target.closest("[data-fev]"); if (!b) return; filtroEv = b.dataset.fev; LS.set("filtro_ev", filtroEv); renderAlertas(); });
$("#lista-ev").addEventListener("click", e => { const b = e.target.closest(".ev"); if (b) abrirLote(b.dataset.id); });
