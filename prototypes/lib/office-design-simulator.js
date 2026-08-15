import{createSeededRng}from'./seed-utils.js';

export const OFFICE_ZONE_TYPES={
  work:{id:'work',label:'Рабочие места',short:'РАБОТА',color:'#4f88b8',seats:8,meeting:0,support:0,cost:380000,comfort:2},
  meeting:{id:'meeting',label:'Переговорная',short:'ВСТРЕЧИ',color:'#8e6cc7',seats:0,meeting:8,support:0,cost:520000,comfort:7},
  focus:{id:'focus',label:'Тихая комната',short:'ТИШИНА',color:'#4f9b83',seats:4,meeting:2,support:0,cost:430000,comfort:12},
  lounge:{id:'lounge',label:'Кухня и отдых',short:'ПАУЗА',color:'#d89a45',seats:0,meeting:0,support:1,cost:310000,comfort:15},
  restroom:{id:'restroom',label:'Санузел',short:'С/У',color:'#4f9eb8',seats:0,meeting:0,support:1,cost:340000,comfort:4,restrooms:1},
  server:{id:'server',label:'Серверная',short:'СЕРВЕР',color:'#6b718d',seats:0,meeting:0,support:1,cost:450000,comfort:-2,servers:1},
  storage:{id:'storage',label:'Склад',short:'СКЛАД',color:'#8b735e',seats:0,meeting:0,support:2,cost:190000,comfort:-3}
};

export const OFFICE_FIXTURE_TYPES={furniture:{id:'furniture',label:'Мебель',icon:'▤',cost:85000},light:{id:'light',label:'Свет',icon:'✦',cost:28000},socket:{id:'socket',label:'Розетки',icon:'⌁',cost:18000},door:{id:'door',label:'Дверь',icon:'↪',cost:42000}};
export const OFFICE_BRIEF={seats:24,meeting:8,support:3,restrooms:1,servers:1,lights:8,sockets:10,budget:4700000};
export const DEFAULT_OFFICE_LAYOUT=['work','work','meeting','server','work','focus','restroom','lounge'];
export const DEFAULT_OFFICE_FIXTURES=DEFAULT_OFFICE_LAYOUT.map((type,index)=>({furniture:true,light:1,socket:type==='work'?2:type==='server'?2:1,door:index!==0}));
const TYPE_ORDER=Object.keys(OFFICE_ZONE_TYPES);
const cloneLayout=layout=>layout.map(String);
const cloneFixtures=fixtures=>fixtures.map(item=>({...item}));
const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,value));

