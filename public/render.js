"use strict";
/* ================= تبويبات ================= */
let curTab="day";
function showTab(t){
  curTab=t;
  ["day","prog","cal"].forEach(x=>{
    document.getElementById("pg-"+x).style.display = (x===t)?"":"none";
    document.getElementById("tab-"+x).classList.toggle("on", x===t);
  });
  if(t==="prog") renderProg();
  if(t==="cal") renderCalRef();
}

/* ================= صفحة اليوم ================= */
function setDay(v){ cur=v||today(); renderDay(); }
function shiftDay(n){ const d=new Date(cur+"T12:00:00"); d.setDate(d.getDate()+n); setDay(d.toISOString().slice(0,10)); }

function renderDay(){
  document.getElementById("dpick").value=cur;
  const d=day();
  // meals
  let h="";
  for(const key in MEALS){
    const m=MEALS[key];
    if(m.legacyOnly){
      const i=d[key], o=Number.isInteger(i)?m.opts[i]:null;
      if(o){
        h+='<div class="opt sel" onclick="pick(\''+key+'\','+i+')">'
          +'<span>✅ ⚠️ اختيار محفوظ قديم — '+o.t+' — اضغط لإلغاء الاختيار</span>'
          +'<span class="kp">'+macros(o)+'</span></div>';
      }
      continue;
    }
    h+='<h3>'+m.name+'</h3>';
    if(m.dayNote) h+='<p class="muted" style="margin:-4px 0 8px">'+m.dayNote+'</p>';
    m.opts.forEach((o,i)=>{
      const sel = d[key]===i;
      if(o.legacyOnly&&!sel) return;
      const title=o.legacyOnly?'⚠️ اختيار محفوظ قديم — '+o.t+' — اضغط لإلغاء الاختيار':o.t;
      h+='<div class="opt'+(sel?" sel":"")+'" onclick="pick(\''+key+'\','+i+')">'
        +'<span>'+(sel?"✅ ":"⬜ ")+title+'</span>'
        +'<span class="kp">'+macros(o)+'</span></div>';
    });
    ((S.foods&&S.foods[key])||[]).forEach((o,i)=>{
      if(!o) return;
      const sel = d[key]==="c"+i;
      h+='<div class="opt'+(sel?" sel":"")+'" onclick="pick(\''+key+'\',\'c'+i+'\')">'
        +'<span>'+(sel?"✅ ":"⬜ ")+esc(o.t)+'</span>'
        +'<span class="kp">'+macros(o,true)+'</span>'
        +'<span style="color:var(--red);padding:0 4px" onclick="delFood(event,\''+key+'\','+i+')">✖</span></div>';
    });
    if(addOpen===key){
      h+=addForm("saveFood(\'"+key+"\')","اكتب الأكل... مثال: ٢ بيضة مسلوقة + رغيف بلدي");
    }else{
      h+='<div class="opt" onclick="openAdd(\''+key+'\')"><span>➕ أضف أكلة</span></div>';
    }
  }
  document.getElementById("meals-box").innerHTML=h;
  // extras
  let e=""; const ex=d.extras||[];
  EXTRAS.forEach((o,i)=>{
    const sel=ex.includes(i);
    e+='<div class="opt'+(sel?" sel":"")+'" onclick="pickExtra('+i+')">'
      +'<span>'+(sel?"✅ ":"⬜ ")+o.t+'</span><span class="kp">'+o.k+' سعر</span></div>';
  });
  ((S.foods&&S.foods.extras)||[]).forEach((o,i)=>{
    if(!o) return;
    const sel=ex.includes("c"+i);
    e+='<div class="opt'+(sel?" sel":"")+'" onclick="pickExtra(\'c'+i+'\')">'
      +'<span>'+(sel?"✅ ":"⬜ ")+esc(o.t)+'</span><span class="kp">'+o.k+' سعر'
      +(macroMismatch(o)?'<span class="macro-warn">⚠️ راجع السعرات والماكروز</span>':'')+'</span>'
      +'<span style="color:var(--red);padding:0 4px" onclick="delExtra(event,'+i+')">✖</span></div>';
  });
  if(addOpen==="extras"){
    e+=addForm("saveExtra()","اكتب الإضافة... مثال: ٢ تمرة + ١٠ جم لوز");
  }else{
    e+='<div class="opt" onclick="openAdd(\'extras\')"><span>➕ أضف إضافة</span></div>';
  }
  document.getElementById("extras-box").innerHTML=e;
  // water
  document.getElementById("water-val").textContent=(d.water||0)+" كوب مسجّل";
  // workout chips
  let w="";
  WORKOUTS.forEach(x=>{
    w+='<div class="chip'+(d.workout===x?" sel":"")+'" onclick="pickWorkout(\''+x+'\')">'+x+'</div>';
  });
  document.getElementById("workout-chips").innerHTML=w;
  // fields
  ["steps","cardio","weight","sleep","notes"].forEach(f=>{
    document.getElementById(f).value = d[f]||"";
  });
  renderSummary();
}

