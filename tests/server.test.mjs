import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
test('Static server serves split files and rejects missing paths',async()=>{
 const child=spawn(process.execPath,[fileURLToPath(new URL('../scripts/serve.mjs',import.meta.url))],{env:{...process.env,PORT:'5196'},stdio:['ignore','pipe','pipe']});
 try{
  const output=await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server start timeout')),5000))]);
  assert.match(String(output[0]),/IGNIS/);
  for(const [url,type] of [['/','text/html'],['/styles.css','text/css'],['/src/app.js','text/javascript']]){const r=await fetch('http://127.0.0.1:5196'+url);assert.equal(r.status,200);assert.ok(r.headers.get('content-type').includes(type));assert.ok((await r.text()).length>50);}
  assert.equal((await fetch('http://127.0.0.1:5196/missing.txt')).status,404);
  const traversal=await fetch('http://127.0.0.1:5196/%2e%2e%2f%2e%2e%2fetc/passwd');assert.notEqual(traversal.status,200);
 }finally{child.kill();}
});
