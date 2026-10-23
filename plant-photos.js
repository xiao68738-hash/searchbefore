/* Local-only photo store. Blobs never enter fieldPlots, backups, Firestore or analytics. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PQC_PLANT_PHOTOS=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const DB='pqc-plant-photos-v1', STORE='photos', MAX_INPUT=12*1024*1024, MAX_PHOTO=400*1024, MAX_TOTAL=30*1024*1024;
  function scope(uid,owner){
    if(owner && owner!==uid)return null;
    return uid?'user:'+uid:'guest';
  }
  function key(owner,id){
    if(typeof owner!=='string'||!/^(?:guest|user:[A-Za-z0-9_-]{1,128})$/.test(owner)||typeof id!=='string'||!/^[-A-Za-z0-9_]{1,100}$/.test(id))throw Error('無法確認照片所屬植物或帳號。');
    return owner+'|'+id;
  }
  function validateFile(file){
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('請選 JPG、PNG 或 WebP 照片；HEIC 請先轉成 JPG。');
    if(!Number.isFinite(file.size)||file.size<=0||file.size>MAX_INPUT)throw Error('照片須小於 12 MB，請選擇較小的圖片。');
  }
  function signature(bytes,type){
    if(type==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(type==='image/png')return [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
    if(type==='image/webp')return String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
    return false;
  }
  async function prepare(file){
    validateFile(file);
    if(!signature(new Uint8Array(await file.slice(0,12).arrayBuffer()),file.type))throw Error('檔案內容與圖片格式不符，請重新選擇照片。');
    let bitmap,canvas;
    try{
      bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
      if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>40000000)throw Error('照片解析度過大，請先縮小到 4000 萬像素以內。');
      const ratio=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));
      canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      const ctx=canvas.getContext('2d');if(!ctx)throw Error('此瀏覽器無法處理照片。');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for(const quality of [.82,.65,.45,.25]){
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
        if(blob&&blob.size<=MAX_PHOTO)return blob;
      }
      throw Error('壓縮後照片仍太大，請裁切或選擇較小的圖片。');
    }catch(e){throw new Error(e&&e.message||'無法讀取照片，請換一張再試。');}
    finally{if(bitmap)bitmap.close();if(canvas){canvas.width=0;canvas.height=0;}}
  }
  function open(){
    return new Promise((resolve,reject)=>{
      let done=false;
      const fail=()=>{if(!done){done=true;reject(Error('無法開啟本機照片儲存空間；原有紀錄不受影響。'));}};
      if(typeof indexedDB==='undefined')return fail();
      const timer=setTimeout(fail,8000);let req;
      try{req=indexedDB.open(DB,1);}catch(_){clearTimeout(timer);return fail();}
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'key'});};
      req.onerror=()=>{clearTimeout(timer);fail();};req.onblocked=()=>{clearTimeout(timer);fail();};
      req.onsuccess=()=>{clearTimeout(timer);if(done){req.result.close();return;}done=true;resolve(req.result);};
    });
  }
  async function get(owner,id){
    const idKey=key(owner,id),db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(idKey);
      tx.oncomplete=()=>{db.close();const blob=req.result&&req.result.blob;resolve(blob instanceof Blob&&blob.type==='image/jpeg'&&blob.size<=MAX_PHOTO?blob:null);};
      tx.onabort=tx.onerror=()=>{db.close();reject(Error('無法讀取本機照片。'));};
    });
  }
  async function put(owner,id,blob){
    const idKey=key(owner,id);
    if(!(blob instanceof Blob)||blob.type!=='image/jpeg'||blob.size<=0||blob.size>MAX_PHOTO)throw Error('照片格式或壓縮大小不符，尚未儲存。');
    const db=await open();
    return new Promise((resolve,reject)=>{
      let problem='照片未儲存，可能是瀏覽器空間不足。原照片與紀錄保留。';
      const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);let total=blob.size;
      const cursor=store.openCursor();
      cursor.onsuccess=()=>{
        const row=cursor.result;
        if(row){if(row.key!==idKey)total+=Number(row.value.bytes)||0;row.continue();}
        else if(total>MAX_TOTAL){problem='本機照片已達 30 MB 上限。請先下載並移除不需要的照片。';tx.abort();}
        else store.put({key:idKey,blob,bytes:blob.size});
      };
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onabort=tx.onerror=()=>{db.close();reject(Error(problem));};
    });
  }
  async function remove(owner,id){
    const idKey=key(owner,id),db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(idKey);
      tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(Error('照片未移除，請稍後再試。'));};
    });
  }
  return {scope,key,validateFile,signature,prepare,get,put,remove,MAX_INPUT,MAX_PHOTO,MAX_TOTAL};
});
