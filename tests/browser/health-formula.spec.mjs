import { expect, test } from "@playwright/test";

async function acceptNotice(page,selections=[]){
  await expect(page.locator("#health-gate")).toBeVisible();
  for(const value of selections) await page.locator(`#health-options input[value="${value}"]`).check();
  await page.locator("#health-step-1 .btn",{hasText:"التالي"}).click();
  await page.locator("#health-step-2 .btn",{hasText:"قرأت وفهمت"}).click();
}
async function setup(page){
  await page.locator("#su-name").fill("اختبار صحي");
  await page.locator("#su-sex").selectOption("m");
  await page.locator("#su-age").fill("35");
  await page.locator("#su-ht").fill("170");
  await page.locator("#su-w").fill("85");
  await page.locator("#su-gw").fill("75");
  await page.locator("#su-act").selectOption("1.55");
  await page.locator("#su-save").click();
  await expect(page.locator("#app")).toBeVisible();
}
test.beforeEach(async({page})=>{ const errors=[]; page.on("console",message=>{if(message.type()==="error")errors.push(message.text());}); page.on("pageerror",error=>errors.push(error.message)); page.__consoleErrors=errors; await page.goto("/?test=1"); });
test.afterEach(async({page})=>expect(page.__consoleErrors).toEqual([]));

