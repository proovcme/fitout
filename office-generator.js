const ROOM_VARIANT_COUNT = 6;

const ARCHETYPES = [
  ['open-space','Открытый офис','Рабочие места, где календарь общий, а дедлайн персональный.',['desk','task-chair','plant'],['linear-light','hvac','outlet']],
  ['meeting','Переговорная','Комната, в которой срок сначала обещают, а потом уточняют.',['meeting-table','meeting-chair','screen'],['linear-light','hvac']],
  ['executive','Кабинет руководителя','Один стол, два кресла и запасной путь согласования.',['executive-desk','task-chair','visitor-chair','cabinet','plant'],['pendant-light','hvac']],
  ['reception','Ресепшен','Первая линия обороны между объектом и людьми без пропуска.',['reception-desk','lounge-chair','plant'],['linear-light','access-control']],
  ['kitchen','Кухня','Главный переговорный узел после официальной переговорной.',['counter','fridge','coffee','high-table'],['downlight','hvac','plumbing']],
  ['restroom','Санузел','Единственная зона, где исполнительная схема иногда совпадает.',['toilet','sink','mirror'],['downlight','extract','plumbing']],
  ['corridor','Коридор','Транспортная артерия для людей, шкафов и срочного дивана.',['bench','plant','signage'],['linear-light','fire']],
  ['server','Серверная','Место, где климат всегда важнее настроения.',['server-rack','ups','cabinet'],['linear-light','precision-hvac','fire']],
  ['storage','Склад','Временное хранение того, что понадобится сразу после списания.',['rack','crate','cabinet'],['bulkhead-light','fire']],
  ['technical','Техническая','Помещение для оборудования и специалиста, который знает пароль.',['electrical-cabinet','pump','rack'],['bulkhead-light','extract','fire']],
].map(([id,title,description,furniture,equipment])=>({
  id,title,description,furniture,equipment,
  variants:Array.from({length:ROOM_VARIANT_COUNT},(_,index)=>({
    id:`${id}-${index+1}`,
    density:.82+index*.07,
    mirrored:index%2===1,
    rotation:(index%3)*Math.PI/2,
  })),
}));

export const ROOM_ARCHETYPES = Object.freeze(ARCHETYPES);
export const ROOM_ARCHETYPE_BY_ID = Object.freeze(Object.fromEntries(ARCHETYPES.map(item=>[item.id,item])));
export { ROOM_VARIANT_COUNT };

function mix(value, salt=1) {
  let result=(Number(value)||0)^(salt*0x45d9f3b);
  result=Math.imul(result^(result>>>16),0x45d9f3b);
  result=Math.imul(result^(result>>>16),0x45d9f3b);
  return (result^(result>>>16))>>>0;
}

function pick(items,seed,salt=1){return items[mix(seed,salt)%items.length];}
function variantFor(kind,seed,index){
  const archetype=ROOM_ARCHETYPE_BY_ID[kind];
  return archetype.variants[mix(seed+index*97,kind.length*19)%archetype.variants.length];
}

const BASE_SLOTS = [
  {id:'collaboration',kind:'meeting',x:-3.18,z:-2.25,w:2.72,d:2.05,walls:['south','east']},
  {id:'social',kind:'kitchen',x:-.42,z:-2.88,w:2.15,d:1.18,walls:['south']},
  {id:'amenities',kind:'restroom',x:2.67,z:-2.68,w:2.65,d:1.55,walls:['south','west']},
  {id:'work',kind:'open-space',x:.05,z:.45,w:5.45,d:3.42,walls:['north']},
  {id:'leadership',kind:'executive',x:-3.38,z:2.45,w:2.25,d:1.65,walls:['north','east']},
  {id:'arrival',kind:'reception',x:3.48,z:2.72,w:1.92,d:1.2,walls:['north','west']},
  {id:'support',kind:'server',x:3.82,z:-.42,w:1.35,d:2.02,walls:['north','west']},
];

function localPoint(room,x,z,rotation=0,extra={}){
  const variant=room.variant;
  const spreadX=.88+(room.variantIndex%3)*.08;
  const spreadZ=.9+Math.floor(room.variantIndex/3)*.1;
  return {
    x:room.x+(variant.mirrored?-x:x)*spreadX,
    z:room.z+z*spreadZ,
    rotation:rotation+(variant.mirrored?Math.PI:0),
    ...extra,
  };
}

function deskCluster(room){
  const count=4+(room.variantIndex%3)*2;
  const result=[];
  for(let index=0;index<count;index++){
    const columns=Math.ceil(count/2);
    const row=Math.floor(index/columns);
    const col=index%columns;
    const spacing=Math.min(1.18,(room.w-.5)/Math.max(1,columns-1));
    result.push(localPoint(room,(col-(columns-1)/2)*spacing,(row-.5)*1.03,row?Math.PI:0,{kind:'desk'}));
  }
  return result;
}

function meetingSet(room){
  const chairs=4+(room.variantIndex%3);
  const result=[localPoint(room,0,0,room.variantIndex%2?Math.PI/2:0,{kind:'meeting-table',scale:.92+room.variantIndex*.025})];
  for(let index=0;index<chairs;index++){
    const side=index%2?1:-1;
    const along=(Math.floor(index/2)-(Math.ceil(chairs/2)-1)/2)*.55;
    result.push(localPoint(room,along,side*.62,side<0?0:Math.PI,{kind:'chair'}));
  }
  result.push(localPoint(room,room.w*.34,-room.d*.35,Math.PI,{kind:'screen'}));
  return result;
}

