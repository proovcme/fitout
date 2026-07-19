import { buildTasksForOrder } from './order-generator.js';
import { generateSiteLine } from './procedural-content.js';
import { SITUATIONS, situationById } from './situations.js';
import { randomEventById } from './events/index.js';

export const INITIAL_BUDGET = 1180;
export const DEADLINE_HOURS = 72;
export const REAL_SECONDS_PER_WORKDAY = 300;
export const GAME_HOURS_PER_REAL_SECOND = 9 / REAL_SECONDS_PER_WORKDAY;

const DEFAULT_ORGANIZATION = {
  name:'ООО «Потом согласуем»',
  cash:320,
  debt:0,
  reputation:50,
  projectsCompleted:0,
  totalProfit:0,
  history:[],
};

export function ensureOrganization(state) {
  state.organization={...DEFAULT_ORGANIZATION,...(state.organization??{})};
  state.organization.history??=[];
  return state.organization;
}

export function takeOrganizationLoan(state,principal) {
  const organization=ensureOrganization(state);
  if(state.started&&!state.completed)return {ok:false,reason:'project-active'};
  if(![300,800].includes(principal))return {ok:false,reason:'amount'};
  if(organization.debt+principal>2400)return {ok:false,reason:'credit-limit'};
  const rate=principal===300 ? .16 : .22;
  const repayment=Math.round(principal*(1+rate));
  organization.cash+=principal;organization.debt+=repayment;
  organization.history.unshift({type:'loan',amount:principal,repayment,at:Date.now()});
  organization.history=organization.history.slice(0,30);
  return {ok:true,principal,repayment,rate};
}

export function settleProjectEconomy(state) {
  const organization=ensureOrganization(state);
  if(state.projectSettlement)return state.projectSettlement;
  const profit=Math.round(state.budget);
  organization.cash+=profit;
  organization.totalProfit+=profit;
  organization.projectsCompleted+=1;
  organization.reputation=Math.max(0,Math.min(100,organization.reputation+Math.round((state.trust-65)/8)+(state.quality>=(state.contract?.qualityTarget??78)?3:-4)));
  const debtPayment=Math.min(organization.debt,Math.max(0,Math.round(profit*.22)));
  organization.cash-=debtPayment;organization.debt-=debtPayment;
  const settlement={profit,debtPayment,organizationCash:organization.cash};
  organization.history.unshift({type:'project',title:state.selectedOrder?.title??'Объект',profit,debtPayment,at:Date.now()});
  organization.history=organization.history.slice(0,30);
  state.projectSettlement=settlement;
  return settlement;
}

export function developHeadquarters(state, rng = Math.random) {
  const organization=ensureOrganization(state);
  state.hq??={level:0,title:'Стол у принтера',attempts:0,lastFailure:'Зато принтер греет зимой'};
  const costs=[80,170,320,520];
  const cost=costs[Math.min(state.hq.level,costs.length-1)];
  if(organization.cash<cost)return {ok:false,reason:'cash',cost,...state.hq};
  organization.cash-=cost;state.hq.attempts+=1;
  const titles=['Стол у принтера','Кабинет без окна','Комната с фикусом','Почти настоящий офис','Офис, который не стыдно показать'];
  const failures=['Арендодатель передумал после слова «переговорка».','Выбрали помещение. В нём уже живёт бухгалтерия.','Дизайнер потратил бюджет на мудборд из бетона.','Кресло приехало. Офис — нет.','Согласовали планировку, но не нашли вход.'];
  const chance=Math.min(.58,.28+organization.reputation*.003);
  const success=rng()<chance&&state.hq.level<titles.length-1;
  if(success){state.hq.level+=1;state.hq.title=titles[state.hq.level];state.hq.lastFailure='Невероятно: улучшение пережило согласование.';}
  else state.hq.lastFailure=failures[Math.floor(rng()*failures.length)];
  organization.history.unshift({type:'hq',amount:cost,success,at:Date.now()});organization.history=organization.history.slice(0,30);
  return {ok:true,success,cost,...state.hq};
}

