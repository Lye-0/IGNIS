import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({console});
for(const file of ['math','materials','fuel-world','input'])vm.runInContext(fs.readFileSync(new URL(`../src/${file}.js`,import.meta.url),'utf8'),context);
const I=context.Ignis,env={fuel:1,wind:.12},kinds=Object.keys(I.materials);
const step=(world,seconds,dt=1/120)=>{for(let t=0;t<seconds-1e-7;t+=dt)world.update(dt,env);};
const launch=(w,k='paper')=>w.launch(k,[.45,1.2,2.6],[.1,.5,.15]);
const until=(w,p,max=15)=>{for(let t=0;t<max&&!p();t+=1/120)w.update(1/120,env);assert.ok(p(),'Expected event occurs');};

test('All four response profiles are finite, positive and immutable',()=>{for(const k of kinds){const p=I.materials[k].response;assert.ok(Object.isFrozen(p));for(const v of Object.values(p))assert.ok(Number.isFinite(v)&&v>0);}});
test('Paper gives a faster, stronger ignition pulse than wood; wood displaces more embers',()=>{const p=I.materials.paper.response,w=I.materials.wood.response;assert.ok(p.strength>w.strength);assert.ok(p.attack<w.attack);assert.ok(p.impact<w.impact);});
test('Envelope starts at zero and reaches exactly one at its chosen attack time',()=>{for(const k of kinds){const p=I.materials[k].response;assert.equal(I.fuelResponse.envelope(0,p.attack,p.decay),0);assert.equal(I.fuelResponse.envelope(p.attack,p.attack,p.decay),1);}});
test('Response envelope rises, then decays, without an abrupt flash',()=>{const p=I.materials.paper.response;let last=0;for(let i=0;i<=100;i++){const v=I.fuelResponse.envelope(p.attack*i/100,p.attack,p.decay);assert.ok(v>=last-1e-10&&v<=1);last=v;}for(let i=1;i<=500;i++){const v=I.fuelResponse.envelope(p.attack+i/100,p.attack,p.decay);assert.ok(v<=last&&v>=0);last=v;}assert.ok(last<.0001);});
test('Invalid envelope values cannot introduce NaNs',()=>{for(const age of [NaN,Infinity,-1])assert.equal(I.fuelResponse.envelope(age,.2,.4),0);assert.equal(I.fuelResponse.envelope(1,0,.4),0);assert.equal(I.fuelResponse.envelope(1,.2,0),0);});
test('An airborne material produces neither an ignition pulse nor a light flash',()=>{const w=new I.FuelWorld();launch(w);step(w,.1);assert.equal(w.surgeCount,0);assert.equal(w.flare,0);});
test('Landing entrains existing fire without igniting the new object',()=>{const w=new I.FuelWorld(),b=launch(w,'wood');until(w,()=>b.impact);step(w,.08);assert.ok(w.surges.some(s=>s.type==='impact'));assert.equal(b.power,0);assert.equal(w.sourceCount,0);assert.ok(w.surgeCount>0);assert.equal(w.surgeInfo[3],0);});
test('Objects outside the fire produce no hot-gas surge on impact',()=>{const w=new I.FuelWorld(),b=w.launch('wood',[3,.5,0],[3,0,0]);step(w,6);assert.ok(b.impact);assert.equal(w.flare,0);assert.equal(w.surgeCount,0);assert.equal(w.surges.length,0);});
test('Each material ignites once and emits its own delayed response',()=>{for(const k of kinds){const events=[],w=new I.FuelWorld({onEvent:e=>events.push(e)}),b=launch(w,k);until(w,()=>b.stage==='burning');const surge=w.surges.find(s=>s.type==='ignite');assert.ok(surge,k);assert.equal(surge.attack,I.materials[k].response.attack);step(w,surge.attack);assert.ok(w.flare>0);assert.ok(w.surgeCount>0);assert.equal(events.filter(e=>e.type==='ignite').length,1);}});
test('GPU surge position follows the physical source, not screen coordinates',()=>{const w=new I.FuelWorld(),b=launch(w);until(w,()=>b.stage==='burning');step(w,.25);let found=false;for(let i=0;i<w.surgeCount;i++){const n=i*4;if(w.surgeInfo[n+3]===1){assert.ok(Math.abs(w.surgePositions[n]-b.position[0])<1e-5);assert.ok(Math.abs(w.surgePositions[n+1]-b.position[1]-.06)<1e-5);found=true;}}assert.ok(found);});
test('Simultaneous pulses stay inside the GPU array and energy budget',()=>{const w=new I.FuelWorld();for(let i=0;i<12;i++)launch(w);for(const b of w.bodies)for(let i=0;i<3;i++)w.addSurge(b,'ignite',1.1);step(w,.2);assert.ok(w.surges.length<=12);assert.ok(w.surgeCount<=12);let total=0;for(let i=0;i<w.surgeCount;i++)total+=w.surgeInfo[i*4];assert.ok(total<=1.65001);assert.ok(w.flare<.44);assert.ok(w.surgePositions.every(Number.isFinite));});
test('Pause freezes the surge envelope, phase and brightness',()=>{const w=new I.FuelWorld(),b=launch(w);until(w,()=>b.stage==='burning');step(w,.22);const before=JSON.stringify([w.info(),Array.from(w.surgePositions),Array.from(w.surgeInfo)]);for(let i=0;i<40;i++)w.update(0,env);assert.equal(JSON.stringify([w.info(),Array.from(w.surgePositions),Array.from(w.surgeInfo)]),before);});
test('Ignition effect fades while ordinary combustion continues',()=>{const w=new I.FuelWorld(),b=launch(w);until(w,()=>b.stage==='burning');step(w,7);assert.equal(w.surgeCount,0);assert.equal(w.flare,0);assert.equal(b.stage,'burning');assert.ok(b.power>0);});
test('Clear removes pending pulses and all uploaded surge data',()=>{const w=new I.FuelWorld(),b=launch(w);until(w,()=>b.stage==='burning');step(w,.23);w.clear();assert.equal(w.flare,0);assert.equal(w.surgeCount,0);assert.equal(w.surges.length,0);assert.ok(w.surgeInfo.every(x=>x===0));assert.ok(w.surgePositions.every(x=>x===0));});
test('Transient envelopes agree at 30 and 60 Hz with fixed stepping',()=>{const a=new I.FuelWorld({seed:10}),b=new I.FuelWorld({seed:10});launch(a);launch(b);step(a,2.5,1/30);step(b,2.5,1/60);assert.ok(Math.abs(a.flare-b.flare)<1e-8);assert.deepEqual(Array.from(a.surgeInfo),Array.from(b.surgeInfo));});

