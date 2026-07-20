import {
  CHANGE_ORDER_LIBRARY,
  COMPANY_EVENT_LIBRARY,
  COMPANY_ROLES,
  PERSONAL_EVENT_LIBRARY,
  generateEmployee,
  generateStaffMarket,
  nextEmployeeThought,
} from './company-content.js';

export const SAVE_SCHEMA_VERSION=2;
export const MAX_ACTIVE_PROJECTS=3;

const GLOBAL_KEYS=new Set(['schemaVersion','company','organization','portfolio','staff','contractorNetwork','market','companyCalendar','hq','playerAvatar','orderOptions','companyInbox','companyEventHistory','migration']);
const clone=(value)=>value===undefined?undefined:(globalThis.structuredClone?structuredClone(value):JSON.parse(JSON.stringify(value)));
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const projectIdOf=(state)=>state.selectedOrder?.id??`project-${state.visualSeed??Date.now()}`;
const dayRoll=(day,salt=0)=>{const value=Math.sin((day+1)*12.9898+salt*78.233)*43758.5453;return value-Math.floor(value);};

export function calculateProductionDelta({hours=0,duration=1,speed=1,discipline=1,control=1,occupancy=1,mismatch=1,pressure=1,presence=1,crowding=1,manpower=1,cleanup=1}={}){
  return Math.max(0,hours)*speed*discipline*control*occupancy*mismatch*pressure*presence*crowding*manpower*cleanup/Math.max(1,duration);
}

function defaultCompany(legacy={}){
  return {
    ...clone(legacy),
    name:legacy.name??'ООО «Потом согласуем»',cash:legacy.cash??320,reserve:legacy.reserve??0,debt:legacy.debt??0,loans:clone(legacy.loans??[]),arrears:legacy.arrears??0,
    calendarDay:legacy.calendarDay??0,paymentsMade:legacy.paymentsMade??0,playerXp:legacy.playerXp??0,playerLevel:legacy.playerLevel??1,reputation:legacy.reputation??50,
    projectsCompleted:legacy.projectsCompleted??0,totalProfit:legacy.totalProfit??0,inHouseDesign:Boolean(legacy.inHouseDesign),history:clone(legacy.history??[]),staffXp:clone(legacy.staffXp??{}),contractorXp:clone(legacy.contractorXp??{}),
    ledger:clone(legacy.ledger??[]),obligations:clone(legacy.obligations??[]),receivables:legacy.receivables??0,payables:legacy.payables??0,payrollArrears:legacy.payrollArrears??0,
    crisis:legacy.crisis??null,bankrupt:Boolean(legacy.bankrupt),reserveTarget:legacy.reserveTarget??.1,lastPayrollPeriod:legacy.lastPayrollPeriod??null,
  };
}

function coreEmployees(seed=1){
  return ['accountant','estimator','foreman'].map((role,index)=>{
    const employee=generateEmployee(seed+index*37,role,'employed');
    employee.name=[['Лидия','Балансова'],['Аркадий','Сметанин'],['Павел','Прорабов']][index].join(' ');
    employee.initials=employee.name.split(' ').map(part=>part[0]).join('');
    return employee;
  });
}

function createStaffLayer(state,seed=1){
  const employees=coreEmployees(seed);
  for(const member of state.team??[]){
    if(!member.hired)continue;
    const roleId=member.id==='pm'?'project-manager':member.id==='procurement'?'procurement':member.id==='designer'?'designer':member.id==='doc-control'?'pto':'safety';
    if(employees.some(item=>item.roleId===roleId))continue;
    const employee=generateEmployee(seed+employees.length*43,roleId,'employed');Object.assign(employee,{name:member.name,initials:member.initials,color:member.color,level:member.level??1});employees.push(employee);
  }
  return {employees,candidates:generateStaffMarket(seed+701,18),outsourcedRoles:[],assignments:[],lastMarketRefreshDay:0};
}

function createContractorNetwork(state){
  return (state.contractors??[]).map((contractor,index)=>({
    id:contractor.id,company:contractor.company,name:contractor.name,specialty:contractor.skill,color:contractor.color,manpower:contractor.manpower??3,
    price:contractor.price,speed:contractor.speed,quality:contractor.quality,rating:contractor.rating??70,reliability:clamp((contractor.rating??70)+((index%3)-1)*5,35,98),
    relationship:50,level:contractor.level??1,xp:0,availabilityDay:0,activeProjectId:null,paymentTermsDays:3+(index%5),advanceRate:.25,retentionRate:.1,history:[],quirk:contractor.quirk,
  }));
}

function captureProjectSnapshot(state){
  const snapshot={};
  for(const [key,value] of Object.entries(state))if(!GLOBAL_KEYS.has(key))snapshot[key]=clone(value);
  return snapshot;
}

