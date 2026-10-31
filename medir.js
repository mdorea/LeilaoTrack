const E = require("./site/novo/js/estimativa.js");
const P = require("/tmp/l.json"), L = P.lotes, H = P.historico;
const out = [];
const A = L.filter(l => !l.encerrado && l.ativo !== false);
const alvo = A.filter(l => ["Casa","Apartamento"].includes(l.tipo));
const comA = s => alvo.filter(l => l.site===s && l.area_constr).length + "/" + alvo.filter(l=>l.site===s).length;
out.push(`historico=${H.length} casa+apto ativos=${alvo.length} com area_constr: Mega ${comA("Mega")} Frazão ${comA("Frazão")} Zuk ${comA("Zuk")} Biasi ${comA("Biasi")}`);
E.calcular(L, H);
const ok = A.filter(l => l._est && !l._est.fora), fora = A.filter(l => l._est && l._est.fora);
const c = {}; ok.forEach(l => c[l._est.conf]=(c[l._est.conf]||0)+1);
out.push(`com_estimativa=${ok.length} fora=${fora.length} conf=${JSON.stringify(c)}`);
// validação sem o filtro de "fora": quanto a mediana dos parecidos erra a avaliação do próprio lote
const sem = s => String(s||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
const base = L.filter(l => E._serve(l) && l.referencia > 0).map(l => ({l, m: l.referencia / l.area_constr}));
const q = (a,p) => a[Math.floor((a.length-1)*p)];
function val(nome, chave, minN) {
  const g = new Map(); base.forEach(x => { const k = chave(x.l); (g.get(k)||g.set(k,[]).get(k)).push(x); });
  const r = [];
  for (const x of base) { const v = g.get(chave(x.l)).filter(y=>y!==x).map(y=>y.m).sort((a,b)=>a-b); if (v.length < minN) continue; r.push(x.m / q(v,.5)); }
  r.sort((a,b)=>a-b); const w = r.filter(v=>v>=.8&&v<=1.25).length;
  out.push(`${nome}: n=${r.length} erro p25=${q(r,.25)?.toFixed(2)} p75=${q(r,.75)?.toFixed(2)} dentro±20%=${Math.round(100*w/(r.length||1))}%`);
}
const C = l => sem(l.cidade)+"|"+l.uf+"|"+l.tipo;
val("bairro≥3", l => C(l)+"|"+sem(l.bairro), 3);
val("bairro≥5", l => C(l)+"|"+sem(l.bairro), 5);
val("cidade≥5", C, 5);
val("cidade≥15", C, 15);
for (const t of ["Casa","Apartamento"]) val(`${t} cidade≥5`, l => l.tipo===t ? C(l) : "x"+l.id, 5);
console.log(out.join("\n")); const T=out.join(" ¦ "); for(let i=0;i<T.length;i+=3500) console.log("::notice title=est::"+T.slice(i,i+3500));
