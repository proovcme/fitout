export const dbToGain=db=>10**(db/20);

const CUES={
  small:{frequency:420,duration:.055,volumeDb:-25,type:'sine'},
  medium:{frequency:250,duration:.11,volumeDb:-20,type:'triangle'},
  large:{frequency:110,duration:.22,volumeDb:-16,type:'sawtooth'},
  route:{frequency:620,duration:.045,volumeDb:-28,type:'sine'}
};

export class SiteAudio{
  constructor({contextFactory=null}={}){this.contextFactory=contextFactory;this.context=null;this.buses=new Map();this.enabled=true}
  unlock(){
    if(!this.enabled)return null;
    if(!this.context){
      const AudioContextType=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!this.contextFactory&&!AudioContextType)return null;
      this.context=this.contextFactory?this.contextFactory():new AudioContextType();
      const master=this.context.createGain(),ui=this.context.createGain(),sfx=this.context.createGain();
      master.gain.value=dbToGain(-8);ui.gain.value=dbToGain(-4);sfx.gain.value=dbToGain(-2);
      ui.connect(master);sfx.connect(master);master.connect(this.context.destination);
      this.buses.set('Master',master);this.buses.set('UI',ui);this.buses.set('SFX',sfx);
    }
    if(this.context.state==='suspended')this.context.resume?.();
    return this.context;
  }
  setBusVolumeDb(name,db){const bus=this.buses.get(name);if(!bus)return false;bus.gain.value=dbToGain(db);return true}
  play(cue='small'){
    const context=this.unlock(),definition=CUES[cue]||CUES.small;if(!context)return false;
    const oscillator=context.createOscillator(),gain=context.createGain(),now=context.currentTime,pitch=1+(Math.random()-.5)*.035;
    oscillator.type=definition.type;oscillator.frequency.setValueAtTime(definition.frequency*pitch,now);
    gain.gain.setValueAtTime(dbToGain(definition.volumeDb),now);gain.gain.exponentialRampToValueAtTime(.0001,now+definition.duration);
    oscillator.connect(gain);gain.connect(this.buses.get(cue==='route'?'UI':'SFX'));oscillator.start(now);oscillator.stop(now+definition.duration+.01);
    return true;
  }
}
