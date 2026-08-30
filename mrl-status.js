(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.PQC_MRL=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";

  const SOURCE={
    title:"衛生福利部《農藥殘留容許量標準》",
    amendedOn:"2026-04-21",
    reviewedOn:"2026-07-29",
    url:"https://www.fda.gov.tw/TC/law.aspx?cid=62&key=%E8%BE%B2%E8%97%A5&scid=65"
  };

  /* 只收錄人工已確認、檢核完成的精確「登記作物 × 普通名稱」組合。
     不做相似字、別名或作物群組的自動擴張，避免把比對失敗誤標成不得檢出。 */
  const REVIEWED=[
    ["小麥","納乃得","Methomyl 無小麥、麥類或穀類通用列"],
    ["木瓜","嘉賜銅","Copper oxychloride 免訂；Kasugamycin 無木瓜或大漿果類容許量"],
    ["水稻","聚乙醛","Metaldehyde 僅列火龍果，無水稻或米類容許量"],
    ["仙草","納乃得","Methomyl 無仙草或可涵蓋群組容許量"],
    ["仙草","畢達本","Pyridaben 無仙草容許量"],
    ["瓜菜類","嘉賜銅","Copper 免訂；Kasugamycin 無瓜菜類及其成員容許量"],
    ["甘藍","嘉賜銅","Copper 免訂；Kasugamycin 無甘藍或十字花科包葉菜類容許量"],
    ["艾草","納乃得","Methomyl 無艾草或香辛植物類容許量"],
    ["洋蔥","嘉賜銅","Kasugamycin 無洋蔥容許量；Copper 免訂"],
    ["胡瓜","嘉賜銅","Kasugamycin 無胡瓜容許量；Copper 免訂"],
    ["茶","快得寧","Oxine-copper 無茶容許量"],
    ["蓮霧","嘉賜快得寧","Kasugamycin 無蓮霧容許量"],
    ["蓮霧","嘉賜貝芬","Kasugamycin 無蓮霧或小漿果類容許量；混合劑任一成分缺口即成立提醒"],
    ["蓮霧","嘉賜銅","Kasugamycin 無蓮霧容許量；Copper 免訂"],
    ["蔥科根菜類","免扶克","Benfuracarb 無洋蔥、蕗蕎或蒜容許量"],
    ["豌豆","培丹","Cartap 無豌豆容許量"],
    ["豌豆","脫克松","Tolclofos-methyl 無豌豆容許量"]
  ].map(function(row){return {crop:row[0],agent:row[1],evidence:row[2]}});

  function norm(value){return String(value==null?"":value).trim().replace(/\s+/g,"")}
  const INDEX=new Map(REVIEWED.map(function(row){return [norm(row.crop)+"\u0000"+norm(row.agent),row]}));

  function lookup(crop,agent){
    const row=INDEX.get(norm(crop)+"\u0000"+norm(agent));
    return row?Object.assign({},row,{status:"reviewed-no-detect",source:SOURCE}):null;
  }

  return {SOURCE:SOURCE,REVIEWED:REVIEWED,lookup:lookup};
});
