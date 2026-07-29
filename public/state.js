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
const REVIEWED_PROFILE_VERSION=2;
function migrateReviewedProfile(){
  const s=S&&S.settings;
  if(!s||s.reviewedProfileVersion>=REVIEWED_PROFILE_VERSION) return false;
  const ws=weightSeries();
  const w=ws.length?ws[ws.length-1].w:Number(s.sw);
  const matches=Number(s.age)===29
    && Math.abs(Number(s.ht)-186)<=0.5
    && Math.abs(Number(s.gw)-86)<=0.5
    && w>=100&&w<=110;
  if(!matches) return false;
  const act=1.55;
  const t=calcTargets({sex:"m",age:29,ht:186,w,act,gw:86});
  S.settings=Object.assign({},s,{
    sex:"m",age:29,ht:186,act,gw:86,
    klo:t.klo,khi:t.khi,plo:t.plo,phi:t.phi,
    reviewedProfileVersion:REVIEWED_PROFILE_VERSION,_ts:Date.now()
  });
  return true;
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
