/* LeilãoTrack · dados da conta: perfil, preferências, favoritos e cálculos (cada pessoa só vê os seus) */
"use strict";
const CONTA = {
  perfil: null,
  prefs: {ufs: [], tipos: [], configurado: false, alertas_visto: null},
  favs: new Set(),
  calculos: new Map(),
  get uid() { return SB.usuario && SB.usuario.id; },
  get admin() { return !!(this.perfil && this.perfil.papel === "admin"); },

  async carregar() {
    const p = await SB.rpc("meu_perfil");
    this.perfil = Array.isArray(p) ? p[0] : null;
    if (!this.perfil) return false;
    const [prefs, favs, calcs] = await Promise.all([
      SB.ler("preferencias", "select=ufs,tipos,configurado,alertas_visto&limit=1"),
      SB.ler("favoritos", "select=lote_id&limit=1000"),
      SB.ler("calculos", "select=lote_id,valores&limit=1000"),
    ]);
    const pr = prefs && prefs[0];
    if (pr) {
      this.prefs = {
        ufs: (pr.ufs || []).filter(u => UFS.includes(u)),
        tipos: (pr.tipos || []).filter(t => TIPOS_PREF.includes(t)),
        configurado: !!pr.configurado, alertas_visto: typeof pr.alertas_visto === "string" ? pr.alertas_visto : null,
      };
    } else {
      await SB.inserir("preferencias", {user_id: this.uid}, "ignorar").catch(() => {});
    }
    this.favs = new Set((favs || []).map(f => f.lote_id));
    this.calculos = new Map((calcs || []).filter(c => c.valores && typeof c.valores === "object").map(c => [c.lote_id, c.valores]));
    return true;
  },
  limpar() {
    this.perfil = null; this.prefs = {ufs: [], tipos: [], configurado: false, alertas_visto: null};
    this.favs = new Set(); this.calculos = new Map();
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
  async mudarNome(nome) {
    await SB.rpc("mudar_meu_nome", {p_nome: nome});
    this.perfil.nome = nome.trim();
  },
};
