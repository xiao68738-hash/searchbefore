// Withdrawal regression: synthetic records/photos only, isolated browser, no cloud writes.
const {createServer}=require('./serve-balcony-preview.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const output=path.resolve(process.env.HOLD_AUDIT_DIR||path.join(require('node:os').tmpdir(),'searchbefore-simple-hold'));
const checks=[];
function check(value,label){assert.ok(value,label);checks.push(label);}
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  for(const width of [320,390,1280])for(const mode of ['simple','standard','complete']){
   const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block'});
   await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
   const page=await context.newPage(),errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
   await page.goto(origin);
   const before=await page.evaluate(async mode=>{
    const records={
     fieldPlots:[{id:'hold_plot',name:'測試蔥',crop:'蔥',location:'合成測試',startDate:'2026-10-24',createdAt:'2026-10-24T00:00:00Z',updatedAt:'2026-10-24T00:00:00Z'}],
     farmRecords:[{id:'hold_care',plotId:'hold_plot',crop:'蔥',kind:'water',date:'2026-10-24',notes:'合成澆水紀錄',createdAt:'2026-10-24T00:00:00Z',updatedAt:'2026-10-24T00:00:00Z'}]
    };
    for(const [k,v] of Object.entries(records))localStorage.setItem(k,JSON.stringify(v));
    localStorage.setItem('pqc.experience-mode.v1',mode);
    const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;
    const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg'));
    const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('pqc-plant-photos-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('photos',{keyPath:'key'});req.onsuccess=()=>resolve(req.result);req.onerror=reject;});
    await new Promise((resolve,reject)=>{const t=db.transaction('photos','readwrite');for(const owner of ['guest','user:fixture_owner'])t.objectStore('photos').put({key:owner+'|hold_plot',blob,bytes:blob.size});t.oncomplete=resolve;t.onerror=reject;});db.close();
    return {records:Object.fromEntries(Object.keys(records).map(k=>[k,localStorage.getItem(k)])),bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};
   },mode);
   await page.reload();
   check(await page.locator('.btn-guest').isVisible(),width+'/'+mode+': login choice retained');
   await page.locator('.btn-guest').click();
   if(await page.locator('#annModal.open').count())await page.locator('#annModal button[onclick="closeAnn()"]').first().click();
   check(await page.locator('#scr-search').isVisible(),width+'/'+mode+': original query opens');
   check(await page.locator('#experienceMode,#balconyHome,#balconyDialog,#balconyReturn').count()===0,width+'/'+mode+': no held UI mounted');
   check(!requests.some(url=>/\/(?:balcony|plant-photos|experience-mode)\.(?:js|css)$/.test(url)),width+'/'+mode+': held modules not loaded');
   await page.locator('#cropSearch').fill('蔥');
   await page.locator('#cropResults button').filter({hasText:/^蔥\d+ 項/}).click();
   check(await page.locator('#pestBlock').isVisible(),width+'/'+mode+': original crop to pest flow works');
   const after=await page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('pqc-plant-photos-v1',1);req.onsuccess=()=>resolve(req.result);req.onerror=reject;});
    const rows=await new Promise((resolve,reject)=>{const t=db.transaction('photos','readonly'),req=t.objectStore('photos').getAll();t.oncomplete=()=>resolve(req.result);t.onerror=reject;});db.close();
    return {mode:localStorage.getItem('pqc.experience-mode.v1'),records:Object.fromEntries(['fieldPlots','farmRecords'].map(k=>[k,localStorage.getItem(k)])),photos:await Promise.all(rows.map(async r=>({key:r.key,bytes:Array.from(new Uint8Array(await r.blob.arrayBuffer()))})))};
   });
   check(after.mode===mode,width+'/'+mode+': prior preference not destroyed');
   check(JSON.stringify(after.records)===JSON.stringify(before.records),width+'/'+mode+': plot and observation bytes unchanged');
   check(after.photos.length===2&&after.photos.every(r=>JSON.stringify(r.bytes)===JSON.stringify(before.bytes)),width+'/'+mode+': guest and account photos unchanged');
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+'/'+mode+': no horizontal overflow');
   check(errors.length===0,width+'/'+mode+': no page errors '+errors.join(';'));
   if(mode==='simple')await page.screenshot({path:path.join(output,'original-query-'+width+'.png'),fullPage:true});
   await context.close();
  }
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({date:new Date().toISOString(),passed:checks.length,checks},null,2));
  console.log(JSON.stringify({passed:checks.length,output}));
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
