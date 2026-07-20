import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_SCHEMA_VERSION,
  activatePortfolioProject,
  addPortfolioProject,
  advanceCompanyDay,
  assignEmployee,
  companyCashForecast,
  createChangeOrder,
  createMaterialOrder,
  createObligation,
  emergencyTransferEmployee,
  ensureGameSaveV2,
  postLedgerEntry,
  resolveChangeOrder,
  setProjectDelegation,
  settleObligation,
  simulatePortfolioDay,
  startHeadquartersProject,
  syncActiveProjectToPortfolio,
  validateGameSaveV2,
} from '../company-core.js';
import { CHANGE_ORDER_LIBRARY, COMPANY_EVENT_LIBRARY, PERSONAL_EVENT_LIBRARY, STAFF_TRAITS, generateStaffMarket } from '../company-content.js';
import { createInitialState, restoreState, selectOrder } from '../game-core.js';
import { generateOrders, makeSeededRng } from '../order-generator.js';
import { allRandomEvents } from '../events/index.js';

function projectState(seed){
  const state=createInitialState(makeSeededRng(seed),allRandomEvents);const order=generateOrders(makeSeededRng(seed),1)[0];state.company.cash=5000;assert.equal(selectOrder(state,order),true);state.phase='execution';state.started=true;state.paused=true;state.tutorial=null;for(const task of state.tasks)task.enabledToday=true;syncActiveProjectToPortfolio(state);return state;
}

test('legacy mission migrates to GameSaveV2 without losing the active project',()=>{
  const legacy=createInitialState();delete legacy.schemaVersion;delete legacy.company;delete legacy.portfolio;delete legacy.staff;delete legacy.contractorNetwork;legacy.selectedOrder={id:'legacy-site',title:'Старый объект',location:'Москва'};
  ensureGameSaveV2(legacy);assert.equal(legacy.schemaVersion,SAVE_SCHEMA_VERSION);assert.equal(legacy.portfolio.projects.length,1);assert.equal(legacy.portfolio.activeProjectId,'legacy-site');assert.equal(legacy.portfolio.projects[0].snapshot.tasks.length,legacy.tasks.length);assert.equal(validateGameSaveV2(legacy).ok,true);
  const restored=restoreState(JSON.stringify(legacy));assert.equal(restored.selectedOrder.title,'Старый объект');
});

test('portfolio accepts three projects, switches snapshots and rejects a fourth',()=>{
  const root=projectState(11);for(const seed of [12,13])assert.equal(addPortfolioProject(root,projectState(seed),'supervised').ok,true);assert.equal(root.portfolio.projects.length,3);assert.equal(addPortfolioProject(root,projectState(14),'autonomous').reason,'limit');
  const first=root.portfolio.activeProjectId;const target=root.portfolio.projects.find(project=>project.id!==first);const title=target.summary.title;assert.equal(activatePortfolioProject(root,target.id).ok,true);assert.equal(root.selectedOrder.title,title);assert.equal(root.portfolio.activeProjectId,target.id);
});

test('an employee has one primary site and emergency transfer costs time and stress',()=>{
  const root=projectState(21);addPortfolioProject(root,projectState(22));const [a,b]=root.portfolio.projects;const employee=root.staff.employees[0];assert.equal(assignEmployee(root,employee.id,a.id).ok,true);assert.equal(assignEmployee(root,employee.id,b.id).ok,true);assert.equal(a.staffIds.includes(employee.id),false);assert.equal(b.staffIds.includes(employee.id),true);
  const before=employee.stress;const moved=emergencyTransferEmployee(root,employee.id,a.id);assert.equal(moved.ok,true);assert.equal(moved.lostHours,2);assert.equal(employee.stress,before+15);assert.equal(emergencyTransferEmployee(root,employee.id,b.id).reason,'already-transferred');assert.equal(validateGameSaveV2(root).ok,true);
});

test('company ledger preserves cash and obligations distinguish receivables from payables',()=>{
  const state=createInitialState();state.company.cash=500;postLedgerEntry(state,{type:'income',category:'Проверка',amount:100});postLedgerEntry(state,{type:'expense',category:'Проверка',amount:40});assert.equal(state.company.cash,560);
  const payable=createObligation(state,{direction:'payable',kind:'materials',amount:90,dueDay:2});const receivable=createObligation(state,{direction:'receivable',kind:'stage-payment',amount:150,dueDay:3});assert.equal(state.company.payables,90);assert.equal(state.company.receivables,150);assert.equal(settleObligation(state,payable.id).ok,true);assert.equal(state.company.cash,470);assert.equal(settleObligation(state,receivable.id).ok,true);assert.equal(state.company.cash,620);
});

