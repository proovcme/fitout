import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../game.js',import.meta.url),'utf8');

test('every static button is wired directly or through its form',()=>{
  const ids=[...html.matchAll(/<button[^>]*\sid="([^"]+)"/g)].map(match=>match[1]);
  const formSubmitIds=new Set(['loginButton']);
  const missing=ids.filter(id=>!formSubmitIds.has(id)&&!script.includes(`$('#${id}').addEventListener`));
  assert.deepEqual(missing,[]);
  assert.match(script,/\$\('#authForm'\)\.addEventListener\('submit'/);
});

test('every delegated button family has a matching click route',()=>{
  const delegated=[
    'loan','order-id','contract-card','team-hire','map-hire','day-task',
    'schedule-day','schedule-order','send-urgent','email-template','send-email',
    'task','priority','start-task','skip-task','hire','contract-manpower','event-choice','situation-choice','close-modal','close-sidebook',
    'company-tab','open-project','add-portfolio-order','assign-employee','transfer-employee','hire-employee','dismiss-employee','outsource-role','pay-obligation','reserve','start-hq-project','order-materials','create-change','resolve-change',
  ];
  for(const name of delegated)assert.ok(script.includes(`closest('[data-${name}]')`),`missing handler for data-${name}`);
});

test('selected player has click-to-move navigation and never joins idle wandering',()=>{
  assert.match(script,/navigationPoint&&selectedPerson\?\.userData\?\.role==='player'/);
  assert.match(script,/playerMoveTarget=destination/);
  assert.match(script,/const count=crewHeadcount\(state,crew\)/);
  assert.match(script,/const isPlayerCrew=crew\.id==='foreman'/);
  const patrolLine=script.match(/const patrol=[^;]+;/)?.[0]??'';
  assert.doesNotMatch(patrolLine,/crew\.id==='foreman'/);
});

test('site animation time advances only while the simulation is unpaused',()=>{
  assert.match(script,/if\(!state\.paused\)sceneAnimationTime\+=frameDelta/);
  assert.match(script,/const characterDelta=state\.paused\?0:frameDelta/);
});

test('assigned permanent staff are mirrored into the active 3D site',()=>{
  assert.match(script,/function syncAssignedStaffToActiveProject\(\)/);
  assert.match(script,/const crewId=`company-\$\{employee\.id\}`/);
  assert.match(script,/syncAssignedStaffToActiveProject\(\);\s+renderOrders/);
});