function pick(key,i){ const d=day(); d[key]=(d[key]===i)?null:i; save(); renderDay(); }
let addOpen=null, draft={};
function openAdd(key){ addOpen=key; draft={}; renderDay(); }
function closeAdd(){ addOpen=null; draft={}; renderDay(); }
function dataList(id,items){
  return '<datalist id="'+id+'">'+items.map(t=>'<option value="'+esc(t)+'">').join("")+'</datalist>';
}
function fillFood(t){
  const o=foodByName((t||"").trim()); if(!o) return;
  draft.k=o.k; draft.p=o.p; draft.f=o.f||0; draft.c=o.c||0;
  // ponytail: write the four boxes directly instead of renderDay() — a re-render would
  // recreate the input and steal focus while the user is still picking.
  ["k","p","f","c"].forEach(x=>{ document.getElementById("af-"+x).value=draft[x]; });
}
function addForm(saveCall, ph){
  const stTxt=aiOn()?"⚠️ تقدير AI تقريبي؛ اكتب الكمية وأكده من الملصق أو وصفة موزونة.":"اكتب السعرات والماكروز من الملصق أو وصفة موزونة.";
  return '<div class="opt" style="display:block;cursor:default">'
    +dataList("fd-names",foodNames().map(o=>o.t))
    +'<input style="width:100%" maxlength="160" list="fd-names" placeholder="'+ph+'" value="'+esc(draft.t||"")+'" oninput="draft.t=this.value;fillFood(this.value)">'
    +'<div class="row" style="margin-top:8px">'
    +'<label class="muted">سعرات</label><input type="number" id="af-k" style="width:72px" value="'+(draft.k??"")+'" oninput="draft.k=this.value">'
    +'<label class="muted">بروتين</label><input type="number" id="af-p" style="width:62px" value="'+(draft.p??"")+'" oninput="draft.p=this.value">'
    +'<label class="muted">دهون</label><input type="number" id="af-f" style="width:62px" value="'+(draft.f??"")+'" oninput="draft.f=this.value">'
    +'<label class="muted">كارب</label><input type="number" id="af-c" style="width:62px" value="'+(draft.c??"")+'" oninput="draft.c=this.value">'
    +'</div>'
    +'<div class="row" style="margin-top:8px">'
    +(aiOn()?'<button class="btn ghost" style="padding:7px 12px" onclick="aiFill(this)">🤖 احسب السعرات</button>':'')
    +'<button class="btn" onclick="'+saveCall+'">حفظ</button>'
    +'<button class="chip" onclick="closeAdd()">إلغاء</button>'
    +'</div>'
    +'<p class="muted" id="af-status" style="margin-top:6px">'+esc(draft.st||stTxt)+'</p></div>';
}
const AI_DISCLOSURE_VERSION=1;
const AI_FAIL_COPY={
  auth:"🔑 جلسة الدخول انتهت — سجّل دخولك تاني، أو اكتب الأرقام بنفسك.",
  forbidden:"🛡️ التحقق من أمان التطبيق أو صلاحية الحساب منجحش — اكتب الأرقام بنفسك.",
  quota:"⏳ حصة التقدير خلصت دلوقتي — جرّب بعد شوية، أو اكتب الأرقام بنفسك.",
  offline:"📴 مفيش اتصال دلوقتي — اكتب الأرقام بنفسك، وجرّب التقدير لما النت يرجع.",
  invalid:"⚠️ التقدير رجع أرقام غير متناسقة — راجع الملصق واكتب الأرقام بنفسك."
};
function normalizeAiEstimate(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)) return {ok:false,reason:"shape"};
  const keys=Object.keys(raw).sort();
  if(keys.join(",")!=="c,f,k,p") return {ok:false,reason:"shape"};
  const limits={k:[1,5000],p:[0,1250],f:[0,556],c:[0,1250]}, value={};
  for(const key of ["k","p","f","c"]){
    const n=raw[key];
    if(typeof n!=="number"||!Number.isFinite(n)||n<limits[key][0]||n>limits[key][1]) return {ok:false,reason:"bounds"};
    value[key]=Math.round(n);
  }
  const macroEnergy=value.p*4+value.f*9+value.c*4;
  if(Math.abs(value.k-macroEnergy)/value.k>0.1) return {ok:false,reason:"macros"};
  return {ok:true,value};
}
function aiFailKind(error){
  const code=String((error&&error.code)||"").toLowerCase();
  const custom=error&&error.customErrorData&&typeof error.customErrorData==="object"?error.customErrorData:{};
  const status=Number(custom.status??(error&&(error.status??error.httpStatus)));
  const message=String((error&&error.message)||"").toLowerCase();
  if(code==="ai/unauthenticated"||status===401||code.includes("unauthenticated")||message.includes(" 401")) return "auth";
  if(code==="ai/forbidden"||status===403||code.includes("permission-denied")||code.includes("app-check")||message.includes(" 403")) return "forbidden";
  if(status===429||code.includes("resource-exhausted")||code.includes("quota")||message.includes(" 429")) return "quota";
  if((typeof navigator!=="undefined"&&navigator.onLine===false)||code.includes("unavailable")||code.includes("network")||code.includes("fetch")) return "offline";
  return "invalid";
}
function aiDisclosureAccepted(){
  const s=(S&&S.settings)||{};
  const at=s.aiDisclosureAcceptedAt;
  return s.aiDisclosureVersion===AI_DISCLOSURE_VERSION&&typeof at==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at)&&Number.isFinite(Date.parse(at))&&new Date(at).toISOString()===at;
}
function acceptAiDisclosure(){
  if(aiDisclosureAccepted()) return true;
  const accepted=confirm("قبل تقدير AI:\n\n• اللي هيتبعت لـ Google هو وصف الأكل والكمية بس.\n• محتوى الاستخدام في الفئة المجانية ممكن يُستخدم لتحسين منتجات Google.\n• متكتبش اسمك أو أي تفاصيل شخصية أو صحية.\n• الإدخال اليدوي هيفضل متاح.\n\nموافق تستخدم التقدير؟ اختار إلغاء عشان تكمل يدوي.");
  if(!accepted) return false;
  S.settings=Object.assign({},S.settings,{aiDisclosureVersion:AI_DISCLOSURE_VERSION,aiDisclosureAcceptedAt:new Date().toISOString(),_ts:Date.now()});
  save();
  return true;
}
async function requestAiEstimate(text){
  if(!aiOn()) return {ok:false,manual:true};
  if(!acceptAiDisclosure()) return {ok:false,manual:true};
  try{
    const raw=await window.firebaseBridge.estimateFood(text);
    const normalized=normalizeAiEstimate(raw);
    return normalized.ok?normalized:{ok:false,copy:AI_FAIL_COPY.invalid};
  }catch(error){
    return {ok:false,copy:AI_FAIL_COPY[aiFailKind(error)]};
  }
}
// v3.7.0 keeps AI disabled; both call sites retain their manual path and make
// no bridge call until a reviewed release flips the module flag.
function aiOn(){ return window.AI_ENABLED===true; }
async function aiFill(btn){
  if(!aiOn()){ draft.st="اكتب السعرات والماكروز من الملصق أو وصفة موزونة"; renderDay(); return; }
  const t=(draft.t||"").trim();
  if(!t){ draft.st="اكتب الأكل الأول"; renderDay(); return; }
  btn.disabled=true;
  const st=document.getElementById("af-status"); if(st) st.textContent="⏳ بحسب...";
  const result=await requestAiEstimate(t);
  if(result.ok){
    const r=result.value;
    draft.k=r.k; draft.p=r.p; draft.f=r.f; draft.c=r.c;
    draft.st="⚠️ تقدير تقريبي — لازم تراجعه من الملصق أو وصفة موزونة";
  }else draft.st=result.copy||"اكتب السعرات والماكروز من الملصق أو وصفة موزونة";
  renderDay();
}
function saveFood(key){
  const t=(draft.t||"").trim().slice(0,160);
  const num=v=>Math.min(5000,Math.max(0,parseFloat(v)||0));
  if(!t){ draft.st="اكتب اسم الأكل الأول"; renderDay(); return; }
  if(!num(draft.k)){ draft.st="السعرات مطلوبة"; renderDay(); return; }
  S.foods=S.foods||{}; S.foods[key]=S.foods[key]||[];
  S.foods[key].push({t:t, k:num(draft.k), p:num(draft.p), f:num(draft.f), c:num(draft.c)});
  S.foods._ts=Date.now();
  day()[key]="c"+(S.foods[key].length-1);
  addOpen=null; draft={};
  save(); renderDay();
}
function delFood(ev,key,i){
  ev.stopPropagation();
  if(!confirm("تمسح الأكلة دي من قايمتك؟")) return;
  S.foods[key][i]=null;
  S.foods._ts=Date.now();
  const d=day(); if(d[key]==="c"+i) d[key]=null;
  save(); renderDay();
}
function saveExtra(){
  const t=(draft.t||"").trim().slice(0,160);
  const num=v=>Math.min(5000,Math.max(0,parseFloat(v)||0));
  if(!t){ draft.st="اكتب اسم الإضافة الأول"; renderDay(); return; }
  if(!num(draft.k)){ draft.st="السعرات مطلوبة"; renderDay(); return; }
  S.foods=S.foods||{}; S.foods.extras=S.foods.extras||[];
  S.foods.extras.push({t:t, k:num(draft.k), p:num(draft.p), f:num(draft.f), c:num(draft.c)});
  S.foods._ts=Date.now();
  const d=day(); d.extras=d.extras||[]; d.extras.push("c"+(S.foods.extras.length-1));
  addOpen=null; draft={};
  save(); renderDay();
}
function delExtra(ev,i){
  ev.stopPropagation();
  if(!confirm("تمسح الإضافة دي من قايمتك؟")) return;
  S.foods.extras[i]=null;
  S.foods._ts=Date.now();
  const d=day(); if(d.extras){ const ix=d.extras.indexOf("c"+i); if(ix>=0) d.extras.splice(ix,1); }
  save(); renderDay();
}
function pickExtra(i){ const d=day(); d.extras=d.extras||[]; const ix=d.extras.indexOf(i); if(ix>=0)d.extras.splice(ix,1); else d.extras.push(i); save(); renderDay(); }
function pickWorkout(x){ const d=day(); d.workout=(d.workout===x)?null:x; save(); renderDay(); }
function water(n){ const d=day(); d.water=Math.max(0,(d.water||0)+n); save(); renderDay(); }
function saveField(f,v){ day()[f]=v; save(); renderSummary(); }

