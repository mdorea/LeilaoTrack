/* LeilãoTrack · início do app: acesso, preferências, abas e ajustes */
"use strict";
["#rodape-app", "#rodape-acesso", "#rodape-config"].forEach(s => { const e = $(s); if (e) e.innerHTML = RODAPE; });
let NO_APP = false;

/* ---------------- telas de acesso ---------------- */
function mostrarAcesso(qual, dados) {
  NO_APP = false;
  esconderCarregando(true);
  $("#app").hidden = true; $("#nav").hidden = true; $("#tela-pref").hidden = true;
  $("#tela-acesso").hidden = false;
  for (const f of ["entrar", "convite", "senha"]) $("#f-" + f).hidden = f !== qual;
  $$(".login-erro,.msg-ok").forEach(e => { if (e.closest("#tela-acesso")) e.textContent = ""; });
  if (qual === "convite") {
    $("#c-passo2").hidden = true; $("#c-botao").textContent = "Conferir convite"; $("#c-titulo").textContent = "Primeiro acesso";
    $("#c-sub").textContent = "Use o e-mail e o código do convite que você recebeu.";
    if (dados) { $("#c-email").value = dados.email || ""; $("#c-codigo").value = dados.codigo || ""; }
  }
  if (dados && dados.erro) $(qual === "entrar" ? "#e-erro" : qual === "convite" ? "#c-erro" : "#s-erro").textContent = dados.erro;
  if (dados && dados.email && qual === "entrar") $("#e-email").value = dados.email;
  setTimeout(() => { const i = $(`#f-${qual} input:not([type=checkbox])`); if (i && !i.value) i.focus(); }, 80);
}
document.addEventListener("click", e => { const b = e.target.closest("[data-ir]"); if (b) mostrarAcesso(b.dataset.ir); });
function tremer(id) { const c = $(id); c.classList.remove("tremer"); void c.offsetWidth; c.classList.add("tremer"); }
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
function mensagemAuth(e) {
  const t = String(e && e.message || "").toLowerCase();
  if (e && e.status === 429 || /rate limit|too many/.test(t)) return "Muitas tentativas. Espere alguns minutos e tente de novo.";
  if (/invalid login|invalid credentials|invalid_grant/.test(t)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/.test(t)) return "Confirme seu e-mail pelo link que você recebeu e tente de novo.";
  if (/already registered|already been registered|user_already_exists/.test(t)) return "Esse e-mail já tem conta. Toque em \"Já tenho conta\".";
  if (/database error|convite_invalido/.test(t)) return "Convite ou código inválido. Confira o e-mail e o código, ou peça um novo convite.";
  if (/password/.test(t) && /(weak|short|least|characters)/.test(t)) return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
  if (/failed to fetch|network|load failed/.test(t)) return "Sem conexão com a internet. Tente de novo.";
  return "Não deu certo agora. Tente de novo em instantes.";
}
function forcaSenha(s, email) {
  if (!s) return 0;
  let p = Math.min(4, Math.floor(s.length / 3));
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) p++; if (/\d/.test(s)) p++; if (/[^A-Za-z0-9]/.test(s)) p++;
  if (/^(.)\1+$/.test(s) || /^(?:0123|1234|2345|3456|4567|5678|6789|abcd|senha|password|qwer)/i.test(s)) p = 1;
  if (email && s.toLowerCase().includes(email.split("@")[0].toLowerCase())) p = Math.min(p, 2);
  return Math.min(p, 7);
}
function senhaRuim(s, email) {
  if (s.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (s.length > 72) return "A senha pode ter no máximo 72 caracteres.";
  if (forcaSenha(s, email) < 3) return "Senha muito fácil de adivinhar. Misture letras e números e evite sequências.";
  return "";
}

$("#f-entrar").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#e-email").value.trim().toLowerCase(), senha = $("#e-senha").value; $("#e-erro").textContent = "";
  if (!emailOk(email) || !senha) { $("#e-erro").textContent = "Preencha o e-mail e a senha."; tremer("#f-entrar"); return; }
  const bt = $("#f-entrar button[type=submit]"); bt.disabled = true; bt.textContent = "Entrando…";
  try { await SB.entrar(email, senha, $("#e-lembrar").checked); $("#e-senha").value = ""; await entrarNoApp(); }
  catch (er) { $("#e-erro").textContent = mensagemAuth(er); tremer("#f-entrar"); }
  bt.disabled = false; bt.textContent = "Entrar";
});

