export const PHYSICAL_JOBS={
  demolition:{id:'demolition',label:'Демонтаж старой перегородки',duration:6,requires:[]},
  partition:{id:'partition',label:'Монтаж новой перегородки',duration:8,requires:['demolition','materials']},
  engineering:{id:'engineering',label:'Прокладка инженерии',duration:7,requires:['partition','panel']},
  finish:{id:'finish',label:'Чистовая отделка',duration:7,requires:['engineering']},
  furniture:{id:'furniture',label:'Сборка мебели',duration:6,requires:['finish','materials']}
};

export class PhysicalConstruction{
  constructor(){this.jobs=new Map(Object.values(PHYSICAL_JOBS).map(job=>[job.id,{...job,status:'locked',progress:0}]));this.facts=new Set();this.listeners=new Set();this.refresh()}
  subscribe(listener){this.listeners.add(listener);listener(this.snapshot());return()=>this.listeners.delete(listener)}
  notify(){const state=this.snapshot();for(const listener of this.listeners)listener(state)}
  addFact(id){if(this.facts.has(id))return false;this.facts.add(id);this.refresh();this.notify();return true}
  refresh(){for(const job of this.jobs.values())if(job.status==='locked'&&job.requires.every(id=>this.facts.has(id)||this.jobs.get(id)?.status==='done'))job.status='ready'}
  canStart(id){return this.jobs.get(id)?.status==='ready'}
  start(id){const job=this.jobs.get(id);if(!job||job.status!=='ready')return{ok:false,missing:job?.requires.filter(req=>!this.facts.has(req)&&this.jobs.get(req)?.status!=='done')||[]};job.status='working';this.notify();return{ok:true,job}}
  tick(dt){for(const job of this.jobs.values())if(job.status==='working'){job.progress=Math.min(1,job.progress+dt/job.duration);if(job.progress>=1){job.status='done';this.facts.add(job.id);this.refresh()}this.notify()}}
  snapshot(){return{facts:[...this.facts],jobs:[...this.jobs.values()].map(job=>({...job})),complete:[...this.jobs.values()].every(job=>job.status==='done')}}
}
