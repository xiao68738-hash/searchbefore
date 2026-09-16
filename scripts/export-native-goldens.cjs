// Cross-language regression oracle from existing web pure functions, no network/user data.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const safety=require('../safety.js');
function buildGoldens(){
  const context={window:{},setTimeout,clearTimeout,console};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cloud-sync.js'),'utf8'),context);
  const merge=context.window.PQC_SYNC.mergeCollection;
  const harvest=[];
  for(const date of ['2024-02-28','2026-01-01','2026-07-14','2026-12-31']){
    for(let phi=0;phi<=365;phi++){
      const expected=safety.safeHarvestDate(date,phi);
      harvest.push({date,phi,expected:[expected.getFullYear(),String(expected.getMonth()+1).padStart(2,'0'),String(expected.getDate()).padStart(2,'0')].join('-')});
    }
  }
  const sync=[];
  for(const localDeleted of [false,true])for(const remoteDeleted of [false,true])for(const localDay of [1,2,3]){
    const local=[{id:'r1',value:'local',_deleted:localDeleted,updatedAt:`2026-01-0${localDay}T00:00:00.000Z`}];
    const remote=[{id:'r1',value:'remote',_deleted:remoteDeleted,updatedAt:'2026-01-02T00:00:00.000Z'}];
    sync.push({local,remote,expected:merge(local,remote).merged});
  }
  sync.push({local:[{id:'old',updatedAt:'2025-01-01T00:00:00.000Z'}],remote:[{id:'late',updatedAt:'2024-01-01T00:00:00.000Z'}],expected:merge([{id:'old',updatedAt:'2025-01-01T00:00:00.000Z'}],[{id:'late',updatedAt:'2024-01-01T00:00:00.000Z'}]).merged});
  const batchSafety=[];
  for(const firstPhi of [null,0,7,365])for(const secondPhi of [null,0,14])for(const date of ['2026-01-01','2026-01-09','2026-02-01']){
    const records=[
      {id:'first',crop:'蔥',plotId:'plot1',date:'2026-01-01',phi:firstPhi,track:false,notify:false},
      {id:'second',crop:'蔥',plotId:'plot1',date:'2026-01-08',phi:secondPhi},
      {id:'other',crop:'蔥',plotId:'plot2',date:'2026-01-01',phi:null}
    ];
    batchSafety.push({records,plotId:'plot1',date,expected:safety.harvestStatus(records,'plot1',date)});
  }
  batchSafety.push({records:[],plotId:'plot1',date:'2026-01-01',expected:safety.harvestStatus([],'plot1','2026-01-01')});
  return {harvest,sync,batchSafety};
}
function writeGoldens(){
  const output=path.join(__dirname,'../android-native/app/src/test/resources/web-native-golden.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const data=buildGoldens();fs.writeFileSync(output,JSON.stringify(data));
  console.log(`Native web-parity fixtures: ${data.harvest.length} harvest dates, ${data.sync.length} sync cases, ${data.batchSafety.length} batch safety cases.`);
}
if(require.main===module)writeGoldens();
module.exports={buildGoldens,writeGoldens};
