/* IGNIS II — solid materials rendered into the HDR/depth scene before fire.
 * Fire is integrated up to each fragment's actual depth: it wraps around,
 * rather than being painted indiscriminately over the added objects.
 */
(function(I){
'use strict';
const vertex=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in float aTag;
uniform vec3 uPosition,uScale,uCamera,uForward,uRight,uUp;
uniform vec4 uRotation;
uniform vec2 uResolution;
uniform float uFocal,uShift,uBurn,uSeed;
uniform highp int uKind;
out vec3 vWorld,vLocal,vNormal;
out float vTag;
out vec2 vUV;
vec3 rotateQ(vec3 v){return v+2.*cross(uRotation.xyz,cross(uRotation.xyz,v)+uRotation.w*v);}
void main(){
 vec3 local=aPosition;
 // The paper/card curls, then folds down, while its surviving fibers stay put.
 if(uKind<2){float edge=pow(clamp(length(local.xz)/.32,0.,1.),2.);local.y+=sin(local.x*10.+uSeed)*uBurn*edge*.09;}
 vLocal=aPosition;vNormal=normalize(rotateQ(aNormal/max(uScale,vec3(.001))));vTag=aTag;
 vWorld=uPosition+rotateQ(local*uScale);
 vec3 d=vWorld-uCamera;float depth=dot(d,uForward);
 vec2 xy=vec2(dot(d,uRight),dot(d,uUp))*uFocal;xy.x=(xy.x+uShift*depth)/(uResolution.x/uResolution.y);
 float near=.04,far=80.;float z=((far+near)/(far-near))*depth-2.*far*near/(far-near);
 gl_Position=vec4(xy,z,depth);vUV=vec2(0);
}`;
const fragment=`#version 300 es
${I.shaderParts.common}${I.shaderParts.atlas}${I.shaderParts.geometry}${I.shaderParts.surge}
uniform sampler2D uStaticScene;
uniform float uBurn,uHeat,uGlow,uPower,uSeed,uAsh;
uniform highp int uKind;
in vec3 vWorld,vLocal,vNormal;
in float vTag;
out vec4 outColor;
void main(){
 vec3 p=vWorld,q=vLocal;vec2 uv=gl_FragCoord.xy/uResolution;
 float depth=length(p-uCamera);if(depth>texture(uStaticScene,uv).a+.004)discard;
 vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
 float seed=fract(uSeed*.173)*37.;
 float grain=noise(q*vec3(11.,120.,84.)+seed);
 float fiber=noise(q*vec3(4.,170.,215.)+seed);
 float pores=noise(q*160.+seed);
 float front=uBurn*1.45+uHeat*.10;
 float pattern=.18+noise(q*11.+seed)*.56+q.y*.90;
 float burned=smoothstep(pattern-.045,pattern+.07,front);
 float fringe=exp(-pow((pattern-front)/.045,2.));
 float ashiness=uAsh;
 vec3 base;float rough=.86;
 if(uKind==0){
  base=vec3(.67,.61,.49)*(.88+pores*.20);
  float crease=pow(1.-abs(dot(n,normalize(vec3(.8,.4,.3)))),5.);base*=1.-crease*.18;
  // Irregular holes only appear after sustained burning, not at touch-down.
  float holes=noise(q*24.+seed)*.72+noise(q*51.-seed)*.28;
  float threshold=max(0.,uBurn-.22)*.92;
  if(holes<threshold)discard;
  fringe=max(fringe,exp(-pow((holes-threshold)/.027,2.))*step(.25,uBurn));
 }else if(uKind==1){
  base=vec3(.35,.185,.066)*(.78+fiber*.28+pores*.10);
  float pressed=.97+.03*sin(q.z*230.);base*=pressed;
  if(vTag>.5){float corrugation=smoothstep(.2,.72,.5+.5*sin(q.x*600.));base*=.20+.80*corrugation;}
  float holes=noise(q*18.+seed)*.7+noise(q*43.-seed)*.3;
  float threshold=max(0.,uBurn-.38)*1.12;if(holes<threshold)discard;
  fringe=max(fringe,exp(-pow((holes-threshold)/.025,2.))*step(.45,uBurn));
 }else{
  float endgrain=.5+.5*sin(length(q.yz-vec2(.024,0))*265.+noise(q*42.)*3.3);
  if(uKind==2){
   float angle=atan(q.z,q.y);float grooves=pow(.5+.5*sin(angle*19.+sin(q.x*27.)*.6),7.);
   base=vec3(.16,.078,.032)*(.60+pores*.50+grain*.23)*(1.-grooves*.5);
  }else{
   base=vec3(.46,.265,.109)*(.67+grain*.28+fiber*.17);
   if(vTag>1.5)base=vec3(.125,.061,.022)*(.65+fiber*.55);
  }
  if(vTag>.5&&vTag<1.5)base=vec3(.46,.29,.145)*(.64+endgrain*.19+pores*.16);
 }
 float seam;
 if(uKind<2)seam=pow(1.-noise(q*36.+seed),6.);
 else{vec2 barkUV=vec2(q.x*14.,atan(q.z,q.y)*3.8)+seed;vec2 c=cells(barkUV);seam=1.-smoothstep(.007,.046,c.y);}
 vec3 charcoal=vec3(.020,.018,.016)*(.55+pores*.75)*(1.-seam*.65);
 base=mix(base,charcoal,burned);base=mix(base,vec3(.18,.171,.157)*(.66+pores*.45),ashiness);
 n=normalize(n+(noise3(q*170.+seed)-.5)*.12);
 vec3 rd=normalize(p-uCamera);
 vec3 color=base*vec3(.17,.18,.20)*(n.y*.18+.82);
 for(int i=0;i<4;i++){
  float f=float(i);vec3 lp=vec3(sin(f*2.5)*.39,.70+f*.29,cos(f*3.4)*.26);
  vec3 ld=lp-p;float d2=dot(ld,ld);vec3 L=normalize(ld),H=normalize(L-rd);
  float ndl=max(0.,dot(n,L));float transmitted=uKind<2?pow(max(0.,dot(-n,L)),2.)*.11*(1.-burned):0.;
  float actual=sampleField(uField,lp).r;
  vec3 radiance=vec3(1.,.29,.066)*(1.45+actual*1.8)*uFuel*flicker()/(d2+.55);
  float sh=shadow(p+n*.018,lp);
  color+=base*radiance*(ndl*.55+transmitted)*sh;
  color+=vec3(.026)*pow(max(dot(n,H),0.),18.)*radiance*ndl*sh;
 }
 for(int i=0;i<12;i++){
  if(i>=uSurgeCount)break;
  vec3 lp=uSurgePos[i].xyz+vec3(0.,.32,0.),d=lp-p;float d2=dot(d,d);vec3 L=normalize(d);
  float ndl=max(0.,dot(n,L)),transmitted=uKind<2?pow(max(0.,dot(-n,L)),2.)*.09*(1.-burned):0.;
  color+=base*vec3(1.,.32,.075)*uSurgeInfo[i].x*2.6/(d2+.48)*(ndl*.55+transmitted)*shadow(p+n*.018,lp);
 }
 vec3 fill=normalize(vec3(-2.,4.,3.));color+=base*vec3(.15,.17,.19)*max(0.,dot(n,fill));
 float hotEdge=fringe*uPower*(1.-ashiness);
 float embers=seam*burned*uGlow*(1.-ashiness)*(.60+.4*noise(q*18.+uTime*.3));
 color+=vec3(1.,.10,.002)*(hotEdge*2.5+embers*1.6);
 outColor=vec4(color,depth);
}`;
class FuelRenderer{
 constructor(gl){this.gl=gl;this.program=new I.GLProgram(gl,vertex,fragment,'solid-fuel');this.meshes=new Map();}
 mesh(body){
  if(this.meshes.has(body.id))return this.meshes.get(body.id);
  const gl=this.gl,vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,body.mesh,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,28,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,28,12);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,1,gl.FLOAT,false,28,24);
  const mesh={vao,buffer,count:body.mesh.length/7};this.meshes.set(body.id,mesh);return mesh;
 }
 draw(world,uniforms,background,field,noise){
  const gl=this.gl,bodies=world.held?[...world.bodies,world.held]:world.bodies,active=new Set(bodies.map(b=>b.id));
  for(const [id,m] of this.meshes)if(!active.has(id)){gl.deleteVertexArray(m.vao);gl.deleteBuffer(m.buffer);this.meshes.delete(id);}
  if(!bodies.length)return;
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
  const p=this.program.use().values(uniforms).texture('uStaticScene',background,0).texture('uField',field,1).texture('uNoise',noise,2,gl.TEXTURE_3D);
  for(const body of bodies){
   const mesh=this.mesh(body);gl.bindVertexArray(mesh.vao);
   const ash=body.stage==='ash'?1:body.stage==='ember'?Math.min(1,.22+body.emberAge/body.material.ember*.78):Math.max(0,body.progress-.78)*(body.material.id<2?2.2:1.0);
   p.values({uPosition:body.position,uScale:body.scale,uRotation:body.quaternion,uKind:body.material.id,uBurn:body.progress,uHeat:body.heat,uGlow:body.glow,uPower:body.power,uSeed:body.seed%20000,uAsh:ash});
   gl.drawArrays(gl.TRIANGLES,0,mesh.count);
  }
  gl.disable(gl.DEPTH_TEST);
 }
 destroy(){this.program.destroy();for(const m of this.meshes.values()){this.gl.deleteBuffer(m.buffer);this.gl.deleteVertexArray(m.vao);}this.meshes.clear();}
}
I.FuelRenderer=FuelRenderer;
})(globalThis.Ignis=globalThis.Ignis||{});
