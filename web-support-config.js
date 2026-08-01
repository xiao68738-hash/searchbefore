/* 各使用環境按需載入的純自願支持設定。
   googlePlayVoluntarySupport 採 Google Play 最嚴格規則作為全通路緊急開關；只有明確為 true 時才顯示入口。
   贊助不得解鎖內容、功能、服務、徽章、優先權或其他數位回饋。 */
window.PQC_WEB_SUPPORT_CONFIG = Object.freeze({
  googlePlayVoluntarySupport: true,
  supportUrls: Object.freeze({
    amount50: "https://p.ecpay.com.tw/C208963",
    amount100: "https://p.ecpay.com.tw/0503198",
    amount150: "https://p.ecpay.com.tw/AE7EDCF",
    custom: "https://p.ecpay.com.tw/D7844AC"
  })
});
