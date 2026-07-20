import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustContractorManpower,
  applyEventChoice,
  applyCatalogEventChoice,
  advanceOrganizationDays,
  captureMasterSchedule,
  calculateSiteCongestion,
  closeDayFinances,
  createInitialState,
  crewHeadcount,
  cyclePriority,
  developHeadquarters,
  dismissContractor,
  ensureRuntimeCrews,
  forceAssignCrew,
  hireContractor,
  hireTeamMember,
  selectOrder,
  requestClientFunding,
  resolveScheduleRevision,
  sendPressureInstruction,
  sendContractorEscalation,
  skipOptionalTask,
  submitTaskForAcceptance,
  takeOrganizationLoan,
  tickState,
  toggleInHouseDesign,
  tryMagicResolve,
  unhireContractor,
  unhireTeamMember,
  unlockTasks,
  updateSiteCleanliness,
} from '../game-core.js';
import { allRandomEvents } from '../events/index.js';
import { createCampaignOrders, generateOrders, makeSeededRng } from '../order-generator.js';

test('only dependency-free work unlocks initially', () => {
  const state = createInitialState();
  unlockTasks(state);
  assert.equal(state.tasks.find((task) => task.id === 'survey').status, 'ready');
  assert.equal(state.tasks.find((task) => task.id === 'paint').status, 'locked');
});

test('old saves receive the player avatar and universal company crew',()=>{
  const legacy=createInitialState();const pm=legacy.team.find(member=>member.id==='pm');pm.hired=true;Object.assign(legacy.crews.find(crew=>crew.id==='foreman'),{name:'Алина Ветрова',role:'Руководитель проекта',initials:'АВ'});legacy.crews=legacy.crews.filter(crew=>crew.id!=='team-pm');ensureRuntimeCrews(legacy);
  assert.ok(legacy.crews.some(crew=>crew.id==='general-crew'));assert.equal(legacy.playerAvatar.helmet,'classic');assert.equal(legacy.playerZoneTaskId,null);
  assert.equal(legacy.crews.find(crew=>crew.id==='foreman').name,'Вы');assert.equal(legacy.crews.find(crew=>crew.id==='team-pm').name,'Алина Ветрова');
});

test('hiring deducts mobilization and creates an autonomous crew', () => {
  const state = createInitialState();
  const result = hireContractor(state, 'painters');
  assert.equal(result.ok, true);
  assert.equal(state.budget, 1112);
  assert.equal(state.crews.at(-1).skill, 'paint');
  assert.equal(hireContractor(state, 'painters').ok, false);
});

test('contractor headcount is explicit, crowds small sites and can be adjusted',()=>{
  const state=createInitialState();state.selectedOrder={area:180};state.budget=2000;
  for(const id of ['movers','painters','electricians'])assert.equal(hireContractor(state,id).ok,true);
  const painters=state.contractors.find(item=>item.id==='painters');const crew=state.crews.find(item=>item.id==='crew-painters');
  assert.equal(crewHeadcount(state,crew),painters.manpower);assert.ok(calculateSiteCongestion(state).penalty<1);
  state.started=true;state.paused=false;state.elapsed=23.99;state.plannedDay=1;state.reportedDay=1;state.nextMajorEventAt=999;state.eventSchedule=[];
  const reinforced=adjustContractorManpower(state,'painters',1);assert.equal(reinforced.pending,true);assert.equal(crewHeadcount(state,crew),4);assert.equal(crew.pendingManpower,1);
  tickState(state,.02);assert.equal(crewHeadcount(state,crew),5);assert.equal(crew.pendingManpower,0);
  assert.equal(adjustContractorManpower(state,'painters',-1).ok,true);assert.equal(crewHeadcount(state,crew),4);
});

test('foreman automatically completes survey and unlocks parallel work', () => {
  const state = createInitialState();
  state.started = true;
  state.paused = false;
  state.tasks.find((task) => task.id === 'survey').enabledToday = true;
  tickState(state, 8);
  assert.equal(state.tasks.find((task) => task.id === 'survey').status, 'done');
  assert.equal(state.tasks.find((task) => task.id === 'move').status, 'ready');
  assert.equal(state.tasks.find((task) => task.id === 'electric').status, 'ready');
});