function projectProgress(snapshot){
  const tasks=snapshot.tasks??[];if(!tasks.length)return 0;
  return Math.round(tasks.reduce((sum,task)=>sum+(task.status==='done'||task.status==='skipped'?1:task.progress??0),0)/tasks.length*100);
}

export function projectForecast(project){
  const snapshot=project.snapshot??{};const contractValue=snapshot.finance?.contractValue??snapshot.contract?.budget??snapshot.selectedOrder?.budget??0;
  const spent=snapshot.finance?.spent??0;const committed=(snapshot.contractors??[]).filter(item=>item.hired).reduce((sum,item)=>sum+Math.round(item.price*.35),0);
  const remainingCost=Math.max(0,(snapshot.tasks??[]).filter(task=>!['done','skipped'].includes(task.status)).reduce((sum,task)=>sum+task.cost*(1-(task.progress??0))*.42,0));
  const forecastCost=Math.round(spent+committed+remainingCost);const forecastProfit=Math.round(contractValue-forecastCost);const available=(snapshot.budget??0);
  return {contractValue,forecastCost,forecastProfit,cashGap:Math.max(0,Math.round(remainingCost-available)),margin:contractValue?Math.round(forecastProfit/contractValue*100):0};
}

function projectSummary(record){
  const snapshot=record.snapshot;const forecast=projectForecast(record);
  return {title:snapshot.selectedOrder?.title??record.title??'Безымянный объект',location:snapshot.selectedOrder?.location??record.location??'Адрес согласуется',area:snapshot.selectedOrder?.area??0,progress:projectProgress(snapshot),quality:Math.round(snapshot.quality??0),trust:Math.round(snapshot.trust??0),budget:Math.round(snapshot.budget??0),elapsed:snapshot.elapsed??0,deadline:snapshot.contract?.deadlineHours??0,completed:Boolean(snapshot.completed),started:Boolean(snapshot.started),forecastProfit:forecast.forecastProfit,cashGap:forecast.cashGap,margin:forecast.margin};
}

export function createProjectRecord(projectState,mode='manual'){
  const id=projectIdOf(projectState);const snapshot=captureProjectSnapshot(projectState);
  const record={id,createdDay:projectState.companyCalendar?.day??projectState.company?.calendarDay??0,delegation:{mode,priority:'margin',spendLimit:80,maxDelayDays:1,changePolicy:'formal',replaceContractor:true},managerEmployeeId:null,staffIds:[],materialOrders:[],changeOrders:[],eventHistory:[],snapshot};
  record.summary=projectSummary(record);return record;
}

export function ensureGameSaveV2(state,seed=state?.visualSeed??17){
  if(!state||typeof state!=='object')return state;
  const previousVersion=state.schemaVersion??1;
  const legacy=state.company??state.organization??{};
  const normalized=defaultCompany(legacy);const company=state.company&&typeof state.company==='object'?legacy:normalized;
  for(const [key,value] of Object.entries(normalized))if(company[key]===undefined)company[key]=clone(value);
  state.company=company;state.organization=company;
  state.schemaVersion=SAVE_SCHEMA_VERSION;
  state.companyCalendar??={day:state.company.calendarDay??0,month:Math.floor((state.company.calendarDay??0)/30)+1,paused:Boolean(state.paused),lastClosedDay:Math.max(-1,(state.company.calendarDay??0)-1)};
  state.companyCalendar.day??=state.company.calendarDay??0;state.company.calendarDay=state.companyCalendar.day;
  state.staff??=createStaffLayer(state,seed);state.staff.employees??=[];state.staff.candidates??=[];state.staff.assignments??=[];state.staff.outsourcedRoles??=[];
  state.contractorNetwork??=createContractorNetwork(state);
  state.market??={staffSeed:seed+701,contractorSeed:seed+991,lastRefreshDay:0};
  state.companyInbox??=[];state.companyEventHistory??=[];
  state.portfolio??={projects:[],activeProjectId:null,maxActive:MAX_ACTIVE_PROJECTS,archive:[]};
  state.portfolio.projects??=[];state.portfolio.archive??=[];state.portfolio.maxActive=MAX_ACTIVE_PROJECTS;
  if(state.selectedOrder){
    const id=projectIdOf(state);let current=state.portfolio.projects.find(project=>project.id===id);
    if(!current){current=createProjectRecord(state);state.portfolio.projects.push(current);}
    state.portfolio.activeProjectId??=id;
  }
  state.migration??={from:previousVersion===SAVE_SCHEMA_VERSION?'v2':'legacy',at:Date.now()};
  refreshCompanyTotals(state);return state;
}

export function syncActiveProjectToPortfolio(state){
  ensureGameSaveV2(state);if(!state.selectedOrder)return null;
  const id=state.portfolio.activeProjectId??projectIdOf(state);let record=state.portfolio.projects.find(project=>project.id===id);
  if(!record){record=createProjectRecord(state);state.portfolio.projects.push(record);}
  record.snapshot=captureProjectSnapshot(state);record.summary=projectSummary(record);state.portfolio.activeProjectId=record.id;return record;
}