for(const mode of ['feed','wind','orbit']){
 test(`Middle drag always orbits in ${mode} mode`,()=>assert.equal(I.pointerInput.action({button:1,buttons:4},mode),'orbit'));
 test(`Right drag always orbits in ${mode} mode`,()=>assert.equal(I.pointerInput.action({button:2,buttons:2},mode),'orbit'));
 test(`Left drag retains ${mode} behavior`,()=>assert.equal(I.pointerInput.action({button:0,buttons:1},mode),mode));
}
test('Alt + left drag overrides the active mode',()=>assert.equal(I.pointerInput.action({button:0,buttons:1,altKey:true},'feed'),'orbit'));
test('Adding a secondary button mid-throw changes it to orbit',()=>{assert.equal(I.pointerInput.advance({buttons:3},'feed'),'orbit');assert.equal(I.pointerInput.advance({buttons:5},'wind'),'orbit');});
test('Releasing the secondary button never re-arms a throw',()=>{assert.equal(I.pointerInput.advance({buttons:1},'orbit'),'orbit');assert.equal(I.pointerInput.advance({buttons:0},'orbit'),'orbit');});
test('A remaining pinch finger cannot become a throw or a wind tap',()=>assert.equal(I.pointerInput.advance({buttons:1},'pinch'),'pinch'));
test('Unrelated side buttons are not intercepted',()=>assert.equal(I.pointerInput.action({button:3,buttons:8},'feed'),null));
test('Audio consumes the same timing envelope and stops transients when paused',()=>{const s=fs.readFileSync(new URL('../src/audio.js',import.meta.url),'utf8');assert.match(s,/I\.fuelResponse\.envelope\(t,profile.attack,profile.decay\)/);assert.match(s,/if\(paused\)\{this.stopTimer\(\);this.stopTransients\(\);\}/);assert.match(s,/createDynamicsCompressor/);});
