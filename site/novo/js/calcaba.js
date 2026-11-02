/* LeilãoTrack · aba Calculadora: sozinha, sem IA e sem beta. Com ou sem lote escolhido */
"use strict";
const CalcAba = (() => {
  let iniciado = false, lote = null;
  const html = () => `
    <div class="cab"><h2>Calculadora de lance</h2></div>
    <p class="texto-ajuda" style="margin-top:-6px">Quanto dá para lançar e quanto sobra no fim. Digite os valores do edital por cima das sugestões em cinza. Para usar os dados de um lote, escolha-o abaixo.</p>
    <section class="painel vidro">
      <div class="ca-busca"><div id="ca-lote"></div>
        <input id="ca-q" type="search" class="campo-busca" placeholder="Buscar lote por bairro, cidade ou nº" autocomplete="off" maxlength="80" aria-label="Buscar lote">
        <div class="ca-res" id="ca-res"></div></div>
      <div id="ca-corpo"></div>
      <button class="btn-grande" id="ca-salvar" hidden>Salvar neste lote</button>
    </section>
    <p class="texto-ajuda">Quer a análise dos documentos (edital e matrícula) com a sua IA? Use a aba Perícia, que ainda está em beta.</p>`;
  function corpo() {
    Calc.render($("#ca-corpo"), lote ? dadosCalc(lote) : {lance: null, fixos: {}}, lote ? {} : {vazio: true});
    $("#ca-salvar").hidden = !lote;
    $("#ca-lote").innerHTML = lote ? `<div class="lote-pericia">${foto(lote)}<div style="flex:1;min-width:0"><small class="texto-ajuda">LOTE</small><b style="display:block;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(lote.titulo)}</b><small class="texto-ajuda">${esc(SITE_NOME[lote.site] || lote.site)} · ${fmtBRL(lote.valor)}</small></div><button class="btn-mini" id="ca-tirar">Tirar</button></div>` : "";
  }
  const norm = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function buscar() {
    const palavras = norm($("#ca-q").value).split(/\s+/).filter(Boolean), box = $("#ca-res");
    if (!palavras.length) { box.innerHTML = ""; return; }
    const pontos = l => {
      const texto = norm(`${l.titulo} ${enderecoTexto(l)} ${l.cidade || ""} ${l.uf || ""} ${l.id} ${l.tipo || ""} ${SITE_NOME[l.site] || l.site}`);
      if (!palavras.every(w => texto.includes(w))) return -1;
      return palavras.reduce((n, w) => n + (norm(l.cidade).startsWith(w) || norm(l.id).includes(w) ? 2 : 1), 0);
    };
    const achados = S.lotes.map(l => [pontos(l), l]).filter(x => x[0] >= 0).sort((x, y) => y[0] - x[0]).slice(0, 8).map(x => x[1]);
    box.innerHTML = achados.map(l => `<button type="button" data-id="${esc(l.id)}">${foto(l)}<span class="ca-txt"><b>${esc(l.titulo)}</b><small>${esc([enderecoTexto(l) || l.cidade, SITE_NOME[l.site] || l.site, fmtBRL(l.valor)].filter(Boolean).join(" · "))}</small></span></button>`).join("") || `<small class="texto-ajuda">Nenhum lote encontrado. Tente só o bairro, a cidade ou o nº do lote.</small>`;
  }
  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    $("#aba-calc").innerHTML = html();
    $("#ca-q").addEventListener("input", buscar);
    $("#ca-res").addEventListener("click", e => { const b = e.target.closest("[data-id]"); if (!b) return; lote = S.lotes.find(l => l.id === b.dataset.id) || null; $("#ca-q").value = ""; $("#ca-res").innerHTML = ""; corpo(); });
    $("#aba-calc").addEventListener("click", e => { if (e.target.closest("#ca-tirar")) { lote = null; corpo(); } });
    $("#ca-salvar").addEventListener("click", async () => {
      if (!lote) return;
      const v = $("#ca-corpo")._valores(), limpo = {};
      for (const [k, x] of Object.entries(v)) if (typeof x === "number" && isFinite(x)) limpo[k] = Math.round(x * 100) / 100;
      toast((await CONTA.salvarCalculo(lote.id, limpo)) ? "Cálculo salvo neste lote" : "Não consegui salvar agora");
    });
    corpo();
  }
  return {iniciar, limpar() { iniciado = false; lote = null; $("#aba-calc").innerHTML = ""; }};
})();