test("health gate combines transient guidance, clears on back, and persists only version and time",async({page},testInfo)=>{
  await expect(page.locator("#health-step-1")).toBeVisible();
  await page.locator('#health-options input[value="pregnant"]').check();
  await page.locator('#health-options input[value="kidney"]').check();
  if(process.env.CAPTURE_A5) await page.screenshot({path:`docs/screenshots/a5-health-step1-${testInfo.project.name}.png`,fullPage:true});
  await page.locator("#health-step-1 .btn",{hasText:"التالي"}).click();
  await expect(page.locator("#health-tailored")).toContainText("الحمل له احتياجات خاصة");
  await expect(page.locator("#health-tailored")).toContainText("مرض الكلى");
  if(process.env.CAPTURE_A5) await page.screenshot({path:`docs/screenshots/a5-health-step2-${testInfo.project.name}.png`,fullPage:true});
  await page.locator("#health-step-2 .btn",{hasText:"رجوع"}).click();
  await expect(page.locator("#health-options input:checked")).toHaveCount(0);
  await page.locator("#health-step-1 .btn",{hasText:"التالي"}).click();
  await page.locator("#health-step-2 .btn",{hasText:"قرأت وفهمت"}).click();
  const settings=await page.evaluate(()=>S.settings);
  expect(settings.healthNoticeVersion).toBe(1);
  expect(settings.healthNoticeAcceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  for(const key of ["pregnant","trying","breastfeeding","eating","kidney","diabetes","clinician","conditions","healthSelections"]) expect(Object.hasOwn(settings,key)).toBe(false);
});

test("refusal retains recovery actions and imported missing acknowledgment reopens the gate",async({page})=>{
  await page.locator("#health-step-1 .btn",{hasText:"مش موافق"}).click();
  await expect(page.locator("#health-refusal")).toBeVisible();
  await expect(page.getByRole("button",{name:/تنزيل نسخة/})).toBeVisible();
  await expect(page.locator("#health-delete-all")).toBeVisible();
  await expect(page.getByRole("button",{name:"خروج"})).toBeVisible();
  await page.locator("#health-refusal .btn",{hasText:"الرجوع"}).click();
  await acceptNotice(page); await setup(page);
  const imported=await page.evaluate(()=>{const copy=JSON.parse(JSON.stringify(S));delete copy.settings.healthNoticeVersion;delete copy.settings.healthNoticeAcceptedAt;return copy;});
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#imp").setInputFiles({name:"legacy.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(imported))});
  await expect(page.locator("#health-gate")).toBeVisible();
});

test("new setup records formula version and legacy users can keep or apply using basis weight",async({page},testInfo)=>{
  await acceptNotice(page); await setup(page);
  expect(await page.evaluate(()=>S.settings.targetFormulaVersion)).toBe(1);
  await page.evaluate(()=>{commitMutation(candidate=>{delete candidate.settings.targetFormulaVersion;candidate.settings.klo=1777;candidate.settings.khi=1888;candidate.settings.tw=85;},{touchSections:["settings"]});renderFormulaReview();});
  const note=page.locator("#formula-note"); await expect(note).toBeVisible(); await expect(note).toContainText("معادلة الأهداف اتراجعت");
  if(process.env.CAPTURE_A5) await page.screenshot({path:`docs/screenshots/a5-formula-before-${testInfo.project.name}.png`,fullPage:true});
  await note.getByRole("button",{name:"الاحتفاظ بأهدافي"}).click();
  let settings=await page.evaluate(()=>S.settings); expect(settings.klo).toBe(1777); expect(settings.khi).toBe(1888); expect(settings.tw).toBe(85); expect(settings.targetFormulaVersion).toBe(1);
  await page.evaluate(()=>{commitMutation(candidate=>{delete candidate.settings.targetFormulaVersion;candidate.settings.klo=1777;candidate.settings.khi=1888;},{touchSections:["settings"]});renderFormulaReview();});
  await note.getByRole("button",{name:"تطبيق الحساب الجديد"}).click();
  settings=await page.evaluate(()=>S.settings); expect(settings.targetFormulaVersion).toBe(1); expect(settings.khi-settings.klo).toBe(100); expect(settings.klo).not.toBe(1777);
  if(process.env.CAPTURE_A5) await page.screenshot({path:`docs/screenshots/a5-formula-after-${testInfo.project.name}.png`,fullPage:true});
});

test("unsupported formula suggestions hide Apply and unresolved review suppresses stale prompt",async({page})=>{
  await acceptNotice(page); await setup(page);
  await page.evaluate(()=>{const accepted={healthNoticeVersion:S.settings.healthNoticeVersion,healthNoticeAcceptedAt:S.settings.healthNoticeAcceptedAt};window.__dietTest.setState({days:{[today()]:{weight:300}},settings:{...accepted,name:"حد عالي",sex:"m",age:18,ht:230,act:1.725,sw:300,gw:100,tw:100,klo:2000,khi:2100,plo:100,phi:120},foods:{},calref:{}});renderFormulaReview();});
  await expect(page.locator("#formula-note")).toBeVisible();
  await expect(page.locator("#formula-note").getByRole("button",{name:"تطبيق الحساب الجديد"})).toHaveCount(0);
  await page.locator("#tab-prog").click(); await expect(page.locator("#stale-note")).toHaveCount(0);
});

test("remote replacement without a current acknowledgment reopens the health gate",async({page})=>{
  await acceptNotice(page); await setup(page);
  await page.evaluate(()=>{const settings={...S.settings,_ts:(S.settings._ts||0)+1};delete settings.healthNoticeVersion;delete settings.healthNoticeAcceptedAt;mergeRemote({days:S.days,settings,foods:S.foods,calref:S.calref,updated:Date.now()});});
  await expect(page.locator("#health-gate")).toBeVisible();
});

test("imported and remote legacy formula states require review without overwriting manual targets",async({page})=>{
  await acceptNotice(page); await setup(page);
  const legacy=await page.evaluate(()=>{const copy=JSON.parse(JSON.stringify(S));delete copy.settings.targetFormulaVersion;copy.settings.klo=1666;copy.settings.khi=1777;return copy;});
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#imp").setInputFiles({name:"legacy-formula.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(legacy))});
  await expect(page.locator("#formula-note")).toBeVisible(); expect(await page.evaluate(()=>S.settings.klo)).toBe(1666);
  await page.locator("#formula-note").getByRole("button",{name:"الاحتفاظ بأهدافي"}).click();
  await page.evaluate(()=>{const settings={...S.settings,klo:1555,khi:1666,_ts:(S.settings._ts||0)+1};delete settings.targetFormulaVersion;mergeRemote({days:S.days,settings,foods:S.foods,calref:S.calref,updated:Date.now()});});
  await expect(page.locator("#formula-note")).toBeVisible(); expect(await page.evaluate(()=>S.settings.klo)).toBe(1555);
});