let conviteConferido = false;
$("#c-senha").addEventListener("input", () => {
  const p = forcaSenha($("#c-senha").value, $("#c-email").value); const f = $("#c-forca");
  f.style.width = Math.min(100, p / 7 * 100) + "%"; f.style.background = p < 3 ? "var(--hot)" : p < 5 ? "#C98A00" : "var(--price)";
});
["#c-email", "#c-codigo"].forEach(id => $(id).addEventListener("input", () => { if (conviteConferido) { conviteConferido = false; $("#c-passo2").hidden = true; $("#c-botao").textContent = "Conferir convite"; } }));
$("#f-convite").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#c-email").value.trim().toLowerCase(), codigo = $("#c-codigo").value.trim().toUpperCase(); $("#c-erro").textContent = "";
  if (!emailOk(email) || codigo.replace(/[^A-Z0-9]/g, "").length < 12) { $("#c-erro").textContent = "Confira o e-mail e o código (12 letras e números)."; tremer("#f-convite"); return; }
  const bt = $("#c-botao"); bt.disabled = true;
  try {
    if (!conviteConferido) {
      bt.textContent = "Conferindo…";
      const r = await SB.rpc("conferir_convite", {p_email: email, p_codigo: codigo}, true);
      const x = Array.isArray(r) ? r[0] : r;
      if (!x || !x.ok) { $("#c-erro").textContent = (x && x.motivo) || "Convite ou código inválido."; tremer("#f-convite"); }
      else {
        conviteConferido = true; $("#c-passo2").hidden = false;
        $("#c-titulo").textContent = `Olá, ${x.nome}!`; $("#c-sub").textContent = "Convite confirmado. Agora crie a sua senha.";
        setTimeout(() => $("#c-senha").focus(), 60);
      }
    } else {
      const s1 = $("#c-senha").value, s2 = $("#c-senha2").value;
      const ruim = senhaRuim(s1, email);
      if (ruim) $("#c-erro").textContent = ruim;
      else if (s1 !== s2) $("#c-erro").textContent = "As duas senhas não são iguais.";
      else {
        bt.textContent = "Criando sua conta…";
        const s = await SB.cadastrar(email, s1, codigo);
        $("#c-senha").value = ""; $("#c-senha2").value = "";
        if (s) { await entrarNoApp(); bt.disabled = false; return; }
        mostrarAcesso("entrar", {email, erro: "Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre."});
      }
    }
  } catch (er) { $("#c-erro").textContent = mensagemAuth(er); tremer("#f-convite"); }
  bt.disabled = false; bt.textContent = conviteConferido ? "Criar conta e entrar" : "Conferir convite";
});

$("#f-senha").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#s-email").value.trim().toLowerCase(), codigo = $("#s-codigo").value.trim().toUpperCase(), senha = $("#s-senha").value;
  $("#s-erro").textContent = ""; $("#s-ok").textContent = "";
  if (!emailOk(email) || codigo.replace(/[^A-Z0-9]/g, "").length < 12) { $("#s-erro").textContent = "Confira o e-mail e o código."; return; }
  const ruim = senhaRuim(senha, email); if (ruim) { $("#s-erro").textContent = ruim; return; }
  const bt = $("#f-senha button[type=submit]"); bt.disabled = true;
  try {
    const r = await SB.rpc("redefinir_senha", {p_email: email, p_codigo: codigo, p_senha: senha}, true);
    if (r === "ok") { $("#s-senha").value = ""; mostrarAcesso("entrar", {email}); $("#e-erro").textContent = ""; toast("Senha nova salva. Entre com ela."); }
    else $("#s-erro").textContent = String(r || "Não deu certo.");
  } catch (er) { $("#s-erro").textContent = mensagemAuth(er); }
  bt.disabled = false;
});