export function addPortfolioProject(state,projectState,mode='supervised'){
  ensureGameSaveV2(state);syncActiveProjectToPortfolio(state);
  if(state.portfolio.projects.filter(project=>!project.summary?.completed).length>=MAX_ACTIVE_PROJECTS)return {ok:false,reason:'limit'};
  const record=createProjectRecord(projectState,mode);if(state.portfolio.projects.some(project=>project.id===record.id))return {ok:false,reason:'duplicate'};
  state.portfolio.projects.push(record);postLedgerEntry(state,{type:'memo',category:'Новый объект',amount:0,projectId:record.id,text:`В портфель добавлен «${record.summary.title}»`});return {ok:true,project:record};
}

export function activatePortfolioProject(state,projectId){
  ensureGameSaveV2(state);syncActiveProjectToPortfolio(state);const target=state.portfolio.projects.find(project=>project.id===projectId);if(!target)return {ok:false,reason:'missing'};
  const globals={};for(const key of GLOBAL_KEYS)if(state[key]!==undefined)globals[key]=state[key];
  for(const key of Object.keys(state))if(!GLOBAL_KEYS.has(key))delete state[key];
  Object.assign(state,clone(target.snapshot),globals);state.portfolio.activeProjectId=projectId;state.company=globals.company;state.organization=state.company;target.summary=projectSummary(target);return {ok:true,project:target};
}

export function archiveCompletedProjects(state){
  ensureGameSaveV2(state);syncActiveProjectToPortfolio(state);const completed=state.portfolio.projects.filter(project=>project.summary?.completed&&project.id!==state.portfolio.activeProjectId);
  state.portfolio.archive.unshift(...completed);state.portfolio.archive=state.portfolio.archive.slice(0,50);state.portfolio.projects=state.portfolio.projects.filter(project=>!completed.includes(project));return completed.length;
}

export function setProjectDelegation(state,projectId,mode,policy={}){
  ensureGameSaveV2(state);if(!['manual','supervised','autonomous'].includes(mode))return {ok:false,reason:'mode'};const project=state.portfolio.projects.find(item=>item.id===projectId);if(!project)return {ok:false,reason:'missing'};
  project.delegation={...project.delegation,...policy,mode};return {ok:true,delegation:project.delegation};
}

export function assignEmployee(state,employeeId,projectId){
  ensureGameSaveV2(state);const employee=state.staff.employees.find(item=>item.id===employeeId&&item.status==='employed');const project=state.portfolio.projects.find(item=>item.id===projectId);if(!employee||!project)return {ok:false,reason:'missing'};
  const day=state.companyCalendar.day;if(employee.unavailableUntilDay>day)return {ok:false,reason:'unavailable'};
  const oldProject=employee.assignedProjectId?state.portfolio.projects.find(item=>item.id===employee.assignedProjectId):null;if(oldProject)oldProject.staffIds=oldProject.staffIds.filter(id=>id!==employeeId);
  employee.assignedProjectId=projectId;project.staffIds??=[];if(!project.staffIds.includes(employeeId))project.staffIds.push(employeeId);
  state.staff.assignments=state.staff.assignments.filter(item=>!(item.day===day&&item.employeeId===employeeId));state.staff.assignments.push({employeeId,projectId,day,kind:'primary'});
  if(employee.roleId==='project-manager'||employee.roleId==='foreman')project.managerEmployeeId=employeeId;return {ok:true,employee,project};
}

export function emergencyTransferEmployee(state,employeeId,projectId){
  ensureGameSaveV2(state);const employee=state.staff.employees.find(item=>item.id===employeeId);const day=state.companyCalendar.day;if(!employee)return {ok:false,reason:'missing'};if(employee.transferDay===day)return {ok:false,reason:'already-transferred'};
  const from=employee.assignedProjectId;const result=assignEmployee(state,employeeId,projectId);if(!result.ok)return result;employee.transferDay=day;employee.stress=clamp(employee.stress+15,0,100);employee.energy=clamp(employee.energy-12,0,100);state.staff.assignments.push({employeeId,projectId,fromProjectId:from,day,kind:'emergency',lostHours:2});
  return {...result,lostHours:2};
}

export function hireEmployee(state,candidateId){
  ensureGameSaveV2(state);const index=state.staff.candidates.findIndex(item=>item.id===candidateId);if(index<0)return {ok:false,reason:'missing'};const employee=state.staff.candidates[index];const hiringCost=Math.round(employee.salary*.35);if(state.company.cash<hiringCost)return {ok:false,reason:'cash',cost:hiringCost};
  postLedgerEntry(state,{type:'expense',category:'Найм',amount:hiringCost,text:`Подбор и выход: ${employee.name}`});employee.status='employed';state.staff.employees.push(employee);state.staff.candidates.splice(index,1);return {ok:true,employee,cost:hiringCost};
}