test('a budget-blocked task returns to the queue when financing arrives',()=>{
  const state=createInitialState();const task=state.tasks.find(item=>item.id==='survey');state.tasks=[task];state.started=true;state.paused=false;state.plannedDay=0;state.nextMajorEventAt=999;state.eventSchedule=[];task.status='ready';task.enabledToday=true;state.budget=task.cost-1;
  tickState(state,.1);assert.equal(task.status,'blocked');assert.equal(task.committed,false);
  state.budget=task.cost;unlockTasks(state);assert.equal(task.status,'ready');tickState(state,.1);assert.equal(task.status,'active');assert.equal(task.committed,true);assert.equal(state.budget,0);
});

test('priority cycles without mutating active work', () => {
  const state = createInitialState();
  assert.equal(cyclePriority(state, 'move'), true);
  assert.equal(state.tasks.find((task) => task.id === 'move').priority, 3);
  state.tasks.find((task) => task.id === 'move').status = 'active';
  assert.equal(cyclePriority(state, 'move'), false);
});

test('client choice changes the three project constraints', () => {
  const state = createInitialState();
  applyEventChoice(state, 'paint-change', 'premium');
  assert.equal(state.budget, 1126);
  assert.equal(state.quality, 79);
  assert.equal(state.trust, 76);
});

test('market incident is randomized but reproducible for tests', () => {
  const state = createInitialState(() => 0.99);
  assert.equal(state.randomEvent, 'italian-sofa');
  applyEventChoice(state, 'italian-sofa', 'local');
  assert.equal(state.quality, 73);
  assert.equal(state.trust, 70);
});

test('a well-staffed mission is winnable inside the budget and deadline', () => {
  const state = createInitialState(() => 0); // noise is the second incident
  state.budget += 1000;
  for (const contractorId of ['movers','painters','electricians','assemblers','cleaners']) assert.equal(hireContractor(state, contractorId).ok, true);
  for(const member of state.team)assert.equal(hireTeamMember(state,member.id).ok,true);
  state.contract.budget += 1000;
  state.contract.deadlineHours = 96;
  state.started = true;
  state.paused = false;
  state.eventsSeen = ['paint-change','random-0','random-1','random-2','random-3','random-4','random-5'];
  for (const task of state.tasks) task.enabledToday = true;
  for (let hour = 0; hour < state.contract.deadlineHours && !state.completed; hour += 1) {
    tickState(state, 1);
    for(const task of state.tasks.filter(item=>item.status==='awaiting'))submitTaskForAcceptance(state,task.id,()=>0);
    if (state.needsReport) { state.reportedDay = Math.floor(state.elapsed / 24); state.needsReport = false; state.paused = false; }
    if (state.needsPlanning) {
      state.plannedDay = Math.floor(state.elapsed / 24); state.needsPlanning = false; state.paused = false;
      for (const task of state.tasks) task.enabledToday = true;
    }
  }
  assert.equal(state.completed, true);
  assert.ok(state.elapsed <= state.contract.deadlineHours);
  assert.ok(state.budget >= 0);
  assert.ok(state.quality >= 78);
});

test('bad sequencing creates visible and costly rework', () => {
  const state=createInitialState();
  state.started=true;
  const paint=state.tasks.find(task=>task.id==='paint');
  paint.status='done';
  const electric=state.tasks.find(task=>task.id==='electric');
  electric.status='active';electric.progress=.99;electric.crewId='test-electric';electric.enabledToday=true;
  state.crews.push({id:'test-electric',name:'Проверочная фаза',skill:'electric',speed:2,quality:1,taskId:'electric',x:6,y:2,state:'working'});
  state.paused=false;state.eventsSeen=['paint-change','random-0','random-1','random-2','random-3','random-4','random-5'];
  tickState(state,1);
  assert.ok(state.tasks.some(task=>task.reworkOf==='paint'));
  assert.ok(state.quality<74);
});

test('event catalog contains 54 unique two-choice incidents including good news', () => {
  assert.equal(allRandomEvents.length, 54);
  assert.equal(new Set(allRandomEvents.map((event) => event.id)).size, 54);
  assert.ok(allRandomEvents.filter((event)=>event.beneficial).length>=4);
  for (const event of allRandomEvents) {
    assert.match(event.id, /^[a-z0-9-]+$/);
    assert.equal(event.options.length, 2);
    for (const option of event.options) {
      for(const key of ['budget','quality','time','trust'])assert.ok(key in option.deltas);
      assert.ok(Object.keys(option.deltas).every(key=>['budget','deadline','quality','time','trust'].includes(key)));
    }
  }
});

