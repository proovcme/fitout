import { buildTasksForOrder } from './order-generator.js';
import { WORK_BY_ID } from './work-catalog.js';
import { generateAmbientBeat, generateSiteLine } from './procedural-content.js';
import { SITUATIONS, situationById } from './situations.js';
import { randomEventById } from './events/index.js';
import { activatePortfolioProject, bossArtifactBonus, calculateProductionDelta, ensureGameSaveV2, headquartersBonus, postLedgerEntry, syncActiveProjectToPortfolio } from './company-core.js';

export const INITIAL_BUDGET = 1180;
export const DEADLINE_HOURS = 72;
export const REAL_SECONDS_PER_WORKDAY = 300;
export const GAME_HOURS_PER_REAL_SECOND = 9 / REAL_SECONDS_PER_WORKDAY;
const PROJECT_FINANCE_ACCOUNTING_VERSION = 2;
const CLIENT_PAYMENT_CATEGORIES = new Set([
  'Аванс',
  'Заказчик',
  'Резерв',
  'Допфинансирование заказчика',
  'Этапный платёж',
  'Финальное закрытие',
  'Порешали с финансированием',
]);
const PROJECT_FINANCE_RECONCILIATION_VERSION = 1;

const DEFAULT_ORGANIZATION = {
  name:'ООО «Потом согласуем»',
  cash:320,
  debt:0,
  loans:[],
  arrears:0,
  calendarDay:0,
  paymentsMade:0,
  playerXp:0,
  playerLevel:1,
  reputation:50,
  projectsCompleted:0,
  totalProfit:0,
  inHouseDesign:false,
  history:[],
  contractorClaims:[],
};

export function ensureOrganization(state) {
  ensureGameSaveV2(state);
  const organization=state.company??state.organization??{};
  for(const [key,value] of Object.entries(DEFAULT_ORGANIZATION))if(organization[key]===undefined)organization[key]=Array.isArray(value)?[...value]:value;
  state.company=organization;state.organization=organization;
  state.organization.history??=[];
  state.organization.loans??=[];
  state.organization.calendarDay??=0;
  state.organization.arrears??=0;
  state.organization.paymentsMade??=0;
  state.organization.playerXp??=state.organization.projectsCompleted*90;
  state.organization.staffXp??={};
  state.organization.contractorXp??={};
  state.organization.contractorClaims??=[];
  if(!state.organization.loans.length&&state.organization.debt>0) {
    const remaining=Math.round(state.organization.debt);
    state.organization.loans.push({id:`legacy-${Date.now()}`,principal:remaining,remaining,monthlyPayment:Math.max(24,Math.ceil(remaining/12)),rate:0,termMonths:12,nextDueMonth:Math.floor(state.organization.calendarDay/30)+1,arrears:0,label:'Старый долг'});
  }
  state.organization.debt=Math.round(state.organization.loans.reduce((sum,loan)=>sum+Math.max(0,loan.remaining??0),0));
  state.organization.playerLevel=Math.max(1,Math.min(10,1+Math.floor((state.organization.playerXp+(state.hq?.level??0)*80)/150)));
  return state.organization;
}

export function takeOrganizationLoan(state,principal,requestedRecipient='auto') {
  const organization=ensureOrganization(state);
  if(![300,800].includes(principal))return {ok:false,reason:'amount'};
  const rate=principal===300 ? .16 : .22;
  const termMonths=principal===300?12:18;
  const monthlyRate=rate/12;
  const monthlyPayment=Math.ceil(principal*monthlyRate*Math.pow(1+monthlyRate,termMonths)/(Math.pow(1+monthlyRate,termMonths)-1));
  const repayment=monthlyPayment*termMonths;
  if(organization.debt+repayment>2400+headquartersBonus(state,'creditLimit'))return {ok:false,reason:'credit-limit'};
  const activeProject=Boolean(state.selectedOrder)&&!state.completed&&['negotiation','preparation','schedule','planning','execution'].includes(state.phase);
  const recipient=requestedRecipient==='organization'?'organization':requestedRecipient==='project'&&activeProject?'project':activeProject?'project':'organization';
  if(recipient==='project'){state.budget+=principal;recordCash(state,'income','Кредит организации',principal,'Мостовое финансирование текущего объекта');}
  else postLedgerEntry(state,{type:'income',category:'Кредит',amount:principal,text:`Получен ${principal===300?'оборотный':'проектный'} кредит`});
  const loan={id:`loan-${Date.now()}-${organization.loans.length}`,principal,remaining:repayment,monthlyPayment,rate,termMonths,nextDueMonth:Math.floor(organization.calendarDay/30)+1,arrears:0,label:principal===300?'Оборотный 300К':'Проектный 800К'};
  organization.loans.push(loan);organization.debt+=repayment;
  organization.history.unshift({type:'loan',amount:principal,repayment,monthlyPayment,recipient,at:Date.now()});
  organization.history=organization.history.slice(0,30);
  return {ok:true,principal,repayment,rate,termMonths,monthlyPayment,recipient};
}

export function ensureProjectFinance(state) {
  state.finance??={ledger:[],contractValue:state.contract?.budget??0,received:0,spent:0};
  const finance=state.finance;
  finance.ledger??=[];
  finance.contractValue??=state.contract?.budget??0;
  finance.received??=0;
  finance.spent??=0;
  if(finance.accountingVersion!==PROJECT_FINANCE_ACCOUNTING_VERSION) {
    const legacyTotalIncome=Math.max(0,Number(finance.totalIncome??finance.received) || 0);
    const knownNonClientIncome=finance.ledger.reduce((sum,row)=>sum+(row.type==='income'&&!CLIENT_PAYMENT_CATEGORIES.has(row.category)?Math.max(0,Number(row.amount)||0):0),0);
    const knownClientIncome=finance.ledger.reduce((sum,row)=>sum+(row.type==='income'&&CLIENT_PAYMENT_CATEGORIES.has(row.category)?Math.max(0,Number(row.amount)||0):0),0);
    const inferredClientIncome=Math.max(knownClientIncome,legacyTotalIncome-knownNonClientIncome);
    finance.totalIncome=legacyTotalIncome;
    finance.received=Math.min(Math.max(0,finance.contractValue),Math.max(0,inferredClientIncome));
    finance.advanceReceived=finance.advanceReceived??Math.min(finance.received,Math.max(0,Math.round(finance.contractValue*.45)));
    finance.accountingVersion=PROJECT_FINANCE_ACCOUNTING_VERSION;
  }
  finance.totalIncome=Math.max(finance.received,Number(finance.totalIncome)||0);
  finance.advanceReceived=Math.min(finance.received,Math.max(0,Number(finance.advanceReceived)||0));
  if(finance.reconciliationVersion!==PROJECT_FINANCE_RECONCILIATION_VERSION&&Array.isArray(state.tasks)) {
    const contractValue=Math.max(0,finance.contractValue??0);const retention=Math.round(contractValue*.15);
    const payableTasks=state.tasks.filter(item=>!item.reworkOf&&!['executive-docs','inspect'].includes(item.id)&&item.status!=='skipped');
    const totalWeight=payableTasks.reduce((sum,item)=>sum+Math.max(1,item.cost??1),0);const stagePool=Math.max(0,contractValue-retention-finance.advanceReceived);
    const earnedStage=payableTasks.filter(item=>item.status==='done').reduce((sum,item)=>sum+(totalWeight?Math.round(stagePool*Math.max(1,item.cost??1)/totalWeight):0),0);
    const alreadyPaidStage=Math.max(0,finance.received-finance.advanceReceived);const available=Math.max(0,contractValue-retention-finance.received);
    const catchupPayment=Math.min(available,Math.max(0,earnedStage-alreadyPaidStage));
    if(catchupPayment>0) {
      state.budget=(state.budget??0)+catchupPayment;finance.received+=catchupPayment;finance.totalIncome+=catchupPayment;
      finance.ledger.unshift({hour:state.elapsed??0,type:'income',category:'Этапный платёж',amount:Math.round(catchupPayment),text:'Перерасчёт ранее принятых работ'});finance.ledger=finance.ledger.slice(0,80);
      finance.migrationAdjustment=(finance.migrationAdjustment??0)+catchupPayment;
    }
    finance.reconciliationVersion=PROJECT_FINANCE_RECONCILIATION_VERSION;
  }
  return finance;
}

export function advanceOrganizationDays(state,days) {
  const organization=ensureOrganization(state);
  const safeDays=Math.max(0,Math.floor(days));
  if(!safeDays)return {monthsProcessed:0,paid:0,missed:0,penalty:0};
  const startMonth=Math.floor(organization.calendarDay/30);
  organization.calendarDay+=safeDays;
  const endMonth=Math.floor(organization.calendarDay/30);
  const summary={monthsProcessed:0,paid:0,missed:0,penalty:0};
  for(let month=startMonth+1;month<=endMonth;month++) {
    summary.monthsProcessed+=1;
    for(const loan of organization.loans) {
      if((loan.remaining??0)<=0||(loan.nextDueMonth??1)>month)continue;
      const due=Math.min(loan.remaining,loan.monthlyPayment+(loan.arrears??0));
      const paid=Math.min(Math.max(0,organization.cash),due);
      if(paid)postLedgerEntry(state,{type:'expense',category:'Кредит',amount:paid,counterparty:'Банк',text:`Ежемесячный платёж: ${loan.label}`});loan.remaining-=paid;summary.paid+=paid;organization.paymentsMade+=paid;
      const missed=Math.max(0,due-paid);
      if(missed>0){const penalty=Math.max(1,Math.ceil(missed*.02));loan.arrears=missed;loan.remaining+=penalty;summary.missed+=missed;summary.penalty+=penalty;organization.reputation=Math.max(0,organization.reputation-4);}
      else loan.arrears=0;
      loan.nextDueMonth=month+1;
      organization.history.unshift({type:missed?'loan-missed':'loan-payment',loanId:loan.id,amount:paid,due,missed,month,at:Date.now()});
    }
  }
  organization.loans=organization.loans.filter(loan=>(loan.remaining??0)>.01);
  organization.arrears=Math.round(organization.loans.reduce((sum,loan)=>sum+Math.max(0,loan.arrears??0),0));
  organization.debt=Math.round(organization.loans.reduce((sum,loan)=>sum+Math.max(0,loan.remaining??0),0));
  organization.history=organization.history.slice(0,30);
  return summary;
}

function syncOrganizationCalendar(state,includeCurrentDay=false) {
  const organization=ensureOrganization(state);
  const elapsedDays=Math.floor((state.elapsed??0)/24)+(includeCurrentDay?1:0);
  state.organizationCalendarStartDay??=Math.max(0,organization.calendarDay-Math.floor((state.elapsed??0)/24));
  const targetDay=state.organizationCalendarStartDay+elapsedDays;
  return advanceOrganizationDays(state,Math.max(0,targetDay-organization.calendarDay));
}

export function settleProjectEconomy(state) {
  const organization=ensureOrganization(state);
  if(state.projectSettlement)return state.projectSettlement;
  const loanSummary=syncOrganizationCalendar(state,true);
  const finance=ensureProjectFinance(state);
  const outstandingContractorSettlements=(state.contractors??[]).reduce((sum,contractor)=>{
    if((contractor.settlementDue??0)>0)registerUnpaidContractorClaim(state,contractor);
    return sum+Math.max(0,contractor.settlementDue??0);
  },0);
  const cashTransfer=Math.max(0,Math.round(state.budget));const profit=Math.round((finance.received??0)-(finance.spent??0)-(state.organizationMobilization??0)-outstandingContractorSettlements);
  if(cashTransfer>0)postLedgerEntry(state,{type:'income',category:'Результат объекта',amount:cashTransfer,projectId:state.selectedOrder?.id,text:`Остаток средств объекта: ${state.selectedOrder?.title??'объект'}`});
  organization.totalProfit+=profit;
  organization.projectsCompleted+=1;
  organization.reputation=Math.max(0,Math.min(100,organization.reputation+Math.round((state.trust-65)/8)+(state.quality>=(state.contract?.qualityTarget??78)?3:-4)));
  const deadline=state.contract?.deadlineHours??DEADLINE_HOURS;const qualityTarget=state.contract?.qualityTarget??78;
  const gainedXp=55+(state.elapsed<=deadline?35:0)+(state.quality>=qualityTarget?30:0)+Math.max(0,Math.round((state.trust-50)/4));
  organization.playerXp+=gainedXp;organization.playerLevel=Math.max(1,Math.min(10,1+Math.floor((organization.playerXp+(state.hq?.level??0)*80)/150)));
  for(const member of state.team?.filter(item=>item.hired)??[])organization.staffXp[member.id]=(organization.staffXp[member.id]??0)+1;
  for(const contractor of state.contractors?.filter(item=>item.hired)??[])organization.contractorXp[contractor.id]=(organization.contractorXp[contractor.id]??0)+1;
  const debtPayment=loanSummary.paid;
  const settlement={profit,cashTransfer,debtPayment,organizationCash:organization.cash,loanSummary,gainedXp,playerLevel:organization.playerLevel};
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
  postLedgerEntry(state,{type:'expense',category:'Свой офис',amount:cost,text:'Попытка улучшения штаба'});state.hq.attempts+=1;
  const titles=['Стол у принтера','Кабинет без окна','Комната с фикусом','Почти настоящий офис','Офис, который не стыдно показать'];
  const failures=['Арендодатель передумал после слова «переговорка».','Выбрали помещение. В нём уже живёт бухгалтерия.','Дизайнер потратил бюджет на мудборд из бетона.','Кресло приехало. Офис — нет.','Согласовали планировку, но не нашли вход.'];
  const chance=Math.min(.58,.28+organization.reputation*.003);
  const success=rng()<chance&&state.hq.level<titles.length-1;
  if(success){state.hq.level+=1;state.hq.title=titles[state.hq.level];state.hq.lastFailure='Невероятно: улучшение пережило согласование.';}
  else state.hq.lastFailure=failures[Math.floor(rng()*failures.length)];
  organization.history.unshift({type:'hq',amount:cost,success,at:Date.now()});organization.history=organization.history.slice(0,30);
  organization.playerLevel=Math.max(1,Math.min(10,1+Math.floor((organization.playerXp+(state.hq?.level??0)*80)/150)));
  return {ok:true,success,cost,...state.hq};
}