/* ---------------- preferências do Top 15 ---------------- */
let rascPref = null, prefPrimeiro = false;
function abrirPref(primeiro) {
  prefPrimeiro = primeiro;
  rascPref = {ufs: [...CONTA.prefs.ufs], tipos: [...CONTA.prefs.tipos]};
  $("#pref-passo").textContent = primeiro ? "PRIMEIRO ACESSO" : "SEU PERFIL";
  $("#pref-cancelar").hidden = primeiro; $("#pref-erro").textContent = "";
  desenharPref(); $("#tela-pref").hidden = false; $("#tela-pref").scrollTop = 0;
}
function desenharPref() {
  $("#pref-ufs").innerHTML = UFS.map(u => `<button type="button" class="chip ${rascPref.ufs.includes(u) ? "on" : "vidro"}" data-uf="${u}">${u}</button>`).join("");
  $("#pref-tipos").innerHTML = TIPOS_PREF.map(t => `<button type="button" class="chip ${rascPref.tipos.includes(t) ? "on" : "vidro"}" data-tipo="${t}">${rascPref.tipos.includes(t) ? "✓ " : ""}${t}</button>`).join("");
  $("#pref-todos-uf").classList.toggle("on", !rascPref.ufs.length); $("#pref-todos-tipo").classList.toggle("on", !rascPref.tipos.length);
  $("#pref-resumo").innerHTML = `<b>Seu Top 15 vai olhar:</b> ${esc(rascPref.ufs.length ? juntar(rascPref.ufs) : "todos os estados")} · ${esc(rascPref.tipos.length ? juntar(rascPref.tipos) : "todos os tipos (o ranking usa casas e apartamentos)")}`;
}
$("#tela-pref").addEventListener("click", e => {
  const u = e.target.closest("[data-uf]"), t = e.target.closest("[data-tipo]");
  const alterna = (a, v) => a.includes(v) ? a.filter(x => x !== v) : [...a, v];
  if (u) rascPref.ufs = alterna(rascPref.ufs, u.dataset.uf);
  else if (t) rascPref.tipos = alterna(rascPref.tipos, t.dataset.tipo);
  else if (e.target.closest("#pref-todos-uf")) rascPref.ufs = [];
  else if (e.target.closest("#pref-todos-tipo")) rascPref.tipos = [];
  else return;
  desenharPref();
});
$("#pref-cancelar").addEventListener("click", () => { $("#tela-pref").hidden = true; });
$("#pref-salvar").addEventListener("click", async () => {
  const bt = $("#pref-salvar"); bt.disabled = true; $("#pref-erro").textContent = "";
  try {
    await CONTA.salvarPrefs(rascPref.ufs, rascPref.tipos);
    $("#tela-pref").hidden = true; _rankCache = {k: null, v: null};
    S.filtro.top = true; salvarFiltro();
    if (S.aba !== "inicio") trocarAba("inicio"); else render();
    atualizarBadge(); window.scrollTo({top: 0}); if (!prefPrimeiro) toast("Preferências salvas");
  } catch (er) { $("#pref-erro").textContent = "Não consegui salvar agora. Confira a conexão."; }
  bt.disabled = false;
});

/* ---------------- entrar no app ---------------- */
async function entrarNoApp() {
  mostrarCarregando("login");
  try {
    if (!(await CONTA.carregar())) {
      await SB.sair();
      mostrarAcesso("entrar", {erro: "Sua conta não está ativa neste grupo. Fale com o administrador."}); return;
    }
  } catch (e) {
    if (!SB.usuario) { mostrarAcesso("entrar", {erro: "Sua sessão terminou. Entre de novo."}); return; }
    mostrarAcesso("entrar", {erro: mensagemAuth(e)}); return;
  }
  $("#tela-acesso").hidden = true;
  $("#app").hidden = false; $("#nav").hidden = false; NO_APP = true;
  aplicarTema(CONTA.perfil.nome);
  $("#grade").innerHTML = esqueletos(6);
  try { await baixarLotes(true); }
  catch (e) { S.lotes = []; toast(e.status === 404 || e.status === 400 ? "Os lotes ainda não foram publicados" : "Não consegui baixar os lotes agora"); }
  trocarAba(S.aba === "favoritos" || S.aba === "alertas" ? S.aba : "inicio");
  atualizarBadge();
  esconderCarregando();
  if (!CONTA.prefs.configurado) abrirPref(true);
}
SB.aoMudar(s => { if (!s && NO_APP) { NO_APP = false; mostrarAcesso("entrar", {erro: "Sua sessão terminou. Entre de novo."}); } });

/* ---------------- abas ---------------- */
$("#nav").addEventListener("click", e => { const b = e.target.closest("button"); if (b) trocarAba(b.dataset.aba); });
function trocarAba(a) {
  if (!["inicio", "favoritos", "alertas", "pericia", "ajustes"].includes(a)) a = "inicio";
  S.aba = a; $$("#nav button").forEach(b => b.classList.toggle("on", b.dataset.aba === a));
  $("#aba-inicio").hidden = !(a === "inicio" || a === "favoritos"); $("#aba-alertas").hidden = a !== "alertas";
  $("#aba-pericia").hidden = a !== "pericia"; $("#aba-ajustes").hidden = a !== "ajustes";
  $(".topo").hidden = a === "pericia" || a === "ajustes";
  window.scrollTo(0, 0);
  if (a === "alertas") { _vistoVisita = CONTA.prefs.alertas_visto || ""; renderAlertas(); }
  else { _vistoVisita = null; if (a === "ajustes") renderAjustes(); else if (a === "pericia") Pericia.iniciar(); else render(); }
}

