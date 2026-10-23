const {createServer}=require('./serve-balcony-preview.cjs');
// Use an existing Playwright installation; no dependency download or real browser profile.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const output=path.resolve(process.env.BALCONY_AUDIT_DIR||path.join(require('node:os').tmpdir(),'searchbefore-balcony-audit')),checks=[];
const check=(v,label)=>{assert.ok(v,label);checks.push(label);};
(async()=>{
 fs.mkdirSync(output,{recursive:true});const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  for(const width of [320,390,1280]){
   const context=await browser.newContext({viewport:{width,height:950},serviceWorkers:'block'});
   await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin);check(await page.locator('#onboard.open').isVisible(),width+': entry gate not bypassed');
   check(await page.locator('#balconyHome').isHidden(),width+': defaults preserve original UI');
   await page.locator('.btn-guest').click();await page.waitForTimeout(500);
   if(await page.locator('#annModal.open').count())await page.locator('#annModal button').filter({hasText:'關閉'}).click();
   await page.locator('#experienceLabel').click();await page.locator('[data-use-mode="simple"]').click();
   check(await page.locator('#balconyHome').isVisible(),width+': simple mode opens plant home');
   if(!(await page.locator('#scr-search').isHidden()))console.log(await page.evaluate(()=>({body:document.body.className,app:getComputedStyle(document.getElementById('app')).display,styles:[...document.styleSheets].map(s=>s.href)})));
   check(await page.locator('#scr-search').isHidden(),width+': original query is not duplicated underneath');
   await page.locator('[data-action="add"]').first().click();await page.locator('#balCrop').fill('蔥');await page.locator('#balLocation').fill('窗邊（示範）');await page.locator('#balPlantForm button[type=submit]').click();
   await page.locator('[data-action="care"]').first().click();await page.locator('[data-kind="water"]').click();await page.locator('#balNotes').fill('示範照顧紀錄');await page.locator('#balCareForm button[type=submit]').click();
   check((await page.locator('.bal-timeline').innerText()).includes('澆水'),width+': record created through existing form');await page.locator('[data-action="close"]').click();
   const before=await page.evaluate(()=>localStorage.getItem('farmRecords'));
   await page.locator('[data-action="photo"]').click();await page.locator('#balPhotoInput').waitFor({state:'visible'});
   await page.waitForFunction(()=>!document.getElementById('balPhotoPreview').textContent.includes('讀取'));
   // Synthetic plant illustration, not a user photo and not AI recognition.
   const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1600;c.height=1200;const x=c.getContext('2d');x.fillStyle='#e8e5d4';x.fillRect(0,0,1600,1200);x.fillStyle='#bc8056';x.fillRect(550,740,500,340);x.strokeStyle='#315c43';x.lineWidth=26;for(let i=0;i<5;i++){x.beginPath();x.moveTo(800,760);x.quadraticCurveTo(480+i*170,500,500+i*160,150+i*35);x.stroke();}return c.toDataURL('image/png').split(',')[1];});
   const fixture=Buffer.from(png,'base64');if(width===390)fs.writeFileSync(path.join(output,'synthetic-plant.png'),fixture);
   await page.locator('#balPhotoInput').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:fixture});
   await page.waitForFunction(()=>!document.getElementById('balPhotoSave').disabled);
   check((await page.locator('#balPhotoStatus').innerText()).includes('尚未')||(await page.locator('#balPhotoStatus').innerText()).includes('才會'),width+': explicit save after preview');
   const id=await page.evaluate(()=>JSON.parse(localStorage.getItem('fieldPlots'))[0].id);
   check(await page.evaluate(id=>PQC_PLANT_PHOTOS.get('guest',id).then(x=>x===null),id),width+': selection alone does not persist');
   await page.locator('#balPhotoSave').click();await page.waitForFunction(()=>document.getElementById('balPhotoStatus').textContent.includes('未上傳'));
   const photoInfo=await page.evaluate(async id=>{const blob=await PQC_PLANT_PHOTOS.get('guest',id),bitmap=await createImageBitmap(blob);const info={type:blob.type,size:blob.size,width:bitmap.width,height:bitmap.height};bitmap.close();return info;},id);
   check(photoInfo.type==='image/jpeg'&&photoInfo.size<=400*1024&&Math.max(photoInfo.width,photoInfo.height)<=1024,width+': photo resized and re-encoded');
   check(await page.evaluate(()=>localStorage.getItem('farmRecords'))===before,width+': photo cannot overwrite existing records');
   check(await page.evaluate(async id=>(await PQC_PLANT_PHOTOS.get('user:other',id))===null,id),width+': other account has no photo');
   check(await page.evaluate(async()=>{try{await PQC_PLANT_PHOTOS.prepare(new File(['<html>'], 'fake.jpg',{type:'image/jpeg'}));return false;}catch(e){return e.message.includes('不符');}}),width+': forged image MIME rejected');
   if(width===390){
    const fullResult=await page.evaluate(async id=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pqc-plant-photos-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});
      await new Promise((resolve,reject)=>{const t=db.transaction('photos','readwrite');t.objectStore('photos').put({key:'capacity-test',bytes:30*1024*1024});t.oncomplete=resolve;t.onerror=reject;});
      const before=await PQC_PLANT_PHOTOS.get('guest',id);let rejected=false;
      try{await PQC_PLANT_PHOTOS.put('guest',id,before);}catch(e){rejected=e.message.includes('30 MB');}
      const after=await PQC_PLANT_PHOTOS.get('guest',id);
      await new Promise(resolve=>{const t=db.transaction('photos','readwrite');t.objectStore('photos').delete('capacity-test');t.oncomplete=resolve;});db.close();
      return rejected&&after.size===before.size;
    },id);
    check(fullResult,'capacity failure is atomic and retains the prior photo');
   }
   if(width===390)await page.screenshot({path:path.join(output,'photo-dialog.png')});
   await page.locator('#balPhotoInput').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg onload="alert(1)"/>')});
   await page.waitForFunction(()=>document.getElementById('balPhotoStatus').textContent.includes('JPG'));
   check(await page.locator('#balPhotoSave').isDisabled(),width+': unsupported format cannot replace photo');
   check(await page.evaluate(async id=>(await PQC_PLANT_PHOTOS.get('guest',id)).size,id)===photoInfo.size,width+': failed replacement keeps original');
   // Replacement also explicitly saved.
   await page.locator('#balPhotoInput').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:fixture});await page.waitForFunction(()=>!document.getElementById('balPhotoSave').disabled);await page.locator('#balPhotoSave').click();await page.waitForFunction(()=>document.getElementById('balPhotoStatus').textContent.includes('未上傳'));
   const downloadEvent=page.waitForEvent('download');await page.locator('#balPhotoDownload').click();const download=await downloadEvent;
   check(download.suggestedFilename().endsWith('.jpg'),width+': local photo can be downloaded separately');
   await page.locator('[data-action="close"]').click();await page.locator('.bal-photo-button img').waitFor();
   await page.reload();if(await page.locator('.btn-guest').isVisible())await page.locator('.btn-guest').click();await page.waitForTimeout(400);if(await page.locator('#annModal.open').count())await page.locator('#annModal button').filter({hasText:'關閉'}).click();
   check(await page.locator('#balconyHome').isVisible(),width+': saved simple mode resumes after entry');await page.locator('.bal-photo-button img').waitFor();
   check(await page.evaluate(()=>localStorage.getItem('farmRecords'))===before,width+': records persist across reload');
   await page.locator('[data-action="home"]').click();
   if(width===390)await page.screenshot({path:path.join(output,'home-photo.png'),fullPage:true});
   await page.locator('[data-action="original"]').click();
   check(await page.locator('#balconyHome').isHidden()&&await page.locator('#scr-search').isVisible(),width+': switch back to original UI');
   check(await page.evaluate(()=>localStorage.getItem('pqc.experience-mode.v1'))==='standard',width+': original mode preference saved');
   await page.locator('#experienceLabel').click();await page.locator('[data-use-mode="simple"]').click();
   await page.locator('[data-action="profile"]').click();check((await page.locator('#backupNote').innerText()).includes('照片'),width+': backup scope discloses photo exclusion');await page.locator('#balconyReturn').click();
   await page.evaluate(()=>{document.documentElement.dataset.theme='dark';document.documentElement.dataset.contrast='high';document.documentElement.dataset.fontsize='large';});
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+': dark high contrast enlarged text no overflow');
   if(width===390)await page.screenshot({path:path.join(output,'dark-large.png'),fullPage:true});
   await page.locator('[data-action="photo"]').click();await page.waitForFunction(()=>!document.getElementById('balPhotoRemove').disabled);
   page.once('dialog',d=>d.accept());await page.locator('#balPhotoRemove').click();await page.waitForFunction(()=>document.getElementById('balPhotoStatus').textContent.includes('已移除'));
   check(await page.evaluate(async id=>(await PQC_PLANT_PHOTOS.get('guest',id))===null,id),width+': confirmed removal deletes only photo');
   check(await page.evaluate(()=>localStorage.getItem('farmRecords'))===before,width+': removal preserves care records');
   await page.locator('[data-action="close"]').click();
   const unavailable=await page.evaluate(async id=>{const original=indexedDB.open;indexedDB.open=()=>{throw Error('test unavailable');};try{await PQC_PLANT_PHOTOS.get('guest',id);return false;}catch(e){return e.message.includes('儲存空間');}finally{indexedDB.open=original;}},id);
   check(unavailable,width+': unavailable storage fails explicitly');
   check(errors.length===0,width+': no page errors '+errors.join(';'));
   await context.close();
  }
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({date:new Date().toISOString(),passed:checks.length,checks},null,2));console.log(JSON.stringify({passed:checks.length,output}));
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
