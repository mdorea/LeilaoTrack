/* LeilãoTrack · utilidades comuns */
"use strict";
// não deixa o site ser aberto dentro de outra página (proteção contra "clickjacking")
if (window.top !== window.self) { document.documentElement.innerHTML = ""; throw new Error("enquadrado"); }

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"'`]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;"}[c]));
// só deixa passar endereços http(s); qualquer outra coisa (javascript:, data:…) vira vazio
const urlSegura = u => { try { const x = new URL(String(u || ""), location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } };
const LS = {
  get(k, d) { try { const v = localStorage.getItem("lt2_" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("lt2_" + k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem("lt2_" + k); } catch (e) {} },
};
const RODAPE = `<b>LeilãoTrack</b> · Desenvolvido com IA · 2026<br>Ferramenta de triagem de leilões. Não é recomendação de investimento nem parecer jurídico.<br>O lance é sempre feito no site oficial do leiloeiro.`;

const SITE_COR = {"Frazão": "#E0694F", "Zuk": "#4C8BF5", "Mega": "#2FB37A", "Biasi": "#1E5BB8"};
const SITE_NOME = {"Frazão": "Frazão Leilões", "Zuk": "Portal Zuk", "Mega": "Mega Leilões", "Biasi": "Biasi Leilões"};
const SITES = ["Frazão", "Zuk", "Mega", "Biasi"];
const GRADS = ["linear-gradient(160deg,#EBCFAE,#B4876A)", "linear-gradient(160deg,#C5D7EA,#7E9FC3)", "linear-gradient(160deg,#CBE4D3,#84B598)", "linear-gradient(160deg,#E6D8EE,#A68ABD)", "linear-gradient(160deg,#EFE3B8,#C3A866)"];
const CASA = '<svg width="42%" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3z"/></svg>';
const UFS = ["SP", "RJ", "MG", "PR", "SC", "RS", "GO", "DF", "BA", "PE", "CE", "ES", "MT", "MS", "PA", "AM", "MA", "PB", "RN", "AL", "SE", "PI", "TO", "RO", "AC", "AP", "RR"];
const TIPOS_PREF = ["Casa", "Apartamento", "Terreno", "Rural"];

/* ---------- formatação ---------- */
const fmtBRL = v => v == null || isNaN(v) ? "—" : "R$ " + Math.round(Number(v)).toLocaleString("pt-BR");
const fmtCurto = v => v >= 1e6 ? `R$ ${(v / 1e6).toLocaleString("pt-BR", {maximumFractionDigits: 1})} mi` : `R$ ${Math.round(v / 1000)} mil`;
const dt = s => s ? new Date(s) : null;
function fmtData(s) { if (!s) return ""; const d = dt(s); if (isNaN(d)) return ""; return d.toLocaleDateString("pt-BR", {day: "2-digit", month: "2-digit"}) + (d.getHours() || d.getMinutes() ? ` às ${String(d.getHours()).padStart(2, "0")}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, "0") : ""}` : ""); }
function falta(s) { if (!s) return ""; const ms = dt(s) - Date.now(); if (ms < 0) return "encerrado"; const h = ms / 36e5; if (h < 1) return `fecha em ${Math.max(1, Math.round(ms / 6e4))} min`; if (h < 48) return `fecha em ${Math.round(h)}h`; return `em ${Math.round(h / 24)} dias`; }
function fmtLocal(t) { const d = t ? new Date(t) : new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
const semAcento = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function juntar(a) { return a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]; }
function grad(id) { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return GRADS[h % GRADS.length]; }
function foto(l, cls = "") {
  const g = grad(l.id), src = urlSegura(l.imagem);
  if (!src) return `<div class="foto sem ${cls}" style="--g:${g}">${CASA}</div>`;
  return `<div class="foto ${cls}" style="background:${g};--g:${g}"><img loading="lazy" decoding="async" referrerpolicy="no-referrer" src="${esc(src)}" alt=""></div>`;
}
// imagens: aparecem suaves ao carregar; se falharem, mostram a casinha (sem atributos onload/onerror, por segurança)
document.addEventListener("load", e => { if (e.target.tagName === "IMG") e.target.classList.add("ok"); }, true);
document.addEventListener("error", e => {
  const i = e.target; if (i.tagName !== "IMG") return;
  const p = i.parentNode; if (!p) return;
  if (p.classList.contains("foto")) { p.classList.add("sem"); i.outerHTML = CASA; } else i.remove();
}, true);

function toast(t) { const e = $("#toast"); e.textContent = t; e.classList.add("on"); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove("on"), 2400); }

/* ---------- tela de carregamento ---------- */
const MSGS = {inicio: ["Preparando seus leilões…", "Buscando lotes da Frazão…", "Consultando o Portal Zuk…", "Organizando a Mega Leilões…", "Trazendo os imóveis da Biasi…", "Calculando os descontos…"],
  login: ["Conferindo seu acesso…", "Abrindo o cofre dos lotes…", "Organizando os leilões…"]};
let _carT = null, _carIni = 0;
function mostrarCarregando(tipo) {
  const c = $("#carregando"), m = $("#car-msg"); const lista = MSGS[tipo] || MSGS.inicio; let i = 0;
  c.hidden = false; c.classList.remove("saindo"); _carIni = Date.now(); m.textContent = lista[0]; clearInterval(_carT);
  _carT = setInterval(() => { i = (i + 1) % lista.length; m.style.opacity = 0; setTimeout(() => { m.textContent = lista[i]; m.style.opacity = 1; }, 220); }, 1300);
}
function esconderCarregando(rapido) {
  const espera = rapido ? 0 : Math.max(0, 700 - (Date.now() - _carIni));
  setTimeout(() => { const c = $("#carregando"); c.classList.add("saindo"); clearInterval(_carT); setTimeout(() => { if (c.classList.contains("saindo")) c.hidden = true; }, 500); }, espera);
}
function esqueletos(n) { return Array.from({length: n}, () => `<div class="esqueleto vidro"><div class="f"></div><div class="ls"><div class="l" style="width:40%"></div><div class="l" style="width:90%"></div><div class="l" style="width:60%"></div><div class="l" style="width:35%;height:15px;margin-top:4px"></div></div></div>`).join(""); }

/* ---------- tema e saudação ---------- */
function escolherTema(v) {
  if (!["auto", "claro", "escuro"].includes(v)) return;
  TEMA = v; LS.set("tema", TEMA);
  aplicarTema(typeof CONTA !== "undefined" && CONTA.perfil ? CONTA.perfil.nome : undefined);
  document.dispatchEvent(new CustomEvent("tema-mudou"));
}
function menuTema(abrirMenu) {
  const m = $("#menu-tema"); m.hidden = !abrirMenu; $("#astro").setAttribute("aria-expanded", String(abrirMenu));
}
document.addEventListener("click", e => {
  if (e.target.closest("#astro")) { menuTema($("#menu-tema").hidden); return; }
  const op = e.target.closest("[data-tema-op]");
  if (op) { escolherTema(op.dataset.temaOp); menuTema(false); toast({auto: "Tema automático: claro de dia, escuro à noite", claro: "Tema claro", escuro: "Tema escuro"}[op.dataset.temaOp]); return; }
  if (!e.target.closest("#menu-tema")) menuTema(false);
});
document.addEventListener("keydown", e => { if (e.key === "Escape") menuTema(false); });
let TEMA = LS.get("tema", "auto");
function aplicarTema(nome) {
  const h = new Date().getHours(); const dia = h >= 6 && h < 18;
  const t = TEMA === "auto" ? (dia ? "claro" : "escuro") : TEMA;
  document.documentElement.dataset.tema = t;
  $('meta[name=theme-color]').content = t === "claro" ? "#FFF3EA" : "#1E1640";
  // "only light" impede o modo escuro automático do navegador (Chrome/Samsung no Android) de escurecer o tema claro
  $('meta[name=color-scheme]').content = t === "claro" ? "only light" : "dark";
  if (nome === undefined) return;
  const s = h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite";
  $("#saudacao").textContent = nome ? `${s}, ${nome}` : s;
  const d = new Date().toLocaleDateString("pt-BR", {weekday: "long", day: "numeric", month: "long"});
  $("#data").textContent = d.charAt(0).toUpperCase() + d.slice(1);
  // o desenho mostra o tema em uso (sol = claro, lua = escuro); "A" quando está no automático
  $("#astro").setAttribute("aria-label", "Tema: " + {auto: "automático", claro: "claro", escuro: "escuro"}[TEMA] + ". Toque para mudar");
  $$("#menu-tema [data-tema-op]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.temaOp === TEMA)));
  $("#astro").innerHTML = (TEMA === "auto" ? '<span class="tema-auto">A</span>' : "") + (t === "claro"
    ? '<svg viewBox="0 0 48 48"><g stroke="#F2A93B" stroke-width="2.6" stroke-linecap="round">' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => { const r = a * Math.PI / 180; return `<line x1="${24 + Math.cos(r) * 15}" y1="${24 + Math.sin(r) * 15}" x2="${24 + Math.cos(r) * 20}" y2="${24 + Math.sin(r) * 20}"/>`; }).join("") + '</g><circle cx="24" cy="24" r="10.5" fill="#F7B733"/></svg>'
    : '<svg viewBox="0 0 48 48"><circle cx="22" cy="25" r="13" fill="#F4D58D"/><circle cx="29" cy="20" r="12" fill="var(--bg1)"/><circle cx="38" cy="10" r="1.3" fill="#C9D3EE"/><circle cx="42" cy="24" r="1" fill="#C9D3EE"/><circle cx="10" cy="8" r="1.1" fill="#C9D3EE"/></svg>');
}

/* ---------- folhas (janelas que sobem de baixo) ---------- */
let folhaAberta = null;
function abrir(id) {
  fecharReal(); folhaAberta = $(id); folhaAberta.style.transform = ""; folhaAberta.classList.add("on"); $("#scrim").classList.add("on"); document.body.style.overflow = "hidden";
  if (!(history.state && history.state.folha)) history.pushState({folha: true}, "");
}
function fecharReal() { if (folhaAberta) { folhaAberta.classList.remove("on"); folhaAberta.style.transform = ""; } folhaAberta = null; $("#scrim").classList.remove("on"); document.body.style.overflow = ""; }
function fechar() { const tinha = !!folhaAberta; fecharReal(); if (tinha && history.state && history.state.folha) history.back(); }
window.addEventListener("popstate", () => { if (folhaAberta) fecharReal(); });
$("#scrim").addEventListener("click", () => fechar());
document.addEventListener("click", e => { if (e.target.closest("[data-fechar]")) { e.preventDefault(); fechar(); } });
document.addEventListener("keydown", e => { if (e.key === "Escape") fechar(); });
$$(".folha").forEach(f => {
  const corpo = f.querySelector(".folha-corpo"); let y0 = null, d = 0;
  f.addEventListener("touchstart", e => { const naAlca = e.target.closest(".alca,.folha-cab,.det-foto"); y0 = (naAlca || corpo.scrollTop <= 0) ? e.touches[0].clientY : null; d = 0; }, {passive: true});
  f.addEventListener("touchmove", e => { if (y0 == null) return; d = e.touches[0].clientY - y0; if (d > 0) { f.style.transition = "none"; f.style.transform = `translate(-50%,${d}px)`; } else if (d < -10) y0 = null; }, {passive: true});
  f.addEventListener("touchend", () => { f.style.transition = ""; if (y0 != null && d > 110) fechar(); else f.style.transform = ""; y0 = null; });
});

/* ---------- mostrar/ocultar senha ---------- */
document.addEventListener("click", e => {
  const b = e.target.closest("[data-olho]"); if (!b) return;
  const i = b.parentNode.querySelector("input"); i.type = i.type === "password" ? "text" : "password";
});

/* ---------- carregar scripts pesados só quando precisar ---------- */
const _scripts = {};
function carregarScript(src) {
  if (!_scripts[src]) _scripts[src] = new Promise((ok, erro) => {
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => { delete _scripts[src]; erro(new Error("não carregou " + src)); };
    document.head.appendChild(s);
  });
  return _scripts[src];
}
