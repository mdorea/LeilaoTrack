/* LeilãoTrack · dados da conta: perfil, preferências, favoritos e cálculos (cada pessoa só vê os seus) */
"use strict";
const CONTA = {
  perfil: null,
  prefs: {ufs: [], tipos: [], configurado: false, alertas_visto: null, ordem_favs: []},
  ajustes: {},
  favs: new Set(),
  ocultos: [],   // ids que a pessoa não quer ver (guardado em ajustes.ocultos; limite do banco: ~100)
  calculos: new Map(),
  notas: new Map(),    // lote_id -> texto da anotação (só da própria pessoa)
  anexos: new Map(),   // lote_id -> [{id, nome, tamanho, caminho}]
  anotOk: false,       // false = tabelas de anotações ainda não criadas no banco
  get uid() { return SB.usuario && SB.usuario.id; },
  get admin() { return !!(this.perfil && this.perfil.papel === "admin"); },

  async carregar() {
    const p = await SB.rpc("meu_perfil");
    this.perfil = Array.isArray(p) ? p[0] : null;
    if (!this.perfil) return false;
    const [prefs, favs, calcs, nots, anxs] = await Promise.all([
      SB.ler("preferencias", "select=ufs,tipos,configurado,alertas_visto,ajustes&limit=1"),
      SB.ler("favoritos", "select=lote_id&limit=1000"),
      SB.ler("calculos", "select=lote_id,valores&limit=1000"),
      SB.ler("anotacoes", "select=lote_id,texto&limit=1000").catch(() => null),
      SB.ler("anexos", "select=id,lote_id,nome,tamanho,caminho&order=criado_em.asc&limit=1000").catch(() => null),
    ]);
    const pr = prefs && prefs[0];
    if (pr) {
      this.prefs = {
        ufs: (pr.ufs || []).filter(u => UFS.includes(u)),
        tipos: (pr.tipos || []).filter(t => TIPOS_PREF.includes(t)),
        configurado: !!pr.configurado, alertas_visto: typeof pr.alertas_visto === "string" ? pr.alertas_visto : null,
        ordem_favs: [],
      };
      this.ajustes = pr.ajustes && typeof pr.ajustes === "object" && !Array.isArray(pr.ajustes) ? pr.ajustes : {};
      const of = this.ajustes.ordem_favs;
      this.prefs.ordem_favs = Array.isArray(of) ? of.filter(x => typeof x === "string" && /^[a-z]{2,10}:[A-Za-z0-9_.-]{1,60}$/.test(x)).slice(0, 150) : [];
      const oc = this.ajustes.ocultos;
      this.ocultos = Array.isArray(oc) ? oc.filter(x => typeof x === "string" && /^[a-z]{2,10}:[A-Za-z0-9_.-]{1,60}$/.test(x)).slice(0, 100) : [];
    } else {
      await SB.inserir("preferencias", {user_id: this.uid}, "ignorar").catch(() => {});
    }
    this.favs = new Set((favs || []).map(f => f.lote_id));
    this.calculos = new Map((calcs || []).filter(c => c.valores && typeof c.valores === "object").map(c => [c.lote_id, c.valores]));
    this.anotOk = Array.isArray(nots) && Array.isArray(anxs);
    this.notas = new Map((nots || []).filter(n => n && typeof n.texto === "string").map(n => [n.lote_id, n.texto]));
    this.anexos = new Map();
    for (const a of (anxs || [])) { if (!a || typeof a.caminho !== "string") continue; if (!this.anexos.has(a.lote_id)) this.anexos.set(a.lote_id, []); this.anexos.get(a.lote_id).push(a); }
    return true;
  },
  limpar() {
    this.perfil = null; this.prefs = {ufs: [], tipos: [], configurado: false, alertas_visto: null, ordem_favs: []}; this.ajustes = {};
    this.favs = new Set(); this.calculos = new Map(); this.ocultos = [];
    this.notas = new Map(); this.anexos = new Map(); this.anotOk = false;
  },

  async favoritar(id, on) {
    try {
      if (on) await SB.inserir("favoritos", {user_id: this.uid, lote_id: id}, "ignorar");
      else await SB.apagar("favoritos", "lote_id=eq." + encodeURIComponent(id));
      on ? this.favs.add(id) : this.favs.delete(id);
      return true;
    } catch (e) { return false; }
  },
  async salvarPrefs(ufs, tipos) {
    ufs = ufs.filter(u => UFS.includes(u)); tipos = tipos.filter(t => TIPOS_PREF.includes(t));
    await SB.atualizar("preferencias", "user_id=eq." + encodeURIComponent(this.uid),
      {ufs, tipos, configurado: true, atualizado_em: new Date().toISOString()});
    this.prefs.ufs = ufs; this.prefs.tipos = tipos; this.prefs.configurado = true;
  },
  // ordem dos favoritos escolhida pela pessoa (guardada na conta, vale em todos os aparelhos)
  _tOrdem: null,
  salvarOrdemFavs(ids) {
    this.prefs.ordem_favs = ids.filter(id => this.favs.has(id)).slice(0, 150);
    clearTimeout(this._tOrdem);
    this._tOrdem = setTimeout(() => {
      this.ajustes = Object.assign({}, this.ajustes, {ordem_favs: this.prefs.ordem_favs});
      SB.atualizar("preferencias", "user_id=eq." + encodeURIComponent(this.uid), {ajustes: this.ajustes})
        .catch(() => toast("Não consegui salvar a ordem agora. Confira a conexão."));
    }, 800);
  },
  _tOcultos: null,
  // "ocultar" um imóvel: some da lista dessa pessoa em todos os aparelhos
  async ocultar(id, on) {
    const lista = this.ocultos.filter(x => x !== id);
    this.ocultos = (on ? [id, ...lista] : lista).slice(0, 100);
    clearTimeout(this._tOcultos);
    this._tOcultos = setTimeout(() => {
      this.ajustes = Object.assign({}, this.ajustes, {ocultos: this.ocultos});
      SB.atualizar("preferencias", "user_id=eq." + encodeURIComponent(this.uid), {ajustes: this.ajustes})
        .catch(() => toast("Não consegui salvar o que você ocultou. Confira a conexão."));
    }, 600);
  },
  _tVisto: null,
  salvarVisto(ate) {
    if (!ate || ate <= (this.prefs.alertas_visto || "")) return;
    this.prefs.alertas_visto = String(ate).slice(0, 30);
    clearTimeout(this._tVisto);
    this._tVisto = setTimeout(() => {
      SB.atualizar("preferencias", "user_id=eq." + encodeURIComponent(this.uid), {alertas_visto: this.prefs.alertas_visto}).catch(() => {});
    }, 1500);
  },
  async salvarCalculo(id, valores) {
    try {
      await SB.inserir("calculos", {user_id: this.uid, lote_id: id, valores, atualizado_em: new Date().toISOString()}, "mesclar");
      this.calculos.set(id, valores); return true;
    } catch (e) { return false; }
  },
  temNotas(id) { return !!(this.notas.get(id) || (this.anexos.get(id) || []).length); },
  async salvarNota(id, texto) {
    texto = String(texto || "").slice(0, 5000);
    if (!texto.trim()) {
      await SB.apagar("anotacoes", "lote_id=eq." + encodeURIComponent(id));
      this.notas.delete(id);
    } else {
      await SB.inserir("anotacoes", {user_id: this.uid, lote_id: id, texto, atualizado_em: new Date().toISOString()}, "mesclar");
      this.notas.set(id, texto);
    }
  },
  async anexarPdf(id, arquivo) {
    const caminho = `${this.uid}/${crypto.randomUUID()}.pdf`;
    const nome = String(arquivo.name || "documento.pdf").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 120) || "documento.pdf";
    await SB.enviarPdf(caminho, arquivo);
    try {
      const novo = {id: crypto.randomUUID(), lote_id: id, nome, tamanho: arquivo.size, caminho};
      await SB.inserir("anexos", {user_id: this.uid, lote_id: id, nome, tamanho: arquivo.size, caminho, id: novo.id});
      if (!this.anexos.has(id)) this.anexos.set(id, []);
      this.anexos.get(id).push(novo);
      return novo;
    } catch (e) { SB.apagarPdf(caminho).catch(() => {}); throw e; }
  },
  async removerPdf(id, anexo) {
    await SB.apagarPdf(anexo.caminho).catch(e => { if (e.status !== 404 && e.status !== 400) throw e; });
    await SB.apagar("anexos", "id=eq." + encodeURIComponent(anexo.id));
    this.anexos.set(id, (this.anexos.get(id) || []).filter(a => a.id !== anexo.id));
  },
  async mudarNome(nome) {
    await SB.rpc("mudar_meu_nome", {p_nome: nome});
    this.perfil.nome = nome.trim();
  },
};
