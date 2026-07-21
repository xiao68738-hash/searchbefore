/* 產生給主管機關的詢問函。

   兩個機關的權責不同,不可混為一談:
     農藥登記(許可證、有效成分名稱)→ 農業部動植物防疫檢疫署
     殘留容許量(附表一、免訂清單) → 衛生福利部食品藥物管理署

   只列真正無法自行釐清的項目。能自己查到的不該去麻煩人家。 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = f => {
  const p = path.join(DIR, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};

const master = read("殘留物對照總表.json");
const noEn = read("無英文名解析.json");
const mixes = read("混合劑拆解.json");
const enMatch = read("英文名補比對.json");

/* ── 給防檢署:登記資料缺漏 ── */
const missingEn = (noEn?.rows || []).filter(r => r.active > 0);

/* ── 給食藥署:容許量歸屬不明 ── */
const noClue = master.rows.filter(r => r.tier === "無線索");
const partialMix = (mixes?.rows || []).filter(r => !r.allHit);
const unlistedIsomer = (enMatch?.hit || []).filter(r => r.confidence === "不可採用" || r.confidence === "低");

const fmt = n => String(n).padStart(4);
const today = new Date().toISOString().slice(0, 10);

/* ── 函一:動植物防疫檢疫署 ── */
const letter1 = `收件機關：農業部動植物防疫檢疫署
（農藥管理法主管機關，農藥許可證與有效成分名稱之權責機關）

主旨：建議補正農藥開放資料中「英文名稱」欄位之缺漏，請查照。

說明：

一、本人為 貴署農藥資料開放平臺之使用者，於整理農藥登記資料與
    農產品殘留規定時，發現下列欄位缺漏情形。
    資料來源：https://data.moa.gov.tw/Service/OpenData/FromM/PesticideData.aspx

二、於 ${today} 取得之全量資料共 11,869 張許可證中，發現 111 張之
    「英文名稱」欄位為空值，涵蓋 27 種中文名稱；其中 17 張連
    「中文名稱」欄位亦為空值。

三、此欄位缺漏造成之實務困難：
    衛生福利部食品藥物管理署之「農藥殘留容許量標準」附表一係以
    國際普通名稱（英文）為主鍵。英文名稱缺漏時，無法將該藥劑與
    殘留容許量標準勾稽，農民亦無從得知其適用之容許量。

四、下列 ${missingEn.length} 種目前仍有有效許可證，影響較為直接：

${missingEn.map(r => `    ${r.zh}（農藥代號 ${r.code}｜${r.kind}／${r.type}｜有效許可證 ${r.active} 張）
      化學成分欄記載：${r.components.map(c => c.name).join("；").slice(0, 100)}`).join("\n\n")}

五、上述各筆之「化學成分」欄位內容完整，建議可據以補正英文名稱。

六、另建議於開放資料中增列「有效成分之國際普通名稱」欄位，
    以利與衛福部之殘留容許量標準勾稽。

此致
農業部動植物防疫檢疫署

`;

/* ── 函二:食品藥物管理署 ── */
const letter2 = `收件機關：衛生福利部食品藥物管理署
（食品安全衛生管理法主管機關，農藥殘留容許量標準之權責機關）

主旨：請釋示下列農藥有效成分之殘留容許量適用方式，請查照。

說明：

一、本人於查閱 貴署「農藥殘留容許量標準」（現行版本：民國115年
    4月21日修正）並與農業部農藥登記資料對照時，發現下列情形
    無法自行判斷，懇請釋示。

二、下列各項均為經農業部核准登記、農民實際可購得使用之藥劑：

（一）附表一與「得免訂定容許量之農藥一覽表」均查無之有效成分

     下列 ${noClue.length} 種農藥經農業部核准登記於特定作物，但於附表一及
     免訂容許量清單中均查無對應項目。請問此類農藥之殘留管制方式為何？
     是否併入其他項目計算，或適用附表一註五之定量極限規定？

${noClue.sort((a, b) => b.uses - a.uses).slice(0, 25).map(r => `     ${fmt(r.uses)} 項登記用途　${r.appName}`).join("\n")}
${noClue.length > 25 ? `     （其餘 ${noClue.length - 25} 種詳如附件）` : ""}

（二）混合劑之成分歸屬

     下列混合劑中，部分成分可對應至附表一，部分無法對應。
     請問混合劑之殘留管制，是否須各成分分別符合其容許量？
     無法對應之成分應如何處理？

${partialMix.sort((a, b) => b.uses - a.uses).slice(0, 12).map(r => {
  const ok = r.components.filter(c => c.hit).map(c => c.name);
  const no = r.components.filter(c => !c.hit).map(c => c.name);
  return `     ${r.appName}（${r.uses} 項登記用途）
       可對應：${ok.join("、") || "無"}
       無法對應：${no.join("、")}`;
}).join("\n")}

（三）附表一註四未列舉之異構物

     附表一註四逐項列舉異構物之殘留總量計算方式，例如第1款明列
     「賽滅寧之容許量，適用於賽滅寧及亞滅寧之殘留總量」。

     惟農業部另核准下列異構物登記，而註四未予列舉：

${unlistedIsomer.map(r => `     ${r.appName}（${r.en}）→ 疑似對應 ${r.mrlZh}（${r.mrlEn}），${r.uses} 項登記用途`).join("\n")}

     請問此類未列舉之異構物，其殘留是否併入母體計算？
     抑或應另行認定？

三、上述疑義涉及農民實際用藥後之採收安全判斷。在取得 貴署正式
    釋示前，本人不會據以推論任何法規狀態，亦不對外提供相關判定，
    以免誤導。懇請惠予釋示，至紉公誼。

此致
衛生福利部食品藥物管理署

`;

fs.writeFileSync(path.join(DIR, "詢問函-防檢署.txt"), letter1, "utf8");
fs.writeFileSync(path.join(DIR, "詢問函-食藥署.txt"), letter2, "utf8");

console.log("已產出兩封詢問函\n");
console.log(`【農業部動植物防疫檢疫署】登記資料缺漏`);
console.log(`  英文名稱為空且仍有有效許可證:${missingEn.length} 種`);
console.log(`  ${missingEn.map(r => r.zh).join("、")}\n`);
console.log(`【衛生福利部食品藥物管理署】容許量歸屬不明`);
console.log(`  附表一與免訂清單均查無:${noClue.length} 種(影響 ${noClue.reduce((n, r) => n + r.uses, 0)} 項用途)`);
console.log(`  混合劑成分部分無法對應:${partialMix.length} 種`);
console.log(`  註四未列舉之異構物:${unlistedIsomer.length} 種`);