export function toggleInHouseDesign(state){
  const organization=ensureOrganization(state);const activeProject=Boolean(state.selectedOrder)&&state.started&&!state.completed;
  if(activeProject)return {ok:false,reason:'active-project'};
  if(!organization.inHouseDesign){const cost=240;if((state.hq?.level??0)<2)return {ok:false,reason:'hq-level',cost};if(organization.cash<cost)return {ok:false,reason:'cash',cost};postLedgerEntry(state,{type:'expense',category:'Проектный отдел',amount:cost,text:'Запуск собственного проектного отдела'});organization.inHouseDesign=true;organization.history.unshift({type:'staff',role:'design',amount:cost,active:true,at:Date.now()});ensureRuntimeCrews(state);return {ok:true,active:true,cost,dailyCost:12};}
  organization.inHouseDesign=false;state.crews=state.crews.filter(crew=>crew.id!=='inhouse-design');organization.history.unshift({type:'staff',role:'design',amount:0,active:false,at:Date.now()});return {ok:true,active:false,cost:0,dailyCost:0};
}

export const TASK_BLUEPRINTS = [
  { id: 'survey', title: 'Зафиксировать состояние', short: 'Обход', skill: 'management', x: 1, y: 5, duration: 4, cost: 18, quality: 1, deps: [], priority: 3, color: '#b7c7b8' },
  { id: 'project', title: 'Выпустить рабочий проект', short: 'Проект', skill: 'design', x: 2, y: 3, duration: 12, cost: 72, quality: 5, deps: ['survey'], priority: 3, color: '#a58ae1' },
  { id: 'move', title: 'Освободить open space', short: 'Вынос и перенос', skill: 'general', x: 3, y: 4, duration: 10, cost: 86, quality: 2, deps: ['survey'], priority: 2, color: '#e9ad52' },
  { id: 'electric', title: 'Перенести розетки', short: 'Электрика', skill: 'electric', x: 6, y: 2, duration: 12, cost: 128, quality: 4, deps: ['survey'], priority: 2, color: '#69bfe8' },
  { id: 'prep', title: 'Подготовить стены', short: 'Подготовка', skill: 'paint', x: 2, y: 1, duration: 13, cost: 92, quality: 4, deps: ['move'], hardDeps:['move'], priority: 2, color: '#d48f72' },
  { id: 'paint', title: 'Покрасить переговорную', short: 'Покраска', skill: 'paint', x: 1, y: 1, duration: 18, cost: 176, quality: 7, deps: ['prep'], hardDeps:['prep'], priority: 2, color: '#d87561' },
  { id: 'desks', title: 'Собрать 24 рабочих места', short: 'Мебель', skill: 'furniture', x: 5, y: 4, duration: 22, cost: 238, quality: 6, deps: ['move', 'electric'], hardDeps:['move'], priority: 2, color: '#9d85d8' },
  { id: 'clean', title: 'Финишная уборка', short: 'Клининг', skill: 'cleaning', x: 7, y: 5, duration: 8, cost: 54, quality: 4, deps: ['paint', 'desks'], priority: 1, color: '#62cba0' },
  { id: 'executive-docs', title: 'Собрать исполнительную документацию', short: 'Исполнительная', skill: 'documentation', x: 6, y: 5, duration: 10, cost: 34, quality: 5, deps: ['electric','paint','desks'], priority: 2, color: '#69daa9' },
  { id: 'inspect', title: 'Приёмка и дефектовка', short: 'Приёмка', skill: 'management', x: 4, y: 2, duration: 5, cost: 12, quality: 5, deps: ['clean','executive-docs'], priority: 1, color: '#ddff55' },
];

export const CONTRACTOR_BLUEPRINTS = [
  { id: 'designers', name: 'Проектировщики', company: 'Линия допуска', skill: 'design', manpower:2, price: 82, rating: 88, speed: 1.03, quality: 1.08, color: '#a58ae1', initials: 'ЛД', quirk: 'Каждый лист имеет собственное мнение' },
  { id: 'builders', name: 'Общестрой', company: 'Контур плюс', skill: 'construction', manpower:7, price: 96, rating: 87, speed: 1.02, quality: 1.03, color: '#b6976c', initials: 'КП', quirk: 'Уровень есть. Иногда даже строительный' },
  { id: 'engineers', name: 'Инженерные сети', company: 'Труба и данные', skill: 'engineering', manpower:5, price: 94, rating: 89, speed: 1.04, quality: 1.06, color: '#5aaecf', initials: 'ТД', quirk: 'Все сети хотят пройти в одном лотке' },
  { id: 'movers', name: 'Подсобные работы', company: 'Руки на месте', skill: 'general', manpower:5, price: 42, rating: 86, speed: .94, quality: .91, color: '#e9ad52', initials: 'РМ', quirk: 'Укрывают, носят, складируют и знают короткий путь к контейнеру' },
  { id: 'painters', name: 'Маляры', company: 'Ровный слой', skill: 'paint', manpower:4, price: 68, rating: 92, speed: 1.05, quality: 1.06, color: '#d87561', initials: 'РС', quirk: 'RAL помнят на глаз' },
  { id: 'electricians', name: 'Электрики', company: 'Фаза Ноль', skill: 'electric', manpower:3, price: 54, rating: 89, speed: 1.08, quality: 1.02, color: '#69bfe8', initials: 'ФН', quirk: 'Им всегда нужен доступ' },
  { id: 'assemblers', name: 'Сборщики', company: 'Модуль Бюро', skill: 'furniture', manpower:6, price: 76, rating: 84, speed: 1.18, quality: 0.98, color: '#9d85d8', initials: 'МБ', quirk: 'Инструкция — слабость' },
  { id: 'cleaners', name: 'Клининг', company: 'Чистый лист', skill: 'cleaning', manpower:5, price: 34, rating: 90, speed: 1.12, quality: 1.04, color: '#62cba0', initials: 'ЧЛ', quirk: 'На сдаче незаменимы' },
];

const CONTRACTOR_CLASSES={
  economy:{label:'ЭКОНОМ',price:.68,speed:.82,quality:.88,rating:-14,manpower:2,suffix:' Лайт',color:'#e7a446'},
  standard:{label:'СТАНДАРТ',price:1,speed:1,quality:1,rating:0,manpower:0,suffix:'',color:null},
  premium:{label:'ПРЕМИУМ',price:1.72,speed:1.22,quality:1.12,rating:7,manpower:-1,suffix:' Профи',color:'#5fc5dd'},
  rush:{label:'ШТУРМ',price:1.34,speed:1.38,quality:.93,rating:-3,manpower:3,suffix:' 24/7',color:'#f06e5f'},
  craft:{label:'ПЕДАНТЫ',price:1.46,speed:.84,quality:1.2,rating:5,manpower:-1,suffix:' ГОСТ',color:'#8e78d8'},
};
const CONTRACTOR_QUIRKS={economy:['Смета на салфетке, зато сразу','Инструмент общий, мнение у каждого своё','Обещают выйти всем составом. Состав не назван'],standard:['Знают, где лежит журнал работ','Спорят только после аванса','Приезжают на этот адрес со второй попытки'],premium:['Просят BIM, даже когда нужна кисть','Присылают отчёт раньше вопроса','У них есть менеджер по менеджеру'],rush:['Работают быстро, акты догоняют','Ночная смена считает себя дневной','Перфоратор заряжен, план уточняется'],craft:['Меряют дважды, потом ещё раз','Не подпишут узел, который им не нравится','Знают ГОСТ по номеру и по настроению']};

export function createContractorMarket() {
  return CONTRACTOR_BLUEPRINTS.flatMap((base,baseIndex)=>Object.entries(CONTRACTOR_CLASSES).map(([contractClass,tuning],classIndex)=>({
    ...base,
    id:contractClass==='standard'?base.id:`${base.id}-${contractClass}`,
    company:`${base.company}${tuning.suffix}`,
    price:Math.max(18,Math.round(base.price*tuning.price)),
    rating:Math.max(55,Math.min(99,base.rating+tuning.rating)),
    speed:base.speed*tuning.speed,
    quality:base.quality*tuning.quality,
    manpower:Math.max(2,base.manpower+tuning.manpower),
    color:tuning.color??base.color,
    contractClass,classLabel:tuning.label,quirk:CONTRACTOR_QUIRKS[contractClass][(baseIndex+classIndex)%CONTRACTOR_QUIRKS[contractClass].length],
    hired:false,
  })));
}

export function ensureWorkforceMarket(state) {
  const existing=new Map((state.contractors??[]).map(item=>[item.id,item]));
  const current=createContractorMarket().map(item=>{
    const merged={...item,...(existing.get(item.id)??{})};
    if(item.id==='movers'||item.id.startsWith('movers-'))Object.assign(merged,{name:item.name,skill:'general',initials:item.initials});
    return merged;
  });
  const legacyDemolition=[...existing.values()].filter(item=>item.id==='demolition'||item.id.startsWith('demolition-')).map(item=>({...item,name:'Общестрой и демонтаж',skill:'construction'}));
  state.contractors=[...current,...legacyDemolition];
  for(const relation of state.contractorNetwork??[]){
    if(relation.specialty==='moving')relation.specialty='general';
    if(relation.specialty==='demolition')relation.specialty='construction';
  }
  for(const member of state.team??[])member.level=Math.max(1,Math.min(5,1+Math.floor((state.organization?.staffXp?.[member.id]??0)/2)));
  for(const contractor of state.contractors)contractor.level=Math.max(1,Math.min(5,1+Math.floor((state.organization?.contractorXp?.[contractor.id]??0)/2)));
  return state;
}

export function ensureRuntimeCrews(state){
  const taskSkills={move:'general','demo-partitions':'construction','demo-equipment':'engineering','demo-floor':'paint','demo-ceiling':'paint'};
  for(const task of state.tasks??[]){
    if(taskSkills[task.id])task.skill=taskSkills[task.id];
    if(['demo-partitions','demo-equipment','demo-ceiling'].includes(task.id)){
      task.deps=(task.deps??[]).filter(id=>id!=='temporary-networks');
      task.hardDeps=(task.hardDeps??[]).filter(id=>id!=='temporary-networks');
    }
  }
  for(const contractor of state.contractors??[]){if(contractor.skill==='moving')Object.assign(contractor,{skill:'general',name:'Подсобные работы'});if(contractor.skill==='demolition')Object.assign(contractor,{skill:'construction',name:'Общестрой и демонтаж'});}
  for(const contractor of state.contractors?.filter(item=>item.hired)??[]){
    contractor.settlementDue??=0;
    contractor.settlementEarned??=state.tasks?.some(task=>task.lastCrewId===`crew-${contractor.id}`)??false;
  }
  state.crews??=[];
  for(const crew of state.crews){if(crew.skill==='moving')Object.assign(crew,{skill:'general',role:'Подсобные рабочие'});if(crew.skill==='demolition')Object.assign(crew,{skill:'construction',role:'Монтажники общестроя'});}
  if(state.sceneEffect?.eventId==='boss-borrows-brigade'&&state.sceneEffect.hideScope!=='company'){
    state.sceneEffect.hideScope='company';
    for(const crew of state.crews.filter(item=>item.id.startsWith('crew-')&&item.skill===state.sceneEffect.hideSkill))crew.unavailableUntil=Math.min(crew.unavailableUntil??state.elapsed,state.elapsed);
  }
  if(!state.crews.some(crew=>crew.id==='foreman'))state.crews.unshift({id:'foreman',name:'Вы',role:'Генеральный директор',skill:'management',color:'#ddff55',initials:'ГД',speed:.7,quality:.92,taskId:null,x:4,y:6,state:'idle'});
  const player=state.crews.find(crew=>crew.id==='foreman');Object.assign(player,{name:'Вы',role:'Генеральный директор',skill:'management',initials:'ГД',speed:.7,quality:.92});
  if(!state.crews.some(crew=>crew.id==='general-crew'))state.crews.push({id:'general-crew',name:'Хозбригада «Сами справимся»',role:'Универсальная штатная бригада',skill:'general',color:'#9aa89d',initials:'ХБ',speed:.52,quality:.78,manpower:4,taskId:null,x:7,y:7,state:'idle',level:1});
  else state.crews.find(crew=>crew.id==='general-crew').manpower??=4;
  for(const member of state.team??[])if(member.hired&&!state.crews.some(crew=>crew.id===`team-${member.id}`))state.crews.push(makeTeamRuntimeCrew(member));
  if(ensureOrganization(state).inHouseDesign&&!state.crews.some(crew=>crew.id==='inhouse-design'))state.crews.push({id:'inhouse-design',name:'Проектный отдел организации',role:'Штатные проектировщики',skill:'design',color:'#a58ae1',initials:'ПО',speed:1.08,quality:1.1,manpower:3,baseManpower:3,taskId:null,x:2,y:3,state:'idle',level:2});
  state.playerAvatar??={color:'#ddff55',outfit:'vest',helmet:'classic'};
  state.playerZoneTaskId??=null;
  state.siteDirt=THREELESS_CLAMP(Number(state.siteDirt??0),0,100);
  state.magicResolve??={lastAt:-1e9,attempts:0};
  if(!Number.isFinite(state.magicResolve.lastAt))state.magicResolve.lastAt=-1e9;
  return state;
}

export const TEAM_BLUEPRINTS = [
  { id:'pm',name:'Алина Ветрова',role:'Руководитель проекта',price:92,effect:'Подрядчики соблюдают ваши приоритеты',initials:'АВ',color:'#ddff55' },
  { id:'supervision',name:'Борис Тихонов',role:'Технический надзор',price:74,effect:'Меньше скрытых дефектов и переделок',initials:'БТ',color:'#69bfe8' },
  { id:'procurement',name:'Катя Руднева',role:'Комплектатор',price:58,effect:'Поставки и замены обходятся дешевле',initials:'КР',color:'#d87561' },
  { id:'designer',name:'Мария Корнилова',role:'Главный архитектор',price:88,effect:'Выпускает рабочий проект и защищает решения',initials:'МК',color:'#a58ae1',skill:'design' },
  { id:'doc-control',name:'Семён Актов',role:'Специалист ИД',price:64,effect:'Собирает акты, схемы и паспорта до приёмки',initials:'СА',color:'#69daa9',skill:'documentation' },
];

