// Build artifact only: existing verified JS rules produce display metadata;
// the Android UI and calculations run natively, without WebView or JavaScript.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const A=require('../query-aids.js'),S=require('../safety.js'),M=require('../mrl-status.js');
function buildCatalog(){
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const raw=html.match(/^const DATA=(.*);\r?$/m)[1],data=JSON.parse(raw);
  const related={},rows=[];
  for(const [crop,pests] of Object.entries(data)){
    related[crop]={};
    for(const [pest,agents] of Object.entries(pests)){
      related[crop][pest]=A.relatedPestRegistrations(crop,pest,data).map(r=>r.pest);
      agents.forEach((a,index)=>{
        const usage=A.usagePresentation(a),phi=S.effectivePhi(a),mrl=M.resolve(crop,a.name);
        rows.push({id:crypto.createHash('sha256').update(JSON.stringify([crop,pest,index,a])).digest('hex').slice(0,24),crop,pest,...a,
          phi:phi.phi,rawPhi:phi.basePhi,phiAdjusted:phi.adjusted,
          usage,formKind:S.formKind(a.form),seed:A.isSeedTreatment(a),
          mrl:mrl?{status:mrl.status,label:mrl.label||'',evidence:mrl.evidence||''}:null});
      });
    }
  }
  return {formatVersion:1,dataVersion:html.match(/const DATA_VERSION="([^"]+)"/)[1],
    sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),
    registrationScope:'exact-crop-only',related,rows};
}
if(require.main===module){
  const output=path.join(root,'android-native/app/src/main/assets/catalog.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const catalog=buildCatalog();fs.writeFileSync(output,JSON.stringify(catalog));
  console.log('Native catalog: '+catalog.rows.length+' exact-registration rows; '+Object.keys(catalog.related).length+' crops; '+catalog.dataVersion);
}
module.exports={buildCatalog};
