import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../game.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const core=readFileSync(new URL('../game-core.js',import.meta.url),'utf8');

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
    'task','priority','start-task','skip-task','hire','contract-manpower','settle-contractor','find-contractor','contractor-filter','event-choice','situation-choice','close-modal','close-sidebook',
    'company-tab','market-section','open-employee-tree','close-employee-tree','employee-upgrade','hq-upgrade','open-project','add-portfolio-order','assign-employee','transfer-employee','hire-employee','dismiss-employee','outsource-role','pay-obligation','reserve','start-hq-project','create-change','resolve-change','equip-artifact',
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

test('headquarters explains staff assignment and separates hiring from outsourcing',()=>{
  assert.match(script,/Штат — это люди на постоянной зарплате/);
  assert.match(script,/Назначили на объект — он уезжает туда, появляется в 3D/);
  assert.match(script,/Сам по себе на объект не телепортируется/);
  assert.match(script,/data-market-section="orders"/);
  assert.match(script,/data-market-section="people"/);
  assert.match(script,/data-market-section="outsource"/);
  assert.match(script,/Аутсорсер не появится в 3D и не закрепляется за объектом/);
  assert.match(html,/id="prepCompanyStaff"/);
  assert.match(script,/data-prep-assign-employee/);
  assert.match(script,/назначен на объект без повторного найма/);
});

test('mobilization is one resource planning screen with staff contractors schedule and cash flow',()=>{
  assert.match(html,/id="prepSelectionSummary"/);
  assert.match(html,/id="prepResourcePlan"/);
  assert.match(html,/id="prepEconomics"/);
  assert.doesNotMatch(html,/id="mapGrid"/);
  assert.match(script,/data-prep-resource-crew/);
  assert.match(script,/data-prep-supervisor/);
  assert.match(script,/data-prep-shift/);
  assert.match(script,/prep-gantt-bar/);
  assert.match(script,/taskControlFactor/);
  assert.match(script,/Единый план утверждён/);
});

test('new game uses the headquarters market without the obsolete map flow',()=>{
  const resetSection=script.slice(script.indexOf('function resetGame()'),script.indexOf('function cancelCurrentOrder()'));
  assert.match(resetSection,/companyTab='market'/);
  assert.match(resetSection,/refs\.menu\.classList\.add\('visible'\)/);
  assert.doesNotMatch(resetSection,/refs\.orders\.classList\.add\('visible'\)/);
  assert.doesNotMatch(script,/Тест допа/);
  assert.match(script,/Заказать первый фронт/);
  assert.match(script,/Сначала договор, потом команда и материалы/);
  assert.doesNotMatch(script,/data-order-materials/);
});