export function dismissEmployee(state,employeeId){
  ensureGameSaveV2(state);const employee=state.staff.employees.find(item=>item.id===employeeId);if(!employee)return {ok:false,reason:'missing'};const severance=Math.round(employee.salary*.5);if(state.company.cash<severance)return {ok:false,reason:'cash',cost:severance};postLedgerEntry(state,{type:'expense',category:'Увольнение',amount:severance,text:`Расчёт: ${employee.name}`});employee.status='dismissed';employee.assignedProjectId=null;for(const project of state.portfolio.projects)project.staffIds=(project.staffIds??[]).filter(id=>id!==employeeId);return {ok:true,employee,cost:severance};
}

export function toggleOutsourcedRole(state,roleId){
  ensureGameSaveV2(state);if(!COMPANY_ROLES.some(role=>role.id===roleId))return {ok:false,reason:'role'};const active=state.staff.outsourcedRoles.includes(roleId);
  state.staff.outsourcedRoles=active?state.staff.outsourcedRoles.filter(id=>id!==roleId):[...state.staff.outsourcedRoles,roleId];return {ok:true,active:!active};
}

export function postLedgerEntry(state,{type='memo',category='Прочее',amount=0,projectId=null,counterparty=null,text='',dueDay=null}){
  ensureGameSaveV2(state);const safeAmount=Math.max(0,Math.round(amount));const entry={id:`ledger-${state.company.ledger.length}-${Date.now()}`,day:state.companyCalendar.day,type,category,amount:safeAmount,projectId,counterparty,text,dueDay};
  if(type==='income')state.company.cash+=safeAmount;if(type==='expense')state.company.cash-=safeAmount;if(type==='reserve-in'){state.company.cash-=safeAmount;state.company.reserve+=safeAmount;}if(type==='reserve-out'){const withdrawn=Math.min(state.company.reserve,safeAmount);state.company.reserve-=withdrawn;state.company.cash+=withdrawn;entry.amount=withdrawn;}
  state.company.ledger.unshift(entry);state.company.ledger=state.company.ledger.slice(0,600);refreshCompanyTotals(state);return entry;
}

export function createObligation(state,{direction='payable',kind='other',amount,projectId=null,counterparty='Контрагент',dueDay=(state.companyCalendar?.day??0)+3,text=''}){
  ensureGameSaveV2(state);const obligation={id:`obligation-${state.company.obligations.length}-${Date.now()}`,direction,kind,amount:Math.max(0,Math.round(amount)),remaining:Math.max(0,Math.round(amount)),projectId,counterparty,dueDay,status:'open',createdDay:state.companyCalendar.day,text};state.company.obligations.push(obligation);refreshCompanyTotals(state);return obligation;
}

export function settleObligation(state,obligationId,amount=null){
  ensureGameSaveV2(state);const obligation=state.company.obligations.find(item=>item.id===obligationId);if(!obligation||obligation.status==='paid')return {ok:false,reason:'missing'};const requested=Math.min(obligation.remaining,Math.max(0,Math.round(amount??obligation.remaining)));
  if(obligation.direction==='payable'&&state.company.cash<requested)return {ok:false,reason:'cash',needed:requested-state.company.cash};
  postLedgerEntry(state,{type:obligation.direction==='payable'?'expense':'income',category:obligation.kind,amount:requested,projectId:obligation.projectId,counterparty:obligation.counterparty,text:obligation.text||`Расчёт: ${obligation.counterparty}`});obligation.remaining-=requested;if(obligation.remaining<=0){obligation.remaining=0;obligation.status='paid';obligation.paidDay=state.companyCalendar.day;}else obligation.status='partial';refreshCompanyTotals(state);return {ok:true,obligation,amount:requested};
}

function refreshCompanyTotals(state){
  const open=state.company.obligations??[];state.company.receivables=Math.round(open.filter(item=>item.direction==='receivable'&&item.status!=='paid').reduce((sum,item)=>sum+item.remaining,0));state.company.payables=Math.round(open.filter(item=>item.direction==='payable'&&item.status!=='paid').reduce((sum,item)=>sum+item.remaining,0));
  state.company.payrollArrears=Math.round(open.filter(item=>item.direction==='payable'&&item.kind==='payroll'&&item.status!=='paid'&&item.dueDay<=(state.companyCalendar?.day??0)).reduce((sum,item)=>sum+item.remaining,0));
}