test('catalog choice can remove a crew and create a temporary 3D scene effect', () => {
  const state = createInitialState(() => 0, allRandomEvents);
  hireContractor(state, 'movers');
  const incident = allRandomEvents.find((event) => event.id === 'migracionnaya-proverka');
  assert.equal(applyCatalogEventChoice(state, incident, 'legalnaya-pauza'), true);
  assert.ok(state.crews.find((crew) => crew.skill === 'moving').unavailableUntil > state.elapsed);
  assert.equal(state.sceneEffect.actor, 'inspector');
  assert.equal(state.sceneEffect.actorCount, 2);
});

test('good news can add budget or extend the contractual deadline',()=>{
  const state=createInitialState();const event=allRandomEvents.find(item=>item.id==='client-extends-deadline');const before=state.contract.deadlineHours;
  assert.equal(applyCatalogEventChoice(state,event,'accept-extension'),true);
  assert.equal(state.contract.deadlineHours,before+12);
  const extra=allRandomEvents.find(item=>item.id==='client-approved-extras');const contractBefore=state.finance.contractValue;
  assert.equal(applyCatalogEventChoice(state,extra,'take-and-document'),true);assert.equal(state.finance.contractValue,contractBefore+120);
});

test('major incidents are serialized and capped at five per project day',()=>{
  const state=createInitialState();state.started=true;state.paused=false;state.tutorial=null;state.nextSituationAt=999;
  state.eventSchedule=Array.from({length:6},()=>({id:'client-approved-extras',hour:0,occurs:true}));
  for(let index=0;index<6;index+=1){state.nextMajorEventAt=state.elapsed;tickState(state,.01);if(state.eventQueue.length)applyCatalogEventChoice(state,allRandomEvents.find(item=>item.id==='client-approved-extras'),'take-and-document');state.paused=false;}
  assert.equal(state.eventCountsByDay[0],5);assert.equal(state.eventQueue.length,0);
});

test('major incidents keep a visible gameplay interval between decisions',()=>{
  const state=createInitialState();state.started=true;state.paused=false;state.tutorial=null;state.nextSituationAt=999;state.eventSchedule=[{id:'client-approved-extras',hour:0,occurs:true},{id:'client-extends-deadline',hour:0,occurs:true}];
  tickState(state,.01);assert.equal(state.eventQueue.length,1);const first=allRandomEvents.find(item=>item.id===state.eventQueue[0]);applyCatalogEventChoice(state,first,first.options[0].id);state.paused=false;tickState(state,.1);assert.equal(state.eventQueue.length,0);state.paused=false;tickState(state,.6);assert.equal(state.eventQueue.length,1);
});

test('the player avatar boosts only the supervised work zone',()=>{
  const makeState=()=>{const state=createInitialState();state.started=true;state.paused=false;state.nextSituationAt=999;state.eventSchedule=[];unlockTasks(state);const survey=state.tasks.find(task=>task.id==='survey');survey.enabledToday=true;return state;};
  const nearby=makeState();nearby.playerZoneTaskId='survey';tickState(nearby,.2);
  const away=makeState();away.playerZoneTaskId='paint';tickState(away,.2);
  assert.ok(nearby.tasks.find(task=>task.id==='survey').progress>away.tasks.find(task=>task.id==='survey').progress*1.17);
});

test('client funds the project by advance and completed schedule stages', () => {
  const state=createInitialState(makeSeededRng(12),allRandomEvents);
  const order=generateOrders(makeSeededRng(12),1)[0];
  assert.equal(selectOrder(state,order),true);
  const advance=Math.round(order.budget*.45);
  assert.equal(state.budget,advance);
  assert.equal(state.finance.received,advance);
  state.started=true;state.paused=false;
  state.tasks.find(task=>task.id==='survey').enabledToday=true;
  for(let hour=0;hour<48&&!state.finance.ledger.some(row=>row.category==='Этапный платёж');hour+=1){tickState(state,1);if(state.needsReport){state.reportedDay=Math.floor(state.elapsed/24);state.needsReport=false;}if(state.needsPlanning){state.plannedDay=Math.floor(state.elapsed/24);state.needsPlanning=false;state.tasks.find(task=>task.id==='survey').enabledToday=true;}state.paused=false;}
  assert.ok(state.finance.ledger.some(row=>row.category==='Этапный платёж'));
  assert.ok(state.finance.received>advance);
});

