/* 產生給主管機關的詢問函。

   ── 撰寫原則 ──
   1. 正文只問「原則」,不塞入數十個品項名稱。
      承辦人要能在三十秒內判斷這是什麼問題、該轉給誰。
   2. 品項明細全部放附件,而且附件中的每個普通名稱都已拆成
      完整英文有效成分 —— 否則真正想問的映射規則,
      會被表面上的名稱解析問題蓋過去。
   3. 這是民眾詢問,不是公文。不用「請查照」「至紉公誼」。

   兩個機關權責不同,不可混為一談:
     農藥登記(許可證、有效成分名稱)→ 農業部動植物防疫檢疫署
     殘留容許量(附表一、免訂清單) → 衛生福利部食品藥物管理署 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const read = f => {
  const p = path.join(DIR, f);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
};

const noEn = read("無英文名解析.json");
const att = read("待釐清清單.json");
if (!att) {
  console.error("缺少 待釐清清單.json，請先執行 node mrl-data/build-inquiry-attachment.mjs");
  process.exit(1);
}

const missingEn = (noEn?.rows || []).filter(r => r.active > 0);
const pending = att.rows.filter(r => !r.allCovered);
const mixCount = pending.filter(r => r.kind === "混合劑").length;
const ATTACHMENT = "農藥普通名稱與殘留容許量項目待釐清清單.csv";

/* ── 函一:食品藥物管理署 ── */
const letter1 = `收件機關：衛生福利部食品藥物管理署

主旨：請協助釐清農藥普通名稱、混合成分及鹽類／異構物與農藥殘留
      容許量項目之對應原則

說明：

一、本人進行農業部農藥登記開放資料與 貴署「農藥殘留容許量標準」
    之資料校對時，依民國115年4月21日修正發布之第三條附表一進行
    比對，發現部分農藥普通名稱無法直接對應至附表項目，爰請協助
    釐清。相關品項、完整英文有效成分、登記用途數及初步比對結果，
    詳如附件「${ATTACHMENT}」，計 ${pending.length} 項。

二、敬請協助說明下列對應原則：

（一）混合劑之普通名稱

     例如「賽速洛寧」（LAMBDA-CYHALOTHRIN + THIAMETHOXAM）等
     ${mixCount} 項混合劑，其殘留是否應拆分為各有效成分，分別依其殘留
     定義及登記作物之容許量判定，而非以混合劑之普通名稱直接查詢？

     附件中已將各混合劑依許可證「英文名稱」欄位拆解為個別成分，
     並逐一標示比對結果，敬請確認此拆解方式是否正確。

（二）二硫代胺基甲酸鹽、含銅製劑及其他複合名稱

     例如「鋅錳座賽胺」（MANCOZEB + ZOXAMIDE）、「銅右滅達樂」
     （COPPER OXYCHLORIDE + METALAXYL-M）、「撲克拉錳」
     （PROCHLORAZ-MANGANESE）等品項，應如何對應至附表一之項目
     或殘留定義？

     其中鋅錳乃浦、錳乃浦等成分，是否即依附表一註一「二硫代胺基
     甲酸鹽類」之規定，以 CS2 計併入群組總量辦理？

     另「撲克拉錳」依化學成分為撲克拉與錳之錯合物，而非兩種有效
     成分之混合，此類是否另有處理原則？

（三）鹽類及不同立體化學形式

     1. 嘉磷塞異丙胺鹽（GLYPHOSATE IPA）、嘉磷塞胺鹽
        （GLYPHOSATE AMMONIUM）之殘留，是否均依附表一「嘉磷塞」
        項目判定？如是，是否需換算為母體酸量？

     2. 附表一註四已逐項列舉部分異構物之殘留總量計算方式。惟農業部
        另核准「傑他賽滅寧」（ZETA-CYPERMETHRIN）、「伽瑪賽洛寧」
        （GAMMA-CYHALOTHRIN）、「左固殺草」（glufosinate-P）等
        登記，而註四未予列舉。

        此類未列舉之異構物，其殘留是否併入相關母體計算？抑或應
        另行認定？

（四）英文名稱與中文普通名稱不一致者

     部分品項之英文名稱與附表一寫法不同，但中文通用名相同。
     例如許可證之「賽洛寧」英文名為 LAMBDA-CYHALOTHRIN，
     而附表一「賽洛寧」之國際普通名稱為 Cyhalothrin。

     此類情形應以中文通用名或英文名稱為對應依據？

（五）確實無法對應之成分

     經依完整英文有效成分及附表各註釋比對後，仍無法對應至附表一
     或「得免訂定容許量之農藥一覽表」者，其管制方式為何？
     是否為不得檢出，或於符合特定條件時適用附表一註五之定量極限
     規定？

三、如 貴署已有可供查詢或下載之「農藥登記成分—殘留容許量項目—
    殘留定義」對應資料，亦懇請提供資料名稱或取得方式，以利後續
    正確引用。

四、另關於農藥登記開放資料之「英文名稱」欄位缺漏一事，因涉農藥
    登記權責，本人已另函農業部動植物防疫檢疫署，併予敘明。

此項校對涉及農藥資料之正確呈現。在取得正式說明前，本人不會自行
判定相關品項之法規適用結果。敬請惠予說明，謝謝。

附件：${ATTACHMENT}
`;

/* ── 函二:動植物防疫檢疫署 ── */
const letter2 = `收件機關：農業部動植物防疫檢疫署

主旨：建議補正農藥開放資料中「英文名稱」欄位之缺漏

說明：

一、本人使用 貴署農藥資料開放平臺
    （https://data.moa.gov.tw/Service/OpenData/FromM/PesticideData.aspx）
    進行資料校對時，發現全量 11,869 張許可證中，有 111 張之
    「英文名稱」欄位為空值，涵蓋 27 種中文名稱；其中 17 張連
    「中文名稱」欄位亦為空值。

二、此欄位缺漏造成之實務困難：

    衛生福利部「農藥殘留容許量標準」附表一係以國際普通名稱
    （英文）為主要對照依據。英文名稱缺漏時，無法將該藥劑與殘留
    容許量標準勾稽。

三、下列 ${missingEn.length} 種目前仍有有效許可證，影響較為直接：

${missingEn.map(r => `    ${r.zh}（農藥代號 ${r.code}｜${r.kind}／${r.type}｜有效許可證 ${r.active} 張）
      化學成分欄記載：${r.components.map(c => c.name).join("；").slice(0, 100)}`).join("\n\n")}

四、上述各筆之「化學成分」欄位內容完整，建議可據以補正英文名稱。

五、另建議於開放資料中增列「有效成分之國際普通名稱」欄位，
    以利與衛生福利部之殘留容許量標準勾稽。

六、另關於該等藥劑之殘留容許量適用方式，因涉容許量標準權責，
    本人已另函衛生福利部食品藥物管理署，併予敘明。

敬請惠予參考，謝謝。
`;

fs.writeFileSync(path.join(DIR, "詢問函-食藥署.txt"), letter1, "utf8");
fs.writeFileSync(path.join(DIR, "詢問函-防檢署.txt"), letter2, "utf8");

console.log("已產出兩封詢問函\n");
console.log(`【食藥署】正文只問原則，品項置於附件`);
console.log(`  附件品項：${pending.length} 種（其中混合劑 ${mixCount} 種）`);
console.log(`  已自行結案不列入：${att.rows.length - pending.length} 種`);
console.log(`\n【防檢署】登記資料缺漏`);
console.log(`  仍有有效許可證者：${missingEn.length} 種`);
console.log(`  ${missingEn.map(r => r.zh).join("、")}`);
