"use strict";
/* ================= الدخول والمزامنة (Firebase) ================= */
const FB_BUILTIN = {
  config: {
    apiKey: "AIzaSyAWEL19TBqIL9w785_R71JMj698-mwvsfU",
    authDomain: ["diet-tracker-372ca.web.app","5asesny.web.app"].includes(location.hostname) ? location.hostname : "diet-tracker-372ca.firebaseapp.com",
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
let cloudWriteBlocked=false;
let rawCloudState=null;
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
function setSyncSuccess(){
  if(typeof storageWarning!=="undefined"&&storageWarning){ setStorageMessage(); return; }
  if(typeof stateSizeClass!=="undefined"&&stateSizeClass==="warning"){ setSyncStatus("⚠️ بياناتك قربت من حد المزامنة؛ نزّل نسخة احتياطية وقلّل حجمها."); return; }
  if(typeof stateSizeClass!=="undefined"&&stateSizeClass==="oversized"){ setSyncStatus("⚠️ البيانات أكبر من حد المزامنة. التصدير والحذف لسه متاحين."); return; }
  setSyncStatus("☁️ متزامن مع السحابة · آخر تحديث "+new Date().toLocaleTimeString());
}
function cloneCloudRecovery(value,seen=new Set()){
  if(value===null||typeof value==="string"||typeof value==="boolean"||typeof value==="number") return value;
  if(typeof value!=="object"||seen.has(value)) throw new Error("unsafe recovery value");
  seen.add(value);
  const output=Array.isArray(value)?[]:{};
  const descriptors=Object.getOwnPropertyDescriptors(value);
  for(const key of Reflect.ownKeys(descriptors)){
    if(typeof key!=="string"||key==="__proto__") throw new Error("unsafe recovery key");
    const descriptor=descriptors[key];
    if(!Object.prototype.hasOwnProperty.call(descriptor,"value")) throw new Error("unsafe recovery descriptor");
    output[key]=cloneCloudRecovery(descriptor.value,seen);
  }
  seen.delete(value);
  return output;
}
function setCloudRecovery(message,raw=null){
  const wasBlocked=cloudWriteBlocked;
  cloudWriteBlocked=!!message;
  try{ rawCloudState=raw===null?null:cloneCloudRecovery(raw); }
  catch(_error){ rawCloudState=null; }
  const box=document.getElementById("cloud-recovery"),copy=document.getElementById("cloud-recovery-copy");
  const button=document.getElementById("cloud-recovery-export");
  if(copy) copy.textContent=message||"";
  if(button) button.disabled=!rawCloudState;
  if(box) box.style.display=message?"":"none";
  if(wasBlocked&&!cloudWriteBlocked) schedulePush();
}
function exportRawCloud(){
  if(rawCloudState) downloadJson(rawCloudState,"diet-tracker-cloud-recovery-"+today()+".json");
}
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
    await bridge.observeAuth(u=>{ if(u) start(u); else stop(); });
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
  setCloudRecovery("");
  setGate("ok");
}
async function start(u){
  resetSyncContext();
  document.getElementById("login").style.display="none";
  KEY=u.uid;
  S=typeof emptyState==="function"?emptyState():{days:{},settings:{},foods:{},calref:{}};
  FB.ref=u.uid;
  const trackerRef=FB.ref, sync=syncGeneration;
  const loading=load(u.uid);
  const loaded=loading&&typeof loading.then==="function"?await loading:loading;
  if(!syncContextCurrent(sync,u.uid,trackerRef)) return;
  S=loaded;
  window.firebaseBridge.listenTracker(u.uid,doc=>{
    if(!syncContextCurrent(sync,u.uid,trackerRef)) return;
    const safe=!doc.exists||mergeRemote(doc.data);
    if(!FB.active){ FB.active=true; schedulePush(); }
    if(safe) setSyncSuccess();
  }, err=>{
    if(!syncContextCurrent(sync,u.uid,trackerRef)) return;
    const kind=syncFailKind(err&&err.code);
    if(kind==="auth") setGate("auth");
    else if(kind!=="quota") setSyncStatus("⚠️ المزامنة متعطلة مؤقتًا — بياناتك المحلية لسه متاحة.");
  }).then(unsub=>{
    if(syncContextCurrent(sync,u.uid,trackerRef)) FB.unsub=unsub;
    else unsub();
  });
  loadMembership();
  routeSignedIn(u);
}
function setWho(){ const u=window.firebaseBridge&&window.firebaseBridge.currentUser(); document.getElementById("who").textContent=(S&&S.settings&&S.settings.name)||(u&&(u.displayName||u.email))||""; }
let suEdit=false;
function editProfile(){ suEdit=true; showSetup(window.firebaseBridge.currentUser()); }
function routeSignedIn(u){
  if(!u||!S) return;
  if(S.settings&&S.settings.ht) showApp(); else showSetup(u);
}
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
  if(!p){ document.getElementById("su-err").textContent="⚠️ اختار النوع والنشاط، وراجع السن والطول والوزن، وخلي هدف الوزن ضمن BMI من 18.5 إلى 40."; return; }
  const t=calcTargets(p);
  const v=(id,fb)=>parseFloat(document.getElementById(id).value)||fb;
  const custom={klo:v("su-klo",t.klo),khi:v("su-khi",t.khi),plo:v("su-plo",t.plo),phi:v("su-phi",t.phi)};
  if(!validTargets(custom)){
    document.getElementById("su-err").textContent="⚠️ راجع ترتيب ونطاق أهداف السعرات والبروتين.";
    return;
  }
  const saved=commitMutation(candidate=>{
    candidate.settings=Object.assign({},candidate.settings,{
      name:document.getElementById("su-name").value.trim(),
      sex:p.sex,age:p.age,ht:p.ht,act:p.act,sw:p.w,gw:p.gw,tw:p.w,
      klo:custom.klo,khi:custom.khi,plo:custom.plo,phi:custom.phi,targetFormulaVersion:TARGET_FORMULA_VERSION
    });
  },{touchSections:["settings"]});
  if(!saved){ document.getElementById("su-err").textContent="⚠️ راجع البيانات وحدودها."; return; }
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
      document.getElementById("login-status").textContent="⚠️ فشل الدخول. جرّب تاني بعد شوية.";
  });
}
function logout(){ window.firebaseBridge.signOut(); }
async function deleteAllData(){
  if(deletingAll||!FB.ref||!KEY) return;
  if(!confirm("هتمسح كل بيانات المتابعة من الجهاز والسحابة. تحب تكمل؟")) return;
  if(prompt('للتأكيد اكتب كلمة "حذف"')!=="حذف"){ alert("الإلغاء تم — بياناتك زي ما هي."); return; }
  const u=window.firebaseBridge.currentUser(),ref=FB.ref,uid=KEY;
  deletingAll=true;
  const buttons=[document.getElementById("delete-all")].filter(Boolean);
  buttons.forEach(button=>{ button.disabled=true; });
  setSyncStatus("جاري حذف بياناتك…");
  clearTimeout(FB.pushTimer);
  FB.pushTimer=null;
  FB.active=false;
  if(FB.unsub){ FB.unsub(); FB.unsub=null; }
  try{ await window.firebaseBridge.deleteTracker(ref); }
  catch(e){
    deletingAll=false;
    buttons.forEach(button=>{ button.disabled=false; });
    setSyncStatus("⚠️ الحذف ماكملش. بياناتك محفوظة؛ جرّب تاني لما الاتصال يرجع.");
    if(u) start(u);
    return;
  }
  let localFailed=false;
  try{ await deleteStateRecord(uid); }catch(_error){ localFailed=true; }
  for(const key of [legacyKey(uid),migratedKey(uid)]) try{ localStorage.removeItem(key); }catch(_error){ localFailed=true; }
  S=null; KEY=null; FB.ref=null;
  try{ await window.firebaseBridge.signOut(); }catch(_error){ localFailed=true; }
  deletingAll=false;
  document.getElementById("app").style.display="none";
  document.getElementById("setup").style.display="none";
  document.getElementById("login").style.display="";
  alert(localFailed?"اتحذفت بيانات السحابة ومش هترجع تترفع. امسح بيانات الموقع من إعدادات المتصفح عشان تزيل أي نسخة محلية متبقية.":"اتحذفت كل بيانات المتابعة من الجهاز والسحابة ✅");
}
function mergeRemote(remote){
  const normalized=normalizeState(remote,"remote");
  if(!normalized.ok){
    setCloudRecovery("⚠️ نسخة السحابة مش قابلة للعرض بأمان. المزامنة متوقفة عشان بياناتها متتكتبش فوقها؛ تقدر تنزّل نسخة خام أو تحذف كل بياناتك.",remote);
    setSyncStatus("");
    return false;
  }
  if(normalized.sizeClass==="oversized"){
    setCloudRecovery("⚠️ نسخة السحابة أكبر من حد المزامنة الحالي. هي متاحة للقراءة والتصدير والحذف، والكتابة متوقفة لحد ما الحجم يقل.",remote);
  }else setCloudRecovery("");
  const clean=normalized.value,candidate=mutableState();
  let changed=false;
  for(const k in clean.days){
    const r=clean.days[k],l=candidate.days[k];
    if(!l||(r._ts||0)>(l._ts||0)){ candidate.days[k]=r; changed=true; }
  }
  if((clean.settings._ts||0)>((candidate.settings&&candidate.settings._ts)||0)){ candidate.settings=clean.settings; changed=true; }
  if((clean.foods._ts||0)>((candidate.foods&&candidate.foods._ts)||0)){ candidate.foods=clean.foods; changed=true; }
  if((clean.calref._ts||0)>((candidate.calref&&candidate.calref._ts)||0)){ candidate.calref=clean.calref; changed=true; }
  if(changed){
    const merged=normalizeState(candidate,"mutation");
    if(!merged.ok){
      setCloudRecovery("⚠️ نسخة السحابة مش قابلة للدمج بأمان. المزامنة متوقفة؛ تقدر تنزّل نسخة خام أو تحذف كل بياناتك.",remote);
      return false;
    }
    applyNormalizedState(merged,{persist:true,push:false});
    renderFormulaReview(); renderDay();
    if(curTab==="prog") renderProg();
    if(curTab==="examples") renderExamples();
    if(curTab==="cal") renderCalRef();
  }
  // returning user on a fresh device: cloud profile arrived while setup is showing
  if(S.settings&&S.settings.ht&&!suEdit&&document.getElementById("setup").style.display!=="none") showApp();
  return true;
}
function schedulePush(){
  const u=window.firebaseBridge&&window.firebaseBridge.currentUser(), trackerRef=FB.ref, sync=syncGeneration;
  if(deletingAll || !FB.active || !trackerRef || !u) return;
  clearTimeout(FB.pushTimer);
  FB.pushTimer=setTimeout(()=>{
    if(!syncContextCurrent(sync,u.uid,trackerRef)) return;
    // known nonmember/revoked: skip the doomed write (each denial still bills
    // Rules reads); loadMembership's bounded recheck resumes the flush
    if(GATE.state==="pending"||cloudWriteBlocked||(typeof stateSizeClass!=="undefined"&&stateSizeClass==="oversized")) return;
    const checked=typeof normalizeState==="function"?normalizeState(S,"cloud"):{ok:true};
    if(!checked.ok){
      setSyncStatus("⚠️ البيانات أكبر من حد المزامنة أو فيها قيمة محتاجة مراجعة. التصدير والحذف لسه متاحين.");
      return;
    }
    const payload={days:S.days,settings:S.settings,foods:S.foods,calref:S.calref,updated:Date.now()};
    window.firebaseBridge.writeTracker(trackerRef,payload)
      .then(()=>{
        if(!syncContextCurrent(sync,u.uid,trackerRef)) return;
        setGate("ok");
        setSyncSuccess();
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
const recoveryExport=document.getElementById("cloud-recovery-export");
if(recoveryExport&&typeof recoveryExport.addEventListener==="function") recoveryExport.addEventListener("click",exportRawCloud);
const testNormalize=typeof normalizeState==="function"?normalizeState:null;
window.__dietTest={
  calcTargets,validProfile,validTargets,macroMismatch,totals,project,isoWeekYear,formulaReviewDetails,...(testNormalize?{normalizeState:testNormalize}:{}),
  getState:()=>S,
  setState:value=>testNormalize&&applyNormalizedState(testNormalize(value,"test"),{persist:false,push:false}),
  mutate:(change,options)=>typeof commitMutation==="function"&&commitMutation(change,options),
  flushStorage:()=>typeof flushStateWrites==="function"?flushStateWrites():Promise.resolve(false),
  getGate:()=>GATE,setGate
};
initSync();