export const TASK_BLUEPRINTS = [
  { id: 'survey', title: 'Зафиксировать состояние', short: 'Обход', skill: 'management', x: 1, y: 5, duration: 4, cost: 18, quality: 1, deps: [], priority: 3, color: '#b7c7b8' },
  { id: 'project', title: 'Выпустить рабочий проект', short: 'Проект', skill: 'design', x: 2, y: 3, duration: 12, cost: 72, quality: 5, deps: ['survey'], priority: 3, color: '#a58ae1' },
  { id: 'move', title: 'Освободить open space', short: 'Переезд', skill: 'moving', x: 3, y: 4, duration: 10, cost: 86, quality: 2, deps: ['survey'], priority: 2, color: '#e9ad52' },
  { id: 'electric', title: 'Перенести розетки', short: 'Электрика', skill: 'electric', x: 6, y: 2, duration: 12, cost: 128, quality: 4, deps: ['survey'], priority: 2, color: '#69bfe8' },
  { id: 'prep', title: 'Подготовить стены', short: 'Подготовка', skill: 'paint', x: 2, y: 1, duration: 13, cost: 92, quality: 4, deps: ['move'], priority: 2, color: '#d48f72' },
  { id: 'paint', title: 'Покрасить переговорную', short: 'Покраска', skill: 'paint', x: 1, y: 1, duration: 18, cost: 176, quality: 7, deps: ['prep'], priority: 2, color: '#d87561' },
  { id: 'desks', title: 'Собрать 24 рабочих места', short: 'Мебель', skill: 'furniture', x: 5, y: 4, duration: 22, cost: 238, quality: 6, deps: ['move', 'electric'], priority: 2, color: '#9d85d8' },
  { id: 'clean', title: 'Финишная уборка', short: 'Клининг', skill: 'cleaning', x: 7, y: 5, duration: 8, cost: 54, quality: 4, deps: ['paint', 'desks'], priority: 1, color: '#62cba0' },
  { id: 'executive-docs', title: 'Собрать исполнительную документацию', short: 'Исполнительная', skill: 'documentation', x: 6, y: 5, duration: 10, cost: 34, quality: 5, deps: ['electric','paint','desks'], priority: 2, color: '#69daa9' },
  { id: 'inspect', title: 'Приёмка и дефектовка', short: 'Приёмка', skill: 'management', x: 4, y: 2, duration: 5, cost: 12, quality: 5, deps: ['clean','executive-docs'], priority: 1, color: '#ddff55' },
];

export const CONTRACTOR_BLUEPRINTS = [
  { id: 'movers', name: 'Перестановка', company: 'Точно Переедем', skill: 'moving', price: 42, rating: 86, speed: 1.15, quality: 0.97, color: '#e9ad52', initials: 'ТП', quirk: 'Теряют только мелкое' },
  { id: 'painters', name: 'Маляры', company: 'Ровный слой', skill: 'paint', price: 68, rating: 92, speed: 1.05, quality: 1.06, color: '#d87561', initials: 'РС', quirk: 'RAL помнят на глаз' },
  { id: 'electricians', name: 'Электрики', company: 'Фаза Ноль', skill: 'electric', price: 54, rating: 89, speed: 1.08, quality: 1.02, color: '#69bfe8', initials: 'ФН', quirk: 'Им всегда нужен доступ' },
  { id: 'assemblers', name: 'Сборщики', company: 'Модуль Бюро', skill: 'furniture', price: 76, rating: 84, speed: 1.18, quality: 0.98, color: '#9d85d8', initials: 'МБ', quirk: 'Инструкция — слабость' },
  { id: 'cleaners', name: 'Клининг', company: 'Чистый лист', skill: 'cleaning', price: 34, rating: 90, speed: 1.12, quality: 1.04, color: '#62cba0', initials: 'ЧЛ', quirk: 'На сдаче незаменимы' },
];

export const TEAM_BLUEPRINTS = [
  { id:'pm',name:'Алина Ветрова',role:'Руководитель проекта',price:92,effect:'Подрядчики соблюдают ваши приоритеты',initials:'АВ',color:'#ddff55' },
  { id:'supervision',name:'Борис Тихонов',role:'Технический надзор',price:74,effect:'Меньше скрытых дефектов и переделок',initials:'БТ',color:'#69bfe8' },
  { id:'procurement',name:'Катя Руднева',role:'Комплектатор',price:58,effect:'Поставки и замены обходятся дешевле',initials:'КР',color:'#d87561' },
  { id:'designer',name:'Мария Корнилова',role:'Главный архитектор',price:88,effect:'Выпускает рабочий проект и защищает решения',initials:'МК',color:'#a58ae1',skill:'design' },
  { id:'doc-control',name:'Семён Актов',role:'Специалист ИД',price:64,effect:'Собирает акты, схемы и паспорта до приёмки',initials:'СА',color:'#69daa9',skill:'documentation' },
];

const RANDOM_EVENTS = ['noise', 'nephew', 'delivery', 'calendar', 'client-ghost', 'italian-sofa'];

function pickRandomEvents(eventCatalog, rng, count = 12) {
  const normalized=eventCatalog.map(item=>typeof item==='string'?{id:item,minHour:0,weight:1}:item);
  const picked=[];
  while(picked.length<count) {
    const slot=Math.floor(picked.length/2)*24+[6,8][picked.length%2];
    const available=normalized.filter(item=>(item.minHour??0)<=slot&&!picked.includes(item.id));
    if(!available.length)break;
    const total=available.reduce((sum,item)=>sum+(item.weight??1),0);
    let roll=rng()*total;
    let chosen=available.at(-1);
    for(const item of available){roll-=item.weight??1;if(roll<=0){chosen=item;break;}}
    picked.push(chosen.id);
  }
  return picked;
}

