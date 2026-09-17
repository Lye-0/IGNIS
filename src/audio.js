/* User-initiated, locally synthesized fire sounds. No recordings / network requests. */
(function(I){'use strict';
class FireAudio{
 constructor(){this.context=null;this.enabled=false;this.muted=false;this.timer=null;this.fuel=1;this.nodes=[];this.transients=new Set();this.whooshes=0;}
 async toggle(){if(this.enabled){this.enabled=false;this.updateGain();this.stopTimer();this.stopTransients();return false;}const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw new Error('このブラウザでは音声合成を利用できません。');if(!this.context)this.create(AC);if(this.context.state==='suspended')await this.context.resume();this.enabled=true;this.updateGain();this.startTimer();return true;}
 create(AC){const ctx=this.context=new AC();this.master=ctx.createGain();this.master.gain.value=0;const limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-15;limiter.knee.value=18;limiter.ratio.value=4;limiter.attack.value=.008;limiter.release.value=.22;this.master.connect(limiter);limiter.connect(ctx.destination);this.nodes.push(limiter);const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),data=buffer.getChannelData(0);let brown=0;for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.018)/1.02;data[i]=brown*3.5;}
  const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=600;const high=ctx.createBiquadFilter();high.type='highpass';high.frequency.value=70;const gain=ctx.createGain();gain.gain.value=.55;source.connect(low);low.connect(high);high.connect(gain);gain.connect(this.master);source.start();this.nodes.push(source,low,high,gain);
 }
 updateGain(){if(this.context)this.master.gain.setTargetAtTime(this.enabled&&!this.muted?.30:0,this.context.currentTime,.2);}
 setPaused(paused){this.muted=paused;this.updateGain();if(paused){this.stopTimer();this.stopTransients();}else if(this.enabled)this.startTimer();}
 stopTimer(){clearTimeout(this.timer);this.timer=null;}
 startTimer(){this.stopTimer();if(!this.enabled||this.muted)return;this.crackle();this.timer=setTimeout(()=>this.startTimer(),70+Math.random()*420/this.fuel);}
 crackle(){const ctx=this.context;if(!ctx||ctx.state!=='running')return;const duration=.018+Math.random()*.12;const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*8);const s=ctx.createBufferSource();s.buffer=buffer;const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=800+Math.random()*2900;filter.Q.value=.7;const g=ctx.createGain();g.gain.value=.13+Math.random()*.65;s.connect(filter);filter.connect(g);g.connect(this.master);s.onended=()=>{s.disconnect();filter.disconnect();g.disconnect();};s.start();}
 stopTransients(){for(const source of this.transients)try{source.stop();}catch{}this.transients.clear();}
 track(source,nodes){
  this.transients.add(source);
  source.onended=()=>{this.transients.delete(source);for(const n of [source,...nodes])try{n.disconnect();}catch{}};
 }
 whoosh(event){
  const ctx=this.context,profile=event.body.material.response;
  const intensity=Math.min(1.2,event.strength??profile.strength);if(intensity<=0)return;
  // Bound overlapping one-shots. No periodic drone or explosion oscillator.
  if(this.transients.size>=16)return;
  const duration=profile.attack+profile.decay*7,buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);
  let low=0,mid=0;
  for(let i=0;i<data.length;i++){
   const t=i/ctx.sampleRate,n=Math.random()*2-1;low=low*.987+n*.013;mid=mid*.86+n*.14;
   const body=low*4.3+mid*.72+n*.065;
   const envelope=I.fuelResponse.envelope(t,profile.attack,profile.decay);
   data[i]=body*envelope*(.86+.09*Math.sin(t*21)+.05*Math.sin(t*47));
  }
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),high=ctx.createBiquadFilter(),gain=ctx.createGain();
  source.buffer=buffer;filter.type='lowpass';filter.Q.value=.45;
  const now=ctx.currentTime;
  filter.frequency.setValueAtTime(profile.tone*.65,now);
  filter.frequency.exponentialRampToValueAtTime(profile.tone*2.0,now+profile.attack);
  filter.frequency.exponentialRampToValueAtTime(profile.tone*.55,now+duration);
  high.type='highpass';high.frequency.value=48;high.Q.value=.55;
  gain.gain.value=.76*intensity;
  source.connect(filter);filter.connect(high);high.connect(gain);
  const nodes=[filter,high,gain];
  if(ctx.createStereoPanner){const pan=ctx.createStereoPanner();pan.pan.value=Math.max(-.65,Math.min(.65,event.pan||0));gain.connect(pan);pan.connect(this.master);nodes.push(pan);}else gain.connect(this.master);
  this.track(source,nodes);source.start();this.whooshes++;
 }
 materialEvent(event){
  const ctx=this.context;if(!this.enabled||this.muted||!ctx||ctx.state!=='running')return;
  if(!['throw','impact','ignite'].includes(event.type))return;
  if(event.type==='ignite'){this.whoosh(event);return;}
  const light=event.body.material.id<2;
  const duration=event.type==='ignite'?.60:event.type==='throw'?(light?.27:.14):(light?.15:.13);
  const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);
  let smooth=0;
  for(let i=0;i<data.length;i++){const t=i/ctx.sampleRate,env=Math.sin(Math.PI*i/data.length)*Math.exp(-i/data.length*(event.type==='ignite'?1:4));smooth=smooth*.8+(Math.random()*2-1)*.2;data[i]=(light?(Math.random()*2-1):smooth*2)*env;if(event.type==='impact'&&!light)data[i]+=Math.sin(t*Math.PI*2*(event.body.kind==='wood'?145:260))*env*.6;}
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;
  filter.type=event.type==='ignite'?'lowpass':light?'highpass':'lowpass';filter.frequency.value=event.type==='ignite'?520:light?1400:900;
  gain.gain.value=event.type==='ignite'?.13:event.type==='throw'?.12:light?.23:.5*(event.strength||.7);
  source.connect(filter);filter.connect(gain);gain.connect(this.master);this.track(source,[filter,gain]);source.start();
 }
 destroy(){this.stopTimer();this.stopTransients();for(const n of this.nodes){try{if(n.stop)n.stop();n.disconnect();}catch{}}this.context?.close();this.context=null;}
}
I.FireAudio=FireAudio;
})(globalThis.Ignis=globalThis.Ignis||{});
