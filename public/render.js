"use strict";
/* ================= بناء DOM آمن ================= */
const SVG_NS="http://www.w3.org/2000/svg";
function node(tag,{className="",text="",id="",type="",title=""}={}){
  const out=document.createElement(tag);
  if(className) out.className=className;
  if(id) out.id=id;
  if(type) out.type=type;
  if(title) out.title=title;
  if(text!=="") out.textContent=String(text);
  return out;
}
function add(parent,...children){ children.flat().forEach(child=>{ if(child!==null&&child!==undefined) parent.append(child); }); return parent; }
function setStyle(element,styles){ Object.assign(element.style,styles); return element; }
function card(title){ const out=node("div",{className:"card"}); if(title) add(out,node("h2",{text:title})); return out; }
function muted(text){ return node("p",{className:"muted",text}); }
function button(text,onClick,className="btn"){ const out=node("button",{className,text,type:"button"}); out.addEventListener("click",onClick); return out; }
function valueBlock(value,label,className=""){
  const out=node("div"),v=node("div",{className:"v"+(className?" "+className:""),text:value}),l=node("div",{className:"l",text:label});
  return add(out,v,l);
}
function macroNode(food,warn=false,caloriesOnly=false){
  const values=macroValues(food),out=node("span",{className:"kp"});
  add(out,node("b",{text:values.k+" سعر"}));
  if(!caloriesOnly){
    out.append(document.createTextNode(" · "));
    add(out,node("span",{className:"kp-full",text:"بروتين "+values.p+" · دهون "+values.f+" · كارب "+values.c}));
    add(out,node("span",{className:"kp-mini",text:"ب"+values.p+" · د"+values.f+" · ك"+values.c}));
  }
  if(warn&&macroMismatch(food)) add(out,node("span",{className:"macro-warn",text:"⚠️ السعرات والماكروز مش متوافقة — راجع الملصق"}));
  return out;
}
function optionRow(title,{selected=false,onPick=null,onDelete=null,food=null,caloriesOnly=false,legacy=false}={}){
  const out=node("div",{className:"opt"+(selected?" sel":"")});
  if(!onPick) out.style.cursor="default";
  const prefix=onPick?(selected?"✅ ":"⬜ "):"";
  add(out,node("span",{text:prefix+(legacy?"⚠️ اختيار محفوظ قديم — ":"")+title+(legacy?" — اضغط لإلغاء الاختيار":"")}));
  if(food) add(out,macroNode(food,!!onDelete,caloriesOnly));
  if(onPick) out.addEventListener("click",onPick);
  if(onDelete){
    const del=node("button",{className:"row-delete",text:"✖",type:"button",title:"حذف"});
    del.addEventListener("click",event=>{ event.stopPropagation(); onDelete(); });
    add(out,del);
  }
  return out;
}
function dataList(id,items){
  const list=node("datalist",{id});
  items.forEach(value=>{ const option=node("option"); option.value=value; list.append(option); });
  return list;
}
function makeInput({id="",type="text",value="",placeholder="",list="",maxLength=null,width="",step=""}={}){
  const input=node("input",{id,type});
  input.value=value===undefined||value===null?"":String(value);
  if(placeholder) input.placeholder=placeholder;
  if(list) input.setAttribute("list",list);
  if(maxLength!==null) input.maxLength=maxLength;
  if(width) input.style.width=width;
  if(step) input.step=step;
  return input;
}

/* ================= تبويبات ================= */
let curTab="day";
function showTab(t){
  curTab=t;
  ["day","prog","examples","cal"].forEach(x=>{
    document.getElementById("pg-"+x).style.display=x===t?"":"none";
    document.getElementById("tab-"+x).classList.toggle("on",x===t);
  });
  if(t==="prog") renderProg();
  if(t==="examples") renderExamples();
  if(t==="cal") renderCalRef();
}
function renderAppVersion(){ const el=document.getElementById("app-version"); if(el) el.textContent="v"+APP_VERSION; }

/* ================= أمثلة أيام عامة ================= */
function renderExamples(){
  const root=document.getElementById("pg-examples"),fragment=document.createDocumentFragment();
  const intro=card("🍽️ أمثلة أيام قريبة من أهدافك");
  add(intro,muted("دي أمثلة تقريبية من الاختيارات الأساسية المدمجة، مش روشتة ولا ضمان إنها مناسبة ليك. راجع الكميات والملصقات وعدّل يومك حسب احتياجك."));
  fragment.append(intro);
  const examples=rankedExampleDays(T());
  examples.forEach((example,index)=>{
    const out=card("مثال "+(index+1)); out.classList.add("example-day"); out.dataset.signature=example.signature;
    const summary=node("div",{className:"summary"}),total=example.total;
    add(summary,valueBlock(total.k,"سعر"),valueBlock(total.p+" جم","بروتين"),valueBlock(total.f+" جم","دهون"),valueBlock(total.c+" جم","كارب"));
    const list=node("ol");
    example.picks.forEach(pick=>{
      const item=node("li"),heading=node("b",{text:MEALS[pick.key].name});
      add(item,heading,document.createTextNode(": "+MEALS[pick.key].opts[pick.index].t)); list.append(item);
    });
    add(out,summary,list); fragment.append(out);
  });
  if(!examples.length){ const out=card(); add(out,muted("راجع أهداف السعرات والبروتين عشان نعرض الأمثلة.")); fragment.append(out); }
  root.replaceChildren(fragment);
}

