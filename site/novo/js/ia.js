/* LeilãoTrack · "Minha IA": cada pessoa usa a própria chave (Claude ou Gemini).
   A chave fica só neste aparelho, cifrada com uma chave que o navegador não deixa exportar,
   e vai direto do navegador para a Anthropic ou o Google. Nunca passa pelo banco do LeilãoTrack. */
"use strict";
const IA = (() => {
  const PROVS = {
    claude: {nome: "Claude", empresa: "Anthropic", selo: "melhor qualidade",
      desc: "Cerca de R$ 1 a 2 por perícia, cobrado na sua conta da Anthropic.",
      link: "https://console.anthropic.com/settings/keys", prefixo: /^sk-ant-[A-Za-z0-9_-]{20,}$/},
    gemini: {nome: "Gemini", empresa: "Google", selo: "tem chave grátis",
      desc: "A chave gratuita tem limite diário de uso; bom para começar.",
      link: "https://aistudio.google.com/apikey", prefixo: /^AIza[0-9A-Za-z_-]{30,}$/},
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
  async function apagarTudo() { memoria = null; try { await dbDel(chaveItem()); } catch (e) {} }

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
    regCache = await ler(); if (regCache) escolha = regCache.prov;
    desenhar(regCache);
    abrir("#folha-ia");
  }
  function desenhar(reg, msg) {
    const p = PROVS[escolha];
    $("#corpo-ia").innerHTML = `
      <p class="texto-ajuda" style="margin-top:0">Escolha qual IA vai fazer as suas perícias. O custo vai direto para a sua conta nela.</p>
      ${Object.entries(PROVS).map(([k, v]) => `<button class="prov ${k === escolha ? "on" : ""}" data-prov="${k}"><i class="radio" style="margin-top:2px"></i><span><b>${v.nome}</b><span class="selo-p">${v.selo}</span><small>${v.empresa} · ${v.desc}</small></span></button>`).join("")}
      ${reg && reg.prov === escolha ? `<div class="aviso-caixa ok">Chave salva neste aparelho (termina em …${esc(reg.final)}). Modelos: ${esc(reg.modelo_analise)}${reg.modelo_leitura !== reg.modelo_analise ? " e " + esc(reg.modelo_leitura) : ""}.</div>` : ""}
      <label class="campo olho">Sua chave de API ${esc(p.nome)}<input id="ia-chave" type="password" autocomplete="off" spellcheck="false" maxlength="300" placeholder="${escolha === "claude" ? "sk-ant-…" : "AIza…"}"><button type="button" data-olho aria-label="Mostrar chave"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></label>
      ${msg ? `<div class="aviso-caixa ${msg.ok ? "ok" : "ruim"}">${esc(msg.t)}</div>` : ""}
      <button class="btn-grande btn-acc" id="ia-testar">${reg && reg.prov === escolha ? "Trocar chave" : "Testar e salvar"}</button>
      <div class="aviso-caixa neutro"><b>Fica só neste aparelho.</b> A chave é guardada cifrada aqui e vai direto para a ${esc(p.empresa)}. Ela não vai para o LeilãoTrack nem para o administrador do grupo. Em outro aparelho, é preciso colar de novo.</div>
      ${escolha === "claude" ? `<div class="aviso-caixa neutro">A assinatura do Claude (Pro ou Max) <b>não</b> é chave de API. A chave se cria no console da Anthropic e usa créditos pagos à parte.</div>` : ""}
      <p class="texto-ajuda"><b>Como criar a chave:</b> ${escolha === "claude"
        ? "entre em console.anthropic.com, faça login, vá em Billing e coloque créditos (US$ 5 já dá para várias perícias). Depois, em API Keys, toque em Create Key, dê um nome e copie a chave que começa com sk-ant-."
        : "entre em aistudio.google.com com sua conta Google, toque em Get API key › Create API key e copie a chave que começa com AIza. Não precisa cartão para o plano gratuito."}</p>
      <a class="btn-sec vidro" style="display:grid;place-items:center;text-decoration:none;color:var(--tx)" href="${p.link}" target="_blank" rel="noopener noreferrer">Abrir a página de chaves da ${esc(p.empresa)} ›</a>
      ${reg ? `<button class="btn-sec vidro" id="ia-apagar" style="color:var(--hot)">Apagar a chave deste aparelho</button>` : ""}`;
  }
  document.addEventListener("click", async e => {
    if (!e.target.closest("#corpo-ia")) return;
    const pb = e.target.closest("[data-prov]");
    if (pb) { escolha = pb.dataset.prov; desenhar(regCache); return; }
    if (e.target.closest("#ia-apagar")) { await apagarTudo(); regCache = null; toast("Chave apagada deste aparelho"); desenhar(null); return; }
    if (e.target.closest("#ia-testar")) {
      const bt = $("#ia-testar"); const segredo = $("#ia-chave").value.trim();
      if (!PROVS[escolha].prefixo.test(segredo)) { desenhar(regCache, {ok: false, t: escolha === "claude" ? "Essa não parece uma chave da Anthropic. Ela começa com sk-ant-." : "Essa não parece uma chave do Google AI Studio. Ela começa com AIza."}); return; }
      bt.disabled = true; bt.textContent = "Testando a chave…";
      try {
        const m = escolha === "claude" ? await modelosClaude(segredo) : await modelosGemini(segredo);
        const reg = {prov: escolha, uid: CONTA.uid, modelo_analise: m.analise, modelo_leitura: m.leitura, final: segredo.slice(-4), quando: new Date().toISOString()};
        const gravou = await gravar(reg, segredo);
        regCache = await ler();
        desenhar(regCache, {ok: true, t: gravou ? "Chave funcionando e salva neste aparelho." : "Chave funcionando. Este navegador não deixa guardar: ela vale só até fechar a página."});
        if (aposSalvar) { const f = aposSalvar; aposSalvar = null; setTimeout(() => { fechar(); f(); }, 900); }
      } catch (er) { desenhar(regCache, {ok: false, t: er.message || "Não consegui testar a chave agora."}); }
    }
  });

  return {
    PROVS, ErroIA, apagarTudo,
    async pronta() { return !!(await ler()); },
    async info() { const r = await ler(); return r ? {prov: r.prov, nome: PROVS[r.prov].nome, final: r.final} : null; },
    abrirTela,
    async texto(prompt, opts = {}) {
      const reg = await ler(); if (!reg) throw new ErroIA("Conecte sua IA para fazer a perícia.", "sem_chave");
      return reg.prov === "claude" ? claude(reg, prompt, opts) : gemini(reg, prompt, opts);
    },
    async json(prompt, opts = {}) {
      const {text} = await this.texto(prompt + "\n\nResponda somente com o JSON, sem texto antes ou depois.", Object.assign({nivel: "leitura", maxTokens: 2000}, opts));
      const m = text.match(/\{[\s\S]*\}/); if (!m) throw new ErroIA("A IA não devolveu os números.", "formato");
      return JSON.parse(m[0]);
    },
    maxImagens: () => 8,
  };
})();
