/* LeilãoTrack · conexão com o banco (Supabase), sem bibliotecas externas.
   Só fala com o endereço do projeto configurado; a chave pública (anon/publishable)
   é feita para ficar no navegador: quem protege os dados são as regras do banco. */
"use strict";
const SB = (() => {
  const CFG = window.LT_CONFIG || {};
  const BASE = String(CFG.url || "").trim().replace(/\/+$/, "");
  const KEY = String(CFG.chave || "").trim();
  const configurado = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(BASE) && KEY.length > 30 && !/^sb_secret_/.test(KEY) && !/service_role/.test(atobSeguro(KEY.split(".")[1] || ""));
  const ITEM = "lt_sessao";
  let sessao = null, renovando = null;
  const ouvintes = new Set();

  function atobSeguro(s) { try { return atob(s.replace(/-/g, "+").replace(/_/g, "/")); } catch (e) { return ""; } }
  function armazem() {
    try { return localStorage.getItem("lt_lembrar") === "0" ? sessionStorage : localStorage; } catch (e) { return null; }
  }
  function gravar(s) {
    try {
      localStorage.removeItem(ITEM); sessionStorage.removeItem(ITEM);
      if (s) armazem().setItem(ITEM, JSON.stringify(s));
    } catch (e) { /* modo privado: fica só na memória */ }
  }
  function lerGravada() {
    try { const t = localStorage.getItem(ITEM) || sessionStorage.getItem(ITEM); return t ? JSON.parse(t) : null; } catch (e) { return null; }
  }
  function definir(s) {
    if (s && s.access_token) {
      sessao = {
        access_token: s.access_token, refresh_token: s.refresh_token,
        expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
        user: s.user ? {id: s.user.id, email: s.user.email} : (sessao && sessao.user),
      };
    } else sessao = null;
    gravar(sessao);
    ouvintes.forEach(f => { try { f(sessao); } catch (e) {} });
  }

  class Erro extends Error {
    constructor(msg, status, codigo) { super(msg); this.status = status; this.codigo = codigo || ""; }
  }

  async function pedir(caminho, {metodo = "GET", corpo, autenticado = true, cabecalhos = {}, bruto = false, sinal, tentou = false} = {}) {
    if (!configurado) throw new Erro("O site ainda não foi configurado.", 0, "sem_config");
    const h = Object.assign({apikey: KEY}, cabecalhos);
    if (autenticado) {
      const t = await token();
      if (!t) throw new Erro("Sua sessão terminou. Entre de novo.", 401, "sem_sessao");
      h.Authorization = "Bearer " + t;
    } else if (KEY.startsWith("eyJ")) h.Authorization = "Bearer " + KEY;
    if (corpo !== undefined) h["Content-Type"] = "application/json";
    const r = await fetch(BASE + caminho, {
      method: metodo, headers: h, body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: sinal, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
    });
    if (r.status === 401 && autenticado && !tentou && sessao) {
      await renovar().catch(() => {});
      if (sessao) return pedir(caminho, {metodo, corpo, autenticado, cabecalhos, bruto, sinal, tentou: true});
    }
    if (!r.ok) {
      let j = {};
      try { j = await r.json(); } catch (e) {}
      const msg = j.msg || j.message || j.error_description || j.error || ("Erro " + r.status);
      throw new Erro(String(msg), r.status, j.error_code || j.code || "");
    }
    if (bruto) return r;
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  }

  async function token() {
    if (!sessao) return null;
    if (sessao.expires_at * 1000 - Date.now() < 90000) await renovar().catch(() => {});
    return sessao ? sessao.access_token : null;
  }
  function renovar() {
    if (!sessao) return Promise.reject(new Erro("sem sessão", 401));
    if (!renovando) {
      const rt = sessao.refresh_token;
      renovando = (async () => {
        try {
          const s = await pedir("/auth/v1/token?grant_type=refresh_token", {metodo: "POST", corpo: {refresh_token: rt}, autenticado: false});
          definir(s);
        } catch (e) {
          // outra aba pode ter renovado antes: usa a sessão dela
          const g = lerGravada();
          if (g && g.refresh_token !== rt) { sessao = g; return; }
          if (e.status && e.status >= 400 && e.status < 500) definir(null);
          throw e;
        } finally { renovando = null; }
      })();
    }
    return renovando;
  }
  // sessão compartilhada entre abas abertas
  window.addEventListener("storage", e => { if (e.key === ITEM) { sessao = lerGravada(); ouvintes.forEach(f => { try { f(sessao); } catch (er) {} }); } });

  const enc = encodeURIComponent;
  return {
    configurado, Erro,
    get usuario() { return sessao && sessao.user; },
    aoMudar(f) { ouvintes.add(f); },
    async iniciar() {
      sessao = lerGravada();
      if (sessao) { try { await renovar(); } catch (e) { if (!sessao) return null; } }
      return sessao;
    },
    async entrar(email, senha, lembrar) {
      try { localStorage.setItem("lt_lembrar", lembrar ? "1" : "0"); } catch (e) {}
      const s = await pedir("/auth/v1/token?grant_type=password", {metodo: "POST", corpo: {email, password: senha}, autenticado: false});
      definir(s); return sessao;
    },
    async cadastrar(email, senha, codigo) {
      try { localStorage.setItem("lt_lembrar", "1"); } catch (e) {}
      const s = await pedir("/auth/v1/signup", {metodo: "POST", corpo: {email, password: senha, data: {convite: codigo}}, autenticado: false});
      if (s && s.access_token) { definir(s); return sessao; }
      return null; // projeto pede confirmação por e-mail
    },
    async sair() {
      try { if (sessao) await pedir("/auth/v1/logout?scope=local", {metodo: "POST"}); } catch (e) {}
      definir(null);
    },
    trocarSenha: senha => pedir("/auth/v1/user", {metodo: "PUT", corpo: {password: senha}}),
    rpc: (fn, args, anonimo) => pedir("/rest/v1/rpc/" + enc(fn), {metodo: "POST", corpo: args || {}, autenticado: !anonimo}),
    ler: (tabela, consulta) => pedir(`/rest/v1/${enc(tabela)}?${consulta || "select=*"}`),
    // modo: "mesclar" (atualiza se já existe) ou "ignorar" (não faz nada se já existe)
    inserir: (tabela, linhas, modo) => pedir(`/rest/v1/${enc(tabela)}`, {metodo: "POST", corpo: linhas,
      cabecalhos: {Prefer: (modo === "mesclar" ? "resolution=merge-duplicates," : modo === "ignorar" ? "resolution=ignore-duplicates," : "") + "return=minimal"}}),
    atualizar: (tabela, filtro, dados) => pedir(`/rest/v1/${enc(tabela)}?${filtro}`, {metodo: "PATCH", corpo: dados, cabecalhos: {Prefer: "return=minimal"}}),
    apagar: (tabela, filtro) => pedir(`/rest/v1/${enc(tabela)}?${filtro}`, {metodo: "DELETE", cabecalhos: {Prefer: "return=minimal"}}),
    async arquivo(nome, sinal) {
      const r = await pedir("/storage/v1/object/authenticated/privado/" + enc(nome), {bruto: true, sinal});
      return r.arrayBuffer();
    },
  };
})();