/* ================= صفحة اليوم ================= */
function setDay(v){ cur=validDayKey(v)?v:today(); renderDay(); }
function shiftDay(n){ const d=new Date(cur+"T12:00:00"); d.setDate(d.getDate()+n); setDay(d.toISOString().slice(0,10)); }
function renderDay(){
  renderAppVersion(); document.getElementById("dpick").value=cur;
  const d=day(),meals=document.createDocumentFragment();
  for(const key in MEALS){
    const meal=MEALS[key];
    if(meal.legacyOnly){
      const selected=d[key],food=Number.isInteger(selected)?meal.opts[selected]:null;
      if(food) meals.append(optionRow(food.t,{selected:true,legacy:true,food,onPick:()=>pick(key,selected)}));
      continue;
    }
    meals.append(node("h3",{text:meal.name}));
    if(meal.dayNote) meals.append(setStyle(muted(meal.dayNote),{margin:"-4px 0 8px"}));
    meal.opts.forEach((food,index)=>{
      const selected=d[key]===index;
      if(food.legacyOnly&&!selected) return;
      meals.append(optionRow(food.t,{selected,legacy:food.legacyOnly,food,onPick:()=>pick(key,index)}));
    });
    ((S.foods&&S.foods[key])||[]).forEach((food,index)=>{
      if(!food) return;
      const selected=d[key]==="c"+index;
      meals.append(optionRow(food.t,{selected,food,onPick:()=>pick(key,"c"+index),onDelete:()=>delFood(key,index)}));
    });
    meals.append(addOpen===key?addForm(()=>saveFood(key),"اكتب الأكل... مثال: ٢ بيضة مسلوقة + رغيف بلدي"):optionRow("➕ أضف أكلة",{onPick:()=>openAdd(key)}));
  }
  document.getElementById("meals-box").replaceChildren(meals);
  const extras=document.createDocumentFragment(),selectedExtras=d.extras||[];
  EXTRAS.forEach((food,index)=>extras.append(optionRow(food.t,{selected:selectedExtras.includes(index),food,caloriesOnly:true,onPick:()=>pickExtra(index)})));
  ((S.foods&&S.foods.extras)||[]).forEach((food,index)=>{
    if(!food) return;
    extras.append(optionRow(food.t,{selected:selectedExtras.includes("c"+index),food,caloriesOnly:true,onPick:()=>pickExtra("c"+index),onDelete:()=>delExtra(index)}));
  });
  extras.append(addOpen==="extras"?addForm(saveExtra,"اكتب الإضافة... مثال: ٢ تمرة + ١٠ جم لوز"):optionRow("➕ أضف إضافة",{onPick:()=>openAdd("extras")}));
  document.getElementById("extras-box").replaceChildren(extras);
  document.getElementById("water-val").textContent=(d.water||0)+" كوب مسجّل";
  const workouts=document.createDocumentFragment();
  WORKOUTS.forEach(workout=>{
    const chip=node("button",{className:"chip"+(d.workout===workout?" sel":""),text:workout,type:"button"});
    chip.addEventListener("click",()=>pickWorkout(workout)); workouts.append(chip);
  });
  document.getElementById("workout-chips").replaceChildren(workouts);
  ["steps","cardio","weight","sleep","notes"].forEach(field=>{ document.getElementById(field).value=d[field]??""; });
  renderSummary();
}
function pick(key,selection){
  commitMutation(candidate=>{ const d=ensureDay(candidate); d[key]=d[key]===selection?null:selection; },{touchDay:cur}); renderDay();
}
let addOpen=null,draft={};
function openAdd(key){ addOpen=key; draft={}; renderDay(); }
function closeAdd(){ addOpen=null; draft={}; renderDay(); }
function fillFood(text){
  const food=foodByName((text||"").trim()); if(!food) return;
  ["k","p","f","c"].forEach(key=>{ draft[key]=food[key]||0; const input=document.getElementById("af-"+key); if(input) input.value=draft[key]; });
}
function numberDraftInput(key,width){
  const input=makeInput({id:"af-"+key,type:"number",value:draft[key]??"",width});
  input.addEventListener("input",()=>{ draft[key]=input.value; }); return input;
}
function addForm(saveAction,placeholder){
  const out=optionRow(""); out.replaceChildren(); out.style.display="block"; out.style.cursor="default";
  add(out,dataList("fd-names",foodNames().map(food=>food.t)));
  const name=makeInput({value:draft.t||"",placeholder,list:"fd-names",maxLength:160}); name.style.width="100%";
  name.addEventListener("input",()=>{ draft.t=name.value; fillFood(name.value); }); add(out,name);
  const macros=node("div",{className:"row"}); macros.style.marginTop="8px";
  [["k","سعرات","72px"],["p","بروتين","62px"],["f","دهون","62px"],["c","كارب","62px"]].forEach(([key,label,width])=>add(macros,node("label",{className:"muted",text:label}),numberDraftInput(key,width)));
  const actions=node("div",{className:"row"}); actions.style.marginTop="8px";
  if(aiOn()) add(actions,button("🤖 احسب السعرات",event=>aiFill(event.currentTarget),"btn ghost"));
  add(actions,button("حفظ",saveAction),button("إلغاء",closeAdd,"chip"));
  const defaultStatus=aiOn()?"⚠️ تقدير AI تقريبي؛ اكتب الكمية وأكده من الملصق أو وصفة موزونة.":"اكتب السعرات والماكروز من الملصق أو وصفة موزونة.";
  const status=setStyle(muted(draft.st||defaultStatus),{marginTop:"6px"}); status.id="af-status";
  return add(out,macros,actions,status);
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
  try{
    if(!raw||typeof raw!=="object"||Array.isArray(raw)) return {ok:false,reason:"shape"};
    const proto=Object.getPrototypeOf(raw),constructorDescriptor=proto&&Object.getOwnPropertyDescriptor(proto,"constructor"),plainProto=proto===null||proto===Object.prototype||(Object.getPrototypeOf(proto)===null&&constructorDescriptor&&Object.prototype.hasOwnProperty.call(constructorDescriptor,"value")&&typeof constructorDescriptor.value==="function"&&constructorDescriptor.value.name==="Object"),keys=Reflect.ownKeys(raw);
    if(!plainProto||keys.length!==4||keys.some(key=>{
      if(typeof key!=="string"||!["k","p","f","c"].includes(key)) return true;
      const descriptor=Object.getOwnPropertyDescriptor(raw,key);
      return !descriptor||!descriptor.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,"value");
    })) return {ok:false,reason:"shape"};
    const limits={k:[1,5000],p:[0,1250],f:[0,556],c:[0,1250]},value={};
    for(const key of ["k","p","f","c"]){
      const n=raw[key];
      if(typeof n!=="number"||!Number.isFinite(n)||n<limits[key][0]||n>limits[key][1]) return {ok:false,reason:"bounds"};
      value[key]=Math.round(n);
    }
    const macroEnergy=value.p*4+value.f*9+value.c*4;
    if(Math.abs(value.k-macroEnergy)/value.k>0.1) return {ok:false,reason:"macros"};
    return {ok:true,value:Object.freeze(value)};
  }catch(_error){ return {ok:false,reason:"shape"}; }
}
function aiFailKind(error){
  const code=String((error&&error.code)||"").toLowerCase();
  const custom=error&&error.customErrorData&&typeof error.customErrorData==="object"?error.customErrorData:{};
  const status=Number(custom.status??(error&&(error.status??error.httpStatus))),message=String((error&&error.message)||"").toLowerCase();
  if(code==="ai/unauthenticated"||status===401||code.includes("unauthenticated")||message.includes(" 401")) return "auth";
  if(code==="ai/forbidden"||status===403||code.includes("permission-denied")||code.includes("app-check")||message.includes(" 403")) return "forbidden";
  if(status===429||code.includes("resource-exhausted")||code.includes("quota")||message.includes(" 429")) return "quota";
  if((typeof navigator!=="undefined"&&navigator.onLine===false)||code.includes("unavailable")||code.includes("network")||code.includes("fetch")) return "offline";
  return "invalid";
}
function aiDisclosureAccepted(){
  const settings=(S&&S.settings)||{},at=settings.aiDisclosureAcceptedAt;
  return settings.aiDisclosureVersion===AI_DISCLOSURE_VERSION&&typeof at==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at)&&Number.isFinite(Date.parse(at))&&new Date(at).toISOString()===at;
}
function acceptAiDisclosure(){
  if(aiDisclosureAccepted()) return true;
  const accepted=confirm("قبل تقدير AI:\n\n• اللي هيتبعت لـ Google هو وصف الأكل والكمية بس.\n• محتوى الاستخدام في الفئة المجانية ممكن يُستخدم لتحسين منتجات Google.\n• متكتبش اسمك أو أي تفاصيل شخصية أو صحية.\n• الإدخال اليدوي هيفضل متاح.\n\nموافق تستخدم التقدير؟ اختار إلغاء عشان تكمل يدوي.");
  if(!accepted) return false;
  return commitMutation((candidate,now)=>{ candidate.settings={...candidate.settings,aiDisclosureVersion:AI_DISCLOSURE_VERSION,aiDisclosureAcceptedAt:new Date(now).toISOString()}; },{touchSections:["settings"]});
}
async function requestAiEstimate(text){
  if(!aiOn()||!acceptAiDisclosure()) return {ok:false,manual:true};
  try{ const normalized=normalizeAiEstimate(await window.firebaseBridge.estimateFood(text)); return normalized.ok?normalized:{ok:false,copy:AI_FAIL_COPY.invalid}; }
  catch(error){ return {ok:false,copy:AI_FAIL_COPY[aiFailKind(error)]}; }
}
function aiOn(){ return window.AI_ENABLED===true; }
async function aiFill(btn){
  if(!aiOn()){ draft.st="اكتب السعرات والماكروز من الملصق أو وصفة موزونة"; renderDay(); return; }
  const text=(draft.t||"").trim();
  if(!text){ draft.st="اكتب الأكل الأول"; renderDay(); return; }
  btn.disabled=true; const status=document.getElementById("af-status"); if(status) status.textContent="⏳ بحسب...";
  const result=await requestAiEstimate(text);
  if(result.ok){ Object.assign(draft,result.value); draft.st="⚠️ تقدير تقريبي — لازم تراجعه من الملصق أو وصفة موزونة"; }
  else draft.st=result.copy||"اكتب السعرات والماكروز من الملصق أو وصفة موزونة";
  renderDay();
}
function draftFood(label){
  const text=(label||"").trim(); if(!text||charLength(text)>160) return null;
  const limits={k:[1,5000],p:[0,1250],f:[0,556],c:[0,1250]},food={t:text};
  for(const key of ["k","p","f","c"]){ const n=finiteNumber(draft[key],true); if(n===null||n<limits[key][0]||n>limits[key][1]) return null; food[key]=n; }
  return food;
}
function saveFood(key){
  const food=draftFood(draft.t);
  if(!food){ draft.st=(draft.t||"").trim()?"راجع الأربع أرقام وحدودها":"اكتب اسم الأكل الأول"; renderDay(); return; }
  const ok=commitMutation(candidate=>{
    candidate.foods[key]=candidate.foods[key]||[]; candidate.foods[key].push(food);
    ensureDay(candidate)[key]="c"+(candidate.foods[key].length-1);
  },{touchDay:cur,touchSections:["foods"]});
  if(!ok){ draft.st="وصلت للحد الأقصى للأكلات المخصصة."; renderDay(); return; }
  addOpen=null; draft={}; renderDay();
}
function delFood(key,index){
  if(!confirm("تمسح الأكلة دي من قايمتك؟")) return;
  commitMutation((candidate,now)=>{
    candidate.foods[key][index]=null;
    for(const d of Object.values(candidate.days)) if(d[key]==="c"+index){ d[key]=null; d._ts=now; }
  },{touchSections:["foods"]}); renderDay();
}
function saveExtra(){
  const food=draftFood(draft.t);
  if(!food){ draft.st=(draft.t||"").trim()?"راجع الأربع أرقام وحدودها":"اكتب اسم الإضافة الأول"; renderDay(); return; }
  const ok=commitMutation(candidate=>{
    candidate.foods.extras=candidate.foods.extras||[]; candidate.foods.extras.push(food);
    const d=ensureDay(candidate); d.extras=d.extras||[]; d.extras.push("c"+(candidate.foods.extras.length-1));
  },{touchDay:cur,touchSections:["foods"]});
  if(!ok){ draft.st="وصلت لحد الإضافات أو الأكلات المخصصة."; renderDay(); return; }
  addOpen=null; draft={}; renderDay();
}
function delExtra(index){
  if(!confirm("تمسح الإضافة دي من قايمتك؟")) return;
  commitMutation((candidate,now)=>{
    candidate.foods.extras[index]=null;
    for(const d of Object.values(candidate.days)){
      const extras=d.extras||[],filtered=extras.filter(item=>item!=="c"+index);
      if(filtered.length!==extras.length){ d.extras=filtered; d._ts=now; }
    }
  },{touchSections:["foods"]}); renderDay();
}
function pickExtra(selection){
  const ok=commitMutation(candidate=>{
    const d=ensureDay(candidate); d.extras=d.extras||[]; const index=d.extras.indexOf(selection);
    if(index>=0) d.extras.splice(index,1); else d.extras.push(selection);
  },{touchDay:cur});
  if(!ok) alert("الحد الأقصى ٥٠ إضافة مختلفة في اليوم."); renderDay();
}
function pickWorkout(workout){ commitMutation(candidate=>{ const d=ensureDay(candidate); d.workout=d.workout===workout?null:workout; },{touchDay:cur}); renderDay(); }
function water(delta){ commitMutation(candidate=>{ const d=ensureDay(candidate); d.water=Math.min(100,Math.max(0,(d.water||0)+delta)); },{touchDay:cur}); renderDay(); }
function saveField(field,raw){
  const specs={steps:[0,200000,true],cardio:[0,1440,true],weight:[30,300,false],sleep:[0,24,false]};
  let value=raw;
  if(field!=="notes"&&raw!==""){
    const [min,max,integer]=specs[field],n=Number(raw);
    if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n))){ alert("راجع القيمة وحدودها."); renderDay(); return; }
    value=n;
  }
  if(field==="notes"&&charLength(raw)>2000){ alert("الملاحظات حدها الأقصى ٢٠٠٠ حرف."); renderDay(); return; }
  commitMutation(candidate=>{ const d=ensureDay(candidate); if(raw==="") delete d[field]; else d[field]=value; },{touchDay:cur}); renderSummary();
}