export function createMaterialOrder(state,projectId,{title='Пакет материалов',taskIds=[],amount=50,quality=1,leadDays=2,certificates=true,paymentTermsDays=2}={}){
  ensureGameSaveV2(state);const project=state.portfolio.projects.find(item=>item.id===projectId);if(!project)return {ok:false,reason:'project'};const order={id:`material-${project.materialOrders.length}-${Date.now()}`,title,taskIds:[...taskIds],amount:Math.round(amount),quality,orderedDay:state.companyCalendar.day,deliveryDay:state.companyCalendar.day+leadDays,status:'ordered',certificates,paymentTermsDays,remaining:1};project.materialOrders.push(order);
  createObligation(state,{direction:'payable',kind:'materials',amount,projectId,counterparty:title,dueDay:order.deliveryDay+paymentTermsDays,text:`Материалы: ${title}`});return {ok:true,order};
}

export function createChangeOrder(state,projectId,templateId=null){
  ensureGameSaveV2(state);const project=state.portfolio.projects.find(item=>item.id===projectId);if(!project)return {ok:false,reason:'project'};const template=CHANGE_ORDER_LIBRARY.find(item=>item.id===templateId)??CHANGE_ORDER_LIBRARY[Math.floor(dayRoll(state.companyCalendar.day,projectId.length)*CHANGE_ORDER_LIBRARY.length)];const change={...clone(template),uid:`${template.id}-${state.companyCalendar.day}-${project.changeOrders.length}`,status:'requested',requestedDay:state.companyCalendar.day,funding:'unknown'};project.changeOrders.push(change);state.companyInbox.unshift({id:`inbox-${change.uid}`,kind:'change-order',projectId,title:change.title,text:change.description,urgent:true,createdDay:state.companyCalendar.day});return {ok:true,change};
}

function employeeRoleScore(state,roleIds,projectId=null){
  const employees=state.staff.employees.filter(employee=>employee.status==='employed'&&roleIds.includes(employee.roleId)&&(!projectId||employee.assignedProjectId===projectId||employee.assignedProjectId===null));
  const own=employees.reduce((best,employee)=>Math.max(best,employee.competence+employee.level*6-employee.stress*.25),0);const outsourced=roleIds.some(id=>state.staff.outsourcedRoles.includes(id))?52:0;return Math.max(own,outsourced);
}

export function resolveChangeOrder(state,projectId,changeId,strategy,rng=Math.random){
  ensureGameSaveV2(state);const project=state.portfolio.projects.find(item=>item.id===projectId);const change=project?.changeOrders.find(item=>item.uid===changeId);if(!change||change.status!=='requested')return {ok:false,reason:'change'};const snapshot=project.snapshot;const skill=employeeRoleScore(state,['estimator','lawyer','project-manager'],projectId);let approved=false;
  if(strategy==='formal'){approved=rng()<clamp(.28+skill/150,0.28,.92);change.status=approved?'approved':'rejected';change.funding=approved?'client':'unfunded';if(approved){snapshot.contract.budget+=change.cost;snapshot.finance.contractValue=(snapshot.finance.contractValue??snapshot.contract.budget)+change.cost;snapshot.contract.deadlineHours+=change.durationHours;}else snapshot.trust=clamp((snapshot.trust??60)-4,0,100);}
  else if(strategy==='risk'){change.status='in-progress';change.funding='company';applyChangeWork(snapshot,change);}
  else if(strategy==='refuse'){change.status='refused';snapshot.trust=clamp((snapshot.trust??60)-12,0,100);}
  else if(strategy==='subcontract'){change.status='in-progress';change.funding='contractor';applyChangeWork(snapshot,change);createObligation(state,{direction:'payable',kind:'contractor',amount:Math.round(change.cost*.78),projectId,counterparty:'Подрядчик по изменениям',dueDay:state.companyCalendar.day+5,text:change.title});}
  else if(strategy==='magic'){approved=rng()<.16;change.status=approved?'approved':'in-progress';change.funding=approved?'client':'company';if(approved){snapshot.contract.budget+=change.cost;snapshot.contract.deadlineHours+=change.durationHours;}else applyChangeWork(snapshot,change);}
  else return {ok:false,reason:'strategy'};
  project.summary=projectSummary(project);state.companyInbox=state.companyInbox.filter(item=>item.kind!=='change-order'||item.projectId!==projectId||!item.id.includes(changeId));return {ok:true,change,approved};
}

function applyChangeWork(snapshot,change){
  const candidates=(snapshot.tasks??[]).filter(task=>!['done','skipped'].includes(task.status));const task=candidates[0]??snapshot.tasks?.at(-1);if(task){task.duration=Math.round(task.duration*change.workMultiplier+change.durationHours);task.cost+=change.cost;task.changeOrderId=change.uid;}snapshot.budget-=Math.round(change.cost*.15);snapshot.log?.push({type:'risk',text:`Изменение вошло в работу без подтверждённого финансирования: ${change.title}`});
}

function backgroundUnlock(snapshot){
  for(const task of snapshot.tasks??[]){if(['done','skipped','awaiting','active'].includes(task.status))continue;task.status=task.deps?.every(id=>['done','skipped'].includes(snapshot.tasks.find(item=>item.id===id)?.status))?'ready':'locked';}
}