function setT(k,v){
  const n=parseFloat(v);
  const lim=TLIMITS[k];
  if(lim&&(!Number.isFinite(n)||n<lim[0]||n>lim[1])){ alert(lim[2]); renderProg(); return; }
  if(k==="gw"){
    const g=T(), bmi=n/(g.ht/100)**2;
    if(!Number.isFinite(n)||bmi<18.5||bmi>40){ alert("هدف الوزن خارج النطاق الآمن للتطبيق؛ راجع مختص."); renderProg(); return; }
  }
  if(k==="klo"||k==="khi"||k==="plo"||k==="phi"){
    const nx=Object.assign({},T(),{[k]:n});
    if(nx.klo>nx.khi||nx.plo>nx.phi){ alert("الحد الأدنى لازم ميزيدش عن الحد الأعلى."); renderProg(); return; }
  }
  S.settings=S.settings||{};
  S.settings[k]=(typeof DEF[k]==="number")?(n||DEF[k]):v;
  S.settings._ts=Date.now(); save(); if(k==="name") setWho(); renderProg();
}
function recalcTargets(){
  const g=T();
  if(!g.ht){ alert("كمّل بيانات الطول والسن الأول"); return; }
  const w=basisWeight(weightSeries(),today())||g.sw;
  const t=calcTargets({sex:g.sex,age:g.age,ht:g.ht,w:w,act:g.act,gw:g.gw});
  if(!validTargets(t)){ alert("احتياجك المقدّر ("+t.klo+"–"+t.khi+" سعر) خارج النطاق اللي التطبيق بيدعمه (1200–6000). حط هدفك يدويًا من الخانات فوق وراجع مختص تغذية."); return; }
  S.settings=Object.assign({},S.settings,{klo:t.klo,khi:t.khi,plo:t.plo,phi:t.phi,tw:w,_ts:Date.now()});
  save(); renderProg();
}
/* الاحتفاظ بالهدف بيسجّل الوزن اللي المراجعة حصلت عنده — مفيش فلاج تجاهل منفصل،
   نفس الحقل هو اللي بيمنع السؤال يتكرر لحد ما المقترح يتحرك خطوة كاملة تانية */