function setT(key,raw){
  const value=key==="name"?raw.trim():key==="sex"?raw:Number(raw),limit=TLIMITS[key];
  if(key==="name"&&charLength(value)>40){ alert("الاسم حده الأقصى ٤٠ حرف."); renderProg(); return; }
  if(key==="sex"&&!new Set(["m","f"]).has(value)){ renderProg(); return; }
  if(key==="act"&&!ACTIVITY_VALUES.has(value)){ renderProg(); return; }
  if(limit&&(!Number.isFinite(value)||value<limit[0]||value>limit[1])){ alert(limit[2]); renderProg(); return; }
  if(key==="gw"){
    const g=T(),bmi=value/(g.ht/100)**2;
    if(!Number.isFinite(value)||value<30||value>300||bmi<18.5||bmi>40){ alert("هدف الوزن خارج النطاق الآمن للتطبيق؛ راجع مختص."); renderProg(); return; }
  }
  if(["klo","khi","plo","phi"].includes(key)){
    const next={...T(),[key]:value};
    if(next.klo>next.khi||next.plo>next.phi){ alert("الحد الأدنى لازم ميزيدش عن الحد الأعلى."); renderProg(); return; }
  }
  if(!commitMutation(candidate=>{ candidate.settings[key]=value; },{touchSections:["settings"]})){ alert("راجع القيمة وحدودها."); renderProg(); return; }
  if(key==="name") setWho(); renderProg();
}
function recalcTargets(){
  const g=T(); if(!g.ht){ alert("كمّل بيانات الطول والسن الأول"); return; }
  const weight=basisWeight(weightSeries(),today())||g.sw,target=calcTargets({sex:g.sex,age:g.age,ht:g.ht,w:weight,act:g.act,gw:g.gw});
  if(!validTargets(target)){ alert("احتياجك المقدّر ("+target.klo+"–"+target.khi+" سعر) خارج النطاق اللي التطبيق بيدعمه (1200–6000). حط هدفك يدويًا من الخانات فوق وراجع مختص تغذية."); return; }
  commitMutation(candidate=>Object.assign(candidate.settings,{klo:target.klo,khi:target.khi,plo:target.plo,phi:target.phi,tw:weight}),{touchSections:["settings"]}); renderProg();
}
function keepTargets(){
  const weight=basisWeight(weightSeries(),today()); if(!weight) return;
  commitMutation(candidate=>{ candidate.settings.tw=weight; },{touchSections:["settings"]}); renderProg();
}