function simulateBackgroundProject(state,project,hours=9){
  const snapshot=project.snapshot;if(!snapshot.started||snapshot.completed)return {progress:0,completed:false};backgroundUnlock(snapshot);
  const manager=state.staff.employees.find(item=>item.id===project.managerEmployeeId);const assigned=state.staff.employees.filter(item=>(project.staffIds??[]).includes(item.id)&&item.status==='employed');const management=(manager?.competence??35)/100;const mode=project.delegation?.mode??'supervised';const capacity=mode==='autonomous'?3:mode==='supervised'?2:1;const ready=(snapshot.tasks??[]).filter(task=>task.status==='ready').sort((a,b)=>(b.priority??1)-(a.priority??1)).slice(0,capacity);
  for(const task of ready)task.status='active';const active=(snapshot.tasks??[]).filter(task=>task.status==='active');const attention=Math.max(.45,Math.min(1.25,.62+management*.45+assigned.length*.06));let delta=0;
  for(const task of active){const before=task.progress??0;task.progress=clamp(before+calculateProductionDelta({hours,duration:Math.max(4,task.duration),speed:attention}),0,1);delta+=task.progress-before;if(task.progress>=1){const acceptance=.45+management*.35+assigned.some(employee=>employee.roleId==='pto')*.12;if(mode!=='manual'&&dayRoll(state.companyCalendar.day,task.id.length)<acceptance){task.status='done';snapshot.quality=clamp((snapshot.quality??70)+(task.quality??1)*.4,0,100);const value=Math.max(8,Math.round(task.cost*1.15));createObligation(state,{direction:'receivable',kind:'stage-payment',amount:value,projectId:project.id,counterparty:snapshot.selectedOrder?.client??'Заказчик',dueDay:state.companyCalendar.day+2+Math.floor(dayRoll(state.companyCalendar.day,value)*5),text:`Принято: ${task.title}`});}else task.status='awaiting';}}
  backgroundUnlock(snapshot);snapshot.elapsed=(snapshot.elapsed??0)+hours;snapshot.budget-=Math.max(4,Math.round(active.length*5+assigned.length*2));if((snapshot.tasks??[]).every(task=>['done','skipped'].includes(task.status)))snapshot.completed=true;project.summary=projectSummary(project);return {progress:delta,completed:snapshot.completed};
}

export function simulatePortfolioDay(state){
  ensureGameSaveV2(state);syncActiveProjectToPortfolio(state);const results=[];for(const project of state.portfolio.projects){if(project.id===state.portfolio.activeProjectId)continue;results.push({projectId:project.id,...simulateBackgroundProject(state,project,9)});}return results;
}

function accruePayroll(state,day){
  const dayInMonth=((day-1)%30)+1;if(dayInMonth!==15&&dayInMonth!==30)return 0;
  const month=Math.floor((day-1)/30);const period=`${month}-${dayInMonth===15?1:2}`;if(state.company.lastPayrollPeriod===period)return 0;const dueDay=day;
  state.company.lastPayrollPeriod=period;let total=0;for(const employee of state.staff.employees.filter(item=>item.status==='employed')){const amount=Math.round(employee.salary/2);total+=amount;createObligation(state,{direction:'payable',kind:'payroll',amount,counterparty:employee.name,dueDay:day,text:`Зарплата: ${employee.name}`});}return total;
}

function advanceStaff(state){
  const day=state.companyCalendar.day;const payrollLate=state.company.payrollArrears>0;for(const employee of state.staff.employees.filter(item=>item.status==='employed')){
    const loaded=Boolean(employee.assignedProjectId);employee.energy=clamp(employee.energy+(loaded?-10:12),0,100);employee.stress=clamp(employee.stress+(loaded?7:-9)+(payrollLate?12:0),0,100);employee.burnout=clamp(employee.burnout+(employee.stress>75?8:-3),0,100);employee.mood=clamp(employee.mood+(payrollLate?-14:loaded?-2:5),0,100);employee.loyalty=clamp(employee.loyalty+(payrollLate?-7:1),0,100);employee.quitRisk=clamp(6+employee.burnout*.45+(100-employee.loyalty)*.25+(payrollLate?25:0),0,96);employee.currentThought=nextEmployeeThought(employee,day);
    const absenceChance=(employee.alcoholRisk*.0025)+(employee.burnout>80?.08:0);if(dayRoll(day,employee.id.length)<absenceChance){employee.unavailableUntilDay=day+1+Math.floor(dayRoll(day,employee.id.length+2)*3);employee.history.unshift({day,type:'absence',text:'Не вышел. В чате стоит одна галочка.'});state.companyInbox.unshift({id:`absence-${employee.id}-${day}`,kind:'staff',employeeId:employee.id,title:`${employee.name} не вышел`,text:'Версия отдела кадров: личные обстоятельства. Версия объекта короче.',urgent:true,createdDay:day});}
    if(dayRoll(day,employee.id.length+5)<employee.quitRisk/1000){employee.status='resigned';employee.assignedProjectId=null;employee.history.unshift({day,type:'resigned',text:'Ушёл туда, где обещали только один объект.'});state.companyInbox.unshift({id:`quit-${employee.id}-${day}`,kind:'staff',employeeId:employee.id,title:`${employee.name} увольняется`,text:'Последней каплей стала таблица с названием «финал_точно_7».',urgent:true,createdDay:day});}
    else if(dayRoll(day,employee.id.length+9)<.055){const event=PERSONAL_EVENT_LIBRARY[Math.floor(dayRoll(day,employee.id.length+13)*PERSONAL_EVENT_LIBRARY.length)];employee.stress=clamp(employee.stress+event.stress,0,100);employee.mood=clamp(employee.mood+event.mood,0,100);employee.energy=clamp(employee.energy+event.energy,0,100);state.companyInbox.unshift({id:`${event.id}-${employee.id}-${day}`,kind:'staff',employeeId:employee.id,title:event.title,text:`${employee.name}: ${event.text}`,urgent:false,createdDay:day});}
  }
}

