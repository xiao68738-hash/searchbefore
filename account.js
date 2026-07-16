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
  function googleLogo(){
    return '<svg class="google-logo" viewBox="0 0 48 48" aria-hidden="true" focusable="false">'
      +'<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>'
      +'<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>'
      +'<path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.27-3.14.76-4.59l-7.98-6.19A24 24 0 0 0 0 24c0 3.87.92 7.53 2.56 10.78l7.97-6.19z"/>'
      +'<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>'
      +'</svg>';
  }
  function googleMark(){return '<span class="google-mark">'+googleLogo()+'</span>'}
  function accountBoxes(){
    return [
      {el:document.getElementById("accountInner"),compact:false,entry:false},
      {el:document.getElementById("homeAccountInner"),compact:true,entry:false},
      {el:document.getElementById("entryAccountInner"),compact:true,entry:true}
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
  function renderBox(el,compact,entry){
    const cfg=firebaseConfig();
    if(!cfg){
      if(compact&&!entry){el.innerHTML="";return}
      if(entry){
        el.innerHTML='<button class="btn btn-ghost" type="button" disabled style="width:100%">Google 登入暫時未啟用</button>'
          +'<p class="hint" style="margin:9px 0 0">仍可選擇下方的訪客身分使用全部現有功能。</p>';
        return;
      }
      el.innerHTML='<div class="account-state"><div class="account-placeholder">'+googleLogo()+'</div><div class="account-copy"><b>Google 登入準備中</b><span>完成 Firebase 設定後即可啟用；目前不會傳送帳號或田間資料。</span></div></div>'
        +'<button class="btn btn-ghost" type="button" disabled style="width:100%;margin-top:10px">尚未啟用 Google 登入</button>';
      return;
    }
    if(isFilePreview()){
      el.innerHTML=entry
        ?'<button class="btn btn-ghost" type="button" disabled style="width:100%">請到正式網站測試 Google 登入</button><p class="hint" style="margin:9px 0 0">本機預覽仍可選擇訪客身分。</p>'
        :compact
        ?'<p class="hint">請到正式網站測試 Google 登入；本機檔案預覽不執行授權。</p>'
        :'<div class="account-state"><div class="account-placeholder">'+googleLogo()+'</div><div class="account-copy"><b>請到正式網站測試登入</b><span>本機檔案預覽不執行 Google 登入，避免授權網域錯誤。</span></div></div>';
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
        :'<div class="account-placeholder">'+googleLogo()+'</div>';
      if(entry){
        el.innerHTML='<div class="account-state">'+avatar+'<div class="account-copy"><b>'+esc(currentUser.displayName||"Google 使用者")+'</b><span>'+esc(currentUser.email||"")+'</span></div></div>'
          +'<button class="btn btn-main" type="button" style="width:100%;margin-top:11px" onclick="completeEntryWithGoogle()">使用這個 Google 帳號繼續</button>';
        return;
      }
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
    el.innerHTML='<button class="btn btn-main google-signin" type="button" onclick="PQC_ACCOUNT.signIn()">'+googleMark()+'<span>使用 Google 帳號登入</span></button>'
      +(entry?'':'<p class="hint" style="margin:9px 0 0">登入為選用功能；不登入仍可使用目前所有功能與本機紀錄。</p>');
  }
  function render(){accountBoxes().forEach(function(item){renderBox(item.el,item.compact,item.entry)})}
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
      const result=await authApi.signInWithPopup(instance,provider);
      const user=result&&result.user||currentUser||null;
      if(user&&typeof window.completeEntryWithGoogle==="function")window.completeEntryWithGoogle();
      return user;
    }catch(error){lastError=userMessage(error);render();return null}
  }
  async function signOutUser(){
    if(!auth)return;
    try{await authApi.signOut(auth)}catch(error){lastError=userMessage(error);render()}
  }

  window.PQC_ACCOUNT={init:init,render:render,signIn:signIn,signOut:signOutUser,isConfigured:function(){return !!firebaseConfig()}};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
  else setTimeout(init,0);
})();
