/* IGNIS II — procedural solid fuel, local geometry and preview thumbnails.
 * The timings are artistic, not measured combustion data. No external assets.
 */
(function (I) {
'use strict';
const M = I.math;
const MATERIALS = Object.freeze({
  paper: {response:Object.freeze({strength:.50,attack:.60,decay:.36,spread:.34,lift:1.80,sparks:12,impact:.045,tone:640}),id:0, label:'くしゃくしゃの紙', short:'くしゃ紙', english:'CRUMPLED PAPER', note:'ふわりと舞い、薄い灰へ。', mass:.028, radius:.19, ignition:.75, burn:24, ember:15, power:.80, smoke:.12, sparks:7, drag:.32, restitution:.19, color:[.71,.65,.53]},
  cardboard: {response:Object.freeze({strength:.39,attack:.85,decay:.48,spread:.32,lift:1.58,sparks:14,impact:.080,tone:510}),id:1, label:'段ボール片', short:'段ボール', english:'CORRUGATED CARD', note:'縁から焦げて、反り返る。', mass:.055, radius:.27, ignition:1.5, burn:40, ember:22, power:.64, smoke:.17, sparks:10, drag:.21, restitution:.13, color:[.35,.19,.078]},
  twig: {response:Object.freeze({strength:.27,attack:1.10,decay:.38,spread:.27,lift:1.42,sparks:21,impact:.155,tone:700}),id:2, label:'乾いた小枝', short:'小枝', english:'DRY TWIG', note:'細い枝先から、赤い熾火に。', mass:.115, radius:.37, ignition:2.5, burn:58, ember:36, power:.53, smoke:.08, sparks:17, drag:.05, restitution:.25, color:[.18,.095,.038]},
  wood: {response:Object.freeze({strength:.18,attack:1.50,decay:.64,spread:.30,lift:1.18,sparks:10,impact:.270,tone:360}),id:3, label:'割った木片', short:'木片', english:'SPLIT WOOD', note:'ゆっくり着火し、長く熱を残す。', mass:.30, radius:.34, ignition:3.8, burn:95, ember:55, power:.48, smoke:.11, sparks:23, drag:.025, restitution:.16, color:[.46,.27,.115]}
});
const add=(a,b)=>a.map((v,i)=>v+b[i]), sub=(a,b)=>a.map((v,i)=>v-b[i]), scale=(v,s)=>v.map(x=>x*s);
function tri(out,a,b,c,tag=0) {
  const n=M.normalize(M.cross(sub(b,a),sub(c,a)));
  for(const p of [a,b,c])out.push(...p,...n,tag);
}
function quad(out,a,b,c,d,tag=0){tri(out,a,b,c,tag);tri(out,a,c,d,tag);}
function paper(seed) {
  const rng=M.random(seed), out=[], points=[], faces=[];
  const T=(1+Math.sqrt(5))/2;
  let vs=[[-1,T,0],[1,T,0],[-1,-T,0],[1,-T,0],[0,-1,T],[0,1,T],[0,-1,-T],[0,1,-T],[T,0,-1],[T,0,1],[-T,0,-1],[-T,0,1]].map(M.normalize);
  let fs=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  // Two subdivisions, then irregular radial folds. Shared vertices keep a closed shell.
  for(let j=0;j<2;j++) {
    const cache=new Map(), next=[];
    const mid=(a,b)=>{const k=Math.min(a,b)+':'+Math.max(a,b);if(cache.has(k))return cache.get(k);const i=vs.length;vs.push(M.normalize(add(vs[a],vs[b])));cache.set(k,i);return i;};
    for(const [a,b,c] of fs){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);}fs=next;
  }
  vs=vs.map(v=>{const fold=.77+rng()*.37 + .08*Math.sin(v[0]*14+v[2]*9);return [v[0]*.225*fold,v[1]*.18*fold,v[2]*.205*fold];});
  for(const f of fs){
    const pts=f.map(i=>vs[i]),center=pts[0].map((_,j)=>(pts[0][j]+pts[1][j]+pts[2][j])/3);
    // A small open fold and loose corners make this a sheet, not a solid rock.
    if(center[1]>.105&&center[0]>.035&&center[2]>.06)continue;
    tri(out,...pts,0);
  }
  tri(out,[.01,.09,.155],[.14,.17,.11],[.06,.227,.075]);
  tri(out,[.01,.09,.155],[.06,.227,.075],[-.07,.165,.115]);
  tri(out,[-.16,-.015,.09],[-.255,.028,.04],[-.145,.082,.075]);
  return out;
}
function cardboard(seed) {
  const rng=M.random(seed), out=[], n=14, grid=[];
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++) {
    let x=(i/n-.5)*.55,z=(j/n-.5)*.34;
    if(i===0||i===n)x+=(rng()-.5)*.025;
    if(j===0||j===n)z+=(rng()-.5)*.025;
    const y=.024*Math.sin(x*7)+.08*Math.max(0,x+.04)+.016*Math.sin(z*10);
    grid.push([x,y,z]);
  }
  const at=(i,j,h)=>add(grid[j*(n+1)+i],[0,h,0]);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++) {
    quad(out,at(i,j,.007),at(i,j+1,.007),at(i+1,j+1,.007),at(i+1,j,.007),0);
    quad(out,at(i,j,-.007),at(i+1,j,-.007),at(i+1,j+1,-.007),at(i,j+1,-.007),0);
  }
  for(let i=0;i<n;i++) {
    for(const j of [0,n])quad(out,at(i,j,-.007),at(i,j,.007),at(i+1,j,.007),at(i+1,j,-.007),1);
    for(const x of [0,n])quad(out,at(x,i,-.007),at(x,i+1,-.007),at(x,i+1,.007),at(x,i,.007),1);
  }
  return out;
}
function branch(out,a,b,r1,r2,rng,tag=0) {
  const axis=M.normalize(sub(b,a)), ref=Math.abs(axis[1])>.9?[1,0,0]:[0,1,0];
  const u=M.normalize(M.cross(axis,ref)),v=M.cross(axis,u),rings=[],n=11,m=8;
  const phase=rng()*6.28;
  for(let j=0;j<=m;j++) {
    const c=add(a,scale(sub(b,a),j/m)),ring=[];
    for(let i=0;i<n;i++) {
      const ang=i/n*Math.PI*2, rad=M.mix(r1,r2,j/m)*(1+.085*Math.sin(i*7+phase)+.055*Math.sin(j*4+i*2));
      ring.push(add(c,add(scale(u,Math.cos(ang)*rad),scale(v,Math.sin(ang)*rad))));
    }rings.push(ring);
  }
  for(let j=0;j<m;j++)for(let i=0;i<n;i++)quad(out,rings[j][i],rings[j][(i+1)%n],rings[j+1][(i+1)%n],rings[j+1][i],tag);
  for(let i=0;i<n;i++){tri(out,a,rings[0][(i+1)%n],rings[0][i],1);tri(out,b,rings[m][i],rings[m][(i+1)%n],1);}
}
function twig(seed) {
  const rng=M.random(seed),out=[];
  branch(out,[-.34,-.01,0],[.34,.018,.018],.034,.019,rng);
  branch(out,[-.06,.005,0],[.22,.055,-.24],.019,.007,rng);
  branch(out,[.12,.018,0],[.28,.035,.13],.012,.004,rng);
  return out;
}
function wood(seed) {
  const rng=M.random(seed),out=[],n=12,m=14, rings=[];
  const irregular=Array.from({length:n},()=>.8+rng()*.28);
  for(let j=0;j<=m;j++){
    const ring=[];
    for(let i=0;i<n;i++){
      const a=i/n*Math.PI*2;
      // Wedge-shaped split face and splintered end grain, not a regular block.
      let y=Math.sin(a)*.104*irregular[i],z=Math.cos(a)*.116*irregular[i];
      if(y>.027)y=.038 + z*.2 + Math.sin(j*.5+i)*.005;
      const x=(j/m-.5)*.59+(j===0||j===m?(rng()-.5)*.04:0);
      ring.push([x,y+.025,z]);
    }rings.push(ring);
  }
  for(let j=0;j<m;j++)for(let i=0;i<n;i++)quad(out,rings[j][i],rings[j][(i+1)%n],rings[j+1][(i+1)%n],rings[j+1][i],i>0&&i<6?0:2);
  for(let i=0;i<n;i++){tri(out,[-.297,.025,0],rings[0][(i+1)%n],rings[0][i],1);tri(out,[.297,.025,0],rings[m][i],rings[m][(i+1)%n],1);}
  return out;
}
function geometry(kind,seed=173){if(!MATERIALS[kind])throw new Error('Unknown fuel material: '+kind);return new Float32Array(({paper,cardboard,twig,wood})[kind](seed));}
function colliders(kind){
  if(kind==='paper')return [{p:[0,0,0],r:.175}];
  if(kind==='cardboard')return [-.20,0,.20].flatMap(x=>[-.115,.115].map(z=>({p:[x,.012,z],r:.022})));
  if(kind==='twig')return [-.28,-.12,.05,.25].map(x=>({p:[x,.005,0],r:.03})).concat([{p:[.14,.04,-.18],r:.022}]);
  return [-.22,0,.22].map(x=>({p:[x,0,0],r:.084}));
}
// Thumbnails are projections of the same meshes used in the WebGL scene.
function thumbnail(canvas,kind){
 const ctx=canvas.getContext('2d'),w=176,h=116;canvas.width=w;canvas.height=h;
 const g=geometry(kind,9183),faces=[];
 function transform(p){const a=-.63,c=Math.cos(a),s=Math.sin(a);const x=p[0]*c-p[2]*s,z=p[0]*s+p[2]*c;return [x,p[1]*.80-z*.6,p[1]*.6+z*.8];}
 const light=M.normalize([-.3,.85,1.3]),col=MATERIALS[kind].color;
 for(let i=0;i<g.length;i+=21){const ps=[0,7,14].map(k=>transform(Array.from(g.slice(i+k,i+k+3))));const n=transform(Array.from(g.slice(i+3,i+6)));let shade=.27+Math.abs(M.dot(n,light))*.73;faces.push({ps,z:ps.reduce((s,p)=>s+p[2],0),shade,tag:g[i+6]});}
 faces.sort((a,b)=>a.z-b.z);ctx.clearRect(0,0,w,h);
 ctx.save();ctx.translate(w*.5,h*.56);ctx.scale(kind==='paper'?172:160,-172);
 for(const {ps,shade,tag} of faces){ctx.beginPath();ps.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=`rgb(${col.map(v=>Math.round(Math.pow(v*shade*(tag===2?.52:1),1/2.2)*255)).join(',')})`;ctx.fill();}
 ctx.restore();
}
I.materials=MATERIALS;I.fuelGeometry=geometry;I.fuelColliders=colliders;I.fuelThumbnail=thumbnail;
})(globalThis.Ignis=globalThis.Ignis||{});
