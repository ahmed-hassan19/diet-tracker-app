import crypto from "node:crypto";
import fs from "node:fs";

const manifest=JSON.parse(fs.readFileSync(new URL("../../runtime-resources.json",import.meta.url),"utf8"));
const resources=new Map(manifest.resources.map(resource=>[resource.url,resource]));
let bodiesPromise;

async function fetchExact(resource){
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(resource.url,{signal:AbortSignal.timeout(30000)});
      if(!response.ok) throw new Error(`HTTP ${response.status}`);
      const body=Buffer.from(await response.arrayBuffer());
      const sha256=crypto.createHash("sha256").update(body).digest("hex");
      if(body.length!==resource.bytes||sha256!==resource.sha256) throw new Error("manifest mismatch");
      return body;
    }catch(error){ lastError=error; }
  }
  throw new Error(`Could not load pinned browser-test resource ${resource.url}: ${lastError?.message||lastError}`);
}

async function loadBodies(){
  const loaded=new Map();
  for(const resource of resources.values()) loaded.set(resource.url,await fetchExact(resource));
  return loaded;
}

export async function routePinnedRuntimeResources(page){
  bodiesPromise||=loadBodies().catch(error=>{ bodiesPromise=null; throw error; });
  const bodies=await bodiesPromise;
  await page.route("https://www.gstatic.com/firebasejs/12.17.1/**",async route=>{
    const body=bodies.get(route.request().url());
    if(!body) return route.abort("blockedbyclient");
    await route.fulfill({body,contentType:"text/javascript; charset=UTF-8",headers:{"Access-Control-Allow-Origin":"*"}});
  });
}