export function officeDesignMetrics(layout,fixtures=DEFAULT_OFFICE_FIXTURES){
  const zones=layout.map(id=>OFFICE_ZONE_TYPES[id]).filter(Boolean),sum=key=>zones.reduce((total,zone)=>total+(zone[key]||0),0),furnishedZones=zones.filter((zone,index)=>fixtures[index]?.furniture),seats=furnishedZones.reduce((total,zone)=>total+zone.seats,0),meeting=furnishedZones.reduce((total,zone)=>total+zone.meeting,0),support=sum('support'),restrooms=sum('restrooms'),servers=sum('servers'),lights=fixtures.reduce((total,item)=>total+(item.light||0),0),sockets=fixtures.reduce((total,item)=>total+(item.socket||0),0),doors=fixtures.filter(item=>item.door).length,fixtureCost=fixtures.reduce((total,item)=>total+(item.furniture?OFFICE_FIXTURE_TYPES.furniture.cost:0)+(item.light||0)*OFFICE_FIXTURE_TYPES.light.cost+(item.socket||0)*OFFICE_FIXTURE_TYPES.socket.cost+(item.door?OFFICE_FIXTURE_TYPES.door.cost:0),0),cost=sum('cost')+fixtureCost,risks=[];
  if(seats<OFFICE_BRIEF.seats)risks.push({id:'seats',label:`Не хватает ${OFFICE_BRIEF.seats-seats} рабочих мест`});
  if(meeting<OFFICE_BRIEF.meeting)risks.push({id:'meeting',label:'Переговорных меньше задания'});
  if(support<OFFICE_BRIEF.support)risks.push({id:'support',label:'Некуда спрятать людей, чайник или коробки'});
  if(restrooms<OFFICE_BRIEF.restrooms)risks.push({id:'restroom',label:'В проекте нет санузла'});
  if(servers<OFFICE_BRIEF.servers)risks.push({id:'server',label:'Сервер опять предлагают поставить под столом'});
  if(lights<OFFICE_BRIEF.lights)risks.push({id:'light',label:`Не хватает светильников: ${OFFICE_BRIEF.lights-lights}`});
  if(sockets<OFFICE_BRIEF.sockets)risks.push({id:'socket',label:`Не хватает розеток: ${OFFICE_BRIEF.sockets-sockets}`});
  if(doors<layout.length-1)risks.push({id:'doors',label:'Не во все помещения можно войти без философской подготовки'});
  if(cost>OFFICE_BRIEF.budget)risks.push({id:'budget',label:`Бюджет превышен на ${cost-OFFICE_BRIEF.budget} ₽`});
  if(layout.at(-1)==='storage')risks.push({id:'egress',label:'Склад занял путь к эвакуационному выходу'});
  const adjacentPairs=layout.flatMap((_,index)=>[index%4<3?[index,index+1]:null,index<4?[index,index+4]:null]).filter(Boolean),noisyPairs=adjacentPairs.filter(([a,b])=>new Set([layout[a],layout[b]]).has('meeting')&&new Set([layout[a],layout[b]]).has('work')).length;
  if(adjacentPairs.some(([a,b])=>new Set([layout[a],layout[b]]).has('restroom')&&new Set([layout[a],layout[b]]).has('server')))risks.push({id:'wet-server',label:'Серверная делит стену с санузлом'});
  if(noisyPairs>1)risks.push({id:'acoustics',label:'Переговорные делят стены с рабочими местами'});
  const daylightWork=[0,1,2,3].filter(index=>layout[index]==='work').length,comfort=clamp(38+sum('comfort')+daylightWork*5-noisyPairs*7-(layout.at(-1)==='storage'?28:0)+Math.min(12,lights));
  return{seats,meeting,support,restrooms,servers,lights,sockets,doors,cost,comfort,risks,briefPassed:seats>=OFFICE_BRIEF.seats&&meeting>=OFFICE_BRIEF.meeting&&support>=OFFICE_BRIEF.support&&restrooms>=OFFICE_BRIEF.restrooms&&servers>=OFFICE_BRIEF.servers&&lights>=OFFICE_BRIEF.lights&&sockets>=OFFICE_BRIEF.sockets&&cost<=OFFICE_BRIEF.budget&&!risks.some(item=>['egress','wet-server','doors'].includes(item.id))};
}