function roomFurniture(room){
  switch(room.kind){
    case 'open-space': return deskCluster(room);
    case 'meeting': return meetingSet(room);
    case 'executive': return [
      localPoint(room,0,-.2,0,{kind:'executive-desk'}),localPoint(room,0,.47,Math.PI,{kind:'chair'}),
      localPoint(room,-.54,-.72,0,{kind:'cabinet'}),localPoint(room,.7,.48,0,{kind:'plant'}),
    ];
    case 'reception': return [
      localPoint(room,0,-.12,0,{kind:'reception-desk'}),localPoint(room,-.62,.36,-Math.PI/2,{kind:'lounge-chair'}),localPoint(room,.72,.32,0,{kind:'plant'}),
    ];
    case 'kitchen': return [
      localPoint(room,-.28,-.38,0,{kind:'counter'}),localPoint(room,.72,-.38,0,{kind:'fridge'}),
      localPoint(room,-.72,.22,0,{kind:'coffee'}),localPoint(room,.25,.22,0,{kind:'high-table'}),
    ];
    case 'restroom': return [
      localPoint(room,-.52,-.28,Math.PI,{kind:'toilet'}),localPoint(room,.52,-.28,Math.PI,{kind:'toilet'}),
      localPoint(room,-.52,.38,0,{kind:'sink'}),localPoint(room,.52,.38,0,{kind:'sink'}),
    ];
    case 'server': return [-.38,.05,.48].map((x,index)=>localPoint(room,x,-.12,0,{kind:index===2?'ups':'server-rack'}));
    case 'storage': return [
      localPoint(room,-.38,-.22,0,{kind:'rack'}),localPoint(room,.38,-.22,0,{kind:'rack'}),
      localPoint(room,-.3,.48,indexAngle(room,1),{kind:'crate'}),localPoint(room,.32,.46,indexAngle(room,2),{kind:'crate'}),
    ];
    case 'technical': return [
      localPoint(room,-.32,-.25,0,{kind:'electrical-cabinet'}),localPoint(room,.35,-.2,0,{kind:'pump'}),
      localPoint(room,0,.45,0,{kind:'rack'}),
    ];
    default: return [localPoint(room,0,0,0,{kind:'bench'})];
  }
}

function indexAngle(room,salt){return (mix(room.variantIndex,salt)%8)/8*Math.PI;}

function roomEquipment(room){
  const result=[];
  const columns=room.kind==='open-space'?3:1;
  for(let index=0;index<columns;index++){
    result.push(localPoint(room,(index-(columns-1)/2)*Math.min(1.55,room.w*.26),0,0,{
      kind:['restroom','kitchen'].includes(room.kind)?'downlight':'linear-light',
      y:2.48,
    }));
  }
  if(!['corridor','storage'].includes(room.kind)){
    result.push(localPoint(room,room.w*.28,-room.d*.32,0,{kind:room.kind==='server'?'precision-hvac':'hvac',y:2.12}));
  }
  return result;
}

function wallSegments(room,side){
  const thickness=.075;
  const door=.72;
  if(side==='north'||side==='south'){
    const z=room.z+(side==='north'?-room.d/2:room.d/2);
    const segment=(room.w-door)/2;
    return [
      {x:room.x-(door+segment)/2,z,w:segment,d:thickness,axis:0,roomId:room.id},
      {x:room.x+(door+segment)/2,z,w:segment,d:thickness,axis:0,roomId:room.id},
    ];
  }
  const x=room.x+(side==='west'?-room.w/2:room.w/2);
  const segment=(room.d-door)/2;
  return [
    {x,z:room.z-(door+segment)/2,w:thickness,d:segment,axis:1,roomId:room.id},
    {x,z:room.z+(door+segment)/2,w:thickness,d:segment,axis:1,roomId:room.id},
  ];
}

export function createOfficeComposition({seed=1,area=600,projectType='renovation'}={}){
  const supportKind=pick(['server','storage','technical'],seed,71);
  const density=Math.max(.78,Math.min(1.18,Math.sqrt(Math.max(90,area)/600)));
  const rooms=BASE_SLOTS.map((slot,index)=>{
    const kind=slot.id==='support'?supportKind:slot.kind;
    const variant=variantFor(kind,seed,index);
    const variantIndex=Number(variant.id.split('-').at(-1))-1;
    const room={...slot,kind,variant,variantIndex,title:ROOM_ARCHETYPE_BY_ID[kind].title};
    if(slot.id==='work'){room.w*=density;room.d*=Math.min(1.08,density);}
    room.furniture=roomFurniture(room);
    room.equipment=roomEquipment(room);
    return room;
  });
  const partitions=rooms.flatMap(room=>room.walls.flatMap(side=>wallSegments(room,side)));
  return {
    seed,area,projectType,density,
    rooms,
    partitions,
    furniture:rooms.flatMap(room=>room.furniture.map(item=>({...item,roomId:room.id,roomKind:room.kind}))),
    equipment:rooms.flatMap(room=>room.equipment.map(item=>({...item,roomId:room.id,roomKind:room.kind}))),
  };
}