function renderSummary(){
  const d=day(),total=totals(d),g=T(),hints=macroHints(g),root=document.getElementById("sumbar");
  const kcalClass=total.k===0?"":total.k<g.klo?"warn":total.k>g.khi?"bad":"good";
  const proteinClass=total.p===0?"":total.p<g.plo?"warn":"good";
  root.replaceChildren(
    valueBlock(total.k,"سعرات (هدف "+g.klo+"–"+g.khi+")",kcalClass),
    valueBlock(total.p+" جم","بروتين (هدف "+g.plo+"–"+g.phi+")",proteinClass),
    valueBlock(total.f+" جم","دهون (~"+hints.flo+"–"+hints.fhi+")"),
    valueBlock(total.c+" جم","كارب (~"+hints.clo+"–"+hints.chi+")"),
    valueBlock(((d.water||0)*0.25).toFixed(2)+" لتر","سوائل مسجّلة (المشروبات والأكل كمان بيتحسبوا)"),
    valueBlock(d.steps??"—","خطوات اليوم"),valueBlock(d.weight?d.weight+" كجم":"—","وزن الصبح")
  );
}

/* ================= مرجع السعرات ================= */
let crDraft={};
function crNumberInput(key,width){
  const input=makeInput({id:"cr-"+key,type:"number",value:crDraft[key]??"",width});
  input.addEventListener("input",()=>{ crDraft[key]=input.value; }); return input;
}
function renderCalRef(){
  const root=document.getElementById("calref-list"),fragment=document.createDocumentFragment();
  CALREF.forEach(group=>{
    fragment.append(node("h3",{text:group.cat}));
    group.items.forEach(food=>fragment.append(optionRow(food.t,{food})));
  });
  fragment.append(node("h3",{text:"➕ إضافاتك"}));
  ((S.calref&&S.calref.items)||[]).forEach((food,index)=>fragment.append(optionRow(food.t,{food,onDelete:()=>delCalRef(index)})));
  const form=optionRow(""); form.replaceChildren(); form.style.display="block"; form.style.cursor="default";
  add(form,dataList("cr-names",crNames()),dataList("cr-qty",qtyNames()));
  const first=node("div",{className:"row"});
  const name=makeInput({value:crDraft.t||"",placeholder:"النوع... مثال: بسبوسة",list:"cr-names",maxLength:40}); name.style.flex="1"; name.style.minWidth="130px";
  const qty=makeInput({value:crDraft.q||"",placeholder:"الكمية... قطعة ١٠٠ جم",list:"cr-qty",maxLength:40,width:"150px"});
  name.addEventListener("input",()=>{ crDraft.t=name.value; }); qty.addEventListener("input",()=>{ crDraft.q=qty.value; }); add(first,name,qty);
  if(aiOn()) add(first,button("🤖 احسب",event=>aiCalRef(event.currentTarget),"btn ghost"));
  const macros=node("div",{className:"row"}); macros.style.marginTop="8px";
  [["k","سعرات","72px"],["p","بروتين","62px"],["f","دهون","62px"],["c","كارب","62px"]].forEach(([key,label,width])=>add(macros,node("label",{className:"muted",text:label}),crNumberInput(key,width)));
  add(macros,button("حفظ يدوي",saveCalRef));
  const defaultStatus=aiOn()?"⚠️ تقدير AI تقريبي؛ أكده من ملصق العبوة أو وصفة موزونة قبل الاعتماد عليه.":"اكتب القيم من ملصق العبوة أو وصفة موزونة.";
  const status=setStyle(muted(crDraft.st||defaultStatus),{marginTop:"6px"}); status.id="cr-status";
  add(form,first,macros,status); fragment.append(form); root.replaceChildren(fragment);
}
async function aiCalRef(btn){
  if(!aiOn()){ crDraft.st="اكتب القيم من ملصق العبوة أو وصفة موزونة"; renderCalRef(); return; }
  const text=(crDraft.t||"").trim(),quantity=(crDraft.q||"").trim();
  if(!text){ crDraft.st="اكتب النوع الأول"; renderCalRef(); return; }
  btn.disabled=true; const status=document.getElementById("cr-status"); if(status) status.textContent="⏳ بحسب...";
  const result=await requestAiEstimate(text+(quantity?" — الكمية: "+quantity:""));
  if(result.ok) crDraft={...crDraft,...result.value,st:"⚠️ تقدير تقريبي — راجعه وبعدها اضغط حفظ يدوي"};
  else crDraft.st=result.copy||"اكتب القيم من ملصق العبوة أو وصفة موزونة";
  renderCalRef();
}
function saveCalRef(){
  const text=(crDraft.t||"").trim(),quantity=(crDraft.q||"").trim();
  if(!text){ crDraft.st="اكتب النوع الأول"; renderCalRef(); return; }
  const normalized=normalizeAiEstimate({k:Number(crDraft.k),p:Number(crDraft.p),f:Number(crDraft.f),c:Number(crDraft.c)});
  if(!normalized.ok){ crDraft.st="راجع الأربع أرقام: السعرات لازم تطابق الماكروز في حدود ١٠٪"; renderCalRef(); return; }
  const title=text+(quantity?" ("+quantity+")":"");
  if(charLength(title)>80){ crDraft.st="اسم العنصر والكمية حدهم الأقصى ٨٠ حرف."; renderCalRef(); return; }
  if(!commitMutation(candidate=>{ candidate.calref.items=candidate.calref.items||[]; candidate.calref.items.push({t:title,...normalized.value}); },{touchSections:["calref"]})){
    crDraft.st="وصلت للحد الأقصى لعناصر دليل السعرات."; renderCalRef(); return;
  }
  crDraft={}; renderCalRef();
}
function delCalRef(index){
  if(!confirm("تمسح العنصر ده من إضافاتك؟")) return;
  commitMutation(candidate=>{ candidate.calref.items.splice(index,1); },{touchSections:["calref"]}); renderCalRef();
}

