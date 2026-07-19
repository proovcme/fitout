import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyEventChoice,
  applyCatalogEventChoice,
  createInitialState,
  cyclePriority,
  developHeadquarters,
  hireContractor,
  hireTeamMember,
  selectOrder,
  takeOrganizationLoan,
  tickState,
  unlockTasks,
} from '../game-core.js';
import { allRandomEvents } from '../events/index.js';
import { createCampaignOrders, generateOrders, makeSeededRng } from '../order-generator.js';

test('only dependency-free work unlocks initially', () => {
  const state = createInitialState();
  unlockTasks(state);
  assert.equal(state.tasks.find((task) => task.id === 'survey').status, 'ready');
  assert.equal(state.tasks.find((task) => task.id === 'paint').status, 'locked');
});

test('hiring deducts mobilization and creates an autonomous crew', () => {
  const state = createInitialState();
  const result = hireContractor(state, 'painters');
  assert.equal(result.ok, true);
  assert.equal(state.budget, 1112);
  assert.equal(state.crews.at(-1).skill, 'paint');
  assert.equal(hireContractor(state, 'painters').ok, false);
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
  for (const contractor of state.contractors) assert.equal(hireContractor(state, contractor.id).ok, true);
  for(const member of state.team)assert.equal(hireTeamMember(state,member.id).ok,true);
  state.budget += 1000;
  state.contract.budget += 1000;
  state.started = true;
  state.paused = false;
  state.eventsSeen = ['paint-change','random-0','random-1','random-2','random-3','random-4','random-5'];
  for (const task of state.tasks) task.enabledToday = true;
  for (let hour = 0; hour < 72 && !state.completed; hour += 1) {
    tickState(state, 1);
    if (state.needsReport) { state.reportedDay = Math.floor(state.elapsed / 24); state.needsReport = false; state.paused = false; }
    if (state.needsPlanning) {
      state.plannedDay = Math.floor(state.elapsed / 24); state.needsPlanning = false; state.paused = false;
      for (const task of state.tasks) task.enabledToday = true;
    }
  }
  assert.equal(state.completed, true);
  assert.ok(state.elapsed <= 72);
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

test('event catalog contains 50 unique two-choice incidents', () => {
  assert.equal(allRandomEvents.length, 50);
  assert.equal(new Set(allRandomEvents.map((event) => event.id)).size, 50);
  for (const event of allRandomEvents) {
    assert.match(event.id, /^[a-z0-9-]+$/);
    assert.equal(event.options.length, 2);
    for (const option of event.options) assert.deepEqual(Object.keys(option.deltas).sort(), ['budget', 'quality', 'time', 'trust']);
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

test('client funds the project by advance and completed schedule stages', () => {
  const state=createInitialState(makeSeededRng(12),allRandomEvents);
  const order=generateOrders(makeSeededRng(12),1)[0];
  assert.equal(selectOrder(state,order),true);
  const advance=Math.round(order.budget*.45);
  assert.equal(state.budget,advance);
  assert.equal(state.finance.received,advance);
  state.started=true;state.paused=false;
  state.tasks.find(task=>task.id==='survey').enabledToday=true;
  tickState(state,8);
  assert.ok(state.finance.ledger.some(row=>row.category==='Этапный платёж'));
  assert.ok(state.finance.received>advance);
});

test('organization carries project profit and interest-bearing debt between projects', () => {
  const state=createInitialState();
  const loan=takeOrganizationLoan(state,300);
  assert.equal(loan.ok,true);
  assert.equal(state.organization.cash,620);
  assert.equal(state.organization.debt,348);
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
