/* LeilãoTrack · mapa dos lotes (agrupados por cidade) */
"use strict";
const Mapa = (() => {
  // mapa público do OpenStreetMap (sem chave); no tema escuro as cores são invertidas por CSS
  const TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const CREDITO = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
  const BRASIL = [[-33.8, -74], [5.3, -34.7]];
  let mapa = null, camada = null, fundo = null, temaFundo = "", coords = null, grupos = [], semCidade = 0, pronto = null, ultimaLista = null;

  const semAc = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const tema = () => document.documentElement.dataset.tema === "claro" ? "claro" : "escuro";

  function preparar() {
    if (!pronto) pronto = (async () => {
      if (!document.querySelector('link[href^="vendor/leaflet/leaflet.css"]')) {
        const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "vendor/leaflet/leaflet.css"; document.head.appendChild(css);
      }
      const [, dados] = await Promise.all([carregarScript("vendor/leaflet/leaflet.js"), fetch("vendor/municipios.json").then(r => { if (!r.ok) throw new Error("municípios"); return r.json(); })]);
      coords = dados;
    })().catch(e => { pronto = null; throw e; });
    return pronto;
  }

  function criarMapa() {
    mapa = L.map("mapa", {zoomControl: false, minZoom: 3, maxZoom: 15, worldCopyJump: false, maxBounds: [[-45, -95], [15, -20]], maxBoundsViscosity: .8});
    mapa.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');
    L.control.zoom({position: "topright", zoomInTitle: "Aproximar", zoomOutTitle: "Afastar"}).addTo(mapa);
    mapa.attributionControl.setPosition("bottomright");
    mapa.fitBounds(BRASIL, {padding: [10, 10]});
    camada = L.layerGroup().addTo(mapa);
    mapa.on("zoomend moveend", desenhar);
  }
  function trocarFundo() {
    const t = tema();
    $("#mapa").classList.toggle("mapa-escuro", t === "escuro");
    if (!fundo) fundo = L.tileLayer(TILE, {attribution: CREDITO, maxZoom: 19, referrerPolicy: "strict-origin-when-cross-origin"}).addTo(mapa);
    temaFundo = t;
  }

  // junta os lotes por cidade, usando o centro de cada município (tabela do IBGE)
  function agruparPorCidade(lista) {
    const m = new Map(); semCidade = 0;
    for (const l of lista) {
      const c = l.cidade && l.uf ? coords[semAc(l.cidade) + "|" + l.uf] : null;
      if (!c) { semCidade++; continue; }
      const k = l.cidade + "|" + l.uf;
      if (!m.has(k)) m.set(k, {cidade: l.cidade, uf: l.uf, lat: c[0], lng: c[1], lotes: []});
      m.get(k).lotes.push(l);
    }
    return [...m.values()];
  }

  const raio = n => 14 + Math.min(14, 3.4 * Math.log2(1 + n));
  function desenhar() {
    if (!mapa || !camada) return;
    camada.clearLayers();
    const area = mapa.getBounds().pad(.25);
    let bolhas = grupos.filter(g => area.contains([g.lat, g.lng])).map(g => {
      const p = mapa.latLngToLayerPoint([g.lat, g.lng]);
      return {x: p.x, y: p.y, n: g.lotes.length, cidades: [g]};
    }).sort((a, b) => b.n - a.n);
    // junta bolhas que se encostariam na tela (a maior absorve a menor)
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (let i = 0; i < bolhas.length && !mudou; i++) for (let j = i + 1; j < bolhas.length; j++) {
        const a = bolhas[i], b = bolhas[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < raio(a.n) + raio(b.n) + 2) {
          a.n += b.n; a.cidades = a.cidades.concat(b.cidades); bolhas.splice(j, 1); mudou = true; break;
        }
      }
      if (mudou) bolhas.sort((a, b) => b.n - a.n);
    }
    for (const b of bolhas) {
      const r = raio(b.n), nivel = b.n >= 100 ? "muitos" : b.n >= 20 ? "varios" : "poucos";
      const principal = b.cidades[0];
      const rotulo = b.n >= 1000 ? (b.n / 1000).toFixed(1).replace(".", ",") + "k" : String(b.n);
      const nome = mapa.getZoom() >= 7 ? `<span class="bolha-nome">${esc(principal.cidade)}${b.cidades.length > 1 ? " +" + (b.cidades.length - 1) : ""}</span>` : "";
      const ic = L.divIcon({className: "bolha-ic", iconSize: [r * 2, r * 2], iconAnchor: [r, r],
        html: `<span class="bolha ${nivel}" style="width:${r * 2}px;height:${r * 2}px">${rotulo}</span>${nome}`});
      const lat = b.cidades.reduce((s, c) => s + c.lat * c.lotes.length, 0) / b.n, lng = b.cidades.reduce((s, c) => s + c.lng * c.lotes.length, 0) / b.n;
      const mk = L.marker(b.cidades.length === 1 ? [principal.lat, principal.lng] : [lat, lng], {icon: ic, keyboard: true, title: `${b.n} lotes · ${principal.cidade}${b.cidades.length > 1 ? " e região" : ""}`});
      mk.on("click", () => tocar(b));
      camada.addLayer(mk);
    }
    const total = grupos.reduce((s, g) => s + g.lotes.length, 0);
    $("#mapa-nota").innerHTML = `<b>${total.toLocaleString("pt-BR")} lotes</b> no mapa${semCidade ? ` · ${semCidade} sem cidade no anúncio` : ""}`;
  }

  function tocar(b) {
    if (b.cidades.length > 1 && mapa.getZoom() < mapa.getMaxZoom()) {
      const lims = L.latLngBounds(b.cidades.map(c => [c.lat, c.lng]));
      const sz = mapa.getSize();
      if (lims.getNorthEast().distanceTo(lims.getSouthWest()) > 800) { mapa.flyToBounds(lims, {padding: [Math.min(80, sz.x / 5), Math.min(80, sz.y / 5)], maxZoom: 13, duration: .5}); return; }
    }
    abrirCidade(b.cidades);
  }

  function abrirCidade(cidades) {
    const ids = new Set(cidades.flatMap(c => c.lotes.map(l => l.id)));
    const lotes = (ultimaLista || []).filter(l => ids.has(l.id));
    const principal = cidades[0];
    $("#cidade-tit").textContent = cidades.length > 1 ? `${principal.cidade} e região` : `${principal.cidade}, ${principal.uf}`;
    const menor = Math.min(...lotes.map(l => l.valor || Infinity));
    $("#cidade-sub").textContent = `${lotes.length.toLocaleString("pt-BR")} lote${lotes.length > 1 ? "s" : ""}${cidades.length > 1 ? " em " + juntar(cidades.slice(0, 4).map(c => c.cidade)) + (cidades.length > 4 ? " e outras" : "") : ""}${isFinite(menor) ? " · a partir de " + fmtBRL(menor) : ""}`;
    $("#cidade-lotes").innerHTML = lotes.slice(0, 200).map(card).join("") + (lotes.length > 200 ? `<p class="texto-ajuda">Mostrando 200 de ${lotes.length}. Use os filtros para refinar.</p>` : "");
    $("#folha-cidade .folha-corpo").scrollTop = 0;
    abrir("#folha-cidade");
  }

  async function mostrar(lista) {
    ultimaLista = lista;
    const box = $("#mapa-box");
    try {
      if (!coords) $("#mapa-nota").textContent = "Carregando o mapa…";
      await preparar();
    } catch (e) {
      $("#mapa-nota").textContent = "Não consegui carregar o mapa agora. Confira a conexão e tente de novo.";
      return;
    }
    if (box.hidden || ultimaLista !== lista) return;
    if (!mapa) criarMapa();
    trocarFundo();
    mapa.invalidateSize();
    grupos = agruparPorCidade(lista);
    desenhar();
  }

  $("#cidade-lotes").addEventListener("click", async e => {
    const fav = e.target.closest("[data-fav]");
    if (fav) { e.stopPropagation(); const on = await alternarFav(fav.dataset.fav); fav.classList.toggle("on", on); fav.innerHTML = coracao(on); return; }
    const c = e.target.closest(".card"); if (c) abrirLote(c.dataset.id);
  });
  window.addEventListener("resize", () => { if (mapa && !$("#mapa-box").hidden) mapa.invalidateSize(); });

  return {mostrar, abrirCidade, _grupos: () => grupos};
})();
