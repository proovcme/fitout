import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateOrders, makeSeededRng } from '../order-generator.js';
import { ROOM_ARCHETYPES, ROOM_VARIANT_COUNT, createOfficeComposition } from '../office-generator.js';
import { createPersonProfile, createVisualProfile, generateAmbientBeat, generateSiteLine } from '../procedural-content.js';
import { GAME_HOURS_PER_REAL_SECOND, REAL_SECONDS_PER_WORKDAY, createInitialState, ensureMasterSchedule, scheduledTasksForDay, shiftMasterScheduleTask, updateAmbientActivity } from '../game-core.js';
import { allRandomEvents } from '../events/index.js';
import { WORK_CATALOG } from '../work-catalog.js';

test('order market is deterministic and guarantees broad project variety', () => {
  const first=generateOrders(makeSeededRng(42),10);
  const second=generateOrders(makeSeededRng(42),10);
  assert.deepEqual(first,second);
  assert.ok(first.some(order=>order.projectType==='greenfield'));
  assert.ok(first.some(order=>order.clientType==='state'));
  assert.ok(first.some(order=>order.clientType==='commercial'));
  assert.ok(new Set(first.map(order=>order.finishClass)).size>=3);
  for(const order of first){assert.ok(order.tasks.length>=10);assert.ok(order.tasks.some(task=>task.id==='project'));assert.ok(order.tasks.some(task=>task.id==='executive-docs'));assert.ok(order.tasks.some(task=>task.id==='clean'));assert.ok(order.budget>0);assert.ok(order.deadlineHours>0);}
  const greenfield=first.find(order=>order.projectType==='greenfield');assert.ok(['site-camp','layout','foundations','structure','envelope','roof','external-networks'].every(id=>greenfield.tasks.some(task=>task.id===id)));
  assert.ok(WORK_CATALOG.length>=28);assert.ok(WORK_CATALOG.some(work=>work.optional&&work.id==='protection'));
});

test('procedural asset profiles vary offices and recognizable people', () => {
  const officeProfiles=Array.from({length:12},(_,index)=>createVisualProfile(index+1,{projectType:index%4===0?'greenfield':'renovation'}));
  assert.ok(new Set(officeProfiles.map(profile=>profile.theme.id)).size>=5);
  assert.ok(officeProfiles.some(profile=>profile.site==='field'));
  const people=Array.from({length:20},(_,index)=>createPersonProfile('worker',77,index));
  assert.ok(new Set(people.map(person=>`${person.name}:${person.skin}:${person.accessory}`)).size>=16);
  assert.ok(people.some(person=>person.glasses));
  assert.ok(people.some(person=>person.beard));
});

test('office compositions combine room archetypes, furnishing packs and construction fixtures',()=>{
  assert.ok(ROOM_ARCHETYPES.length>=10);
  assert.ok(ROOM_ARCHETYPES.every(room=>room.variants.length>=5));
  assert.equal(ROOM_VARIANT_COUNT,6);
  const layouts=Array.from({length:24},(_,index)=>createOfficeComposition({seed:index+1,area:180+index*75,projectType:index%5===0?'greenfield':'renovation'}));
  for(const layout of layouts){
    assert.ok(layout.rooms.length>=7);
    assert.ok(layout.rooms.some(room=>room.kind==='open-space'));
    assert.ok(layout.rooms.some(room=>room.kind==='meeting'));
    assert.ok(layout.rooms.some(room=>room.kind==='restroom'));
    assert.ok(layout.partitions.length>=10);
    assert.ok(layout.furniture.length>=20);
    assert.ok(layout.equipment.some(item=>item.kind.includes('light')));
    assert.ok(layout.equipment.some(item=>item.kind.includes('hvac')));
    assert.ok(layout.rooms.every(room=>room.furniture.every(item=>Number.isFinite(item.x)&&Number.isFinite(item.z))));
  }
  assert.ok(new Set(layouts.map(layout=>layout.rooms.map(room=>room.variant.id).join(':'))).size>=18);
  assert.deepEqual(createOfficeComposition({seed:77,area:900}),createOfficeComposition({seed:77,area:900}));
});

test('site chatter is combinatorial rather than a two-line loop', () => {
  const lines=new Set(Array.from({length:600},(_,index)=>generateSiteLine(['management','general','paint','electric','furniture','cleaning'][index%6],index)));
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

test('the 3D office has explicit demolition, partition, engineering and furniture states',()=>{
  const source=readFileSync(new URL('../game.js',import.meta.url),'utf8');
  assert.match(source,/sceneProps\.legacyInterior\.visible=siteType==='existing'&&demolitionProgress<\.999/);
  assert.match(source,/const partitionProgress=prepProgress/);
  assert.match(source,/const engineeringProgress=averageProgress/);
  assert.match(source,/const fitoutReady=furnitureProgress>\.02/);
});

test('active work reads as a physical game scene rather than a task dashboard',()=>{
  const source=readFileSync(new URL('../game.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="sceneActionCard"/);
  assert.match(source,/sceneProps\.workZones=\[\]/);
  assert.match(source,/stage-props-\$\{name\}/);
  assert.match(source,/drywall-sheet/);
  assert.match(source,/tool-case/);
  assert.match(source,/paint-tray/);
  assert.match(source,/cleaning-cart/);
  assert.match(source,/function focusCameraOnTask/);
  assert.match(source,/particleMode=.*'spark'.*'paint'.*'clean'.*'dust'/);
});

test('headquarters and site share the tactile architectural-model presentation',()=>{
  const source=readFileSync(new URL('../game.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(source,/function makeDioramaRuler/);
  assert.match(source,/diorama-plywood/);
  assert.match(source,/FITOUT · ОБЪЕКТ 01/);
  assert.match(source,/hq-model-plywood/);
  assert.match(css,/МАКЕТ ОБЪЕКТА · МАСШТАБ 1:50/);
});

test('a mission samples many incidents and spreads them across workdays', () => {
  const state=createInitialState(makeSeededRng(91),allRandomEvents);
  assert.equal(state.randomEvents.length,12);
  assert.equal(new Set(state.randomEvents).size,12);
  assert.ok(state.eventSchedule.every(event=>event.probability>=.42&&event.probability<=.9));
  assert.ok(state.eventSchedule.some(event=>!event.occurs));
  const counts=new Map();
  for(const event of state.eventSchedule){const day=Math.floor(event.hour/24);counts.set(day,(counts.get(day)??0)+1);}
  assert.ok([...counts.values()].every(count=>count<=5));
  assert.ok(state.randomEvents.some(id=>allRandomEvents.find(event=>event.id===id)?.beneficial));
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
