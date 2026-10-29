/* LeilãoTrack · painel do grupo (só aparece para administradores; o banco confere o papel em cada ação) */
"use strict";
const Admin = (() => {
  let membros = [];
  const linkConvite = (codigo, email) => `${location.origin}${location.pathname}#convite=${encodeURIComponent(codigo)}&email=${encodeURIComponent(email)}`;
  const ERROS = {sem_permissao: "Só administradores podem fazer isso.", email_invalido: "Confira o e-mail.", nome_invalido: "Escreva o nome (até 40 letras).",
    ja_cadastrado: "Esse e-mail já tem conta no grupo.", limite_diario: "Limite de 50 convites por dia atingido.", nao_pode_remover_a_si: "Você não pode remover a própria conta.", nao_encontrado: "Pessoa não encontrada."};
  const msgErro = e => { const t = String(e && e.message || ""); const k = Object.keys(ERROS).find(k => t.includes(k)); return k ? ERROS[k] : "Não deu certo agora. Tente de novo."; };

  function html() {
    return `<div class="painel vidro" id="adm"><h4>Painel do grupo <span class="selo-p" style="margin-left:6px">ADMIN</span></h4>
      <p class="texto-ajuda" style="margin-top:0">Convide pessoas, gere código de nova senha e tire o acesso de quem sair do grupo. Você vê quem tem acesso, mas não vê as chaves de IA, as perícias nem os favoritos de ninguém.</p>
      <div class="sec">Convidar pessoa</div>
      <label class="campo">Nome (aparece no "Bom dia, …")<input id="adm-nome" maxlength="40" autocomplete="off"></label>
      <label class="campo">E-mail<input id="adm-email" type="email" maxlength="254" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
      <div class="login-erro" id="adm-erro" role="alert"></div>
      <button class="btn-grande btn-acc" id="adm-convidar">Gerar convite</button>
      <div id="adm-codigo"></div>
      <div class="sec" style="margin-top:22px">Pessoas no grupo <span id="adm-qtd"></span></div>
      <div id="adm-lista"><p class="texto-ajuda">Carregando…</p></div></div>`;
  }
  function caixaCodigo(titulo, nome, email, codigo, expira, tipo) {
    const link = linkConvite(codigo, email);
    const msg = tipo === "senha"
      ? `Oi, ${nome}! Seu código para criar uma nova senha no LeilãoTrack é ${codigo} (vale por 24 horas). Abra ${location.origin}${location.pathname}, toque em "Esqueci a senha" e use este código com o seu e-mail (${email}).`
      : `Oi, ${nome}! Você foi convidado para o LeilãoTrack, que reúne os leilões de imóveis da Frazão, Zuk e Mega num lugar só.\n\nAbra este link para criar sua senha:\n${link}\n\nSeu código: ${codigo} (vale por 7 dias, use com o e-mail ${email}).`;
    $("#adm-codigo").innerHTML = `<div class="codigo-box"><div class="texto-ajuda"><b>${esc(titulo)}</b> para ${esc(nome)} · vale até ${esc(new Date(expira).toLocaleString("pt-BR", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}))}</div>
      <div class="cod">${esc(codigo)}</div>
      <p class="texto-ajuda" style="margin-top:0">Este código aparece só agora. Envie para a pessoa por um canal seu:</p>
      <div class="linha-botoes"><button class="btn-sec vidro" id="adm-copiar">Copiar mensagem</button>
        <a class="btn-sec vidro" style="display:grid;place-items:center;text-decoration:none;color:var(--tx)" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener noreferrer">Enviar no WhatsApp</a>
        <a class="btn-sec vidro" style="display:grid;place-items:center;text-decoration:none;color:var(--tx)" href="mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(tipo === "senha" ? "Nova senha no LeilãoTrack" : "Convite para o LeilãoTrack")}&body=${encodeURIComponent(msg)}">Enviar por e-mail</a></div></div>`;
    $("#adm-copiar").addEventListener("click", async () => { try { await navigator.clipboard.writeText(msg); toast("Mensagem copiada"); } catch (e) { toast("Não consegui copiar; anote o código"); } });
  }
  async function carregarLista() {
    try {
      membros = await SB.rpc("admin_membros") || [];
      const ativos = membros.filter(m => m.situacao === "ativo").length;
      $("#adm-qtd").textContent = `${ativos} ativo${ativos === 1 ? "" : "s"}${membros.length > ativos ? ` · ${membros.length - ativos} convite(s) pendente(s)` : ""}`;
      $("#adm-lista").innerHTML = membros.map((m, i) => {
        const eu = m.id && m.id === CONTA.uid, pend = m.situacao === "pendente";
        const sub = pend ? "convite pendente" : `${m.papel === "admin" ? "administrador · " : ""}${m.ultimo_acesso ? "último acesso " + new Date(m.ultimo_acesso).toLocaleDateString("pt-BR") : "ainda não entrou"}`;
        return `<div class="membro"><span class="av ${pend ? "pend" : ""}">${esc((m.nome || "?").trim().charAt(0).toUpperCase())}</span>
          <div class="nm"><b>${esc(m.nome)}${eu ? " (você)" : ""}</b><small>${esc(m.email)} · ${esc(sub)}</small></div>
          <div class="acoes-m">${pend ? `<button class="btn-mini" data-reenviar="${i}">Novo código</button><button class="btn-mini perigo" data-cancelar="${i}">Cancelar</button>`
            : eu ? "" : `<button class="btn-mini" data-senha="${i}">Código de senha</button><button class="btn-mini perigo" data-remover="${i}">Remover</button>`}</div></div>`;
      }).join("") || '<p class="texto-ajuda">Ninguém ainda.</p>';
    } catch (e) { $("#adm-lista").innerHTML = `<p class="texto-ajuda erro">${esc(msgErro(e))}</p>`; }
  }
  async function convidar(nome, email) {
    const r = await SB.rpc("admin_criar_convite", {p_email: email, p_nome: nome});
    const x = Array.isArray(r) ? r[0] : r;
    caixaCodigo("Convite criado", nome, email.toLowerCase(), x.codigo, x.expira_em, "convite");
    carregarLista();
  }

  function montar(alvo) {
    alvo.insertAdjacentHTML("beforeend", html());
    $("#adm-convidar").addEventListener("click", async () => {
      const nome = $("#adm-nome").value.trim(), email = $("#adm-email").value.trim().toLowerCase(); $("#adm-erro").textContent = "";
      if (!nome) { $("#adm-erro").textContent = "Escreva o nome da pessoa."; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { $("#adm-erro").textContent = "Confira o e-mail."; return; }
      const bt = $("#adm-convidar"); bt.disabled = true;
      try { await convidar(nome, email); $("#adm-nome").value = ""; $("#adm-email").value = ""; }
      catch (e) { $("#adm-erro").textContent = msgErro(e); }
      bt.disabled = false;
    });
    $("#adm-lista").addEventListener("click", async e => {
      const b = e.target.closest("button"); if (!b) return;
      const i = +(b.dataset.reenviar ?? b.dataset.cancelar ?? b.dataset.senha ?? b.dataset.remover); const m = membros[i]; if (!m) return;
      b.disabled = true;
      try {
        if (b.dataset.reenviar != null) await convidar(m.nome, m.email);
        else if (b.dataset.cancelar != null) { if (confirm(`Cancelar o convite de ${m.nome}?`)) { await SB.rpc("admin_cancelar_convite", {p_email: m.email}); toast("Convite cancelado"); carregarLista(); } }
        else if (b.dataset.senha != null) { const r = await SB.rpc("admin_codigo_senha", {p_user: m.id}); const x = Array.isArray(r) ? r[0] : r; caixaCodigo("Código de nova senha", m.nome, m.email, x.codigo, x.expira_em, "senha"); $("#adm-codigo").scrollIntoView({behavior: "smooth", block: "center"}); }
        else if (b.dataset.remover != null) { if (confirm(`Remover ${m.nome} do grupo? A conta, os favoritos e as preferências dessa pessoa serão apagados.`)) { await SB.rpc("admin_remover", {p_user: m.id}); toast(`${m.nome} foi removido`); carregarLista(); } }
      } catch (er) { toast(msgErro(er)); }
      b.disabled = false;
    });
    carregarLista();
  }
  return {montar};
})();