const INCIDENT_ACTORS={'old-axis':'Семён Проёмов · прораб','client-meeting':'Анна Крылова · заказчик','sockets-old-plan':'Вера Искрова · электрик','furniture-early':'Снабжение','ceiling-conflict':'Георгий Согласов · ГИП','designer-note':'Марина Эскизова · архитектор'};
const INCIDENT_JOBS={'old-axis':'partition','client-meeting':'partition','sockets-old-plan':'engineering','ceiling-conflict':'engineering','designer-note':'finish','furniture-early':'furniture'},JOB_ORDER=['partition','engineering','finish','furniture'];
const incident=(id,title,text,when,options)=>({id,title,text,actor:INCIDENT_ACTORS[id],job:INCIDENT_JOBS[id],when,options});
export const OFFICE_CHAOS_INCIDENTS=[
  incident('old-axis','Старая ось победила новую','Монтажники размечали перегородку по распечатке из письма, которое вы просили удалить.',()=>true,[
    {id:'reissue',label:'Остановить и перевыпустить лист',tone:'control',cost:140000,delay:3,chaos:4,fidelity:0,log:'Перегородку разобрали до того, как она стала недвижимостью.'},
    {id:'accept-shift',label:'Принять смещение на объекте',tone:'shortcut',cost:25000,delay:0,chaos:24,fidelity:-14,deviation:'wall_shift',log:'Ось уехала на 320 мм. Мебель теперь знает об этом первой.'}
  ]),
  incident('client-meeting','Заказчик вспомнил ещё одну переговорную','На плане её нет, но в презентации инвесторам она уже обещана.',metrics=>metrics.meeting<16,[
    {id:'revise',label:'Перепроектировать и согласовать',tone:'control',cost:180000,delay:2,chaos:6,fidelity:-2,mutate:'approved_meeting',log:'Один рабочий модуль стал переговорной официально.'},
    {id:'verbal',label:'Сделать по устной просьбе',tone:'shortcut',cost:110000,delay:0,chaos:22,fidelity:-16,mutate:'actual_meeting',deviation:'verbal_change',log:'Переговорная появилась. Документы продолжают отрицать её существование.'}
  ]),
  incident('sockets-old-plan','Розетки пришли из прошлой версии','Электрик честно выполнил план. К сожалению, не этот.',metrics=>metrics.seats>=24,[
    {id:'rework',label:'Переложить трассу до отделки',tone:'control',cost:95000,delay:2,chaos:5,fidelity:-1,log:'Штробы переделали, пока их ещё можно было называть ошибкой.'},
    {id:'extensions',label:'Раздать удлинители и жить дальше',tone:'shortcut',cost:18000,delay:0,chaos:19,fidelity:-11,deviation:'extension_forest',log:'Рабочие места подключены через дендрарий удлинителей.'}
  ]),
  incident('furniture-early','Мебель приехала раньше стен','Поставщик впервые не опоздал и этим полностью сломал график.',()=>true,[
    {id:'warehouse',label:'Увезти на временный склад',tone:'control',cost:62000,delay:1,chaos:3,fidelity:0,log:'Мебель пережила стройку отдельно от стройки.'},
    {id:'stack',label:'Сложить прямо в проходе',tone:'shortcut',cost:0,delay:0,chaos:17,fidelity:-7,deviation:'furniture_stack',log:'Коробки стали временной стеной и постоянной темой чата.'}
  ]),
  incident('ceiling-conflict','В потолке встретились все разделы','Светильник, воздуховод и спринклер выбрали одну точку. Совещание уже началось.',()=>true,[
    {id:'coordinate',label:'Собрать инженеров у модели',tone:'control',cost:125000,delay:2,chaos:5,fidelity:-1,log:'Коллизию решили до закрытия потолка. Почти инновация.'},
    {id:'lower-ceiling',label:'Опустить потолок на 180 мм',tone:'shortcut',cost:45000,delay:0,chaos:21,fidelity:-12,deviation:'low_ceiling',log:'Потолок победил коллизию, приблизившись к людям.'}
  ]),
  incident('designer-note','Авторский надзор увидел оттенок','RAL совпал по цифрам, но не по внутреннему ощущению архитектора.',metrics=>metrics.comfort>=60,[
    {id:'sample',label:'Сделать выкрас и зафиксировать',tone:'control',cost:48000,delay:1,chaos:4,fidelity:0,log:'Цвет согласован документом, фотографией и тяжёлым вздохом.'},
    {id:'close-enough',label:'Назвать оттенок авторским',tone:'shortcut',cost:0,delay:0,chaos:14,fidelity:-6,deviation:'wrong_tone',log:'Стена получила редкий оттенок «почти как в визуализации».'}
  ])
];

function chooseIncidents(seed,metrics){
  const rng=createSeededRng(`${seed}:office-chaos`),pool=OFFICE_CHAOS_INCIDENTS.filter(item=>item.when(metrics)),chosen=[];
  while(pool.length&&chosen.length<3){const index=Math.floor(rng()*pool.length);chosen.push(pool.splice(index,1)[0])}
  return chosen.sort((a,b)=>JOB_ORDER.indexOf(a.job)-JOB_ORDER.indexOf(b.job));
}