function makeTeamRuntimeCrew(member){
  const level=Math.max(1,Math.min(5,member.level??1));const specialist=Boolean(member.skill);
  return {id:`team-${member.id}`,name:member.name,role:member.role,skill:member.skill??'support',color:member.color,initials:member.initials,speed:specialist?1.02+(level-1)*.035:1,quality:specialist?1.08+(level-1)*.025:1.04,taskId:null,x:specialist?8:7,y:specialist?7:6,state:specialist?'idle':'patrol',level,...(!specialist?{supportRole:member.id}:{})};
}

const RANDOM_EVENTS = ['noise', 'nephew', 'delivery', 'calendar', 'client-ghost', 'italian-sofa'];

function pickRandomEvents(eventCatalog, rng, count = 12) {
  const normalized=eventCatalog.map(item=>typeof item==='string'?{id:item,minHour:0,weight:1}:item);
  const picked=[];
  while(picked.length<count) {
    const slot=Math.floor(picked.length/5)*24+[2,3.5,5,6.5,8][picked.length%5];
    let available=normalized.filter(item=>(item.minHour??0)<=slot&&!picked.includes(item.id));
    if(picked.length===2&&normalized.some(item=>item.beneficial&&!picked.includes(item.id)))available=available.filter(item=>item.beneficial);
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
  const windows=[[1.25,2.05],[2.55,3.45],[4.1,5.05],[5.8,6.75],[7.35,8.35]];
  return eventIds.map((id,index)=>{
    const day=Math.floor(index/5);const [start,end]=windows[index%5];
    const randomHour=day*24+start+rng()*(end-start);
    const weight=catalog.get(id)?.weight??5;
    const probability=Math.max(.42,Math.min(.9,.36+weight*.062));
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
  return state.tasks.filter(task=>!['done','skipped','active','awaiting'].includes(task.status)&&task.plannedStartDay<=dayIndex).sort((a,b)=>a.scheduleOrder-b.scheduleOrder);
}

export function captureMasterSchedule(state) {
  ensureMasterSchedule(state);
  return state.tasks.map(task=>({id:task.id,start:task.plannedStartDay,finish:task.plannedFinishDay,order:task.scheduleOrder}));
}

export function resolveScheduleRevision(state,mode,snapshot,rng=Math.random) {
  const before=new Map((snapshot??[]).map(item=>[item.id,item]));
  const changed=state.tasks.filter(task=>{
    const old=before.get(task.id);
    return old&&!['done','active','awaiting'].includes(task.status)&&(old.start!==task.plannedStartDay||old.finish!==task.plannedFinishDay||old.order!==task.scheduleOrder);
  });
  const restore=()=>{for(const task of state.tasks){const old=before.get(task.id);if(old&&!['done','active','awaiting'].includes(task.status)){task.plannedStartDay=old.start;task.plannedFinishDay=old.finish;task.scheduleOrder=old.order;}}};
  const history=state.scheduleRevisionHistory??=[];
  if(!changed.length){const result={ok:true,mode:'none',changed:0,approved:true,detected:false};history.unshift({...result,day:Math.floor(state.elapsed/24)});state.scheduleRevisionHistory=history.slice(0,20);return result;}
  const conflicts=changed.filter(task=>task.deps.some(id=>(state.tasks.find(item=>item.id===id)?.plannedFinishDay??0)>task.plannedStartDay)).length;
  const acceleration=changed.reduce((sum,task)=>sum+Math.max(0,(before.get(task.id)?.start??task.plannedStartDay)-task.plannedStartDay),0);
  let result={ok:true,mode,changed:changed.length,approved:true,detected:false,conflicts,acceleration};
  if(mode==='restore') {
    restore();result.approved=false;result.restored=true;
  } else if(mode==='client') {
    if(state.selectedOrder?.fixedContract){restore();result.approved=false;result.restored=true;result.legal=true;state.trust=Math.max(0,state.trust-3);state.log.push({type:'risk',text:'Госзаказчик отклонил изменение фиксированного графика без рассмотрения.'});history.unshift({...result,day:Math.floor(state.elapsed/24)});state.scheduleRevisionHistory=history.slice(0,20);return result;}
    const chance=Math.max(.2,Math.min(.88,.34+state.trust*.005+Math.min(.18,acceleration*.025)-conflicts*.09+(state.budget>=0?.06:-.07)));
    result.chance=chance;result.approved=rng()<chance;
    if(result.approved){state.trust=Math.min(100,state.trust+2);state.log.push({type:'done',text:`Заказчик согласовал вечернюю корректировку: ${changed.length} работ`});}
    else{restore();state.trust=Math.max(0,state.trust-2);result.restored=true;state.log.push({type:'risk',text:'Заказчик отклонил новый график. Возвращена согласованная версия.'});}
  } else if(mode==='secret') {
    const pm=state.team?.some(member=>member.id==='pm'&&member.hired);
    const discoveryChance=Math.max(.12,Math.min(.9,.2+changed.length*.035+conflicts*.11+(pm?-.08:0)+(state.selectedOrder?.fixedContract?.28:0)));
    result.chance=discoveryChance;result.detected=rng()<discoveryChance;
    if(result.detected){state.trust=Math.max(0,state.trust-(state.selectedOrder?.fixedContract?20:8));state.quality=Math.max(0,state.quality-1);if(state.selectedOrder?.fixedContract){state.budget-=100;ensureOrganization(state).reputation=Math.max(0,ensureOrganization(state).reputation-12);state.sceneEffect={actor:'police',actorCount:2,expiresAt:state.elapsed+7,eventId:'state-contract-audit'};state.log.push({type:'risk',text:'Тихую правку госграфика нашли. На объект выехали люди, которые не используют эмодзи.'});}else state.log.push({type:'risk',text:'Заказчик заметил, что график тихо переписали после отчёта.'});}
    else state.log.push({type:'done',text:`Тихая корректировка прошла незамеченной: ${changed.length} работ`});
  } else {
    restore();result={...result,ok:false,approved:false,restored:true,reason:'mode'};
  }
  history.unshift({...result,day:Math.floor(state.elapsed/24)});state.scheduleRevisionHistory=history.slice(0,20);
  return result;
}

export function requestClientFunding(state,rng=Math.random) {
  const day=Math.floor((state.elapsed??0)/24);
  state.clientFundingRequests??=[];
  if(state.selectedOrder?.fixedContract)return {ok:false,reason:'fixed-contract'};
  if(state.clientFundingRequests.some(item=>item.day===day))return {ok:false,reason:'already-requested'};
  const done=state.tasks?.filter(task=>task.status==='done').length??0;
  const progress=done/Math.max(1,state.tasks?.length??1);
  const amount=Math.max(35,Math.min(180,Math.round(((state.contract?.budget??800)*(.045+progress*.035))/5)*5));
  const chance=Math.max(.18,Math.min(.86,.22+state.trust*.005+progress*.28+(state.budget<0?.1:0)));
  const approved=rng()<chance;
  const result={ok:true,approved,amount:approved?amount:0,requested:amount,chance,day};
  if(approved){state.budget+=amount;state.contract.budget+=amount;ensureProjectFinance(state).contractValue+=amount;state.trust=Math.max(0,state.trust-3);recordCash(state,'income','Допфинансирование заказчика',amount,'Согласованный дополнительный резерв',{clientPayment:true});state.log.push({type:'done',text:`Заказчик открыл дополнительный резерв ${amount}К`});}
  else{state.trust=Math.max(0,state.trust-2);state.log.push({type:'risk',text:'Заказчик ответил, что деньги уже были в исходном бюджете.'});}
  state.clientFundingRequests.unshift(result);state.clientFundingRequests=state.clientFundingRequests.slice(0,20);
  return result;
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
    preparationConfirmed: false,
    startupMaterials: { ordered: false, orderId: null, amount: 0, deliveryDay: null, taskIds: [] },
    selectedTaskId: null,
    tasks: TASK_BLUEPRINTS.map((task) => ({ ...task, progress: 0, status: 'locked', crewId: null, committed: false })),
    contractors: createContractorMarket(),
    team: TEAM_BLUEPRINTS.map((member)=>({...member,hired:false})),
    finance:{ledger:[{hour:0,type:'income',category:'Аванс',amount:INITIAL_BUDGET,text:'Стартовое финансирование'}],contractValue:INITIAL_BUDGET,received:INITIAL_BUDGET,totalIncome:INITIAL_BUDGET,advanceReceived:INITIAL_BUDGET,spent:0,accountingVersion:PROJECT_FINANCE_ACCOUNTING_VERSION,reconciliationVersion:PROJECT_FINANCE_RECONCILIATION_VERSION},
    crews: [
      { id: 'foreman', name: 'Вы', role: 'Генеральный директор', skill: 'management', color: '#ddff55', initials: 'ГД', speed: .7, quality: .92, taskId: null, x: 4, y: 6, state: 'idle' },
      { id: 'general-crew', name: 'Хозбригада «Сами справимся»', role: 'Универсальная штатная бригада', skill: 'general', color: '#9aa89d', initials: 'ХБ', speed: .52, quality: .78, manpower:4, taskId: null, x: 7, y: 7, state: 'idle',level:1 },
    ],
    plannedDay: 0,
    needsPlanning: false,
    reportedDay: -1,
    needsReport: false,
    activeSituations:[],
    situationCount:0,
    nextSituationAt:1.35,
    eventsSeen: [],
    eventCountsByDay:{},
    paintEventOccurs:rng()<.55,
    eventQueue: [],
    nextMajorEventAt:0,
    lastBarkSlot: 0,
    randomEvent: randomEvents[0],
    randomEvents,
    eventSchedule: scheduleRandomEvents(randomEvents,eventCatalog,rng),
    sceneEffect: null,
    ambientBeat:null,
    ambientBeatCount:0,
    ambientHistory:[],
    nextAmbientBeatAt:.75+rng()*.55,
    hq: {
      level: 0,
      title: 'Стол у принтера',
      attempts: 0,
      lastFailure: 'Зато принтер греет зимой',
    },
    playerAvatar:{color:'#ddff55',outfit:'vest',helmet:'classic'},
    playerZoneTaskId:null,
    siteDirt:0,
    magicResolve:{lastAt:-1e9,attempts:0},
    tutorial:null,
    organization:{...DEFAULT_ORGANIZATION,history:[],loans:[],staffXp:{},contractorXp:{}},
    log: [],
  };
  ensureMasterSchedule(initialState);
  ensureGameSaveV2(initialState);
  return initialState;
}

export function selectOrder(state, order) {
  if (!order || state.started) return false;
  const organization=ensureOrganization(state);
  ensureRuntimeCrews(state);
  if((order.requiresProjects??0)>organization.projectsCompleted)return false;
  if((order.requiredLevel??1)>organization.playerLevel)return false;
  const mobilizationCost=Math.max(12,Math.min(140,Math.round(order.area/28+order.complexity*8)));
  if(organization.cash<mobilizationCost)return false;
  postLedgerEntry(state,{type:'expense',category:'Тендер и мобилизация',amount:mobilizationCost,projectId:order.id,text:`Выход на переговоры: ${order.title}`});
  organization.history.unshift({type:'bid',title:order.title,amount:mobilizationCost,at:Date.now()});organization.history=organization.history.slice(0,30);
  state.selectedOrder = { ...order, tasks: undefined };
  state.organizationCalendarStartDay=organization.calendarDay;
  state.phase = 'negotiation';
  state.contract = {
    budget: order.budget,
    deadlineHours: order.deadlineHours,
    qualityTarget: order.qualityTarget,
    cardsPlayed: [],
    proposalBudgetPct:100,
    proposalDeadlinePct:100,
    negotiationAttempts:0,
    negotiated:false,
  };
  const advance=Math.round(order.budget*.45);
  state.budget = advance;
  state.finance={ledger:[{hour:0,type:'income',category:'Заказчик',amount:advance,text:`Аванс 45% · ${order.clientName}`}],contractValue:order.budget,received:advance,totalIncome:advance,advanceReceived:advance,spent:0,accountingVersion:PROJECT_FINANCE_ACCOUNTING_VERSION,reconciliationVersion:PROJECT_FINANCE_RECONCILIATION_VERSION};
  state.quality = Math.max(66, order.finishQuality - 5);
  state.trust = order.clientType === 'state' ? 68 : 72;
  state.tasks = Array.isArray(order.tasks)?order.tasks.map(task=>({...task})):buildTasksForOrder(order);
  ensureMasterSchedule(state);
  if(order.startWithoutProject){const project=state.tasks.find(task=>task.id==='project');if(project){project.plannedStartDay=Math.max(2,project.plannedStartDay);project.plannedFinishDay=Math.max(project.plannedStartDay,project.plannedFinishDay+2);project.scheduleManuallyEdited=true;}}
  state.eventIntensity=order.eventIntensity??1;
  if(state.eventIntensity>1)state.eventSchedule=state.eventSchedule.map(item=>({...item,occurs:item.occurs||item.probability*state.eventIntensity>=.72}));
  state.masterScheduleAccepted=false;
  state.preparationConfirmed=false;
  state.startupMaterials={ordered:false,orderId:null,amount:0,deliveryDay:null,taskIds:[]};
  state.visualSeed = order.visualSeed;
  state.tutorial=order.tutorial?{active:true,completed:false,chatSent:false,observedBuild:false,startedAt:Date.now()}:null;
  state.organizationMobilization=mobilizationCost;
  state.log.push({ type: 'order', text: `Взяли заказ: ${order.title}` });
  unlockTasks(state);
  return true;
}

export function hardTaskBlockers(state,taskOrId) {
  const task=typeof taskOrId==='string'?state.tasks.find(item=>item.id===taskOrId):taskOrId;
  if(!task)return [];
  const catalogHardDeps=WORK_BY_ID.get(task.id)?.hardAfter??[];
  const presentCatalogDeps=catalogHardDeps.filter(id=>state.tasks.some(item=>item.id===id));
  task.hardDeps=[...new Set([...(Array.isArray(task.hardDeps)?task.hardDeps:[]),...presentCatalogDeps])];
  const blockers=task.hardDeps.map(id=>state.tasks.find(item=>item.id===id)).filter(item=>item&&!['done','skipped','awaiting'].includes(item.status));
  if(task.id==='clean'){
    const physicalCategories=new Set(['demolition','shell','fitout','engineering','finish']);
    for(const candidate of state.tasks){
      if(candidate.id===task.id||['done','skipped','awaiting'].includes(candidate.status))continue;
      if(physicalCategories.has(WORK_BY_ID.get(candidate.id)?.category)&&!blockers.includes(candidate))blockers.push(candidate);
    }
  }
  return blockers;
}

export function unlockTasks(state) {
  for (const task of state.tasks) {
    if (task.status === 'done' || task.status === 'skipped' || task.status === 'active' || task.status === 'awaiting') continue;
    if(task.status==='blocked'){
      if(!task.committed&&state.budget+Math.max(0,ensureOrganization(state).cash)+1e-6<task.cost)continue;
      task.status='ready';
    }
    if(!state.started){task.status=task.id==='survey'?'ready':'locked';continue;}
    if(hardTaskBlockers(state,task).length){task.status='locked';continue;}
    if(task.id==='inspect') {
      task.status=state.tasks.filter(item=>item.id!=='inspect').every(item=>['done','skipped'].includes(item.status))?'ready':'locked';
    } else task.status='ready';
  }
}

export function applyContractCard(state,card) {
  if(!card||state.contract.cardsPlayed.includes(card.id)||state.contract.cardsPlayed.length>=2)return false;
  if(state.selectedOrder?.fixedContract&&((card.budget??0)!==0||(card.deadline??0)!==0))return false;
  state.contract.cardsPlayed.push(card.id);
  state.contract.budget+=card.budget??0;state.contract.deadlineHours+=card.deadline??0;state.contract.qualityTarget+=card.quality??0;state.trust+=card.trust??0;
  if(card.budget){state.budget+=card.budget;ensureProjectFinance(state).contractValue+=card.budget;recordCash(state,'income','Резерв',card.budget,card.title,{clientPayment:true});}return true;
}

export function contractNegotiationChance(state){
  const contract=state.contract??{};const organization=ensureOrganization(state);
  if(state.selectedOrder?.fixedContract)return 1;
  if(state.selectedOrder?.tutorial)return 1;
  const budgetPct=contract.proposalBudgetPct??100;const deadlinePct=contract.proposalDeadlinePct??100;
  const experience=(organization.playerLevel??1)*.065+((organization.reputation??50)-50)*.004;
  const retry=(contract.negotiationAttempts??0)*.055;
  const budgetPressure=Math.max(0,budgetPct-100)*.012-Math.max(0,100-budgetPct)*.006;
  const timePressure=Math.max(0,100-deadlinePct)*.014-Math.max(0,deadlinePct-100)*.005;
  return THREELESS_CLAMP(.5+experience+retry-budgetPressure-timePressure,.12,.96);
}

export function resolveContractNegotiation(state,rng=Math.random){
  if(!state.contract||state.contract.cardsPlayed.length!==2)return {ok:false,reason:'cards'};
  if(state.contract.negotiated)return {ok:true,accepted:true,chance:1};
  const chance=contractNegotiationChance(state);state.contract.negotiationAttempts=(state.contract.negotiationAttempts??0)+1;
  if(rng()>=chance){
    state.trust=Math.max(0,state.trust-2);
    state.log.push({type:'risk',text:'Заказчик отклонил условия. Назвал их смелыми и переслал закупкам без комментария.'});
    return {ok:true,accepted:false,chance};
  }
  const previousBudget=state.contract.budget;
  const previousDeadline=state.contract.deadlineHours;
  state.contract.budget=Math.max(1,Math.round(previousBudget*(state.contract.proposalBudgetPct??100)/100));
  state.contract.deadlineHours=Math.max(9,Math.round(previousDeadline*(state.contract.proposalDeadlinePct??100)/100));
  state.contract.negotiated=true;
  const budgetDelta=state.contract.budget-previousBudget;
  const advanceDelta=Math.round(budgetDelta*.45);
  const finance=ensureProjectFinance(state);finance.contractValue+=budgetDelta;
  if(advanceDelta>0){state.budget+=advanceDelta;recordCash(state,'income','Заказчик',advanceDelta,'Доплата аванса по согласованным условиям',{clientPayment:true});}
  if(advanceDelta<0){state.budget+=advanceDelta;recordCash(state,'expense','Возврат аванса',Math.abs(advanceDelta),'Скидка по согласованным условиям');}
  state.log.push({type:'done',text:`Условия согласованы: ${state.contract.budget}К и ${state.contract.deadlineHours} ч. Король генподряда временно коронован.`});
  return {ok:true,accepted:true,chance,budgetDelta,advanceDelta,deadlineDelta:state.contract.deadlineHours-previousDeadline};
}

function recordCash(state,type,category,amount,text,{clientPayment=false}={}) {
  const finance=ensureProjectFinance(state);
  finance.ledger.unshift({hour:state.elapsed??0,type,category,amount:Math.round(amount),text});finance.ledger=finance.ledger.slice(0,80);
  if(type==='income') {
    finance.totalIncome=(finance.totalIncome??0)+amount;
    if(clientPayment)finance.received=(finance.received??0)+amount;
  } else finance.spent=(finance.spent??0)+amount;
}

function spendProjectAndCompany(state,amount) {
  const organization=ensureOrganization(state);const projectPaid=Math.min(Math.max(0,state.budget),amount);const companyPaid=amount-projectPaid;
  if(companyPaid>organization.cash)return {ok:false,reason:'budget'};
  state.budget-=projectPaid;if(companyPaid)postLedgerEntry(state,{type:'expense',category:'Финансирование объекта',amount:companyPaid,projectId:state.selectedOrder?.id,text:'Недостающая часть оплаты объекта'});return {ok:true,projectPaid,companyPaid,amount};
}

function refundProjectAndCompany(state,payment) {
  if(!payment)return;state.budget+=(payment.projectPaid??payment.amount??0);ensureOrganization(state).cash+=(payment.companyPaid??0);
}

function situationRoll(state,salt=0){const value=Math.sin((state.visualSeed??17)*.017+(state.situationCount??0)*12.9898+salt)*43758.5453;return value-Math.floor(value);}
function ambientRoll(state,salt=0){const value=Math.sin((state.visualSeed??23)*.031+(state.ambientBeatCount??0)*9.731+salt)*24634.6345;return value-Math.floor(value);}
function applySituationDeltas(state,deltas={},text='Ситуация на объекте'){
  const budget=deltas.budget??0;state.budget+=budget;applyProductionTimeImpact(state,deltas.time??0,text);state.quality=Math.max(0,Math.min(100,state.quality+(deltas.quality??0)));state.trust=Math.max(0,Math.min(100,state.trust+(deltas.trust??0)));
  if(budget)recordCash(state,budget>0?'income':'expense','Решение',Math.abs(budget),text);
}

export function resolveSituation(state,situationId,choiceId,auto=false){
  const active=(state.activeSituations??[]).find(item=>item.uid===situationId);if(!active)return false;
  const template=situationById.get(active.templateId);const choice=template?.choices.find(item=>item.id===choiceId);if(!choice)return false;
  applySituationDeltas(state,choice.deltas,template.title);state.activeSituations=state.activeSituations.filter(item=>item.uid!==situationId);state.log.push({type:auto?'done':'event',text:`${auto?'Команда решила':'Решение'}: ${template.title} — ${choice.title}`});return true;
}

function updateSituations(state){
  if(state.tutorial?.active&&!state.tutorial.completed&&!state.tutorial.observedBuild)return;
  state.activeSituations??=[];state.situationCount??=0;state.nextSituationAt??=state.elapsed+2.2;
  for(const active of [...state.activeSituations]){
    const template=situationById.get(active.templateId);
    if(active.delegated&&state.elapsed>=(active.autoResolveAt??active.expiresAt)){resolveSituation(state,active.uid,template.choices[0].id,true);continue;}
    if(state.elapsed>=active.expiresAt){resolveSituation(state,active.uid,template.choices.at(-1).id);state.trust=Math.max(0,state.trust-1);state.log.push({type:'risk',text:`Вопрос проигнорирован: ${template.title}`});}
  }
  if(state.elapsed<state.nextSituationAt||state.activeSituations.length>=5)return;
  const template=SITUATIONS[Math.floor(situationRoll(state,3)*SITUATIONS.length)%SITUATIONS.length];
  const matching=state.crews.filter(crew=>crew.skill===template.skill);const target=matching[Math.floor(situationRoll(state,5)*Math.max(1,matching.length))]??state.crews.find(crew=>crew.id==='foreman');
  const resolver=state.team?.find(member=>member.id===template.resolver&&member.hired);const uid=`situation-${state.situationCount}-${template.id}`;
  state.situationCount+=1;state.nextSituationAt=state.elapsed+1.25+situationRoll(state,7)*1.05;
  const delegated=Boolean(resolver&&situationRoll(state,11)<.62);
  state.activeSituations.push({uid,templateId:template.id,crewId:target?.id??'foreman',createdAt:state.elapsed,expiresAt:state.elapsed+(delegated?1.7:2.8),delegated,autoResolveAt:delegated?state.elapsed+.85+situationRoll(state,13)*.65:null});
  state.log.push({type:'risk',text:`Новый вопрос на площадке: ${template.title}`});
}

export function updateAmbientActivity(state){
  state.ambientBeatCount??=0;state.ambientHistory??=[];state.nextAmbientBeatAt??=state.elapsed+.75;
  if(state.ambientBeat?.expiresAt<=state.elapsed)state.ambientBeat=null;
  if(state.ambientBeat||state.elapsed<state.nextAmbientBeatAt)return state.ambientBeat;
  const present=state.crews.filter(crew=>(crew.unavailableUntil??0)<=state.elapsed);
  const working=present.filter(crew=>crew.taskId);
  const pool=working.length?working:present;
  const crew=pool[Math.floor(ambientRoll(state,5)*Math.max(1,pool.length))]??state.crews.find(item=>item.id==='foreman');
  const skill=crew?.skill??'management';
  const generated=state.smokeBreak&&ambientRoll(state,7)<.38
    ? {kind:'break',skill,text:'Курилка проводит внеплановую координацию. На объекте временно стало просторнее.'}
    : generateAmbientBeat(skill,(state.visualSeed??0)+state.ambientBeatCount*17);
  const id=`beat-${state.ambientBeatCount}-${generated.kind}`;
  state.ambientBeatCount+=1;
  state.ambientBeat={...generated,id,crewId:crew?.id??null,taskId:crew?.taskId??null,startedAt:state.elapsed,expiresAt:state.elapsed+.34+ambientRoll(state,11)*.18};
  state.ambientHistory.unshift({id,text:generated.text,kind:generated.kind,hour:state.elapsed});state.ambientHistory=state.ambientHistory.slice(0,18);
  state.nextAmbientBeatAt=state.elapsed+.82+ambientRoll(state,13)*.58;
  return state.ambientBeat;
}

export function closeDayFinances(state) {
  const teamCost=Math.round((state.team??[]).filter(member=>member.hired).reduce((sum,member)=>sum+member.price*.055,0));
  const contractorCost=Math.round((state.contractors??[]).filter(item=>item.hired).reduce((sum,item)=>sum+item.price*.08,0));
  const permanentCost=ensureOrganization(state).inHouseDesign?12:0;
  const overhead=Math.max(6,Math.round((state.selectedOrder?.area??280)/180));
  const total=teamCost+contractorCost+permanentCost+overhead;const payment=spendProjectAndCompany(state,total);if(!payment.ok){state.budget-=total;state.log.push({type:'risk',text:`Кассовый разрыв по дню: не хватает ${Math.round(total-Math.max(0,state.budget)-Math.max(0,ensureOrganization(state).cash))}К`});}
  recordCash(state,'expense','День объекта',total,`Зарплаты ${teamCost}К · подрядчики ${contractorCost}К · постоянный штат ${permanentCost}К · накладные ${overhead}К`);
  for(const contractor of (state.contractors??[]).filter(item=>item.hired&&item.dismissAtDayEnd)){
    const claim=registerUnpaidContractorClaim(state,contractor);
    state.crews=state.crews.filter(item=>item.id!==`crew-${contractor.id}`);
    contractor.hired=false;contractor.dismissAtDayEnd=false;contractor.dismissedDay=Math.floor(state.elapsed/24);
    state.log.push({type:claim?'risk':'done',text:`${contractor.company}: бригада демобилизована после смены. Завтра содержание не начисляется.${claim?` Остаток ${claim.balance}К не оплачен.`:''}`});
  }
  return total;
}

export function hireTeamMember(state,memberId) {
  const member=state.team.find(item=>item.id===memberId);if(!member||member.hired)return {ok:false,reason:'already'};
  const payment=spendProjectAndCompany(state,member.price);if(!payment.ok)return payment;
  member.hired=true;member.payment=payment;
  recordCash(state,'expense','Команда',member.price,`Мобилизация: ${member.name}`);
  const level=Math.max(1,member.level??(1+Math.floor((ensureOrganization(state).staffXp[member.id]??0)/2)));member.level=Math.min(5,level);
  state.crews.push(makeTeamRuntimeCrew(member));
  return {ok:true,member};
}

export function hireContractor(state, contractorId) {
  const contractor = state.contractors.find((item) => item.id === contractorId);
  if (!contractor || contractor.hired) return { ok: false, reason: 'already' };
  const mobilizationCost=Math.max(8,Math.round(contractor.price*.3));const payment=spendProjectAndCompany(state,mobilizationCost);if(!payment.ok)return payment;
  recordCash(state,'expense','Подрядчик',mobilizationCost,`Аванс 30% и мобилизация: ${contractor.company}`);
  contractor.hired = true;contractor.payment=payment;contractor.settlementDue=0;contractor.settlementEarned=false;contractor.settled=false;contractor.dismissAtDayEnd=false;
  const organization=ensureOrganization(state);contractor.level=Math.max(1,Math.min(5,contractor.level??(1+Math.floor((organization.contractorXp[contractor.id]??0)/2))));
  const arrivalAt=state.started?(Math.floor(state.elapsed/24)+1)*24:state.elapsed;
  state.crews.push({
    id: `crew-${contractor.id}`,
    name: contractor.company,
    role: contractor.name,
    skill: contractor.skill,
    color: contractor.color,
    initials: contractor.initials,
    speed: contractor.speed*(1+(contractor.level-1)*.025),
    quality: contractor.quality*(1+(contractor.level-1)*.018),
    quirk: contractor.quirk,
    manpower:contractor.manpower,
    baseManpower:contractor.manpower,
    taskId: null,
    x: 8,
    y: 7,
    state: 'idle',
    unavailableUntil:arrivalAt,
    level:contractor.level,
  });
  state.log.push({ type: 'hire', text: state.started?`${contractor.company}: мобилизация подтверждена на завтра`:`${contractor.company} выходят на объект` });
  return { ok: true, contractor, arrivalAt, mobilizationCost };
}

export function adjustContractorManpower(state,contractorId,delta){
  const contractor=state.contractors.find(item=>item.id===contractorId);const crew=state.crews.find(item=>item.id===`crew-${contractorId}`);
  if(!contractor?.hired||!crew||![-1,1].includes(delta))return {ok:false,reason:'contractor'};
  crew.manpower??=contractor.manpower??3;crew.baseManpower??=crew.manpower;contractor.manpower??=crew.manpower;
  if(delta>0){
    if(contractor.manpower>=12)return {ok:false,reason:'max'};const cost=Math.max(6,Math.round(contractor.price/Math.max(2,contractor.manpower)*.65));const payment=spendProjectAndCompany(state,cost);if(!payment.ok)return payment;
    contractor.manpower+=1;recordCash(state,'expense','Усиление бригады',cost,`${contractor.company}: +1 человек`);
    if(state.started){crew.pendingManpower=(crew.pendingManpower??0)+1;crew.reinforcementAt=(Math.floor(state.elapsed/24)+1)*24;state.log.push({type:'hire',text:`${contractor.company}: усиление +1 выйдет завтра`});return {ok:true,delta,cost,pending:true,arrivalAt:crew.reinforcementAt,contractor,crew};}
    crew.manpower+=1;return {ok:true,delta,cost,pending:false,contractor,crew};
  }
  if(contractor.manpower<=2)return {ok:false,reason:'min'};contractor.manpower-=1;
  if((crew.pendingManpower??0)>0)crew.pendingManpower-=1;else crew.manpower=Math.max(2,crew.manpower-1);
  state.log.push({type:'risk',text:`${contractor.company}: один человек снят с объекта`});return {ok:true,delta,cost:0,pending:false,contractor,crew};
}

function activatePendingManpower(state){
  for(const crew of state.crews??[]){if((crew.pendingManpower??0)>0&&state.elapsed>=(crew.reinforcementAt??Infinity)){const added=crew.pendingManpower;crew.manpower=(crew.manpower??0)+added;crew.pendingManpower=0;crew.reinforcementAt=null;state.log.push({type:'hire',text:`${crew.name}: усиление ${added} чел. вышло на объект`});}}
}

export function unhireTeamMember(state,memberId) {
  const member=state.team.find(item=>item.id===memberId);if(!member?.hired||state.started)return {ok:false,reason:'locked'};
  member.hired=false;refundProjectAndCompany(state,member.payment);member.payment=null;
  state.crews=state.crews.filter(crew=>crew.id!==`team-${member.id}`);
  return {ok:true,member};
}

export function unhireContractor(state,contractorId) {
  const contractor=state.contractors.find(item=>item.id===contractorId);if(!contractor?.hired||state.started)return {ok:false,reason:'locked'};
  const crewId=`crew-${contractor.id}`;contractor.hired=false;refundProjectAndCompany(state,contractor.payment);contractor.payment=null;state.crews=state.crews.filter(crew=>crew.id!==crewId);
  for(const task of state.tasks??[])if(task.plannedCrewId===crewId){task.plannedCrewId=null;task.supervisorEmployeeId=null;}
  return {ok:true,contractor};
}

export function dismissContractor(state,contractorId) {
  const contractor=state.contractors.find(item=>item.id===contractorId);
  if(!contractor?.hired||!state.started)return {ok:false,reason:'not-active'};
  if(!state.needsReport){
    contractor.dismissAtDayEnd=!contractor.dismissAtDayEnd;
    state.log.push({type:contractor.dismissAtDayEnd?'risk':'start',text:contractor.dismissAtDayEnd?`${contractor.company}: демобилизация назначена на вечер.`:`${contractor.company}: вечерняя демобилизация отменена.`});
    return {ok:true,contractor,scheduled:contractor.dismissAtDayEnd,cancelled:!contractor.dismissAtDayEnd};
  }
  const crew=state.crews.find(item=>item.id===`crew-${contractor.id}`);
  if(crew?.taskId){const task=state.tasks.find(item=>item.id===crew.taskId);if(task&&!['done','blocked'].includes(task.status)){task.status='ready';task.crewId=null;}}
  registerUnpaidContractorClaim(state,contractor);
  state.crews=state.crews.filter(item=>item.id!==`crew-${contractor.id}`);contractor.hired=false;contractor.dismissAtDayEnd=false;contractor.dismissedDay=Math.floor(state.elapsed/24);
  state.trust=Math.max(0,state.trust-1);state.log.push({type:'risk',text:`${contractor.company} сняты с объекта. Замена — не раньше завтра.`});
  return {ok:true,contractor};
}

function registerUnpaidContractorClaim(state,contractor){
  if(!contractor?.settlementEarned||(contractor.settlementDue??0)<=0)return null;
  const organization=ensureOrganization(state);organization.contractorClaims??=[];
  let claim=organization.contractorClaims.find(item=>item.contractorId===contractor.id&&item.status!=='paid');
  if(!claim){
    claim={id:`claim-${contractor.id}-${organization.calendarDay}`,contractorId:contractor.id,projectId:state.selectedOrder?.id,company:contractor.company,principal:contractor.settlementDue,balance:contractor.settlementDue,openedDay:organization.calendarDay,status:'overdue',lawsuitFiled:false};
    organization.contractorClaims.unshift(claim);
  }
  contractor.unpaidSinceDay=claim.openedDay;contractor.claimId=claim.id;
  return claim;
}

export function settleContractor(state,contractorId){
  const contractor=state.contractors?.find(item=>item.id===contractorId);const organization=ensureOrganization(state);
  const claim=organization.contractorClaims?.find(item=>item.contractorId===contractorId&&item.status!=='paid');
  const due=Math.max(0,Math.round(claim?.balance??(contractor?.settlementEarned?contractor.settlementDue:0)??0));
  if(!contractor||due<=0)return {ok:false,reason:'nothing-due'};
  const payment=spendProjectAndCompany(state,due);if(!payment.ok)return payment;
  recordCash(state,'expense',claim?.lawsuitFiled?'Судебное урегулирование':'Расчёт с подрядчиком',due,`${contractor.company}: окончательный расчёт`);
  contractor.settlementDue=0;contractor.settled=true;contractor.unpaidSinceDay=null;contractor.claimId=null;
  if(claim){claim.balance=0;claim.status='paid';claim.paidDay=organization.calendarDay;}
  const relation=state.contractorNetwork?.find(item=>item.id===contractorId);if(relation)relation.relationship=Math.min(100,(relation.relationship??50)+(claim?.lawsuitFiled?0:3));
  state.log.push({type:'done',text:`${contractor.company}: окончательный расчёт ${due}К проведён. Претензионная папка закрыта.`});
  return {ok:true,contractor,claim,amount:due};
}

export function forceAssignCrew(state,crewId,taskId) {
  const crew=state.crews.find(item=>item.id===crewId);const task=state.tasks.find(item=>item.id===taskId);
  if(!crew||!task||!['ready','locked'].includes(task.status)||(crew.unavailableUntil??0)>state.elapsed)return {ok:false,reason:'unavailable'};
  const blockers=hardTaskBlockers(state,task);if(blockers.length)return {ok:false,reason:'hard-blocker',blockers};
  if(task.crewId&&task.crewId!==crew.id)return {ok:false,reason:'occupied'};
  if(crew.taskId){const previous=state.tasks.find(item=>item.id===crew.taskId);if(previous&&previous.status==='active'){previous.status='ready';previous.crewId=null;}}
  if(!task.committed){const committedAmount=crew.id.startsWith('crew-')?Math.max(1,Math.round(task.cost*.88)):task.cost;const payment=spendProjectAndCompany(state,committedAmount);if(!payment.ok)return {ok:false,reason:'budget'};task.payment=payment;task.committedAmount=committedAmount;recordCash(state,'expense','Работы',committedAmount,`Ручной нагон: ${task.title}`);task.committed=true;}
  task.status='active';task.enabledToday=true;task.crewId=crew.id;task.profileMismatch=crew.skill!==task.skill;task.manualAssignment=true;task.manualPaused=false;crew.taskId=task.id;crew.state='working';
  state.log.push({type:task.profileMismatch?'risk':'start',text:`${crew.name} переброшены на «${task.short}»${task.profileMismatch?' не по профилю':''}`});
  return {ok:true,crew,task,mismatch:task.profileMismatch};
}

export function taskCrewAvailability(state,taskOrId) {
  const task=typeof taskOrId==='string'?state.tasks.find(item=>item.id===taskOrId):taskOrId;
  if(!task)return {matching:[],present:[],free:[],away:[],nextArrival:null};
  const allCrews=state.crews??[];
  const matching=task.plannedCrewId?allCrews.filter(crew=>crew.id===task.plannedCrewId):allCrews.filter(crew=>crew.skill===task.skill||crew.skill==='general');
  const present=matching.filter(crew=>(crew.unavailableUntil??0)<=state.elapsed);
  const free=present.filter(crew=>!crew.taskId);
  const away=matching.filter(crew=>(crew.unavailableUntil??0)>state.elapsed);
  const nextArrival=away.length?Math.min(...away.map(crew=>crew.unavailableUntil)):null;
  return {matching,present,free,away,nextArrival,plannedMissing:Boolean(task.plannedCrewId&&!matching.length)};
}

export function startTaskNow(state,taskId) {
  const task=state.tasks.find(item=>item.id===taskId);
  if(!task||task.status!=='ready')return {ok:false,reason:'task',task};
  const blockers=hardTaskBlockers(state,task);if(blockers.length)return {ok:false,reason:'hard-blocker',task,blockers};
  task.enabledToday=true;task.manualPaused=false;task.priority=Math.max(2,task.priority);
  const availability=taskCrewAvailability(state,task);
  const crew=[...availability.free].sort((a,b)=>Number(b.skill===task.skill)-Number(a.skill===task.skill)||(b.speed??0)-(a.speed??0))[0];
  if(!crew)return {ok:false,queued:true,reason:availability.away.length&&!availability.present.length?'away':availability.matching.length?'busy':'no-crew',task,...availability};
  return {...forceAssignCrew(state,crew.id,task.id),availability};
}

export function pauseTask(state,taskId) {
  const task=state.tasks.find(item=>item.id===taskId);if(!task||task.status!=='active')return {ok:false,reason:'task'};
  const crew=state.crews.find(item=>item.id===task.crewId);
  if(crew){crew.taskId=null;crew.state='idle';crew.visualBehavior='idle';}
  task.status='ready';task.crewId=null;task.enabledToday=false;task.manualPaused=true;task.pausedAt=state.elapsed;
  state.log.push({type:'risk',text:`Фронт остановлен: ${task.title}. Выполнено ${Math.round((task.progress??0)*100)}%.`});
  unlockTasks(state);return {ok:true,task,crew};
}

export function sendPressureInstruction(state,taskId,channel='chat',rng=Math.random) {
  const task=state.tasks.find(item=>item.id===taskId);
  if(!task||['done','awaiting'].includes(task.status))return {ok:false,reason:'task'};
  const day=Math.floor(state.elapsed/24);state.pressureHistory??=[];
  if(channel==='email'&&state.pressureHistory.some(item=>item.channel==='email'&&item.day===day))return {ok:false,reason:'daily-limit'};
  const email=channel==='email';const chance=Math.min(.98,(email ? .9 : .54)+bossArtifactBonus(state,'pressureChance'));const worked=rng()<chance;const cost=email?10:5;
  state.budget-=cost;recordCash(state,'expense',email?'Претензионное письмо':'Срочное сообщение',cost,task.title);state.trust=Math.max(0,state.trust-(email?1:.5));
  task.enabledToday=true;task.priority=3;task.pressureFactor=worked?(email?1.38:1.2):.92;task.pressureUntil=state.elapsed+(email?5:2.5);
  if(!worked)state.quality=Math.max(0,state.quality-.4);
  const result={ok:true,worked,channel,day,factor:task.pressureFactor,cost,taskId};state.pressureHistory.unshift(result);state.pressureHistory=state.pressureHistory.slice(0,30);
  state.log.push({type:worked?'start':'risk',text:email?(worked?`Претензия сработала: ${task.short} ускорились`:`Претензию зарегистрировали вместо исполнения: ${task.short}`):(worked?`Злое сообщение подействовало: ${task.short}`:`Сообщение было очень злым. Работа — нет.`)});
  return result;
}

export function sendContractorEscalation(state,contractorId='all',rng=Math.random) {
  const day=Math.floor(state.elapsed/24);state.pressureHistory??=[];
  if(state.pressureHistory.some(item=>item.channel==='email'&&item.day===day))return {ok:false,reason:'daily-limit'};
  const contractors=state.contractors.filter(item=>item.hired&&(contractorId==='all'||item.id===contractorId));
  if(!contractors.length)return {ok:false,reason:'contractor'};
  const targets=[];
  for(const contractor of contractors){const crew=state.crews.find(item=>item.id===`crew-${contractor.id}`);const task=state.tasks.find(item=>item.id===crew?.taskId)??state.tasks.find(item=>item.skill===contractor.skill&&!['done','awaiting'].includes(item.status));if(task&&!targets.includes(task))targets.push(task);}
  if(!targets.length)return {ok:false,reason:'no-front'};
  const mass=contractorId==='all';const cost=mass?20:10;const payment=spendProjectAndCompany(state,cost);if(!payment.ok)return payment;
  recordCash(state,'expense','Жёсткая претензия',cost,mass?'Всем подрядчикам':'Конкретному подрядчику');state.trust=Math.max(0,state.trust-(mass?2:1));
  let worked=0;for(const task of targets){const success=rng()<.9;if(success)worked+=1;task.enabledToday=true;task.priority=3;task.pressureFactor=success?1.38:.92;task.pressureUntil=state.elapsed+5;if(!success)state.quality=Math.max(0,state.quality-.4);}
  const result={ok:true,worked:worked>0,workedCount:worked,targetCount:targets.length,channel:'email',day,cost,contractorId};state.pressureHistory.unshift(result);state.pressureHistory=state.pressureHistory.slice(0,30);state.log.push({type:worked?'start':'risk',text:worked?`Жёсткая претензия ускорила фронтов: ${worked}/${targets.length}`:'Все адресаты оперативно подтвердили получение письма. И только.'});return result;
}

export function cyclePriority(state, taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || ['done','awaiting'].includes(task.status)) return false;
  task.priority = task.priority === 3 ? 1 : task.priority + 1;
  const canTakeTask=(crew,candidate)=>candidate.status==='ready'&&candidate.enabledToday&&!candidate.crewId&&(crew.skill===candidate.skill||crew.skill==='general');
  for(const crew of state.crews){
    const active=state.tasks.find(candidate=>candidate.id===crew.taskId);
    const best=state.tasks.filter(candidate=>canTakeTask(crew,candidate)).sort((a,b)=>b.priority-a.priority||a.duration-b.duration)[0];
    if(!active||active.manualAssignment||!best||best.priority<=active.priority)continue;
    active.status='ready';active.crewId=null;crew.taskId=null;crew.state='idle';
    state.log.push({type:'start',text:`Приоритет сработал: ${crew.name} переключаются с «${active.short}» на «${best.short}».`});
  }
  assignCrews(state);
  return true;
}

export function skipOptionalTask(state,taskId){
  const task=state.tasks.find(item=>item.id===taskId);if(!task?.optional||!['ready','locked','blocked'].includes(task.status))return {ok:false,reason:'task'};
  task.status='skipped';task.enabledToday=false;task.crewId=null;const effect=task.skipEffect??{};state.siteDirt=THREELESS_CLAMP((state.siteDirt??0)+(effect.dirt??0),0,100);state.quality=Math.max(0,state.quality+(effect.quality??0));state.skippedTempoFactor=Math.min(state.skippedTempoFactor??1,effect.tempo??1);state.log.push({type:'risk',text:`Сэкономили на «${task.short}». Дешевле сейчас, объяснять потом.`});unlockTasks(state);return {ok:true,task,effect};
}

function availableTaskForCrew(state, crew) {
  if ((crew.unavailableUntil ?? 0) > state.elapsed) return undefined;
  return state.tasks
    .filter((task) => task.status === 'ready' && (task.plannedCrewId===crew.id||task.skill === crew.skill||crew.skill==='general') && task.enabledToday)
    .filter(task=>!task.plannedCrewId||task.plannedCrewId===crew.id)
    .filter(task=>{
      if(crew.skill!=='general')return true;
      const freeExact=state.crews.filter(other=>other.skill===task.skill&&!other.taskId&&(other.unavailableUntil??0)<=state.elapsed).sort((a,b)=>(b.speed??0)-(a.speed??0)||a.id.localeCompare(b.id));
      return !freeExact.length||freeExact[0].id===crew.id;
    })
    .filter((task) => !task.crewId)
    .sort((a, b) => b.priority-a.priority||a.duration-b.duration)[0];
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
      const committedAmount=crew.id.startsWith('crew-')?Math.max(1,Math.round(task.cost*.88)):task.cost;
      const payment=spendProjectAndCompany(state,committedAmount);
      if (!payment.ok) {
        task.status = 'blocked';
        state.log.push({ type: 'risk', text: `Не хватает бюджета на «${task.title}»` });
        continue;
      }
      task.payment=payment;
      task.committedAmount=committedAmount;
      recordCash(state,'expense','Работы',committedAmount,`Материалы и работы: ${task.title}`);
      task.committed = true;
    }
    task.status = 'active';task.profileMismatch=crew.skill!==task.skill;task.manualAssignment=false;task.manualPaused=false;
    task.outOfSequence=task.deps.some(depId=>state.tasks.find(item=>item.id===depId)?.status!=='done');
    if(task.outOfSequence){state.quality=Math.max(0,state.quality-1.5);state.log.push({type:'risk',text:`Работы пошли не по порядку: ${task.title}`});}
    const projectReady=state.tasks.find(item=>item.id==='project')?.status==='done';
    const physical=!['survey','project','executive-docs','inspect'].includes(task.id);
    if(physical&&!projectReady){
      const strongTeam=state.team?.some(member=>member.id==='pm'&&member.hired)&&state.team?.some(member=>member.id==='supervision'&&member.hired);
      const salt=[...task.id].reduce((sum,char)=>sum+char.charCodeAt(0),0)+(state.visualSeed??0);
      task.buildWithoutDesign=true;task.noDesignReworkRisk=strongTeam?.16:.48;task.noDesignRoll=Math.abs((Math.sin(salt*12.9898)*43758.5453)%1);
      state.quality=Math.max(0,state.quality-(strongTeam?.4:2.2));
      state.log.push({type:strongTeam?'start':'risk',text:`${task.short}: пошли без финального проекта${strongTeam?' под контроль сильной команды':''}`});
    }
    task.crewId = crew.id;
    crew.taskId = task.id;
    crew.state = 'working';
    state.log.push({ type: 'start', text: `${crew.name}: ${task.title}` });
  }
}