test('organization carries project profit and interest-bearing debt between projects', () => {
  const state=createInitialState();
  const loan=takeOrganizationLoan(state,300);
  assert.equal(loan.ok,true);
  assert.equal(state.organization.cash,620);
  assert.equal(state.organization.debt,loan.repayment);
  state.started=true;state.paused=false;state.budget=-50;
  for(const task of state.tasks)task.status='done';
  tickState(state,.1);
  assert.equal(state.completed,true);
  assert.equal(state.organization.projectsCompleted,1);
  assert.equal(state.organization.totalProfit,-50);
  assert.equal(state.organization.cash,570);
});

test('campaign starts with a protected tutorial and unlocks linked orders by reputation history', () => {
  const campaign=createCampaignOrders();
  assert.equal(campaign.length,4);
  assert.equal(campaign[0].tutorial,true);
  assert.deepEqual(campaign.map(order=>order.requiresProjects),[0,1,2,3]);
  assert.ok(campaign[0].tasks.find(task=>task.id==='move').deps.length===0);
  const state=createInitialState();
  assert.equal(selectOrder(state,campaign[1]),false);
  assert.equal(selectOrder(state,campaign[0]),true);
  assert.equal(state.tutorial.active,true);
  assert.ok(state.organization.cash<320);
});

test('tutorial protects the first shift from random incidents until the player observes and intervenes', () => {
  const state=createInitialState(()=>0,allRandomEvents);
  assert.equal(selectOrder(state,createCampaignOrders()[0]),true);
  state.started=true;state.paused=false;state.eventSchedule=[{id:allRandomEvents[0].id,hour:0,occurs:true}];
  state.tasks.find(task=>task.id==='survey').enabledToday=true;
  tickState(state,.2);
  assert.equal(state.eventQueue.length,0);
  assert.equal(state.activeSituations.length,0);
});

test('developing the company office spends organization cash and can visibly improve it', () => {
  const state=createInitialState();const before=state.organization.cash;
  const result=developHeadquarters(state,()=>0);
  assert.equal(result.ok,true);assert.equal(result.success,true);
  assert.equal(state.organization.cash,before-result.cost);
  assert.equal(state.hq.level,1);
});

test('a project loan arrives on site and is collected from organization cash every month',()=>{
  const state=createInitialState();state.started=true;state.completed=false;state.selectedOrder={id:'test'};state.phase='execution';const projectCash=state.budget;
  const loan=takeOrganizationLoan(state,300);
  assert.equal(loan.recipient,'project');assert.equal(state.budget,projectCash+300);
  state.organization.cash=loan.monthlyPayment+20;
  const month=advanceOrganizationDays(state,30);
  assert.equal(month.paid,loan.monthlyPayment);assert.equal(state.organization.cash,20);
  assert.equal(state.organization.debt,loan.repayment-loan.monthlyPayment);
});

test('a headquarters loan goes to company cash even when a project save exists',()=>{
  const state=createInitialState();state.started=true;state.selectedOrder={id:'active'};state.phase='execution';const companyCash=state.organization.cash;const projectCash=state.budget;
  const loan=takeOrganizationLoan(state,300,'organization');assert.equal(loan.recipient,'organization');assert.equal(state.organization.cash,companyCash+300);assert.equal(state.budget,projectCash);
});

test('an unpaid monthly loan creates arrears and damages reputation',()=>{
  const state=createInitialState();const loan=takeOrganizationLoan(state,300);state.organization.cash=0;const reputation=state.organization.reputation;
  const month=advanceOrganizationDays(state,30);
  assert.equal(month.missed,loan.monthlyPayment);assert.ok(state.organization.arrears>0);assert.equal(state.organization.reputation,reputation-4);
});

test('repeated loan default reports current arrears without double counting old debt',()=>{
  const state=createInitialState();takeOrganizationLoan(state,300);state.organization.cash=0;advanceOrganizationDays(state,30);advanceOrganizationDays(state,30);
  assert.equal(state.organization.arrears,state.organization.loans.reduce((sum,loan)=>sum+(loan.arrears??0),0));
});