function scheduleRandomEvents(eventIds,eventCatalog,rng) {
  const catalog=new Map(eventCatalog.filter(item=>typeof item!=='string').map(item=>[item.id,item]));
  const windows=[[2.7,3.5],[6.2,7.5]];
  return eventIds.map((id,index)=>{
    const day=Math.floor(index/2);const [start,end]=windows[index%2];
    const randomHour=day*24+start+rng()*(end-start);
    const weight=catalog.get(id)?.weight??5;
    const probability=Math.max(.32,Math.min(.82,.28+weight*.065));
    return {id,hour:Math.max(randomHour,catalog.get(id)?.minHour??0),probability,occurs:rng()<probability};
  });
}

export function ensureMasterSchedule(state) {
  const finishById=new Map();
  state.tasks.forEach((task,index)=>{
    const dependencyFinish=Math.max(0,...task.deps.map(id=>finishById.get(id)??0));
    const plannedStartHour=dependencyFinish;
    const plannedFinishHour=plannedStartHour+task.duration;
    if(!Number.isFinite(task.scheduleOrder))task.scheduleOrder=index;
    if(!Number.isFinite(task.plannedStartDay))task.plannedStartDay=Math.floor(plannedStartHour/9);
    if(!Number.isFinite(task.plannedFinishDay))task.plannedFinishDay=Math.max(task.plannedStartDay,Math.ceil(plannedFinishHour/9)-1);
    finishById.set(task.id,plannedFinishHour);
  });
  return state.tasks;
}

export function moveMasterScheduleTask(state,taskId,direction) {
  ensureMasterSchedule(state);
  const ordered=[...state.tasks].sort((a,b)=>a.scheduleOrder-b.scheduleOrder);
  const index=ordered.findIndex(task=>task.id===taskId);const target=index+direction;
  if(index<0||target<0||target>=ordered.length)return false;
  [ordered[index].scheduleOrder,ordered[target].scheduleOrder]=[ordered[target].scheduleOrder,ordered[index].scheduleOrder];
  return true;
}

export function shiftMasterScheduleTask(state,taskId,dayDelta) {
  ensureMasterSchedule(state);const task=state.tasks.find(item=>item.id===taskId);if(!task)return false;
  const span=Math.max(0,task.plannedFinishDay-task.plannedStartDay);
  task.plannedStartDay=Math.max(0,task.plannedStartDay+dayDelta);task.plannedFinishDay=task.plannedStartDay+span;task.scheduleManuallyEdited=true;
  return true;
}

export function scheduledTasksForDay(state,dayIndex) {
  ensureMasterSchedule(state);
  return state.tasks.filter(task=>!['done','active'].includes(task.status)&&task.plannedStartDay<=dayIndex).sort((a,b)=>a.scheduleOrder-b.scheduleOrder);
}

export function createInitialState(rng = Math.random, eventCatalog = RANDOM_EVENTS) {
  const randomEvents=pickRandomEvents(eventCatalog,rng,12);
  const initialState={
    phase: 'orders',
    contract: { budget:INITIAL_BUDGET,deadlineHours:DEADLINE_HOURS,qualityTarget:78,cardsPlayed:[] },
    elapsed: 0,
    budget: INITIAL_BUDGET,
    quality: 74,
    trust: 72,
    speed: 1,
    paused: true,
    started: false,
    completed: false,
    selectedTaskId: null,
    tasks: TASK_BLUEPRINTS.map((task) => ({ ...task, progress: 0, status: 'locked', crewId: null, committed: false })),
    contractors: CONTRACTOR_BLUEPRINTS.map((contractor) => ({ ...contractor, hired: false })),
    team: TEAM_BLUEPRINTS.map((member)=>({...member,hired:false})),
    finance:{ledger:[{hour:0,type:'income',category:'Аванс',amount:INITIAL_BUDGET,text:'Стартовое финансирование'}],contractValue:INITIAL_BUDGET,received:INITIAL_BUDGET,spent:0},
    crews: [
      { id: 'foreman', name: 'Вы', role: 'Технический заказчик', skill: 'management', color: '#ddff55', initials: 'ТЗ', speed: .7, quality: .92, taskId: null, x: 4, y: 6, state: 'idle' },
    ],
    plannedDay: 0,
    needsPlanning: false,
    reportedDay: -1,
    needsReport: false,
    activeSituations:[],
    situationCount:0,
    nextSituationAt:2.2,
    eventsSeen: [],
    eventCountsByDay:{},
    paintEventOccurs:rng()<.55,
    eventQueue: [],
    lastBarkSlot: 0,
    randomEvent: randomEvents[0],
    randomEvents,
    eventSchedule: scheduleRandomEvents(randomEvents,eventCatalog,rng),
    sceneEffect: null,
    hq: {
      level: 0,
      title: 'Стол у принтера',
      attempts: 0,
      lastFailure: 'Зато принтер греет зимой',
    },
    tutorial:null,
    organization:{...DEFAULT_ORGANIZATION,history:[]},
    log: [],
  };
  ensureMasterSchedule(initialState);
  return initialState;
}

