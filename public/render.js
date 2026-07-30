"use strict";
/* ================= تبويبات ================= */
let curTab="day";
function showTab(t){
  curTab=t;
  ["day","plan","prog","cal"].forEach(x=>{
    document.getElementById("pg-"+x).style.display = (x===t)?"":"none";
    document.getElementById("tab-"+x).classList.toggle("on", x===t);
  });
  if(t==="prog") renderProg();
  if(t==="plan") renderPlan();
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
    h+='<h3>'+m.name+'</h3>';
    m.opts.forEach((o,i)=>{
      const sel = d[key]===i;
      h+='<div class="opt'+(sel?" sel":"")+'" onclick="pick(\''+key+'\','+i+')">'
        +'<span>'+(sel?"✅ ":"⬜ ")+o.t+'</span>'
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
    +'<button class="btn ghost" style="padding:7px 12px" onclick="aiFill(this)">🤖 احسب السعرات</button>'
    +'<button class="btn" onclick="'+saveCall+'">حفظ</button>'
    +'<button class="chip" onclick="closeAdd()">إلغاء</button>'
    +'</div>'
    +'<p class="muted" id="af-status" style="margin-top:6px">'+esc(draft.st||"⚠️ تقدير AI تقريبي؛ اكتب الكمية وأكده من الملصق أو وصفة موزونة.")+'</p></div>';
}
async function aiFill(btn){
  const t=(draft.t||"").trim();
  if(!t){ draft.st="اكتب الأكل الأول"; renderDay(); return; }
  btn.disabled=true;
  const st=document.getElementById("af-status"); if(st) st.textContent="⏳ بحسب...";
  try{
    const r=await window.aiEstimate(t);
    draft.k=Math.round(r.k)||0; draft.p=Math.round(r.p)||0; draft.f=Math.round(r.f)||0; draft.c=Math.round(r.c)||0;
    draft.st="⚠️ تقدير تقريبي — لازم تراجعه من الملصق أو وصفة موزونة";
  }catch(e){
    console.error("aiEstimate failed:",e);
    draft.st="مش قادر أحسب دلوقتي — اكتب الأرقام بنفسك";
  }
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
  const ws=weightSeries();
  const w=ws.length?ws[ws.length-1].w:g.sw;
  const t=calcTargets({sex:g.sex,age:g.age,ht:g.ht,w:w,act:g.act,gw:g.gw});
  if(!validTargets(t)){ alert("احتياجك المقدّر ("+t.klo+"–"+t.khi+" سعر) خارج النطاق اللي التطبيق بيدعمه (1200–6000). حط هدفك يدويًا من الخانات فوق وراجع مختص تغذية."); return; }
  S.settings=Object.assign({},S.settings,{klo:t.klo,khi:t.khi,plo:t.plo,phi:t.phi,_ts:Date.now()});
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
   +'<div><div class="v">'+(d.steps||"—")+'</div><div class="l">خطوات (زوّد تدريجيًا نحو 8,000)</div></div>'
   +'<div><div class="v">'+(d.weight?d.weight+" كجم":"—")+'</div><div class="l">وزن الصبح</div></div>';
}

/* ================= مرجع السعرات ================= */
let crDraft={};
function renderCalRef(){
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
    +'<button class="btn ghost" style="width:auto;padding:7px 12px" onclick="aiCalRef(this)">🤖 احسب</button>'
    +'</div>'
    +'<p class="muted" id="cr-status" style="margin-top:6px">'+esc(crDraft.st||"⚠️ تقدير AI تقريبي؛ أكده من ملصق العبوة أو وصفة موزونة قبل الاعتماد عليه.")+'</p></div>';
  document.getElementById("calref-list").innerHTML=h;
}
async function aiCalRef(btn){
  const t=(crDraft.t||"").trim(), q=(crDraft.q||"").trim();
  if(!t){ crDraft.st="اكتب النوع الأول"; renderCalRef(); return; }
  btn.disabled=true;
  const st=document.getElementById("cr-status"); if(st) st.textContent="⏳ بحسب...";
  const num=v=>Math.round(Math.min(5000,Math.max(0,parseFloat(v)||0)));
  try{
    const r=await window.aiEstimate(t+(q?" — الكمية: "+q:""));
    S.calref=S.calref||{}; S.calref.items=S.calref.items||[];
    S.calref.items.push({t:(t+(q?" ("+q+")":"")).slice(0,80), k:num(r.k), p:num(r.p), f:num(r.f), c:num(r.c)});
    S.calref._ts=Date.now();
    crDraft={};
    save();
  }catch(e){
    console.error("aiEstimate failed:",e);
    crDraft.st="⚠️ مش قادر أحسب دلوقتي — جرّب تاني بعدين";
  }
  renderCalRef();
}
function delCalRef(i){
  if(!confirm("تمسح العنصر ده من إضافاتك؟")) return;
  S.calref.items.splice(i,1);
  S.calref._ts=Date.now();
  save(); renderCalRef();
}

/* ================= صفحة الخطة ================= */
function renderPlan(){
  const g=T(), mh=macroHints(g);
  const kmid=Math.round((g.klo+g.khi)/2);
  const wNow=(weightSeries().slice(-1)[0]||{w:g.sw}).w;
  const tdee=g.ht?calcTargets({sex:g.sex,age:g.age,ht:g.ht,w:wNow,act:g.act,gw:g.gw}).tdee:Math.round(27.4*wNow);
  const rate=(tdee-kmid)*7/7700;
  const rateTxt=Math.abs(rate)<0.05?"ثبات وزنك تقريبًا":(rate>0?"نزول ~":"زيادة ~")+Math.abs(rate).toFixed(1)+" كجم/أسبوع";
  const {lo:rateLo,hi:rateHi}=rateBand(wNow);
  let mealsRows="";
  for(const key in MEALS){
    const m=MEALS[key];
    mealsRows+='<h3>'+m.name+(m.opts.length>1?' <span class="muted" style="font-weight:400">(اختر واحدة)</span>':'')+'</h3>'
      +'<p class="muted" style="margin-bottom:6px">⚖️ '+m.note+'</p>';
    m.opts.forEach(o=>{
      mealsRows+='<div class="opt" style="cursor:default"><span>'+o.t+'</span>'
        +'<span class="kp">'+macros(o)+'</span></div>';
    });
  }
  let extrasRows='<h3>➕ الإضافات الاختيارية</h3>';
  EXTRAS.forEach(o=>{
    extrasRows+='<div class="opt" style="cursor:default"><span>'+o.t+'</span>'
      +'<span class="kp">'+macros(o)+'</span></div>';
  });
  document.getElementById("pg-plan").innerHTML = `
  <div class="card"><h2>🎯 الأهداف اليومية</h2>
    <div class="grid2">
      <div class="stat"><div class="v">${g.klo}–${g.khi}</div><div class="l">سعرات حرارية</div></div>
      <div class="stat"><div class="v">${g.plo}–${g.phi} جم</div><div class="l">بروتين</div></div>
      <div class="stat"><div class="v">${mh.flo}–${mh.fhi} جم</div><div class="l">إجمالي الدهون</div></div>
      <div class="stat"><div class="v">${mh.clo}–${mh.chi} جم</div><div class="l">كربوهيدرات</div></div>
    </div>
    <div class="note">🔀 مدى الدهون والكربوهيدرات بديلين لبعض: كل جرام دهون زيادة بيقلّل الكارب المتاح، فمينفعش توصل لأعلى رقم في الاتنين مع بعض من غير ما تعدّي سقف السعرات.</div>
    <div class="note">💡 الهدف المبدئي ${kmid} سعر ≈ ${rateTxt} حسب معادلة تقديرية، مش قياس مباشر للحرق. حافظ على تمارين المقاومة والبروتين. التقدير <b>خطي</b> (7,700 سعر ≈ كيلو) وبيميل يبالغ في سرعة النزول لأن الحرق بيقل مع نقص الوزن، فاضغط "🔄 احسب تلقائي" كل ما الوزن أو النشاط يتغير.</div>
    <div class="note">📊 استخدم <b>متوسط 3 أسابيع</b>: لو النزول ${rateLo}–${rateHi} كجم/أسبوع كمّل. لو أسرع من ${rateHi} بعد أول أسبوعين، أو القوة/الدوخة ساءت، زوّد 100–200 سعر. لو أقل من ${rateLo} مع تسجيل دقيق 3 أسابيع، قلّل 100–150 سعر. متعوّضش التمرين بأكل إضافي تلقائيًا؛ النشاط داخل تقدير الهدف بالفعل.</div>
    <div class="note">⚖️ الوجبات الأساسية وحدها بتعمل تقريبًا 2,040–2,340 سعر حسب اختياراتك. استخدم الإضافات الموزونة للوصول لهدفك الظاهر فوق؛ الاختيارات <b>متقاربة وليست متطابقة</b>، وملصق العبوة وميزان المطبخ أدق من القيم التقديرية.</div>
    <div class="note">⚕️ التطبيق للتتبع والتثقيف، مش تشخيص أو وصفة علاج. بسبب الضغط المنخفض وأعراض الدوخة، راجع طبيبك لو الأعراض زادت مع العجز أو التمرين، ومتغيّرش الملح أو السوائل أو المكملات كعلاج من نفسك.</div>
  </div>

  <div class="card"><h2>🍽️ جدول الوجبات (كميات معدّلة)</h2>
    ${mealsRows}
    ${extrasRows}
    <p class="muted" style="margin-top:10px">اوزن الأكل أول أسبوعين على الأقل. كل أوزان الفراخ واللحمة والسمك والرز والبطاطس هنا بعد الطبخ، والزيت بالجرام. استهدف خضار في وجبتين، 2 ثمرة فاكهة، و30 جم ألياف على الأقل يوميًا.</p>
  </div>

  <div class="card"><h2>🏋️ برنامج المقاومة — Push / Pull / Legs (زي ما ماشي مع الكوتش)</h2>
    <h3>يوم Push (صدر + كتف + تراي)</h3>
    <ul class="plain">
      <li>Bench Press أو Chest Press جهاز — 3×8–10</li>
      <li>Incline Dumbbell Press — 3×10</li>
      <li>Dumbbell Shoulder Press — 3×10</li>
      <li>Lateral Raise — 3×12–15</li>
      <li>Cable Fly — 2×12 · Triceps Pushdown — 3×12</li>
    </ul>
    <h3>يوم Pull (ضهر + خلفي كتف + باي)</h3>
    <ul class="plain">
      <li>Lat Pulldown أو Assisted Pull-up — 3×8–10</li>
      <li>Seated Cable Row — 3×10</li>
      <li>One-arm Dumbbell Row — 3×10 لكل ذراع</li>
      <li>Face Pull — 3×15 (مهم لوضعية الكتف لحد قاعد على لابتوب)</li>
      <li>Biceps Curl — 3×12</li>
    </ul>
    <p class="muted">Push وPull عادةً أقل تحميلًا على الركبة، لكن مفيش تمرين «آمن تمامًا». ثبّت وضع القدم ووقّف أي حركة بتسبب ألم أو عدم ثبات.</p>
    <h3>يوم Legs — مقترح مؤقت لحين مراجعة المختص 🦵</h3>
    <ul class="plain">
      <li><b>إحماء إلزامي:</b> 8–10 دقايق عجلة خفيفة + 2×15 Glute Bridge + 2×15 سكوات جزئي بوزن الجسم (لمدى من غير ألم)</li>
      <li>Leg Press بمدى محدود (متنزلش لعمق يوجع — قف قبل الألم بمرحلة) — 3×10–12</li>
      <li>Romanian Deadlift — 3×10 بوزن ومدى متحكم فيهم</li>
      <li>Leg Curl — 3×12 لو الحركة مريحة ومسموحة في برنامج التأهيل</li>
      <li>Hip Thrust — 3×10</li>
      <li>Hip Adduction/Abduction جهاز — 2×15 (ثبات الحوض بيحمي الركبة في الحراسة)</li>
      <li>Calf Raise — 3×15 · Plank — 3×30 ثانية</li>
      <li>Leg Extension والسكوات العميق: متعملهمش لو بيسببوا أعراض، وقرار رجوعهم يكون مع أخصائي العلاج الطبيعي أو الطبيب</li>
    </ul>
    <div class="note">🦵 <b>قبل اعتماد البرنامج:</b> اعرض التمارين والمدى والأحمال على طبيب عظام أو أخصائي علاج طبيعي رياضي. أوقف التمرين واطلب مراجعة لو ظهر قفل، ورم، خيانة/عدم ثبات، ألم حاد، أو أعراض أسوأ في اليوم التالي. متستخدمش رقم ألم ثابت كتصريح تلقائي للاستمرار.</div>
    <div class="note">📈 القاعدة الذهبية: كل أسبوع حاول تزود التكرارات أو الوزن (Progressive Overload). سجّل أوزانك في الملاحظات.</div>
  </div>

  <div class="card"><h2>🏃 الكارديو والحركة اليومية (نسخة الركبة)</h2>
    <ul class="plain">
      <li><b>بعد تمرين المقاومة:</b> 20 دقيقة مشي أو عجلة بشدة مريحة لو الركبة مستقرة. زوّد الوقت أو الميل تدريجيًا، ومتفترضش إن جهاز بعينه آمن لكل إصابات الغضروف الهلالي.</li>
      <li><b>الكورة (حراسة مرمى):</b> متعتمدش سعرات ثابتة للحرق ومتاكلهاش تاني. الرجوع للحراسة وتغيير الاتجاه محتاج تصريح واضح من الطبيب أو أخصائي التأهيل؛ الـ knee sleeve ممكن يدي راحة لكنه مش ضمان ضد الإصابة.</li>
      <li><b>الحركة اليومية:</b> ابدأ بمتوسط خطواتك الحالي وزوّد تدريجيًا نحو 8,000 لو الركبة متحملة؛ ده هدف سلوكي مش رقم طبي إلزامي.</li>
      <li><b>قاعدة المكتب:</b> كل ساعة شغل → قوم اتمشى 3–5 دقايق، وده كمان بيريّح الركبة من التنية الطويلة اللي بتوجعك. اضبط منبّه.</li>
      <li>أجّل الجري والقفز وتغيير الاتجاه لحد ما المختص يحدد معايير الرجوع المناسبة.</li>
    </ul>
  </div>

  <div class="card"><h2>📅 جدول الـ PPL (دورة دوّارة مش أيام ثابتة)</h2>
    <p class="muted" style="margin-bottom:8px">النمطين بتوعك الاتنين صح — كمّل الدورة من حيث ما وقفت، مش مهم اسم اليوم:</p>
    <table>
      <tr><th>النمط</th><th>الدورة</th></tr>
      <tr><td>نمط 1</td><td>Push → Pull → Legs → راحة → (من الأول)</td></tr>
      <tr><td>نمط 2</td><td>Push → Pull → راحة → Legs → راحة → (من الأول)</td></tr>
    </table>
    <ul class="plain" style="margin-top:10px">
      <li>سيب يوم تعافٍ على الأقل بين Legs والكورة كبداية، وعدّل المدة حسب أعراض اليوم التالي وتوجيه المختص.</li>
      <li>يوم الكورة = يوم كارديو، مش بيتحسب راحة كاملة — لو حاسس بإرهاق بعدها خد اليوم اللي بعده راحة.</li>
      <li>الكارديو (عجلة 20–25 دقيقة): بعد Push وPull. بعد Legs اختياري وخفيف (10–15 دقيقة عجلة مفصلية).</li>
      <li>أربع حصص مقاومة أسبوعيًا كفاية للحفاظ على العضلات؛ قرب من الفشل بشكل متحكم فيه من غير ما تضحي بالتكنيك أو تعافي الركبة.</li>
    </ul>
  </div>

  <div class="card"><h2>⏰ نظام المواعيد المرنة (لإن أكلك مش منتظم)</h2>
    <ul class="plain">
      <li>مواعيد الوجبات مرنة. وزّع البروتين على 3–5 وجبات، وخلي وجبة فيها بروتين وكربوهيدرات خلال 2–3 ساعات قبل أو بعد التمرين؛ مفيش ضرورة للفطار خلال ساعة أو للبروتين فور انتهاء التمرين.</li>
      <li>اضبط 3 منبهات على الموبايل: "فطار" و"غدا" و"عشا" — الانتظام بيمنع الجوع الشديد اللي بيخلي أي حد يفرط في الأكل.</li>
      <li>يوم شغل ضاغط؟ جهّز اختيار سريع زي زبادي عالي البروتين + فاكهة أو جبنة قريش + عيش. تكرار التونة يوميًا مش ضروري؛ نوّع مصادر البروتين.</li>
      <li>جهّز بروتين الأسبوع مرة واحدة (اشوي 1 كيلو فراخ واقسمه) — الأكل الجاهز في التلاجة = التزام أسهل.</li>
    </ul>
  </div>

  <div class="card"><h2>🛢️ ملف الزيت (أكبر سعرات مخفية عندك)</h2>
    <ul class="plain">
      <li>كل ملعقة كبيرة زيت = <b>~120 سعر</b> — لو البيت بيطبخ بـ 3–4 ملاعق غير محسوبة، ده ممكن يبقى 400+ سعر بيأكلوا العجز بتاعك من غير ما تحس.</li>
      <li>متسجلش «بخة» برقم ثابت لأن البخاخات مختلفة. زن العبوة قبل وبعد الاستخدام أو قِس الزيت بالجرام؛ كل جرام دهون ≈ 9 سعرات.</li>
      <li>الزيت المذكور بالجرام داخل كل وجبة محسوب بالفعل؛ سجّل أي كمية إضافية فقط.</li>
      <li>لو أكلت أكل بيتي متطبخ بزيت كتير: علّم على "ملعقة زيت فوق المحسوب" في الإضافات — الصدق مع نفسك في التسجيل أهم حاجة في الدايت كله.</li>
      <li>اختار غالبًا زيوت غنية بالدهون غير المشبعة، مع ضبط الكمية؛ مفيش زيت يلغي أهمية إجمالي النظام.</li>
    </ul>
  </div>

  <div class="card"><h2>🍯 دليل العسل ومنتجات النحل</h2>
    <ul class="plain">
      <li><b>العسل (أي نوع):</b> سكر مضاف؛ مفيش توقيت له ميزة خاصة. لو بتحبه، زنه وسجله ضمن السعرات.</li>
      <li><b>زيت الزيتون البكر:</b> اختيار مناسب للدهون غير المشبعة، لكنه يظل عالي السعرات ويتوزن.</li>
      <li><b>مكسرات بالعسل:</b> ممكن تدخل النظام بكمية موزونة؛ تجنب وصف أطعمة بأنها ممنوعة أو مكافأة.</li>
      <li><b>شمع بالعسل:</b> الشمع مبيتهضمش — احسب العسل اللي فيه بس، قطعة صغيرة أحيانًا عادي.</li>
      <li><b>حبوب اللقاح وطلع النخيل:</b> مفيش سبب غذائي لإضافتهم؛ الأدلة محدودة وقد يسببوا تفاعل حساسية.</li>
      <li><b>أشواجندا:</b> مش جزء روتيني من الخطة. فايدتها للنوم محدودة وقد تتداخل مع أدوية الضغط والغدة وتوجد تقارير نادرة عن إصابة الكبد؛ استخدمها فقط بعد مراجعة طبيب أو صيدلي.</li>
    </ul>
  </div>

  <div class="card"><h2>💊 المكملات — اختيارية وليست بديلًا للأكل</h2>
    <ul class="plain">
      <li><b>كرياتين مونوهيدرات:</b> لو طبيبك مأكد عدم وجود مانع كلوي أو دوائي، 3–5 جم يوميًا من منتج مختبر من جهة مستقلة؛ التحميل مش ضروري. ممكن يزيد الوزن 1–2 كجم بسبب مياه داخل العضلات.</li>
      <li><b>واي بروتين:</b> مجرد طريقة مريحة لإكمال هدف البروتين. استخدمه عند الحاجة فقط، ومفيش ضرورة لتناوله فور التمرين.</li>
      <li><b>فيتامين D:</b> متاخدش جرعة علاجية تلقائيًا. القرار والجرعة حسب التقييم الغذائي والطبي والتحليل عند طلب الطبيب.</li>
      <li><b>أوميجا 3:</b> ابدأ بسمك دهني مرتين أسبوعيًا إن أمكن. المكمل والجرعة يتراجعوا مع طبيب/صيدلي خصوصًا مع مميعات الدم؛ مفيش مبرر تلقائي لمضاعفة الجرعة «للمفاصل».</li>
      <li>تجنب fat burners وdetox وخلطات المكملات. العلامة التجارية والسعر مش ضمان؛ اختار اختبار طرف ثالث وراجع المكونات والجرعة.</li>
    </ul>
  </div>

  <div class="card"><h2>📏 قواعد القياس الصح</h2>
    <ul class="plain">
      <li><b>الوزن:</b> يوميًا الصبح على الريق بعد الحمام، وقارن متوسط الأسبوع بمتوسط الأسبوع اللي قبله.</li>
      <li><b>InBody/BIA:</b> لو هتستخدمه، كرر القياس كل 4 أسابيع بنفس الجهاز ونفس ظروف السوائل والأكل والتمرين. اعتبره اتجاه تقريبي، مش قياسًا دقيقًا لنسبة الدهون.</li>
      <li><b>صور:</b> صورة أمامية وجانبية كل أسبوعين بنفس الإضاءة والمكان.</li>
      <li><b>مقاس الوسط:</b> مرة أسبوعيًا عند السرة بنفس طريقة القياس؛ استخدمه مع الوزن والصور والأداء بدل الاعتماد على مؤشر واحد.</li>
    </ul>
  </div>

  <div class="card"><h2>😴 قواعد عامة</h2>
    <ul class="plain">
      <li><b>النوم:</b> استهدف 7–9 ساعات وثبّت وقت النوم والصحيان قدر الإمكان. لو ليلة النوم سيئة، خفف الحمل حسب تركيزك وأدائك بدل قاعدة رقمية ثابتة.</li>
      <li><b>الضغط المنخفض:</b> سجّل الضغط والأعراض. اوقف التمرين واجلس أو استلقِ لو حصل دوار أو زغللة أو غثيان؛ اطلب مساعدة عاجلة مع إغماء، ارتباك، ألم صدر، ضيق نفس، أو نبض سريع/غير منتظم.</li>
      <li>عدّل السعرات فقط بعد متوسط 3 أسابيع، مش أسبوعين، عشان تغيرات المياه متخدعكش.</li>
      <li>Diet break اختياري للراحة والالتزام، مش مطلوب «لإصلاح الهرمونات». لو استخدمته يكون قرب سعرات الصيانة الحالية المحسوبة وقتها، مش رقم 2,700 ثابت.</li>
      <li>خروجة أو عزومة؟ عادي مرة في الأسبوع — قلل باقي اليوم وارجع للنظام تاني يوم. الالتزام 90% أهم من الكمال.</li>
    </ul>
  </div>

  <div class="card"><h2>📱 تشغيله على الآيفون</h2>
    <ul class="plain">
      <li><b>الطريقة المضمونة (محلية 100%):</b> نزّل تطبيق مجاني اسمه <b>Documents by Readdle</b> من الآب ستور → ابعت ملف Diet-Tracker.html لموبايلك بـ AirDrop (أو iCloud Drive) → افتحه من جوة Documents. المتصفح المدمج فيه بيشغّل التطبيق كامل وبيحفظ بياناتك.</li>
      <li><b>ليه مش Files العادي؟</b> معاينة الملفات في iOS بتعرض الشكل بس من غير ما تشغّل الكود — يعني مش هيسجّل.</li>
      <li><b>طريقة بديلة (شكل تطبيق حقيقي):</b> ارفع الملف على netlify.com (سحب وإفلات، مجاني) → افتح اللينك في Safari → زرار المشاركة → <b>Add to Home Screen</b> — هيبقى أيقونة على شاشتك الرئيسية.</li>
    </ul>
  </div>`;
}

function renderProg(){
  const g=T(); const gw=g.gw;
  const ws=weightSeries();
  const last = ws.length? ws[ws.length-1] : {date:today(), w:g.sw};
  const bmiNow=g.ht?last.w/(g.ht/100)**2:null;
  const bmiGoal=g.ht?gw/(g.ht/100)**2:null;
  const proj = project(last.w, last.date);
  const lost = ws.length>=2 ? (ws[0].w - last.w) : 0;
  const goalDate = proj.length? proj[proj.length-1].date : "—";
  const {lo:rateLo,hi:rateHi}=rateBand(last.w);
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
