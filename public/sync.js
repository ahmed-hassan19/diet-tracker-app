"use strict";
/* ================= الدخول والمزامنة (Firebase) ================= */
const FB_BUILTIN = {
  config: {
    apiKey: "AIzaSyAWEL19TBqIL9w785_R71JMj698-mwvsfU",
    authDomain: location.hostname==="5asesny.web.app" ? "5asesny.web.app" : "diet-tracker-372ca.firebaseapp.com",
    projectId: "diet-tracker-372ca",
    storageBucket: "diet-tracker-372ca.firebasestorage.app",
    messagingSenderId: "142673055934",
    appId: "1:142673055934:web:01206bee5403fbf1b70eef"
  }
};
const APP_CHECK_SITE_KEY = "6Lfp2WctAAAAADMCZ8ro60zlxHQqsv4rZXzmE_g2";
const TEST_MODE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get("test")==="1";
let FB={ref:null, active:false, pushTimer:null, unsub:null};
let deletingAll=false;
let syncGeneration=0;
let membershipGeneration=0;
/* ================= بوابة العضوية (betaMembers) =================
   Tracker cloud writes require an enabled /betaMembers/{uid} doc provisioned by
   the owner in the console. Local use, export, and delete always keep working. */
const GATE_COPY={
  pending:"🔒 تسجيل اليوم على السحابة متوقف مؤقتًا لحين تفعيل حسابك في البرنامج التجريبي. كل حاجة بتسجلها محفوظة على جهازك، والنسخة الاحتياطية والحذف شغالين عادي.",
  auth:"🔑 جلسة الدخول انتهت — سجّل دخولك تاني عشان المزامنة ترجع. بياناتك المحفوظة على جهازك في أمان.",
  quota:"⏳ حصة السحابة خلصت دلوقتي — جرّب بعد شوية. التسجيل على جهازك شغال عادي وهيتزامن لاحقًا."
};
let GATE={state:"ok", enabled:false};
const GATE_RECHECK_MS=300000;
let gateRecheck=null;
function clearGateRecheck(){
  if(gateRecheck!==null){ clearTimeout(gateRecheck); gateRecheck=null; }
}
function scheduleGateRecheck(){
  clearGateRecheck();
  if(!FB.ref||!window.firebaseBridge||!window.firebaseBridge.currentUser()) return;
  gateRecheck=setTimeout(()=>{
    gateRecheck=null;
    loadMembership();
  },GATE_RECHECK_MS);
}
function setGate(state){
  if(state==="pending") scheduleGateRecheck(); else clearGateRecheck();
  const wasPending=GATE.state==="pending";
  GATE={state, enabled:state==="ok"};
  const el=document.getElementById("gate-note");
  if(el){
    el.textContent=GATE_COPY[state]||"";
    el.style.display=state==="ok"?"none":"";
  }
  // membership restored while paused: flush the edits saved locally meanwhile
  if(wasPending&&state==="ok") schedulePush();
}
function syncFailKind(code){
  return code==="permission-denied"?"pending"
    :(code==="unauthenticated"?"auth"
    :(code==="resource-exhausted"?"quota":""));
}
function syncContextCurrent(generation,uid,ref){
  const current=window.firebaseBridge&&window.firebaseBridge.currentUser();
  return generation===syncGeneration&&!!current&&current.uid===uid&&FB.ref===ref;
}
async function loadMembership(){
  const u=window.firebaseBridge&&window.firebaseBridge.currentUser();
  if(!u||!FB.ref) return;
  const trackerRef=FB.ref, sync=syncGeneration, membership=++membershipGeneration;
  try{
    const snap=await window.firebaseBridge.readMembership(u.uid);
    if(!syncContextCurrent(sync,u.uid,trackerRef)||membership!==membershipGeneration) return;
    const enabled=!!(snap.exists&&snap.data&&snap.data.enabled===true);
    setGate(enabled?"ok":"pending");
  }catch(e){
    // can't verify membership → stay quiet; a failed push will classify itself
    if(!syncContextCurrent(sync,u.uid,trackerRef)||membership!==membershipGeneration) return;
    setGate(GATE.state==="pending"?"pending":"ok");
  }
}
function setSyncStatus(s){ const el=document.getElementById("sync-status"); if(el) el.textContent=s; }
function firebaseReady(){
  if(window.firebaseBridge) return Promise.resolve(window.firebaseBridge);
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error("Firebase module did not initialize")),15000);
    window.addEventListener("diet-firebase-ready",()=>{ clearTimeout(timeout); resolve(window.firebaseBridge); },{once:true});
  });
}
async function initSync(){
  try{
    const bridge=await firebaseReady();
    await bridge.observeAuth(u=>{ u?start(u):stop(); });
    if(TEST_MODE&&!bridge.currentUser()) await bridge.signInForTest();
  }catch(e){
    document.getElementById("login").style.display="";
    document.getElementById("login-status").textContent="⚠️ مش قادر أوصل بالسيرفر — اتأكد من النت واعمل تحديث للصفحة.";
  }
}
function resetSyncContext(){
  syncGeneration++;
  membershipGeneration++;
  if(FB.unsub) FB.unsub();
  clearTimeout(FB.pushTimer);
  FB={ref:null, active:false, pushTimer:null, unsub:null};
  setGate("ok");
}
function start(u){
  resetSyncContext();
  document.getElementById("login").style.display="none";
  KEY="diet_tracker_v1_"+u.uid;
  S=load();
  FB.ref=u.uid;
  const trackerRef=FB.ref, sync=syncGeneration;
  window.firebaseBridge.listenTracker(u.uid,doc=>{
    if(!syncContextCurrent(sync,u.uid,trackerRef)) return;
    if(doc.exists){ const r=doc.data; if(r && r.days) mergeRemote(r); }
    if(!FB.active){ FB.active=true; schedulePush(); }
    setSyncStatus("☁️ متزامن مع السحابة · آخر تحديث "+new Date().toLocaleTimeString());
  }, err=>{
    if(!syncContextCurrent(sync,u.uid,trackerRef)) return;
    const kind=syncFailKind(err&&err.code);
    if(kind==="auth") setGate("auth");
    else if(kind!=="quota") setSyncStatus("⚠️ المزامنة متعطلة: "+err.message);
  }).then(unsub=>{
    if(syncContextCurrent(sync,u.uid,trackerRef)) FB.unsub=unsub;
    else unsub();
  });
  loadMembership();
  if(S.settings&&S.settings.ht) showApp(); else showSetup(u);
}
function setWho(){ const u=window.firebaseBridge&&window.firebaseBridge.currentUser(); document.getElementById("who").textContent=(S&&S.settings&&S.settings.name)||(u&&(u.displayName||u.email))||""; }
let suEdit=false;
function editProfile(){ suEdit=true; showSetup(window.firebaseBridge.currentUser()); }
function showApp(){
  suEdit=false;
  document.getElementById("setup").style.display="none";
  document.getElementById("app").style.display="";
  setWho();
  showTab("day");
  setDay(today());
}
function showSetup(u){
  document.getElementById("app").style.display="none";
  document.getElementById("setup").style.display="";
  const s=S.settings||{};
  const set=(id,val)=>{ document.getElementById(id).value=(val===undefined||val===null)?"":val; };
  set("su-name", s.name||u.displayName||"");
  document.getElementById("su-sex").value=s.sex||"";
  set("su-age",s.age); set("su-ht",s.ht);
  set("su-w", s.sw!==undefined?s.sw:(weightSeries().slice(-1)[0]||{}).w);
  set("su-gw",s.gw);
  document.getElementById("su-act").value=s.act||"";
  suCalc();
  ["klo","khi","plo","phi"].forEach(k=>{ if(s[k]!==undefined&&s[k]!==null) document.getElementById("su-"+k).value=s[k]; });
  const editing=!!s.ht;
  document.getElementById("su-back").style.display=editing?"":"none";
  document.getElementById("su-sub").textContent=editing?"عدّل بياناتك وأهدافك":"خطوة واحدة — دخّل بياناتك وهنحسبلك أهدافك";
  document.getElementById("su-w-label").textContent=editing?"وزن البداية (كجم):":"وزنك الحالي (كجم):";
  document.getElementById("su-save").textContent=editing?"حفظ ✅":"ابدأ 🚀";
}
function suRead(){
  const v=id=>parseFloat(document.getElementById(id).value);
  const p={sex:document.getElementById("su-sex").value, age:v("su-age"), ht:v("su-ht"), w:v("su-w"), gw:v("su-gw"), act:parseFloat(document.getElementById("su-act").value)};
  return validProfile(p)?p:null;
}
function suCalc(){
  const p=suRead(); if(!p) return;
  const t=calcTargets(p);
  ["klo","khi","plo","phi"].forEach(k=>{ document.getElementById("su-"+k).value=t[k]; });
  document.getElementById("su-tdee").textContent="السعرات اللي بتثبّت وزنك تقريبًا: ~"+t.tdee+" سعر/يوم";
}
function suSave(){
  const p=suRead();
  if(!p){ document.getElementById("su-err").textContent="⚠️ اختار النوع والنشاط، وراجع السن والطول والوزن، وخلي هدف الوزن ضمن BMI من 18.5 إلى 40 أو راجع مختص."; return; }
  const t=calcTargets(p);
  const v=(id,fb)=>parseFloat(document.getElementById(id).value)||fb;
  const custom={klo:v("su-klo",t.klo),khi:v("su-khi",t.khi),plo:v("su-plo",t.plo),phi:v("su-phi",t.phi)};
  if(!validTargets(custom)){
    document.getElementById("su-err").textContent="⚠️ راجع ترتيب ونطاق أهداف السعرات والبروتين.";
    return;
  }
  S.settings=Object.assign({},S.settings,{
    name:document.getElementById("su-name").value.trim(),
    sex:p.sex, age:p.age, ht:p.ht, act:p.act, sw:p.w, gw:p.gw, tw:p.w,
    klo:custom.klo, khi:custom.khi, plo:custom.plo, phi:custom.phi,
    _ts:Date.now()
  });
  save();
  showApp();
}
function stop(){
  resetSyncContext();
  S=null; KEY=null;
  document.getElementById("app").style.display="none";
  document.getElementById("setup").style.display="none";
  document.getElementById("login").style.display="";
}
function login(){
  window.firebaseBridge.signInGoogle().catch(e=>{
    if(e.code!=="auth/popup-closed-by-user"&&e.code!=="auth/cancelled-popup-request")
      document.getElementById("login-status").textContent="⚠️ فشل الدخول: "+(e.code||e.message);
  });
}
function logout(){ window.firebaseBridge.signOut(); }
async function deleteAllData(){
  if(deletingAll||!FB.ref||!KEY) return;
  if(!confirm("هتمسح كل بيانات المتابعة من الجهاز والسحابة. تحب تكمل؟")) return;
  if(prompt('للتأكيد اكتب كلمة "حذف"')!=="حذف"){ alert("الإلغاء تم — بياناتك زي ما هي."); return; }
  const u=window.firebaseBridge.currentUser(), ref=FB.ref, localKey=KEY;
  deletingAll=true;
  const btn=document.getElementById("delete-all");
  btn.disabled=true;
  setSyncStatus("جاري حذف بياناتك…");
  clearTimeout(FB.pushTimer);
  FB.pushTimer=null;
  FB.active=false;
  if(FB.unsub){ FB.unsub(); FB.unsub=null; }
  try{
    await window.firebaseBridge.deleteTracker(ref);
    localStorage.removeItem(localKey);
    S=null; KEY=null; FB.ref=null;
    await window.firebaseBridge.signOut();
    alert("اتحذفت كل بيانات المتابعة من الجهاز والسحابة ✅");
  }catch(e){
    deletingAll=false;
    btn.disabled=false;
    setSyncStatus("⚠️ الحذف ماكملش. بياناتك محفوظة؛ جرّب تاني لما الاتصال يرجع.");
    if(u) start(u);
  }
}
function mergeRemote(remote){
  let changed=false;
  for(const k in remote.days){
    const r=remote.days[k], l=S.days[k];
    if(!l || (r._ts||0)>(l._ts||0)){ S.days[k]=r; changed=true; }
  }
  if(remote.settings && (remote.settings._ts||0)>((S.settings&&S.settings._ts)||0)){ S.settings=remote.settings; changed=true; }
  if(remote.foods && (remote.foods._ts||0)>((S.foods&&S.foods._ts)||0)){ S.foods=remote.foods; changed=true; }
  if(remote.calref && (remote.calref._ts||0)>((S.calref&&S.calref._ts)||0)){ S.calref=remote.calref; changed=true; }
  if(changed){
    try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){}
    renderDay();
    if(curTab==="prog") renderProg();
    if(curTab==="cal") renderCalRef();
  }
  // returning user on a fresh device: cloud profile arrived while setup is showing
  if(S.settings&&S.settings.ht&&!suEdit&&document.getElementById("setup").style.display!=="none") showApp();
}
function schedulePush(){
  const u=window.firebaseBridge&&window.firebaseBridge.currentUser(), trackerRef=FB.ref, sync=syncGeneration;
  if(deletingAll || !FB.active || !trackerRef || !u) return;
  clearTimeout(FB.pushTimer);
  FB.pushTimer=setTimeout(()=>{
    if(!syncContextCurrent(sync,u.uid,trackerRef)) return;
    // known nonmember/revoked: skip the doomed write (each denial still bills
    // Rules reads); loadMembership's bounded recheck resumes the flush
    if(GATE.state==="pending") return;
    window.firebaseBridge.writeTracker(trackerRef,{days:S.days, settings:S.settings||{}, foods:S.foods||{}, calref:S.calref||{}, updated:Date.now()})
      .then(()=>{
        if(!syncContextCurrent(sync,u.uid,trackerRef)) return;
        setGate("ok");
        setSyncStatus("☁️ متزامن مع السحابة · آخر تحديث "+new Date().toLocaleTimeString());
      })
      .catch(e=>{
        if(!syncContextCurrent(sync,u.uid,trackerRef)) return;
        const kind=syncFailKind(e&&e.code);
        if(!kind){ setSyncStatus("⚠️ هيتزامن أول ما النت يرجع"); return; }
        if(kind==="pending"){
          setSyncStatus("");
          setGate("pending");
          return;
        }
        setSyncStatus("");
        setGate(kind);
      });
  }, 1200);
}

/* ================= تشغيل ================= */
window.__dietTest={calcTargets,validProfile,validTargets,macroMismatch,totals,getState:()=>S,setState:x=>{S=x;},getGate:()=>GATE,setGate};
initSync();