export function selectOrder(state, order) {
  if (!order || state.started) return false;
  const organization=ensureOrganization(state);
  if((order.requiresProjects??0)>organization.projectsCompleted)return false;
  const mobilizationCost=Math.max(12,Math.min(140,Math.round(order.area/28+order.complexity*8)));
  if(organization.cash<mobilizationCost)return false;
  organization.cash-=mobilizationCost;
  organization.history.unshift({type:'bid',title:order.title,amount:mobilizationCost,at:Date.now()});organization.history=organization.history.slice(0,30);
  state.selectedOrder = { ...order, tasks: undefined };
  state.phase = 'negotiation';
  state.contract = {
    budget: order.budget,
    deadlineHours: order.deadlineHours,
    qualityTarget: order.qualityTarget,
    cardsPlayed: [],
  };
  const advance=Math.round(order.budget*.45);
  state.budget = advance;
  state.finance={ledger:[{hour:0,type:'income',category:'Заказчик',amount:advance,text:`Аванс 45% · ${order.clientName}`}],contractValue:order.budget,received:advance,spent:0};
  state.quality = Math.max(66, order.finishQuality - 5);
  state.trust = order.clientType === 'state' ? 68 : 72;
  state.tasks = Array.isArray(order.tasks)?order.tasks.map(task=>({...task})):buildTasksForOrder(order);
  ensureMasterSchedule(state);
  state.masterScheduleAccepted=false;
  state.visualSeed = order.visualSeed;
  state.tutorial=order.tutorial?{active:true,completed:false,chatSent:false,observedBuild:false,startedAt:Date.now()}:null;
  state.organizationMobilization=mobilizationCost;
  state.log.push({ type: 'order', text: `Взяли заказ: ${order.title}` });
  unlockTasks(state);
  return true;
}

export function unlockTasks(state) {
  for (const task of state.tasks) {
    if (task.status === 'done' || task.status === 'active' || task.status === 'blocked') continue;
    if(!state.started){task.status=task.id==='survey'?'ready':'locked';continue;}
    if(task.id==='inspect') {
      task.status=state.tasks.filter(item=>item.id!=='inspect').every(item=>item.status==='done')?'ready':'locked';
    } else task.status='ready';
  }
}

export function applyContractCard(state,card) {
  if(!card||state.contract.cardsPlayed.includes(card.id)||state.contract.cardsPlayed.length>=2)return false;
  state.contract.cardsPlayed.push(card.id);
  state.contract.budget+=card.budget??0;state.contract.deadlineHours+=card.deadline??0;state.contract.qualityTarget+=card.quality??0;state.trust+=card.trust??0;
  if(card.budget){state.budget+=card.budget;recordCash(state,'income','Резерв',card.budget,card.title);}return true;
}

function recordCash(state,type,category,amount,text) {
  state.finance??={ledger:[],contractValue:state.contract?.budget??0,received:0,spent:0};
  state.finance.ledger??=[];state.finance.ledger.unshift({hour:state.elapsed??0,type,category,amount:Math.round(amount),text});state.finance.ledger=state.finance.ledger.slice(0,80);
  if(type==='income')state.finance.received=(state.finance.received??0)+amount;else state.finance.spent=(state.finance.spent??0)+amount;
}

function situationRoll(state,salt=0){const value=Math.sin((state.visualSeed??17)*.017+(state.situationCount??0)*12.9898+salt)*43758.5453;return value-Math.floor(value);}
function applySituationDeltas(state,deltas={},text='Ситуация на объекте'){
  const budget=deltas.budget??0;state.budget+=budget;state.elapsed+=deltas.time??0;state.quality=Math.max(0,Math.min(100,state.quality+(deltas.quality??0)));state.trust=Math.max(0,Math.min(100,state.trust+(deltas.trust??0)));
  if(budget)recordCash(state,budget>0?'income':'expense','Решение',Math.abs(budget),text);
}

export function resolveSituation(state,situationId,choiceId,auto=false){
  const active=(state.activeSituations??[]).find(item=>item.uid===situationId);if(!active)return false;
  const template=situationById.get(active.templateId);const choice=template?.choices.find(item=>item.id===choiceId);if(!choice)return false;
  applySituationDeltas(state,choice.deltas,template.title);state.activeSituations=state.activeSituations.filter(item=>item.uid!==situationId);state.log.push({type:auto?'done':'event',text:`${auto?'Команда решила':'Решение'}: ${template.title} — ${choice.title}`});return true;
}

