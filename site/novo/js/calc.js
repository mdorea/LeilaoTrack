/* LeilãoTrack · calculadora de leilão (usada na ficha do lote e na perícia) */
"use strict";
const Calc = (() => {
  const brl = v => (v < 0 ? "−" : "") + "R$ " + Math.round(Math.abs(v)).toLocaleString("pt-BR");
  const pct = v => (v * 100).toLocaleString("pt-BR", {maximumFractionDigits: 1}) + "%";
  const num = s => { if (typeof s === "number") return s; s = String(s || "").replace(/[^\d,.-]/g, ""); if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); const n = parseFloat(s); return isNaN(n) ? 0 : n; };
  const CAMPOS = [
    ["lance", "Lance (R$)", "Quanto você pretende dar"],
    ["mercado", "Valor de mercado estimado (R$)", "Por quanto o imóvel vende hoje, já regularizado"],
    ["comissao", "Comissão do leiloeiro (%)", "Normalmente 5%"],
    ["itbi", "ITBI (%)", "Na capital de SP é 3%; varia por cidade"],
    ["registro", "Escritura/registro (R$)", "Cartório e certidões"],
    ["debitos", "Débitos que ficam com você (R$)", "IPTU, condomínio — veja o edital"],
    ["desocupacao", "Desocupação (R$)", "Advogado e acordo, se estiver ocupado"],
    ["reforma", "Reforma (R$)", "Pintura, reparos, documentação"],
    ["mensal", "Custo mensal até vender (R$)", "Condomínio + IPTU enquanto espera"],
    ["prazo", "Prazo até vender (meses)", "Inclui desocupação e registro"],
    ["corretagem", "Corretagem na venda (%)", "Normalmente 5% a 6%"],
    ["cdi", "Rendimento de comparação (% a.a.)", "Ex.: o que o dinheiro renderia aplicado"],
    ["margem", "Lucro mínimo que você quer (%)", "Margem de segurança sobre o investido"],
  ];
  function padrao(d) {
    const lance = d.lance || 0, ocupado = d.ocupado !== false;
    return {
      lance, mercado: d.mercado || d.avaliacao || Math.round(lance * 1.6),
      comissao: 5, itbi: d.cidade && /s[ãa]o paulo/i.test(d.cidade) ? 3 : 2,
      registro: Math.max(2500, Math.round(lance * 0.012)),
      debitos: d.debitos ?? 0, desocupacao: d.desocupacao ?? (ocupado ? 15000 : 0),
      reforma: d.reforma ?? Math.max(8000, Math.round(Math.min(d.area ? d.area * 250 : 15000, (d.mercado || d.avaliacao || lance * 1.6) * 0.06) / 500) * 500),
      mensal: d.mensal ?? (d.tipo === "Apartamento" ? 900 : 350), prazo: d.prazo ?? (ocupado ? 14 : 8),
      corretagem: 6, cdi: 12, margem: 20,
    };
  }
  function contas(v, lanceOverride) {
    const L = lanceOverride ?? v.lance;
    const comissao = L * v.comissao / 100, itbi = L * v.itbi / 100;
    const aquisicao = L + comissao + itbi + v.registro;
    const outros = v.debitos + v.desocupacao + v.reforma + v.mensal * v.prazo;
    const investido = aquisicao + outros;
    const corret = v.mercado * v.corretagem / 100;
    const custoFiscal = aquisicao + v.reforma + v.debitos; // base aproximada para ganho de capital
    const ir = Math.max(0, (v.mercado - corret - custoFiscal) * 0.15);
    const liquido = v.mercado - corret - ir;
    const lucro = liquido - investido;
    const roi = investido ? lucro / investido : 0;
    const anos = Math.max(v.prazo, 1) / 12;
    const roiAno = roi > -1 ? Math.pow(1 + roi, 1 / anos) - 1 : -1;
    return {L, comissao, itbi, aquisicao, outros, investido, corret, ir, liquido, lucro, roi, roiAno};
  }
  function lanceMaximo(v) { // maior lance que ainda entrega a margem desejada
    let lo = 0, hi = v.mercado * 1.2;
    if (contas(v, 0).roi < v.margem / 100) return 0;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; contas(v, m).roi >= v.margem / 100 ? lo = m : hi = m; }
    return Math.floor(lo / 500) * 500;
  }
  function render(el, dados, opts = {}) {
    const v = Object.assign(padrao(dados), dados.fixos || {});
    for (const [k] of CAMPOS) { v[k] = num(v[k]); if (!isFinite(v[k])) v[k] = 0; }
    el.innerHTML = `<div class="calc">
      <div class="calc-grade">${CAMPOS.map(([k, t, h]) => `<label class="calc-campo"><span>${t}</span>
        <input inputmode="decimal" data-k="${k}" value="${String(v[k]).replace(".", ",")}"><small>${h}</small></label>`).join("")}</div>
      ${opts.botaoIA ? `<button class="calc-ia" type="button">${opts.botaoIA}</button><p class="calc-ia-msg" hidden></p>` : ""}
      <div class="calc-res"></div></div>`;
    const res = el.querySelector(".calc-res");
    const atualizar = () => {
      el.querySelectorAll("[data-k]").forEach(i => v[i.dataset.k] = num(i.value));
      const c = contas(v), max = lanceMaximo(v);
      const cen = [["Pessimista", {mercado: v.mercado * 0.9, prazo: v.prazo + 6}], ["Base", {}], ["Otimista", {mercado: v.mercado * 1.05, prazo: Math.max(3, v.prazo - 3)}]]
        .map(([n, ajuste]) => [n, contas(Object.assign({}, v, ajuste))]);
      const bom = c.roi >= v.margem / 100, cdiPeriodo = Math.pow(1 + v.cdi / 100, v.prazo / 12) - 1;
      res.innerHTML = `
        <div class="calc-destaque ${bom ? "ok" : c.lucro > 0 ? "meio" : "ruim"}">
          <div><small>Lucro estimado</small><b>${brl(c.lucro)}</b><span>${pct(c.roi)} no período · ${pct(c.roiAno)} ao ano</span></div>
          <div><small>Lance máximo para ${pct(v.margem / 100)} de lucro</small><b>${max ? brl(max) : "não fecha"}</b><span>${max && v.lance > max ? "Seu lance está acima do teto" : max ? `Folga de ${brl(max - v.lance)}` : "Nem com lance zero chega na margem"}</span></div>
        </div>
        <table class="calc-tab">
          <tr><td>Lance</td><td>${brl(c.L)}</td></tr>
          <tr><td>Comissão + ITBI + registro</td><td>${brl(c.comissao + c.itbi + v.registro)}</td></tr>
          <tr><td>Débitos, desocupação e reforma</td><td>${brl(v.debitos + v.desocupacao + v.reforma)}</td></tr>
          <tr><td>Custos mensais (${v.prazo} meses)</td><td>${brl(v.mensal * v.prazo)}</td></tr>
          <tr class="tot"><td>Total investido</td><td>${brl(c.investido)}</td></tr>
          <tr><td>Venda</td><td>${brl(v.mercado)}</td></tr>
          <tr><td>Corretagem</td><td>${brl(-c.corret)}</td></tr>
          <tr><td>Imposto sobre o ganho (15%, estimado)</td><td>${brl(-c.ir)}</td></tr>
          <tr class="tot"><td>Você recebe</td><td>${brl(c.liquido)}</td></tr>
        </table>
        <div class="calc-cen">${cen.map(([n, x]) => `<div><small>${n}</small><b class="${x.lucro >= 0 ? "pos" : "neg"}">${brl(x.lucro)}</b><span>${pct(x.roiAno)} a.a.</span></div>`).join("")}</div>
        <p class="calc-nota">Aplicado a ${v.cdi.toLocaleString("pt-BR")}% ao ano, o mesmo dinheiro renderia cerca de ${brl(c.investido * cdiPeriodo)} em ${v.prazo} meses (antes de impostos). Imposto de renda calculado de forma simplificada, para pessoa física. Estimativa para comparar cenários — confirme custos e débitos no edital e com um advogado.</p>`;
    };
    el.addEventListener("input", e => { if (e.target.matches("[data-k]")) atualizar(); });
    el.querySelector(".calc-ia")?.addEventListener("click", async () => {
      const msg = el.querySelector(".calc-ia-msg"), bt = el.querySelector(".calc-ia");
      bt.disabled = true; msg.hidden = false; msg.textContent = "Pedindo a estimativa ao agente…";
      try { const r = await opts.onIA(v); for (const [k, val] of Object.entries(r.valores || {})) { const i = el.querySelector(`[data-k="${k}"]`); if (i && val != null) i.value = String(Math.round(val)).replace(".", ","); }
        msg.textContent = r.texto || "Valores preenchidos pelo agente."; atualizar(); }
      catch (e) { msg.textContent = e.message || "Não consegui a estimativa agora."; }
      bt.disabled = false;
    });
    atualizar();
    // preencher de fora (perícia, código copiado): {campo: valor}
    el._preencher = valores => { for (const [k, val] of Object.entries(valores || {})) { const i = el.querySelector(`[data-k="${k}"]`); if (i && typeof val === "number" && isFinite(val)) i.value = String(Math.round(val * 100) / 100).replace(".", ","); } atualizar(); };
    el._valores = () => { el.querySelectorAll("[data-k]").forEach(i => v[i.dataset.k] = num(i.value)); return Object.assign({}, v); };
  }
  // código para levar os valores da Perícia para o LeilãoTrack
  const codigo = valores => "LT1:" + btoa(unescape(encodeURIComponent(JSON.stringify(valores))));
  const lerCodigo = txt => { const m = String(txt || "").trim().match(/LT1:([A-Za-z0-9+/=]+)/); if (!m) return null; try { return JSON.parse(decodeURIComponent(escape(atob(m[1])))); } catch (e) { return null; } };
  const CSS = `.calc{display:flex;flex-direction:column;gap:12px}
.calc-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.calc-campo{display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--mu);font-weight:500;min-width:0}
.calc-campo input{height:40px;border-radius:11px;border:1px solid var(--line2,var(--line));background:var(--glass2);padding:0 10px;font-size:14px;color:var(--tx);outline:0;width:100%;font-variant-numeric:tabular-nums}
.calc-campo small{font-size:10.5px;color:var(--mu2);line-height:1.3}
.calc-ia{height:42px;border-radius:21px;font-weight:600;font-size:13px;background:var(--glass2);border:1px solid var(--line2,var(--line));color:var(--tx);padding:0 16px;align-self:flex-start}
.calc-ia-msg{font-size:12.5px;color:var(--mu);margin:0;line-height:1.5}
.calc-destaque{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.calc-destaque>div{border-radius:16px;padding:12px 14px;background:var(--glass2);border:1px solid var(--line2,var(--line));display:flex;flex-direction:column;gap:2px;min-width:0}
.calc-destaque small{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--mu);font-weight:600}
.calc-destaque b{font-size:20px;font-variant-numeric:tabular-nums}
.calc-destaque span{font-size:11.5px;color:var(--mu)}
.calc-destaque.ok>div:first-child b{color:#13915E}.calc-destaque.meio>div:first-child b{color:#C98A00}.calc-destaque.ruim>div:first-child b{color:#E04848}
.calc-tab{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.calc-tab td{padding:7px 2px;border-bottom:1px solid var(--line2,var(--line))}
.calc-tab td:last-child{text-align:right}
.calc-tab tr.tot td{font-weight:700}
.calc-cen{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.calc-cen>div{border-radius:14px;padding:10px;background:var(--glass2);border:1px solid var(--line2,var(--line));text-align:center;display:flex;flex-direction:column;gap:2px}
.calc-cen small{font-size:10.5px;color:var(--mu);font-weight:600;text-transform:uppercase}
.calc-cen b{font-size:14px}.calc-cen .pos{color:#13915E}.calc-cen .neg{color:#E04848}
.calc-cen span{font-size:11px;color:var(--mu)}
.calc-nota{font-size:11.5px;color:var(--mu);line-height:1.5;margin:0}
@media (max-width:420px){.calc-destaque{grid-template-columns:1fr}.calc-destaque b{font-size:18px}}`;
  return {render, CSS, contas, lanceMaximo, padrao, num, codigo, lerCodigo};
})();
