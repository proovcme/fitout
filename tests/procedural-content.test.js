import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOrders, makeSeededRng } from '../order-generator.js';
import { createPersonProfile, createVisualProfile, generateAmbientBeat, generateSiteLine } from '../procedural-content.js';
import { GAME_HOURS_PER_REAL_SECOND, REAL_SECONDS_PER_WORKDAY, createInitialState, ensureMasterSchedule, scheduledTasksForDay, shiftMasterScheduleTask, updateAmbientActivity } from '../game-core.js';
import { allRandomEvents } from '../events/index.js';

test('order market is deterministic and guarantees broad project variety', () => {
  const first=generateOrders(makeSeededRng(42),10);
  const second=generateOrders(makeSeededRng(42),10);
  assert.deepEqual(first,second);
  assert.ok(first.some(order=>order.projectType==='greenfield'));
  assert.ok(first.some(order=>order.clientType==='state'));
  assert.ok(first.some(order=>order.clientType==='commercial'));
  assert.ok(new Set(first.map(order=>order.finishClass)).size>=3);
  for(const order of first){assert.equal(order.tasks.length,10);assert.ok(order.tasks.some(task=>task.id==='project'));assert.ok(order.tasks.some(task=>task.id==='executive-docs'));assert.ok(order.budget>0);assert.ok(order.deadlineHours>0);}
});

test('procedural asset profiles vary offices and recognizable people', () => {
  const officeProfiles=Array.from({length:12},(_,index)=>createVisualProfile(index+1,{projectType:index%4===0?'greenfield':'renovation'}));
  assert.ok(new Set(officeProfiles.map(profile=>profile.theme.id)).size>=5);
  assert.ok(officeProfiles.some(profile=>profile.site==='field'));
  const people=Array.from({length:20},(_,index)=>createPersonProfile('worker',77,index));
  assert.ok(new Set(people.map(person=>`${person.name}:${person.skin}:${person.accessory}`)).size>=16);
});

test('site chatter is combinatorial rather than a two-line loop', () => {
  const lines=new Set(Array.from({length:600},(_,index)=>generateSiteLine(['management','moving','paint','electric','furniture','cleaning'][index%6],index)));
  assert.ok(lines.size>=120);
  assert.ok([...lines].some(line=>line.includes('###@!#!!')));
});

test('ambient activity is contextual, finite and separate from major incidents', () => {
  const generated=generateAmbientBeat('electric',17);
  assert.equal(generated.skill,'electric');
  assert.ok(generated.text.length>20);
  const state=createInitialState(makeSeededRng(31),allRandomEvents);
  state.started=true;
  state.elapsed=1;
  state.nextAmbientBeatAt=0;
  state.crews.push({id:'sparkies',name:'Искра',skill:'electric',taskId:'electric',unavailableUntil:0});
  const beat=updateAmbientActivity(state);
  assert.equal(beat.skill,'electric');
  assert.equal(beat.crewId,'sparkies');
  assert.equal(state.eventQueue.length,0);
  state.elapsed=beat.expiresAt+.01;
  state.nextAmbientBeatAt=state.elapsed+1;
  assert.equal(updateAmbientActivity(state),null);
});

test('a mission samples many incidents and spreads them across workdays', () => {
  const state=createInitialState(makeSeededRng(91),allRandomEvents);
  assert.equal(state.randomEvents.length,12);
  assert.equal(new Set(state.randomEvents).size,12);
  assert.ok(state.eventSchedule.every(event=>event.probability>=.32&&event.probability<=.82));
  assert.ok(state.eventSchedule.some(event=>!event.occurs));
  const counts=new Map();
  for(const event of state.eventSchedule){const day=Math.floor(event.hour/24);counts.set(day,(counts.get(day)??0)+1);}
  assert.ok([...counts.values()].every(count=>count<=2));
});

test('one workday is five real minutes', () => {
  assert.equal(REAL_SECONDS_PER_WORKDAY,300);
  assert.equal(GAME_HOURS_PER_REAL_SECOND*REAL_SECONDS_PER_WORKDAY,9);
});

test('master schedule feeds daily work and never repeats completed tasks', () => {
  const state=createInitialState(makeSeededRng(21),allRandomEvents);
  ensureMasterSchedule(state);
  const first=scheduledTasksForDay(state,0);
  assert.ok(first.length>0);
  first[0].status='done';
  assert.ok(!scheduledTasksForDay(state,0).some(task=>task.id===first[0].id));
  const editable=state.tasks.at(-1);
  const original=editable.plannedStartDay;
  assert.equal(shiftMasterScheduleTask(state,editable.id,1),true);
  assert.equal(editable.plannedStartDay,original+1);
});
