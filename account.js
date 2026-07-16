(function(){
  "use strict";

  const FIREBASE_VERSION="12.15.0";
  let sdkPromise=null,auth=null,authApi=null,currentUser=null,started=false,lastError="";

  function firebaseConfig(){
    const cfg=window.PQC_PUBLIC_CONFIG&&window.PQC_PUBLIC_CONFIG.firebase;
    if(!cfg||!cfg.apiKey||!cfg.authDomain||!cfg.projectId||!cfg.appId)return null;
    return cfg;
  }
  function esc(value){
    return String(value==null?"":value).replace(/[&<>"']/g,function(char){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char];
    });
  }
  function accountBoxes(){
    return [
      {el:document.getElementById("accountInner"),compact:false},
      {el:document.getElementById("homeAccountInner"),compact:true}
    ].filter(function(item){return !!item.el});
  }
  function isFilePreview(){return location.protocol==="file:"}
  function userMessage(error){
    const code=error&&error.code||"";
    if(code==="auth/popup-closed-by-user")return "登入視窗已關閉，尚未完成登入。";
    if(code==="auth/popup-blocked")return "瀏覽器封鎖了登入視窗，請允許彈出式視窗後再試一次。";
    if(code==="auth/unauthorized-domain")return "目前網址尚未加入 Firebase 授權網域。";
    if(!navigator.onLine)return "目前沒有網路；查詢與本機紀錄仍可離線使用。";
    return "Google 登入暫時無法使用，請稍後再試。";
  }
  function renderBox(el,compact){
    const cfg=firebaseConfig();
    if(!cfg){
      if(compact){el.innerHTML="";return}
      el.innerHTML='<div class="account-state"><div class="account-placeholder">G</div><div class="account-copy"><b>Google 登入準備中</b><span>完成 Firebase 設定後即可啟用；目前不會傳送帳號或田間資料。</span></div></div>'
        +'<button class="btn btn-ghost" type="button" disabled style="width:100%;margin-top:10px">尚未啟用 Google 登入</button>';
      return;
    }
    if(isFilePreview()){
      el.innerHTML=compact
        ?'<p class="hint">請到正式網站測試 Google 登入；本機檔案預覽不執行授權。</p>'
        :'<div class="account-state"><div class="account-placeholder">G</div><div class="account-copy"><b>請到正式網站測試登入</b><span>本機檔案預覽不執行 Google 登入，避免授權網域錯誤。</span></div></div>';
      return;
    }
    if(lastError){
      el.innerHTML='<p class="account-error">'+esc(lastError)+'</p>'
        +'<button class="btn btn-main" type="button" style="width:100%" onclick="PQC_ACCOUNT.signIn()">重新登入</button>';
      return;
    }
    if(currentUser){
      const avatar=currentUser.photoURL
        ?'<img class="account-avatar" src="'+esc(currentUser.photoURL)+'" alt="" referrerpolicy="no-referrer">'
        :'<div class="account-placeholder">G</div>';
      el.innerHTML='<div class="account-state">'+avatar+'<div class="account-copy"><b>'+esc(currentUser.displayName||"Google 使用者")+'</b><span>'+esc(currentUser.email||"")+'</span></div></div>'
        +(compact
          ?'<p class="hint" style="margin:9px 0 0">Google 帳號已登入；田間資料仍只保存在這台裝置。</p>'
          :'<p class="hint" style="margin:10px 0">登入目前只用於帳號識別；田區、用藥與農務紀錄仍保存在這台裝置。</p><button class="btn btn-ghost" type="button" style="width:100%" onclick="PQC_ACCOUNT.signOut()">登出 Google 帳號</button>');
      return;
    }
    if(started&&!auth){
      el.innerHTML='<div class="account-loading">正在準備 Google 登入…</div>';
      return;
    }
    el.innerHTML='<button class="btn btn-main google-signin" type="button" onclick="PQC_ACCOUNT.signIn()"><span class="google-mark">G</span>使用 Google 帳號登入</button>'
      +'<p class="hint" style="margin:9px 0 0">登入為選用功能；不登入仍可使用目前所有功能與本機紀錄。</p>';
  }
  function render(){accountBoxes().forEach(function(item){renderBox(item.el,item.compact)})}
  function loadSdk(){
    if(!sdkPromise){
      sdkPromise=Promise.all([
        import("https://www.gstatic.com/firebasejs/"+FIREBASE_VERSION+"/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/"+FIREBASE_VERSION+"/firebase-auth.js")
      ]);
    }
    return sdkPromise;
  }
  async function init(){
    if(started)return auth;
    started=true;render();
    const cfg=firebaseConfig();
    if(!cfg||isFilePreview()){started=false;render();return null}
    try{
      const modules=await loadSdk(),appApi=modules[0];authApi=modules[1];
      const app=appApi.getApps().length?appApi.getApp():appApi.initializeApp(cfg);
      auth=authApi.getAuth(app);
      await authApi.setPersistence(auth,authApi.browserLocalPersistence);
      authApi.onAuthStateChanged(auth,function(user){currentUser=user||null;lastError="";render()});
      render();return auth;
    }catch(error){
      lastError=userMessage(error);auth=null;started=false;render();return null;
    }
  }
  async function signIn(){
    lastError="";
    const instance=auth||await init();
    if(!instance)return;
    try{
      const provider=new authApi.GoogleAuthProvider();
      provider.setCustomParameters({prompt:"select_account"});
      await authApi.signInWithPopup(instance,provider);
    }catch(error){lastError=userMessage(error);render()}
  }
  async function signOutUser(){
    if(!auth)return;
    try{await authApi.signOut(auth)}catch(error){lastError=userMessage(error);render()}
  }

  window.PQC_ACCOUNT={init:init,render:render,signIn:signIn,signOut:signOutUser,isConfigured:function(){return !!firebaseConfig()}};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
  else setTimeout(init,0);
})();
