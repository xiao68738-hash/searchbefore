/* 雲端同步：把田區、用藥與農務紀錄備份到使用者自己的 Google 帳號。

   設計原則
   1. 本機優先。localStorage 永遠是可直接使用的完整資料，沒有網路照常運作。
   2. 單點攔截。所有寫入都經過 store.set，由 beforeStore 蓋 updatedAt 並偵測刪除，
      不必逐一修改各處 mutation 路徑（現在或以後新增的都自動涵蓋）。
   3. 合併是純函式。mergeCollection 不碰 Firebase，可完整單元測試。
   4. 帳號歸屬保護。換帳號不會把 A 農友的資料混進 B 的雲端。

   Firestore 結構：users/{uid}/{collection}/{docId}
   刪除採軟刪除（_deleted:true），否則另一台裝置會把已刪紀錄同步回來。 */
(function(){
  "use strict";

  const FIREBASE_VERSION="12.15.0";
  const COLLECTIONS=["records","fieldPlots","farmRecords"];
  const K_ENABLED="syncEnabled";
  const K_OWNER="syncOwnerUid";
  const K_LAST="syncLastAt";
  const K_TOMB="syncTombstones";
  const TOMB_KEEP_DAYS=180;

  let db=null,fsApi=null,sdkPromise=null;
  let user=null,status="idle",lastError="",timer=null,running=false,pending=false;

  /* ── 與宿主頁面的介面 ── */
  let host={
    get:function(k){try{const v=localStorage.getItem(k);return v?JSON.parse(v):null}catch(e){return null}},
    set:function(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},
    reload:function(){},
    toast:function(){}
  };

  /* 時戳必須嚴格遞增。兩個理由:
     1. Date 只有毫秒解析度,連續兩次寫入可能拿到同一個值,後一次的修改會判不出較新。
     2. 手機時鐘被往回調時(農友換時區或自動校時),新編輯的時戳會小於舊的,
        同步時新資料反而輸給舊資料,等於靜默回滾使用者的輸入。 */
  let lastStamp="";
  function nowIso(){
    let iso=new Date().toISOString();
    if(iso<=lastStamp)iso=new Date(new Date(lastStamp).getTime()+1).toISOString();
    lastStamp=iso;
    return iso;
  }
  function arr(v){return Array.isArray(v)?v:[]}
  function cmp(a,b){
    const x=String(a||""),y=String(b||"");
    return x<y?-1:x>y?1:0;
  }

  /* ═══ 純函式：合併 ═══════════════════════════════════════
     local / remote 皆為 [{id, updatedAt, _deleted?, ...}]
     回傳 { merged:存活項目, toPush:本機較新需上傳的項目 }

     updatedAt 相同時「刪除優先」。若改成保留優先，A 裝置刪除、B 裝置未改，
     兩邊時戳相同就會讓紀錄復活，農友會看到刪不掉的資料。 */
  function mergeCollection(local,remote){
    const best=new Map();
    function consider(item,src){
      if(!item||!item.id)return;
      const prev=best.get(item.id);
      if(!prev){best.set(item.id,{item:item,src:src});return}
      const c=cmp(item.updatedAt,prev.item.updatedAt);
      if(c>0){best.set(item.id,{item:item,src:src});return}
      if(c<0)return;
      /* 時戳相同。順序很重要:
         1. 刪除優先,否則 A 裝置刪掉的紀錄會被 B 裝置同步回來,變成刪不掉。
         2. 其餘情況採 remote,讓 src 標為 remote 而不進 toPush。
            少了這條,本機與雲端完全一致的資料每次同步都會整批重傳 ——
            200 筆紀錄 × 每天 15 次同步 × 12 人 = 36,000 次寫入,
            直接超過 Spark 方案每天 20,000 次的免費額度。 */
      if(item._deleted&&!prev.item._deleted){best.set(item.id,{item:item,src:src});return}
      if(!item._deleted&&prev.item._deleted)return;
      if(src==="remote")best.set(item.id,{item:item,src:src});
    }
    arr(local).forEach(function(i){consider(i,"local")});
    arr(remote).forEach(function(i){consider(i,"remote")});

    const merged=[],toPush=[];
    best.forEach(function(entry){
      if(!entry.item._deleted)merged.push(entry.item);
      if(entry.src==="local")toPush.push(entry.item);
    });
    return {merged:merged,toPush:toPush};
  }

  /* ═══ 純函式：內容比對（忽略 updatedAt 本身） ═══ */
  function sameContent(a,b){
    if(!a||!b)return false;
    const strip=function(o){
      const c={};
      Object.keys(o).forEach(function(k){if(k!=="updatedAt")c[k]=o[k]});
      return JSON.stringify(c,Object.keys(c).sort());
    };
    return strip(a)===strip(b);
  }

  /* ═══ 純函式：蓋時戳 + 偵測刪除 ═══
     回傳 { items:蓋好時戳的陣列, tombstones:新產生的刪除標記 } */
  function stampCollection(col,nextItems,prevItems,now){
    const prev=new Map();
    arr(prevItems).forEach(function(i){if(i&&i.id)prev.set(i.id,i)});
    const seen=new Set();
    const items=arr(nextItems).map(function(item){
      if(!item||!item.id)return item;
      seen.add(item.id);
      const old=prev.get(item.id);
      if(old&&sameContent(old,item))return Object.assign({},item,{updatedAt:old.updatedAt||now});
      return Object.assign({},item,{updatedAt:now});
    });
    const tombstones=[];
    prev.forEach(function(old,id){
      if(!seen.has(id))tombstones.push({col:col,id:id,updatedAt:now});
    });
    return {items:items,tombstones:tombstones};
  }

  /* ═══ 純函式：清掉太舊的刪除標記 ═══ */
  function pruneTombstones(list,now,keepDays){
    const cutoff=new Date(new Date(now).getTime()-(keepDays||TOMB_KEEP_DAYS)*86400000).toISOString();
    return arr(list).filter(function(t){return String(t.updatedAt||"")>=cutoff});
  }

  /* ═══ store.set 攔截 ═══ */
  function beforeStore(key,value){
    if(COLLECTIONS.indexOf(key)<0||!Array.isArray(value))return value;
    const res=stampCollection(key,value,arr(host.get(key)),nowIso());
    if(res.tombstones.length){
      const all=pruneTombstones(arr(host.get(K_TOMB)).concat(res.tombstones),nowIso());
      host.set(K_TOMB,all);
    }
    return res.items;
  }
  function afterStore(key){
    if(COLLECTIONS.indexOf(key)<0)return;
    schedule();
  }

  /* ═══ 狀態 ═══ */
  function isEnabled(){
    const v=host.get(K_ENABLED);
    return v===null||v===undefined?true:!!v;   /* 登入後預設開啟 */
  }
  function setEnabled(on){
    host.set(K_ENABLED,!!on);
    notify();
    if(on)schedule(0);
  }
  function ownerUid(){return host.get(K_OWNER)||""}
  function ownerConflict(){
    const o=ownerUid();
    return !!(user&&o&&o!==user.uid);
  }
  function adoptCurrentAccount(){
    if(!user)return;
    host.set(K_OWNER,user.uid);
    lastError="";
    schedule(0);
  }
  function lastSyncedAt(){return host.get(K_LAST)||""}

  function statusLine(){
    if(!user)return {tone:"idle",text:"未登入，紀錄只保存在這台裝置"};
    if(!isEnabled())return {tone:"off",text:"雲端同步已關閉，紀錄只保存在這台裝置"};
    if(ownerConflict())return {tone:"warn",text:"這台裝置的資料屬於另一個帳號，尚未同步"};
    if(status==="error")return {tone:"warn",text:lastError||"同步失敗，稍後會自動重試"};
    if(status==="syncing")return {tone:"busy",text:"同步中…"};
    const at=lastSyncedAt();
    if(!at)return {tone:"idle",text:"尚未同步"};
    return {tone:"ok",text:"已同步："+at.slice(0,16).replace("T"," ")};
  }

  const listeners=[];
  function onStatus(cb){if(typeof cb==="function")listeners.push(cb)}
  function notify(){listeners.forEach(function(cb){try{cb(statusLine())}catch(e){}})}

  /* ═══ Firestore ═══ */
  function config(){
    const cfg=window.PQC_PUBLIC_CONFIG&&window.PQC_PUBLIC_CONFIG.firebase;
    if(!cfg||!cfg.apiKey||!cfg.projectId)return null;
    return cfg;
  }
  function loadSdk(){
    if(!sdkPromise){
      sdkPromise=Promise.all([
        import("https://www.gstatic.com/firebasejs/"+FIREBASE_VERSION+"/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/"+FIREBASE_VERSION+"/firebase-firestore.js")
      ]);
    }
    return sdkPromise;
  }
  async function ensureDb(){
    if(db)return db;
    const cfg=config();
    if(!cfg||location.protocol==="file:")return null;
    const mods=await loadSdk(),appApi=mods[0];
    fsApi=mods[1];
    const app=appApi.getApps().length?appApi.getApp():appApi.initializeApp(cfg);
    db=fsApi.getFirestore(app);
    return db;
  }

  function schedule(delay){
    if(timer)clearTimeout(timer);
    timer=setTimeout(function(){timer=null;syncNow()},delay===0?0:1500);
  }

  async function syncNow(){
    if(running){pending=true;return}
    if(!user||!isEnabled()||ownerConflict())return;
    if(!navigator.onLine)return;
    const database=await ensureDb().catch(function(){return null});
    if(!database)return;

    running=true;status="syncing";lastError="";notify();
    try{
      if(!ownerUid())host.set(K_OWNER,user.uid);
      const tombs=arr(host.get(K_TOMB));
      /* 增量同步:只抓上次成功同步之後變動過的文件。
         全量讀取的話,200 筆紀錄每次同步就是 200 次讀取,
         12 人每天各同步 15 次 = 36,000 次,逼近 Spark 每天 50,000 次上限,
         而且完全無法隨使用者成長。首次同步(沒有 since)才做全量。
         注意:K_LAST 只在整輪成功後才更新,所以中途失敗不會漏掉資料。 */
      const since=String(host.get(K_LAST)||"");

      for(const col of COLLECTIONS){
        const ref=fsApi.collection(database,"users",user.uid,col);
        const snap=await fsApi.getDocs(
          since?fsApi.query(ref,fsApi.where("updatedAt",">",since)):ref
        );
        const remote=[];
        snap.forEach(function(d){remote.push(Object.assign({id:d.id},d.data()))});

        const localItems=arr(host.get(col)).slice();
        tombs.filter(function(t){return t.col===col}).forEach(function(t){
          localItems.push({id:t.id,_deleted:true,updatedAt:t.updatedAt});
        });

        const res=mergeCollection(localItems,remote);
        host.set(col,res.merged);

        /* updatedAt <= since 的項目在前一輪成功同步時已經推送過,不必重傳。 */
        const toPush=res.toPush.filter(function(i){
          return !since||String(i.updatedAt||"")>since;
        });
        for(const item of toPush){
          const body=Object.assign({},item);
          delete body.id;
          await fsApi.setDoc(fsApi.doc(database,"users",user.uid,col,String(item.id)),body,{merge:false});
        }
      }
      host.set(K_LAST,nowIso());
      status="ok";
      host.reload();
    }catch(error){
      status="error";
      lastError=(error&&error.code==="permission-denied")
        ?"雲端權限不足，請確認 Firestore 安全規則已部署"
        :"同步失敗，恢復連線後會自動重試";
    }finally{
      running=false;notify();
      if(pending){pending=false;schedule();}
    }
  }

  /* ═══ 初始化 ═══ */
  function attach(options){
    if(options&&options.host)host=Object.assign({},host,options.host);
    if(window.PQC_ACCOUNT&&typeof PQC_ACCOUNT.onUser==="function"){
      PQC_ACCOUNT.onUser(function(u){
        user=u||null;
        notify();
        if(user)schedule(0);
      });
    }
    window.addEventListener("online",function(){schedule(0)});
  }

  window.PQC_SYNC={
    COLLECTIONS:COLLECTIONS,
    attach:attach,
    beforeStore:beforeStore,
    afterStore:afterStore,
    syncNow:syncNow,
    isEnabled:isEnabled,
    setEnabled:setEnabled,
    ownerConflict:ownerConflict,
    adoptCurrentAccount:adoptCurrentAccount,
    lastSyncedAt:lastSyncedAt,
    statusLine:statusLine,
    onStatus:onStatus,
    /* 供測試使用的純函式 */
    nowIso:nowIso,
    mergeCollection:mergeCollection,
    stampCollection:stampCollection,
    pruneTombstones:pruneTombstones,
    sameContent:sameContent
  };
})();
