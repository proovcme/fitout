import{createSeededRng}from'./character-generator.js';

export const ITEMS={
  verified_tape:{id:'verified_tape',name:'Поверенная рулетка',icon:'↔',slot:'hands',description:'Поверена до тех пор, пока никто не спросил свидетельство.',modifiers:[{skill:'surveying',value:28}]},
  hard_hat:{id:'hard_hat',name:'Каска короля',icon:'⛑',slot:'head',description:'Даёт законное право смотреть на чужую работу задумчиво.',modifiers:[{skill:'communication',value:4}]},
  opening_note:{id:'opening_note',name:'Обмер проёма 910×2110',icon:'▤',slot:'documents',description:'Размер записан. Значит, потерять его теперь можно официально.',modifiers:[{skill:'improvisation',value:3}]}
};

export const QUESTS={
  measure_opening:{id:'measure_opening',title:'Размер имеет значение',description:'Семён просит найти поверенную рулетку и измерить дверной проём до того, как его заложат.',objectives:[
    {id:'talk',event:'talked',target:'semyon',text:'Выслушать Семёна'},
    {id:'tape',event:'item_added',target:'verified_tape',text:'Взять поверенную рулетку из ящика'},
    {id:'measure',event:'measured',target:'doorway',text:'Измерить дверной проём'}
  ],rewards:{xp:45,skillPoints:1}},
  order_door:{id:'order_door',title:'Дверь в светлое будущее',description:'Передать снабжению точный размер, пережить поставку и убедиться, что дверь умеет быть дверью.',objectives:[
    {id:'supply',event:'supply_opened',target:'door',text:'Дойти до снабжения'},
    {id:'order',event:'door_ordered',target:'correct',text:'Заказать дверь правильного размера'},
    {id:'open',event:'door_opened',target:'installed',text:'Открыть установленную дверь'}
  ],rewards:{xp:70,skillPoints:1}}
};

