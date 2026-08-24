"use strict";
/* ================= الحالة ================= */
let KEY=null;
let S=null;
function load(){
  try{
    const raw=localStorage.getItem(KEY); if(raw) return JSON.parse(raw);
  }catch(e){}
  return { days:{} };
}
function save(){
  const d=S.days[cur]; if(d) d._ts=Date.now();
  try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){ alert("مش قادر أحفظ — اعمل Export"); }
  schedulePush();
}
function today(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
let cur = today();
function day(){ if(!S.days[cur]) S.days[cur]={}; return S.days[cur]; }

function esc(s){ return String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
function getOpt(key,sel){
  if(typeof sel==="string"&&sel[0]==="c"){ const a=(S.foods&&S.foods[key])||[]; return a[+sel.slice(1)]||null; }
  return MEALS[key].opts[sel];
}

/* ================= صفحة التقدم ================= */
function weightSeries(){
  return Object.keys(S.days)
    .filter(k=>S.days[k].weight && !isNaN(parseFloat(S.days[k].weight)))
    .sort()
    .map(k=>({date:k, w:parseFloat(S.days[k].weight)}));
}

/* ================= Export / Import ================= */
function exportData(){
  const blob=new Blob([JSON.stringify(S,null,1)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="diet-tracker-backup-"+today()+".json";
  a.click();
}
function importData(inp){
  const f=inp.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{ try{ S=JSON.parse(r.result); save(); renderDay(); alert("تم الاسترجاع ✅"); }catch(e){ alert("الملف مش صالح"); } };
  r.readAsText(f);
}

/* ================= قراءات اعتمادها على الحالة ================= */
function T(){ return Object.assign({},DEF,S.settings||{}); }
function getExtra(i){ return (typeof i==="string"&&i[0]==="c") ? ((S.foods&&S.foods.extras)||[])[+i.slice(1)] : EXTRAS[i]; }
console.assert(getExtra(0)===EXTRAS[0],"getExtra predefined");

// ponytail: no length cap — renderDay() already emits one row per history entry,
// so the datalist can't be what makes the DOM big first. Slice if history ever grows.
function foodNames(){
  const f=S.foods||{};
  const mine=Object.keys(f).filter(k=>k!=="_ts"&&!(MEALS[k]&&MEALS[k].legacyOnly)).flatMap(k=>f[k]||[]).reverse();
  const refs=(((S.calref||{}).items)||[]).slice().reverse();
  const builtin=[...Object.values(MEALS).filter(m=>!m.legacyOnly).flatMap(m=>m.opts.filter(o=>!o.legacyOnly)),...EXTRAS,...CALREF.flatMap(g=>g.items)];
  const out=new Map();
  [...mine,...refs,...builtin].forEach(o=>{ if(o&&o.t&&!out.has(o.t)) out.set(o.t,o); });
  return [...out.values()];
}
function foodByName(t){ return foodNames().find(o=>o.t===t)||null; }

// calref stores "النوع (الكمية)" as one title, so the two boxes have to suggest the
// two halves apart — offering the whole title as النوع sends the quantity twice.
const CRQTY=/\s*\(([^()]+)\)\s*$/;
function crNames(){ return [...new Set(foodNames().map(o=>o.t.replace(CRQTY,"")).filter(Boolean))]; }
function qtyNames(){
  const items=[...(((S.calref||{}).items)||[]).slice().reverse(),...CALREF.flatMap(g=>g.items)];
  return [...new Set(items.map(o=>(CRQTY.exec((o&&o.t)||"")||[])[1]).filter(Boolean))];
}

function totals(d){
  let k=0,p=0,f=0,c=0;
  for(const key in MEALS){ const o=getOpt(key,d[key]); if(d[key]!==undefined && d[key]!==null && o){ k+=o.k; p+=o.p; f+=o.f||0; c+=o.c||0; } }
  (d.extras||[]).forEach(i=>{ const o=getExtra(i); if(o){k+=o.k; p+=o.p; f+=o.f||0; c+=o.c||0;} });
  return {k,p,f,c};
}

function project(fromW, fromDate){
  const g=T(); const gw=g.gw; const intake=(g.klo+g.khi)/2;
  const dir=gw<fromW?-1:1;
  const pts=[]; let w=fromW; let d=new Date(fromDate+"T12:00:00");
  for(let i=0;i<60 && (gw-w)*dir>0;i++){
    const tdee=g.ht?calcTargets({sex:g.sex,age:g.age,ht:g.ht,act:g.act,w:w,gw:gw}).tdee:27.4*w;
    w -= (tdee-intake)*7/7700;
    d = new Date(d.getTime()+7*864e5);
    pts.push({date:d.toISOString().slice(0,10), w:dir<0?Math.max(w,gw):Math.min(w,gw)});
  }
  return pts;
}
