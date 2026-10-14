const assert = require('node:assert/strict');
(async () => {
  const {accuracyGate} = await import('../scripts/ocr-accuracy-policy.mjs');
  const scores = {textRate:0.8, structureRate:0.8, realRate:1};
  assert.equal(accuracyGate(scores).overallPass, false);
  const evidence = {independentUnseenEvaluation:true,language:'zh-Hant',realHandwrittenForms:true,reviewedDistinctFormCount:30,splitAndModelFrozenBeforeEvaluation:true,reportFiles:['text.json','structure.json','real.json']};
  assert.equal(accuracyGate({...scores,evidence}).overallPass, true);
  for (const bad of [undefined,null,NaN,Infinity,-1,1.01,0.49]) assert.equal(accuracyGate({...scores,textRate:bad,evidence}).overallPass, false);
  for (const patch of [{reviewedDistinctFormCount:1},{reviewedDistinctFormCount:30.5},{reviewedDistinctFormCount:'30'},{language:'en'},{independentUnseenEvaluation:false},{splitAndModelFrozenBeforeEvaluation:false},{reportFiles:[]}]) assert.equal(accuracyGate({...scores,evidence:{...evidence,...patch}}).overallPass, false);
  console.log('OCR research gate: missing evidence, reused split, one-form field inflation and invalid rates fail closed');
})().catch(error => {console.error(error);process.exitCode=1;});
