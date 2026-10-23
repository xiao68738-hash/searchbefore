// Safe loopback preview of the built integrated app, with external services blocked.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../dist');
function createServer(){return http.createServer((req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
 if(!['GET','HEAD'].includes(req.method)||!/^[a-zA-Z0-9.-]+$/.test(name)||name==='sw.js'){res.writeHead(404);return res.end();}
 const file=path.join(root,name);
 if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'text/plain','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"});
 if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
 });}
module.exports={createServer};
if(require.main===module)createServer().listen(0,'127.0.0.1',function(){console.log('Integrated preview: http://127.0.0.1:'+this.address().port);});
