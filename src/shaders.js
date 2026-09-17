/* IGNIS — original WebGL 2 shaders. Volumetric combustion is a visual model,
   not a calibrated chemical or Navier–Stokes solver. */
(function(I){'use strict';
const vertex=`#version 300 es
precision highp float;
out vec2 vUV;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
const common=`
precision highp float;
precision highp sampler3D;
in vec2 vUV;
uniform vec2 uResolution;
uniform float uTime,uFuel,uWind,uExposure;
uniform vec3 uCamera,uForward,uRight,uUp;
uniform float uShift,uFocal;
uniform vec4 uTouch;
uniform sampler3D uNoise;
const float PI=3.14159265359;
float hash(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
float noise(vec3 p){return texture(uNoise,p/64.).r;}
vec3 noise3(vec3 p){return texture(uNoise,p/64.).rgb;}
float fbm(vec3 p){return noise(p)*.57+noise(p*2.03+17.1)*.285+noise(p*4.07-8.2)*.145;}
vec3 getRay(vec2 uv){vec2 p=uv*2.-1.;p.x=p.x*uResolution.x/uResolution.y-uShift;return normalize(uForward*uFocal+uRight*p.x+uUp*p.y);}
vec2 boxHit(vec3 ro,vec3 rd,vec3 lo,vec3 hi){vec3 inv=1./(rd+vec3(1.e-9));vec3 a=(lo-ro)*inv,b=(hi-ro)*inv;vec3 mn=min(a,b),mx=max(a,b);return vec2(max(max(mn.x,mn.y),mn.z),min(min(mx.x,mx.y),mx.z));}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
vec2 cells(vec2 p){vec2 base=floor(p),f=fract(p);float first=8.,second=8.;for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 cell=vec2(x,y);vec2 seed=vec2(hash(base+cell),hash(base+cell+19.7));vec2 d=cell+.12+seed*.76-f;float v=dot(d,d);if(v<first){second=first;first=v;}else second=min(second,v);}return vec2(sqrt(first),sqrt(second)-sqrt(first));}
vec3 flameColor(float q){q=clamp(q,0.,1.);return vec3(1.,.055+pow(q,.9)*.68,.002+pow(q,3.0)*.30);}
float flicker(){return .9+.08*sin(uTime*6.3)+.06*sin(uTime*13.7+1.6)+.05*sin(uTime*22.4);}
`;
const atlas=`
uniform sampler2D uField;
uniform vec3 uGrid;
uniform vec2 uAtlas;
const vec3 VOL_MIN=vec3(-1.6,.20,-1.6);
const vec3 VOL_SIZE=vec3(3.2,4.2,3.2);
vec2 atlasUV(vec3 idx,float z){vec2 tile=vec2(mod(z,uAtlas.x),floor(z/uAtlas.x));return (tile*uGrid.xy+idx.xy+.5)/(uGrid.xy*uAtlas);}
vec4 sampleField(sampler2D tex,vec3 p){vec3 v=(p-VOL_MIN)/VOL_SIZE;if(any(lessThan(v,vec3(0)))||any(greaterThan(v,vec3(1))))return vec4(0);vec3 id=clamp(v*uGrid-.5,vec3(0),uGrid-1.);float z=floor(id.z);return mix(texture(tex,atlasUV(id,z)),texture(tex,atlasUV(id,min(z+1.,uGrid.z-1.))),fract(id.z));}
vec3 fromAtlas(){vec2 p=gl_FragCoord.xy-.5;vec2 tile=floor(p/uGrid.xy);return VOL_MIN+(vec3(mod(p,uGrid.xy),tile.x+tile.y*uAtlas.x)+.5)/uGrid*VOL_SIZE;}
`;
const flow=`
vec3 velocity(vec3 p){
 float h=max(0.,p.y-.34);vec3 q=p*2.6-vec3(.1,uTime*.82,.17);
 // Curl-like rotating eddies at several scales, with upward buoyant transport.
 vec3 curl=vec3(sin(q.y*1.9+sin(q.z*1.2)),sin(q.z*1.7+sin(q.x)),sin(q.x*1.3+sin(q.y*1.7)));
 vec3 fine=noise3(p*7.-vec3(0,uTime*3.,0))-.5;
 vec3 v=curl*vec3(.52,.30,.49)+fine*.35;
 v.y+=1.30+.30*exp(-h)+.16*sin(uTime*2.7);
 v.xz-=p.xz*.12;
 v.x+=uWind*(.8+h*.32);v.z+=uWind*.16;
 float touch=exp(-dot(p.xy-uTouch.xy,p.xy-uTouch.xy)*1.5-p.z*p.z*.8);
 v.x+=uTouch.z*touch*2.4;v.z+=uTouch.w*touch*2.4;v.y+=length(uTouch.zw)*touch*.38;
 return v;
}
float source(vec3 p){
 float s=0.;
 vec2 c[7]=vec2[7](vec2(-.54,-.16),vec2(-.28,.12),vec2(.02,-.05),vec2(.36,.05),vec2(.48,-.30),vec2(-.12,-.35),vec2(.12,.37));
 for(int i=0;i<7;i++){
  float f=float(i);float y=.41+.08*sin(f*2.7);
  vec3 d=(p-vec3(c[i].x,y,c[i].y))/vec3(.19,.12,.18);
  s=max(s,exp(-dot(d,d)*1.5)*(.78+.22*sin(uTime*(4.1+f*.2)+f*8.)));
 }
 return s;
}
`;
const simulation=`#version 300 es
${common}${atlas}${flow}
uniform float uDt;
uniform int uInit,uPass;
uniform sampler2D uAdvected;
uniform int uFeedCount;
uniform vec4 uFeedPos[12],uFeedInfo[12];
out vec4 outColor;
void main(){
 vec3 p=fromAtlas();vec3 vel=velocity(p);vec3 prev=p-vel*uDt;
 vec4 a=sampleField(uField,prev);
 if(uPass==0&&uInit==0){outColor=a;return;}
 if(uInit==0){
  vec4 here=sampleField(uField,p);
  vec4 back=sampleField(uAdvected,p+vel*uDt);
  vec4 forward=sampleField(uAdvected,p);
  vec3 h=VOL_SIZE/uGrid*.6;
  vec4 mx=max(max(sampleField(uField,prev+vec3(h.x,0,0)),sampleField(uField,prev-vec3(h.x,0,0))),max(sampleField(uField,prev+vec3(0,h.y,0)),sampleField(uField,prev-vec3(0,h.y,0))));
  mx=max(mx,max(sampleField(uField,prev+vec3(0,0,h.z)),sampleField(uField,prev-vec3(0,0,h.z))));
  a=clamp(forward+.5*(here-back),vec4(0),max(mx,a));
 }
 float heat=max(0.,a.r-uDt*(.30+.10*(1.-uFuel/1.55)));
 float smoke=a.g*exp(-uDt*.32);
 smoke+=uDt*.38*smoothstep(.04,.16,a.r)*(1.-smoothstep(.2,.4,a.r));
 float s=source(p);heat=max(heat,s*uFuel);
 smoke=max(smoke,s*.025);
 // Localized, delayed fuel sources. A thrown, unlit object adds no heat.
 for(int i=0;i<12;i++){
  if(i>=uFeedCount)break;
  vec4 src=uFeedPos[i],info=uFeedInfo[i];
  vec3 d=(p-src.xyz)/vec3(src.w,.19,src.w);
  float envelope=exp(-dot(d,d)*1.5);
  float tongues=.88+.12*sin(uTime*9.+float(i)*7.+p.x*19.);
  heat=max(heat,envelope*min(1.55,info.x*1.55)*tongues);
  smoke+=uDt*envelope*info.y*3.;
 }
 if(uInit==1){
  float h=max(0.,p.y-.45);vec3 q=p;q.xz+=vec2(sin(p.y*3.4),cos(p.y*2.8))*.12;
  float n=fbm(q*5.-vec3(0,2.,0));
  float rad=.63*(1.-smoothstep(.45,2.25,h));
  heat=max(heat,(1.-h/2.4)*(1.-smoothstep(rad*.28,rad,length(q.xz)))*(.60+n*.7));
  smoke=(1.-smoothstep(.35,.9,length(q.xz)))*smoothstep(1.,1.8,h)*(1.-smoothstep(2.7,4.,h))*.15;
 }
 float border=smoothstep(0.,.18,p.y-VOL_MIN.y)*(1.-smoothstep(3.7,4.2,p.y-VOL_MIN.y));
 border*=1.-smoothstep(1.35,1.6,max(abs(p.x),abs(p.z)));
 outColor=vec4(max(heat,0.)*border,max(smoke,0.)*border,0,1);
}`;
const resample=`#version 300 es
${common}${atlas}
uniform vec3 uNewGrid;
uniform vec2 uNewAtlas;
out vec4 outColor;
void main(){vec2 q=gl_FragCoord.xy-.5;vec2 tile=floor(q/uNewGrid.xy);vec3 pos=VOL_MIN+(vec3(mod(q,uNewGrid.xy),tile.x+tile.y*uNewAtlas.x)+.5)/uNewGrid*VOL_SIZE;outColor=sampleField(uField,pos);}`;
const geometry=`
float sdCylinder(vec3 p,float r,float h){vec2 d=abs(vec2(length(p.xz),p.y))-vec2(r,h);return min(max(d.x,d.y),0.)+length(max(d,0.));}
vec3 logLocal(vec3 p,int i){
 if(i==0){p-=vec3(-.06,.30,-.22);p.xz=mat2(.96,.28,-.28,.96)*p.xz;}
 if(i==1){p-=vec3(.0,.31,.26);p.xz=mat2(.90,-.43,.43,.90)*p.xz;}
 if(i==2){p-=vec3(-.22,.49,.015);p.xz=mat2(.45,.893,-.893,.45)*p.xz;p.xy=mat2(.986,.166,-.166,.986)*p.xy;}
 if(i==3){p-=vec3(.29,.49,-.02);p.xz=mat2(.56,-.828,.828,.56)*p.xz;p.xy=mat2(.995,-.10,.10,.995)*p.xy;}
 if(i==4){p-=vec3(.05,.62,-.13);p.xz=mat2(.986,.166,-.166,.986)*p.xz;p.xy=mat2(.98,-.199,.199,.98)*p.xy;}
 return p;
}
float logDist(vec3 p,int i){vec3 q=logLocal(p,i);float len=(i<2?.80:(i==4?.51:.64));float r=i==4?.085:.12;float angle=atan(q.z,q.y);
 float bark=.008*sin(angle*11.+sin(q.x*7.))+.006*sin(angle*23.+q.x*18.)+.008*sin(q.x*17.+float(i)*8.);
 vec2 d=abs(vec2(length(q.yz),q.x))-vec2(r+bark,len);return min(max(d.x,d.y),0.)+length(max(d,0.))-.007;
}
vec2 sceneDistance(vec3 p){
 // Heavy low steel dish, concentric bevels, and a subtly irregular ash bed.
 vec2 best=vec2(sdCylinder(p-vec3(0,.087,0),1.105,.042)-.012,1.);
 float rim=length(vec2(length(p.xz)-1.09,p.y-.145))-.028;
 if(rim<best.x)best=vec2(rim,1.);
 float ash=sdCylinder(p-vec3(0,.151,0),1.037,.019)+.007*sin(p.x*33.)*sin(p.z*23.);
 if(ash<best.x)best=vec2(ash,2.);
 if(p.y<.37){
  for(int i=0;i<13;i++){float f=float(i);float ang=f*2.39996;float radius=.28+.63*fract(f*.618);vec3 center=vec3(cos(ang)*radius,.19,sin(ang)*radius);vec3 q=p-center;vec3 size=vec3(.073+fract(f*.31)*.055,.046+fract(f*.47)*.04,.065+fract(f*.27)*.046);float lump=(length(q/size)-1.)*min(size.x,min(size.y,size.z));lump+=.006*sin(q.x*61.+f)*sin(q.z*54.);if(lump<best.x)best=vec2(lump,8.+f);}
 }
 for(int i=0;i<5;i++){float d=logDist(p,i);if(d<best.x)best=vec2(d,float(i)+3.);}
 return best;
}
vec3 getNormal(vec3 p){vec2 e=vec2(.00065,0);return normalize(vec3(sceneDistance(p+e.xyy).x-sceneDistance(p-e.xyy).x,sceneDistance(p+e.yxy).x-sceneDistance(p-e.yxy).x,sceneDistance(p+e.yyx).x-sceneDistance(p-e.yyx).x));}
float shadow(vec3 p,vec3 light){
 float result=1.;
 // Soft cylinder visibility avoids a second full scene march for each light.
 for(int i=0;i<5;i++){
  vec3 o=logLocal(p,i),d=logLocal(light,i)-o;
  float t=clamp(-dot(o.yz,d.yz)/max(dot(d.yz,d.yz),.0001),0.,1.);
  float len=i<2?.80:(i==4?.51:.64),radius=i==4?.078:.113;
  vec3 q=o+d*t;
  float axial=max(0.,abs(q.x)-len);
  float distanceToAxis=length(vec2(length(q.yz),axial));
  if(t>.025&&t<.98)result=min(result,smoothstep(radius-.018,radius+.035,distanceToAxis));
 }
 return max(.10,result);
}
`;
const scene=`#version 300 es
${common}${atlas}${geometry}
uniform int uObjectCount;
uniform vec4 uObjectPos[13];
out vec4 outColor;
vec3 lightSurface(vec3 p,vec3 n,vec3 rd,vec3 albedo,float rough,float metal,float material){
 vec3 result=albedo*vec3(.042,.05,.065)*(n.y*.45+.55);
 for(int i=0;i<4;i++){
  float fi=float(i);
  vec3 lp=vec3(sin(fi*2.5)*.39,.7+fi*.29,cos(fi*3.4)*.26);
  float actual=sampleField(uField,lp).r;
  vec3 L=lp-p;float d2=dot(L,L);L=normalize(L);vec3 H=normalize(L-rd);
  float ndl=max(dot(n,L),0.);float ndh=max(dot(n,H),0.);float ndv=max(dot(n,-rd),.001);
  vec3 radiance=vec3(1.,.245,.047)*(1.45+actual*1.8)*uFuel*flicker()/(d2+.55);
  float sh=1.;if(material>0.5&&ndl>.015)sh=shadow(p+n*.015,lp);
  float spec=pow(ndh,mix(140.,8.,rough))*(1.-rough*.45);
  vec3 F=mix(vec3(.045),albedo,metal)+(1.-mix(vec3(.045),albedo,metal))*pow(1.-max(dot(-rd,H),0.),5.);
  result+=(albedo*(1.-metal)*ndl*.55+F*spec*ndl*2.5)*radiance*sh;
 }
 // Very faint cool fill; it exposes only the shape of unlit charcoal and iron.
 vec3 cool=normalize(vec3(-2.,4.,-3.));float facing=max(0.,dot(n,cool));
 result+=albedo*vec3(.055,.069,.087)*facing;
 result+=vec3(.11,.14,.16)*pow(max(0.,dot(reflect(rd,n),cool)),40.)*(1.-rough)*.09;
 return result;
}
void main(){
 vec3 ro=uCamera,rd=getRay(vUV);float tFloor=rd.y<-.0001?-ro.y/rd.y:80.;float t=tFloor;float material=0.;vec3 n=vec3(0,1,0);
 vec2 box=boxHit(ro,rd,vec3(-1.16,.018,-1.16),vec3(1.16,.82,1.16));
 if(box.y>max(0.,box.x)){
  float s=max(0.,box.x);
  for(int i=0;i<80;i++){vec2 d=sceneDistance(ro+rd*s);if(d.x<.0014){if(s<t){t=s;material=d.y;n=getNormal(ro+rd*s);}break;}s+=max(.001,d.x*.78);if(s>box.y||s>t)break;}
 }
 vec3 color=vec3(.0014,.0017,.0021);
 if(t<60.){
  vec3 p=ro+rd*t;float textureNoise=fbm(p*34.);
  vec3 albedo=vec3(.055,.053,.05);float rough=.62,metal=.15;
  vec3 emission=vec3(0.);
  if(material<.5){
   float fine=vnoise(p.xz*145.);float grain=vnoise(p.xz*17.);
   albedo=vec3(.033,.034,.036)*(.78+grain*.20+fine*.12);
   n=normalize(vec3((vnoise(p.xz*65.+.07)-vnoise(p.xz*65.-.07))*.045,1.,(vnoise(p.zx*65.+9.07)-vnoise(p.zx*65.+8.93))*.045));
   rough=.65;metal=.09;
   float joint=min(abs(fract(p.x/3.8+.5)-.5),abs(fract(p.z/3.8+.5)-.5));
   albedo*=mix(.55,1.,smoothstep(.001,.003,joint));
  }else if(material<1.5){
   albedo=vec3(.062,.059,.055)*(.82+textureNoise*.28);rough=.37;metal=.91;
   float brushed=sin(length(p.xz)*1100.)*.5+.5;albedo*=.86+.14*brushed;
  }else if(material<2.5){
   float coal=vnoise(p.xz*24.);float fine=vnoise(p.xz*72.);albedo=vec3(.06)*(.4+coal*.7);rough=.95;metal=.0;
   float ember=pow(max(0.,.68-coal),3.)*smoothstep(.015,.25,fine)*(1.-smoothstep(.58,1.03,length(p.xz)));
   emission=vec3(1.,.075,.002)*ember*3.4*flicker()*uFuel;
  }else if(material<7.5){
   int index=int(material-3.);vec3 q=logLocal(p,index);float ang=atan(q.z,q.y);float len=index<2?.80:(index==4?.51:.64);
   vec2 barkUV=vec2(q.x*8.5,ang*2.6);
   barkUV+=vec2(vnoise(vec2(q.x*13.,ang*4.)),vnoise(vec2(ang*9.,q.x*4.)))*.53;
   vec2 cell=fract(barkUV);vec2 edge=min(cell,1.-cell);
   vec2 charCells=cells(barkUV*vec2(.88,.82));float seam=1.-smoothstep(.006,.035,charCells.y);
   float crack2=1.-smoothstep(.01,.046,abs(sin(ang*13.+q.x*9.+vnoise(q.xy*15.)*2.)));
   float hot=(1.-smoothstep(.22,.85,abs(q.x)))*pow(noise(p*9.+2.),2.)*1.4;
   float face=step(len-.016,abs(q.x));
   float rings=pow(.5+.5*sin(length(q.yz)*260.+noise(q*50.)*5.),5.);
   seam=mix(max(seam,crack2*.45),rings*.15,face);
   albedo=vec3(.041,.037,.032)*(.6+textureNoise*.8)+vec3(.015)*pow(noise(p*120.),4.);
   albedo*=1.-seam*.8;rough=.87;metal=.03;n=normalize(n+(noise3(p*75.)-.5)*.22);
   float ember=(seam*.75+pow(noise(p*42.),7.)*.28)*hot;
   emission=vec3(1.,.072,.002)*ember*(.7+.25*sin(uTime*2.7+q.x*8.))*uFuel;
  }
  if(material>7.5){vec2 c=cells(p.xz*36.+material);float cracks=1.-smoothstep(.012,.045,c.y);float heat=noise(p*22.+material);albedo=vec3(.046,.042,.038)*(.65+textureNoise*.6);rough=.9;metal=0.;emission=vec3(1.,.086,.004)*(cracks*.8+.025)*heat*2.3*uFuel*flicker();}
  color=lightSurface(p,n,rd,albedo,rough,metal,material)+emission;
  // Soft contact / flight shadows from the new solid fuel.
  float fuelOcclusion=1.;
  for(int i=0;i<13;i++){if(i>=uObjectCount)break;vec4 o=uObjectPos[i];float h=o.y-p.y;
   if(h>-.03&&h<2.5){float spread=o.w*(.65+h*.6);float d=length(p.xz-o.xz)/max(spread,.03);fuelOcclusion*=1.-.53*exp(-d*d*2.)*exp(-h*1.5);}
  }
  color*=fuelOcclusion;
  if(material<.5){
   float occlusion=smoothstep(.85,1.35,length(p.xz));color*=mix(.2,1.,occlusion);
   color=mix(vec3(.0014,.0017,.0021),color,exp(-t*.09));
  }
 }else{
  // A barely perceptible back wall, useful for seeing hot-air refraction.
  float wall=(-6.-ro.z)/(rd.z+1.e-6);vec3 p=ro+rd*wall;
  float haze=exp(-dot(p.xy-vec2(0,1.3),p.xy-vec2(0,1.3))*.033);
  color+=vec3(.0009,.00065,.0004)*haze;
  color*=.88+vnoise(p.xy*3.)*.24;
 }
 outColor=vec4(color,min(t,80.));
}`;
const volume=`#version 300 es
${common}${atlas}
uniform sampler2D uScene;
uniform int uSteps;
out vec4 outColor;
vec2 volumeDensity(vec3 p){
 float h=max(0.,p.y-.35);
 vec3 flow=p*vec3(6.0,2.5,6.0)-vec3(0.,uTime*3.5,0.);
 vec3 warp=(noise3(flow*.57)-.5)*(.12+.11*min(h,1.8));
 vec4 s=sampleField(uField,p+warp);
 float detail=fbm(flow*2.4+noise3(flow*.7)*2.4);
 // Sub-voxel wrinkling preserves thin tongues instead of a soft glowing cloud.
 float reaction=s.r+(detail-.50)*.52*smoothstep(.015,.15,s.r);
 float flame=max(0.,reaction-.065);
 float smoke=s.g*(.8+noise(flow*.53)*1.5);
 return vec2(flame,smoke);
}
vec4 integrate(vec3 ro,vec3 rd,float endT,int steps,float jitter,bool reflected){
 vec2 bounds=boxHit(ro,rd,VOL_MIN,VOL_MIN+VOL_SIZE);
 float start=max(bounds.x,0.),end=min(bounds.y,endT);
 if(end<=start)return vec4(0,0,0,1);
 float ds=(end-start)/float(steps);float t=start+ds*jitter;
 vec3 sum=vec3(0);float trans=1.;
 for(int i=0;i<180;i++){
  if(i>=steps||t>end||trans<.018)break;
  vec3 p=ro+rd*t;vec2 field=volumeDensity(p);float f=field.x,s=field.y;
  if(f>.0005||s>.002){
   float hot=clamp(f*1.55+.12,0.,1.);
   float density=s*2.2+f*1.8;
   float alpha=1.-exp(-density*ds);
   float sheet=exp(-pow((f-.22)/.14,2.));
   vec3 emission=flameColor(hot)*pow(f,.95)*(8.0+sheet*11.);
   // As soot cools it stops emitting, but still catches the firelight beneath.
   float light=exp(-p.y*.9)/(1.+dot(p.xz,p.xz)*2.);
   vec3 scatter=s*(vec3(.13,.145,.17)*.42+vec3(.95,.25,.05)*light*1.2*uFuel);
   sum+=trans*(emission+scatter)*ds;
   trans*=1.-alpha;
  }
  t+=ds;
 }
 return vec4(sum,trans);
}
void main(){
 vec3 ro=uCamera,rd=getRay(vUV);vec4 bg=texture(uScene,vUV);
 float jitter=hash(gl_FragCoord.xy+fract(uTime)*173.);
 vec3 hit=ro+rd*bg.a;
 if(abs(hit.y)<.005&&length(hit.xz)<5.5){
  vec3 n=normalize(vec3((vnoise(hit.xz*12.)-.5)*.14,1.,(vnoise(hit.zx*15.+17.)-.5)*.14));
  vec3 refl=reflect(rd,n);int count=max(24,uSteps/3);
  vec4 r=integrate(hit+vec3(0,.035,0),refl,12.,count,jitter,true);
  float fresnel=.032+.26*pow(1.-max(0.,dot(n,-rd)),5.);
  float roughness=.68+vnoise(hit.xz*90.)*.32;
  bg.rgb+=r.rgb*fresnel*roughness*.15;
 }
 vec4 fire=integrate(ro,rd,bg.a,uSteps,jitter,false);
 // Heat mask is kept independently of visible smoke.
 vec2 bounds=boxHit(ro,rd,vec3(-1.4,.5,-1.4),vec3(1.8,4.4,1.4));
 float mask=0.;if(bounds.y>max(0.,bounds.x)){
  vec3 mid=ro+rd*(max(0.,bounds.x)+max(0.,min(bounds.y,bg.a)-max(0.,bounds.x))*.5);
  mask=exp(-dot(mid.xz-vec2(uWind*mid.y*.1,0.),mid.xz-vec2(uWind*mid.y*.1,0.))*1.7)*smoothstep(.5,1.4,mid.y)*(1.-smoothstep(3.2,4.4,mid.y));
 }
 outColor=vec4(fire.rgb+fire.a*bg.rgb,mask*.9);
}`;
const blur=`#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uImage;
uniform vec2 uDirection;
uniform float uThreshold;
out vec4 outColor;
vec3 sampleBright(vec2 uv){vec3 c=texture(uImage,uv).rgb;return c*max(0.,max(max(c.r,c.g),c.b)-uThreshold)/max(.001,max(max(c.r,c.g),c.b));}
void main(){vec3 c=sampleBright(vUV)*.227027;c+=sampleBright(vUV+uDirection*1.384615)*.316216;c+=sampleBright(vUV-uDirection*1.384615)*.316216;c+=sampleBright(vUV+uDirection*3.230769)*.070270;c+=sampleBright(vUV-uDirection*3.230769)*.070270;outColor=vec4(c,1.);}`;
const composite=`#version 300 es
${common}
uniform sampler2D uImage,uBloom,uBloomWide;
out vec4 outColor;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
 float heat=texture(uImage,vUV).a;
 vec3 n=noise3(vec3(vUV*vec2(28.,41.),uTime*.7));
 vec2 offset=(n.rg-.5)*heat*vec2(.004,.0015)*(.75+uFuel*.25);
 vec3 base=texture(uImage,vUV+offset).rgb;
 vec3 bloom=texture(uBloom,vUV+offset).rgb;
 vec3 wide=texture(uBloomWide,vUV).rgb;
 vec3 col=base+bloom*.07+wide*.055;
 col=aces(col*uExposure*1.18);
 col=pow(col,vec3(1./2.2));
 float vignette=1.-.30*pow(length((vUV-.5)*vec2(.8,1.)),1.5);
 col*=vignette;
 float grain=(hash(gl_FragCoord.xy+fract(uTime*13.19)*215.)-.5)/255.;
 col+=grain;
 outColor=vec4(col,1.);
}`;
const sparkVertex=`#version 300 es
precision highp float;
layout(location=0) in vec4 aPosition;
layout(location=1) in vec4 aInfo;
uniform vec3 uCamera,uForward,uRight,uUp;
uniform vec2 uResolution;
uniform float uFocal,uShift;
out float vLife,vDepth,vSeed,vKind;
void main(){vec3 d=aPosition.xyz-uCamera;float depth=dot(d,uForward);vec2 xy=vec2(dot(d,uRight),dot(d,uUp))*uFocal/max(.01,depth);xy.x=(xy.x+uShift)/(uResolution.x/uResolution.y);gl_Position=vec4(xy,0.,1.);if(depth<=0.)gl_Position=vec4(3,3,3,1);gl_PointSize=clamp(aPosition.w*uResolution.y/max(depth,.1),1.,12.);vLife=aInfo.x;vDepth=depth;vSeed=aInfo.y;vKind=aInfo.z;}`;
const sparkFragment=`#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uResolution;
uniform vec3 uCamera,uForward,uRight,uUp;
uniform float uFocal,uShift;
in float vLife,vDepth,vSeed,vKind;
out vec4 outColor;
void main(){vec2 uv=gl_FragCoord.xy/uResolution;vec2 screen=uv*2.-1.;screen.x=screen.x*uResolution.x/uResolution.y-uShift;vec3 ray=normalize(uForward*uFocal+uRight*screen.x+uUp*screen.y);float sceneDepth=texture(uScene,uv).a*dot(ray,uForward);if(vDepth>sceneDepth+.015)discard;
 vec2 q=gl_PointCoord*2.-1.;float r=length(q);float core=exp(-r*r*8.);float a=core*(1.-smoothstep(.3,1.,r))*vLife;
 if(vKind>.5){float edge=1.-smoothstep(.35,.87,max(abs(q.x+q.y*.25),abs(q.y)));float alpha=edge*vLife*.65;outColor=vec4(vec3(.18,.145,.105)*alpha,alpha);}
 else outColor=vec4(vec3(1.,.16+.3*vLife,.008+.06*vLife)*a*(2.+vSeed*5.),0.);}`;
I.shaderParts={common,atlas,geometry};
I.shaders={vertex,simulation,resample,scene,volume,blur,composite,sparkVertex,sparkFragment};
})(globalThis.Ignis=globalThis.Ignis||{});