function updateDeliveries(state){
  const day=state.companyCalendar.day;for(const project of state.portfolio.projects)for(const order of project.materialOrders??[]){if(order.status==='ordered'&&day>=order.deliveryDay){const unpaid=state.company.obligations.some(item=>item.kind==='materials'&&item.projectId===project.id&&item.counterparty===order.title&&item.status!=='paid'&&item.dueDay<day);order.status=unpaid?'held':'delivered';if(unpaid)state.companyInbox.unshift({id:`held-${order.id}-${day}`,kind:'materials',projectId:project.id,title:`Поставка «${order.title}» удержана`,text:'Поставщик тоже умеет ставить работы на паузу.',urgent:true,createdDay:day});}}
}

function settleDueItems(state){
  const day=state.companyCalendar.day;for(const obligation of state.company.obligations.filter(item=>item.status!=='paid'&&item.dueDay<=day)){
    if(obligation.direction==='receivable'){const delayChance=obligation.kind==='stage-payment'?.18:.08;if(dayRoll(day,obligation.id.length)<delayChance){obligation.dueDay+=2;continue;}settleObligation(state,obligation.id);}
    else if(state.company.cash>=obligation.remaining)settleObligation(state,obligation.id);
  }refreshCompanyTotals(state);
}

export function companyCashForecast(state,days=30){
  ensureGameSaveV2(state);const start=state.companyCalendar.day;const buckets=Array.from({length:days},(_,index)=>({day:start+index+1,income:0,expense:0,balance:0}));for(const item of state.company.obligations.filter(item=>item.status!=='paid')){const bucket=buckets[clamp(item.dueDay-start-1,0,days-1)];if(item.direction==='receivable')bucket.income+=item.remaining;else bucket.expense+=item.remaining;}let balance=state.company.cash;for(const bucket of buckets){balance+=bucket.income-bucket.expense;bucket.balance=Math.round(balance);}return buckets;
}

function updateCrisis(state){
  const day=state.companyCalendar.day;const forecast=companyCashForecast(state,10);const minimum=Math.min(...forecast.map(item=>item.balance));const critical=state.company.payrollArrears>0||minimum<0;
  if(critical&&!state.company.crisis)state.company.crisis={startedDay:day,deadlineDay:day+10,reason:state.company.payrollArrears?'Задержка зарплаты':'Кассовый разрыв'};
  if(!critical)state.company.crisis=null;else if(day>state.company.crisis.deadlineDay&&state.company.cash+state.company.reserve<=0&&state.company.payables>state.company.receivables+100)state.company.bankrupt=true;
}

export function startHeadquartersProject(state){
  ensureGameSaveV2(state);if(state.hq?.project&&!['completed','cancelled'].includes(state.hq.project.status))return {ok:false,reason:'active'};const level=state.hq?.level??0;const costs=[80,170,320,520,780];const cost=costs[Math.min(level,costs.length-1)];const deposit=Math.round(cost*.35);if(state.company.cash<deposit)return {ok:false,reason:'cash',cost:deposit};postLedgerEntry(state,{type:'expense',category:'Свой офис',amount:deposit,text:'Аванс за улучшение штаба'});state.hq??={level:0,title:'Стол у принтера'};state.hq.project={id:`hq-${level+1}-${Date.now()}`,status:'active',targetLevel:Math.min(4,level+1),budget:cost,spent:deposit,progress:0,durationDays:4+level*2,startedDay:state.companyCalendar.day,overrun:0};return {ok:true,project:state.hq.project};
}