function keepTargets(){
  const w=basisWeight(weightSeries(),today());
  if(!w) return;
  S.settings=Object.assign({},S.settings,{tw:w,_ts:Date.now()});
  save(); renderProg();
}

function renderSummary(){
  const d=day(); const t=totals(d); const g=T(); const mh=macroHints(g);
  const kcls = t.k===0?"":(t.k<g.klo?"warn":(t.k>g.khi?"bad":"good"));
  const pcls = t.p===0?"":(t.p<g.plo?"warn":"good");
  document.getElementById("sumbar").innerHTML =
    '<div><div class="v '+kcls+'">'+t.k+'</div><div class="l">سعرات (هدف '+g.klo+'–'+g.khi+')</div></div>'
   +'<div><div class="v '+pcls+'">'+t.p+' جم</div><div class="l">بروتين (هدف '+g.plo+'–'+g.phi+')</div></div>'
   +'<div><div class="v">'+t.f+' جم</div><div class="l">دهون (~'+mh.flo+'–'+mh.fhi+')</div></div>'
   +'<div><div class="v">'+t.c+' جم</div><div class="l">كارب (~'+mh.clo+'–'+mh.chi+')</div></div>'
   +'<div><div class="v">'+((d.water||0)*0.25).toFixed(2)+' لتر</div><div class="l">سوائل مسجّلة (المشروبات والأكل كمان بيتحسبوا)</div></div>'
   +'<div><div class="v">'+(d.steps||"—")+'</div><div class="l">خطوات اليوم</div></div>'
   +'<div><div class="v">'+(d.weight?d.weight+" كجم":"—")+'</div><div class="l">وزن الصبح</div></div>';
}

