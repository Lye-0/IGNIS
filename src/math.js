/* IGNIS — small, dependency-free math utilities. */
(function(I){
'use strict';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const mix=(a,b,t)=>a+(b-a)*t;
const normalize=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
function random(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function camera(yaw,pitch,distance,target){const cp=Math.cos(pitch);const origin=[target[0]+Math.sin(yaw)*cp*distance,target[1]+Math.sin(pitch)*distance,target[2]+Math.cos(yaw)*cp*distance];const forward=normalize(target.map((n,i)=>n-origin[i]));const right=normalize(cross(forward,[0,1,0]));const up=cross(right,forward);return {origin,forward,right,up};}
function rayAt(x,y,w,h,cam,shift=0,focal=1.9){const px=(2*x/w-1)*w/h-shift;const py=1-2*y/h;return normalize(cam.forward.map((v,i)=>v*focal+cam.right[i]*px+cam.up[i]*py));}
function intersectPlane(origin,direction,point,normal){const denom=dot(direction,normal);if(Math.abs(denom)<1e-6)return null;const t=dot(point.map((p,i)=>p-origin[i]),normal)/denom;if(t<=0)return null;return origin.map((v,i)=>v+direction[i]*t);}
I.math={clamp,mix,normalize,cross,dot,random,camera,rayAt,intersectPlane};
})(globalThis.Ignis=globalThis.Ignis||{});
