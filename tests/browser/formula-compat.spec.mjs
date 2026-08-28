import { expect, test } from "@playwright/test";
import { routePinnedRuntimeResources } from "./runtime-resources.mjs";

const AUTH_READY_TIMEOUT=30000;
test.setTimeout(60000);

async function setup(page){
  await expect(page.locator("#setup")).toBeVisible({timeout:AUTH_READY_TIMEOUT});
  await expect(page.locator("#health-gate")).toHaveCount(0);
  await page.locator("#su-name").fill("اختبار الحساب");
  await page.locator("#su-sex").selectOption("m");
  await page.locator("#su-age").fill("35");
  await page.locator("#su-ht").fill("170");
  await page.locator("#su-w").fill("85");
  await page.locator("#su-gw").fill("75");
  await page.locator("#su-act").selectOption("1.55");
  await page.locator("#su-save").click();
  await expect(page.locator("#app")).toBeVisible();
}
test.beforeEach(async({page})=>{ await routePinnedRuntimeResources(page); const errors=[]; page.on("console",message=>{if(message.type()==="error")errors.push(message.text());}); page.on("pageerror",error=>errors.push(error.message)); page.__consoleErrors=errors; await page.goto("/?test=1"); });
test.afterEach(async({page})=>expect(page.__consoleErrors).toEqual([]));

test("signed-in users start directly at setup",async({page},testInfo)=>{
  await expect(page.locator("#setup")).toBeVisible({timeout:AUTH_READY_TIMEOUT});
  await expect(page.locator("#health-gate")).toHaveCount(0);
  if(process.env.CAPTURE_GATE_REMOVAL) await page.screenshot({path:`docs/screenshots/remove-health-gate-after-${testInfo.project.name}.png`,fullPage:true});
});

test("legacy notice fields are scrubbed from IndexedDB, imports, and remote state",async({page})=>{
  await setup(page);
  await page.evaluate(async()=>{
    const uid=window.firebaseBridge.currentUser().uid,legacy=JSON.parse(JSON.stringify(S));
    legacy.settings.healthNoticeVersion=1;
    legacy.settings.healthNoticeAcceptedAt="2026-08-25T00:00:00.000Z";
    await writeStateRecord(uid,legacy);
    await flushStateWrites(uid);
  });
  await page.reload();
  await expect(page.locator("#app")).toBeVisible();
  let values=await page.evaluate(async()=>{
    await window.__dietTest.flushStorage();
    const stored=await readStateRecord(window.firebaseBridge.currentUser().uid);
    return {state:S.settings,stored:stored.settings};
  });
  for(const settings of [values.state,values.stored]){
    expect(settings.healthNoticeVersion).toBeUndefined();
    expect(settings.healthNoticeAcceptedAt).toBeUndefined();
  }

  const imported=await page.evaluate(()=>{
    const copy=JSON.parse(JSON.stringify(S));
    copy.settings.healthNoticeVersion=1;
    copy.settings.healthNoticeAcceptedAt="2026-08-25T00:00:00.000Z";
    return copy;
  });
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#imp").setInputFiles({name:"legacy-notice.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(imported))});
  await expect(page.locator("#app")).toBeVisible();
  values=await page.evaluate(async()=>{
    const stored=await readStateRecord(window.firebaseBridge.currentUser().uid);
    return {state:S.settings,stored:stored.settings};
  });
  for(const settings of [values.state,values.stored]){
    expect(settings.healthNoticeVersion).toBeUndefined();
    expect(settings.healthNoticeAcceptedAt).toBeUndefined();
  }

  const remote=await page.evaluate(()=>{
    const settings={...S.settings,name:"نسخة سحابية قديمة",_ts:(S.settings._ts||0)+1,healthNoticeVersion:1,healthNoticeAcceptedAt:"2026-08-25T00:00:00.000Z"};
    const accepted=mergeRemote({days:S.days,settings,foods:S.foods,calref:S.calref,updated:Date.now()});
    return {accepted,settings:S.settings};
  });
  expect(remote.accepted).toBe(true);
  expect(remote.settings.name).toBe("نسخة سحابية قديمة");
  expect(remote.settings.healthNoticeVersion).toBeUndefined();
  expect(remote.settings.healthNoticeAcceptedAt).toBeUndefined();
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#health-gate")).toHaveCount(0);
});

test("new setup records formula version and legacy users can keep or apply using basis weight",async({page},testInfo)=>{
  await setup(page);
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
  await setup(page);
  await page.evaluate(()=>{window.__dietTest.setState({days:{[today()]:{weight:300}},settings:{name:"حد عالي",sex:"m",age:18,ht:230,act:1.725,sw:300,gw:100,tw:100,klo:2000,khi:2100,plo:100,phi:120},foods:{},calref:{}});renderFormulaReview();});
  await expect(page.locator("#formula-note")).toBeVisible();
  await expect(page.locator("#formula-note").getByRole("button",{name:"تطبيق الحساب الجديد"})).toHaveCount(0);
  await page.locator("#tab-prog").click(); await expect(page.locator("#stale-note")).toHaveCount(0);
});

test("imported and remote legacy formula states require review without overwriting manual targets",async({page})=>{
  await setup(page);
  const legacy=await page.evaluate(()=>{const copy=JSON.parse(JSON.stringify(S));delete copy.settings.targetFormulaVersion;copy.settings.klo=1666;copy.settings.khi=1777;return copy;});
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#imp").setInputFiles({name:"legacy-formula.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(legacy))});
  await expect(page.locator("#formula-note")).toBeVisible(); expect(await page.evaluate(()=>S.settings.klo)).toBe(1666);
  await page.locator("#formula-note").getByRole("button",{name:"الاحتفاظ بأهدافي"}).click();
  await page.evaluate(()=>{const settings={...S.settings,klo:1555,khi:1666,_ts:(S.settings._ts||0)+1};delete settings.targetFormulaVersion;mergeRemote({days:S.days,settings,foods:S.foods,calref:S.calref,updated:Date.now()});});
  await expect(page.locator("#formula-note")).toBeVisible(); expect(await page.evaluate(()=>S.settings.klo)).toBe(1555);
});