/* ================= مرجع السعرات ================= */
let crDraft={};
function renderCalRef(){
  const stTxt=aiOn()?"⚠️ تقدير AI تقريبي؛ أكده من ملصق العبوة أو وصفة موزونة قبل الاعتماد عليه.":"اكتب القيم من ملصق العبوة أو وصفة موزونة.";
  let h="";
  CALREF.forEach(g=>{
    h+='<h3>'+g.cat+'</h3>';
    g.items.forEach(o=>{
      h+='<div class="opt" style="cursor:default"><span>'+o.t+'</span><span class="kp">'+macros(o)+'</span></div>';
    });
  });
  h+='<h3>➕ إضافاتك</h3>';
  ((S.calref&&S.calref.items)||[]).forEach((o,i)=>{
    h+='<div class="opt" style="cursor:default"><span>'+esc(o.t)+'</span><span class="kp">'+macros(o,true)+'</span>'
      +'<span style="color:var(--red);padding:0 4px;cursor:pointer" onclick="delCalRef('+i+')">✖</span></div>';
  });
  h+='<div class="opt" style="display:block;cursor:default">'
    +dataList("cr-names",crNames())
    +dataList("cr-qty",qtyNames())
    +'<div class="row">'
    +'<input style="flex:1;min-width:130px" maxlength="60" list="cr-names" placeholder="النوع... مثال: بسبوسة" value="'+esc(crDraft.t||"")+'" oninput="crDraft.t=this.value">'
    +'<input style="width:150px" maxlength="40" list="cr-qty" placeholder="الكمية... قطعة ١٠٠ جم" value="'+esc(crDraft.q||"")+'" oninput="crDraft.q=this.value">'
    +(aiOn()?'<button class="btn ghost" style="width:auto;padding:7px 12px" onclick="aiCalRef(this)">🤖 احسب</button>':'')
    +'</div>'
    +'<div class="row" style="margin-top:8px">'
    +'<label class="muted">سعرات</label><input type="number" id="cr-k" style="width:72px" value="'+(crDraft.k??"")+'" oninput="crDraft.k=this.value">'
    +'<label class="muted">بروتين</label><input type="number" id="cr-p" style="width:62px" value="'+(crDraft.p??"")+'" oninput="crDraft.p=this.value">'
    +'<label class="muted">دهون</label><input type="number" id="cr-f" style="width:62px" value="'+(crDraft.f??"")+'" oninput="crDraft.f=this.value">'
    +'<label class="muted">كارب</label><input type="number" id="cr-c" style="width:62px" value="'+(crDraft.c??"")+'" oninput="crDraft.c=this.value">'
    +'<button class="btn" onclick="saveCalRef()">حفظ يدوي</button></div>'
    +'<p class="muted" id="cr-status" style="margin-top:6px">'+esc(crDraft.st||stTxt)+'</p></div>';
  document.getElementById("calref-list").innerHTML=h;
}
async function aiCalRef(btn){
  if(!aiOn()){ crDraft.st="اكتب القيم من ملصق العبوة أو وصفة موزونة"; renderCalRef(); return; }
  const t=(crDraft.t||"").trim(), q=(crDraft.q||"").trim();
  if(!t){ crDraft.st="اكتب النوع الأول"; renderCalRef(); return; }
  btn.disabled=true;
  const st=document.getElementById("cr-status"); if(st) st.textContent="⏳ بحسب...";
  const result=await requestAiEstimate(t+(q?" — الكمية: "+q:""));
  if(result.ok){
    crDraft=Object.assign({},crDraft,result.value,{st:"⚠️ تقدير تقريبي — راجعه وبعدها اضغط حفظ يدوي"});
  }else crDraft.st=result.copy||"اكتب القيم من ملصق العبوة أو وصفة موزونة";
  renderCalRef();
}
function saveCalRef(){
  const t=(crDraft.t||"").trim(), q=(crDraft.q||"").trim();
  if(!t){ crDraft.st="اكتب النوع الأول"; renderCalRef(); return; }
  const normalized=normalizeAiEstimate({k:Number(crDraft.k),p:Number(crDraft.p),f:Number(crDraft.f),c:Number(crDraft.c)});
  if(!normalized.ok){ crDraft.st="راجع الأربع أرقام: السعرات لازم تطابق الماكروز في حدود ١٠٪"; renderCalRef(); return; }
  S.calref=S.calref||{}; S.calref.items=S.calref.items||[];
  S.calref.items.push(Object.assign({t:(t+(q?" ("+q+")":"")).slice(0,80)},normalized.value));
  S.calref._ts=Date.now();
  crDraft={};
  save(); renderCalRef();
}
function delCalRef(i){
  if(!confirm("تمسح العنصر ده من إضافاتك؟")) return;
  S.calref.items.splice(i,1);
  S.calref._ts=Date.now();
  save(); renderCalRef();
}

