import { existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const app=fileURLToPath(new URL('../',import.meta.url));process.chdir(app);
const run=(command)=>{const r=spawnSync(process.platform==='win32'?'cmd.exe':'sh',process.platform==='win32'?['/d','/s','/c',command]:['-c',command],{cwd:app,stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);};
if(!existsSync('node_modules/vite')){console.log('Installing dependencies (internet required on first setup)...');run('npm ci');}
const newest=(p)=>statSync(p).isDirectory()?Math.max(...readdirSync(p).map(n=>newest(path.join(p,n)))):statSync(p).mtimeMs;
const built=existsSync('dist/index.html')?statSync('dist/index.html').mtimeMs:0;
if(!built||Math.max(newest('src'),newest('public'),newest('index.html'),newest('package.json'))>built){console.log('Building local application...');run('npm run build');}
await import('./serve.mjs');