export function calculateSiteCongestion(state){
  const present=(state.crews??[]).filter(crew=>(crew.unavailableUntil??0)<=state.elapsed);
  const manpower=present.reduce((sum,crew)=>sum+crewHeadcount(state,crew),0);
  const capacity=Math.max(10,Math.round((state.selectedOrder?.area??280)/18));const overload=Math.max(0,manpower-capacity);const penalty=THREELESS_CLAMP(1-(overload/capacity)*.1,.68,1);
  return {manpower,capacity,overload:Math.round(overload*10)/10,penalty};
}

export function crewHeadcount(state,crew){
  if(!crew)return 0;if(crew.id==='foreman'||crew.id.startsWith('team-'))return 1;if(crew.id==='general-crew')return crew.manpower??4;
  if(Number.isFinite(crew.manpower))return crew.manpower;const contractor=state.contractors?.find(item=>`crew-${item.id}`===crew.id);return contractor?.manpower??3;
}

function THREELESS_CLAMP(value,min,max){return Math.max(min,Math.min(max,value));}

export function taskControlFactor(state,task,crew){
  if(!crew?.id?.startsWith('crew-'))return {factor:1,label:'Свой ресурс',load:0,employee:null};
  const contractor=state.contractors?.find(item=>`crew-${item.id}`===crew.id);
  const contractorLevel=Math.max(1,Math.min(5,contractor?.level??crew.level??1));
  const employee=state.staff?.employees?.find(item=>item.id===task?.supervisorEmployeeId&&item.status==='employed');
  const activeProjectId=state.portfolio?.activeProjectId;
  const assignedHere=employee&&(!activeProjectId||employee.assignedProjectId===activeProjectId);
  if(!assignedHere){
    const factor=THREELESS_CLAMP(.68+contractorLevel*.06,.72,.98);
    return {factor,label:`Без контроля · подрядчик ур. ${contractorLevel}`,load:0,employee:null};
  }
  const overlaps=(left,right)=>(left.plannedStartDay??0)<=(right.plannedFinishDay??0)&&(right.plannedStartDay??0)<=(left.plannedFinishDay??0);
  const supervised=(state.tasks??[]).filter(item=>item.supervisorEmployeeId===employee.id&&!['done','skipped'].includes(item.status)&&overlaps(task,item));
  const load=Math.max(1,supervised.length);
  const factor=THREELESS_CLAMP(.88+(employee.competence??50)*.0014+(employee.discipline??50)*.0007-(load-1)*.08,.76,1.1);
  return {factor,label:`${employee.name} · ${load>1?`нагрузка ×${load}`:'личный контроль'}`,load,employee};
}

