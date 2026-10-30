/* LeilãoTrack · "Minha IA": cada pessoa usa a própria chave (Claude ou Gemini).
   No aparelho: cifrada com uma chave que o navegador não deixa exportar.
   Na conta: cifrada com uma chave tirada da senha da pessoa (o banco só vê texto embaralhado).
   As chamadas vão direto do navegador para a Anthropic ou o Google. */
"use strict";
const IA = (() => {
  const PROVS = {
    claude: {nome: "Claude", empresa: "Anthropic", selo: "melhor qualidade",
      desc: "Cerca de R$ 1 a 2 por perícia, cobrado na sua conta da Anthropic.",
      link: "https://console.anthropic.com/settings/keys", prefixo: /^[A-Za-z0-9_.\-]{20,300}$/},
    gemini: {nome: "Gemini", empresa: "Google", selo: "tem chave grátis",
      desc: "A chave gratuita tem limite diário de uso; bom para começar.",
      link: "https://aistudio.google.com/apikey", prefixo: /^[A-Za-z0-9_.\-]{20,300}$/},
  };
  const DB = "lt-ia", ST = "itens";
  let memoria = null; // usado se o navegador não deixar gravar (modo privado)

  function abrirDB() {
    return new Promise((ok, erro) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
    });
  }
  async function dbOp(modo, fn) {
    const db = await abrirDB();
    return new Promise((ok, erro) => {
      const tx = db.transaction(ST, modo); const st = tx.objectStore(ST); const r = fn(st);
      tx.oncomplete = () => { db.close(); ok(r && r.result); }; tx.onerror = () => { db.close(); erro(tx.error); };
    });
  }
  const dbGet = k => dbOp("readonly", st => st.get(k));
  const dbPut = (k, v) => dbOp("readwrite", st => st.put(v, k));
  const dbDel = k => dbOp("readwrite", st => st.delete(k));
  async function cofre() {
    let k = await dbGet("cofre");
    if (!k) { k = await crypto.subtle.generateKey({name: "AES-GCM", length: 256}, false, ["encrypt", "decrypt"]); await dbPut("cofre", k); }
    return k;
  }
  const chaveItem = () => "ia:" + (CONTA.uid || "");
  async function gravar(reg, segredo) {
    try {
      const k = await cofre(); const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({name: "AES-GCM", iv}, k, new TextEncoder().encode(segredo));
      await dbPut(chaveItem(), Object.assign({}, reg, {iv, ct}));
      memoria = null; return true;
    } catch (e) { memoria = Object.assign({}, reg, {segredo}); return false; }
  }
  async function ler() {
    if (memoria && memoria.uid === CONTA.uid) return memoria;
    try {
      const r = await dbGet(chaveItem()); if (!r) return null;
      const k = await cofre();
      const pt = await crypto.subtle.decrypt({name: "AES-GCM", iv: r.iv}, k, r.ct);
      return Object.assign({}, r, {segredo: new TextDecoder().decode(pt)});
    } catch (e) { return null; }
  }
  async function apagarLocal() { memoria = null; try { await dbDel(chaveItem()); await dbDel(cofreItem()); } catch (e) {} }

  /* ---------- cópia na conta: cifrada com uma chave tirada da SENHA da pessoa ----------
     O banco guarda só texto embaralhado. Para abrir em outro aparelho é preciso a senha,
     que nem o banco nem o administrador conhecem. */
  const cofreItem = () => "cofre:" + (CONTA.uid || "");
  const b64e = u8 => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
  const b64d = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
  const extra = () => new TextEncoder().encode("leilaotrack:" + CONTA.uid);
  let remota = undefined, situacaoConta = ""; // "", "precisa_senha", "senha_mudou"
  async function linhaConta(forcar) {
    if (remota !== undefined && !forcar) return remota;
    try { const r = await SB.ler("chaves_ia", "select=sal,prov,modelo_analise,modelo_leitura,final,iv,cifra&limit=1"); remota = (r && r[0]) || null; }
    catch (e) { remota = null; }
    return remota;
  }
  async function derivar(senha, sal) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({name: "PBKDF2", salt: b64d(sal), iterations: 310000, hash: "SHA-256"}, base, {name: "AES-GCM", length: 256}, false, ["encrypt", "decrypt"]);
  }
  // chamado com a senha logo depois de entrar (ou ao trocar a senha)
  async function prepararCofre(senha) {
    try {
      let l = await linhaConta(true);
      if (!l || !l.sal) {
        const sal = b64e(crypto.getRandomValues(new Uint8Array(16)));
        await SB.inserir("chaves_ia", {user_id: CONTA.uid, sal}, "ignorar");
        l = await linhaConta(true); if (!l) return false;
      }
      await dbPut(cofreItem(), await derivar(senha, l.sal));
      situacaoConta = ""; return true;
    } catch (e) { return false; }
  }
  async function enviarConta(reg, segredo) {
    try {
      const k = await dbGet(cofreItem()); const l = await linhaConta(); if (!k || !l) return false;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv, additionalData: extra()}, k, new TextEncoder().encode(segredo)));
      const dados = {prov: reg.prov, modelo_analise: reg.modelo_analise, modelo_leitura: reg.modelo_leitura, final: reg.final, iv: b64e(iv), cifra: b64e(ct), atualizado_em: new Date().toISOString()};
      await SB.atualizar("chaves_ia", "user_id=eq." + encodeURIComponent(CONTA.uid), dados);
      remota = Object.assign({}, l, dados); return true;
    } catch (e) { return false; }
  }
  async function lerDaConta() {
    const l = await linhaConta(); if (!l || !l.cifra || !PROVS[l.prov]) return null;
    let k = null; try { k = await dbGet(cofreItem()); } catch (e) {}
    if (!k) { situacaoConta = "precisa_senha"; return null; }
    try {
      const pt = await crypto.subtle.decrypt({name: "AES-GCM", iv: b64d(l.iv), additionalData: extra()}, k, b64d(l.cifra));
      const reg = {prov: l.prov, uid: CONTA.uid, modelo_analise: l.modelo_analise, modelo_leitura: l.modelo_leitura, final: l.final, quando: new Date().toISOString()};
      const segredo = new TextDecoder().decode(pt);
      await gravar(reg, segredo); situacaoConta = "";
      return Object.assign({}, reg, {segredo});
    } catch (e) { situacaoConta = "senha_mudou"; return null; }
  }
  async function apagarDaConta() {
    try { await SB.atualizar("chaves_ia", "user_id=eq." + encodeURIComponent(CONTA.uid), {prov: null, modelo_analise: null, modelo_leitura: null, final: null, iv: null, cifra: null}); } catch (e) {}
    if (remota) Object.assign(remota, {prov: null, cifra: null, iv: null});
  }
  async function lerQualquer() { return (await ler()) || (await lerDaConta()); }
  // confere a senha no próprio login do Supabase antes de usá-la para abrir a chave
  async function conferirSenha(senha) {
    let lembrar = true; try { lembrar = localStorage.getItem("lt_lembrar") !== "0"; } catch (e) {}
    await SB.entrar(CONTA.perfil.email, senha, lembrar);
  }

  /* ---------- chamadas ---------- */
  class ErroIA extends Error { constructor(m, codigo) { super(m); this.codigo = codigo; } }
  function erroHttp(status, corpo) {
    const t = String(corpo || "").toLowerCase();
    if (status === 401 || /invalid.*(api|x-api)-?key|api key not valid|api_key_invalid/.test(t)) return new ErroIA("A chave de IA não foi aceita. Confira em Ajustes › Minha IA.", "chave");
    if (/credit balance|billing|insufficient/.test(t)) return new ErroIA("Sua conta da IA está sem créditos. Coloque créditos e tente de novo.", "credito");
    if (status === 429 || /quota|rate limit|resource_exhausted/.test(t)) return new ErroIA("Limite de uso da sua chave atingido. Espere um pouco (ou até amanhã, na chave grátis) e tente de novo.", "limite");
    if (status === 413 || /too large|too long|exceeds|token count/.test(t)) return new ErroIA("Os documentos são grandes demais para uma análise só. Tire alguns e tente de novo.", "grande");
    if (status === 403) return new ErroIA("A chave não tem permissão para este uso.", "permissao");
    if (status === 529 || status === 503 || status === 500) return new ErroIA("A IA está sobrecarregada agora. Tente de novo em alguns minutos.", "fora");
    return new ErroIA("A IA respondeu com erro (" + status + "). Tente de novo.", "outro");
  }
  async function b64(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = "";
    for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode.apply(null, buf.subarray(i, i + 32768));
    return btoa(s);
  }
  async function lerSSE(resp, aoEvento) {
    const rd = resp.body.getReader(); const dec = new TextDecoder(); let buf = "";
    for (;;) {
      const {done, value} = await rd.read(); if (done) break;
      buf += dec.decode(value, {stream: true}).replace(/\r/g, "");
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const bloco = buf.slice(0, i); buf = buf.slice(i + 2);
        const dados = bloco.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("");
        if (dados && dados !== "[DONE]") { try { aoEvento(JSON.parse(dados)); } catch (e) { if (e instanceof ErroIA) throw e; } }
      }
    }
  }
  async function claude(reg, prompt, {imagens = [], nivel, onText, sinal, maxTokens}) {
    const content = [];
    for (const im of imagens) content.push({type: "image", source: {type: "base64", media_type: im.type || "image/jpeg", data: await b64(im)}});
    content.push({type: "text", text: prompt});
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: sinal, credentials: "omit", referrerPolicy: "no-referrer",
      headers: {"content-type": "application/json", "x-api-key": reg.segredo, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true"},
      body: JSON.stringify({model: nivel === "leitura" ? reg.modelo_leitura : reg.modelo_analise, max_tokens: maxTokens || (nivel === "leitura" ? 4000 : 12000), stream: true, messages: [{role: "user", content}]}),
    });
    if (!r.ok) throw erroHttp(r.status, await r.text().catch(() => ""));
    let texto = "", parou = "";
    await lerSSE(r, ev => {
      if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") { texto += ev.delta.text; onText && onText(texto); }
      else if (ev.type === "message_delta" && ev.delta) parou = ev.delta.stop_reason || parou;
      else if (ev.type === "error") throw erroHttp(ev.error && ev.error.type === "overloaded_error" ? 529 : 500, JSON.stringify(ev.error || {}));
    });
    return {text: texto, truncated: parou === "max_tokens"};
  }
  async function gemini(reg, prompt, {imagens = [], nivel, onText, sinal, maxTokens}) {
    const parts = [];
    for (const im of imagens) parts.push({inline_data: {mime_type: im.type || "image/jpeg", data: await b64(im)}});
    parts.push({text: prompt});
    const modelo = nivel === "leitura" ? reg.modelo_leitura : reg.modelo_analise;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:streamGenerateContent?alt=sse`, {
      method: "POST", signal: sinal, credentials: "omit", referrerPolicy: "no-referrer",
      headers: {"content-type": "application/json", "x-goog-api-key": reg.segredo},
      body: JSON.stringify({contents: [{role: "user", parts}], generationConfig: {maxOutputTokens: maxTokens || (nivel === "leitura" ? 8000 : 24000)}}),
    });
    if (!r.ok) throw erroHttp(r.status, await r.text().catch(() => ""));
    let texto = "", parou = "";
    await lerSSE(r, ev => {
      const c = ev.candidates && ev.candidates[0];
      if (ev.error) throw erroHttp(ev.error.code || 500, JSON.stringify(ev.error));
      if (c && c.content && c.content.parts) for (const p of c.content.parts) if (p.text && !p.thought) { texto += p.text; onText && onText(texto); }
      if (c && c.finishReason) parou = c.finishReason;
    });
    if (!texto && parou === "SAFETY") throw new ErroIA("A IA recusou analisar este conjunto de documentos.", "recusa");
    return {text: texto, truncated: parou === "MAX_TOKENS"};
  }

  /* ---------- descobrir os modelos que a chave pode usar ---------- */
  function versao(nome) { const m = String(nome).match(/(\d+(?:[.-]\d+)?)/); return m ? parseFloat(m[1].replace("-", ".")) : 0; }
  async function modelosClaude(segredo) {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=100", {credentials: "omit", referrerPolicy: "no-referrer",
      headers: {"x-api-key": segredo, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true"}});
    if (!r.ok) throw erroHttp(r.status, await r.text().catch(() => ""));
    const ids = ((await r.json()).data || []).map(m => m.id).filter(id => /^claude-/.test(id));
    if (!ids.length) throw new ErroIA("A chave não tem acesso a nenhum modelo Claude.", "permissao");
    const achar = rx => ids.find(id => rx.test(id));
    const analise = achar(/sonnet/) || achar(/opus/) || ids[0];
    return {lista: ids, analise, leitura: achar(/haiku/) || analise};
  }
  async function modelosGemini(segredo) {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {credentials: "omit", referrerPolicy: "no-referrer", headers: {"x-goog-api-key": segredo}});
    if (!r.ok) throw erroHttp(r.status, await r.text().catch(() => ""));
    const ids = ((await r.json()).models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
      .map(m => String(m.name).replace(/^models\//, ""))
      .filter(id => /^gemini-/.test(id) && !/(image|tts|audio|live|embedding|robotics|computer|thinking-exp|aqa)/.test(id));
    if (!ids.length) throw new ErroIA("A chave não tem acesso a modelos Gemini.", "permissao");
    const estavel = id => !/(preview|exp)/.test(id);
    const flash = ids.filter(id => /flash/.test(id) && !/lite/.test(id)).sort((a, b) => (estavel(b) - estavel(a)) || versao(b) - versao(a));
    const analise = (ids.includes("gemini-flash-latest") && "gemini-flash-latest") || flash[0] || ids[0];
    return {lista: ids, analise, leitura: analise};
  }

  /* ---------- tela "Minha IA" ---------- */
  let escolha = "claude", aposSalvar = null, regCache = null;
  async function abrirTela(depois) {
    aposSalvar = depois || null;
    regCache = await lerQualquer(); if (regCache) escolha = regCache.prov;
    await atualizarCofre();
    desenhar(regCache);
    abrir("#folha-ia");
  }
  let temCofre = false;
  const needSenha = () => !temCofre;
  async function atualizarCofre() { try { temCofre = !!(await dbGet(cofreItem())); } catch (e) { temCofre = false; } }
  function desenhar(reg, msg, digitado) {
    const p = PROVS[escolha];
    $("#corpo-ia").innerHTML = `
      <p class="texto-ajuda" style="margin-top:0">Escolha qual IA vai fazer as suas perícias. O custo vai direto para a sua conta nela.</p>
      ${Object.entries(PROVS).map(([k, v]) => `<button class="prov ${k === escolha ? "on" : ""}" data-prov="${k}"><i class="radio" style="margin-top:2px"></i><span><b>${v.nome}</b><span class="selo-p">${v.selo}</span><small>${v.empresa} · ${v.desc}</small></span></button>`).join("")}
      ${!reg && situacaoConta === "precisa_senha" ? `<div class="aviso-caixa neutro"><b>Sua chave de IA está guardada na sua conta.</b> Para liberar neste aparelho, digite a sua senha do LeilãoTrack.</div>
        <label class="campo olho">Sua senha do LeilãoTrack<input id="ia-senha-lib" type="password" autocomplete="current-password" maxlength="72"><button type="button" data-olho aria-label="Mostrar senha"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></label>
        <button class="btn-grande btn-acc" id="ia-liberar" style="margin-bottom:14px">Liberar minha chave</button>
        <p class="texto-ajuda" style="margin-top:0">Ou cole uma chave nova abaixo.</p>` : ""}
      ${!reg && situacaoConta === "senha_mudou" ? `<div class="aviso-caixa ruim">A chave guardada na sua conta foi protegida com uma senha antiga. Cole a chave de novo abaixo.</div>` : ""}
      ${reg && reg.prov === escolha ? `<div class="aviso-caixa ok">Chave salva na sua conta (termina em …${esc(reg.final)}). Modelos: ${esc(reg.modelo_analise)}${reg.modelo_leitura !== reg.modelo_analise ? " e " + esc(reg.modelo_leitura) : ""}.</div>` : ""}
      <label class="campo olho">Sua chave de API ${esc(p.nome)}<input id="ia-chave" type="password" autocomplete="off" spellcheck="false" maxlength="300" placeholder="${escolha === "claude" ? "sk-ant-…" : "AIza…"}"><button type="button" data-olho aria-label="Mostrar chave"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></label>
      ${msg ? `<div class="aviso-caixa ${msg.ok ? "ok" : "ruim"}">${esc(msg.t)}</div>` : ""}
      <button class="btn-grande btn-acc" id="ia-testar">${reg && reg.prov === escolha ? "Trocar chave" : "Testar e salvar"}</button>
      ${needSenha() ? `<label class="campo olho">Sua senha do LeilãoTrack (protege a chave na sua conta)<input id="ia-senha" type="password" autocomplete="current-password" maxlength="72"><button type="button" data-olho aria-label="Mostrar senha"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></label>` : ""}
      <div class="aviso-caixa neutro"><b>Vale em todos os seus aparelhos.</b> A chave fica guardada na sua conta <b>cifrada com a sua senha do LeilãoTrack</b>: nem o banco nem o administrador do grupo conseguem ler. Ela vai direto para a ${esc(p.empresa)}. Em outro aparelho, é só entrar com a sua senha.</div>
      ${escolha === "claude" ? `<div class="aviso-caixa neutro">A assinatura do Claude (Pro ou Max) <b>não</b> é chave de API. A chave se cria no console da Anthropic e usa créditos pagos à parte.</div>` : ""}
      <p class="texto-ajuda"><b>Como criar a chave:</b> ${escolha === "claude"
        ? "entre em console.anthropic.com, faça login, vá em Billing e coloque créditos (US$ 5 já dá para várias perícias). Depois, em API Keys, toque em Create Key, dê um nome e copie a chave que começa com sk-ant-."
        : "entre em aistudio.google.com com sua conta Google, toque em Get API key › Create API key e copie a chave que começa com AIza. Não precisa cartão para o plano gratuito."}</p>
      <a class="btn-sec vidro" style="display:grid;place-items:center;text-decoration:none;color:var(--tx)" href="${p.link}" target="_blank" rel="noopener noreferrer">Abrir a página de chaves da ${esc(p.empresa)} ›</a>
      ${reg ? `<button class="btn-sec vidro" id="ia-apagar" style="color:var(--hot)">Apagar a minha chave (de todos os aparelhos)</button>` : ""}`;
    if (digitado) $("#ia-chave").value = digitado;
  }
  document.addEventListener("click", async e => {
    if (!e.target.closest("#corpo-ia")) return;
    const pb = e.target.closest("[data-prov]");
    if (pb) { escolha = pb.dataset.prov; desenhar(regCache); return; }
    if (e.target.closest("#ia-apagar")) {
      if (!confirm("Apagar a sua chave de IA da sua conta e de todos os aparelhos?")) return;
      await apagarDaConta(); memoria = null; try { await dbDel(chaveItem()); } catch (er) {}
      regCache = null; situacaoConta = ""; toast("Chave apagada"); desenhar(null); return;
    }
    if (e.target.closest("#ia-liberar")) {
      const senha = $("#ia-senha-lib").value; const bt = $("#ia-liberar"); if (!senha) return;
      bt.disabled = true; bt.textContent = "Liberando…";
      try {
        await conferirSenha(senha);
        await prepararCofre(senha); await atualizarCofre();
        regCache = await lerDaConta();
        if (regCache) { escolha = regCache.prov; desenhar(regCache, {ok: true, t: "Chave liberada neste aparelho."}); if (aposSalvar) { const f = aposSalvar; aposSalvar = null; setTimeout(() => { fechar(); f(); }, 900); } }
        else desenhar(null, {ok: false, t: situacaoConta === "senha_mudou" ? "A chave guardada foi protegida com uma senha antiga. Cole a chave de novo." : "Não consegui liberar a chave."});
      } catch (er) { desenhar(null, {ok: false, t: /invalid/i.test(er.message) ? "Senha incorreta." : "Não consegui conferir a senha agora."}); }
      return;
    }
    if (e.target.closest("#ia-testar")) {
      const bt = $("#ia-testar"); const segredo = $("#ia-chave").value.replace(/\s+/g, "");
      if (!segredo) { desenhar(regCache, {ok: false, t: "Cole a sua chave no campo acima e toque em Testar e salvar."}); return; }
      if (!PROVS[escolha].prefixo.test(segredo)) { desenhar(regCache, {ok: false, t: "Essa chave tem caracteres que não são esperados. Copie de novo, só a chave, sem texto em volta."}, segredo); return; }
      const senha = $("#ia-senha") ? $("#ia-senha").value : "";
      if (needSenha() && !senha) { desenhar(regCache, {ok: false, t: "Digite a sua senha do LeilãoTrack: ela protege a chave na sua conta."}, segredo); return; }
      bt.disabled = true; bt.textContent = "Testando a chave…";
      try {
        if (needSenha()) {
          try { await conferirSenha(senha); } catch (er) { desenhar(regCache, {ok: false, t: /invalid/i.test(er.message) ? "Senha do LeilãoTrack incorreta." : "Não consegui conferir a senha agora."}, segredo); return; }
          await prepararCofre(senha); await atualizarCofre();
        }
        const m = escolha === "claude" ? await modelosClaude(segredo) : await modelosGemini(segredo);
        const reg = {prov: escolha, uid: CONTA.uid, modelo_analise: m.analise, modelo_leitura: m.leitura, final: segredo.slice(-4), quando: new Date().toISOString()};
        await gravar(reg, segredo);
        const naConta = await enviarConta(reg, segredo);
        regCache = await ler(); situacaoConta = "";
        desenhar(regCache, {ok: true, t: naConta ? "Chave funcionando e guardada na sua conta, protegida com a sua senha. Já vale nos seus outros aparelhos." : "Chave funcionando neste aparelho. Não consegui guardar na conta agora; tente salvar de novo mais tarde."});
        if (aposSalvar) { const f = aposSalvar; aposSalvar = null; setTimeout(() => { fechar(); f(); }, 900); }
      } catch (er) { desenhar(regCache, {ok: false, t: er.message || "Não consegui testar a chave agora."}, segredo); }
    }
  });

  return {
    PROVS, ErroIA, prepararCofre,
    apagarTudo: apagarLocal,
    async aposTrocarSenha(senhaNova) { // recifra a cópia da conta com a senha nova
      const reg = await lerQualquer();
      await prepararCofre(senhaNova);
      if (reg && reg.segredo) await enviarConta(reg, reg.segredo);
    },
    async pronta() { return !!(await lerQualquer()); },
    async info() { const r = await lerQualquer(); return r ? {prov: r.prov, nome: PROVS[r.prov].nome, final: r.final} : null; },
    abrirTela,
    async texto(prompt, opts = {}) {
      const reg = await lerQualquer(); if (!reg) throw new ErroIA(situacaoConta === "precisa_senha" ? "Libere sua chave de IA neste aparelho em Minha IA." : "Conecte sua IA para fazer a perícia.", "sem_chave");
      // limite de espera: sem nenhuma resposta da IA nesse tempo, desiste (em vez de ficar parado para sempre)
      const ctl = new AbortController(); let porTempo = false;
      const ext = opts.sinal;
      if (ext) { if (ext.aborted) ctl.abort(); else ext.addEventListener("abort", () => ctl.abort(), {once: true}); }
      const prazo = ms => { clearTimeout(t); t = setTimeout(() => { porTempo = true; ctl.abort(); }, ms); };
      let t = null; prazo(opts.nivel === "leitura" ? 150000 : 240000);
      const o = Object.assign({}, opts, {sinal: ctl.signal, onText: txt => { prazo(120000); if (opts.onText) opts.onText(txt); }});
      try { return await (reg.prov === "claude" ? claude(reg, prompt, o) : gemini(reg, prompt, o)); }
      catch (e) {
        if (porTempo) throw new ErroIA("A IA demorou demais para responder. Tente de novo; se continuar, envie menos páginas ou use o Claude.", "tempo");
        throw e;
      } finally { clearTimeout(t); }
    },
    async json(prompt, opts = {}) {
      const {text} = await this.texto(prompt + "\n\nResponda somente com o JSON, sem texto antes ou depois.", Object.assign({nivel: "leitura", maxTokens: 2000}, opts));
      const m = text.match(/\{[\s\S]*\}/); if (!m) throw new ErroIA("A IA não devolveu os números.", "formato");
      return JSON.parse(m[0]);
    },
    maxImagens: () => 8,
  };
})();
