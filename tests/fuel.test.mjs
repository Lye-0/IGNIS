import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({console});
for(const f of ['math','materials','fuel-world'])vm.runInContext(fs.readFileSync(new URL(`../src/${f}.js`,import.meta.url),'utf8'),context);
const I=context.Ignis,env={fuel:1,wind:.12},kinds=Object.keys(I.materials);
const advance=(world,seconds,dt=1/60)=>{for(let t=0;t<seconds-1e-7;t+=dt)world.update(dt,env);};
const shot=(world,kind)=>world.launch(kind,[.45,1.2,2.6],[.1,.5,.15]);

test('There are four materially different fuel choices',()=>assert.deepEqual(kinds,['paper','cardboard','twig','wood']));
test('Each mesh is nonempty and contains complete finite triangles',()=>{for(const kind of kinds){const g=I.fuelGeometry(kind,42);assert.ok(g.length>100);assert.equal(g.length%21,0);assert.ok(g.every(Number.isFinite));}});
test('Paper has folded-sheet geometry, not a billboard',()=>{const g=I.fuelGeometry('paper',42);let min=[9,9,9],max=[-9,-9,-9];for(let i=0;i<g.length;i+=7)for(let j=0;j<3;j++){min[j]=Math.min(min[j],g[i+j]);max[j]=Math.max(max[j],g[i+j]);}for(let i=0;i<3;i++)assert.ok(max[i]-min[i]>.2);});
test('Mesh normals have unit length',()=>{for(const kind of kinds){const g=I.fuelGeometry(kind,32);for(let i=0;i<g.length;i+=7)assert.ok(Math.abs(Math.hypot(g[i+3],g[i+4],g[i+5])-1)<1e-5);}});
test('The same material seed reproduces the mesh exactly',()=>{for(const kind of kinds)assert.deepEqual(Array.from(I.fuelGeometry(kind,42)),Array.from(I.fuelGeometry(kind,42)));});
test('Separate throws have varied shapes',()=>assert.notDeepEqual(Array.from(I.fuelGeometry('paper',42)),Array.from(I.fuelGeometry('paper',43))));
test('Unknown material IDs are rejected',()=>{assert.throws(()=>I.fuelGeometry('missing'));assert.throws(()=>new I.FuelWorld().make('missing'));});
test('Every collider is finite, positive, and inside a sensible bounding radius',()=>{for(const k of kinds)for(const c of I.fuelColliders(k)){assert.ok(c.r>0);assert.ok(c.p.every(Number.isFinite));assert.ok(Math.hypot(...c.p)<.7);}});
test('Paper is lighter and burns sooner than solid wood in this model',()=>{assert.ok(I.materials.paper.mass<I.materials.wood.mass);assert.ok(I.materials.paper.burn<I.materials.wood.burn);});
test('A fresh throw starts airborne, unlit, and contributes no heat',()=>{const w=new I.FuelWorld(),b=shot(w,'paper');w.update(.1,env);assert.equal(b.stage,'flight');assert.equal(b.power,0);assert.equal(w.boost,0);assert.equal(w.sourceCount,0);assert.ok(b.position[1]>1.2);});
test('Nonfinite launch coordinates are rejected',()=>assert.throws(()=>new I.FuelWorld().launch('paper',[NaN,0,0],[0,0,0])));
test('All material types land, then ignite with a delay',()=>{for(const k of kinds){const events=[],w=new I.FuelWorld({onEvent:e=>events.push({type:e.type,time:w.time})}),b=shot(w,k);advance(w,12);assert.ok(events.some(e=>e.type==='impact'),k);const impact=events.find(e=>e.type==='impact'),ignite=events.find(e=>e.type==='ignite');assert.ok(ignite&&ignite.time>impact.time+.2,k);assert.equal(b.stage,'burning',k);assert.ok(b.position[1]>.05&&b.position[1]<1.3,k);}});
test('Fuel goes through burning, ember, ash and eventual retirement',()=>{const events=[],w=new I.FuelWorld({onEvent:e=>events.push(e.type)});shot(w,'paper');advance(w,90);for(const event of ['impact','ignite','ember','ash'])assert.ok(events.includes(event));assert.equal(w.bodies.length,0);});
test('A piece outside the hearth does not spontaneously catch fire',()=>{const w=new I.FuelWorld(),b=w.launch('wood',[3,.5,0],[3,0,0]);advance(w,30);assert.equal(b.progress,0);assert.equal(b.power,0);assert.equal(w.boost,0);});
test('Combustion sources track the physical body location',()=>{const w=new I.FuelWorld(),b=shot(w,'paper');advance(w,7);assert.equal(w.sourceCount,1);assert.ok(Math.abs(w.sources[0]-b.position[0])<1e-5);assert.ok(Math.abs(w.sources[1]-b.position[1]-.08)<1e-5);assert.ok(Math.abs(w.sources[2]-b.position[2])<1e-5);});
test('Added fire energy is gradual and bounded, not an explosion',()=>{const w=new I.FuelWorld();for(let i=0;i<6;i++)shot(w,kinds[i%4]);advance(w,20);assert.ok(w.boost>0&&w.boost<.401);assert.ok(w.sourceCount<=12);});
test('Burning objects shrink instead of vanishing instantly',()=>{const w=new I.FuelWorld(),b=shot(w,'paper'),initial=b.scale[0];advance(w,16);assert.ok(b.progress>.2&&b.progress<.9);assert.ok(b.scale[0]<initial&&b.scale[0]>initial*.4);assert.ok(w.bodies.includes(b));});
test('Pause freezes physics, fuel consumption, and added heat',()=>{const w=new I.FuelWorld();shot(w,'wood');advance(w,8);const before=JSON.stringify(w.info());for(let i=0;i<30;i++)w.update(0,env);assert.equal(JSON.stringify(w.info()),before);});
test('Capacity does not silently delete an object that is still burning',()=>{const w=new I.FuelWorld({maxBodies:3});const a=shot(w,'paper');shot(w,'wood');shot(w,'twig');assert.equal(shot(w,'cardboard'),null);assert.equal(w.bodies.length,3);assert.ok(w.bodies.includes(a));});
test('Fixed stepping is stable across 30 Hz and 60 Hz updates',()=>{const a=new I.FuelWorld({seed:81}),b=new I.FuelWorld({seed:81});shot(a,'paper');shot(b,'paper');advance(a,5,1/30);advance(b,5,1/60);for(let i=0;i<3;i++)assert.ok(Math.abs(a.bodies[0].position[i]-b.bodies[0].position[i])<.015);});
test('Overlapping throws remain finite and above the floor',()=>{const w=new I.FuelWorld();for(let i=0;i<10;i++)shot(w,kinds[i%4]);advance(w,14);for(const b of w.bodies){assert.ok(b.position.every(Number.isFinite));assert.ok(b.position[1]>-.05);assert.ok(Math.abs(Math.hypot(...b.quaternion)-1)<1e-5);}});
test('Clear removes bodies, held object, source data, and boost',()=>{const w=new I.FuelWorld();shot(w,'paper');advance(w,8);w.held=w.make('wood');w.clear();assert.equal(w.bodies.length,0);assert.equal(w.sourceCount,0);assert.equal(w.shadowCount,0);assert.equal(w.boost,0);assert.equal(w.held,null);assert.equal(w.status(),null);});
test('The GPU fuel pass is depth tested before volumetric integration',()=>{const r=fs.readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');assert.ok(r.indexOf('this.fuelRenderer.draw')<r.indexOf('T.volume.bind()'));const f=fs.readFileSync(new URL('../src/fuel-renderer.js',import.meta.url),'utf8');assert.match(f,/gl.enable\(gl.DEPTH_TEST\)/);assert.match(f,/depth>texture\(uStaticScene/);});
test('Pointer cancellation clears the held body without throwing',()=>{const s=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');assert.match(s,/pointercancel/);assert.match(s,/function cancelFuelGesture\(\)/);assert.match(s,/world\.held=null/);});

// Representative UI releases (screen coordinates), including faster throws.
test('Assisted targets keep all 72 representative throws on a burning area',()=>{
 const M=I.math,W=1100,H=688,cam=M.camera(.3,.14,4.9,[0,1.28,0]),shift=W/H*.34;
 const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 const limit=Number(app.match(/limit=(\.[0-9]+);if\(r>limit\)/)[1]);
 for(const kind of kinds)for(const [x,y] of [[775,408],[795,340],[700,440],[760,470],[850,400],[650,390]])for(const power of [.1,.5,1]){
  const ray=M.rayAt(x,y,W,H,cam,shift,1.95),depth=2.45/Math.max(.15,M.dot(ray,cam.forward));
  const origin=cam.origin.map((v,i)=>v+ray[i]*depth);origin[1]=Math.max(.35,origin[1]);
  const target=M.intersectPlane(cam.origin,ray,[0,.52,0],[0,1,0]);
  const radius=Math.hypot(target[0],target[2]);if(radius>limit){target[0]*=limit/radius;target[2]*=limit/radius;}target[1]=.5;
  const world=new I.FuelWorld({seed:41231}),body=world.launch(kind,origin,target,{power});advance(world,13);
  assert.equal(body.stage,'burning',`${kind}, release ${x},${y}, power ${power}`);
 }
});
