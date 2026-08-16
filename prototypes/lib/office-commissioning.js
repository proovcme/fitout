const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const unique=list=>[...new Set(list)];

export const OFFICE_COMMISSION_PERSONAS=[
  {id:'dasha',name:'Даша Макетова',role:'ДИЗАЙНЕР',stages:[
    {id:'work',label:'рабочее место',items:['desk'],rooms:['work'],needs:['socket','light'],ok:'Села — свет и питание там, где их ждёшь. Подозрительно хорошо.'},
    {id:'meeting',label:'переговорная',items:['meetingTable'],rooms:['meeting'],needs:['light'],ok:'До встречи дошла без экскурсии по техническим помещениям.'},
    {id:'break',label:'место отдыха',items:['kitchenette','sofa','plant'],rooms:['lounge'],optional:true,ok:'Пять минут тишины тоже оказались частью проекта.'},
  ]},
  {id:'ilya',name:'Илья Сетевиков',role:'ИТ-СПЕЦИАЛИСТ',stages:[
    {id:'server',label:'серверная',items:['rack','printer'],rooms:['server','storage'],needs:['socket','light'],ok:'Стойка включилась с первого раза. Я даже немного разочарован.'},
    {id:'work',label:'рабочее место',items:['desk'],rooms:['work'],needs:['socket','light'],ok:'Кабель короткий, маршрут тоже. Можно работать.'},
    {id:'restroom',label:'санузел',items:['toilet'],rooms:['restroom'],ok:'Нашёл без навигатора. Для первого дня это победа.'},
  ]},
  {id:'lena',name:'Лена Брифова',role:'АККАУНТ-МЕНЕДЖЕР',stages:[
    {id:'arrival',label:'ресепшен',items:['receptionDesk','plant'],rooms:['reception','work'],optional:true,ok:'Клиент хотя бы сразу понимает, куда он попал.'},
    {id:'meeting',label:'переговорная',items:['meetingTable'],rooms:['meeting'],needs:['light'],ok:'Переговорная существует не только в презентации.'},
    {id:'restroom',label:'санузел',items:['toilet'],rooms:['restroom'],ok:'Путь понятный. Неловкий вопрос отменяется.'},
  ]},
];

const coordinates=(snapshot,index)=>({col:index%snapshot.cols,row:Math.floor(index/snapshot.cols)});
const manhattan=(snapshot,a,b)=>{const one=coordinates(snapshot,a),two=coordinates(snapshot,b);return Math.abs(one.col-two.col)+Math.abs(one.row-two.row)};
const neighbors=(snapshot,index)=>{const{col,row}=coordinates(snapshot,index),result=[];if(col>0)result.push(index-1);if(col<snapshot.cols-1)result.push(index+1);if(row>0)result.push(index-snapshot.cols);if(row<snapshot.rows-1)result.push(index+snapshot.cols);return result};
const canCross=(one,two)=>Boolean(one?.room&&two?.room&&(one.room===two.room||(one.room==='corridor'&&two.door)||(two.room==='corridor'&&one.door)));

export function officeRoute(snapshot,start,goal){
  if(start===goal)return[start];if(start<0||goal<0||!snapshot.cells[start]?.room||!snapshot.cells[goal]?.room)return[];
  const queue=[start],came=new Map(),seen=new Set([start]);while(queue.length){const current=queue.shift();for(const next of neighbors(snapshot,current)){if(seen.has(next)||!canCross(snapshot.cells[current],snapshot.cells[next]))continue;seen.add(next);came.set(next,current);if(next===goal){const route=[goal];let cursor=goal;while(came.has(cursor)){cursor=came.get(cursor);route.push(cursor)}return route.reverse()}queue.push(next)}}return[]
}

const stationIndex=(snapshot,stage)=>{for(const item of stage.items||[]){const found=snapshot.cells.findIndex(cell=>cell.item===item);if(found>=0)return found}for(const room of stage.rooms||[]){const found=snapshot.cells.findIndex(cell=>cell.room===room);if(found>=0)return found}return-1};
const networkNear=(snapshot,index,network)=>{const room=snapshot.cells[index]?.room;if(!room)return false;return snapshot.cells.some((cell,candidate)=>cell.room===room&&cell[network]&&manhattan(snapshot,index,candidate)<=2)};
const statusReaction=(stage,status)=>status==='blocked'?`${stage.label} видно. Дойти до него — уже отдельный проект.`:status==='unpowered'?`${stage.label} есть. Розетку теперь ищет весь отдел.`:status==='dark'?`${stage.label} готово, если помнить, где лежит клавиатура.`:status==='long_walk'?`${stage.label} работает. Шагомер тоже очень доволен.`:stage.ok;

