/* LeilãoTrack · página de apresentação: quem já está logado neste aparelho vai direto para o app.
   Para ver a apresentação mesmo logado, abra inicio.html?ficar */
"use strict";
(() => {
  try {
    if (/[?&]ficar\b/.test(location.search)) return;
    const t = localStorage.getItem("lt_sessao") || sessionStorage.getItem("lt_sessao");
    const s = t ? JSON.parse(t) : null;
    if (s && s.refresh_token) location.replace("./" + location.hash);
  } catch (e) { /* sem acesso ao armazenamento: fica na apresentação */ }
})();
