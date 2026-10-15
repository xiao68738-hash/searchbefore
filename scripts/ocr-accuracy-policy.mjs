// A numerical score alone cannot establish an independent Traditional-Chinese test.
export const validRate = value => Number.isFinite(value) && value >= 0 && value <= 1;
export function accuracyGate({textRate, structureRate, realRate, evidence}) {
  const gate = {
    textAtLeast50: validRate(textRate) && textRate >= 0.5,
    structureAtLeast50: validRate(structureRate) && structureRate >= 0.5,
    realFieldsAtLeast50: validRate(realRate) && realRate >= 0.5,
    independentUnseenEvaluation: evidence?.independentUnseenEvaluation === true,
    traditionalChineseRealForms: evidence?.language === 'zh-Hant' && evidence?.realHandwrittenForms === true,
    atLeast30DistinctReviewedForms: Number.isInteger(evidence?.reviewedDistinctFormCount) && evidence.reviewedDistinctFormCount >= 30,
    splitAndModelFrozenBeforeEvaluation: evidence?.splitAndModelFrozenBeforeEvaluation === true,
    evidenceReferencesPresent: Array.isArray(evidence?.reportFiles) && evidence.reportFiles.length >= 3 && evidence.reportFiles.every(file => typeof file === 'string' && file.trim().length > 0)
  };
  return {...gate, overallPass:Object.values(gate).every(value => value === true)};
}
