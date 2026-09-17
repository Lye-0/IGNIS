/* IGNIS — WebGL 2 renderer, GPU-advected 3D combustion, HDR volume rendering. */
(function(I){'use strict';
const {clamp,random}=I.math;
const QUALITY={low:{grid:[24,48,24],steps:64,scale:.66,maxPixels:460000},medium:{grid:[48,96,48],steps:104,scale:.86,maxPixels:1050000},high:{grid:[56,112,56],steps:144,scale:1.12,maxPixels:2100000},ultra:{grid:[64,128,64],steps:180,scale:1.5,maxPixels:3500000}};
class Program{
 constructor(gl,vs,fs,name){this.gl=gl;this.name=name;const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(`${name}: ${error}`);}return s;};const v=compile(gl.VERTEX_SHADER,vs),f=compile(gl.FRAGMENT_SHADER,fs);this.id=gl.createProgram();gl.attachShader(this.id,v);gl.attachShader(this.id,f);gl.linkProgram(this.id);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(this.id,gl.LINK_STATUS))throw new Error(`${name}: ${gl.getProgramInfoLog(this.id)}`);this.uniforms=new Map();for(let i=0;i<gl.getProgramParameter(this.id,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(this.id,i);this.uniforms.set(u.name,{location:gl.getUniformLocation(this.id,u.name),type:u.type});}}
 use(){this.gl.useProgram(this.id);return this;}
 set(name,value){const gl=this.gl,u=this.uniforms.get(name);if(!u)return this;const l=u.location;if([gl.INT,gl.BOOL,gl.SAMPLER_2D,gl.SAMPLER_3D].includes(u.type))gl.uniform1i(l,value);else if(typeof value==='number')gl.uniform1f(l,value);else if(value.length===2)gl.uniform2fv(l,value);else if(value.length===3)gl.uniform3fv(l,value);else if(value.length===4)gl.uniform4fv(l,value);return this;}
 values(values){for(const [name,value] of Object.entries(values))this.set(name,value);return this;}
 texture(name,texture,unit,target=this.gl.TEXTURE_2D){const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(target,texture);this.set(name,unit);return this;}
 destroy(){this.gl.deleteProgram(this.id);}
}
class Target{
 constructor(gl,width,height){this.gl=gl;this.width=width;this.height=height;this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA16F,width,height,0,gl.RGBA,gl.HALF_FLOAT,null);this.framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('浮動小数点の描画領域を作成できません。');gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}
 bind(){const gl=this.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.viewport(0,0,this.width,this.height);}
 destroy(){this.gl.deleteTexture(this.texture);this.gl.deleteFramebuffer(this.framebuffer);}
}
class Renderer{
 constructor(canvas,{quality='medium'}={}){
  this.canvas=canvas;const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
  if(!gl)throw new Error('WebGL 2 が利用できません。通常のブラウザで開き、ハードウェアアクセラレーションを有効にしてください。');
  if(!gl.getExtension('EXT_color_buffer_float'))throw new Error('この環境ではHDR描画に必要な拡張機能を利用できません。別のWebGL 2対応ブラウザで開いてください。');
  this.gl=gl;this.destroyed=false;this.quality=quality;this.width=0;this.height=0;this.frame=0;this.random=random(73218);this.particles=[];this.spawn=0;
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.noise=this.createNoise();
  this.programs={};for(const name of ['simulation','resample','scene','volume','blur','composite'])this.programs[name]=new Program(gl,I.shaders.vertex,I.shaders[name],name);
  this.programs.sparks=new Program(gl,I.shaders.sparkVertex,I.shaders.sparkFragment,'sparks');
  this.sparkVao=gl.createVertexArray();gl.bindVertexArray(this.sparkVao);this.sparkBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.sparkBuffer);gl.bufferData(gl.ARRAY_BUFFER,1200*8*4,gl.DYNAMIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,32,0);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,4,gl.FLOAT,false,32,16);this.sparkData=new Float32Array(1200*8);gl.bindVertexArray(this.vao);
  this.setQuality(quality);
 }
 createNoise(){const gl=this.gl,rng=random(59123),data=new Uint8Array(64*64*64*4);for(let i=0;i<data.length;i++)data[i]=Math.floor(rng()*256);const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,texture);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,p,gl.REPEAT);gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,64,64,64,0,gl.RGBA,gl.UNSIGNED_BYTE,data);return texture;}
 setQuality(name){
  if(!QUALITY[name])throw new Error(`Unknown quality: ${name}`);
  const oldFields=this.fields,oldGrid=this.grid,oldAtlas=this.atlas,oldIndex=this.fieldIndex;
  this.quality=name;this.config=QUALITY[name];this.grid=this.config.grid;this.atlas=[8,Math.ceil(this.grid[2]/8)];
  if(this.advected)this.advected.destroy();
  const width=this.grid[0]*this.atlas[0],height=this.grid[1]*this.atlas[1];
  this.advected=new Target(this.gl,width,height);this.fields=[new Target(this.gl,width,height),new Target(this.gl,width,height)];this.fieldIndex=0;
  if(oldFields){this.fields[0].bind();this.programs.resample.use().values({uGrid:oldGrid,uAtlas:oldAtlas,uNewGrid:this.grid,uNewAtlas:this.atlas}).texture('uField',oldFields[oldIndex].texture,0);this.quad();for(const t of oldFields)t.destroy();this.initialize=false;}
  else this.initialize=true;
  this.resize(true);
 }
 resize(force=false){const w=this.canvas.clientWidth||innerWidth,h=this.canvas.clientHeight||innerHeight;let scale=this.config.scale*Math.min(devicePixelRatio||1,1.65);scale=Math.min(scale,Math.sqrt(this.config.maxPixels/(w*h)));const width=Math.max(2,Math.round(w*scale)),height=Math.max(2,Math.round(h*scale));if(!force&&width===this.width&&height===this.height)return false;this.width=width;this.height=height;this.canvas.width=width;this.canvas.height=height;if(this.targets)for(const t of Object.values(this.targets))t.destroy();const gl=this.gl;this.targets={scene:new Target(gl,width,height),volume:new Target(gl,width,height),bloomA:new Target(gl,Math.max(2,width>>2),Math.max(2,height>>2)),bloomB:new Target(gl,Math.max(2,width>>2),Math.max(2,height>>2)),wideA:new Target(gl,Math.max(2,width>>4),Math.max(2,height>>4)),wideB:new Target(gl,Math.max(2,width>>4),Math.max(2,height>>4))};return true;}
 common(state,camera){return {uResolution:[this.width,this.height],uTime:state.time,uFuel:state.fuel,uWind:state.wind,uExposure:state.exposure,uCamera:camera.origin,uForward:camera.forward,uRight:camera.right,uUp:camera.up,uShift:state.shift,uFocal:state.focal,uTouch:state.touch,uGrid:this.grid,uAtlas:this.atlas};}
 quad(){this.gl.bindVertexArray(this.vao);this.gl.drawArrays(this.gl.TRIANGLES,0,3);}
 simulate(dt,uniforms){if(dt<=0&&!this.initialize)return;const gl=this.gl,next=1-this.fieldIndex,p=this.programs.simulation;
 p.use().values(uniforms).set('uDt',Math.min(dt,.045)).set('uInit',this.initialize?1:0).texture('uField',this.fields[this.fieldIndex].texture,0).texture('uNoise',this.noise,2,gl.TEXTURE_3D);
 if(!this.initialize){this.advected.bind();p.set('uPass',0).texture('uAdvected',this.fields[this.fieldIndex].texture,3);this.quad();}
 this.fields[next].bind();p.set('uPass',1).texture('uAdvected',this.advected.texture,3);this.quad();this.fieldIndex=next;this.initialize=false;}
 updateParticles(dt,state){const r=this.random;this.spawn+=dt*(22+state.fuel*20+Math.abs(state.touch[2])*12);while(this.spawn>=1&&this.particles.length<200){this.spawn--;const x=(r()-.5)*1.0,z=(r()-.5)*.8;this.particles.push({x,y:.40+r()*.3,z,vx:(r()-.5)*.32,vz:(r()-.5)*.32,vy:.45+r()*.85,age:0,life:.65+r()*2.2,size:.012+r()*.02,seed:r()});}this.spawn=Math.min(this.spawn,1);for(const p of this.particles){p.age+=dt;p.vx+=(state.wind*.45+state.touch[2]*.32-p.vx*.2)*dt;p.vz+=(state.touch[3]*.32-p.vz*.16)*dt;p.x+=(p.vx+Math.sin(p.y*5.+state.time*3.+p.seed*31.)*.16)*dt;p.z+=(p.vz+Math.sin(p.y*4.+state.time*2.+p.seed*12.)*.14)*dt;p.y+=p.vy*dt;p.vy*=Math.exp(-dt*.22);}this.particles=this.particles.filter(p=>p.age<p.life&&p.y<4.4);}
 drawParticles(uniforms){if(!this.particles.length)return;const gl=this.gl;let n=0;for(const p of this.particles){const life=clamp(1-p.age/p.life,0,1)*Math.min(1,p.age*20);for(let j=0;j<3;j++){const off=n++*8;this.sparkData.set([p.x-p.vx*j*.012,p.y-p.vy*j*.014,p.z-p.vz*j*.012,p.size*(1-j*.15),life*(1-j*.24),p.seed,0,0],off);}}gl.bindVertexArray(this.sparkVao);gl.bindBuffer(gl.ARRAY_BUFFER,this.sparkBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.sparkData.subarray(0,n*8));this.programs.sparks.use().values(uniforms).texture('uScene',this.targets.scene.texture,0);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.colorMask(true,true,true,false);gl.drawArrays(gl.POINTS,0,n);gl.colorMask(true,true,true,true);gl.disable(gl.BLEND);gl.bindVertexArray(this.vao);}
 blur(source,target,direction,threshold=0){target.bind();this.programs.blur.use().texture('uImage',source.texture,0).set('uDirection',direction).set('uThreshold',threshold);this.quad();}
 render(state,camera,dt){if(this.destroyed)return;const gl=this.gl;this.resize();const u=this.common(state,camera);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);this.simulate(dt,u);
  const field=this.fields[this.fieldIndex].texture,T=this.targets;
  T.scene.bind();this.programs.scene.use().values(u).texture('uField',field,1).texture('uNoise',this.noise,2,gl.TEXTURE_3D);this.quad();
  T.volume.bind();this.programs.volume.use().values(u).set('uSteps',this.config.steps).texture('uScene',T.scene.texture,0).texture('uField',field,1).texture('uNoise',this.noise,2,gl.TEXTURE_3D);this.quad();
  this.updateParticles(dt,state);this.drawParticles(u);
  this.blur(T.volume,T.bloomA,[2/this.width,0],.65);this.blur(T.bloomA,T.bloomB,[0,1/T.bloomA.height]);this.blur(T.bloomB,T.bloomA,[1/T.bloomA.width,0]);
  this.blur(T.bloomA,T.wideA,[1/T.bloomA.width,0]);this.blur(T.wideA,T.wideB,[0,1.8/T.wideA.height]);this.blur(T.wideB,T.wideA,[1.8/T.wideA.width,0]);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.width,this.height);this.programs.composite.use().values(u).texture('uImage',T.volume.texture,0).texture('uBloom',T.bloomA.texture,1).texture('uBloomWide',T.wideA.texture,3).texture('uNoise',this.noise,2,gl.TEXTURE_3D);this.quad();this.frame++;
 }
 reset(){this.initialize=true;this.particles=[];this.spawn=0;}
 info(){return {quality:this.quality,resolution:[this.width,this.height],grid:this.grid,volumeSteps:this.config.steps,frame:this.frame,particles:this.particles.length};}
 destroy(){if(this.destroyed)return;this.destroyed=true;for(const p of Object.values(this.programs))p.destroy();for(const t of Object.values(this.targets))t.destroy();for(const f of this.fields)f.destroy();this.advected.destroy();const gl=this.gl;gl.deleteTexture(this.noise);gl.deleteBuffer(this.sparkBuffer);gl.deleteVertexArray(this.vao);gl.deleteVertexArray(this.sparkVao);}
}
I.Renderer=Renderer;I.QUALITY=QUALITY;
})(globalThis.Ignis=globalThis.Ignis||{});
