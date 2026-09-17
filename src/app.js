/* IGNIS — interaction, camera, accessible controls, and lifecycle. */
(function(I){'use strict';
const $=id=>document.getElementById(id),M=I.math;
const small=()=>innerWidth<=760||(innerWidth<=900&&innerHeight>innerWidth);
const defaults=()=>{const d=small()?(innerHeight<735?6.6:6.25):4.9;return {yaw:.30,pitch:.14,distance:d,target:[0,small()?M.clamp(-.14+(d/1.95)*(1-670/innerHeight),.015,1.65):1.28,0]};};
const params=new URLSearchParams(location.search),capture=params.has('capture');
const state={time:1.7,fuel:1,wind:.12,exposure:1,mode:'feed',paused:false,immersive:false,quality:'medium',touch:[0,1.1,0,0],shift:0,focal:1.95};
let cameraValues=defaults(),cameraGoal={...cameraValues,target:[...cameraValues.target]},renderer=null,audio=new I.FireAudio(),raf=0,last=0,ready=false,dirty=true,contextLost=false,toastTimer=0;
const pointers=new Map();let lastPinch=0,cameraFraming=null;
function toast(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
function showError(error){console.error(error);$('loading').hidden=true;$('error').hidden=false;$('error-detail').textContent=error?.message||String(error);}
function currentCamera(){return M.camera(cameraValues.yaw,cameraValues.pitch,cameraValues.distance,cameraValues.target);}
function updateCamera(dt){
 const alpha=1-Math.exp(-Math.max(dt,.008)*12);let change=0;
 for(const k of ['yaw','pitch','distance']){const before=cameraValues[k];cameraValues[k]=M.mix(before,cameraGoal[k],alpha);change+=Math.abs(cameraValues[k]-before);}
 const target=state.immersive?[0,1.28,0]:cameraGoal.target,shift=state.immersive||small()?0:(innerWidth/innerHeight)*.34;
 if(!cameraFraming){cameraValues.target=[...target];state.shift=shift;cameraFraming={target:[...target],shift,elapsed:1.1,fromTarget:[...target],fromShift:shift};}
 if(cameraFraming.shift!==shift||target.some((v,i)=>v!==cameraFraming.target[i])){
  cameraFraming={target:[...target],shift,elapsed:0,fromTarget:[...cameraValues.target],fromShift:state.shift};
 }
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 cameraFraming.elapsed=Math.min(1.1,cameraFraming.elapsed+Math.max(0,dt));
 // Ease in briefly, then spend most of the move gently decelerating to rest.
 const t=reduced?1:cameraFraming.elapsed/1.1,ease=t*t*(10+t*(-20+t*(15-4*t)));
 cameraValues.target=cameraFraming.fromTarget.map((v,i)=>M.mix(v,target[i],ease));
 state.shift=M.mix(cameraFraming.fromShift,shift,ease);
 return change>.00001||t<1;
}
function render(dt){const moved=updateCamera(dt);if(!state.paused){state.time+=dt;state.touch[2]*=Math.exp(-dt*1.8);state.touch[3]*=Math.exp(-dt*1.8);}if(!ready)return;world.update(state.paused?0:dt,state);renderer.world=world;audio.fuel=state.fuel+world.boost+world.flare;renderer.render(state,currentCamera(),state.paused?0:dt);updateFuelHUD();dirty=moved;return moved;}
function frame(timestamp){if(contextLost)return;const dt=last?Math.min((timestamp-last)/1000,.05):1/60;last=timestamp;if(!document.hidden&&(!state.paused||dirty||Math.abs(cameraValues.yaw-cameraGoal.yaw)>.0001||Math.abs(cameraValues.pitch-cameraGoal.pitch)>.0001||Math.abs(cameraValues.distance-cameraGoal.distance)>.0001))render(dt);if(!capture)raf=requestAnimationFrame(frame);}
function togglePause(value=!state.paused){state.paused=value;document.body.classList.toggle('paused',value);$('pause').setAttribute('aria-pressed',String(value));$('pause').setAttribute('aria-label',value?'再生':'一時停止');$('pause').title=value?'再生（Space）':'一時停止（Space）';$('pause-icon').innerHTML=value?'<path d="m7 4 9 6-9 6Z"/>':'<path d="M7 4v12M13 4v12"/>';$('live-text').textContent=value?'A MOMENT, HELD STILL':'LIVE GENERATIVE FIRE';audio.setPaused(value||document.hidden);dirty=true;}
function setMode(mode){
 if(pointers.size)cancelPointers();
 state.mode=mode;document.body.classList.toggle('wind-mode',mode==='wind');document.body.classList.toggle('feed-mode',mode==='feed');
 for(const m of ['feed','orbit','wind']){$(`${m}-mode`).classList.toggle('active',m===mode);$(`${m}-mode`).setAttribute('aria-pressed',String(m===mode));}
 $('gesture-main').textContent=mode==='feed'?'素材を選んで、火の中へ':mode==='wind'?'炎の上をなぞって、風を送る':'ドラッグで視点を動かす';
 $('gesture-sub').textContent=small()?'2本指で回転・ピンチでズーム':'中・右ドラッグで視点回転';
 if(mode==='wind')toast('炎の近くを左右になぞると、気流が変わります。');dirty=true;
}
function setImmersive(value){state.immersive=value;dirty=true;document.body.classList.toggle('immersive',value);for(const el of document.querySelectorAll('.ui'))el.inert=value;$('restore-ui').hidden=!value;if(value){setSettings(false);$('restore-ui').focus({preventScroll:true});}else $('immersive').focus({preventScroll:true});}
function setSettings(open){$('settings').hidden=!open;$('settings-toggle').setAttribute('aria-expanded',String(open));if(open)$('close-settings').focus({preventScroll:true});}
function resetCamera(){cameraGoal=defaults();dirty=true;}
function resetAll(){state.fuel=1;state.wind=.12;state.exposure=1;state.touch=[0,1.1,0,0];for(const k of ['fuel','wind','exposure']){$(k).value=String(state[k]);$(k).dispatchEvent(new Event('input'));}resetCamera();togglePause(false);cancelFuelGesture();world.clear();renderer.reset();selectMaterial('paper');state.quality='medium';$('quality').value='medium';renderer.setQuality('medium');renderer.reset();toast('炎と視点を初期状態に戻しました。');}
function touchWind(e,dx,dy){const rect=$('scene').getBoundingClientRect(),cam=currentCamera(),ray=M.rayAt(e.clientX-rect.left,e.clientY-rect.top,rect.width,rect.height,cam,state.shift,state.focal);const p=M.intersectPlane(cam.origin,ray,[0,1.2,0],[cam.forward[0],0,cam.forward[2]]);if(p){state.touch[0]=M.clamp(p[0],-1.2,1.2);state.touch[1]=M.clamp(p[1],.4,3.5);state.touch[2]=M.clamp(state.touch[2]+dx*.043*cam.right[0],-2.1,2.1);state.touch[3]=M.clamp(state.touch[3]+dx*.043*cam.right[2],-2.1,2.1);dirty=true;}}
function beginPinch(){
 cancelFuelGesture();const p=[...pointers.values()];for(const g of p)g.action='pinch';
 lastPinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
 document.body.classList.remove('orbit-dragging');
}
function pointerMove(e){
 const g=pointers.get(e.pointerId);
 if(state.mode==='wind'&&(!g||g.action==='wind')){$('wind-cursor').style.left=`${e.clientX}px`;$('wind-cursor').style.top=`${e.clientY}px`;$('wind-cursor').classList.add('visible');}
 if(!g)return;
 // A released mouse button must not leave a stuck drag, even after focus loss.
 if(e.pointerType==='mouse'&&e.buttons===0){pointerUp(e,true);return;}
 const dx=e.clientX-g.x,dy=e.clientY-g.y;g.x=e.clientX;g.y=e.clientY;g.drag+=Math.hypot(dx,dy);
 if(pointers.size===2){
  const p=[...pointers.values()];if(g.action!=='pinch')beginPinch();
  const d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
  if(lastPinch>0&&d>2)cameraGoal.distance=M.clamp(cameraGoal.distance*lastPinch/d,small()?4.8:2.9,8.7);
  // Each pointer contributes half of the two-finger midpoint movement.
  e.preventDefault();document.body.classList.add('orbit-dragging');$('wind-cursor').classList.remove('visible');
  cameraGoal.yaw-=dx*.5*.0045;cameraGoal.pitch=M.clamp(cameraGoal.pitch+dy*.5*.0035,.035,.72);
  lastPinch=d;dirty=true;return;
 }
 const action=I.pointerInput.advance(e,g.action);
 if(action!==g.action){cancelFuelGesture();g.action=action;}
 if(g.action==='feed'){updateFuelGesture(e);return;}
 if(g.action==='wind'){touchWind(e,dx,dy);return;}
 if(g.action==='pinch')return; // Wait for all pinch fingers to lift.
 e.preventDefault();document.body.classList.add('orbit-dragging');$('wind-cursor').classList.remove('visible');
 cameraGoal.yaw-=dx*.0045;cameraGoal.pitch=M.clamp(cameraGoal.pitch+dy*.0035,.035,.72);dirty=true;
}
function pointerDown(e){
 const action=I.pointerInput.action(e,state.mode);if(!action)return;e.preventDefault();
 try{$('scene').setPointerCapture(e.pointerId);}catch{}
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,drag:0,action});
 if(pointers.size===2){beginPinch();return;}lastPinch=0;
 if(action==='feed')startFuelGesture(e);
 else if(action==='orbit'){cancelFuelGesture();document.body.classList.add('orbit-dragging');$('wind-cursor').classList.remove('visible');}
}
function pointerUp(e,cancel=false){
 const g=pointers.get(e.pointerId);if(!g)return;
 const canceled=cancel||e.type==='pointercancel',action=I.pointerInput.advance(e,g.action);
 if(action==='feed')finishFuelGesture(e,canceled);else if(fuelGesture?.id===e.pointerId)cancelFuelGesture();
 if(action==='wind'&&!canceled&&g.drag<8)touchWind(e,20,0);
 pointers.delete(e.pointerId);lastPinch=0;
 if(!pointers.size)document.body.classList.remove('orbit-dragging');
 try{if($('scene').hasPointerCapture(e.pointerId))$('scene').releasePointerCapture(e.pointerId);}catch{}
}
function cancelPointers(){
 cancelFuelGesture();const ids=[...pointers.keys()];pointers.clear();lastPinch=0;
 document.body.classList.remove('orbit-dragging');$('wind-cursor').classList.remove('visible');
 for(const id of ids)try{if($('scene').hasPointerCapture(id))$('scene').releasePointerCapture(id);}catch{}
}
function setupUI(){
 $('retry').addEventListener('click',()=>location.reload());$('home').addEventListener('click',e=>{e.preventDefault();resetCamera();});
 $('orbit-mode').addEventListener('click',()=>setMode('orbit'));$('wind-mode').addEventListener('click',()=>setMode('wind'));$('pause').addEventListener('click',()=>togglePause());$('immersive').addEventListener('click',()=>setImmersive(true));$('restore-ui').addEventListener('click',()=>setImmersive(false));
 $('settings-toggle').addEventListener('click',()=>setSettings($('settings').hidden));$('close-settings').addEventListener('click',()=>{setSettings(false);$('settings-toggle').focus({preventScroll:true});});$('reset').addEventListener('click',resetAll);
 for(const key of ['fuel','wind','exposure'])$(key).addEventListener('input',()=>{state[key]=Number($(key).value);audio.fuel=state.fuel;$(key+'-value').textContent=key==='fuel'?(state.fuel<.75?'熾火に近く':state.fuel>1.25?'力強く':'穏やか'):key==='wind'?(state.wind<.05?'無風':state.wind<.30?'かすか':state.wind<.65?'そよぐ':'強く'):state.exposure.toFixed(2);dirty=true;});
 $('quality').addEventListener('change',()=>{const quality=$('quality').value;try{renderer.setQuality(quality);state.quality=quality;dirty=true;}catch(e){showError(e);}});
 $('sound').addEventListener('click',async()=>{try{const enabled=await audio.toggle();audio.setPaused(state.paused||document.hidden);$('sound').setAttribute('aria-pressed',String(enabled));$('sound').setAttribute('aria-label',enabled?'焚き火の音をオフ':'焚き火の音をオン');$('sound').title=enabled?'音をオフ':'音をオン';$('sound-wave').setAttribute('d',enabled?'M13 7c2 1.5 2 4.5 0 6M15 4c4 3 4 9 0 12':'m14 8 4 4m0-4-4 4');}catch(e){toast(e.message||'音声を再生できませんでした。');}});
 const canvas=$('scene');canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerUp);canvas.addEventListener('lostpointercapture',e=>pointerUp(e,true));canvas.addEventListener('pointerleave',()=>$('wind-cursor').classList.remove('visible'));canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('auxclick',e=>e.preventDefault());canvas.addEventListener('mousedown',e=>{if(e.button===1||e.button===2)e.preventDefault();});
 canvas.addEventListener('wheel',e=>{e.preventDefault();cameraGoal.distance=M.clamp(cameraGoal.distance*Math.exp(e.deltaY*.0007),small()?4.8:2.9,8.7);dirty=true;},{passive:false});
 document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();togglePause();}else if(e.key==='Escape'){setSettings(false);if(state.immersive)setImmersive(false);}else if(e.key.toLowerCase()==='h')setImmersive(!state.immersive);else if(e.key.toLowerCase()==='r')resetCamera();else if(e.key==='ArrowLeft'){cameraGoal.yaw+=.09;dirty=true;e.preventDefault();}else if(e.key==='ArrowRight'){cameraGoal.yaw-=.09;dirty=true;e.preventDefault();}else if(e.key==='ArrowUp'){cameraGoal.pitch=M.clamp(cameraGoal.pitch-.05,.035,.72);dirty=true;e.preventDefault();}else if(e.key==='ArrowDown'){cameraGoal.pitch=M.clamp(cameraGoal.pitch+.05,.035,.72);dirty=true;e.preventDefault();}});
 let wasSmall=small();addEventListener('resize',()=>{if(wasSmall!==small()){wasSmall=small();resetCamera();$('gesture-sub').textContent=small()?'2本指で回転・ピンチでズーム':'中・右ドラッグで視点回転';}dirty=true;});
 document.addEventListener('visibilitychange',()=>{cancelPointers();last=0;audio.setPaused(state.paused||document.hidden);dirty=true;});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;cancelFuelGesture();cancelAnimationFrame(raf);audio.setPaused(true);toast('描画が中断されました。復元を試みています。');});
 canvas.addEventListener('webglcontextrestored',()=>{try{renderer=new I.Renderer(canvas,{quality:state.quality});renderer.world=world;contextLost=false;last=0;dirty=true;window.__IGNIS__.renderer=renderer;audio.setPaused(state.paused||document.hidden);raf=requestAnimationFrame(frame);}catch(e){showError(e);}});
 addEventListener('pagehide',()=>{audio.setPaused(true);});
}
async function start(){try{setupUI();setupFuelUI();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));renderer=new I.Renderer($('scene'));renderer.world=world;updateCamera(1);
 // Establish the rising plume before revealing the scene; keep the loader responsive.
 for(let i=0;i<108;i++){state.time+=1/36;const u=renderer.common(state,currentCamera());renderer.simulate(1/36,u);renderer.updateParticles(1/36,state);if(i%18===17)await new Promise(resolve=>requestAnimationFrame(resolve));}
 ready=true;render(1/60);$('loading').classList.add('done');setTimeout(()=>$('loading').hidden=true,1050);$('gesture-sub').textContent=small()?'2本指で回転・ピンチでズーム':'中・右ドラッグで視点回転';
 window.__IGNIS__={state,renderer,audio,world,selectMaterial,throwFuel:toss,get selectedMaterial(){return selectedMaterial;},get camera(){return currentCamera();},get cameraGoal(){return cameraGoal;},setMode,togglePause,resetCamera,renderStep(dt=1/30){render(dt);},freeze(){cancelAnimationFrame(raf);},resume(){cancelAnimationFrame(raf);last=0;raf=requestAnimationFrame(frame);},info(){return {...renderer.info(),state:{...state},camera:currentCamera()};}};
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){togglePause(true);toast('動きを抑える設定に合わせて、一時停止しています。');}if(!capture)raf=requestAnimationFrame(frame);
}catch(e){showError(e);}}
// Material interaction ------------------------------------------------------
let selectedMaterial='paper',fuelGesture=null,lastStatus='',lastThrowAt=-1e6;
const world=new I.FuelWorld({onEvent:handleFuelEvent});
function handleFuelEvent(event){
 const b=event.body;
 if(['impact','ignite','shed'].includes(event.type)&&Math.hypot(b.position[0],b.position[2])<1.2)renderer?.burst(event);
 const cam=currentCamera(),d=b.position.map((v,i)=>v-cam.origin[i]);
 audio.materialEvent?.({...event,pan:M.clamp(M.dot(d,cam.right)/Math.max(1,Math.hypot(...d))*1.4,-.65,.65)});
 if(event.type==='impact'&&(event.exposure||0)>.02){state.touch[0]=b.position[0];state.touch[1]=b.position[1]+.2;state.touch[2]+=event.strength*.18;}
}
function selectMaterial(kind){
 if(!I.materials[kind])return;selectedMaterial=kind;
 for(const el of document.querySelectorAll('.material-card')){const yes=el.dataset.material===kind;el.classList.toggle('selected',yes);el.setAttribute('aria-pressed',String(yes));}
 $('material-note').textContent=I.materials[kind].note;setMode('feed');dirty=true;
}
function screenPoint(p){
 const cam=currentCamera(),d=p.map((v,i)=>v-cam.origin[i]),depth=M.dot(d,cam.forward),aspect=innerWidth/innerHeight;
 if(depth<=0)return null;
 const x=(M.dot(d,cam.right)*state.focal/depth+state.shift)/aspect,y=M.dot(d,cam.up)*state.focal/depth;
 return [(x*.5+.5)*innerWidth,(.5-y*.5)*innerHeight];
}
function screenWorld(x,y,depth=2.45){
 const cam=currentCamera(),ray=M.rayAt(x,y,innerWidth,innerHeight,cam,state.shift,state.focal),d=depth/Math.max(.15,M.dot(ray,cam.forward));
 const p=cam.origin.map((v,i)=>v+ray[i]*d);p[1]=Math.max(.35,p[1]);return p;
}
function aimPoint(x,y){
 const cam=currentCamera(),ray=M.rayAt(x,y,innerWidth,innerHeight,cam,state.shift,state.focal);
 let p=M.intersectPlane(cam.origin,ray,[0,.52,0],[0,1,0]);
 if(!p){const projected=M.intersectPlane(cam.origin,ray,[0,1,0],[cam.forward[0],0,cam.forward[2]]);p=projected||[0,.5,0];}
 const r=Math.hypot(p[0],p[2]),limit=.38;if(r>limit){p[0]*=limit/r;p[2]*=limit/r;}
 return [p[0],.50,p[2]];
}
function updateFuelHUD(){
 const s=world.status(),text=s?`${s.label} · ${s.stage}`:'火は、次のひとつを待っています。';
 if(text!==lastStatus){lastStatus=text;$('burn-status-text').textContent=text;$('burn-status').classList.toggle('active',!!s&&s.stage!=='灰になりました');}
 $('quick-throw').disabled=!ready||!world.capacity();
}
function toss(kind=selectedMaterial,origin=null,target=null,body=null,strength=.5){
 if(!ready)return null;
 if(!world.capacity()){toast('火床がいっぱいです。燃え尽きるのを待つか、設定から片づけられます。');return null;}
 const now=performance.now();if(now-lastThrowAt<130)return null;lastThrowAt=now;
 if(state.paused)togglePause(false);
 const cam=currentCamera();
 origin=origin||screenWorld(innerWidth*(small()?.65:.82),innerHeight*.80,2.35);
 target=target||[cam.right[0]*((world.rng()-.5)*.65),.50,cam.right[2]*((world.rng()-.5)*.65)+.16];
 const b=world.launch(kind,origin,target,{body,power:strength});dirty=true;updateFuelHUD();return b;
}
function startFuelGesture(e,fromCard=false){
 if(!ready||!world.capacity()||e.button>0||e.isPrimary===false)return;
 fuelGesture={id:e.pointerId,fromCard,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,drag:false,body:null,speed:0,lastTime:performance.now()};
 if(!fromCard){fuelGesture.body=world.make(selectedMaterial);world.held=fuelGesture.body;updateFuelGesture(e);}
}
function updateFuelGesture(e){
 const g=fuelGesture;if(!g||g.id!==e.pointerId)return;
 const now=performance.now(),elapsed=Math.max(8,now-g.lastTime);g.speed=M.mix(g.speed,Math.hypot(e.clientX-g.x,e.clientY-g.y)/elapsed*1000,.40);g.lastTime=now;
 g.x=e.clientX;g.y=e.clientY;
 if(Math.hypot(g.x-g.startX,g.y-g.startY)>8)g.drag=true;
 if(!g.body&&g.drag){g.body=world.make(selectedMaterial);world.held=g.body;}
 if(g.body){
  g.body.position=screenWorld(g.x,g.y,2.45);
  g.body.quaternion=I.fuelMath.integrateQuaternion(g.body.quaternion,[(g.y-g.startY)*.002,(g.x-g.startX)*.002,.012],.08);
  const target=aimPoint(g.x,g.y),origin=g.body.position,duration=g.body.kind==='paper'?.91:g.body.kind==='cardboard'?.815:g.body.kind==='twig'?.715:.655;
  const velocity=target.map((v,i)=>(v-origin[i])/duration);velocity[1]+=9.81*duration*.5;
  const points=[];for(let i=1;i<=21;i++){const t=duration*i/21,p=origin.map((v,k)=>v+velocity[k]*t-(k===1?4.905*t*t:0)),s=screenPoint(p);if(s)points.push(s);}
  $('throw-guide').setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);$('throw-path').setAttribute('d',points.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '));
  const end=screenPoint(target);if(end){$('throw-target').setAttribute('cx',end[0]);$('throw-target').setAttribute('cy',end[1]);}
  $('throw-guide').hidden=false;$('throw-guide').style.display='block';$('throw-guide').removeAttribute('hidden');
  $('throw-hint').hidden=false;$('throw-hint').style.left=g.x+'px';$('throw-hint').style.top=g.y+'px';document.body.classList.add('holding');dirty=true;
 }
}
function cancelFuelGesture(){fuelGesture=null;world.held=null;$('throw-guide').setAttribute('hidden','');$('throw-guide').style.display='none';$('throw-hint').hidden=true;document.body.classList.remove('holding');dirty=true;}
function finishFuelGesture(e,cancel=false){
 const g=fuelGesture;if(!g||g.id!==e.pointerId)return;
 if((e.buttons&6)||e.altKey){cancelFuelGesture();return;}
 const body=g.body,origin=body?.position.slice(),target=aimPoint(e.clientX,e.clientY);
 const rect=$('fuel-tray').getBoundingClientRect(),overTray=e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom;
 const isTap=!g.drag;const fromCard=g.fromCard;const strength=M.clamp(g.speed/1700,.1,1);
 cancelFuelGesture();
 if(cancel||(fromCard&&(isTap||overTray)))return;
 if(!fromCard&&overTray)return;
 toss(body?.kind||selectedMaterial,isTap?null:origin,target,isTap?null:body,strength);
}
function setupFuelUI(){
 for(const el of document.querySelectorAll('.material-card')){
  I.fuelThumbnail(el.querySelector('canvas'),el.dataset.material);
  el.addEventListener('pointerdown',e=>{if(e.button!==0)return;selectMaterial(el.dataset.material);el.focus({preventScroll:true});try{el.setPointerCapture(e.pointerId);}catch{}startFuelGesture(e,true);});
  el.addEventListener('pointermove',e=>{if((e.buttons&6)||e.altKey)cancelFuelGesture();else updateFuelGesture(e);});
  el.addEventListener('pointerup',e=>finishFuelGesture(e));
  el.addEventListener('pointercancel',e=>finishFuelGesture(e,true));
  el.addEventListener('lostpointercapture',e=>{if(fuelGesture?.id===e.pointerId)cancelFuelGesture();});
  el.addEventListener('click',e=>{if(e.detail===0)selectMaterial(el.dataset.material);});
  el.addEventListener('contextmenu',e=>e.preventDefault());
 }
 $('feed-mode').addEventListener('click',()=>setMode('feed'));
 $('quick-throw').addEventListener('click',()=>toss());
 $('clear-fuel').addEventListener('click',()=>{cancelFuelGesture();world.clear();renderer.reset();updateFuelHUD();dirty=true;toast('追加した素材を片づけました。');});
 document.addEventListener('keydown',e=>{
  if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
  if(['1','2','3','4'].includes(e.key)){selectMaterial(Object.keys(I.materials)[Number(e.key)-1]);}
  if(e.key.toLowerCase()==='f'||(e.key==='Enter'&&['CANVAS','BODY'].includes(e.target.tagName))){e.preventDefault();toss();}
  if(e.key==='Escape')cancelFuelGesture();
 });
 addEventListener('blur',cancelPointers);
 setMode('feed');updateFuelHUD();
}

start();
})(globalThis.Ignis=globalThis.Ignis||{});