/* ================= التقدم والرسوم ================= */
function tableNode(headers,rows){
  const table=node("table"),head=node("tr"); headers.forEach(text=>head.append(node("th",{text}))); table.append(head);
  rows.forEach(values=>{ const row=node("tr"); values.forEach(value=>row.append(node("td",{text:value}))); table.append(row); }); return table;
}
function stat(value,label,color=""){ const out=node("div",{className:"stat"}),v=node("div",{className:"v",text:value}); if(color) v.style.color=color; return add(out,v,node("div",{className:"l",text:label})); }
function labeledInput(label,key,value,{type="number",width="90px",step=""}={}){
  const input=makeInput({type,value,width,step}); input.addEventListener("change",()=>setT(key,input.value)); return [node("label",{className:"muted",text:label}),input];
}
function renderProg(){
  const g=T(),gw=g.gw,weights=weightSeries(),last=weights.length?weights[weights.length-1]:{date:today(),w:g.sw};
  const bmiNow=g.ht?last.w/(g.ht/100)**2:null,bmiGoal=g.ht?gw/(g.ht/100)**2:null,projection=project(last.w,last.date);
  const base=Number(g.sw)||(weights[0]||{}).w,lost=weights.length?base-last.w:0,goalDate=projection.length?projection[projection.length-1].date:"—";
  const {lo:rateLo,hi:rateHi}=rateBand(last.w),basis=basisWeight(weights,today()); let stale=null;
  if(g.ht&&basis){
    const at=weight=>calcTargets({sex:g.sex,age:g.age,ht:g.ht,w:weight,act:g.act,gw:g.gw}),reviewWeight=Number(g.tw)||basis,suggestion=at(basis);
    if(targetsMoved(at(reviewWeight),suggestion)&&validTargets(suggestion)) stale={tw:reviewWeight,sug:suggestion};
  }
  const weekly={};
  weights.forEach(point=>{
    const date=new Date(point.date+"T12:00:00"),onejan=new Date(date.getFullYear(),0,1),week=date.getFullYear()+"-W"+String(Math.ceil((((date-onejan)/864e5)+onejan.getDay()+1)/7)).padStart(2,"0");
    (weekly[week]=weekly[week]||[]).push(point.w);
  });
  const weekRows=[]; let previous=null;
  Object.keys(weekly).sort().forEach(week=>{
    const average=weekly[week].reduce((a,b)=>a+b,0)/weekly[week].length,diff=previous===null?"—":(average-previous>=0?"+":"")+(average-previous).toFixed(2)+" كجم";
    weekRows.push([week,average.toFixed(1),diff]); previous=average;
  });
  const down=gw<=g.sw; let milestone=down?Math.floor(g.sw/5)*5:Math.ceil(g.sw/5)*5;
  if(down?milestone>=g.sw:milestone<=g.sw) milestone+=down?-5:5;
  const milestones=[]; for(let value=milestone;down?value>gw:value<gw;value+=down?-5:5) milestones.push(value); milestones.push(gw);
  const milestoneRows=milestones.map(value=>{
    const hit=weights.find(point=>down?point.w<=value:point.w>=value),predicted=projection.find(point=>down?point.w<=value:point.w>=value);
    return [value+" كجم",hit?"✅ "+hit.date:predicted?"~ "+predicted.date:"—"];
  });
  const tracked=Object.keys(S.days).filter(date=>{ const d=S.days[date]; return totals(d).k>0||d.water||d.workout; }).length;
  const root=document.getElementById("pg-prog"),fragment=document.createDocumentFragment();
  if(stale){
    const note=node("div",{className:"note",id:"stale-note"});
    add(note,document.createTextNode("⚖️ متوسط وزنك آخر ١٤ يوم "+basis.toFixed(1)+" كجم، وآخر مراجعة للهدف كانت عند "+stale.tw.toFixed(1)+" كجم. المقترح دلوقتي "),node("b",{text:stale.sug.klo+"–"+stale.sug.khi+" سعر"}),document.createTextNode(" · بروتين "+stale.sug.plo+"–"+stale.sug.phi+" جم، وهدفك الحالي "+g.klo+"–"+g.khi+" سعر."));
    const actions=node("div",{className:"row"}); actions.style.marginTop="8px"; add(actions,button("تطبيق المقترح",recalcTargets),button("الاحتفاظ بالهدف الحالي",keepTargets,"btn ghost")); add(note,actions); fragment.append(note);
  }
  const overview=card(),grid=node("div",{className:"grid2"});
  add(grid,stat(last.w.toFixed(1),"آخر وزن (كجم)"),stat((lost>=0?"−":"+")+Math.abs(lost).toFixed(1),"التغيير من البداية","var(--green)"),stat(Math.abs(last.w-gw).toFixed(1),"فاضل للهدف ("+gw+")","var(--orange)"),stat(goalDate,"الوصول المتوقع")); add(overview,grid);
  if(bmiNow) add(overview,setStyle(muted("BMI الحالي "+bmiNow.toFixed(1)+" · عند الهدف "+bmiGoal.toFixed(1)+". ده مؤشر فحص فقط؛ قيّم الهدف كمان بمقاس الوسط والقوة والحالة الصحية."),{marginTop:"10px"})); fragment.append(overview);
  const chart=card("📈 منحنى الوزن"),chartBox=node("div",{id:"chart-box"}); add(chartBox,drawChart(weights,projection));
  const legend=node("div",{className:"legend"}); add(legend,node("span",{className:"lg-a",text:"وزنك الفعلي"}),node("span",{className:"lg-p",text:"المسار المتوقع (~"+(g.klo+g.khi)/2+" سعر/يوم)"}),node("span",{className:"lg-g",text:"الهدف "+gw+" كجم"}));
  add(chart,chartBox,legend,muted("المسار والتاريخ تقدير رياضي فقط؛ الحرق بيتغير والنتيجة الفعلية تعتمد على متوسط الوزن والتسجيل.")); fragment.append(chart);
  const milestonesCard=card("🚩 المحطات"); add(milestonesCard,tableNode(["الوزن","وصلت / متوقع"],milestoneRows)); fragment.append(milestonesCard);
  const weeklyCard=card("📅 متوسط أسبوعي");
  if(weekRows.length) add(weeklyCard,tableNode(["الأسبوع","المتوسط","التغيير"],weekRows)); else add(weeklyCard,muted("سجّل وزنك يوميًا وهتلاقي المتوسطات هنا."));
  add(weeklyCard,setStyle(muted("الهدف الحالي: "+rateLo+"–"+rateHi+" كجم في الأسبوع بعد أول أسبوعين. بص على متوسط 3 أسابيع لأن المياه ممكن تخفي الاتجاه الحقيقي."),{marginTop:"8px"}),muted("أيام متسجلة: "+tracked+" يوم")); fragment.append(weeklyCard);
  const history=card(),historyTitle=node("h2",{text:"🗓️ سجل الأيام "}); add(historyTitle,node("span",{className:"muted",text:"(دوس على أي يوم يفتحلك)"})); history.append(historyTitle);
  Object.keys(S.days).sort().reverse().forEach(date=>{
    const d=S.days[date],total=totals(d),bits=[];
    if(total.k) bits.push("🍽️ "+total.k+" سعر · "+total.p+" جم"); if(d.weight) bits.push("⚖️ "+d.weight+" كجم"); if(d.workout) bits.push("🏋️ "+d.workout); if(d.water) bits.push("💧 "+(d.water*0.25).toFixed(1)+" ل");
    const row=node("div",{className:"opt"}),dateText=node("span"); add(dateText,document.createTextNode("📅 "),node("b",{text:date})); add(row,dateText,node("span",{className:"kp",text:bits.join(" · ")||"يوم فاضي"})); row.addEventListener("click",()=>goToDay(date)); history.append(row);
  });
  if(!Object.keys(S.days).length) add(history,muted("لسه مفيش أيام متسجلة.")); fragment.append(history);
  fragment.append(settingsCard(g)); root.replaceChildren(fragment);
}
function settingsCard(g){
  const out=card("⚙️ بياناتي وأهدافي"),r1=node("div",{className:"row"});
  const name=makeInput({value:g.name||"",width:"140px",maxLength:40}); name.addEventListener("change",()=>setT("name",name.value)); add(r1,node("label",{className:"muted",text:"الاسم:"}),name,node("label",{className:"muted",text:"النوع:"}));
  const sex=node("select"); [["m","ذكر"],["f","أنثى"]].forEach(([value,label])=>{ const option=node("option",{text:label}); option.value=value; option.selected=g.sex===value; sex.append(option); }); sex.addEventListener("change",()=>setT("sex",sex.value)); add(r1,sex); add(out,r1);
  const r2=node("div",{className:"row"}); r2.style.marginTop="10px"; add(r2,labeledInput("السن:","age",g.age,{width:"70px"}),labeledInput("الطول (سم):","ht",g.ht||"",{width:"80px"}),node("label",{className:"muted",text:"النشاط:"}));
  const act=node("select"); [[1.2,"قليل الحركة"],[1.375,"خفيف (1–3 أيام)"],[1.55,"متوسط (3–5 أيام)"],[1.725,"عالي (6–7 أيام)"]].forEach(([value,label])=>{ const option=node("option",{text:label}); option.value=String(value); option.selected=+g.act===value; act.append(option); }); act.addEventListener("change",()=>setT("act",act.value)); add(r2,act); add(out,r2);
  const r3=node("div",{className:"row"}); r3.style.marginTop="10px"; add(r3,labeledInput("وزن البداية:","sw",g.sw,{step:"0.1"}),labeledInput("الوزن المستهدف:","gw",g.gw,{step:"0.1"})); add(out,r3);
  const r4=node("div",{className:"row"}); r4.style.marginTop="10px"; add(r4,labeledInput("سعرات من:","klo",g.klo),labeledInput("إلى:","khi",g.khi)); add(out,r4);
  const r5=node("div",{className:"row"}); r5.style.marginTop="10px"; add(r5,labeledInput("بروتين من:","plo",g.plo),labeledInput("إلى:","phi",g.phi)); add(out,r5);
  const recalc=button("🔄 احسب تلقائي",recalcTargets,"btn ghost"); recalc.style.marginTop="12px"; add(out,recalc,setStyle(muted("بيحسب السعرات والبروتين من بياناتك وآخر وزن مسجّل — اضغطه لما وزنك أو نشاطك يتغير."),{marginTop:"6px"})); return out;
}
function goToDay(date){ showTab("day"); setDay(date); }
function svgElement(tag,attrs={}){
  const out=document.createElementNS(SVG_NS,tag);
  Object.entries(attrs).forEach(([name,value])=>{
    if(typeof value==="number"&&!Number.isFinite(value)) throw new Error("invalid chart coordinate");
    out.setAttribute(name,String(value));
  });
  return out;
}
function drawChart(weights,projection){
  const gw=T().gw,W=780,H=300,PL=42,PR=12,PT=14,PB=34,all=weights.concat(projection.map(point=>({date:point.date,w:point.w})));
  if(!all.length) return muted("مفيش بيانات لسه.");
  const t0=new Date(all[0].date+"T12:00:00").getTime()-5*864e5,t1=new Date(all[all.length-1].date+"T12:00:00").getTime()+5*864e5;
  const wmin=Math.min(gw,...all.map(point=>point.w))-2,wmax=Math.max(...all.map(point=>point.w))+2;
  const X=time=>PL+(time-t0)/(t1-t0)*(W-PL-PR),Y=weight=>PT+(wmax-weight)/(wmax-wmin)*(H-PT-PB);
  const svg=svgElement("svg",{viewBox:"0 0 "+W+" "+H,xmlns:SVG_NS}); svg.style.minWidth="600px"; svg.style.width="100%";
  for(let weight=Math.ceil(wmin/5)*5;weight<=wmax;weight+=5){
    svg.append(svgElement("line",{x1:PL,y1:Y(weight),x2:W-PR,y2:Y(weight),stroke:"#2a3948","stroke-width":1}));
    const label=svgElement("text",{x:PL-6,y:Y(weight)+4,fill:"#8ba0b5","font-size":11,"text-anchor":"end"}); label.textContent=String(weight); svg.append(label);
  }
  const end=new Date(t1),months=["ينا","فبر","مار","أبر","ماي","يون","يول","أغس","سبت","أكت","نوف","ديس"]; let month=new Date(new Date(t0).getFullYear(),new Date(t0).getMonth()+1,1);
  while(month<end){
    const x=X(month.getTime()); svg.append(svgElement("line",{x1:x,y1:PT,x2:x,y2:H-PB,stroke:"#22303e","stroke-width":1}));
    const label=svgElement("text",{x,y:H-14,fill:"#8ba0b5","font-size":10,"text-anchor":"middle"}); label.textContent=months[month.getMonth()]+" "+String(month.getFullYear()).slice(2); svg.append(label); month=new Date(month.getFullYear(),month.getMonth()+1,1);
  }
  svg.append(svgElement("line",{x1:PL,y1:Y(gw),x2:W-PR,y2:Y(gw),stroke:"#8ba0b5","stroke-width":1.5,"stroke-dasharray":"2,4"}));
  if(weights.length||projection.length){
    const start=weights.length?weights[weights.length-1]:projection[0],coords=[[X(new Date(start.date+"T12:00:00").getTime()),Y(start.w)],...projection.map(point=>[X(new Date(point.date+"T12:00:00").getTime()),Y(point.w)])];
    const path=coords.map((pair,index)=>(index?"L ":"M ")+pair[0]+" "+pair[1]).join(" "); svg.append(svgElement("path",{d:path,fill:"none",stroke:"#fb923c","stroke-width":2,"stroke-dasharray":"6,5",opacity:0.85}));
  }
  if(weights.length){
    const coords=weights.map(point=>[X(new Date(point.date+"T12:00:00").getTime()),Y(point.w)]),path=coords.map((pair,index)=>(index?"L ":"M ")+pair[0]+" "+pair[1]).join(" ");
    svg.append(svgElement("path",{d:path,fill:"none",stroke:"#2dd4bf","stroke-width":2.5}));
    weights.forEach((point,index)=>{ const circle=svgElement("circle",{cx:coords[index][0],cy:coords[index][1],r:3.5,fill:"#2dd4bf"}),title=svgElement("title"); title.textContent=point.date+": "+point.w+" كجم"; circle.append(title); svg.append(circle); });
  }
  return svg;
}
