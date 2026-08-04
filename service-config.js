/* 公開服務設定（可安全隨網站發布，不得放入私鑰或付款密鑰）

   1. Google 登入：將 Firebase 控制台提供的 Web 設定物件填入 firebase。
   2. 回饋信箱：填入專門接收測試回饋的 email。
   3. 贊助連結已移到 web-support-config.js，避免 Google Play App 載入外部付款網址。

   範例：
   firebase: {
     apiKey: "...",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     appId: "..."
   }
*/
window.PQC_PUBLIC_CONFIG = {
  firebase: {
    apiKey: "AIzaSyA_ScvpfeS7HmBzVWkoi51F9FKsujcOwa4",
    authDomain: "searchbefore-4648b.firebaseapp.com",
    projectId: "searchbefore-4648b",
    storageBucket: "searchbefore-4648b.firebasestorage.app",
    messagingSenderId: "934300362639",
    appId: "1:934300362639:web:a96c41c1a7e6cd5ea5cdfa"
  },
  feedbackEmail: "searchbefore82@gmail.com",
  /* OCR 執行位置。正式切換到雲端前維持 browser，cloud.endpoint 留空。
     Cloud Run 網址是公開設定，不是密鑰；後端仍會驗證 Firebase 登入權杖。 */
  ocr: {
    provider: "browser",
    cloud: {
      endpoint: "",
      requireGoogleLogin: true,
      maxUploadBytes: 12582912
    }
  },
  /* 未完善功能一律 hidden；只有安排公開測試時才可改成 development，
     並由前端明確標示「開發中」。正式完成及驗收後才能改成 public。 */
  features: {
    formOcr: "development"
  }
};
