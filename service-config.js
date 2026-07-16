/* 公開服務設定（可安全隨網站發布，不得放入私鑰或付款密鑰）

   1. Google 登入：將 Firebase 控制台提供的 Web 設定物件填入 firebase。
   2. 贊助連結：建立自己的贊助頁後，將完整 https 網址填入 supportUrl。

   範例：
   firebase: {
     apiKey: "...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     appId: "..."
   }
*/
window.PQC_PUBLIC_CONFIG = {
  firebase: null,
  supportUrl: ""
};