function localCrowdingPenalty(state,task){
  const neighbors=state.tasks.filter(other=>other.id!==task.id&&other.status==='active'&&Math.hypot((other.x??0)-(task.x??0),(other.y??0)-(task.y??0))<2.15).length;
  return Math.max(.74,1-neighbors*.075);
}

const NON_PHYSICAL_TASKS=new Set(['survey','project','executive-docs','inspect']);

export function updateSiteCleanliness(state,deltaHours){
  const activePhysical=state.tasks.filter(task=>task.status==='active'&&!NON_PHYSICAL_TASKS.has(task.id)&&task.skill!=='cleaning');
  const availableCrews=(state.crews??[]).filter(crew=>(crew.unavailableUntil??0)<=state.elapsed);
  const dedicatedCleaners=availableCrews.filter(crew=>crew.skill==='cleaning');
  const activeCleaning=availableCrews.filter(crew=>{
    const task=state.tasks.find(item=>item.id===crew.taskId);
    return task?.status==='active'&&task.skill==='cleaning';
  });
  const siteManpower=activePhysical.reduce((sum,task)=>sum+crewHeadcount(state,availableCrews.find(crew=>crew.id===task.crewId)),0);
  const protectionSkipped=state.tasks.some(task=>task.id==='protection'&&task.status==='skipped');const generated=deltaHours*(activePhysical.length*.72+siteManpower*.075)*(protectionSkipped?1.38:1);
  const activePower=activeCleaning.reduce((sum,crew)=>sum+Math.max(1.2,crewHeadcount(state,crew)*.9)*Math.max(.7,crew.speed??1),0);
  const passivePower=dedicatedCleaners.filter(crew=>!crew.taskId).reduce((sum,crew)=>sum+Math.max(.45,crewHeadcount(state,crew)*.18)*Math.max(.7,crew.speed??1),0);
  const hasCleaningSupport=dedicatedCleaners.length>0||activeCleaning.length>0;
  const reluctantSelfCleaning=hasCleaningSupport?0:siteManpower*.035;
  const removed=deltaHours*(activePower*2.4+passivePower+reluctantSelfCleaning);
  state.siteDirt=THREELESS_CLAMP((state.siteDirt??0)+generated-removed,0,100);
  const distraction=!hasCleaningSupport&&state.siteDirt>18?THREELESS_CLAMP(1-(state.siteDirt-18)*.003,.76,1):1;
  if(state.siteDirt>82&&activePhysical.length)state.quality=Math.max(0,state.quality-deltaHours*.025);
  state.cleanliness={dirt:state.siteDirt,generated,removed,hasCleaningSupport,distraction};
  return state.cleanliness;
}

