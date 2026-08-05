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
  /* OCR 改用 Google Cloud Vision。端點仍由部署後填入；測試入口以驗證碼鎖定。
     這個雜湊只是不讓驗證碼明文出現在前端，不能取代 Firebase 登入、後端授權或 API 限流。
     Cloud Run 網址可以公開；Google Cloud 憑證與服務帳戶金鑰不得寫入前端或 GitHub。 */
  ocr: {
    provider: "google-cloud-vision",
    cloud: {
      endpoint: "",
      requireGoogleLogin: true,
      maxUploadBytes: 12582912,
      verification: {
        required: true,
        hash: "ff1503f31eb784fa44596f6f4829c99406e4cb0b16e00d959faab05e64e5e68e",
        sessionKey: "pqc.ocr.google-cloud-vision.unlocked.v1"
      }
    }
  },
  /* 目前只開放驗證碼持有者進入測試畫面；端點部署及實機驗收完成前不得改為 public。 */
  features: {
    formOcr: "development"
  }
};
