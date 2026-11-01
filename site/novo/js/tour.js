/* LeilãoTrack · tour de primeiro acesso: destaca cada parte do app com um passo curto.
   Roda sozinho uma vez, depois de a pessoa escolher o Top 15; dá para rever em Ajustes. */
"use strict";
const Tour = (() => {
  const PASSOS = [
    {t: "Bem-vindo ao LeilãoTrack", x: "Em 1 minuto mostramos onde fica cada coisa. Todos os leilões, um só lugar. O lance é sempre dado no site oficial do leiloeiro."},
    {alvo: ".busca", t: "Busque rápido", x: "Digite o bairro, a cidade ou o número do lote e a lista se ajusta na hora."},
    {alvo: "#btn-filtros", t: "Filtre do seu jeito", x: "Estado, cidade, tipo, valor, desconto, prazo e a confiança do valor estimado. Seus filtros ficam salvos."},
    {alvo: "#modo", t: "Lista ou mapa", x: "No mapa, toque numa bolha para ver os imóveis daquela região e aproxime para separá-los."},
    {alvo: "#grade .card", t: "Leia o cartão", x: "Veja o lance atual, o mínimo da praça, o desconto e a data. Toque no cartão para abrir a ficha com valor estimado, mapa e histórico."},
    {alvo: "#grade .card [data-fav]", t: "Favorite e acompanhe", x: "Os favoritos vão para a aba Favoritos e geram aviso quando o valor, a data ou a situação mudar."},
    {alvo: "#nav", t: "Suas abas", x: "Alertas mostra o que mudou. Perícia analisa os documentos com a sua própria IA (beta). Em Ajustes ficam o tema, a conta e a chave de IA."},
    {t: "Pronto para começar", x: "Dica: na ficha de um imóvel, use Compartilhar para mandar o link a quem também está no grupo. Para rever este tour, vá em Ajustes."},
  ];
  let passos = [], i = 0, raiz = null, foco = null, cartao = null, voltarA = null;

  const visivel = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };
  function alvoDe(p) { return p.alvo ? document.querySelector(p.alvo) : null; }

  function marcarVisto() {
    try {
      if (typeof CONTA === "undefined" || !CONTA.uid || (CONTA.ajustes && CONTA.ajustes.tour_visto)) return;
      CONTA.ajustes = Object.assign({}, CONTA.ajustes, {tour_visto: true});
      SB.atualizar("preferencias", "user_id=eq." + encodeURIComponent(CONTA.uid), {ajustes: CONTA.ajustes}).catch(() => {});
    } catch (e) { /* não impede o uso do app */ }
  }

  function montar() {
    raiz = document.createElement("div"); raiz.id = "tour"; raiz.className = "tour";
    raiz.setAttribute("role", "dialog"); raiz.setAttribute("aria-modal", "true"); raiz.setAttribute("aria-labelledby", "tour-t");
    foco = document.createElement("div"); foco.className = "tour-foco";
    cartao = document.createElement("div"); cartao.className = "tour-card";
    cartao.innerHTML = '<div class="tour-prog" aria-hidden="true"></div><h3 id="tour-t"></h3><p id="tour-x"></p>' +
      '<div class="tour-bt"><button type="button" class="tour-pular">Pular</button><span><button type="button" class="tour-volta btn-sec vidro">Voltar</button><button type="button" class="tour-prox btn-acc">Próximo</button></span></div>';
    raiz.append(foco, cartao); document.body.appendChild(raiz);
    cartao.querySelector(".tour-pular").addEventListener("click", () => fim());
    cartao.querySelector(".tour-volta").addEventListener("click", () => ir(i - 1));
    cartao.querySelector(".tour-prox").addEventListener("click", () => (i >= passos.length - 1 ? fim() : ir(i + 1)));
    raiz.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); fim(); } });
    window.addEventListener("resize", posicionar);
    window.addEventListener("scroll", posicionar, {passive: true});
  }

  function posicionar() {
    if (!raiz) return;
    const p = passos[i], a = p && alvoDe(p);
    if (!a) {
      raiz.classList.add("sem-foco"); foco.style.cssText = "";
      cartao.style.cssText = "left:50%;top:50%;transform:translate(-50%,-50%)";
      return;
    }
    raiz.classList.remove("sem-foco");
    const r = a.getBoundingClientRect(), pad = 6, W = innerWidth, H = innerHeight;
    foco.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
    const cw = Math.min(340, W - 32), ch = cartao.offsetHeight;
    const left = Math.max(16, Math.min(W - cw - 16, r.left + r.width / 2 - cw / 2));
    const abaixo = r.bottom + pad + 14 + ch <= H - 12;
    const top = abaixo ? r.bottom + pad + 14 : Math.max(12, r.top - pad - 14 - ch);
    cartao.style.cssText = `left:${left}px;top:${top}px;width:${cw}px`;
  }

  function ir(n) {
    // pula passos cujo alvo não está na tela (lista vazia, por exemplo)
    const dir = n >= i ? 1 : -1;
    while (n >= 0 && n < passos.length && passos[n].alvo && !visivel(alvoDe(passos[n]))) n += dir;
    if (n < 0) n = 0;
    if (n >= passos.length) return fim();
    i = n; const p = passos[i], a = alvoDe(p);
    if (a && getComputedStyle(a).position !== "fixed" && !a.closest("#nav")) a.scrollIntoView({block: "center", behavior: "instant"});
    cartao.querySelector("#tour-t").textContent = p.t; cartao.querySelector("#tour-x").textContent = p.x;
    cartao.querySelector(".tour-prog").innerHTML = passos.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("");
    cartao.querySelector(".tour-volta").hidden = i === 0;
    const prox = cartao.querySelector(".tour-prox");
    prox.textContent = i === 0 ? "Começar o tour" : i >= passos.length - 1 ? "Começar a usar" : "Próximo";
    cartao.querySelector(".tour-pular").hidden = i >= passos.length - 1;
    posicionar(); prox.focus({preventScroll: true});
  }

  function fim() {
    if (!raiz) return;
    window.removeEventListener("resize", posicionar); window.removeEventListener("scroll", posicionar);
    raiz.remove(); raiz = foco = cartao = null; document.body.style.overflow = "";
    marcarVisto(); window.scrollTo({top: 0});
    if (voltarA && typeof voltarA.focus === "function") { try { voltarA.focus({preventScroll: true}); } catch (e) {} }
  }

  function iniciar() {
    if (raiz) return;
    voltarA = document.activeElement;
    if (typeof S !== "undefined" && S.aba !== "inicio" && typeof trocarAba === "function") trocarAba("inicio");
    if (typeof S !== "undefined" && S.modo === "mapa") { const b = document.querySelector('[data-modo="lista"]'); if (b) b.click(); }
    passos = PASSOS.slice(); i = 0; document.body.style.overflow = "hidden";
    montar(); setTimeout(() => ir(0), 60);
  }
  return {iniciar, ativo: () => !!raiz};
})();
