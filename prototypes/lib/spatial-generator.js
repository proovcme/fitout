import{createSeededRng,pickSeeded,weightedPick}from'./seed-utils.js';

export const SPACE_STAGES=['shell','demolition','rough','engineering','finish','furnished'];
export const SPACE_ARCHETYPES={
  reception:{label:'Ресепшен',weight:1,minArea:18,elements:['desk','sofa','logo_wall']},
  open_space:{label:'Опенспейс',weight:4,minArea:36,elements:['desk_cluster','task_chair','printer','plant']},
  meeting:{label:'Переговорная',weight:2,minArea:18,elements:['meeting_table','meeting_chair','screen']},
  corridor:{label:'Коридор',weight:1,minArea:12,elements:['wayfinding','fire_extinguisher']},
  kitchen:{label:'Кухня',weight:1.4,minArea:12,elements:['kitchen_line','fridge','coffee_machine','table']},
  wc:{label:'Санузел',weight:1.2,minArea:8,elements:['toilet','sink','mirror']},
  server:{label:'Серверная',weight:.7,minArea:8,elements:['server_rack','cooling_unit','ups']},
  storage:{label:'Склад',weight:1,minArea:10,elements:['shelf','material_stack','tool_chest']}
};

const STAGE_CONTENT={
  shell:['slab','columns','dust'],demolition:['debris','exposed_cable','old_partition'],rough:['new_partition','door_opening','temporary_light'],
  engineering:['cable_tray','duct','pipe','panel'],finish:['painted_wall','ceiling_grid','finished_floor'],furnished:[]
};
const TASK_BY_STAGE={shell:'survey',demolition:'demolish',rough:'build_partitions',engineering:'install_engineering',finish:'finish_surfaces',furnished:'install_furniture'};
const NEXT_STAGE={shell:'demolition',demolition:'rough',rough:'engineering',engineering:'finish',finish:'furnished',furnished:null};

function roomStageContent(type,stage,rng){const base=[...(STAGE_CONTENT[stage]||[])];if(stage==='furnished')base.push(...SPACE_ARCHETYPES[type].elements);return base.map((kind,index)=>({id:`${kind}-${index}`,kind,x:.16+(index%3)*.3+rng()*.08,z:.2+Math.floor(index/3)*.31+rng()*.07,rotation:Math.floor(rng()*4)*90,visible:true}))}

export function generateSite(seed='site-001',{columns=3,rows=2,cellWidth=7,cellDepth=6,stage='shell'}={}){const rng=createSeededRng(`${seed}:space`),types=Object.entries(SPACE_ARCHETYPES).map(([value,data])=>({value,weight:data.weight})),rooms=[];for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){const index=row*columns+column,type=index===0?'reception':index===columns?'corridor':weightedPick(rng,types),width=cellWidth-(.5+rng()*.8),depth=cellDepth-(.5+rng()*.8),roomStage=index===0&&stage==='shell'?'rough':stage,room={id:`room-${index+1}`,type,label:SPACE_ARCHETYPES[type].label,x:column*cellWidth,z:row*cellDepth,width,depth,area:Math.round(width*depth),stage:roomStage,elements:[]};room.elements=roomStageContent(type,roomStage,createSeededRng(`${seed}:${room.id}:${roomStage}`));rooms.push(room)}return{schemaVersion:1,seed:String(seed),bounds:{width:columns*cellWidth,depth:rows*cellDepth},rooms,revision:1}}

export function setRoomStage(site,roomId,stage){if(!SPACE_STAGES.includes(stage))throw new Error(`Unknown stage: ${stage}`);const room=site.rooms.find(item=>item.id===roomId);if(!room)throw new Error(`Unknown room: ${roomId}`);room.stage=stage;room.elements=roomStageContent(room.type,stage,createSeededRng(`${site.seed}:${room.id}:${stage}:${site.revision}`));site.revision+=1;return room}
export function advanceRoom(site,roomId){const room=site.rooms.find(item=>item.id===roomId),next=room&&NEXT_STAGE[room.stage];return next?setRoomStage(site,roomId,next):room}

export function generateSpatialTasks(site){return site.rooms.flatMap(room=>{const next=NEXT_STAGE[room.stage];if(!next)return[];return[{id:`${room.id}:${TASK_BY_STAGE[next]}`,roomId:room.id,roomLabel:room.label,workType:TASK_BY_STAGE[next],fromStage:room.stage,toStage:next,status:'available',requires:room.stage==='shell'?['survey']:room.stage==='demolition'?['demolition_clearance']:room.stage==='engineering'?['approved_coordination']:[],visualResult:`${room.label}: ${next}`}]} )}

const EVENT_RULES=[
  {id:'hidden_cable',stages:['demolition'],weight:2,text:'За перегородкой найден кабель, который по документам живёт в другом здании.',effect:{delayHours:2,quality:-2}},
  {id:'engineering_clash',stages:['engineering'],weight:3,text:'Воздуховод, лоток и архитектурный замысел встретились в одной точке.',effect:{delayHours:4,budget:-35}},
  {id:'wrong_white',stages:['finish'],weight:2,text:'Заказчик различил два одинаковых белых и выбрал третий.',effect:{delayHours:3,budget:-18}},
  {id:'clean_delivery',stages:['rough','engineering'],weight:1,text:'Поставка приехала вовремя и в нужное помещение. Все подозревают подвох.',effect:{delayHours:-2,quality:2}},
  {id:'furniture_fit',stages:['furnished'],weight:1.5,text:'Мебель вошла в проём без демонтажа. Событие признано положительным.',effect:{delayHours:-1,quality:3}},
  {id:'dust_everywhere',stages:['demolition','rough'],weight:2,text:'Пыль перешла границу помещения без согласованного допуска.',effect:{quality:-3,cleanliness:-18}}
];
export function generateSpatialEvent(site,seed=`${site.seed}:event:${site.revision}`){const rng=createSeededRng(seed),candidates=[];for(const room of site.rooms)for(const rule of EVENT_RULES)if(rule.stages.includes(room.stage))candidates.push({value:{id:`${rule.id}:${room.id}`,type:rule.id,roomId:room.id,roomLabel:room.label,text:rule.text,effect:{...rule.effect}},weight:rule.weight});return candidates.length?weightedPick(rng,candidates):null}

export function validateSite(site){const errors=[];for(const room of site.rooms){if(room.width<=0||room.depth<=0)errors.push(`${room.id}: invalid bounds`);if(!SPACE_ARCHETYPES[room.type])errors.push(`${room.id}: unknown type`);if(!SPACE_STAGES.includes(room.stage))errors.push(`${room.id}: unknown stage`)}for(let i=0;i<site.rooms.length;i++)for(let j=i+1;j<site.rooms.length;j++){const a=site.rooms[i],b=site.rooms[j],overlap=a.x<b.x+b.width&&a.x+a.width>b.x&&a.z<b.z+b.depth&&a.z+a.depth>b.z;if(overlap)errors.push(`${a.id}/${b.id}: overlap`)}return{ok:errors.length===0,errors}}
