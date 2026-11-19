import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
const root=fileURLToPath(new URL('../dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
try{await stat(path.join(root,'index.html'));}catch{console.error('Build not found. Run npm run build, or use Start-Pose-Studio.cmd.');process.exit(1);}
const server=http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=path.resolve(root,`.${pathname==='/'?'/index.html':pathname}`);
    if(!target.startsWith(root)){res.writeHead(403).end();return;}
    const body=await readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]??'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(body);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('File not found');}
});
let port=4173;
server.on('error',err=>{if(err.code==='EADDRINUSE'&&port<4193){port++;server.listen(port,'127.0.0.1');}else{console.error(err);process.exit(1);}});
server.on('listening',()=>{const url=`http://127.0.0.1:${port}`;console.log(`Pose Atelier is running: ${url}\nKeep this window open. Press Ctrl+C to stop.`);if(!process.argv.includes('--no-open')){if(process.platform==='win32')execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true});}});
server.listen(port,'127.0.0.1');