export class OfficeDesignSimulation{
  constructor(seed='office-design'){this.seed=String(seed);this.layout=cloneLayout(DEFAULT_OFFICE_LAYOUT);this.fixtures=cloneFixtures(DEFAULT_OFFICE_FIXTURES);this.approvedLayout=null;this.approvedFixtures=null;this.actualLayout=null;this.phase='draft';this.incidents=[];this.currentIncident=0;this.resolved=[];this.chaos=8;this.costDelta=0;this.delay=0;this.fidelity=100;this.deviations=[];this.listeners=new Set()}
  subscribe(listener){this.listeners.add(listener);listener(this.snapshot());return()=>this.listeners.delete(listener)}
  notify(){const snapshot=this.snapshot();for(const listener of this.listeners)listener(snapshot)}
  setCell(index,type){if(this.phase!=='draft'||!Number.isInteger(index)||index<0||index>=this.layout.length||!OFFICE_ZONE_TYPES[type])return false;this.layout[index]=type;this.notify();return true}
  cycleCell(index){const current=TYPE_ORDER.indexOf(this.layout[index]),next=TYPE_ORDER[(current+1)%TYPE_ORDER.length];return this.setCell(index,next)}
  applyTool(index,tool){if(this.phase!=='draft'||!Number.isInteger(index)||index<0||index>=this.layout.length)return false;if(OFFICE_ZONE_TYPES[tool])return this.setCell(index,tool);if(!OFFICE_FIXTURE_TYPES[tool])return false;const fixture=this.fixtures[index];if(tool==='furniture'||tool==='door')fixture[tool]=!fixture[tool];if(tool==='light')fixture.light=(fixture.light+1)%3;if(tool==='socket')fixture.socket=(fixture.socket+1)%4;this.notify();return true}
  release(){if(this.phase!=='draft')return{ok:false,reason:'already_released'};const metrics=officeDesignMetrics(this.layout,this.fixtures);this.approvedLayout=cloneLayout(this.layout);this.approvedFixtures=cloneFixtures(this.fixtures);this.actualLayout=cloneLayout(this.layout);this.incidents=chooseIncidents(this.seed,metrics);this.phase=this.incidents.length?'building':'complete';this.notify();return{ok:true,metrics,incidents:this.incidents.map(item=>item.id)}}
  pending(){return this.phase==='building'?this.incidents[this.currentIncident]||null:null}
  resolve(optionId){const event=this.pending(),option=event?.options.find(item=>item.id===optionId);if(!event||!option)return{ok:false};this.costDelta+=option.cost;this.delay+=option.delay;this.chaos=clamp(this.chaos+option.chaos);this.fidelity=clamp(this.fidelity+option.fidelity);if(option.deviation)this.deviations.push(option.deviation);if(option.mutate==='approved_meeting'){const index=this.approvedLayout.findIndex(type=>type==='work');if(index>=0)this.approvedLayout[index]=this.actualLayout[index]='meeting'}if(option.mutate==='actual_meeting'){const index=this.actualLayout.findIndex(type=>type==='work');if(index>=0)this.actualLayout[index]='meeting'}this.resolved.push({incidentId:event.id,optionId:option.id,log:option.log,tone:option.tone});this.currentIncident++;if(this.currentIncident>=this.incidents.length)this.phase='complete';this.notify();return{ok:true,event,option,complete:this.phase==='complete'}}
  snapshot(){const plan=this.approvedLayout||this.layout,fixtures=this.approvedFixtures||this.fixtures,progress=this.incidents.length?this.resolved.length/this.incidents.length:0;return{seed:this.seed,phase:this.phase,layout:cloneLayout(this.layout),fixtures:cloneFixtures(this.fixtures),approvedLayout:this.approvedLayout?cloneLayout(this.approvedLayout):null,approvedFixtures:this.approvedFixtures?cloneFixtures(this.approvedFixtures):null,actualLayout:this.actualLayout?cloneLayout(this.actualLayout):null,metrics:officeDesignMetrics(plan,fixtures),actualMetrics:this.actualLayout?officeDesignMetrics(this.actualLayout,fixtures):null,incidents:this.incidents.map(item=>({id:item.id,title:item.title,text:item.text,actor:item.actor,job:item.job,options:item.options.map(option=>({...option}))})),pending:this.pending()?{...this.pending(),options:this.pending().options.map(option=>({...option}))}:null,currentIncident:this.currentIncident,resolved:this.resolved.map(item=>({...item})),progress,chaos:this.chaos,costDelta:this.costDelta,delay:this.delay,fidelity:this.fidelity,deviations:[...this.deviations]}}
}
