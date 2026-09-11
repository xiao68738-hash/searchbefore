import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Read-only: never replaces snapshots or promotes candidates to runtime warnings.
const sources=[['latest.json',13],['mrl-exempt-latest.json',14],['crop-categories-latest.json',16]];
const hash=rows=>crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const live=process.argv.includes('--live');
const results=await Promise.all(sources.map(async([filename,id])=>{
  const saved=JSON.parse(fs.readFileSync(fileURLToPath(new URL('../mrl-data/'+filename,import.meta.url)),'utf8'));
  const url=`https://data.fda.gov.tw/data/opendata/export/${id}/json`;
  try{
    if(!Array.isArray(saved.rows)||saved.rows.length!==saved.count||hash(saved.rows)!==saved.contentSha256)throw Error('Local snapshot count/hash mismatch');
    const result={filename,url,snapshotRetrievedAt:saved.retrievedAt,count:saved.rows.length,sha256:hash(saved.rows)};
    if(live){
      const response=await fetch(url,{signal:AbortSignal.timeout(25000),redirect:'error'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const rows=await response.json();
      if(!Array.isArray(rows)||!rows.length)throw Error('Expected non-empty official row array');
      result.checkedAt=new Date().toISOString();
      result.liveCount=rows.length;
      result.liveSha256=hash(rows);
      result.unchanged=result.sha256===result.liveSha256;
      if(!result.unchanged)process.exitCode=1;
    }
    return result;
  }catch(error){process.exitCode=1;return {filename,url,error:error.message};}
}));
console.log(JSON.stringify({mode:live?'live-comparison':'local-integrity',results},null,2));
