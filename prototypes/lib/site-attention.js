export const ATTENTION_EVENTS={
  autonomous_demolition:{at:8,label:'Борис начал демонтаж без команды'},
  client_walk:{at:34,label:'Заказчик вышел на обход'},
  risky_partition:{at:48,label:'Бригада начинает перегородку без проверки материалов'},
  risky_engineering:{at:78,label:'Электрики готовы закрыть трассу без маркировки'},
  autonomous_finish:{at:105,label:'Отделочники сами нашли свободную стену'},
  autonomous_furniture:{at:132,label:'Мебельщики решили собирать всё, что нашли'}
};

export class SiteAttention{
  constructor(){this.time=0;this.started=false;this.fired=new Set();this.interventions=new Map();this.queue=[];this.attention=100}
  start(){this.started=true}
  intervene(front,mode){this.interventions.set(front,{mode,at:this.time});this.attention=Math.max(0,this.attention-(mode==='direct'?18:mode==='delegate'?9:4));return this.interventions.get(front)}
  tick(dt,world={}){if(!this.started)return[];this.time+=dt;this.attention=Math.min(100,this.attention+dt*1.1);const emit=(id,condition=true)=>{const definition=ATTENTION_EVENTS[id];if(condition&&!this.fired.has(id)&&this.time>=definition.at){this.fired.add(id);this.queue.push({id,at:this.time,label:definition.label})}};emit('autonomous_demolition',!world.demolitionStarted&&!this.interventions.has('demolition'));emit('client_walk',world.hazardsActive);emit('risky_partition',world.demolitionDone&&!world.materialsChecked&&!world.partitionStarted);emit('risky_engineering',world.partitionDone&&!world.panelAccepted&&!world.engineeringStarted);emit('autonomous_finish',world.engineeringDone&&!world.finishStarted);emit('autonomous_furniture',world.finishDone&&!world.furnitureStarted);return this.drain()}
  drain(){return this.queue.splice(0)}
}