test('finished work must be presented before its stage payment is released',()=>{
  const state=createInitialState();state.finance.received=500;const task=state.tasks.find(item=>item.id==='paint');task.status='awaiting';task.progress=1;task.acceptanceQuality=1;task.acceptanceQualityGain=4;task.lastCrewLevel=1;
  const received=state.finance.received;const rejected=submitTaskForAcceptance(state,task.id,()=>1);
  assert.equal(rejected.accepted,false);assert.equal(task.status,'ready');assert.ok(task.progress>0);assert.equal(rejected.remainingHours,4.5);assert.equal(state.finance.received,received);
  task.status='awaiting';task.progress=1;const accepted=submitTaskForAcceptance(state,task.id,()=>0);
  assert.equal(accepted.accepted,true);assert.equal(task.status,'done');assert.ok(state.finance.received>received);
});

test('the working design is produced by a designer and must be presented',()=>{
  const state=createInitialState();assert.equal(hireTeamMember(state,'designer').ok,true);state.started=true;state.paused=false;state.nextSituationAt=999;state.eventSchedule=[];const survey=state.tasks.find(task=>task.id==='survey');survey.status='done';const project=state.tasks.find(task=>task.id==='project');project.status='ready';project.enabledToday=true;project.duration=1;tickState(state,2);
  assert.equal(project.status,'awaiting');assert.equal(project.lastCrewId,'team-designer');assert.equal(submitTaskForAcceptance(state,project.id,()=>0).accepted,true);
});

test('evening schedule can be approved, rejected or quietly discovered',()=>{
  const state=createInitialState();state.started=true;const snapshot=captureMasterSchedule(state);state.tasks.find(item=>item.id==='paint').plannedStartDay=0;
  const approved=resolveScheduleRevision(state,'client',snapshot,()=>0);assert.equal(approved.approved,true);
  const state2=createInitialState();state2.started=true;const snapshot2=captureMasterSchedule(state2);state2.tasks.find(item=>item.id==='paint').plannedStartDay=0;
  const rejected=resolveScheduleRevision(state2,'client',snapshot2,()=>1);assert.equal(rejected.approved,false);assert.equal(rejected.restored,true);
});

test('government fixed contracts reject extra money and punish hidden schedule changes',()=>{
  const state=createInitialState();state.started=true;state.selectedOrder={fixedContract:true};
  assert.equal(requestClientFunding(state,()=>0).reason,'fixed-contract');
  const snapshot=captureMasterSchedule(state);state.tasks.find(item=>item.id==='paint').plannedStartDay=0;
  const result=resolveScheduleRevision(state,'secret',snapshot,()=>0);
  assert.equal(result.detected,true);assert.equal(state.sceneEffect.actor,'police');assert.ok(state.budget<1180);
});

test('contractor classes trade price for speed and replacements arrive next day',()=>{
  const state=createInitialState();const economy=state.contractors.find(item=>item.id==='painters-economy');const premium=state.contractors.find(item=>item.id==='painters-premium');
  assert.ok(economy.price<premium.price);assert.ok(economy.speed<premium.speed);assert.ok(economy.quality<premium.quality);
  state.started=true;state.needsReport=true;assert.equal(hireContractor(state,economy.id).ok,true);assert.equal(dismissContractor(state,economy.id).ok,true);
  const replacement=hireContractor(state,premium.id);assert.equal(replacement.ok,true);assert.equal(replacement.arrivalAt,24);
});

test('chat pressure is repeatable while a hard email is limited to once per day',()=>{
  const state=createInitialState();const task=state.tasks.find(item=>item.id==='paint');
  const chat=sendPressureInstruction(state,task.id,'chat',()=>0);assert.equal(chat.worked,true);assert.equal(task.pressureFactor,1.2);
  const email=sendPressureInstruction(state,task.id,'email',()=>0);assert.equal(email.worked,true);assert.equal(task.pressureFactor,1.38);
  assert.equal(sendPressureInstruction(state,task.id,'email',()=>0).reason,'daily-limit');
});

test('the company general crew can cover every trade slowly and specialists can be forced off profile',()=>{
  const state=createInitialState();state.started=true;const general=state.crews.find(item=>item.id==='general-crew');const paint=state.tasks.find(item=>item.id==='paint');paint.status='ready';
  const assigned=forceAssignCrew(state,general.id,paint.id);assert.equal(assigned.ok,true);assert.equal(assigned.mismatch,true);
  assert.equal(paint.profileMismatch,true);
});

