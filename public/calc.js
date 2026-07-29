"use strict";
/* Mifflin-St Jeor: p = {sex,age,ht,w,act,gw} */
function calcTargets(p){
  const bmr=10*p.w+6.25*p.ht-5*p.age+(p.sex==="m"?5:-161);
  const tdee=Math.round(bmr*p.act);
  const delta=p.gw<p.w?-Math.min(900,Math.max(300,tdee*0.2)):p.gw>p.w?300:0;
  /* 1250 يخلي الحد الأدنى 1200، نفس الحد اللي بيرفضه التحقق عند الحفظ */
  /* مفيش سقف سعرات هنا: القص لـ6000 كان بيقلب العجز المقصود لعجز أكبر بكتير، والرفض أأمن من رقم غلط */
  const mid=Math.max(1250,Math.round((tdee+delta)/50)*50);
  const proteinWeight=p.gw<p.w?p.gw:p.w;
  const phi=Math.min(300,Math.round(2.2*proteinWeight));
  return {klo:mid-50,khi:mid+50,plo:Math.min(phi,Math.round(2.0*proteinWeight)),phi,tdee};
}
function validProfile(p){
  const goalBmi=p.gw/(p.ht/100)**2;
  return p.age>=18&&p.age<=100 && p.ht>=120&&p.ht<=230 && p.w>=30&&p.w<=300
    && p.gw>=30&&p.gw<=300 && goalBmi>=18.5&&goalBmi<=40;
}
function validTargets(t){
  return t.klo>=1200&&t.khi>=t.klo&&t.khi<=6000&&t.plo>=40&&t.phi>=t.plo&&t.phi<=300;
}
(function(){
  const m=calcTargets({sex:"m",age:30,ht:175,w:90,act:1.55,gw:80});
  console.assert(m.klo===2250&&m.khi===2350&&m.plo===160&&m.phi===176,"calcTargets male cut",m);
  const f=calcTargets({sex:"f",age:30,ht:165,w:70,act:1.375,gw:60});
  console.assert(f.klo===1500&&f.khi===1600&&f.plo===120&&f.phi===132,"calcTargets female cut",f);
  const b=calcTargets({sex:"m",age:25,ht:180,w:60,act:1.55,gw:70});
  console.assert(b.khi-b.klo===100&&(b.klo+b.khi)/2>b.tdee,"calcTargets bulk",b);
  const personal=calcTargets({sex:"m",age:29,ht:186,w:105.5,act:1.55,gw:86});
  console.assert(personal.tdee===3220&&personal.klo===2550&&personal.khi===2650&&personal.plo===172&&personal.phi===189,"calcTargets reviewed profile",personal);
  const small=calcTargets({sex:"f",age:20,ht:150,w:45,act:1.2,gw:40});
  console.assert(small.klo>=1200,"calcTargets never pre-fills below the 1200 floor",small);
  const heavy=calcTargets({sex:"m",age:30,ht:186,w:140,act:1.55,gw:138});
  console.assert(validTargets(heavy),"calcTargets clamps protein instead of emitting an unsaveable target",heavy);
  const huge=calcTargets({sex:"m",age:18,ht:230,w:300,act:1.9,gw:98});
  console.assert(!validTargets(huge)&&huge.khi>6000,"calcTargets rejects rather than clamps energy needs above the supported band",huge);
})();
function macroHints(g){
  const kmid=(g.klo+g.khi)/2, pmid=(g.plo+g.phi)/2;
  const flo=Math.round(kmid*0.25/9);
  const preferredFhi=Math.round(kmid*0.30/9);
  return {flo,fhi:preferredFhi,clo:Math.max(0,Math.round((kmid-pmid*4-preferredFhi*9)/4)),chi:Math.max(0,Math.round((kmid-pmid*4-flo*9)/4))};
}

function macroMismatch(o){
  const macroCalories=(Number(o.p)||0)*4+(Number(o.f)||0)*9+(Number(o.c)||0)*4;
  return Number(o.k)>0 && Math.abs(Number(o.k)-macroCalories)/Number(o.k)>0.10;
}
function macros(o,warn=false){
  const f=o.f||0, c=o.c||0;
  return '<b>'+o.k+' سعر</b> · '
       + '<span class="kp-full">بروتين '+o.p+' · دهون '+f+' · كارب '+c+'</span>'
       + '<span class="kp-mini">ب'+o.p+' · د'+f+' · ك'+c+'</span>'
       + (warn&&macroMismatch(o)?'<span class="macro-warn">⚠️ السعرات والماكروز مش متوافقة — راجع الملصق</span>':'');
}

/* نفس حدود suRead/suSave عشان لوحة التقدم متقبلش قيم بترفضها صفحة الإعداد */
const KMSG="السعرات لازم تكون بين 1200 و6000، وأي هدف شديد الانخفاض يحتاج إشراف طبي.";
const PMSG="راجع هدف البروتين (40–300 جم).";
const TLIMITS={
  klo:[1200,6000,KMSG], khi:[1200,6000,KMSG], plo:[40,300,PMSG], phi:[40,300,PMSG],
  age:[18,100,"التطبيق للبالغين فقط: السن لازم يكون بين 18 و100 سنة."],
  ht:[120,230,"الطول لازم يكون بين 120 و230 سم."],
  sw:[30,300,"الوزن لازم يكون بين 30 و300 كجم."]
};