test('a profitable project may still forecast a cash gap',()=>{
  const state=projectState(31);const record=state.portfolio.projects[0];record.snapshot.finance.contractValue=2000;record.snapshot.finance.spent=200;record.snapshot.budget=5;for(const task of record.snapshot.tasks)if(task.status!=='done'){task.cost=300;task.progress=0;}
  record.summary={...record.summary};syncActiveProjectToPortfolio(state);const forecast=companyCashForecast(state,30);createObligation(state,{direction:'payable',kind:'contractor',amount:900,dueDay:1});const stressed=companyCashForecast(state,30);assert.ok(forecast[0].balance>stressed[0].balance);assert.ok(stressed[0].balance<state.company.cash);
});

test('material packages create delivery state and a supplier payable',()=>{
  const state=projectState(41);const project=state.portfolio.projects[0];const result=createMaterialOrder(state,project.id,{title:'Перегородки и обещания',taskIds:['partitions'],amount:120,leadDays:2,paymentTermsDays:3});assert.equal(result.ok,true);assert.equal(project.materialOrders.length,1);assert.ok(state.company.obligations.some(item=>item.kind==='materials'&&item.projectId===project.id&&item.amount===120));
});

test('change orders alter real scope, contract and financing',()=>{
  const state=projectState(51);const project=state.portfolio.projects[0];const formal=createChangeOrder(state,project.id,CHANGE_ORDER_LIBRARY[0].id).change;const before=project.snapshot.contract.budget;const approved=resolveChangeOrder(state,project.id,formal.uid,'formal',()=>0);assert.equal(approved.approved,true);assert.ok(project.snapshot.contract.budget>before);
  const risky=createChangeOrder(state,project.id,CHANGE_ORDER_LIBRARY[1].id).change;const task=project.snapshot.tasks.find(item=>!['done','skipped'].includes(item.status));const duration=task.duration;resolveChangeOrder(state,project.id,risky.uid,'risk',()=>1);assert.ok(task.duration>duration);assert.equal(risky.funding,'company');
});

test('delegated background projects advance while the opened project remains untouched',()=>{
  const root=projectState(61);const backgroundState=projectState(62);addPortfolioProject(root,backgroundState,'autonomous');const background=root.portfolio.projects.find(project=>project.id!==root.portfolio.activeProjectId);setProjectDelegation(root,background.id,'autonomous');background.snapshot.started=true;background.snapshot.paused=false;for(const task of background.snapshot.tasks)task.enabledToday=true;const before=background.summary.progress;const activeElapsed=root.elapsed;const result=simulatePortfolioDay(root);assert.equal(result.length,1);assert.ok(background.summary.progress>=before);assert.equal(root.elapsed,activeElapsed);
});

test('headquarters improvement is a multi-day internal project',()=>{
  const state=createInitialState();state.company.cash=2000;const started=startHeadquartersProject(state);assert.equal(started.ok,true);const oldLevel=state.hq.level;assert.equal(state.hq.project.status,'active');for(let day=0;day<10&&state.hq.project.status==='active';day++)advanceCompanyDay(state,{simulateBackground:false});assert.equal(state.hq.project.status,'completed');assert.equal(state.hq.level,oldLevel+1);assert.ok(state.company.ledger.some(entry=>entry.category==='Свой офис'));
});

test('payroll, office costs and crisis are simulated on the shared company calendar',()=>{
  const state=createInitialState();state.company.cash=0;for(let day=0;day<18;day++)advanceCompanyDay(state,{simulateBackground:false});assert.ok(state.company.payrollArrears>0);assert.ok(state.company.crisis);assert.ok(state.staff.employees.some(employee=>employee.mood<68));
});

test('procedural company content is broad enough for a long session',()=>{
  assert.equal(STAFF_TRAITS.length,30);assert.equal(PERSONAL_EVENT_LIBRARY.length,60);assert.equal(COMPANY_EVENT_LIBRARY.length,40);assert.equal(CHANGE_ORDER_LIBRARY.length,30);const market=generateStaffMarket(700,120);assert.equal(market.length,120);assert.ok(new Set(market.map(item=>`${item.name}:${item.role}:${item.strengths.join('-')}:${item.weakness}`)).size>=100);
});

test('a funded conservative company can survive a 180-day simulation',()=>{
  const state=projectState(81);state.company.cash=15000;state.company.reserve=3000;for(const employee of state.staff.employees){employee.assignedProjectId=null;employee.stress=5;employee.burnout=0;}
  for(let day=0;day<180;day++){advanceCompanyDay(state,{simulateBackground:false});if(state.company.crisis&&state.company.reserve>0)postLedgerEntry(state,{type:'reserve-out',category:'Антикризис',amount:Math.min(500,state.company.reserve)});}
  assert.equal(state.companyCalendar.day,180);assert.equal(state.company.bankrupt,false);assert.ok(state.company.ledger.length>180);assert.equal(validateGameSaveV2(state).ok,true);
});