function updateSituations(state){
  if(state.tutorial?.active&&!state.tutorial.completed)return;
  state.activeSituations??=[];state.situationCount??=0;state.nextSituationAt??=state.elapsed+2.2;
  for(const active of [...state.activeSituations])if(state.elapsed>=active.expiresAt){const template=situationById.get(active.templateId);resolveSituation(state,active.uid,template.choices.at(-1).id);state.trust=Math.max(0,state.trust-1);state.log.push({type:'risk',text:`Вопрос проигнорирован: ${template.title}`});}
  if(state.elapsed<state.nextSituationAt||state.activeSituations.length>=3)return;
  const template=SITUATIONS[Math.floor(situationRoll(state,3)*SITUATIONS.length)%SITUATIONS.length];
  const matching=state.crews.filter(crew=>crew.skill===template.skill);const target=matching[Math.floor(situationRoll(state,5)*Math.max(1,matching.length))]??state.crews.find(crew=>crew.id==='foreman');
  const resolver=state.team?.find(member=>member.id===template.resolver&&member.hired);const uid=`situation-${state.situationCount}-${template.id}`;
  state.situationCount+=1;state.nextSituationAt=state.elapsed+2.2+situationRoll(state,7)*1.4;
  if(resolver&&situationRoll(state,11)<.62){applySituationDeltas(state,template.choices[0].deltas,template.title);state.log.push({type:'done',text:`${resolver.name} сам(а) решил(а): ${template.title}`});return;}
  state.activeSituations.push({uid,templateId:template.id,crewId:target?.id??'foreman',createdAt:state.elapsed,expiresAt:state.elapsed+2.4});
  state.log.push({type:'risk',text:`Новый вопрос на площадке: ${template.title}`});
}

export function closeDayFinances(state) {
  const teamCost=Math.round((state.team??[]).filter(member=>member.hired).reduce((sum,member)=>sum+member.price*.055,0));
  const contractorCost=Math.round((state.contractors??[]).filter(item=>item.hired).reduce((sum,item)=>sum+item.price*.08,0));
  const overhead=Math.max(6,Math.round((state.selectedOrder?.area??280)/180));
  const total=teamCost+contractorCost+overhead;state.budget-=total;
  recordCash(state,'expense','День объекта',total,`Зарплаты ${teamCost}К · подрядчики ${contractorCost}К · накладные ${overhead}К`);
  return total;
}

export function hireTeamMember(state,memberId) {
  const member=state.team.find(item=>item.id===memberId);if(!member||member.hired)return {ok:false,reason:'already'};
  if(state.budget<member.price)return {ok:false,reason:'budget'};
  state.budget-=member.price;member.hired=true;
  recordCash(state,'expense','Команда',member.price,`Мобилизация: ${member.name}`);
  if(member.id==='pm') {
    const foreman=state.crews.find(crew=>crew.id==='foreman');foreman.name=member.name;foreman.role=member.role;foreman.initials=member.initials;foreman.speed=1.15;foreman.quality=1.02;
  }
  if(member.skill)state.crews.push({id:`team-${member.id}`,name:member.name,role:member.role,skill:member.skill,color:member.color,initials:member.initials,speed:1.02,quality:1.08,taskId:null,x:8,y:7,state:'idle'});
  else if(member.id!=='pm')state.crews.push({id:`team-${member.id}`,name:member.name,role:member.role,skill:'support',color:member.color,initials:member.initials,speed:1,quality:1.04,taskId:null,x:7,y:6,state:'patrol',supportRole:member.id});
  return {ok:true,member};
}

export function hireContractor(state, contractorId) {
  const contractor = state.contractors.find((item) => item.id === contractorId);
  if (!contractor || contractor.hired) return { ok: false, reason: 'already' };
  if (state.budget < contractor.price) return { ok: false, reason: 'budget' };
  state.budget -= contractor.price;
  recordCash(state,'expense','Подрядчик',contractor.price,`Мобилизация: ${contractor.company}`);
  contractor.hired = true;
  state.crews.push({
    id: `crew-${contractor.id}`,
    name: contractor.company,
    role: contractor.name,
    skill: contractor.skill,
    color: contractor.color,
    initials: contractor.initials,
    speed: contractor.speed,
    quality: contractor.quality,
    quirk: contractor.quirk,
    taskId: null,
    x: 8,
    y: 7,
    state: 'idle',
  });
  state.log.push({ type: 'hire', text: `${contractor.company} выходят на объект` });
  return { ok: true, contractor };
}

export function cyclePriority(state, taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || ['done', 'active'].includes(task.status)) return false;
  task.priority = task.priority === 3 ? 1 : task.priority + 1;
  return true;
}

function availableTaskForCrew(state, crew) {
  if ((crew.unavailableUntil ?? 0) > state.elapsed) return undefined;
  return state.tasks
    .filter((task) => task.status === 'ready' && task.skill === crew.skill && task.enabledToday)
    .filter((task) => !task.crewId)
    .sort((a, b) => state.team?.find(member=>member.id==='pm')?.hired ? b.priority - a.priority || a.duration - b.duration : a.duration-b.duration)[0];
}

