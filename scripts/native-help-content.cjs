// Extract only repository-authored reading content. Never embed HTML, ads, scripts or remote code.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const files=['guide-label.html','guide-dilution.html','guide-phi.html','guide-ppe.html'];
function text(html){
  return html.replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi,'')
    .replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:p|h[1-6]|li|div|section|tr)>/gi,'\n\n')
    .replace(/<\/(?:td|th)>/gi,' | ').replace(/<[^>]*>/g,'')
    .replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity)=>{
      if(entity[0]==='#') { const n=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10); return n>0&&n<=0x10ffff?String.fromCodePoint(n):''; }
      return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[entity.toLowerCase()];
    }).replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
function buildHelp(root){
  const guides=files.map(id=>{
    const html=fs.readFileSync(path.join(root,id),'utf8');
    const title=html.match(/<h1>([\s\S]*?)<\/h1>/i), lead=html.match(/<p class="lead">([\s\S]*?)<\/p>/i), article=html.match(/<article>([\s\S]*?)<\/article>/i);
    if(!title||!lead||!article)throw new Error(`Guide structure changed: ${id}`);
    const body=text(lead[1]+'\n\n'+article[1]);
    if(body.length<300||body.length>30000||!body.includes('安全界線')||!body.includes('官方來源'))throw new Error(`Guide validation failed: ${id}`);
    return {id,title:text(title[1]),sourceUrl:`https://searchbefore.tw/${id}`,sourceSha256:crypto.createHash('sha256').update(html).digest('hex'),blocks:body.split(/\n\n+/)};
  });
  const config=fs.readFileSync(path.join(root,'service-config.js'),'utf8');
  const feedbackEmail=config.match(/feedbackEmail:\s*"([^"\r\n]+)"/)?.[1]||'';
  if(feedbackEmail&&!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(feedbackEmail))throw new Error('Invalid public feedback address');
  const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const announcementSource=home.match(/const ANNOUNCE=\[([\s\S]*?)\];/)?.[1];
  if(!announcementSource)throw new Error('Announcement structure changed');
  // Parse string-only repository entries, never execute JavaScript or copy HTML.
  const announcements=Array.from(announcementSource.matchAll(/\{date:"([^"\r\n]+)",version:"([^"\r\n]+)",title:"([^"\r\n]+)",body:"([^"\r\n]+)"(?=,|\})/g),m=>({date:m[1],version:m[2],title:text(m[3]),body:text(m[4])}));
  if(!announcements.length || announcements.length!==Array.from(announcementSource.matchAll(/\{date:/g)).length)throw new Error('Announcement parser needs review');
  return {guides,feedbackEmail,announcements};
}
module.exports={buildHelp,text,files};
