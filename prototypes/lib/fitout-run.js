import{createSeededRng,pickSeeded}from'./seed-utils.js';

export const RUN_MODIFIERS={
  narrow_delivery:{id:'narrow_delivery',label:'Узкий грузовой вход',effect:'Длинные материалы переносятся медленнее.',carryRate:.78,pressure:4},
  legacy_wiring:{id:'legacy_wiring',label:'Наследство прежнего арендатора',effect:'Часть электрических трасс обнаруживается только после разметки.',engineeringRate:.82,pressure:6},
  live_office:{id:'live_office',label:'Работающий этаж',effect:'Шумные работы приходится чередовать с тихими.',workRate:.86,pressure:7},
  late_change:{id:'late_change',label:'Новая хотелка заказчика',effect:'После первого фронта появляется изменение планировки.',workRate:.92,pressure:8},
  missing_lift:{id:'missing_lift',label:'Лифт снова занят',effect:'Поставки приходят рывками.',carryRate:.7,pressure:5},
  fixed_opening:{id:'fixed_opening',label:'Неподвижный вход',effect:'Вход нельзя переносить, весь офис обязан подстроиться.',workRate:1,pressure:3},
  cost_pressure:{id:'cost_pressure',label:'Бюджет уже оптимизировали',effect:'Переделка сильнее бьёт по итоговой оценке.',workRate:.95,pressure:9}
};

export class FitoutRun{
  constructor({seed='fitout-run',depth=1,meta={}}={}){this.seed=String(seed);this.depth=Math.max(1,Number(depth)||1);this.elapsed=0;this.status='planning';this.events=[];this.meta={runs:0,wins:0,relationships:{},lessons:[],lastOutcome:null,...meta};const rng=createSeededRng(`${this.seed}:${this.depth}`),pool=Object.values(RUN_MODIFIERS),count=Math.min(pool.length,1+Math.floor((this.depth-1)/2));this.modifiers=[];while(this.modifiers.length<count){const modifier=pickSeeded(rng,pool);if(!this.modifiers.includes(modifier))this.modifiers.push(modifier)}this.pressure=this.modifiers.reduce((sum,item)=>sum+item.pressure,0)}
  start(){if(this.status!=='planning')return false;this.status='building';this.events.push({type:'run_started',at:this.elapsed,modifiers:this.modifiers.map(item=>item.id)});return true}
  tick(dt){if(this.status==='building')this.elapsed+=Math.max(0,Number(dt)||0)}
  relationship(id){return Number(this.meta.relationships[id])||0}
  remember(id,amount,reason){this.meta.relationships[id]=Math.max(-100,Math.min(100,this.relationship(id)+amount));this.events.push({type:'relationship',id,amount,reason,at:this.elapsed});return this.meta.relationships[id]}
  finish({won=false,mistakes=[]}={}){if(!['building','planning'].includes(this.status))return false;this.status=won?'won':'lost';this.meta.runs=(this.meta.runs||0)+1;if(won)this.meta.wins=(this.meta.wins||0)+1;this.meta.lastOutcome={won,seed:this.seed,depth:this.depth,mistakes:[...mistakes]};for(const mistake of mistakes)if(!this.meta.lessons.includes(mistake))this.meta.lessons.push(mistake);this.events.push({type:'run_finished',won,mistakes:[...mistakes],at:this.elapsed});return true}
  rate(kind){return this.modifiers.reduce((rate,item)=>rate*(kind==='carry'?(item.carryRate||1):kind==='engineering'?(item.engineeringRate||item.workRate||1):(item.workRate||1)),1)}
  snapshot(){return{seed:this.seed,depth:this.depth,elapsed:this.elapsed,status:this.status,pressure:this.pressure,modifiers:this.modifiers.map(item=>({...item})),meta:JSON.parse(JSON.stringify(this.meta)),events:this.events.map(item=>({...item}))}}
}
