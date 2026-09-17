import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const port=Number(process.env.PORT||5173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
export function resolvePath(url){const clean=decodeURIComponent(new URL(url,'http://localhost').pathname);const p=path.resolve(root,'.'+clean);if(p!==root&&!p.startsWith(root+path.sep))return null;return p;}
const server=http.createServer(async(req,res)=>{try{let p=resolvePath(req.url||'/');if(!p){res.writeHead(403);return res.end('Forbidden');}if((await stat(p)).isDirectory())p=path.join(p,'index.html');const data=await readFile(p);res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}});
server.on('error',e=>{console.error(e.message);process.exitCode=1;});server.listen(port,'0.0.0.0',()=>console.log(`IGNIS: http://localhost:${port}`));