export function analyzeOfficeCommissioning(snapshot,{personas=OFFICE_COMMISSION_PERSONAS,mistakes=[]}={}){
  const entrance=snapshot.cells.findIndex(cell=>cell.entrance),traffic=new Map(),journeys=[],observations=[];let blocked=0,unpowered=0,dark=0,longWalks=0;
  for(const persona of personas){let cursor=entrance;const steps=[];for(const stage of persona.stages){const targetIndex=stationIndex(snapshot,stage);if(targetIndex<0){if(!stage.optional){blocked++;observations.push({kind:'blocked',personaId:persona.id,text:`${persona.name}: ${stage.label} отсутствует.`})}continue}const route=officeRoute(snapshot,cursor,targetIndex),powered=!stage.needs?.includes('socket')||networkNear(snapshot,targetIndex,'socket'),lit=!stage.needs?.includes('light')||networkNear(snapshot,targetIndex,'light');let status='ok';if(!route.length){status='blocked';blocked++}else if(!powered){status='unpowered';unpowered++}else if(!lit){status='dark';dark++}else if(route.length>12){status='long_walk';longWalks++}for(const index of route)traffic.set(index,(traffic.get(index)||0)+1);const reaction=statusReaction(stage,status),step={...stage,targetIndex,route,status,reaction};steps.push(step);observations.push({kind:status,personaId:persona.id,targetIndex,text:`${persona.name}: ${reaction}`});if(route.length)cursor=targetIndex}journeys.push({id:persona.id,name:persona.name,role:persona.role,steps})}
  const corridorTraffic=[...traffic.entries()].filter(([index])=>snapshot.cells[index]?.room==='corridor'&&index!==entrance),maxTraffic=Math.max(0,...corridorTraffic.map(([,count])=>count)),bottleneck=maxTraffic>=6,workCells=snapshot.cells.map((cell,index)=>cell.room==='work'?index:-1).filter(index=>index>=0),loungeCells=snapshot.cells.map((cell,index)=>cell.room==='lounge'?index:-1).filter(index=>index>=0),noiseConflict=workCells.some(index=>neighbors(snapshot,index).some(next=>loungeCells.includes(next))),penalty=blocked*20+unpowered*9+dark*5+longWalks*2+(bottleneck?7:0)+(noiseConflict?5:0)+mistakes.length*4,score=clamp(100-penalty,0,100);
  if(bottleneck)observations.push({kind:'bottleneck',targetIndex:corridorTraffic.sort((a,b)=>b[1]-a[1])[0]?.[0],text:'Все маршруты встретились в одном коридоре.'});if(noiseConflict)observations.push({kind:'noise',targetIndex:workCells.find(index=>neighbors(snapshot,index).some(next=>loungeCells.includes(next))),text:'Кухня и рабочая зона обмениваются звуками без согласования.'});
  const priority=['blocked','unpowered','bottleneck','dark','noise','long_walk'],primaryMoment=priority.map(kind=>observations.find(item=>item.kind===kind)).find(Boolean)||observations.find(item=>item.kind==='ok')||{kind:'ok',text:'Люди вошли и сразу начали работать.'},whatIf=primaryMoment.kind==='blocked'?'В следующий раз соединить этот маршрут дверью и коридором.':primaryMoment.kind==='unpowered'?'В следующий раз поставить питание рядом с рабочими предметами.':primaryMoment.kind==='bottleneck'?'В следующий раз развести вход, переговорную и рабочие места разными маршрутами.':primaryMoment.kind==='dark'?'В следующий раз привязать свет к реальным рабочим точкам.':primaryMoment.kind==='noise'?'В следующий раз отделить отдых от сосредоточенной работы.':primaryMoment.kind==='long_walk'?'В следующий раз собрать часто используемые функции ближе.':'В следующий раз попробовать тот же бриф с более смелой геометрией.',verdict=score>=88?'ОФИС РАБОТАЕТ':score>=70?'ЖИТЬ МОЖНО':'ПЛАН ПРОСИТ РЕВИЗИЮ';
  return{score,verdict,entrance,journeys,observations,traffic:Object.fromEntries(traffic),maxTraffic,bottleneck,noiseConflict,primaryMoment,whatIf,issues:unique(observations.filter(item=>item.kind!=='ok').map(item=>item.kind))}
}

export function calculateFitoutScore({won=false,quality=0,commissionScore=0,seconds=180,buildProgress=0}={}){
  if(!won)return Math.max(0,Math.round(clamp(buildProgress,0,1)*1800+clamp(quality,0,100)*12));
  const timeBonus=Math.max(0,180-Math.max(0,Number(seconds)||0));
  return Math.max(0,Math.round(clamp(quality,0,100)*45+clamp(commissionScore,0,100)*35+timeBonus*20))
}