function advanceHeadquartersProject(state){
  const project=state.hq?.project;if(!project||project.status!=='active')return null;project.progress=clamp(project.progress+1/project.durationDays,0,1);if(dayRoll(state.companyCalendar.day,project.id.length)<.18){const overrun=Math.max(8,Math.round(project.budget*.08));project.overrun+=overrun;createObligation(state,{direction:'payable',kind:'office',amount:overrun,counterparty:'Подрядчик собственного офиса',dueDay:state.companyCalendar.day+2,text:'Неучтённые работы. У себя тоже бывает.'});}
  if(project.progress>=1){const balance=Math.max(0,project.budget-project.spent);if(balance)createObligation(state,{direction:'payable',kind:'office',amount:balance,counterparty:'Подрядчик собственного офиса',dueDay:state.companyCalendar.day+2,text:'Финальный расчёт по штабу'});project.status='completed';state.hq.level=project.targetLevel;state.hq.title=['Стол у принтера','Кабинет без окна','Комната с фикусом','Почти настоящий офис','Офис, который не стыдно показать'][state.hq.level];state.hq.lastFailure='На этот раз офис действительно изменился. Подрядчик сам удивлён.';}return project;
}

export function advanceCompanyDay(state,{simulateBackground=true}={}){
  ensureGameSaveV2(state);syncActiveProjectToPortfolio(state);state.companyCalendar.day+=1;state.companyCalendar.month=Math.floor(state.companyCalendar.day/30)+1;state.companyCalendar.lastClosedDay=state.companyCalendar.day-1;state.company.calendarDay=state.companyCalendar.day;
  const background=simulateBackground?simulatePortfolioDay(state):[];accruePayroll(state,state.companyCalendar.day);const outsourcedDaily=(state.staff.outsourcedRoles?.length??0)*3;createObligation(state,{direction:'payable',kind:'office',amount:Math.max(4,Math.round(3+state.staff.employees.filter(item=>item.status==='employed').length*.7+outsourcedDaily)),counterparty:'Операционные расходы',dueDay:state.companyCalendar.day,text:`Офис, связь и аутсорсинг ${outsourcedDaily}К`});settleDueItems(state);advanceStaff(state);updateDeliveries(state);advanceHeadquartersProject(state);
  const activeProjects=state.portfolio.projects.filter(project=>!project.summary?.completed);const eventCount=Math.min(5,Math.floor(dayRoll(state.companyCalendar.day,17)*(activeProjects.length+3)));for(let index=0;index<eventCount;index++){const event=COMPANY_EVENT_LIBRARY[Math.floor(dayRoll(state.companyCalendar.day,index+31)*COMPANY_EVENT_LIBRARY.length)];if(event.cash>0)postLedgerEntry(state,{type:'income',category:'Событие',amount:event.cash,text:event.title});if(event.cash<0)postLedgerEntry(state,{type:'expense',category:'Событие',amount:Math.abs(event.cash),text:event.title});state.company.reputation=clamp(state.company.reputation+event.reputation,0,100);state.companyInbox.unshift({id:`${event.id}-${state.companyCalendar.day}-${index}`,kind:'company',title:event.title,text:event.text,urgent:index<2&&event.cash<0,createdDay:state.companyCalendar.day});}
  let unresolvedChanges=state.portfolio.projects.reduce((sum,project)=>sum+(project.changeOrders??[]).filter(change=>change.status==='requested').length,0);for(const project of activeProjects){const probability=.05+(project.delegation?.mode==='autonomous'?.05:0);if(unresolvedChanges<2&&dayRoll(state.companyCalendar.day,project.id.length+73)<probability){createChangeOrder(state,project.id);unresolvedChanges+=1;}}
  state.companyInbox=state.companyInbox.slice(0,80);updateCrisis(state);syncActiveProjectToPortfolio(state);return {day:state.companyCalendar.day,background,eventCount,crisis:state.company.crisis,bankrupt:state.company.bankrupt};
}

export function validateGameSaveV2(state){
  const errors=[];if(state?.schemaVersion!==SAVE_SCHEMA_VERSION)errors.push('schemaVersion');if(!state?.company||!Number.isFinite(state.company.cash))errors.push('company');if(!Array.isArray(state?.portfolio?.projects)||state.portfolio.projects.length>MAX_ACTIVE_PROJECTS)errors.push('portfolio');if(!Array.isArray(state?.staff?.employees))errors.push('staff');if(!Array.isArray(state?.contractorNetwork))errors.push('contractorNetwork');
  const assigned=new Map();for(const assignment of state?.staff?.assignments??[]){const key=`${assignment.day}:${assignment.employeeId}`;if(assignment.kind==='primary'&&assigned.has(key))errors.push(`duplicate-assignment:${key}`);if(assignment.kind==='primary')assigned.set(key,assignment.projectId);}
  return {ok:errors.length===0,errors};
}