export class GameState{
  constructor(seed='chapter-one'){
    this.version=2;this.seed=seed;this.inventory=new Map();this.quests=new Map();this.flags=new Map();
    this.equipment={hands:null,head:null,documents:null,pocket:null};
    this.skills={surveying:34,communication:41,improvisation:57};this.xp=0;this.skillPoints=0;this.attempts=0;
    this.economy={cash:180000,spent:0,committed:0,ledger:[],orders:[]};
    this.project={stage:'Знакомство с реальностью',door:{opening:{width:910,height:2110},ordered:false,installed:false,open:false}};
    this.listeners=new Set();
  }
  subscribe(listener){this.listeners.add(listener);listener(this);return()=>this.listeners.delete(listener)}
  notify(){for(const listener of this.listeners)listener(this)}
  setFlag(id,value=true){this.flags.set(id,value);this.notify();return value}
  flag(id){return this.flags.get(id)}
  startQuest(id){if(this.quests.has(id))return this.quests.get(id);const definition=QUESTS[id];if(!definition)throw new Error(`Unknown quest: ${id}`);const progress={id,state:'active',current:0,objectives:definition.objectives.map(item=>({...item,done:false}))};this.quests.set(id,progress);this.notify();return progress}
  emit(event,target){for(const progress of this.quests.values()){if(progress.state!=='active')continue;const objective=progress.objectives[progress.current];if(objective&&objective.event===event&&objective.target===target){objective.done=true;progress.current++;if(progress.current>=progress.objectives.length){progress.state='complete';const reward=QUESTS[progress.id].rewards;this.xp+=reward.xp;this.skillPoints+=reward.skillPoints}this.notify()}}}
  addItem(id,count=1){const item=ITEMS[id];if(!item)throw new Error(`Unknown item: ${id}`);this.inventory.set(id,(this.inventory.get(id)||0)+count);this.emit('item_added',id);this.notify();return item}
  hasItem(id){return(this.inventory.get(id)||0)>0}
  equip(id){const item=ITEMS[id];if(!item||!this.hasItem(id)||!item.slot)return false;this.equipment[item.slot]=id;this.notify();return true}
  unequip(slot){if(!(slot in this.equipment))return false;this.equipment[slot]=null;this.notify();return true}
  skillValue(id){let value=this.skills[id]||0;for(const itemId of Object.values(this.equipment)){if(!itemId)continue;for(const modifier of ITEMS[itemId]?.modifiers||[])if(modifier.skill===id)value+=modifier.value}return value}
  upgradeSkill(id){if(!(id in this.skills)||this.skillPoints<1)return false;this.skillPoints--;this.skills[id]+=5;this.notify();return true}
  spend(amount,category,description){amount=Math.round(Number(amount));if(!Number.isFinite(amount)||amount<=0||this.economy.cash<amount)return false;this.economy.cash-=amount;this.economy.spent+=amount;this.economy.ledger.push({id:`tx-${this.economy.ledger.length+1}`,amount:-amount,category,description});this.notify();return true}
  placeDoorOrder(width,height){width=Number(width);height=Number(height);const target=this.project.door.opening,correct=Math.abs(width-target.width)<=5&&Math.abs(height-target.height)<=5,cost=correct?58000:19000;if(!this.spend(cost,'Снабжение',correct?'Дверной блок по обмеру':'Бронь двери не того размера'))return{ok:false,reason:'funds',cost,correct:false};const order={id:`door-${this.economy.orders.length+1}`,width,height,cost,correct,status:correct?'delivery':'rejected'};this.economy.orders.push(order);if(correct){this.project.door.ordered=true;this.project.stage='Доставка двери';this.emit('door_ordered','correct')}else{this.setFlag('wrong_door_ordered',true)}this.notify();return{ok:true,correct,cost,order}}
  installDoor(){this.project.door.installed=true;this.project.stage='Проверка двери';const order=this.economy.orders.find(item=>item.correct);if(order)order.status='installed';this.notify()}
  toggleDoor(open){this.project.door.open=Boolean(open);if(open)this.emit('door_opened','installed');this.notify()}
  checkSkill(id,difficulty,tag){const value=this.skillValue(id),rng=createSeededRng(`${this.seed}:${tag}:${this.attempts++}`),roll=Math.floor(rng()*101),success=value+roll>=difficulty;this.notify();return{skill:id,value,roll,difficulty,total:value+roll,success}}
}

export class DialogueController{
  constructor(root){
    this.root=root;this.lines=[];this.index=0;this.onFinish=null;this.open=false;
    this.avatar=root.querySelector('[data-avatar]');this.speaker=root.querySelector('[data-speaker]');this.role=root.querySelector('[data-role]');this.text=root.querySelector('[data-text]');this.choices=root.querySelector('[data-choices]');this.next=root.querySelector('[data-next]');
    this.next.addEventListener('click',()=>this.advance());
  }
  play(lines,onFinish){this.lines=lines;this.index=0;this.onFinish=onFinish;this.open=true;this.root.classList.add('show');this.render()}
  render(){const line=this.lines[this.index];const speaker=line.speaker||'Неизвестный голос',initials=line.initials||speaker.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();this.root.dataset.tone=line.tone||'npc';this.avatar.textContent=initials;this.speaker.textContent=speaker;this.role.textContent=line.role||'';this.text.textContent=line.text;this.choices.innerHTML='';const options=line.choices||[];this.next.hidden=options.length>0;if(options.length){for(const option of options){const button=document.createElement('button');button.type='button';button.className='dialogue-choice';button.textContent=option.text;button.addEventListener('click',()=>{option.action?.();if(Array.isArray(option.followup))this.lines.splice(this.index+1,0,...option.followup);this.advance()});this.choices.append(button)}}else this.next.textContent=this.index===this.lines.length-1?'Понятно. Наверное.':'Далее'}
  advance(){if(!this.open)return false;this.index++;if(this.index<this.lines.length){this.render();return true}this.open=false;this.root.classList.remove('show');const finish=this.onFinish;this.onFinish=null;finish?.();return true}
}