function renderProg(){
  const g=T(); const gw=g.gw;
  const ws=weightSeries();
  const last = ws.length? ws[ws.length-1] : {date:today(), w:g.sw};
  const bmiNow=g.ht?last.w/(g.ht/100)**2:null;
  const bmiGoal=g.ht?gw/(g.ht/100)**2:null;
  const proj = project(last.w, last.date);
  const base = Number(g.sw) || (ws[0]||{}).w;
  const lost = ws.length ? base - last.w : 0;
  const goalDate = proj.length? proj[proj.length-1].date : "—";
  const {lo:rateLo,hi:rateHi}=rateBand(last.w);
  // المقترح بيتقارن بالمقترح، مش بالهدف المحفوظ — عشان هدف مكتوب بالإيد ميتنبّهش عليه
  const basis=basisWeight(ws,today());
  let stale=null;
  if(g.ht&&basis){
    const at=w=>calcTargets({sex:g.sex,age:g.age,ht:g.ht,w:w,act:g.act,gw:g.gw});
    const tw=Number(g.tw)||basis;
    const sug=at(basis);
    if(targetsMoved(at(tw),sug)&&validTargets(sug)) stale={tw,sug};
  }
  // weekly averages
  const wk={};
  ws.forEach(p=>{
    const d=new Date(p.date+"T12:00:00");
    const onejan=new Date(d.getFullYear(),0,1);
    const week=d.getFullYear()+"-W"+String(Math.ceil((((d-onejan)/864e5)+onejan.getDay()+1)/7)).padStart(2,"0");
    (wk[week]=wk[week]||[]).push(p.w);
  });
  const weeks=Object.keys(wk).sort();
  let wkRows="";
  let prev=null;
  weeks.forEach(k=>{
    const avg=wk[k].reduce((a,b)=>a+b,0)/wk[k].length;
    const diff=prev===null?"—":(avg-prev>=0?"+":"")+(avg-prev).toFixed(2)+" كجم";
    wkRows+='<tr><td>'+k+'</td><td>'+avg.toFixed(1)+'</td><td>'+diff+'</td></tr>';
    prev=avg;
  });
  // milestones: 5-kg steps from sw toward gw
  const down=gw<=g.sw;
  let m0=down?Math.floor(g.sw/5)*5:Math.ceil(g.sw/5)*5;
  if(down?m0>=g.sw:m0<=g.sw) m0+=down?-5:5;
  const ms=[];
  for(let m=m0; down?m>gw:m<gw; m+=down?-5:5) ms.push(m);
  ms.push(gw);
  let msRows="";
  ms.forEach(m=>{
    const hit=ws.find(p=>down?p.w<=m:p.w>=m);
    const pr=proj.find(p=>down?p.w<=m:p.w>=m);
    msRows+='<tr><td>'+m+' كجم</td><td>'+(hit?'✅ '+hit.date:(pr?'~ '+pr.date:'—'))+'</td></tr>';
  });
  // tracked days count
  const tracked=Object.keys(S.days).filter(k=>{const d=S.days[k]; return totals(d).k>0||d.water||d.workout;}).length;
  // history list
  let histRows="";
  Object.keys(S.days).sort().reverse().forEach(k=>{
    const dd=S.days[k]; const tt=totals(dd);
    const bits=[];
    if(tt.k) bits.push("🍽️ "+tt.k+" سعر · "+tt.p+" جم");
    if(dd.weight) bits.push("⚖️ "+dd.weight+" كجم");
    if(dd.workout) bits.push("🏋️ "+dd.workout);
    if(dd.water) bits.push("💧 "+((dd.water||0)*0.25).toFixed(1)+" ل");
    histRows+='<div class="opt" onclick="goToDay(\''+k+'\')"><span>📅 <b>'+k+'</b></span>'
      +'<span class="kp">'+(bits.join(" · ")||"يوم فاضي")+'</span></div>';
  });

  const actOpts=[[1.2,"قليل الحركة"],[1.375,"خفيف (1–3 أيام)"],[1.55,"متوسط (3–5 أيام)"],[1.725,"عالي (6–7 أيام)"]]
    .map(a=>'<option value="'+a[0]+'"'+(+g.act===a[0]?" selected":"")+'>'+a[1]+'</option>').join("");

  document.getElementById("pg-prog").innerHTML = `
  ${stale?`<div class="note" id="stale-note">
    ⚖️ متوسط وزنك آخر ١٤ يوم ${basis.toFixed(1)} كجم، وآخر مراجعة للهدف كانت عند ${stale.tw.toFixed(1)} كجم.
    المقترح دلوقتي <b>${stale.sug.klo}–${stale.sug.khi} سعر</b> · بروتين ${stale.sug.plo}–${stale.sug.phi} جم، وهدفك الحالي ${g.klo}–${g.khi} سعر.
    <div class="row" style="margin-top:8px">
      <button class="btn" style="width:auto;padding:7px 12px" onclick="recalcTargets()">تطبيق المقترح</button>
      <button class="btn ghost" style="width:auto;padding:7px 12px" onclick="keepTargets()">الاحتفاظ بالهدف الحالي</button>
    </div>
  </div>`:""}
  <div class="card">
    <div class="grid2">
      <div class="stat"><div class="v">${last.w.toFixed(1)}</div><div class="l">آخر وزن (كجم)</div></div>
      <div class="stat"><div class="v" style="color:var(--green)">${lost>=0?"−":"+"}${Math.abs(lost).toFixed(1)}</div><div class="l">التغيير من البداية</div></div>
      <div class="stat"><div class="v" style="color:var(--orange)">${Math.abs(last.w-gw).toFixed(1)}</div><div class="l">فاضل للهدف (${gw})</div></div>
      <div class="stat"><div class="v">${goalDate}</div><div class="l">الوصول المتوقع</div></div>
    </div>
    ${bmiNow?`<p class="muted" style="margin-top:10px">BMI الحالي ${bmiNow.toFixed(1)} · عند الهدف ${bmiGoal.toFixed(1)}. ده مؤشر فحص فقط؛ قيّم الهدف كمان بمقاس الوسط والقوة والحالة الصحية.</p>`:""}
  </div>
  <div class="card"><h2>📈 منحنى الوزن</h2>
    <div id="chart-box">${drawChart(ws, proj)}</div>
    <div class="legend"><span class="lg-a">وزنك الفعلي</span><span class="lg-p">المسار المتوقع (~${(g.klo+g.khi)/2} سعر/يوم)</span><span class="lg-g">الهدف ${gw} كجم</span></div>
    <p class="muted">المسار والتاريخ تقدير رياضي فقط؛ الحرق بيتغير والنتيجة الفعلية تعتمد على متوسط الوزن والتسجيل.</p>
  </div>
  <div class="card"><h2>🚩 المحطات</h2>
    <table><tr><th>الوزن</th><th>وصلت / متوقع</th></tr>${msRows}</table>
  </div>
  <div class="card"><h2>📅 متوسط أسبوعي</h2>
    ${weeks.length?'<table><tr><th>الأسبوع</th><th>المتوسط</th><th>التغيير</th></tr>'+wkRows+'</table>':'<p class="muted">سجّل وزنك يوميًا وهتلاقي المتوسطات هنا.</p>'}
    <p class="muted" style="margin-top:8px">الهدف الحالي: ${rateLo}–${rateHi} كجم في الأسبوع بعد أول أسبوعين. بص على متوسط 3 أسابيع لأن المياه ممكن تخفي الاتجاه الحقيقي.</p>
    <p class="muted">أيام متسجلة: ${tracked} يوم</p>
  </div>
  <div class="card"><h2>🗓️ سجل الأيام <span class="muted" style="font-weight:400">(دوس على أي يوم يفتحلك)</span></h2>
    ${histRows||'<p class="muted">لسه مفيش أيام متسجلة.</p>'}
  </div>
  <div class="card"><h2>⚙️ بياناتي وأهدافي</h2>
    <div class="row">
      <label class="muted">الاسم:</label>
      <input style="width:140px" value="${esc(g.name||"")}" onchange="setT('name',this.value)">
      <label class="muted">النوع:</label>
      <select onchange="setT('sex',this.value)"><option value="m"${g.sex==="f"?"":" selected"}>ذكر</option><option value="f"${g.sex==="f"?" selected":""}>أنثى</option></select>
    </div>
    <div class="row" style="margin-top:10px">
      <label class="muted">السن:</label>
      <input type="number" style="width:70px" value="${g.age}" onchange="setT('age',this.value)">
      <label class="muted">الطول (سم):</label>
      <input type="number" style="width:80px" value="${g.ht||""}" onchange="setT('ht',this.value)">
      <label class="muted">النشاط:</label>
      <select onchange="setT('act',this.value)">${actOpts}</select>
    </div>
    <div class="row" style="margin-top:10px">
      <label class="muted">وزن البداية:</label>
      <input type="number" step="0.1" style="width:90px" value="${g.sw}" onchange="setT('sw',this.value)">
      <label class="muted">الوزن المستهدف:</label>
      <input type="number" step="0.1" style="width:90px" value="${g.gw}" onchange="setT('gw',this.value)">
    </div>
    <div class="row" style="margin-top:10px">
      <label class="muted">سعرات من:</label>
      <input type="number" style="width:90px" value="${g.klo}" onchange="setT('klo',this.value)">
      <label class="muted">إلى:</label>
      <input type="number" style="width:90px" value="${g.khi}" onchange="setT('khi',this.value)">
    </div>
    <div class="row" style="margin-top:10px">
      <label class="muted">بروتين من:</label>
      <input type="number" style="width:90px" value="${g.plo}" onchange="setT('plo',this.value)">
      <label class="muted">إلى:</label>
      <input type="number" style="width:90px" value="${g.phi}" onchange="setT('phi',this.value)">
    </div>
    <button class="btn ghost" style="margin-top:12px" onclick="recalcTargets()">🔄 احسب تلقائي</button>
    <p class="muted" style="margin-top:6px">بيحسب السعرات والبروتين من بياناتك وآخر وزن مسجّل — اضغطه لما وزنك أو نشاطك يتغير.</p>
  </div>`;
}
function goToDay(d){ showTab("day"); setDay(d); }
function drawChart(ws, proj){
  const gw=T().gw;
  const W=780, H=300, PL=42, PR=12, PT=14, PB=34;
  const all=ws.concat(proj.map(p=>({date:p.date,w:p.w})));
  if(!all.length) return '<p class="muted">مفيش بيانات لسه.</p>';
  const t0=new Date(all[0].date+"T12:00:00").getTime()-5*864e5;
  const t1=new Date(all[all.length-1].date+"T12:00:00").getTime()+5*864e5;
  let wmin=Math.min(gw,...all.map(p=>p.w))-2, wmax=Math.max(...all.map(p=>p.w))+2;
  const X=t=>PL+(t-t0)/(t1-t0)*(W-PL-PR);
  const Y=w=>PT+(wmax-w)/(wmax-wmin)*(H-PT-PB);
  let g="";
  // horizontal grid
  for(let w=Math.ceil(wmin/5)*5; w<=wmax; w+=5){
    g+='<line x1="'+PL+'" y1="'+Y(w)+'" x2="'+(W-PR)+'" y2="'+Y(w)+'" stroke="#2a3948" stroke-width="1"/>'
      +'<text x="'+(PL-6)+'" y="'+(Y(w)+4)+'" fill="#8ba0b5" font-size="11" text-anchor="end">'+w+'</text>';
  }
  // month labels
  const d0=new Date(t0), d1=new Date(t1);
  const months=["ينا","فبر","مار","أبر","ماي","يون","يول","أغس","سبت","أكت","نوف","ديس"];
  let mcur=new Date(d0.getFullYear(), d0.getMonth()+1, 1);
  while(mcur<d1){
    g+='<line x1="'+X(mcur.getTime())+'" y1="'+PT+'" x2="'+X(mcur.getTime())+'" y2="'+(H-PB)+'" stroke="#22303e" stroke-width="1"/>'
      +'<text x="'+X(mcur.getTime())+'" y="'+(H-14)+'" fill="#8ba0b5" font-size="10" text-anchor="middle">'+months[mcur.getMonth()]+' '+String(mcur.getFullYear()).slice(2)+'</text>';
    mcur=new Date(mcur.getFullYear(), mcur.getMonth()+1, 1);
  }
  // goal line
  g+='<line x1="'+PL+'" y1="'+Y(gw)+'" x2="'+(W-PR)+'" y2="'+Y(gw)+'" stroke="#8ba0b5" stroke-width="1.5" stroke-dasharray="2,4"/>';
  // projection path
  if(ws.length||proj.length){
    const start=ws.length?ws[ws.length-1]:proj[0];
    let pp="M "+X(new Date(start.date+"T12:00:00").getTime())+" "+Y(start.w);
    proj.forEach(p=>{ pp+=" L "+X(new Date(p.date+"T12:00:00").getTime())+" "+Y(p.w); });
    g+='<path d="'+pp+'" fill="none" stroke="#fb923c" stroke-width="2" stroke-dasharray="6,5" opacity="0.85"/>';
  }
  // actual path + dots
  if(ws.length){
    let ap="";
    ws.forEach((p,i)=>{ ap+=(i?" L ":"M ")+X(new Date(p.date+"T12:00:00").getTime())+" "+Y(p.w); });
    g+='<path d="'+ap+'" fill="none" stroke="#2dd4bf" stroke-width="2.5"/>';
    ws.forEach(p=>{
      g+='<circle cx="'+X(new Date(p.date+"T12:00:00").getTime())+'" cy="'+Y(p.w)+'" r="3.5" fill="#2dd4bf"><title>'+p.date+': '+p.w+' كجم</title></circle>';
    });
  }
  return '<svg viewBox="0 0 '+W+' '+H+'" style="min-width:600px;width:100%" xmlns="http://www.w3.org/2000/svg">'+g+'</svg>';
}
