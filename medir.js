const E = require("./site/novo/js/estimativa.js");
const L = require("/tmp/l.json");
const A = L.filter(l => !l.encerrado);
const n = E.calcular(L);
const out = [];
const alvo = A.filter(l => ["Casa","Apartamento"].includes(l.tipo));
const com = A.filter(l => l._est);
out.push(`ativos=${A.length} casa+apto=${alvo.length} com_estimativa=${com.length}`);
const cnt = k => { const m = {}; com.forEach(l => { m[l._est[k]] = (m[l._est[k]]||0)+1; }); return JSON.stringify(m); };
out.push("conf=" + cnt("conf") + " nivel=" + cnt("nivel"));
const bySite = {}; alvo.forEach(l => { const s = bySite[l.site] ||= [0,0]; s[0]++; if (l._est) s[1]++; }); out.push("por_site(alvo,com)=" + JSON.stringify(bySite));
const ds = com.map(l => l._est.desc).filter(x => x != null).sort((a,b)=>a-b);
const q = p => ds[Math.floor((ds.length-1)*p)];
out.push(`desc_vs_meio p10=${q(.1)} p25=${q(.25)} p50=${q(.5)} p75=${q(.75)} p90=${q(.9)}`);
const larg = com.map(l => (l._est.max-l._est.min)/l._est.meio).sort((a,b)=>a-b);
out.push(`largura_rel p50=${larg[Math.floor(larg.length/2)].toFixed(2)} p90=${larg[Math.floor(larg.length*.9)].toFixed(2)}`);
// referencia propria vs meio estimado (validacao: quanto a estimativa erra a avaliacao do proprio lote)
const err = com.filter(l => l.referencia).map(l => l.referencia / l._est.meio).sort((a,b)=>a-b);
const qe = p => err[Math.floor((err.length-1)*p)].toFixed(2);
out.push(`ref_propria/meio p10=${qe(.1)} p25=${qe(.25)} p50=${qe(.5)} p75=${qe(.75)} p90=${qe(.9)}`);
const dentro = com.filter(l => l.referencia >= l._est.min && l.referencia <= l._est.max).length;
out.push(`ref_propria_dentro_da_faixa=${dentro}/${com.length}`);
for (const c of ["alta","média","baixa"]) { const s = com.filter(l => l._est.conf === c); const d2 = s.filter(l => l.referencia >= l._est.min && l.referencia <= l._est.max).length; out.push(`dentro_${c}=${d2}/${s.length}`); }
const m2 = {}; com.forEach(l => { const k = l.tipo; (m2[k] ||= []).push(l._est.m2); });
for (const k in m2) { const a = m2[k].sort((x,y)=>x-y); out.push(`m2_${k} p10=${a[Math.floor(a.length*.1)]} p50=${a[Math.floor(a.length/2)]} p90=${a[Math.floor(a.length*.9)]}`); }
com.sort((a,b)=>b._est.n-a._est.n).slice(0,6).forEach(l => out.push(`ex ${l.tipo} ${l.cidade}/${l.uf} ${l.bairro||""} area=${l.area} lance=${l.valor} ref=${l.referencia} est=${l._est.min}-${l._est.max} ${l._est.conf}/${l._est.nivel} n=${l._est.n}`));
console.log(out.join("\n"));
out.forEach(x => console.log("::notice title=est::" + x));
