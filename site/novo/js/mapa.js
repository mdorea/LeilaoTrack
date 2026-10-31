/* LeilãoTrack · mapa dos lotes (agrupados por cidade) */
"use strict";
const Mapa = (() => {
  // mapa público do OpenStreetMap (sem chave), sempre claro para ficar legível
  const TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const CREDITO = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
  const BRASIL = [[-33.8, -74], [5.3, -34.7]];
  const LIMITE = [[-35.5, -75.5], [7, -32.5]]; // só dá para navegar pelo Brasil
  let contorno = null;
  let mapa = null, camada = null, fundo = null, temaFundo = "", coords = null, grupos = [], semCidade = 0, exatos = 0, pronto = null, ultimaLista = null;

  const semAc = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const tema = () => document.documentElement.dataset.tema === "claro" ? "claro" : "escuro";

  function preparar() {
    if (!pronto) pronto = (async () => {
      if (!document.querySelector('link[href^="vendor/leaflet/leaflet.css"]')) {
        const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "vendor/leaflet/leaflet.css"; document.head.appendChild(css);
      }
      const [, dados, borda] = await Promise.all([carregarScript("vendor/leaflet/leaflet.js"),
        fetch("vendor/municipios.json").then(r => { if (!r.ok) throw new Error("municípios"); return r.json(); }),
        fetch("vendor/brasil.json").then(r => r.ok ? r.json() : null).catch(() => null)]);
      coords = dados; contorno = Array.isArray(borda) ? borda : null;
    })().catch(e => { pronto = null; throw e; });
    return pronto;
  }

  function criarMapa() {
    mapa = L.map("mapa", {zoomControl: false, minZoom: 3, maxZoom: 18, worldCopyJump: false, maxBounds: LIMITE, maxBoundsViscosity: 1});
    mapa.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>');
    L.control.zoom({position: "topright", zoomInTitle: "Aproximar", zoomOutTitle: "Afastar"}).addTo(mapa);
    mapa.attributionControl.setPosition("bottomright");
    mapa.fitBounds(BRASIL, {padding: [10, 10]});
    mapa.setMinZoom(Math.max(3, mapa.getBoundsZoom(LIMITE, true)));  // não afasta além do Brasil
    // fora do Brasil fica apagado (máscara com o contorno do país)
    if (contorno) L.polygon([[[-90, -180], [-90, 180], [90, 180], [90, -180]], contorno],
      {stroke: false, fillColor: "#EDEAF4", fillOpacity: .78, interactive: false}).addTo(mapa);
    if (contorno) L.polygon(contorno, {color: "#8B6FE8", weight: 1.5, opacity: .7, fill: false, interactive: false}).addTo(mapa);
    camada = L.layerGroup().addTo(mapa);
    mapa.on("zoomend moveend", desenhar);
  }
  function trocarFundo() {
    const t = tema();
    if (!fundo) fundo = L.tileLayer(TILE, {attribution: CREDITO, maxZoom: 19, referrerPolicy: "strict-origin-when-cross-origin"}).addTo(mapa);
    temaFundo = t;
  }

  // um ponto por lote: localização do endereço (quando já foi localizada) ou o centro da cidade (IBGE)
  function pontosDe(lista) {
    const pts = []; semCidade = 0; exatos = 0;
    for (const l of lista) {
      if (Array.isArray(l.geo) && isFinite(l.geo[0]) && isFinite(l.geo[1])) {
        pts.push({l, lat: l.geo[0], lng: l.geo[1], cid: l.cidade + "|" + l.uf}); if (l.geo[2] === "rua") exatos++; continue;
      }
      const c = l.cidade && l.uf ? coords[semAc(l.cidade) + "|" + l.uf] : null;
      if (!c) { semCidade++; continue; }
      pts.push({l, lat: c[0], lng: c[1], cid: l.cidade + "|" + l.uf});
    }
    return pts;
  }

  const raio = n => 14 + Math.min(14, 3.4 * Math.log2(1 + n));
  const CELULA = 46;  // px: pontos mais perto que isso viram uma bolha só
  function desenhar() {
    if (!mapa || !camada) return;
    camada.clearLayers();
    const area = mapa.getBounds().pad(.15);
    const grade = new Map();
    for (const p of grupos) {
      if (!area.contains([p.lat, p.lng])) continue;
      const q = mapa.latLngToLayerPoint([p.lat, p.lng]);
      const k = Math.floor(q.x / CELULA) + "," + Math.floor(q.y / CELULA);
      let b = grade.get(k); if (!b) grade.set(k, b = {pts: []});
      b.pts.push(p);
    }
    for (const b of grade.values()) {
      const n = b.pts.length;
      const lat = b.pts.reduce((s, p) => s + p.lat, 0) / n, lng = b.pts.reduce((s, p) => s + p.lng, 0) / n;
      const r = raio(n), nivel = n >= 100 ? "muitos" : n >= 20 ? "varios" : "poucos";
      const porCidade = new Map(); for (const p of b.pts) porCidade.set(p.cid, (porCidade.get(p.cid) || 0) + 1);
      const topo = [...porCidade.entries()].sort((x, y) => y[1] - x[1]);
      const nomeCid = topo[0][0].split("|")[0];
      const rotulo = n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + "k" : String(n);
      const nome = mapa.getZoom() >= 8 ? `<span class="bolha-nome">${esc(nomeCid)}${topo.length > 1 ? " +" + (topo.length - 1) : ""}</span>` : "";
      const ic = L.divIcon({className: "bolha-ic", iconSize: [r * 2, r * 2], iconAnchor: [r, r],
        html: `<span class="bolha ${nivel}" style="width:${r * 2}px;height:${r * 2}px">${rotulo}</span>${nome}`});
      const mk = L.marker([lat, lng], {icon: ic, keyboard: true, title: `${n} lote${n > 1 ? "s" : ""} · ${nomeCid}${topo.length > 1 ? " e região" : ""}`});
      mk.on("click", () => abrirLista(b.pts, topo));
      camada.addLayer(mk);
    }
    $("#mapa-nota").innerHTML = `<b>${grupos.length.toLocaleString("pt-BR")} lotes</b> no mapa${exatos ? ` · ${exatos.toLocaleString("pt-BR")} no endereço exato` : ""}${semCidade ? ` · ${semCidade} sem cidade no anúncio` : ""}`;
  }

  // clicou numa bolha: lista exatamente os lotes dela (sem aproximar o mapa sozinho)
  function abrirLista(pts, topo) {
    const lotes = pts.map(p => p.l);
    const cidades = topo.map(([k]) => k.split("|")[0]);
    $("#cidade-tit").textContent = topo.length === 1 ? `${cidades[0]}, ${topo[0][0].split("|")[1]}` : `${cidades[0]} e região`;
    const menor = Math.min(...lotes.map(l => l._preco || l.valor || Infinity));
    $("#cidade-sub").textContent = `${lotes.length.toLocaleString("pt-BR")} lote${lotes.length > 1 ? "s" : ""}${topo.length > 1 ? " em " + juntar(cidades.slice(0, 4)) + (cidades.length > 4 ? " e outras" : "") : ""}${isFinite(menor) ? " · a partir de " + fmtBRL(menor) : ""}`;
    $("#cidade-lotes").innerHTML = lotes.slice(0, 200).map(card).join("") + (lotes.length > 200 ? `<p class="texto-ajuda">Mostrando 200 de ${lotes.length}. Aproxime o mapa para separar.</p>` : "");
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
    grupos = pontosDe(lista);
    desenhar();
  }

  $("#cidade-lotes").addEventListener("click", async e => {
    const fav = e.target.closest("[data-fav]");
    if (fav) { e.stopPropagation(); const on = await alternarFav(fav.dataset.fav); fav.classList.toggle("on", on); fav.innerHTML = coracao(on); return; }
    const c = e.target.closest(".card"); if (c) abrirLote(c.dataset.id);
  });
  window.addEventListener("resize", () => { if (mapa && !$("#mapa-box").hidden) mapa.invalidateSize(); });

  return {mostrar, _grupos: () => grupos};
})();
