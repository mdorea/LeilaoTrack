const L = require("/tmp/l.json");
const out = [];
const keys = {}; L.forEach(l => Object.keys(l).forEach(k => keys[k] = (keys[k]||0)+1)); out.push("chaves="+JSON.stringify(keys));
for (const s of ["Mega","Frazão","Zuk","Biasi"]) {
  const ls = L.filter(l => l.site===s && ["Casa","Apartamento"].includes(l.tipo));
  const kw = re => ls.filter(l => re.test((l.titulo||"")+" "+(l.area_txt||"")+" "+(l.descricao||""))).length;
  out.push(`${s} n=${ls.length} construida=${kw(/constru/i)} privativa=${kw(/privativ/i)} util=${kw(/[úu]til/i)} terreno=${kw(/terreno/i)} total=${kw(/total/i)}`);
  ls.filter(l=>l.tipo==="Casa").slice(0,5).forEach(l => out.push(`  ${s} CASA tit="${String(l.titulo).slice(0,90)}" area=${l.area} txt="${String(l.area_txt).slice(0,60)}"`));
  ls.filter(l=>l.tipo==="Apartamento").slice(0,2).forEach(l => out.push(`  ${s} APTO tit="${String(l.titulo).slice(0,90)}" area=${l.area} txt="${String(l.area_txt).slice(0,60)}"`));
}
const encerr = L.filter(l=>l.encerrado||l.ativo===false).length; out.push(`total=${L.length} encerrados/inativos=${encerr}`);
console.log(out.join("\n")); out.forEach(x=>console.log("::notice title=est::"+x.replace(/\n/g," ")));