function assignCrews(state) {
  for (const crew of state.crews) {
    if (crew.taskId) continue;
    const task = availableTaskForCrew(state, crew);
    if (!task) {
      crew.state = 'idle';
      continue;
    }
    if (!task.committed) {
      if (state.budget < task.cost) {
        task.status = 'blocked';
        state.log.push({ type: 'risk', text: `Не хватает бюджета на «${task.title}»` });
        continue;
      }
      state.budget -= task.cost;
      recordCash(state,'expense','Работы',task.cost,`Материалы и работы: ${task.title}`);
      task.committed = true;
    }
    task.status = 'active';
    task.outOfSequence=task.deps.some(depId=>state.tasks.find(item=>item.id===depId)?.status!=='done');
    if(task.outOfSequence){state.quality=Math.max(0,state.quality-1.5);state.log.push({type:'risk',text:`Работы пошли не по порядку: ${task.title}`});}
    task.crewId = crew.id;
    crew.taskId = task.id;
    crew.state = 'working';
    state.log.push({ type: 'start', text: `${crew.name}: ${task.title}` });
  }
}

function completeTask(state, task, crew) {
  task.progress = 1;
  task.status = 'done';
  task.crewId = null;
  crew.taskId = null;
  crew.state = 'idle';
  crew.x = task.x;
  crew.y = task.y;
  const supervision=state.team?.find(member=>member.id==='supervision')?.hired;
  const qualityGain = task.quality * crew.quality * (supervision?1:.82);
  state.quality = Math.min(100, state.quality + qualityGain);
  state.trust = Math.min(100, state.trust + (task.id === 'inspect' ? 4 : 1));
  state.log.push({ type: 'done', text: `Готово: ${task.title}` });
  if(!task.reworkOf){const payment=Math.max(5,Math.round(task.cost*1.15));state.budget+=payment;recordCash(state,'income','Этапный платёж',payment,task.title);}
  if(task.id==='electric') {
    const paint=state.tasks.find(item=>item.id==='paint');
    if(paint?.status==='done'&&!state.tasks.some(item=>item.reworkOf==='paint')) {
      state.tasks.push({id:`rework-paint-${state.tasks.length}`,title:'Восстановить стены после прокладки кабеля',short:'Переделка',skill:'paint',x:2,y:1,duration:9,cost:96,quality:2,deps:[],priority:2,color:'#ff746b',progress:0,status:'ready',crewId:null,committed:false,enabledToday:false,reworkOf:'paint'});
      state.quality=Math.max(0,state.quality-7);state.trust=Math.max(0,state.trust-4);state.log.push({type:'risk',text:'Электрики вскрыли готовые стены. Добавлена переделка.'});
    }
  }
  if(['paint','desks','electric'].includes(task.id)) {
    const clean=state.tasks.find(item=>item.id==='clean');
    if(clean?.status==='done'&&!state.tasks.some(item=>item.reworkOf==='clean')) {
      state.tasks.push({id:`rework-clean-${state.tasks.length}`,title:'Повторная уборка после новых работ',short:'Переделка',skill:'cleaning',x:7,y:5,duration:5,cost:34,quality:1,deps:[],priority:1,color:'#ff746b',progress:0,status:'ready',crewId:null,committed:false,enabledToday:false,reworkOf:'clean'});
      state.log.push({type:'risk',text:'Уборку сделали слишком рано. Потребуется повторный выход.'});
    }
  }
  unlockTasks(state);
}

export function eventRequiredSkill(event) {
  const skills=(event?.options??[]).map(option=>option.scene?.hideSkill).filter(Boolean);
  return skills.length===(event?.options?.length??0)&&new Set(skills).size===1?skills[0]:null;
}

export function isEventRelevant(state,event) {
  const requiredSkill=eventRequiredSkill(event);
  if(!requiredSkill)return true;
  return state.tasks.some(task=>task.skill===requiredSkill&&(task.status==='active'||task.enabledToday||task.progress>0));
}

