import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../game.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

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
    'company-tab','open-employee-tree','close-employee-tree','employee-upgrade','hq-upgrade','open-project','add-portfolio-order','assign-employee','transfer-employee','hire-employee','dismiss-employee','outsource-role','pay-obligation','reserve','start-hq-project','order-materials','create-change','resolve-change','equip-artifact',
  ];
  for(const name of delegated)assert.ok(script.includes(`closest('[data-${name}]')`),`missing handler for data-${name}`);
});

test('dismissible overlays expose a close action and Escape triggers the top one',()=>{
  for(const id of ['briefModal','marketModal','scheduleModal','communicationModal','teamModal','financeModal','docsModal','situationModal']){
    const start=html.indexOf(`id="${id}"`);const next=html.indexOf('<div class="modal-backdrop"',start+1);const fragment=html.slice(start,next<0?html.length:next);assert.match(fragment,/modal-close/,`${id} has no close button`);
  }
  assert.match(script,/event\.key!=='Escape'/);
  assert.match(script,/querySelectorAll\('\.modal-backdrop\.visible \.modal-close'\)/);
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
  assert.match(script,/syncAssignedStaffToActiveProject\(\);\s+unlockTasks\(state\);\s+renderOrders/);
});

test('headquarters employees stay seated at role workstations',()=>{
  const hqSection=script.slice(script.indexOf('function hqChair'),script.indexOf('function makeDesk'));
  assert.match(hqSection,/function hqChair/);
  assert.match(hqSection,/hqRoleProp\(employee\.roleId/);
  assert.match(hqSection,/leftThigh/);
  assert.match(hqSection,/rightShin/);
  assert.match(hqSection,/person:\[-\.75,1\.06,0\]/);
  assert.doesNotMatch(hqSection,/person:\[-\.75,1\.06,Math\.PI\]/);
  assert.match(hqSection,/activity==='reviewing'/);
  assert.doesNotMatch(hqSection,/setPersonMotion\(person,'walk'\)/);
  assert.match(hqSection,/requestRiggedCharacter/);
});

test('staff progression is explained and boss artifacts have a real loadout',()=>{
  assert.match(script,/На объекте: \+24 за закрытый день/);
  assert.match(script,/В штабе без назначения: \+8/);
  assert.match(script,/Каждые 100 опыта = 1 очко навыков/);
  assert.match(script,/function renderBossDoll\(\)/);
  assert.match(script,/data-equip-artifact/);
});

test('new game uses the headquarters market without the obsolete map flow',()=>{
  const resetSection=script.slice(script.indexOf('function resetGame()'),script.indexOf('function cancelCurrentOrder()'));
  assert.match(resetSection,/companyTab='market'/);
  assert.match(resetSection,/refs\.menu\.classList\.add\('visible'\)/);
  assert.doesNotMatch(resetSection,/refs\.orders\.classList\.add\('visible'\)/);
  assert.doesNotMatch(script,/Тест допа/);
  assert.match(script,/Заказать материалы/);
});

test('staff controls use player-facing language instead of internal abbreviations',()=>{
  assert.match(script,/Навыки · \$\{developmentPointsLabel\(employee\.developmentPoints\)\}/);
  assert.match(script,/Перебросить сегодня/);
  assert.match(script,/потеря 2 часов и \+15 стресса/);
  assert.doesNotMatch(script,/Развитие · \$\{employee\.developmentPoints\} ОР/);
  assert.match(script,/Критичные вопросы: \$\{urgent\}/);
});

test('new player tutorial opens the first story chapter and teaches flow through play',()=>{
  assert.match(script,/Семён/);
  assert.match(script,/КОРОЛЁМ ГЕНПОДРЯДА/);
  assert.match(script,/БЦ «Банкрот»/);
  assert.match(script,/PS5 была единственным ликвидным активом/);
  assert.match(script,/Сначала устраните то, что держит весь поток/);
  assert.match(script,/Завершили, приняли, получили деньги/);
});

test('laptop negotiation is readable and never reopens halfway down the brief',()=>{
  assert.match(styles,/@media \(min-width:1180px\) and \(min-height:700px\)/);
  assert.match(styles,/\.mission-copy > p \{ font-size:14px/);
  assert.match(styles,/\.contract-deck \{ grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(styles,/\.contract-card strong \{ font-size:11px/);
  assert.match(styles,/\.tutorial-coach h2 \{ margin:11px 0 7px; font-size:19px/);
  assert.match(script,/function openBriefModal\(\)/);
  assert.match(script,/surface\.scrollTop=0/);
});