/* ---------------- ajustes ---------------- */
function statusSites(est) {
  return ["Zuk", "Frazão", "Mega"].map(s => { const i = (est.sites || {})[s] || {};
    return `<div class="site-st"><span><i class="dot" style="display:inline-block;background:${SITE_COR[s]};margin-right:8px"></i>${SITE_NOME[s]}</span><span class="${i.status === "ok" ? "ok" : i.status ? "erro" : ""}">${i.status === "ok" ? `${Number(i.lotes || 0).toLocaleString("pt-BR")} lotes · ${esc(new Date(i.quando).toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"}))}` : i.status === "pausado" ? "em pausa" : i.status === "erro" ? "erro ao ler" : "aguardando"}</span></div>`; }).join("");
}
async function renderAjustes() {
  const est = S.estado || {}; const f = d => d ? new Date(d).toLocaleString("pt-BR", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}) : "—";
  const ia = await IA.info();
  const p = CONTA.perfil || {};
  $("#aba-ajustes").innerHTML = `<div class="cab"><h2>Ajustes</h2></div>
    <div class="painel vidro"><h4>Minha conta</h4>
      <label class="campo">Seu nome na saudação<input id="aj-nome" maxlength="40" value="${esc(p.nome)}"></label>
      <p class="texto-ajuda" style="margin-top:-4px">E-mail: <b>${esc(p.email)}</b></p>
      <button class="btn-sec vidro" id="aj-salvar-nome">Salvar nome</button>
      <div class="sec">Trocar senha</div>
      <label class="campo olho">Nova senha<input id="aj-senha" type="password" autocomplete="new-password" maxlength="72"><button type="button" data-olho aria-label="Mostrar senha"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></label>
      <label class="campo">Repita a nova senha<input id="aj-senha2" type="password" autocomplete="new-password" maxlength="72"></label>
      <div class="login-erro" id="aj-erro" role="alert"></div>
      <button class="btn-sec vidro" id="aj-trocar">Trocar senha</button>
      <button class="btn-sec vidro" id="aj-sair" style="color:var(--hot)">Sair deste aparelho</button></div>
    <div class="painel vidro"><h4>Meu Top 15</h4><p class="texto-ajuda" style="margin-top:0">${esc(textoPerfil())}</p><button class="btn-sec vidro" id="aj-pref">Ajustar estados e tipos</button></div>
    <div class="painel vidro"><h4>Minha IA</h4><p class="texto-ajuda" style="margin-top:0">${ia ? `Usando <b>${esc(ia.nome)}</b> com a sua chave (…${esc(ia.final)}), guardada só neste aparelho.` : "Nenhuma chave neste aparelho. A perícia usa a sua própria chave de IA (Claude ou Gemini)."}</p><button class="btn-sec vidro" id="aj-ia">${ia ? "Trocar ou apagar a chave" : "Conectar minha IA"}</button></div>
    <div class="painel vidro"><h4>Aparência</h4>
      <div class="chips wrap" id="aj-temas">${[["auto", "Automático (dia/noite)"], ["claro", "Claro"], ["escuro", "Escuro"]].map(([v, t]) => `<button class="chip ${TEMA === v ? "on" : "vidro"}" data-tema="${v}">${t}</button>`).join("")}</div></div>
    <div class="painel vidro"><h4>Atualização automática</h4>${statusSites(est)}
      <p class="texto-ajuda">Os sites são lidos na nuvem a cada <b>2 horas</b>, uma vez só para todo o grupo.<br>Última leitura: <b>${esc(f(est.ultima))}</b> · próxima: <b>~${esc(f(est.proxima))}</b></p></div>
    <div class="painel vidro"><h4>Instalar no celular</h4>
      <p class="texto-ajuda" style="margin-top:0">Abra este endereço no celular e toque em <b>Compartilhar › Adicionar à Tela de Início</b> (iPhone) ou <b>⋮ › Adicionar à tela inicial</b> (Android).</p></div>
    <div id="aj-admin"></div>`;
  $("#aj-salvar-nome").addEventListener("click", async () => {
    const n = $("#aj-nome").value.trim(); if (!n) { toast("Escreva seu nome"); return; }
    try { await CONTA.mudarNome(n); aplicarTema(CONTA.perfil.nome); toast("Nome salvo"); } catch (e) { toast("Não consegui salvar o nome"); }
  });
  $("#aj-trocar").addEventListener("click", async () => {
    const s1 = $("#aj-senha").value, s2 = $("#aj-senha2").value; $("#aj-erro").textContent = "";
    const ruim = senhaRuim(s1, p.email); if (ruim) { $("#aj-erro").textContent = ruim; return; }
    if (s1 !== s2) { $("#aj-erro").textContent = "As duas senhas não são iguais."; return; }
    try { await SB.trocarSenha(s1); $("#aj-senha").value = ""; $("#aj-senha2").value = ""; toast("Senha trocada"); }
    catch (e) { $("#aj-erro").textContent = /different|same/i.test(e.message) ? "A senha nova precisa ser diferente da atual." : mensagemAuth(e); }
  });
  $("#aj-sair").addEventListener("click", sairDoApp);
  $("#aj-pref").addEventListener("click", () => abrirPref(false));
  $("#aj-ia").addEventListener("click", () => IA.abrirTela(renderAjustes));
  $("#aj-temas").addEventListener("click", e => { const b = e.target.closest("[data-tema]"); if (!b) return; TEMA = b.dataset.tema; LS.set("tema", TEMA); aplicarTema(CONTA.perfil.nome); renderAjustes(); });
  if (CONTA.admin) Admin.montar($("#aj-admin"));
}
async function sairDoApp() {
  if (!confirm("Sair deste aparelho? A chave de IA e as perícias guardadas aqui também serão apagadas.")) return;
  const uid = CONTA.uid;
  await IA.apagarTudo();
  LS.del("pericias_" + uid);
  await SB.sair();
  location.replace(location.pathname);
}

/* ---------------- atualização dos lotes e do próprio app ---------------- */
async function verificar() {
  if (!NO_APP || document.hidden) return;
  aplicarTema(CONTA.perfil && CONTA.perfil.nome);
  try {
    if (await baixarLotes(false) && !folhaAberta) {
      const y = window.scrollY;
      if (S.aba === "alertas") renderAlertas(); else if (S.aba === "inicio" || S.aba === "favoritos") render();
      window.scrollTo(0, y); atualizarBadge(); toast("Lotes atualizados");
    }
  } catch (e) {}
}
setInterval(verificar, 5 * 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { verificar(); checarVersao(); } });
async function checarVersao() {
  try {
    const atual = $('meta[name=versao]').content; if (atual.startsWith("__")) return;
    const h = await (await fetch("index.html?t=" + Date.now(), {cache: "no-store"})).text();
    const nova = (h.match(/name="versao" content="([0-9a-f]{7,40})"/) || [])[1];
    let tentou = null; try { tentou = sessionStorage.getItem("lt_versao_tentada"); } catch (e) {}
    if (nova && nova !== atual && nova !== tentou && !folhaAberta) { try { sessionStorage.setItem("lt_versao_tentada", nova); } catch (e) {} location.replace(location.pathname + "?v=" + nova.slice(0, 8)); }
  } catch (e) {}
}
setInterval(checarVersao, 10 * 60000);

/* ---------------- início ---------------- */
// link de convite: #convite=CODIGO&email=... (o código não fica no endereço depois de lido)
function lerConviteDoEndereco() {
  if (location.hash.length < 2) return null;
  const q = new URLSearchParams(location.hash.slice(1)); let c = null;
  if (q.get("convite")) c = {codigo: q.get("convite").slice(0, 20), email: (q.get("email") || "").slice(0, 254)};
  history.replaceState(null, "", location.pathname + location.search);
  return c;
}
window.addEventListener("hashchange", () => {
  const c = lerConviteDoEndereco();
  if (c && !NO_APP && SB.configurado) mostrarAcesso("convite", c);
  else if (c) toast("Você já está conectado neste aparelho");
});
(async () => {
  aplicarTema();
  if (!SB.configurado) { esconderCarregando(true); $("#tela-config").hidden = false; return; }
  const convite = lerConviteDoEndereco();
  mostrarCarregando("inicio");
  let s = null;
  try { s = await SB.iniciar(); } catch (e) { s = null; }
  if (!s) { mostrarAcesso(convite ? "convite" : "entrar", convite || undefined); return; }
  if (convite) toast("Você já está conectado neste aparelho");
  await entrarNoApp();
})();
