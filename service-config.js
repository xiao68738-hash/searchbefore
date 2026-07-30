/* 公開服務設定（可安全隨網站發布，不得放入私鑰或付款密鑰）

   1. Google 登入：將 Firebase 控制台提供的 Web 設定物件填入 firebase。
   2. 回饋信箱：填入專門接收測試回饋的 email。
   3. 贊助連結：將各金額的綠界 https 收款網址填入 supportUrls。

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
  supportUrls: {
    amount50: "https://p.ecpay.com.tw/C208963",
    amount100: "https://p.ecpay.com.tw/0503198",
    amount150: "https://p.ecpay.com.tw/AE7EDCF",
    custom: "https://p.ecpay.com.tw/D7844AC"
  }
};
