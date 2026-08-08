export const CLIENT_CALLS=[
  {
    id:'first-status',at:52,title:'А что у нас уже готово?',subtitle:'Анна Крылова · заказчик',
    text:'Я через час буду на объекте. Скажите честно: там уже переговорная или пока только уверенные люди?',
    choices:['honest','promise','decline']
  },
  {
    id:'safety-rumour',at:142,title:'Мне прислали фотографию',subtitle:'Анна Крылова · заказчик',
    text:'На фотографии у вас лужа, кабель и стул вместо ограждения. Это старое фото или новый метод управления?',
    choices:['safety','hide','invite']
  },
  {
    id:'late-change',at:226,title:'Небольшое изменение',subtitle:'Анна Крылова · заказчик',
    text:'Передвиньте дверь на двести миллиметров. Денег и времени больше не будет, потому что изменение небольшое.',
    choices:['paper','verbal','refuse']
  }
];

export class ClientPhone{
  constructor(calls=CLIENT_CALLS){this.calls=calls.map(call=>({...call}));this.time=0;this.fired=new Set();this.active=null}
  tick(dt,world={}){
    if(dt<=0||this.active)return null;
    this.time+=dt;
    const call=this.calls.find(item=>!this.fired.has(item.id)&&this.time>=item.at&&(!item.when||item.when(world)));
    if(!call)return null;
    this.fired.add(call.id);this.active={...call};return{...this.active};
  }
  answer(choice){if(!this.active||!this.active.choices.includes(choice))return null;const result={callId:this.active.id,choice};this.active=null;return result}
  snapshot(){return{time:this.time,active:this.active?{...this.active}:null,fired:[...this.fired]}}
}

export function rankUrgencies(items,position){
  return items.filter(item=>item.active!==false).map(item=>({...item,distance:Math.hypot(item.position.x-position.x,item.position.z-position.z)})).sort((a,b)=>(b.severity||1)-(a.severity||1)||a.distance-b.distance||String(a.id).localeCompare(String(b.id)));
}
