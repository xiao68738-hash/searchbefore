(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.PQC_MRL=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";

  const SOURCE=Object.freeze({
    title:"衛生福利部《農藥殘留容許量標準》",
    amendedOn:"2026-04-21",
    reviewedOn:"2026-07-29",
    sourceCheckedOn:"2026-09-11",
    url:"https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0040083"
  });

  /* 只收錄人工已確認、檢核完成的精確「登記作物 × 普通名稱」組合。
     不做相似字、別名或作物群組的自動擴張，避免把比對失敗誤標成不得檢出。 */
  const REVIEWED=Object.freeze([
    ["小麥","納乃得","Methomyl 無小麥、麥類或穀類通用列"],
    ["木瓜","嘉賜銅","Copper oxychloride 免訂；Kasugamycin 無木瓜或大漿果類容許量"],
    ["水稻","聚乙醛","Metaldehyde 僅列火龍果，無水稻或米類容許量"],
    ["仙草","納乃得","Methomyl 無仙草或可涵蓋群組容許量"],
    ["仙草","畢達本","Pyridaben 無仙草容許量"],
    ["瓜菜類","嘉賜銅","Copper oxychloride 免訂；Kasugamycin 無瓜菜類及既有複核成員容許量；個別作物須另核分類"],
    ["甘藍","嘉賜銅","Copper oxychloride 免訂；Kasugamycin 無甘藍或十字花科包葉菜類容許量"],
    ["艾草","納乃得","Methomyl 無艾草或香辛植物類容許量"],
    ["洋蔥","嘉賜銅","Kasugamycin 無洋蔥容許量；Copper oxychloride 免訂"],
    ["胡瓜","嘉賜銅","Kasugamycin 無胡瓜容許量；Copper oxychloride 免訂"],
    ["茶","快得寧","Oxine-copper 無茶容許量"],
    ["蓮霧","嘉賜快得寧","Kasugamycin 無蓮霧容許量"],
    ["蓮霧","嘉賜貝芬","Kasugamycin 無蓮霧或小漿果類容許量；提醒針對該成分，不表示混劑所有成分均無標準"],
    ["蓮霧","嘉賜銅","Kasugamycin 無蓮霧容許量；Copper oxychloride 免訂"],
    ["蔥科根菜類","免扶克","Benfuracarb 列有小葉菜類 1.0 ppm；蒜、蕗蕎與其鱗莖須依採收部位及附表五區分，不能用查無同名直接判定"],
    ["豌豆","培丹","App 現有登記備註限定葉用豌豆；Cartap 列有小葉菜類 2.0 ppm。原先僅以豌豆同名查無所作的不得檢出標示不適用這筆登記"],
    ["豌豆","脫克松","Tolclofos-methyl 無豌豆、豆菜類或乾豆類容許量；本次提醒僅限鮮豆莢或乾豆，不擴張到葉用或芽菜"]
  ].map(function(row){return Object.freeze({crop:row[0],agent:row[1],evidence:row[2]})}));

  function norm(value){return String(value==null?"":value).trim().replace(/\s+/g,"")}
  const INDEX=new Map(REVIEWED.map(function(row){return [norm(row.crop)+"\u0000"+norm(row.agent),row]}));

  /* 歷史人工白名單並不等於所有採收部位皆適用；先套用重檢限制。
     registrationCrop 只能來自該筆登記，不得用名稱猜測上位群組。 */
  function resolve(crop,agent,options){
    options=options||{};
    const selected=norm(crop),name=norm(agent),form=norm(options.form);
    if(!selected||!name)return null;
    let row=INDEX.get(selected+"\u0000"+name);
    let inherited=false;
    if(!row&&options.registrationCrop){
      row=INDEX.get(norm(options.registrationCrop)+"\u0000"+name);
      inherited=!!row;
    }
    if(!row)return null;
    let status="reviewed-no-detect",scopeNote="";
    if(inherited){
      status="scope-needs-review";
      scopeNote="原登記群組有複核提醒，但尚未核實可套用於目前作物與採收部位；不能直接推論不得檢出。";
    }else if(row.crop==="蔥科根菜類"){
      status="scope-needs-review";
      scopeNote="暫停原群組的直接不得檢出標示；請先確認實際作物、採收部位與適用食品分類。";
    }else if(row.crop==="豌豆"&&row.agent==="培丹"){
      status="scope-needs-review";
      scopeNote="撤下原不得檢出標示，保留分類覆核提醒；現有用法明載葉用豌豆，切換採收選項不會產生鮮豆莢或乾豆的登記用途。容許量存在不代表任意用法或實際殘留均合格。";
    }else if(row.crop==="豌豆"){
      if(form==="鮮豆莢"||form==="乾豆"){
        scopeNote="本提醒限目前選取的「"+form+"」，不適用葉用豌豆或芽菜。";
      }else{
        status="scope-needs-review";
        scopeNote=form?"目前採收型態「"+form+"」不在這筆已確認提醒的適用範圍；需另核分類，不代表已確認可用或免訂。":"請先區分鮮豆莢、乾豆、葉用或芽菜；本筆不得檢出提醒僅適用鮮豆莢或乾豆。";
      }
    }
    return Object.assign({},row,{status:status,selectedCrop:String(crop),form:form,scopeNote:scopeNote,source:SOURCE});
  }

  // 舊 HTML 只看 lookup 是否非空，故不能回傳待確認物件，否則又被畫成紅色。
  function lookup(crop,agent,options){
    const hit=resolve(crop,agent,options);
    return hit&&hit.status==="reviewed-no-detect"?hit:null;
  }
  return Object.freeze({SOURCE:SOURCE,REVIEWED:REVIEWED,lookup:lookup,resolve:resolve});
});
