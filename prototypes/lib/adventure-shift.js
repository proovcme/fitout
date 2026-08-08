export const SHIFT_FRONTS={
  briefing:{id:'briefing',label:'Разобраться, кто здесь главный',required:true,reward:12},
  trash:{id:'trash',label:'Освободить проход от мусора',required:true,reward:18},
  wetCable:{id:'wetCable',label:'Развести воду и электричество',required:true,reward:26},
  materials:{id:'materials',label:'Проверить поставку',required:true,reward:16},
  construction:{id:'construction',label:'Физически закончить помещение',required:true,reward:38},
  panel:{id:'panel',label:'Принять маркировку щита',required:false,reward:14},
  door:{id:'door',label:'Обмерить, заказать и открыть дверь',required:true,reward:30}
};

export class AdventureShift{
  constructor({duration=300}={}){this.duration=duration;this.remaining=duration;this.status='playing';this.resolved=new Set();this.failed=new Set();this.score=0;this.pressure=18;this.listeners=new Set()}
  subscribe(listener){this.listeners.add(listener);listener(this.snapshot());return()=>this.listeners.delete(listener)}
  notify(){const state=this.snapshot();for(const listener of this.listeners)listener(state)}
  resolve(id,{quality=1}={}){const front=SHIFT_FRONTS[id];if(!front||this.status!=='playing'||this.resolved.has(id))return false;this.resolved.add(id);this.failed.delete(id);this.score+=Math.round(front.reward*Math.max(.25,quality));this.pressure=Math.max(0,this.pressure-(front.required?13:8));this.evaluate();this.notify();return true}
  fail(id,severity=1){if(!SHIFT_FRONTS[id]||this.status!=='playing'||this.resolved.has(id))return false;this.failed.add(id);this.pressure=Math.min(100,this.pressure+Math.round(11*severity));this.score=Math.max(0,this.score-Math.round(5*severity));this.notify();return true}
  tick(dt){if(this.status!=='playing')return;this.remaining=Math.max(0,this.remaining-dt);this.pressure=Math.min(100,this.pressure+dt*.035);if(this.remaining===0||this.pressure>=100)this.status='lost';this.evaluate();this.notify()}
  evaluate(){const required=Object.values(SHIFT_FRONTS).filter(item=>item.required);if(required.every(item=>this.resolved.has(item.id)))this.status='won'}
  snapshot(){return{remaining:this.remaining,status:this.status,score:this.score,pressure:this.pressure,resolved:[...this.resolved],failed:[...this.failed],requiredTotal:Object.values(SHIFT_FRONTS).filter(item=>item.required).length,requiredDone:Object.values(SHIFT_FRONTS).filter(item=>item.required&&this.resolved.has(item.id)).length}}
}
