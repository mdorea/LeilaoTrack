const L = require("/tmp/l.json");
const sem = s => String(s||"").normalize("NFKD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();
const out = [];
const q = (a,p) => a[Math.floor((a.length-1)*p)];
function teste(nome, ok, chave, minN) {
  const base = L.filter(l => ["Casa","Apartamento"].includes(l.tipo) && l.area>=25 && l.area<=2000 && l.referencia>0 && !/terreno de|parte ideal|fra[cç]|%/i.test(l.titulo||"") && ok(l));
  base.forEach(l => l.m = l.referencia/l.area);
  const g = new Map(); base.forEach(l => { const k = chave(l); (g.get(k)||g.set(k,[]).get(k)).push(l); });
  let r = [], dentro=0;
  for (const l of base) {
    const v = g.get(chave(l)).filter(x=>x!==l).map(x=>x.m).sort((a,b)=>a-b);
    if (v.length < minN) continue;
    const med = q(v,.5), lo=q(v,.25), hi=q(v,.75);
    r.push(l.m/med); if (l.m>=lo && l.m<=hi) dentro++;
  }
  r.sort((a,b)=>a-b);
  const w = r.filter(x => x>=0.8 && x<=1.25).length;
  out.push(`${nome}: n=${r.length} erro p25=${q(r,.25)?.toFixed(2)} p75=${q(r,.75)?.toFixed(2)} dentro_iqr=${dentro} dentro_±20%=${w} (${Math.round(100*w/(r.length||1))}%)`);
}
const C = l => sem(l.cidade)+"|"+l.uf+"|"+l.tipo, B = l => C(l)+"|"+sem(l.bairro);
teste("apto cidade≥5", l=>l.tipo==="Apartamento", C, 5);
teste("casa cidade≥5", l=>l.tipo==="Casa", C, 5);
teste("apto bairro≥3", l=>l.tipo==="Apartamento", B, 3);
teste("casa bairro≥3", l=>l.tipo==="Casa", B, 3);
teste("2+ praças cidade≥5", l=>(l.pracas||[]).length>=2, C, 5);
teste("praça única cidade≥5", l=>(l.pracas||[]).length<2, C, 5);
for (const s of ["Mega","Frazão","Zuk","Biasi"]) teste(`só ${s} cidade≥5`, l=>l.site===s, l=>s+C(l), 5);
teste("apto cidade+faixa de área≥5", l=>l.tipo==="Apartamento", l=>C(l)+"|"+(l.area<60?0:l.area<100?1:2), 5);
const ar = L.filter(l=>l.tipo==="Casa"&&l.area).map(l=>l.area).sort((a,b)=>a-b);
out.push(`casa area p10=${q(ar,.1)} p50=${q(ar,.5)} p90=${q(ar,.9)}`);
const at = L.filter(l=>l.tipo==="Casa"&&l.area_txt).slice(0,8).map(l=>l.site+":"+String(l.area_txt).slice(0,40));
out.push("area_txt casas: "+at.join(" | "));
console.log(out.join("\n")); out.forEach(x=>console.log("::notice title=est::"+x));