function releaseStagePayment(state,task) {
  if(task.reworkOf||['executive-docs','inspect'].includes(task.id))return 0;
  const finance=ensureProjectFinance(state);
  const contractValue=finance.contractValue??state.contract?.budget??0;
  const retention=Math.round(contractValue*.15);
  const available=Math.max(0,contractValue-retention-(finance.received??0));
  const payableTasks=state.tasks.filter(item=>!item.reworkOf&&!['executive-docs','inspect'].includes(item.id)&&item.status!=='skipped');
  const totalWeight=payableTasks.reduce((sum,item)=>sum+Math.max(1,item.cost??1),0);
  const stagePool=Math.max(0,contractValue-retention-(finance.advanceReceived??0));
  const taskShare=totalWeight?Math.round(stagePool*Math.max(1,task.cost??1)/totalWeight):0;
  const payment=Math.min(available,Math.max(1,taskShare));
  if(payment>0){state.budget+=payment;recordCash(state,'income','Этапный платёж',payment,task.title,{clientPayment:true});}
  return payment;
}

function completeTask(state, task, crew) {
  task.progress = 1;
  const requiresAcceptance=!task.reworkOf&&!['survey','executive-docs','inspect'].includes(task.id);
  task.status = requiresAcceptance?'awaiting':'done';
  task.crewId = null;
  crew.taskId = null;
  crew.state = 'idle';
  const contractor=state.contractors?.find(item=>`crew-${item.id}`===crew.id);
  if(contractor){
    const retained=Math.max(0,Math.round((task.cost??0)-(task.committedAmount??task.cost??0)));
    contractor.settlementDue=(contractor.settlementDue??0)+retained;
    contractor.settlementEarned=contractor.settlementDue>0;
    contractor.settled=false;
  }
  crew.x = task.x;
  crew.y = task.y;
  if(task.skill==='cleaning')state.siteDirt=0;
  const supervision=state.team?.find(member=>member.id==='supervision')?.hired;
  const qualityGain = task.quality * crew.quality * (supervision?1:.82) * (task.profileMismatch?.72:1);
  task.acceptanceQuality=crew.quality;task.acceptanceQualityGain=qualityGain;task.lastCrewLevel=crew.level??1;task.lastCrewId=crew.id;
  if(!requiresAcceptance){state.quality=Math.min(100,state.quality+qualityGain);state.trust=Math.min(100,state.trust+(task.id==='inspect'?4:1));releaseStagePayment(state,task);}
  state.log.push({ type: requiresAcceptance?'start':'done', text: requiresAcceptance?`Готово к предъявлению: ${task.title}`:`Готово: ${task.title}` });
  if(task.buildWithoutDesign&&task.noDesignRoll<(task.noDesignReworkRisk??0)&&!state.tasks.some(item=>item.reworkOf===task.id)) {
    state.tasks.push({id:`rework-${task.id}-${state.tasks.length}`,title:`Уточнить и переделать: ${task.short}`,short:'Переделка без РД',skill:task.skill,x:task.x,y:task.y,duration:Math.max(3,Math.round(task.duration*.38)),cost:Math.max(12,Math.round(task.cost*.3)),quality:1,deps:[],priority:3,color:'#ff746b',progress:0,status:'ready',crewId:null,committed:false,enabledToday:false,reworkOf:task.id});
    state.quality=Math.max(0,state.quality-4);state.log.push({type:'risk',text:`Стройка без финального проекта не прокатила: ${task.short}`});
  }
  if(['electric','hvac','lowcurrent','fire','plumbing'].includes(task.id)) {
    const paint=state.tasks.find(item=>['paint','wall-finish'].includes(item.id));
    if(['done','awaiting'].includes(paint?.status)&&!state.tasks.some(item=>item.reworkOf===paint.id)) {
      state.tasks.push({id:`rework-paint-${state.tasks.length}`,title:'Восстановить стены после прокладки кабеля',short:'Переделка',skill:'paint',x:2,y:1,duration:9,cost:96,quality:2,deps:[],priority:2,color:'#ff746b',progress:0,status:'ready',crewId:null,committed:false,enabledToday:false,reworkOf:paint.id});
      state.quality=Math.max(0,state.quality-7);state.trust=Math.max(0,state.trust-4);state.log.push({type:'risk',text:'Электрики вскрыли готовые стены. Добавлена переделка.'});
    }
  }
  if(['paint','wall-finish','floor-finish','ceiling-finish','desks','electric','lighting','hvac','lowcurrent','fire','plumbing','partitions'].includes(task.id)) {
    const clean=state.tasks.find(item=>item.id==='clean');
    if(['done','awaiting'].includes(clean?.status)&&!state.tasks.some(item=>item.reworkOf==='clean')) {
      state.tasks.push({id:`rework-clean-${state.tasks.length}`,title:'Повторная уборка после новых работ',short:'Переделка',skill:'cleaning',x:7,y:5,duration:5,cost:34,quality:1,deps:[],priority:1,color:'#ff746b',progress:0,status:'ready',crewId:null,committed:false,enabledToday:false,reworkOf:'clean'});
      state.log.push({type:'risk',text:'Уборку сделали слишком рано. Потребуется повторный выход.'});
    }
  }
  if(task.id==='inspect'&&state.tasks.find(item=>item.id==='executive-docs')?.status==='done') {
    const finance=ensureProjectFinance(state);const finalPayment=Math.max(0,Math.round((finance.contractValue??state.contract?.budget??0)-(finance.received??0)));
    if(finalPayment>0){state.budget+=finalPayment;recordCash(state,'income','Финальное закрытие',finalPayment,'Удержание выплачено после сдачи полного комплекта ИД',{clientPayment:true});state.log.push({type:'done',text:`Документация принята. Разблокировано финальное закрытие ${finalPayment}К`});}
  }
  unlockTasks(state);
}

