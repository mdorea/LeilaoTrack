/* LeilãoTrack · valor de mercado estimado (faixa), a partir dos próprios lotes.
   Referência de cada lote = valor da 1ª praça (perto da avaliação) dividido pela ÁREA CONSTRUÍDA
   (nunca a do terreno). Comparáveis: lotes ativos + histórico dos últimos 12 meses.
   Compara com casas/apartamentos parecidos no mesmo bairro ou, se faltar, na mesma cidade.
   Calibrado em 31/10/2026 com 1.683 lotes ativos.
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
  const areaDe = l => Number(l.area_constr) || 0;
  function serve(l) {
    const a = areaDe(l);
    return l && TIPOS.has(l.tipo) && a >= AREA_MIN && a <= AREA_MAX && l.cidade && l.uf
      && !RUIM.test(l.titulo || "") && !/terreno de/i.test(l.titulo || "");
  }
  function m2Ref(l) {
    const r = Number(l.referencia) || 0;
    const a = areaDe(l);
    if (!(r > 0) || !(a > 0)) return null;
    const m = r / a;
    return m >= M2_MIN && m <= M2_MAX ? m : null;
  }
  const arred = v => v >= 1e6 ? Math.round(v / 1e4) * 1e4 : Math.round(v / 1e3) * 1e3;

  // grupos: bairro+tipo e cidade+tipo; cada item guarda o id para não contar o próprio lote
  function calcular(lotes, historico) {
    const bairro = new Map(), cidade = new Map();
    const atuais = new Set(lotes.map(l => l.id));
    // histórico compacto {i,t,c,u,b,a,r,d}: lotes que já saíram do site (até 12 meses)
    const antigos = (Array.isArray(historico) ? historico : []).filter(r => r && typeof r.i === "string" && !atuais.has(r.i))
      .map(r => ({id: r.i, tipo: r.t, cidade: r.c, uf: r.u, bairro: r.b, area_constr: r.a, referencia: r.r, titulo: ""}));
    const push = (m, k, it) => { if (!m.has(k)) m.set(k, []); m.get(k).push(it); };
    const kc = l => sem(l.cidade) + "|" + l.uf + "|" + l.tipo;
    const kb = l => l.bairro ? kc(l) + "|" + sem(l.bairro) : null;
    for (const l of lotes.concat(antigos)) {
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
      // confiança calibrada no teste com os lotes reais (cada lote estimado sem ele mesmo):
      // mesmo bairro (3+ parecidos): acertou dentro de ±20% em ~6 de 10 casos → "média"
      // só a cidade (5+ parecidos): ~1 em 3 casos → "baixa". Não há "alta" com esses dados.
      let vals, nivel, conf;
      if (vb.length >= 3) { vals = vb; nivel = "bairro"; conf = "média"; }
      else if (vc.length >= 5) { vals = vc; nivel = "cidade"; conf = "baixa"; }
      else continue;
      const ok = limpar(vals);
      if (ok.length < 3) continue;
      const med = quantil(ok, .5);
      // largura = metade central dos erros medidos (a avaliação real ficou dentro em ~50% dos casos)
      const [fLo, fHi] = conf === "média" ? [.85, 1.18] : [.70, 1.45];
      const a = areaDe(l), min = arred(med * fLo * a), max = arred(med * fHi * a), meio = arred(med * a);
      if (!(min > 0) || !(max > min)) continue;
      // se a avaliação do próprio lote foge muito dos parecidos, a área ou o anúncio
      // provavelmente está errado (terreno x construída, parte ideal...): não estima
      const ref = Number(l.referencia) || 0;
      if (ref > 0 && (ref / meio < .4 || ref / meio > 2.5)) { l._est = {fora: true}; continue; }
      const preco = l._preco || l.valor;  // lance atual, se já houver lance
      if (preco > 0 && preco / meio < .2) { l._est = {fora: true}; continue; }
      const desc = preco > 0 ? Math.round((1 - preco / meio) * 100) : null;
      l._est = {min, max, meio, m2: Math.round(med), conf, nivel, n: ok.length, desc,
        local: nivel === "bairro" ? l.bairro : l.cidade, area: a};
      n++;
    }
    return n;
  }

  const curto = v => v >= 1e6 ? "R$\u00a0" + (v / 1e6).toLocaleString("pt-BR", {maximumFractionDigits: 2}) + "\u00a0mi"
    : "R$\u00a0" + Math.round(v / 1e3).toLocaleString("pt-BR") + "\u00a0mil";

  return {calcular, curto, _serve: serve};
})();
if (typeof module !== "undefined") module.exports = Estimativa;
