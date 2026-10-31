/* LeilãoTrack · valor de mercado estimado (faixa), a partir dos próprios lotes.
   Referência de cada lote = valor da 1ª praça (perto da avaliação) dividido pela área.
   Compara com casas/apartamentos parecidos no mesmo bairro ou, se faltar, na mesma cidade.
   O próprio lote nunca entra na conta dele. É uma referência, não um laudo. */
"use strict";
const Estimativa = (() => {
  const TIPOS = new Set(["Casa", "Apartamento"]);
  const RUIM = /direito|parte ideal|fra[çc][ãa]o|nua[ -]propriedade|usufruto|mea[çc][ãa]o|\d+(,\d+)?\s*%|cota parte|quinh/i;
  const M2_MIN = 300, M2_MAX = 40000, AREA_MIN = 25, AREA_MAX = 2000;
  const sem = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  function quantil(ord, q) {
    if (!ord.length) return NaN;
    const p = (ord.length - 1) * q, i = Math.floor(p), f = p - i;
    return ord[i] + ((ord[i + 1] ?? ord[i]) - ord[i]) * f;
  }
  // tira valores muito fora (área errada, imóvel em ruínas, erro de digitação no anúncio)
  function limpar(vals) {
    const ord = [...vals].sort((a, b) => a - b), med = quantil(ord, .5);
    return ord.filter(v => v >= med / 2.5 && v <= med * 2.5);
  }
  function serve(l) {
    return l && TIPOS.has(l.tipo) && l.area >= AREA_MIN && l.area <= AREA_MAX && l.cidade && l.uf
      && !RUIM.test(l.titulo || "") && !/terreno de/i.test(l.titulo || "");
  }
  function m2Ref(l) {
    const r = Number(l.referencia) || 0;
    if (!(r > 0) || !(l.area > 0)) return null;
    const m = r / l.area;
    return m >= M2_MIN && m <= M2_MAX ? m : null;
  }
  const arred = v => v >= 1e6 ? Math.round(v / 1e4) * 1e4 : Math.round(v / 1e3) * 1e3;

  // grupos: bairro+tipo e cidade+tipo; cada item guarda o id para não contar o próprio lote
  function calcular(lotes) {
    const bairro = new Map(), cidade = new Map();
    const push = (m, k, it) => { if (!m.has(k)) m.set(k, []); m.get(k).push(it); };
    const kc = l => sem(l.cidade) + "|" + l.uf + "|" + l.tipo;
    const kb = l => l.bairro ? kc(l) + "|" + sem(l.bairro) : null;
    for (const l of lotes) {
      if (!serve(l)) continue;
      const m = m2Ref(l); if (m == null) continue;
      const it = {id: l.id, m};
      push(cidade, kc(l), it);
      const b = kb(l); if (b) push(bairro, b, it);
    }
    let n = 0;
    for (const l of lotes) {
      l._est = null;
      if (!serve(l)) continue;
      const tira = arr => (arr || []).filter(x => x.id !== l.id).map(x => x.m);
      const vb = tira(bairro.get(kb(l))), vc = tira(cidade.get(kc(l)));
      let vals, nivel, conf;
      if (vb.length >= 5) { vals = vb; nivel = "bairro"; conf = "alta"; }
      else if (vb.length >= 3) { vals = vb; nivel = "bairro"; conf = "média"; }
      else if (vc.length >= 8) { vals = vc; nivel = "cidade"; conf = "média"; }
      else if (vc.length >= 5) { vals = vc; nivel = "cidade"; conf = "baixa"; }
      else continue;
      const ok = limpar(vals);
      if (ok.length < 3) continue;
      const med = quantil(ok, .5), folga = conf === "alta" ? .10 : conf === "média" ? .14 : .22;
      const lo = Math.min(quantil(ok, .25), med * (1 - folga)), hi = Math.max(quantil(ok, .75), med * (1 + folga));
      const min = arred(lo * l.area), max = arred(hi * l.area), meio = arred(med * l.area);
      if (!(min > 0) || !(max > min)) continue;
      const desc = l.valor > 0 ? Math.round((1 - l.valor / meio) * 100) : null;
      l._est = {min, max, meio, m2: Math.round(med), conf, nivel, n: ok.length, desc};
      n++;
    }
    return n;
  }

  const curto = v => v >= 1e6 ? "R$ " + (v / 1e6).toLocaleString("pt-BR", {maximumFractionDigits: 2}) + " mi"
    : "R$ " + Math.round(v / 1e3).toLocaleString("pt-BR") + " mil";

  return {calcular, curto, _serve: serve};
})();
if (typeof module !== "undefined") module.exports = Estimativa;