export function submitTaskForAcceptance(state,taskId,rng=Math.random) {
  const task=state.tasks.find(item=>item.id===taskId);
  if(task?.status!=='awaiting')return {ok:false,reason:'status'};
  const pm=state.team?.find(member=>member.id==='pm'&&member.hired);
  const supervision=state.team?.find(member=>member.id==='supervision'&&member.hired);
  const teamBonus=(pm?.level??0)*.025+(supervision?.level??0)*.045;
  const contractorBonus=((task.acceptanceQuality??1)-.9)*.42+(task.lastCrewLevel??1)*.018;
  const noDesignPenalty=task.buildWithoutDesign?.16:0;
  const retryBonus=(task.acceptanceAttempts??0)*.14;
  const chance=Math.max(.3,Math.min(.97,.52+teamBonus+contractorBonus+retryBonus-noDesignPenalty+bossArtifactBonus(state,'acceptanceChance')));
  const accepted=rng()<chance;task.acceptanceAttempts=(task.acceptanceAttempts??0)+1;
  if(accepted){task.status='done';state.quality=Math.min(100,state.quality+(task.acceptanceQualityGain??task.quality));state.trust=Math.min(100,state.trust+1);const payment=releaseStagePayment(state,task);const finance=ensureProjectFinance(state);const paymentReason=payment?null:(finance.received??0)>=Math.round((finance.contractValue??0)*.85)-1?'retention':'no-funding';if(task.lastCrewId?.startsWith('crew-')){const contractorId=task.lastCrewId.slice(5);const organization=ensureOrganization(state);organization.contractorXp[contractorId]=(organization.contractorXp[contractorId]??0)+.5;}state.log.push({type:'done',text:`Принято: ${task.title}${payment?` · закрыто ${payment}К`:paymentReason==='retention'?' · остаток удержан до ИД':' · платёж не предусмотрен'}`});unlockTasks(state);return {ok:true,accepted:true,chance,payment,paymentReason};}
  const remedialCost=Math.max(4,Math.round(task.cost*.1));state.budget-=remedialCost;recordCash(state,'expense','Замечания при приёмке',remedialCost,task.title);
  task.status='ready';task.enabledToday=false;task.progress=Math.max(0,1-4.5/Math.max(4.5,task.duration));task.acceptanceRework=true;state.quality=Math.max(0,state.quality-1);state.trust=Math.max(0,state.trust-1);state.log.push({type:'risk',text:`Не принято: ${task.title}. Минимум полсмены на замечания.`});
  return {ok:true,accepted:false,chance,remedialCost,remainingHours:4.5};
}

export function tryMagicResolve(state,rng=Math.random){
  state.magicResolve??={lastAt:-1e9,attempts:0};
  const cooldownHours=48;const elapsed=state.elapsed??0;const remaining=Math.max(0,cooldownHours-(elapsed-state.magicResolve.lastAt));
  if(!state.started)return {ok:false,reason:'not-started',remaining};
  if(remaining>0)return {ok:false,reason:'cooldown',remaining};
  state.magicResolve.lastAt=elapsed;state.magicResolve.attempts+=1;
  const chance=.16;
  if(rng()>=chance){
    const backlash=rng();
    if(backlash<.36){
      state.trust=Math.max(0,state.trust-1);
      state.log.push({type:'risk',text:'Порешать не получилось. В ответ пришло «принято», которое не является решением.'});
      return {ok:true,success:false,backlash:'nothing',chance,cooldownHours};
    }
    if(backlash<.64){
      const amount=Math.max(20,Math.min(75,Math.round((state.contract?.budget??800)*.035/5)*5));
      state.budget-=amount;recordCash(state,'expense','Последствия порешания',amount,'Срочная услуга человека, которого никто не просил');
      state.trust=Math.max(0,state.trust-2);state.log.push({type:'risk',text:`Порешали на ${amount}К: появился новый посредник, а старая проблема осталась.`});
      return {ok:true,success:false,backlash:'cost',amount,chance,cooldownHours};
    }
    if(backlash<.86){
      const hours=5;state.productionDelayHours=(state.productionDelayHours??0)+hours;state.productionDelayReason='Последствия попытки порешать';state.productionDelayScope='all';
      state.trust=Math.max(0,state.trust-2);state.log.push({type:'risk',text:`После звонка все решили дождаться уточнений. Объект встал ещё на ${hours} часов.`});
      return {ok:true,success:false,backlash:'delay',hours,chance,cooldownHours};
    }
    state.quality=Math.max(0,state.quality-4);state.siteDirt=Math.min(100,(state.siteDirt??0)+12);state.trust=Math.max(0,state.trust-4);
    state.log.push({type:'risk',text:'Порешали не с тем человеком: на площадке появился лишний демонтаж, мусор и четыре новых версии правды.'});
    return {ok:true,success:false,backlash:'chaos',chance,cooldownHours};
  }
  const outcome=rng();
  if(outcome<.44){
    const awaiting=state.tasks.filter(task=>task.status==='awaiting');
    if(awaiting.length){let payment=0;for(const task of awaiting){task.status='done';state.quality=Math.min(100,state.quality+(task.acceptanceQualityGain??task.quality)*.8);payment+=releaseStagePayment(state,task);}state.trust=Math.min(100,state.trust+2);unlockTasks(state);state.log.push({type:'done',text:`Порешали: закрыто без замечаний ${awaiting.length} работ${payment?`, оплачено ${payment}К`:''}. Никто не задаёт уточняющих вопросов.`});return {ok:true,success:true,outcome:'acceptance',accepted:awaiting.length,payment,chance,cooldownHours};}
  }
  if(outcome<.74){
    const amount=Math.max(35,Math.min(160,Math.round((state.contract?.budget??800)*.07/5)*5));
    const finance=ensureProjectFinance(state);state.budget+=amount;state.contract.budget+=amount;finance.contractValue+=amount;recordCash(state,'income','Порешали с финансированием',amount,'Дополнительный резерв без удобного объяснения',{clientPayment:true});state.trust=Math.max(0,state.trust-2);state.log.push({type:'done',text:`Порешали: на объект пришло ещё ${amount}К. Назначение платежа лучше не перечитывать.`});return {ok:true,success:true,outcome:'money',amount,chance,cooldownHours};
  }
  const hours=12;state.contract.deadlineHours+=hours;state.trust=Math.max(0,state.trust-1);state.log.push({type:'done',text:`Порешали: заказчик дал ещё ${hours} часов и попросил никому не говорить, что он их дал.`});return {ok:true,success:true,outcome:'deadline',hours,chance,cooldownHours};
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

function eventTheme(event){
  const haystack=`${event?.id??''} ${event?.title??''} ${event?.text??''}`.toLowerCase();
  const themes=[];
  if(/client|заказчик|ceo|budget|допработ|оплат|финанс|банкрот/.test(haystack))themes.push('client');
  if(/crew|бригад|рабоч|прораб|миграц|персонал|начальств/.test(haystack))themes.push('people');
  if(/постав|достав|материал|склад|мебел/.test(haystack))themes.push('supply');
  if(/инспект|силов|провер|документ|акт|бухгалтер/.test(haystack))themes.push('compliance');
  const skill=eventRequiredSkill(event);if(skill)themes.push(skill);
  return themes.length?themes:['site'];
}

function ensureChaosDirector(state){
  state.chaosDirector??={chain:null,history:[],nextFollowupAt:0};
  state.communicationHistory??=[];
  return state.chaosDirector;
}

function eventScore(state,event,fallbackId){
  if(!event||!isEventRelevant(state,event))return -1e9;
  const director=ensureChaosDirector(state);const themes=eventTheme(event);
  let score=(event.weight??5)+(event.id===fallbackId?3:0);
  if(director.chain?.themes?.some(theme=>themes.includes(theme)))score+=12;
  const activeSkills=new Set(state.tasks.filter(task=>task.status==='active').map(task=>task.skill));
  if(themes.some(theme=>activeSkills.has(theme)))score+=7;
  if(state.budget<Math.max(80,(state.contract?.budget??800)*.12)&&themes.includes('client'))score+=5;
  if((state.siteDirt??0)>55&&(themes.includes('compliance')||themes.includes('site')))score+=4;
  const recent=director.history.slice(-5);if(recent.includes(event.id))score-=20;
  const salt=(state.visualSeed??17)+(state.situationCount??0)*13+event.id.length*7+Math.floor(state.elapsed*10);
  return score+(Math.sin(salt)*.5+.5)*2.4;
}

function directedEventId(state,fallbackId){
  const candidates=[...randomEventById.values()].filter(event=>(event.minHour??0)<=state.elapsed&&isEventRelevant(state,event));
  if(!candidates.length)return fallbackId;
  return candidates.sort((left,right)=>eventScore(state,right,fallbackId)-eventScore(state,left,fallbackId))[0]?.id??fallbackId;
}

export function eventDecisionChannel(event,option){
  const deltas=option?.deltas??{};
  const effect=String(option?.effect??'').toLowerCase();
  if(option?.financial||deltas.budget||deltas.deadline||Math.abs(deltas.trust??0)>=5||/₽|тыс|бюджет|деньг|срок|довер/.test(effect))return 'email';
  return 'chat';
}

export function getDayRhythm(state){
  if(!state.started)return {id:'setup',label:'ПОДГОТОВКА',hint:'Договор → команда → материалы → график',progress:0};
  if(state.completed)return {id:'closed',label:'ОБЪЕКТ СДАН',hint:'Финальная приёмка и расчёт завершены',progress:1};
  if(state.needsReport)return {id:'report',label:'ВЕЧЕРНИЙ ОТЧЁТ',hint:'План-факт, график и платежи',progress:1};
  const shift=Math.max(0,state.elapsed-(state.shiftStartedAt??Math.floor(state.elapsed/24)*24));
  const progress=Math.max(0,Math.min(1,shift/9));
  if(state.needsPlanning||state.paused&&state.phase==='planning')return {id:'plan',label:'ПЛАНЁРКА',hint:'Выберите главное ограничение дня',progress:0};
  if(progress<.14)return {id:'launch',label:'ЗАПУСК СМЕНЫ',hint:'Люди занимают фронты, стройка набирает темп',progress};
  if(progress<.43)return {id:'production',label:'ПРОИЗВОДСТВО',hint:'Смотрите, где план расходится с реальностью',progress};
  if(progress<.76)return {id:'chaos',label:'ОПЕРАТИВНОЕ УПРАВЛЕНИЕ',hint:'Чат, почта и решения по отклонениям',progress};
  return {id:'close',label:'ЗАКРЫТИЕ ДНЯ',hint:'Предъявите готовое и готовьте отчёт',progress};
}

export function getProjectCloseout(state){
  const tasks=state.tasks??[];const payable=tasks.filter(task=>!task.reworkOf&&!['executive-docs','inspect'].includes(task.id)&&task.status!=='skipped');
  const accepted=payable.filter(task=>task.status==='done').length;
  const awaiting=tasks.filter(task=>task.status==='awaiting').length;
  const unfinished=tasks.filter(task=>!['done','skipped'].includes(task.status)).length;
  const docs=tasks.find(task=>task.id==='executive-docs');
  const inspection=tasks.find(task=>task.id==='inspect');
  const finance=ensureProjectFinance(state);
  const finalDue=Math.max(0,Math.round((finance.contractValue??state.contract?.budget??0)-(finance.received??0)));
  let status='build',title='Строим и предъявляем',hint=`Принято ${accepted} из ${payable.length} оплачиваемых этапов`;
  if(awaiting){status='acceptance';title=`На предъявление: ${awaiting}`;hint='Работа сделана физически, но деньги ещё у заказчика';}
  if(!unfinished&&!state.completed){status='settlement';title='Финальное закрытие';hint=finalDue?`После ИД и приёмки придёт ${finalDue}К ₽`:'Все договорные платежи уже получены';}
  else if(state.sitePhysicallyComplete&&docs?.status!=='done'){status='docs';title='Стройка готова, деньги — нет';hint=`Сдайте ИД, чтобы разблокировать ${finalDue}К ₽`;}
  else if(docs?.status==='done'&&inspection?.status!=='done'){status='inspection';title='Осталась финальная приёмка';hint=`Заказчик удерживает ${finalDue}К ₽ до осмотра`;}
  if(state.completed){status='closed';title='Объект принят и закрыт';hint=`Получено ${Math.round(finance.received??0)}К ₽ по договору`;}
  return {status,title,hint,accepted,total:payable.length,awaiting,unfinished,docsDone:docs?.status==='done',inspectionDone:inspection?.status==='done',finalDue,received:Math.round(finance.received??0),contractValue:Math.round(finance.contractValue??0)};
}

function queueTimedEvents(state) {
  if(state.tutorial?.active&&!state.tutorial.completed&&!state.tutorial.observedBuild)return;
  const director=ensureChaosDirector(state);
  state.eventCountsByDay??={};
  const eventDay=Math.floor(state.elapsed/24);
  const slotsUsed=()=>state.eventCountsByDay[eventDay]??0;
  let queuedThisPass=false;
  state.nextMajorEventAt??=0;
  const shiftWarmupUntil=(state.shiftStartedAt??eventDay*24)+.75;
  const queueMajor=(id)=>{if(slotsUsed()>=5||queuedThisPass||state.eventQueue.length||state.elapsed<state.nextMajorEventAt||state.elapsed<shiftWarmupUntil)return false;const directed=directedEventId(state,id);state.eventCountsByDay[eventDay]=slotsUsed()+1;state.eventQueue.push(directed);state.paused=true;queuedThisPass=true;state.nextMajorEventAt=state.elapsed+1.35;director.history.push(directed);director.history=director.history.slice(-12);state.communicationHistory.push({id:`incoming-${directed}-${state.elapsed}`,channel:'incoming',eventId:directed,text:randomEventById.get(directed)?.title??directed,at:state.elapsed});state.communicationHistory=state.communicationHistory.slice(-40);return true;};
  if(director.chain&&state.elapsed>=director.nextFollowupAt&&slotsUsed()<5){
    const chained=directedEventId(state,director.chain.originId);
    if(queueMajor(chained)){director.chain.remaining-=1;director.nextFollowupAt=state.elapsed+2.2;if(director.chain.remaining<=0)director.chain=null;return;}
  }
  const paintTask=state.tasks.find(task=>['paint','wall-finish'].includes(task.id));
  const prepTask=state.tasks.find(task=>['prep','protection','partitions'].includes(task.id));
  const paintIsCurrent=paintTask?.status==='active'||paintTask?.enabledToday||prepTask?.status==='done';
  if (state.elapsed >= 2.2 && state.paintEventOccurs!==false && paintIsCurrent && !state.eventsSeen.includes('paint-change')) {
    if(queueMajor('paint-change'))state.eventsSeen.push('paint-change');
  }
  const scheduled=state.eventSchedule?.length?state.eventSchedule:(state.randomEvents??[state.randomEvent??'noise']).map((id,index)=>({id,hour:[2,4.5,7][index%3]+Math.floor(index/3)*24}));
  scheduled.forEach((scheduledEvent,index)=>{
    const seenId=`random-${index}`;
    const event=randomEventById.get(scheduledEvent.id);
    if(state.elapsed>=scheduledEvent.hour&&!state.eventsSeen.includes(seenId)) {
      if(scheduledEvent.occurs===false||slotsUsed()>=5){state.eventsSeen.push(seenId);return;}
      if(!isEventRelevant(state,event)){scheduledEvent.hour=state.elapsed+.65;return;}
      if(queueMajor(scheduledEvent.id))state.eventsSeen.push(seenId);else scheduledEvent.hour=Math.max(scheduledEvent.hour,state.elapsed+.45);
    }
  });
  if(state.sceneEffect?.expiresAt&&state.elapsed>=state.sceneEffect.expiresAt) {
    state.sceneEffect=null;
  }
}

function applyProductionTimeImpact(state,hours=0,reason='Событие',scope='all') {
  if(!hours)return;
  if(hours>0){
    state.productionDelayHours=(state.productionDelayHours??0)+hours;
    state.productionDelayReason=reason;
    state.productionDelayScope=scope;
    return;
  }
  let credit=Math.abs(hours);
  const active=state.tasks.filter(task=>task.status==='active').sort((a,b)=>b.priority-a.priority);
  for(const task of active){
    if(credit<=0)break;
    const useful=Math.min(credit,Math.max(0,(1-task.progress)*task.duration));
    task.progress=Math.min(.99,task.progress+useful/task.duration);
    credit-=useful;
  }
  state.productionTimeCredit=(state.productionTimeCredit??0)+Math.abs(hours)-credit;
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
      applyProductionTimeImpact(state,5,'Ограничение шума');
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
      applyProductionTimeImpact(state,6,'Обычная доставка');
      state.quality += 1;
    }
  }
  if (eventId === 'calendar') {
    if (choiceId === 'reserve') {
      state.budget -= 24;
      state.trust += 2;
    } else {
      applyProductionTimeImpact(state,8,'Согласование календаря');
      state.trust -= 2;
    }
  }
  if (eventId === 'client-ghost') {
    if (choiceId === 'matrix') {
      state.budget -= 8;
      state.trust += 3;
    } else {
      applyProductionTimeImpact(state,7,'Ожидание заказчика');
      state.trust -= 3;
    }
  }
  if (eventId === 'italian-sofa') {
    if (choiceId === 'local') {
      state.quality -= 1;
      state.trust -= 2;
    } else {
      state.budget -= 62;
      applyProductionTimeImpact(state,3,'Ожидание мебели');
      state.quality += 3;
    }
  }
  state.quality = Math.max(0, Math.min(100, state.quality));
  state.trust = Math.max(0, Math.min(100, state.trust));
  const budgetDelta=state.budget-budgetBefore;if(budgetDelta)recordCash(state,budgetDelta>0?'income':'expense','Событие',Math.abs(budgetDelta),eventId);
  state.eventQueue = state.eventQueue.filter((id) => id !== eventId);
  state.nextMajorEventAt=Math.max(state.nextMajorEventAt??0,state.elapsed+1.35);
  state.paused = false;
}

