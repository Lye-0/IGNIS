/* IGNIS II — fixed-step, lightweight rigid bodies and staged burning.
 * Colliders approximate the visible logs and material shapes. This is an
 * interactive visual model, not a calibrated fire or engineering simulator.
 */
(function(I){
'use strict';
const M=I.math, {clamp,mix,dot,cross,normalize,random}=M;
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(v,s)=>v.map(x=>x*s);
function rotate(q,v){const u=q.slice(0,3),t=mul(cross(u,v),2);return add(v,add(mul(t,q[3]),cross(u,t)));}
function integrateQuaternion(q,w,dt){const [x,y,z,s]=q,[a,b,c]=w;const out=[x+dt*.5*(a*s+b*z-c*y),y+dt*.5*(b*s+c*x-a*z),z+dt*.5*(c*s+a*y-b*x),s-dt*.5*(a*x+b*y+c*z)];const l=Math.hypot(...out)||1;return out.map(v=>v/l);}
function euler(x,y,z){let q=[0,0,0,1];q=integrateQuaternion(q,[x,y,z],1);return q;}
function closest(p,a,b){const v=sub(b,a);return add(a,mul(v,clamp(dot(sub(p,a),v)/dot(v,v),0,1)));}
const LOGS=[
 {c:[-.06,.30,-.22],axis:normalize([.96,0,-.28]),length:.80,r:.12},
 {c:[0,.31,.26],axis:normalize([.90,0,.43]),length:.80,r:.12},
 {c:[-.22,.49,.015],axis:normalize([.45*.986,-.166,-.893*.986]),length:.64,r:.12},
 {c:[.29,.49,-.02],axis:normalize([.56*.995,.10,.828*.995]),length:.64,r:.12},
 {c:[.05,.62,-.13],axis:normalize([.986*.98,.199,-.166*.98]),length:.51,r:.085}
].map(l=>({...l,a:sub(l.c,mul(l.axis,l.length)),b:add(l.c,mul(l.axis,l.length))}));
// One shared, smooth envelope for the GPU plume and the synthesized whoosh.
// All response values are artistic tuning, not measured combustion constants.
function responseEnvelope(age,attack,decay){
 if(age<=0||!Number.isFinite(age)||!(attack>0)||!(decay>0))return 0;
 if(age<attack){const x=age/attack;return x*x*(3-2*x);}
 const t=(age-attack)/decay;return (1+t)*Math.exp(-t);
}
function hearthExposure(position,fuel=1){
 const [x,y,z]=position,r=Math.hypot(x,z);
 return Math.exp(-r*r*1.7)*clamp(1-(y-.5)*.44,0,1)*clamp((1.14-r)*4,0,1)*Math.max(0,fuel);
}
const STAGES={flight:'投げ込み中',warming:'着火を待つ',burning:'燃焼中',ember:'熾火',ash:'灰になりました',cold:'火のそばで休んでいます'};
class FuelWorld{
 constructor({seed=41231,maxBodies=12,onEvent=()=>{}}={}){this.rng=random(seed);this.maxBodies=maxBodies;this.onEvent=onEvent;this.bodies=[];this.nextId=1;this.time=0;this.accumulator=0;this.boost=0;this.sources=new Float32Array(12*4);this.sourceInfo=new Float32Array(12*4);this.sourceCount=0;this.shadowPositions=new Float32Array(13*4);this.shadowCount=0;this.lastBody=null;this.held=null;this.surges=[];this.surgePositions=new Float32Array(48);this.surgeInfo=new Float32Array(48);this.surgeCount=0;this.flare=0;}
 addSurge(body,type,exposure=1,strength=1){
  if(exposure<=.02)return null;
  const profile=body.material.response,impact=type==='impact';
  const response={body,type,age:0,attack:impact?.065:profile.attack,decay:impact?.13:profile.decay,
   peak:(impact?profile.impact*strength:profile.strength)*clamp(exposure,.12,1.12),
   spread:profile.spread,lift:impact?.85:profile.lift};
  // An impact moves existing hot gas; only ignition supplies new fuel heat.
  if(this.surges.length>=12)this.surges.shift();
  this.surges.push(response);return response;
 }
 make(kind){
  const m=I.materials[kind];if(!m)throw new Error('Unknown fuel material: '+kind);
  const seed=Math.floor(this.rng()*1e8),s=.90+this.rng()*.17;
  return {id:this.nextId++,kind,material:m,seed,mesh:I.fuelGeometry(kind,seed),colliders:I.fuelColliders(kind),position:[0,2,0],velocity:[0,0,0],quaternion:euler(this.rng()*.3,this.rng()*5,(this.rng()-.5)*.25),angular:[0,0,0],baseScale:s,scale:[s,s,s],mass:m.mass,invMass:1/m.mass,invI:1/(m.mass*m.radius*m.radius*.62),age:0,heat:0,progress:0,burnAge:0,emberAge:0,ashAge:0,power:0,glow:0,smoke:0,sparkTimer:0,stage:'flight',contact:false,impact:false,sleep:0,awake:true};
 }
 capacity(){return this.bodies.length<this.maxBodies;}
 launch(kind,origin,target,{power=.5,body=null}={}){
  if(!this.capacity())return null;
  const b=body||this.make(kind),m=b.material;
  if([...origin,...target].some(v=>!Number.isFinite(v)))throw new Error('Throw positions must be finite.');
  const duration=clamp((kind==='paper'?.95:kind==='cardboard'?.85:kind==='twig'?.75:.69)-power*.12,.55,1.15);
  b.position=origin.slice();b.velocity=sub(target,origin).map(v=>v/duration);b.velocity[1]+=9.81*duration*.5;
  b.angular=[(this.rng()-.5)*7,(this.rng()-.5)*6,(this.rng()-.5)*7];
  b.stage='flight';this.bodies.push(b);this.lastBody=b;this.onEvent({type:'throw',body:b});return b;
 }
 impulse(b,r,n,penetration,restitution=.12){
  if(penetration<=0)return;
  const correction=Math.max(0,penetration-.001)*.74;
  for(let i=0;i<3;i++)b.position[i]+=n[i]*correction;
  const v=add(b.velocity,cross(b.angular,r)),vn=dot(v,n),rn=cross(r,n);
  if(vn<0){
   const j=-(1+restitution)*vn/(b.invMass+dot(rn,rn)*b.invI);
   for(let i=0;i<3;i++){b.velocity[i]+=n[i]*j*b.invMass;b.angular[i]+=rn[i]*j*b.invI;}
   const tangent=sub(v,mul(n,vn)),l=Math.hypot(...tangent);
   if(l>.0001){const t=mul(tangent,1/l),rt=cross(r,t),jt=Math.min(j*.56,l/(b.invMass+dot(rt,rt)*b.invI));for(let i=0;i<3;i++){b.velocity[i]-=t[i]*jt*b.invMass;b.angular[i]-=rt[i]*jt*b.invI;}}
  }
  b.contact=true;
 }
 points(b){return b.colliders.map(c=>{const r=rotate(b.quaternion,c.p.map((v,i)=>v*b.scale[i]));return {r,p:add(b.position,r),radius:c.r*Math.max(...b.scale)};});}
 collide(b){
  for(let pass=0;pass<3;pass++)for(const c of this.points(b)){
   const radius=Math.hypot(c.p[0],c.p[2]);
   const floor=radius<1.04?.175:0;
   this.impulse(b,c.r,[0,1,0],floor+c.radius-c.p[1],b.material.restitution);
   if(c.p[1]<.27&&radius>1.025&&radius<1.22){const n=[-c.p[0]/radius,0,-c.p[2]/radius];this.impulse(b,c.r,n,radius+c.radius-1.06,.12);}
   if(c.p[1]<1.15&&radius<1.40)for(const l of LOGS){const cp=closest(c.p,l.a,l.b),d=sub(c.p,cp),len=Math.hypot(...d);if(len<l.r+c.radius)this.impulse(b,c.r,len>.0001?mul(d,1/len):[0,1,0],l.r+c.radius-len,b.material.restitution*.70);}
  }
 }
 pairCollisions(){
  for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++){
   const a=this.bodies[i],b=this.bodies[j];if(!a.awake&&!b.awake)continue;
   if(Math.hypot(...sub(a.position,b.position))>a.material.radius+b.material.radius+.15)continue;
   const ac=this.points(a),bc=this.points(b);
   for(const pa of ac)for(const pb of bc){const d=sub(pa.p,pb.p),len=Math.hypot(...d),pen=pa.radius+pb.radius-len;if(pen<=0||len<.001)continue;const n=mul(d,1/len),weight=a.invMass/(a.invMass+b.invMass);const push=pen*.45;
    for(let k=0;k<3;k++){a.position[k]+=n[k]*push*weight;b.position[k]-=n[k]*push*(1-weight);}
    const vn=dot(sub(a.velocity,b.velocity),n);if(vn<0){const impulse=-vn*.85/(a.invMass+b.invMass);for(let k=0;k<3;k++){a.velocity[k]+=n[k]*impulse*a.invMass;b.velocity[k]-=n[k]*impulse*b.invMass;}}
    if(pen>.016){a.awake=true;b.awake=true;a.sleep=0;b.sleep=0;}a.contact=b.contact=true;
   }
  }
 }
 thermal(b,dt,state){
  const exposure=hearthExposure(b.position,state.fuel??1);
  if(b.stage==='flight'&&b.contact)b.stage='warming';
  if(b.progress===0&&b.burnAge===0){
   if(b.contact)b.heat=clamp(b.heat+dt*(exposure/b.material.ignition-(1-exposure)*.07),0,1);
   if(b.contact&&b.heat<.05&&b.age>8)b.stage='cold';
   if(b.heat>=.999){b.stage='burning';b.burnAge=.0001;const surge=this.addSurge(b,'ignite',exposure);this.onEvent({type:'ignite',body:b,strength:surge?.peak||0});}
  }
  if(b.stage==='burning'){
   b.burnAge+=dt*clamp(.88+exposure*.12+Math.abs(state.wind||0)*.07,.8,1.18);
   b.progress=clamp(b.burnAge/b.material.burn,0,1);
   const p=b.progress,ignition=1-Math.exp(-b.burnAge/(b.kind==='wood'?3.4:b.kind==='paper'?1.35:b.kind==='cardboard'?1.65:2.1));
   const envelope=b.kind==='paper'?Math.exp(-p*2.1)*1.05+.13:Math.pow(Math.sin(Math.PI*clamp(p*.96+.025,0,1)),.62);
   b.power=b.material.power*ignition*envelope*(1-Math.pow(p,5));b.glow=clamp(.22+b.power*.8+p*.45,0,1);b.smoke=b.material.smoke*(.35+b.power)*(1-p*.4);
   b.sparkTimer+=dt*b.material.sparks*(b.kind==='paper'?1.4:.45)*b.power;
   if(b.sparkTimer>=1){const count=Math.floor(b.sparkTimer);b.sparkTimer-=count;this.onEvent({type:'shed',body:b,count});}
   if(p>=1){b.stage='ember';b.power=0;b.smoke*=.3;this.onEvent({type:'ember',body:b});}
  }
  if(b.stage==='ember'){
   b.emberAge+=dt;const t=clamp(b.emberAge/b.material.ember,0,1);b.glow=(1-t)*.7;b.smoke=b.material.smoke*.12*(1-t);b.power=.015*(1-t);
   if(t===1){b.stage='ash';this.onEvent({type:'ash',body:b});}
  }
  if(b.stage==='ash'){b.ashAge+=dt;b.glow=0;b.power=0;b.smoke=0;}
  const p=b.progress,flat=(b.kind==='paper'||b.kind==='cardboard');
  const shrink=flat?1-.35*p:1-.21*p;
  const collapse=flat?1-.64*Math.pow(p,1.7):1-.26*p;
  const fade=b.stage==='ash'?1-clamp((b.ashAge-12)/12,0,1):1;
  b.scale=[b.baseScale*shrink*fade,b.baseScale*collapse*fade,b.baseScale*shrink*fade];
  // Shrinking solids must remain in contact rather than float above the firebed.
  if(b.contact&&b.progress>0&&this.time%1<dt){b.awake=true;b.sleep=0;}
 }
 step(dt,state){
  this.time+=dt;
  for(const s of this.surges)s.age+=dt;
  this.surges=this.surges.filter(s=>s.age<s.attack+s.decay*10&&this.bodies.includes(s.body));
  for(const b of this.bodies){
   b.age+=dt;const oldContact=b.contact;b.contact=false;
   if(b.awake){
    b.velocity[1]-=9.81*dt;
    if(!oldContact){
     const flutter=(b.kind==='paper'||b.kind==='cardboard')?.35:0;
     b.velocity[0]+=(Math.sin(this.time*11+b.seed)*flutter+((state.wind||0)*.2))*dt;
     b.velocity[2]+=Math.cos(this.time*8+b.seed)*flutter*.6*dt;
    }
    const damping=Math.exp(-dt*b.material.drag);for(let k=0;k<3;k++){b.velocity[k]*=damping;b.position[k]+=b.velocity[k]*dt;b.angular[k]=clamp(b.angular[k]*Math.exp(-dt*(oldContact?3.6:.35)),-12,12);}
    b.quaternion=integrateQuaternion(b.quaternion,b.angular,dt);
    const speed=Math.hypot(...b.velocity);this.collide(b);
    if(b.contact&&!b.impact&&b.age>.09){b.impact=true;const strength=clamp(speed/4,.18,1),exposure=hearthExposure(b.position,state.fuel??1);this.addSurge(b,'impact',exposure,strength);this.onEvent({type:'impact',body:b,strength,exposure});}
    if(b.contact&&Math.hypot(...b.velocity)<.13&&Math.hypot(...b.angular)<.36)b.sleep+=dt;else b.sleep=0;
    if(b.sleep>.7){b.awake=false;b.velocity=[0,0,0];b.angular=[0,0,0];}
   }else b.contact=true;
   this.thermal(b,dt,state);
  }
  this.pairCollisions();
  this.bodies=this.bodies.filter(b=>!(b.ashAge>=24||b.position[1]<-4||(b.stage==='cold'&&b.age>80)));
 }
 update(dt,state){
  if(dt>0){this.accumulator+=Math.min(dt,.10);let steps=0;while(this.accumulator>=1/120&&steps++<13){this.step(1/120,state);this.accumulator-=1/120;}}
  let total=0;this.sourceCount=0;this.sources.fill(0);this.sourceInfo.fill(0);this.shadowCount=0;
  for(const b of this.bodies){
   total+=b.power;
   if((b.power>.005||b.smoke>.005)&&this.sourceCount<12){const i=this.sourceCount++*4;this.sources.set([b.position[0],b.position[1]+.08,b.position[2],b.kind==='wood'?.28:.23],i);this.sourceInfo.set([b.power,b.smoke,b.glow,b.material.id],i);}
   if(this.shadowCount<13)this.shadowPositions.set([...b.position,b.material.radius*Math.max(...b.scale)],this.shadowCount++*4);
  }
  if(this.held&&this.shadowCount<13)this.shadowPositions.set([...this.held.position,this.held.material.radius],this.shadowCount++*4);
  this.surgeCount=0;this.surgePositions.fill(0);this.surgeInfo.fill(0);let pulse=0;
  // Soft saturation preserves individual responses without runaway stacked heat.
  let sum=0;for(const s of this.surges)sum+=s.peak*responseEnvelope(s.age,s.attack,s.decay);
  const gain=sum>1.65?1.65/sum:1;
  for(const s of this.surges){
   const strength=s.peak*responseEnvelope(s.age,s.attack,s.decay)*gain;
   if(strength<.0001||this.surgeCount>=12)continue;
   const i=this.surgeCount++*4,phase=clamp(s.age/(s.attack+s.decay*2),0,1);
   this.surgePositions.set([s.body.position[0],s.body.position[1]+.06,s.body.position[2],s.spread],i);
   this.surgeInfo.set([strength,s.lift,phase,s.type==='ignite'?1:0],i);
   pulse+=strength*(s.type==='ignite'?1:.3);
  }
  this.flare=.44*(1-Math.exp(-pulse*.85));
  const target=.40*(1-Math.exp(-total*.8));if(dt>0)this.boost=mix(this.boost,target,1-Math.exp(-dt*2.8));
  return this.boost;
 }
 status(){const b=this.lastBody;if(!b)return null;return {label:b.material.label,stage:STAGES[b.stage],progress:b.progress,id:b.id};}
 clear(){this.bodies=[];this.held=null;this.lastBody=null;this.boost=0;this.sources.fill(0);this.sourceInfo.fill(0);this.sourceCount=0;this.shadowPositions.fill(0);this.shadowCount=0;this.accumulator=0;this.surges=[];this.surgeCount=0;this.flare=0;this.surgePositions.fill(0);this.surgeInfo.fill(0);}
 info(){return {count:this.bodies.length,max:this.maxBodies,boost:this.boost,sources:this.sourceCount,flare:this.flare,surges:this.surgeCount,bodies:this.bodies.map(b=>({id:b.id,kind:b.kind,stage:b.stage,position:b.position.slice(),progress:b.progress,heat:b.heat,power:b.power,age:b.age,awake:b.awake}))};}
}
I.fuelResponse={envelope:responseEnvelope,exposure:hearthExposure};I.FuelWorld=FuelWorld;I.fuelMath={rotate,integrateQuaternion,logs:LOGS};
})(globalThis.Ignis=globalThis.Ignis||{});
