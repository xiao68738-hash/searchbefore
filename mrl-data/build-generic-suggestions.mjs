import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(directory, '登記但待確認-通用列與近似名.csv');
const rulesPath = path.join(directory, '通用列規則整理.md');
const cropMapPath = path.join(directory, '作物分類對照.json');
const latestPath = path.join(directory, 'latest.json');
const outputPath = path.join(directory, '通用列建議-待複核.csv');

function parseCsv(text) {
  const matrix = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const character = source[i];
    if (quoted) {
      if (character === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) matrix.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field);
    matrix.push(row);
  }
  const [header, ...data] = matrix;
  return data.map((values) => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ''])));
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function normalizeIngredient(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function markerPayload(segment, marker) {
  const index = segment.indexOf(marker);
  if (index < 0) return null;
  let value = segment.slice(index + marker.length);
  if (value.endsWith(')')) value = value.slice(0, -1);
  return value;
}

function parseRuleSections(markdown) {
  const sections = new Map();
  const matches = [...markdown.matchAll(/^###\s+(\d{3})\.\s+(.+)$/gm)];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const end = matches[i + 1]?.index ?? markdown.length;
    const body = markdown.slice(match.index, end);
    sections.set(match[2], {
      number: match[1],
      body,
      explicitStarRule: body.includes('明文規則：附表一註五'),
      noExplicitDefinition: body.includes('找不到逐列明文定義') || body.includes('疑似') || body.includes('無可靠母類映射'),
    });
  }
  return sections;
}

function splitExactLabels(payload, labels) {
  const memo = new Map();
  function solve(position) {
    if (position === payload.length) return [];
    if (memo.has(position)) return memo.get(position);
    for (const label of labels) {
      if (!payload.startsWith(label, position)) continue;
      const end = position + label.length;
      if (end === payload.length) {
        const result = [label];
        memo.set(position, result);
        return result;
      }
      if (payload[end] !== '、') continue;
      const remainder = solve(end + 1);
      if (remainder) {
        const result = [label, ...remainder];
        memo.set(position, result);
        return result;
      }
    }
    memo.set(position, null);
    return null;
  }
  return solve(0);
}

const sourceRows = parseCsv(fs.readFileSync(sourcePath, 'utf8')).filter((row) => row['原因'] === '通用列');
if (sourceRows.length !== 755) throw new Error(`預期 755 筆通用列來源，實際 ${sourceRows.length} 筆`);

const rulesText = fs.readFileSync(rulesPath, 'utf8');
const rules = parseRuleSections(rulesText);
const genericLabels = [...rules.keys()].sort((a, b) => b.length - a.length);
if (genericLabels.length !== 181) throw new Error(`預期 D 檔 181 節，實際 ${genericLabels.length} 節`);

const cropMapData = JSON.parse(fs.readFileSync(cropMapPath, 'utf8'));
const cropMap = new Map(cropMapData.rows.map((row) => [row.crop, row]));
const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8')).rows;
const latestIndex = new Map();
for (const row of latest) {
  const key = `${normalizeIngredient(row['國際普通名稱'])}\u0000${row['作物類別']}`;
  if (!latestIndex.has(key)) latestIndex.set(key, []);
  latestIndex.get(key).push(row);
}

const classI = new Set([
  '包葉菜類', '小葉菜類', '根莖菜類', '蕈菜類', '果菜類', '瓜菜類', '豆菜類',
  '芽菜類', '瓜果類', '大漿果類', '小漿果類', '核果類', '梨果類', '柑桔類',
]);
const classII = new Set(['米類', '麥類', '雜糧類', '乾豆類']);
const starLabelByClass = new Map([
  ['I', '其他(蔬果類)*'],
  ['II', '其他(穀類)*'],
  ['III', '其他(茶類)*'],
]);

function testClass(cropRow) {
  if (!cropRow || ['需人工', '跨類別', '非農產品', '觀賞花卉'].includes(cropRow.tier)) return null;
  if (classI.has(cropRow.category)) return 'I';
  if (classII.has(cropRow.category)) return 'II';
  if (cropRow.category === '茶類') return 'III';
  // 香辛植物及其他草木本植物須依鮮食／乾燥分 I／III；現有作物名稱沒有型態資訊。
  return null;
}

function exactMrl(ingredient, label) {
  const rows = latestIndex.get(`${normalizeIngredient(ingredient)}\u0000${label}`) || [];
  const values = [...new Set(rows.map((row) => row['容許量ppm']).filter((value) => value !== ''))];
  return values.length === 1 ? values[0] : null;
}

function evaluateComponent(crop, ingredient, labels) {
  const cropRow = cropMap.get(crop);
  const cropClass = testClass(cropRow);
  const matchingStar = cropClass ? starLabelByClass.get(cropClass) : null;
  const matchingRule = matchingStar && labels.includes(matchingStar) ? rules.get(matchingStar) : null;
  const references = labels.map((label) => rules.get(label)?.number).filter(Boolean);

  const ordinaryLabels = labels.filter((label) => !label.includes('*'));
  if (ordinaryLabels.length > 0) {
    const hasUnsafeRule = ordinaryLabels.some((label) => {
      const rule = rules.get(label);
      return !rule || rule.noExplicitDefinition || !rule.explicitStarRule;
    });
    if (hasUnsafeRule) {
      return {
        suggestion: '規則無明文（D 檔標示一般「其他…」列無逐列明文定義；即使另有星號列也不得略過此不確定性）',
        references: references.join('、'),
        value: '',
      };
    }
  }

  if (matchingRule?.explicitStarRule) {
    const value = exactMrl(ingredient, matchingStar);
    if (value !== null) {
      return {
        suggestion: `建議涵蓋（附表一註五檢體 ${cropClass} 類；只代表定量極限，不代表核准用藥範圍）`,
        references: matchingRule.number,
        value,
      };
    }
    return {
      suggestion: '規則無明文（找不到成分＋星號列的唯一容許量原文，不得推定）',
      references: matchingRule.number,
      value: '',
    };
  }

  const onlyStars = labels.every((label) => label.includes('*'));
  if (cropClass && onlyStars) {
    return {
      suggestion: `建議不涵蓋（作物對應檢體 ${cropClass} 類，但成分沒有相符星號列）`,
      references: references.join('、'),
      value: '',
    };
  }

  return {
    suggestion: '規則無明文（作物分類或鮮／乾型態不足，不能選定星號檢體類別）',
    references: references.join('、'),
    value: '',
  };
}

const results = [];
let pendingComponents = 0;
for (const source of sourceRows) {
  const components = [];
  for (const segment of source['成分逐一判定'].split(' | ')) {
    const payload = markerPayload(segment, '標準有通用列:');
    if (!payload) continue;
    const ingredient = segment.slice(0, segment.indexOf('='));
    const labels = splitExactLabels(payload, genericLabels);
    if (!labels) throw new Error(`無法逐字拆解通用列：${payload}`);
    const evaluation = evaluateComponent(source['作物'], ingredient, labels);
    components.push({ ingredient, labels, ...evaluation });
    pendingComponents += 1;
  }
  if (components.length === 0) throw new Error(`通用列來源沒有待確認成分：${source['作物']}／${source['藥劑']}`);
  results.push({ source, components });
}

const header = ['作物', '藥劑', '成分', '通用列名', '建議', '引用規則節號', '容許量ppm(建議涵蓋時)'];
const lines = [header.map(csvCell).join(',')];
for (const { source, components } of results) {
  lines.push([
    source['作物'],
    source['藥劑'],
    components.map((item) => item.ingredient).join(' || '),
    components.map((item) => item.labels.join('、')).join(' || '),
    components.map((item) => `${item.ingredient}：${item.suggestion}`).join(' || '),
    components.map((item) => item.references || '-').join(' || '),
    components.map((item) => item.value || '-').join(' || '),
  ].map(csvCell).join(','));
}

fs.writeFileSync(outputPath, `\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');

const componentResults = results.flatMap((row) => row.components);
const counts = {
  suggestedCovered: componentResults.filter((item) => item.suggestion.startsWith('建議涵蓋')).length,
  suggestedNotCovered: componentResults.filter((item) => item.suggestion.startsWith('建議不涵蓋')).length,
  noExplicitRule: componentResults.filter((item) => item.suggestion.startsWith('規則無明文')).length,
};
console.log(JSON.stringify({ outputPath, sourceRows: results.length, pendingComponents, ruleSections: rules.size, counts }, null, 2));