test('final client retention is released only after documentation and inspection',()=>{
  const state=createInitialState();state.started=true;state.paused=false;state.finance.contractValue=1000;state.finance.received=850;state.budget=0;
  for(const task of state.tasks)task.status='done';const inspect=state.tasks.find(item=>item.id==='inspect');inspect.status='active';inspect.progress=.99;inspect.crewId='foreman';state.crews.find(item=>item.id==='foreman').taskId='inspect';
  tickState(state,1);assert.ok(state.finance.ledger.some(row=>row.category==='Финальное закрытие'));assert.equal(state.finance.received,1000);
});

test('preparation hires can be revoked and use company cash after the advance',()=>{
  const state=createInitialState();state.phase='preparation';state.selectedOrder={id:'test'};state.budget=10;state.organization.cash=200;
  const hired=hireContractor(state,'painters');assert.equal(hired.ok,true);assert.equal(state.budget,0);assert.equal(state.organization.cash,142);
  const revoked=unhireContractor(state,'painters');assert.equal(revoked.ok,true);assert.equal(state.budget,10);assert.equal(state.organization.cash,200);
  assert.equal(hireTeamMember(state,'designer').ok,true);assert.equal(unhireTeamMember(state,'designer').ok,true);
});

test('hard mail targets one contractor or the whole hired pool once per day',()=>{
  const state=createInitialState();state.started=true;state.phase='execution';state.budget=500;hireContractor(state,'painters');hireContractor(state,'electricians');
  state.crews.find(item=>item.id==='crew-painters').unavailableUntil=0;state.crews.find(item=>item.id==='crew-electricians').unavailableUntil=0;
  const result=sendContractorEscalation(state,'painters',()=>0);assert.equal(result.worked,true);assert.equal(result.targetCount,1);
  assert.equal(sendContractorEscalation(state,'all',()=>0).reason,'daily-limit');
});

test('a site may accumulate rubbish and late professional cleaning recovers it',()=>{
  const state=createInitialState();const move=state.tasks.find(item=>item.id==='move');const general=state.crews.find(item=>item.id==='general-crew');move.status='active';move.crewId=general.id;general.taskId=move.id;
  updateSiteCleanliness(state,24);assert.ok(state.siteDirt>18);assert.ok(state.cleanliness.distraction<1);
  const cleaner=state.contractors.find(item=>item.id==='cleaners-premium');assert.equal(hireContractor(state,cleaner.id).ok,true);const crew=state.crews.find(item=>item.id===`crew-${cleaner.id}`);const clean=state.tasks.find(item=>item.id==='clean');clean.status='active';clean.crewId=crew.id;crew.taskId=clean.id;
  updateSiteCleanliness(state,8);assert.equal(state.siteDirt,0);assert.equal(state.cleanliness.hasCleaningSupport,true);
});

test('magic resolve is rare, useful and has a two-day cooldown',()=>{
  const state=createInitialState();state.started=true;const task=state.tasks.find(item=>item.id==='paint');task.status='awaiting';task.acceptanceQualityGain=4;
  const rolls=[0,.1];const success=tryMagicResolve(state,()=>rolls.shift());assert.equal(success.success,true);assert.equal(success.outcome,'acceptance');assert.equal(task.status,'done');assert.equal(tryMagicResolve(state,()=>0).reason,'cooldown');
  state.elapsed+=48;const failure=tryMagicResolve(state,()=>.99);assert.equal(failure.success,false);assert.equal(state.magicResolve.attempts,2);
});

test('optional protection may be skipped for immediate savings and later dirt',()=>{
  const state=createInitialState();const generated=generateOrders(makeSeededRng(51),1)[0];state.tasks=generated.tasks;const protection=state.tasks.find(task=>task.id==='protection');assert.ok(protection?.optional);const quality=state.quality;
  const result=skipOptionalTask(state,'protection');assert.equal(result.ok,true);assert.equal(protection.status,'skipped');assert.equal(state.siteDirt,18);assert.ok(state.quality<quality);
});

test('an in-house design office replaces a contractor and adds daily overhead',()=>{
  const state=createInitialState();state.hq.level=2;state.organization.cash=500;const hired=toggleInHouseDesign(state);assert.equal(hired.ok,true);assert.ok(state.crews.some(crew=>crew.id==='inhouse-design'));const budget=state.budget;closeDayFinances(state);assert.ok(state.budget<=budget-18);assert.match(state.finance.ledger[0].text,/постоянный штат 12К/);
  assert.equal(toggleInHouseDesign(state).active,false);assert.ok(!state.crews.some(crew=>crew.id==='inhouse-design'));
});
