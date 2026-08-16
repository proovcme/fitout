export const PHYSICAL_JOBS={
  demolition:{id:'demolition',label:'Демонтаж старой перегородки',duration:6,requires:[]},
  partition:{id:'partition',label:'Монтаж новой перегородки',duration:8,requires:['demolition','materials']},
  engineering:{id:'engineering',label:'Прокладка инженерии',duration:7,requires:['partition','panel']},
  finish:{id:'finish',label:'Чистовая отделка',duration:7,requires:['engineering']},
  furniture:{id:'furniture',label:'Сборка мебели',duration:6,requires:['finish','materials']}
};

export class PhysicalConstruction{
  constructor(){this.jobs=new Map(Object.values(PHYSICAL_JOBS).map(job=>[job.id,{...job,status:'locked',progress:0,speed:1,quality:1,assigned:null,mistakes:[]} ]));this.facts=new Set();this.listeners=new Set();this.refresh()}
  subscribe(listener){this.listeners.add(listener);listener(this.snapshot());return()=>this.listeners.delete(listener)}
  notify(){const state=this.snapshot();for(const listener of this.listeners)listener(state)}
  addFact(id){if(this.facts.has(id))return false;this.facts.add(id);this.refresh();this.notify();return true}
  refresh(){for(const job of this.jobs.values())if(job.status==='locked'&&job.requires.every(id=>this.facts.has(id)||this.jobs.get(id)?.status==='done'))job.status='ready'}
  canStart(id){return this.jobs.get(id)?.status==='ready'}
  start(id,{speed=1,quality=1,assigned='player'}={}){const job=this.jobs.get(id);if(!job||job.status!=='ready')return{ok:false,missing:job?.requires.filter(req=>!this.facts.has(req)&&this.jobs.get(req)?.status!=='done')||[]};job.status='working';job.speed=speed;job.quality=quality;job.assigned=assigned;this.notify();return{ok:true,job}}
  forceStart(id,{speed=1.15,quality=.58,assigned='autonomous'}={}){const job=this.jobs.get(id);if(!job||!['locked','ready','paused'].includes(job.status))return{ok:false};const missing=job.requires.filter(req=>!this.facts.has(req)&&this.jobs.get(req)?.status!=='done');job.status='working';job.speed=speed;job.quality=quality;job.assigned=assigned;job.mistakes.push(...missing.map(req=>`started_without_${req}`));this.notify();return{ok:true,job,missing}}
  pause(id){const job=this.jobs.get(id);if(job?.status!=='working')return false;job.status='paused';this.notify();return true}
  resume(id,{speed,quality}={}){const job=this.jobs.get(id);if(job?.status!=='paused')return false;job.status='working';if(speed)job.speed=speed;if(quality)job.quality=quality;this.notify();return true}
  accelerate(id){const job=this.jobs.get(id);if(job?.status!=='working')return false;job.speed=Math.min(1.8,job.speed+.35);job.quality=Math.max(.35,job.quality-.12);job.mistakes.push('accelerated_under_pressure');this.notify();return true}
  addMistake(id,mistake){const job=this.jobs.get(id);if(!job||!mistake||job.mistakes.includes(mistake))return false;job.mistakes.push(String(mistake));job.quality=Math.max(.35,job.quality-.08);this.notify();return true}
  setProgress(id,progress,{assigned}={}){const job=this.jobs.get(id);if(!job||job.status!=='working')return false;job.progress=Math.max(job.progress,Math.min(1,Math.max(0,Number(progress)||0)));if(assigned)job.assigned=assigned;if(job.progress>=1){job.status='done';this.facts.add(job.id);this.refresh()}this.notify();return true}
  tick(dt,{boosts={}}={}){let changed=false;for(const job of this.jobs.values())if(job.status==='working'){const presenceBoost=boosts[job.id]||0;job.progress=Math.min(1,job.progress+dt*(job.speed+presenceBoost)/job.duration);changed=true;if(job.progress>=1){job.status='done';this.facts.add(job.id);this.refresh()}}if(changed)this.notify()}
  snapshot(){return{facts:[...this.facts],jobs:[...this.jobs.values()].map(job=>({...job})),complete:[...this.jobs.values()].every(job=>job.status==='done')}}
}
