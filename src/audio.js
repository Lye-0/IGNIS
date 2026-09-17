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
 destroy(){this.stopTimer();for(const n of this.nodes){try{if(n.stop)n.stop();n.disconnect();}catch{}}this.context?.close();this.context=null;}
}
I.FireAudio=FireAudio;
})(globalThis.Ignis=globalThis.Ignis||{});