export function applyCatalogEventChoice(state, event, choiceId) {
  const option=event?.options?.find(item=>item.id===choiceId);
  if(!option) return false;
  const director=ensureChaosDirector(state);const channel=eventDecisionChannel(event,option);
  const deltas=option.deltas??{};
  state.budget+=deltas.budget??0;
  if(option.financial==='client-extra'&&deltas.budget>0){state.contract.budget+=deltas.budget;if(state.finance)state.finance.contractValue=(state.finance.contractValue??0)+deltas.budget;}
  if(deltas.budget)recordCash(state,deltas.budget>0?'income':'expense',option.financial==='client-extra'?'Допфинансирование заказчика':'Событие',Math.abs(deltas.budget),event.title,{clientPayment:option.financial==='client-extra'&&deltas.budget>0});
  state.quality+=deltas.quality??0;
  state.trust+=deltas.trust??0;
  applyProductionTimeImpact(state,deltas.time??0,event.title,option.delayScope??'all');
  if(deltas.deadline)state.contract.deadlineHours=Math.max(9,state.contract.deadlineHours+deltas.deadline);
  const scene={...(option.scene??{})};
  const duration=Math.max(5,scene.hideHours??8);
  state.sceneEffect={...scene,eventId:event.id,expiresAt:state.elapsed+duration};
  if(scene.hideSkill) {
    const hiddenCrews=state.crews.filter(item=>item.skill===scene.hideSkill&&(scene.hideScope!=='company'||!item.id.startsWith('crew-'))&&(scene.hideScope!=='contractor'||item.id.startsWith('crew-')));
    for(const crew of hiddenCrews) {
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
  state.nextMajorEventAt=Math.max(state.nextMajorEventAt??0,state.elapsed+1.35);
  state.paused=false;
  const themes=eventTheme(event);
  director.chain={originId:event.id,themes,remaining:1,nextFollowupAt:state.elapsed+2.2};
  director.nextFollowupAt=state.elapsed+2.2;
  state.communicationHistory.push({id:`reply-${event.id}-${state.elapsed}`,channel,eventId:event.id,title:option.title,text:option.effect,consequence:{...deltas},at:state.elapsed});
  state.communicationHistory=state.communicationHistory.slice(-40);
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
  syncOrganizationCalendar(state);
  const currentDay=Math.floor(state.elapsed/24);
  if(state.elapsed>=currentDay*24+9&&(state.reportedDay??-1)<currentDay){state.needsReport=true;state.paused=true;state.speed=1;return state;}
  const dayIndex=Math.floor(state.elapsed/24);
  if(dayIndex>state.plannedDay){state.needsPlanning=true;state.paused=true;state.speed=1;for(const task of state.tasks)task.enabledToday=false;return state;}
  let productiveHours=deltaHours;
  const legacyPhysicalDelay=state.productionDelayScope==null&&String(state.productionDelayReason??'').includes('Миграционная служба');
  const delayScope=legacyPhysicalDelay?'physical':(state.productionDelayScope??'all');
  if((state.productionDelayHours??0)>0){
    const consumed=Math.min(productiveHours,state.productionDelayHours);
    state.productionDelayHours=Math.max(0,state.productionDelayHours-consumed);
    if(state.productionDelayHours<=1e-6)state.productionDelayScope=null;
    productiveHours-=consumed;
    updateAmbientActivity(state);
    if(productiveHours<=0&&delayScope==='all')return state;
  }
  state.smokeBreak=Math.floor(state.elapsed/8)%4===2;
  updateAmbientActivity(state);
  updateSituations(state);
  unlockTasks(state);
  assignCrews(state);
  updateCrewPositions(state, productiveHours);
  activatePendingManpower(state);
  state.siteCongestion=calculateSiteCongestion(state);
  const cleanliness=updateSiteCleanliness(state,productiveHours);

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
    const taskProductiveHours=delayScope==='physical'&&NON_PHYSICAL_TASKS.has(task.id)?deltaHours:productiveHours;
    if(taskProductiveHours<=0)continue;
    const siteDiscipline=state.smokeBreak&&crew.id!=='foreman'?.82:1;
    const control=taskControlFactor(state,task,crew);task.controlFactor=control.factor;task.controlLabel=control.label;
    const occupiedPenalty=state.selectedOrder?.occupiedOffice?.82:1;const mismatchPenalty=task.profileMismatch?.55:1;const pressure=state.elapsed<(task.pressureUntil??0)?(task.pressureFactor??1):1;const playerPresence=state.playerZoneTaskId===task.id?1.18+bossArtifactBonus(state,'presence'):1;const crowdingPenalty=(state.siteCongestion?.penalty??1)*localCrowdingPenalty(state,task);
    const baseManpower=Math.max(1,crew.baseManpower??crewHeadcount(state,crew));const actualManpower=crewHeadcount(state,crew);const manpowerFactor=THREELESS_CLAMP(1+(actualManpower-baseManpower)*(actualManpower>=baseManpower?.06:.075),.65,1.3);
    const cleanupDistraction=task.skill==='cleaning'||NON_PHYSICAL_TASKS.has(task.id)?1:cleanliness.distraction*(state.skippedTempoFactor??1);
    const artifactSpeed=task.id==='survey'?1+bossArtifactBonus(state,'surveySpeed'):1;
    task.progress += calculateProductionDelta({hours:taskProductiveHours,duration:task.duration,speed:crew.speed*artifactSpeed,discipline:siteDiscipline,control:control.factor,occupancy:occupiedPenalty,mismatch:mismatchPenalty,pressure,presence:playerPresence,crowding:crowdingPenalty,manpower:manpowerFactor,cleanup:cleanupDistraction});
    if (task.progress >= 1) completeTask(state, task, crew);
  }

  if(!state.sitePhysicallyComplete&&state.tasks.filter(task=>!['project','executive-docs','inspect'].includes(task.id)).every(task=>['done','skipped','awaiting'].includes(task.status))) {
    state.sitePhysicallyComplete=true;state.log.push({type:'done',text:'Физические работы закончены. Деньги ещё удерживает комплект ИД.'});
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
  if (state.tasks.every((task) => ['done','skipped'].includes(task.status))) {settleProjectEconomy(state);state.completed = true;}
  return state;
}

export function getRisk(state) {
  if (state.budget < 0) return { level: 'critical', text: 'Бюджет превышен — согласуйте резерв' };
  const readySkills = [...new Set(state.tasks.filter((task) => task.status === 'ready').map((task) => task.skill))];
  const missing = readySkills.find((skill) => !state.crews.some((crew) => crew.skill === skill||crew.skill==='general'));
  const labels = { design:'архитектор проекта',documentation:'специалист исполнительной документации',general:'подсобные рабочие',demolition:'общестроительная бригада',construction:'общестроительная бригада',engineering:'монтажники инженерных сетей',moving:'подсобные рабочие',paint:'отделочники',electric:'электрики',furniture:'сборщики мебели',cleaning:'клининг' };
  if (missing) return { level: 'warning', text: `Нет бригады: ${labels[missing] ?? missing}` };
  const deadline=state.contract?.deadlineHours??DEADLINE_HOURS;
  const qualityTarget=state.contract?.qualityTarget??78;
  if (state.elapsed > deadline * 0.78 && !state.completed) return { level: 'critical', text: 'Срок под угрозой — ускорьте критические работы' };
  if((state.siteCongestion?.penalty??1)<.88)return {level:'warning',text:`На объекте тесно: темп −${Math.round((1-state.siteCongestion.penalty)*100)}%`};
  if((state.siteDirt??0)>70)return {level:'warning',text:'Объект зарастает мусором: бригады убирают вместо своей работы'};
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
  syncActiveProjectToPortfolio(state);
  return JSON.stringify(state);
}

export function restoreState(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed) return null;
    ensureGameSaveV2(parsed);
    if((!Array.isArray(parsed.tasks)||!Array.isArray(parsed.crews))&&parsed.portfolio?.activeProjectId)activatePortfolioProject(parsed,parsed.portfolio.activeProjectId);
    if (!Array.isArray(parsed.tasks) || !Array.isArray(parsed.crews)) return null;
    ensureProjectFinance(parsed);
    return parsed;
  } catch {
    return null;
  }
}