function queueTimedEvents(state) {
  if(state.tutorial?.active&&!state.tutorial.completed)return;
  state.eventCountsByDay??={};
  const eventDay=Math.floor(state.elapsed/24);
  const slotsUsed=()=>state.eventCountsByDay[eventDay]??0;
  const queueMajor=(id)=>{if(slotsUsed()>=2)return false;state.eventCountsByDay[eventDay]=slotsUsed()+1;state.eventQueue.push(id);state.paused=true;return true;};
  const paintTask=state.tasks.find(task=>task.id==='paint');
  const prepTask=state.tasks.find(task=>task.id==='prep');
  const paintIsCurrent=paintTask?.status==='active'||paintTask?.enabledToday||prepTask?.status==='done';
  if (state.elapsed >= 2.2 && state.paintEventOccurs!==false && paintIsCurrent && !state.eventsSeen.includes('paint-change')) {
    state.eventsSeen.push('paint-change');
    queueMajor('paint-change');
  }
  const scheduled=state.eventSchedule?.length?state.eventSchedule:(state.randomEvents??[state.randomEvent??'noise']).map((id,index)=>({id,hour:[2,4.5,7][index%3]+Math.floor(index/3)*24}));
  scheduled.forEach((scheduledEvent,index)=>{
    const seenId=`random-${index}`;
    const event=randomEventById.get(scheduledEvent.id);
    if(state.elapsed>=scheduledEvent.hour&&!state.eventsSeen.includes(seenId)) {
      if(scheduledEvent.occurs===false||slotsUsed()>=2){state.eventsSeen.push(seenId);return;}
      if(!isEventRelevant(state,event)){scheduledEvent.hour=state.elapsed+.65;return;}
      state.eventsSeen.push(seenId);queueMajor(scheduledEvent.id);
    }
  });
  if(state.sceneEffect?.expiresAt&&state.elapsed>=state.sceneEffect.expiresAt) {
    state.sceneEffect=null;
  }
}

export function applyEventChoice(state, eventId, choiceId) {
  const budgetBefore=state.budget;
  if (eventId === 'paint-change') {
    if (choiceId === 'premium') {
      state.budget -= 54;
      state.quality += 5;
      state.trust += 4;
    } else {
      state.quality -= 1;
      state.trust -= 5;
    }
  }
  if (eventId === 'noise') {
    if (choiceId === 'quiet') {
      state.elapsed += 5;
      state.trust += 3;
    } else {
      state.budget -= 28;
      state.trust -= 2;
    }
  }
  if (eventId === 'nephew') {
    if (choiceId === 'decline') {
      state.trust -= 3;
      state.quality += 2;
    } else {
      state.budget -= 44;
      state.quality -= 4;
      state.trust += 4;
    }
  }
  if (eventId === 'delivery') {
    if (choiceId === 'express') {
      state.budget -= 36;
      state.trust += 2;
    } else {
      state.elapsed += 6;
      state.quality += 1;
    }
  }
  if (eventId === 'calendar') {
    if (choiceId === 'reserve') {
      state.budget -= 24;
      state.trust += 2;
    } else {
      state.elapsed += 8;
      state.trust -= 2;
    }
  }
  if (eventId === 'client-ghost') {
    if (choiceId === 'matrix') {
      state.budget -= 8;
      state.trust += 3;
    } else {
      state.elapsed += 7;
      state.trust -= 3;
    }
  }
  if (eventId === 'italian-sofa') {
    if (choiceId === 'local') {
      state.quality -= 1;
      state.trust -= 2;
    } else {
      state.budget -= 62;
      state.elapsed += 3;
      state.quality += 3;
    }
  }
  state.quality = Math.max(0, Math.min(100, state.quality));
  state.trust = Math.max(0, Math.min(100, state.trust));
  const budgetDelta=state.budget-budgetBefore;if(budgetDelta)recordCash(state,budgetDelta>0?'income':'expense','Событие',Math.abs(budgetDelta),eventId);
  state.eventQueue = state.eventQueue.filter((id) => id !== eventId);
  state.paused = false;
}

export function applyCatalogEventChoice(state, event, choiceId) {
  const option=event?.options?.find(item=>item.id===choiceId);
  if(!option) return false;
  const deltas=option.deltas??{};
  state.budget+=deltas.budget??0;
  if(deltas.budget)recordCash(state,deltas.budget>0?'income':'expense','Событие',Math.abs(deltas.budget),event.title);
  state.quality+=deltas.quality??0;
  state.trust+=deltas.trust??0;
  state.elapsed+=deltas.time??0;
  const scene={...(option.scene??{})};
  const duration=Math.max(5,scene.hideHours??8);
  state.sceneEffect={...scene,eventId:event.id,expiresAt:state.elapsed+duration};
  if(scene.hideSkill) {
    for(const crew of state.crews.filter(item=>item.skill===scene.hideSkill)) {
      crew.unavailableUntil=state.elapsed+(scene.hideHours??8);
      if(crew.taskId) {
        const task=state.tasks.find(item=>item.id===crew.taskId);
        if(task&&task.status==='active'){task.status='ready';task.crewId=null;}
        crew.taskId=null;crew.state='away';
      }
    }
  }
  state.quality=Math.max(0,Math.min(100,state.quality));
  state.trust=Math.max(0,Math.min(100,state.trust));
  state.eventQueue=state.eventQueue.filter(id=>id!==event.id);
  state.paused=false;
  state.log.push({type:'event',text:`Решение: ${option.title}`});
  return true;
}

export function attemptHqUpgrade(state, rng = Math.random) {
  return developHeadquarters(state,rng);
}