test('new game is a destructive two-step career reset instead of a market shortcut',()=>{
  assert.match(html,/class="[^"]*danger-button[^"]*" id="newGameButton"/);
  assert.match(script,/function armNewGameButton\(\)/);
  assert.match(script,/function startNewCareer\(\)/);
  assert.match(script,/button\.dataset\.confirmNewGame==='true'/);
  assert.match(script,/Все объекты, деньги, штаб и команда будут потеряны/);
  const handler=script.slice(script.indexOf("$('#newGameButton').addEventListener"),script.indexOf('function frame'));
  assert.doesNotMatch(handler,/companyTab='market';renderMainMenu\(\);showToast\('Текущие объекты сохранены/);
  assert.match(styles,/\.menu-button\.danger-button\.is-armed/);
});

test('career entry leads with one next action and keeps headquarters detail opt-in',()=>{
  assert.match(html,/id="nextActionTitle"/);
  assert.match(html,/id="partyRoster"/);
  assert.match(html,/id="companyConsole"[^>]*hidden/);
  assert.match(html,/id="openMarketButton"/);
  assert.match(html,/id="openHeadquartersButton"/);
  assert.match(script,/function openHeadquarters\(tab='portfolio'\)/);
  assert.match(script,/continueButton\.dataset\.menuIntent='market'/);
});

test('a new career enters chapter one directly instead of detouring through the company spreadsheet',()=>{
  assert.match(html,/id="campScene" hidden/);
  assert.match(html,/id="openCompanyDeskButton"/);
  assert.match(script,/function startFirstAdventure\(\)/);
  assert.match(script,/if\(\$\('#continueGameButton'\)\.dataset\.menuIntent==='market'\)\{startFirstAdventure\(\);return;\}/);
  assert.match(script,/if\(tutorialRequired\(\)\)\{startFirstAdventure\(\);return;\}/);
  assert.match(script,/syncActiveProjectToPortfolio\(state\);/);
});

test('the new campaign art replaces the old menu canvas backdrop',()=>{
  assert.match(styles,/hq-basement-adventure-v1\.png/);
  assert.match(styles,/mission-meeting-room-v1\.png/);
  assert.match(styles,/\.hq-menu-scene #hqCanvas \{ display:none; \}/);
});

test('staff controls use player-facing language instead of internal abbreviations',()=>{
  assert.match(script,/Развивать · \$\{developmentPointsLabel\(employee\.developmentPoints\)\}/);
  assert.match(script,/Срочно перебросить/);
  assert.match(script,/потеря 2 часов и \+15 стресса/);
  assert.doesNotMatch(script,/Развитие · \$\{employee\.developmentPoints\} ОР/);
  assert.match(script,/Критичные вопросы: \$\{urgent\}/);
});

test('new player tutorial opens the first story chapter and teaches flow through play',()=>{
  assert.match(html,/id="storyIntroModal"/);
  assert.match(html,/Король генподряда начинается с принтера/);
  assert.match(script,/if\(order\.tutorial\)openStoryIntro\(\)/);
  assert.match(styles,/\.story-intro-footer/);
  assert.match(script,/Семён/);
  assert.match(script,/КОРОЛЁМ ГЕНПОДРЯДА/);
  assert.match(script,/БЦ «Банкрот»/);
  assert.match(script,/PS5 была единственным ликвидным активом/);
  assert.match(script,/Сначала освободите фронт/);
  assert.match(script,/Первый фронт — ещё не весь объект/);
  assert.match(script,/\[data-map-hire="designers"\]/);
  assert.match(script,/ГЛАВА 1 · \$\{step\.n\}\/12/);
  assert.match(script,/Завершили, предъявили, приняли, получили деньги/);
});

test('tasks expose missing specialist crews and route directly to matching contractors',()=>{
  assert.match(script,/function profileCoverage\(skill\)/);
  assert.match(script,/НЕТ ПРОФИЛЬНОГО ИСПОЛНИТЕЛЯ/);
  assert.match(script,/data-find-contractor=/);
  assert.match(script,/renderTeamBook\(findContractor\.dataset\.findContractor\)/);
  const problemSection=script.slice(script.indexOf('function taskProblem'),script.indexOf('function taskStatus'));
  assert.doesNotMatch(problemSection,/item\.skill==='general'/);
});

test('a planned ready task always has an explicit start action and an honest crew state',()=>{
  assert.match(script,/task\.status==='ready'\?`<button class="task-start-button"/);
  assert.match(script,/taskCrewAvailability\(state,task\)/);
  assert.match(script,/Подходящая бригада вернётся через/);
  assert.match(script,/const result=startTaskNow\(state,task\.id\)/);
  assert.match(styles,/\.task-start-button.*min-height:40px/);
  assert.match(styles,/\.task-start-button:active.*scale:\.96/);
});

test('contractor market exposes explicit trade icons and every new career requires chapter one',()=>{
  assert.match(script,/function tradeBadge\(skill\)/);
  assert.match(script,/class="trade-badge"/);
  assert.match(script,/data-contractor-filter=/);
  assert.match(script,/Подсобные работы/);
  assert.match(script,/function tutorialRequired\(\)/);
  assert.match(script,/function careerOrders\(\)/);
  assert.match(script,/tutorialRequired\(\)&&!order\.tutorial/);
  assert.match(script,/Первая глава обязательна/);
  assert.match(styles,/\.trade-filters button\.active/);
});

test('a new day resets speed and hard-blocked work cannot be selected in planning',()=>{
  assert.match(script,/state\.speed=1;for\(const task of state\.tasks\)task\.enabledToday=false/);
  assert.match(script,/Новый день начинается на скорости 1×/);
  assert.match(script,/disabled aria-disabled="true"/);
  assert.match(script,/Заблокированный монтаж планом не разблокируется/);
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

test('site communications stay prominent while operational lists collapse into drawers',()=>{
  assert.match(html,/class="management-card whatsapp"/);
  assert.match(html,/class="management-card outlook"/);
  assert.match(html,/<details class="ops-drawer situation-inbox"/);
  assert.match(html,/<details class="ops-drawer site-contractor-roster"/);
  assert.match(styles,/\.management-menu \{ display:grid; grid-template-columns:repeat\(2/);
});

test('new site questions interrupt the scene and magic resolve is a visible risky action',()=>{
  assert.match(html,/class="situation-interrupt"/);
  assert.match(html,/id="magicResolveButton"[\s\S]*?ПОРЕШАТЬ/);
  assert.match(script,/announcedSituationIds/);
  assert.match(script,/refs\.situationInterrupt\.hidden=false/);
  assert.match(core,/backlash:\'cost\'/);
  assert.match(core,/backlash:\'delay\'/);
  assert.match(core,/backlash:\'chaos\'/);
  assert.match(styles,/@keyframes situation-interrupt-in/);
});

test('contract negotiation uses sliders and the master schedule binds named crews',()=>{
  assert.match(html,/data-contract-slider="budget"/);
  assert.match(html,/data-contract-slider="deadline"/);
  assert.match(script,/contractNegotiationChance\(state\)/);
  assert.match(script,/resolveContractNegotiation\(state\)/);
  assert.match(script,/data-schedule-crew=/);
  assert.match(script,/РЕСУРС ЗАНЯТ ПАРАЛЛЕЛЬНО/);
  assert.match(styles,/\.schedule-crew-select/);
});
