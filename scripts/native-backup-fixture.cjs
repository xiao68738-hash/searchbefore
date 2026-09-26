// Synthetic data only. The web reader is the canonical reference, not a hand-copied schema.
const farm = require('../farm-records.js');
function migrationFixture() {
  const date='2026-09-18', stamp=date+'T00:00:00.000Z';
  const details={
    cultivation:{activity:'灌溉',method:'滴灌 30 分鐘'},
    fertilizer:{materialName:'測試肥料',quantity:'20',unit:'kg',dressing:'基肥',method:'撒施',lotNo:'F1'},
    harvest:{quantity:'30',unit:'kg',grade:'測試',batchNo:'H1'},
    postharvest:{process:'分級',quantity:'30',unit:'kg',destination:'測試倉庫'},
    materialPurchase:{category:'資材',materialName:'測試資材',supplier:'測試供應商',quantity:'2',unit:'包',lotNo:'M1',receiptNo:'R1'},
    equipmentMaintenance:{equipment:['噴霧機','割草機'],actions:['清潔','保養']}
  };
  const raw={schemaVersion:1, activePlotId:'plot_1',lastFarmOperator:'匿名測試者',recentCrops:['蔥','小麥'],
    fieldPlots:[1,2].map(n=>({id:'plot_'+n,crop:n===1?'蔥':'小麥',name:'測試田區 '+n,cropSource:'registered',plantDate:'2026-08-01',createdAt:date,updatedAt:stamp,variety:'測試品種',tag:'非真實農務'})),
    records:[1,2].map(n=>({id:'record_'+n,crop:n===1?'蔥':'小麥',agent:'僅測試藥劑 '+n,pest:'測試病蟲害',date,phi:n===1?7:null,
      dil:'1000',water:'20',totalWater:'40',waterRecorded:true,actualAmount:'40',actualAmountUnit:n===1?'mL':'g',
      plotId:'plot_'+n,moa:'TEST',operator:'匿名測試者',notes:'中文「引號」\n=HYPERLINK(僅文字)',registrationId:'test_registration_'+n,harvestForm:'測試採收型態',updatedAt:stamp})),
    farmRecords:Object.entries(details).map(([type,detail],i)=>({...farm.createRecord({plotId:type==='equipmentMaintenance'?'':'plot_1',type,date,details:detail,createdAt:stamp,operator:'匿名測試者',notes:'僅往返測試'},()=> 'farm_'+i),updatedAt:stamp})),
    recipes:[1,2].map(n=>({crop:'蔥',pest:'測試害蟲',agent:'僅測試配方 '+n,dil:1000,phi:n===1?7:null,water:20,unit:n===1?'毫升':'公克',moa:'TEST',dosePerHa:1.2,doseRaw:'1.2',note:'不得當成真實用藥',brands:['測試品牌'],brand:'測試品牌'}))};
  raw.farmRecords.find(r=>r.type==='harvest').safetyCheck={status:'unknown',safeDate:'',daysRemaining:null,recordCount:2,checkedAt:stamp};
  const expected=farm.readBackup(farm.buildBackup(raw,'TEST'));
  return {input:farm.buildBackup(expected,'TEST'),expected};
}
module.exports={migrationFixture};
