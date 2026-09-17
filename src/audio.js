/* User-initiated, locally synthesized fire sounds. No recordings / network requests. */
(function(I){'use strict';
class FireAudio{
 constructor(){this.context=null;this.enabled=false;this.muted=false;this.timer=null;this.fuel=1;this.nodes=[];}
 async toggle(){if(this.enabled){this.enabled=false;this.updateGain();this.stopTimer();return false;}const AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw new Error('このブラウザでは音声合成を利用できません。');if(!this.context)this.create(AC);if(this.context.state==='suspended')await this.context.resume();this.enabled=true;this.updateGain();this.startTimer();return true;}
 create(AC){const ctx=this.context=new AC();this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(ctx.destination);const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),data=buffer.getChannelData(0);let brown=0;for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.018)/1.02;data[i]=brown*3.5;}
  const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=600;const high=ctx.createBiquadFilter();high.type='highpass';high.frequency.value=70;const gain=ctx.createGain();gain.gain.value=.55;source.connect(low);low.connect(high);high.connect(gain);gain.connect(this.master);source.start();this.nodes.push(source,low,high,gain);
 }
 updateGain(){if(this.context)this.master.gain.setTargetAtTime(this.enabled&&!this.muted?.30:0,this.context.currentTime,.2);}
 setPaused(paused){this.muted=paused;this.updateGain();if(paused)this.stopTimer();else if(this.enabled)this.startTimer();}
 stopTimer(){clearTimeout(this.timer);this.timer=null;}
 startTimer(){this.stopTimer();if(!this.enabled||this.muted)return;this.crackle();this.timer=setTimeout(()=>this.startTimer(),70+Math.random()*420/this.fuel);}
 crackle(){const ctx=this.context;if(!ctx||ctx.state!=='running')return;const duration=.018+Math.random()*.12;const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*8);const s=ctx.createBufferSource();s.buffer=buffer;const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=800+Math.random()*2900;filter.Q.value=.7;const g=ctx.createGain();g.gain.value=.13+Math.random()*.65;s.connect(filter);filter.connect(g);g.connect(this.master);s.onended=()=>{s.disconnect();filter.disconnect();g.disconnect();};s.start();}
 materialEvent(event){
  const ctx=this.context;if(!this.enabled||this.muted||!ctx||ctx.state!=='running')return;
  if(!['throw','impact','ignite'].includes(event.type))return;
  const light=event.body.material.id<2;
  const duration=event.type==='ignite'?.60:event.type==='throw'?(light?.27:.14):(light?.15:.13);
  const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);
  let smooth=0;
  for(let i=0;i<data.length;i++){const t=i/ctx.sampleRate,env=Math.sin(Math.PI*i/data.length)*Math.exp(-i/data.length*(event.type==='ignite'?1:4));smooth=smooth*.8+(Math.random()*2-1)*.2;data[i]=(light?(Math.random()*2-1):smooth*2)*env;if(event.type==='impact'&&!light)data[i]+=Math.sin(t*Math.PI*2*(event.body.kind==='wood'?145:260))*env*.6;}
  const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;
  filter.type=event.type==='ignite'?'lowpass':light?'highpass':'lowpass';filter.frequency.value=event.type==='ignite'?520:light?1400:900;
  gain.gain.value=event.type==='ignite'?.13:event.type==='throw'?.12:light?.23:.5*(event.strength||.7);
  source.connect(filter);filter.connect(gain);gain.connect(this.master);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start();
 }
 destroy(){this.stopTimer();for(const n of this.nodes){try{if(n.stop)n.stop();n.disconnect();}catch{}}this.context?.close();this.context=null;}
}
I.FireAudio=FireAudio;
})(globalThis.Ignis=globalThis.Ignis||{});