function updateCrewPositions(state, deltaHours) {
  for (const crew of state.crews) {
    if ((crew.unavailableUntil ?? 0) > state.elapsed) continue;
    if (!crew.taskId) continue;
    const task = state.tasks.find((item) => item.id === crew.taskId);
    if (!task) continue;
    const lerp = Math.min(1, deltaHours * 0.8);
    crew.x += (task.x - crew.x) * lerp;
    crew.y += (task.y - crew.y) * lerp;
  }
}

export function tickState(state, deltaHours) {
  if (!state.started || state.paused || state.completed) return state;
  state.elapsed += deltaHours;
  const currentDay=Math.floor(state.elapsed/24);
  if(state.elapsed>=currentDay*24+9&&(state.reportedDay??-1)<currentDay){state.needsReport=true;state.paused=true;return state;}
  const dayIndex=Math.floor(state.elapsed/24);
  if(dayIndex>state.plannedDay){state.needsPlanning=true;state.paused=true;for(const task of state.tasks)task.enabledToday=false;return state;}
  state.smokeBreak=Math.floor(state.elapsed/8)%4===2;
  updateSituations(state);
  unlockTasks(state);
  assignCrews(state);
  updateCrewPositions(state, deltaHours);

  const barkSlot = Math.floor(state.elapsed / 2.75);
  if (barkSlot > (state.lastBarkSlot ?? 0)) {
    state.lastBarkSlot = barkSlot;
    const activeCrew = state.crews.find((crew) => crew.taskId);
    if (activeCrew) {
      state.log.push({ type: 'bark', text: generateSiteLine(activeCrew.skill, barkSlot + (state.visualSeed ?? 0)) });
    }
  }

  for (const task of state.tasks.filter((item) => item.status === 'active')) {
    const crew = state.crews.find((item) => item.id === task.crewId);
    if (!crew) continue;
    const siteDiscipline=state.smokeBreak&&crew.id!=='foreman'?.82:1;
    const teamControl=state.team?.find(member=>member.id==='pm')?.hired?1:.72;
    task.progress += (deltaHours * crew.speed * siteDiscipline * teamControl) / task.duration;
    if (task.progress >= 1) completeTask(state, task, crew);
  }

  if(state.tutorial?.active&&!state.tutorial.completed) {
    const physical=state.tasks.some(task=>['move','electric','prep','paint','desks'].includes(task.id)&&task.progress>.04);
    if(physical)state.tutorial.observedBuild=true;
    if(state.tutorial.observedBuild&&state.tutorial.chatSent&&state.tasks.some(task=>task.status==='done')) {
      state.tutorial.completed=true;state.tutorial.active=false;
      state.log.push({type:'done',text:'Обучение завершено. С этого момента объект имеет право удивлять.'});
    }
  }

  queueTimedEvents(state);
  if (state.tasks.every((task) => task.status === 'done')) {settleProjectEconomy(state);state.completed = true;}
  return state;
}

export function getRisk(state) {
  if (state.budget < 0) return { level: 'critical', text: 'Бюджет превышен — согласуйте резерв' };
  const readySkills = [...new Set(state.tasks.filter((task) => task.status === 'ready').map((task) => task.skill))];
  const missing = readySkills.find((skill) => !state.crews.some((crew) => crew.skill === skill));
  const labels = { design:'архитектор проекта',documentation:'специалист исполнительной документации',moving: 'перестановщики', paint: 'маляры', electric: 'электрики', furniture: 'сборщики мебели', cleaning: 'клининг' };
  if (missing) return { level: 'warning', text: `Нет бригады: ${labels[missing] ?? missing}` };
  const deadline=state.contract?.deadlineHours??DEADLINE_HOURS;
  const qualityTarget=state.contract?.qualityTarget??78;
  if (state.elapsed > deadline * 0.78 && !state.completed) return { level: 'critical', text: 'Срок под угрозой — ускорьте критические работы' };
  if (state.quality < qualityTarget) return { level: 'warning', text: 'Прогноз качества ниже целевого уровня' };
  return { level: 'safe', text: 'Критических рисков нет' };
}

export function getResult(state) {
  const deadline=state.contract?.deadlineHours??DEADLINE_HOURS;
  const qualityTarget=state.contract?.qualityTarget??78;
  const late = Math.max(0, state.elapsed - deadline);
  let score = 65;
  score += Math.max(-25, Math.min(18, state.budget / 18));
  score += (state.quality - qualityTarget) * 1.2;
  score += (state.trust - 70) * 0.6;
  score -= late * 1.8;
  const grade = score >= 92 ? 'S' : score >= 80 ? 'A' : score >= 67 ? 'B' : score >= 52 ? 'C' : 'D';
  return { score: Math.round(score), grade, late };
}

export function serializeState(state) {
  return JSON.stringify(state);
}

export function restoreState(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.crews)) return null;
    return parsed;
  } catch {
    return null;
  }
}
