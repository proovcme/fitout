import * as THREE from 'three';
import {
  DEADLINE_HOURS,
  GAME_HOURS_PER_REAL_SECOND,
  INITIAL_BUDGET,
  applyEventChoice,
  applyCatalogEventChoice,
  applyContractCard,
  adjustContractorManpower,
  captureMasterSchedule,
  closeDayFinances,
  crewHeadcount,
  createInitialState,
  cyclePriority,
  dismissContractor,
  ensureOrganization,
  ensureProjectFinance,
  ensureRuntimeCrews,
  ensureWorkforceMarket,
  forceAssignCrew,
  hardTaskBlockers,
  getResult,
  getRisk,
  hireContractor,
  hireTeamMember,
  ensureMasterSchedule,
  moveMasterScheduleTask,
  pauseTask,
  restoreState,
  requestClientFunding,
  resolveSituation,
  resolveScheduleRevision,
  scheduledTasksForDay,
  selectOrder,
  serializeState,
  shiftMasterScheduleTask,
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
} from './game-core.js';
import { allRandomEvents, randomEventById } from './events/index.js';
import {
  activatePortfolioProject,
  addPortfolioProject,
  advanceCompanyDay,
  assignEmployee,
  companyCashForecast,
  createChangeOrder,
  createMaterialOrder,
  dismissEmployee,
  emergencyTransferEmployee,
  ensureGameSaveV2,
  hireEmployee,
  postLedgerEntry,
  resolveChangeOrder,
  setProjectDelegation,
  settleObligation,
  startHeadquartersProject,
  syncActiveProjectToPortfolio,
  toggleOutsourcedRole,
} from './company-core.js';
import { COMPANY_ROLES, staffTrait } from './company-content.js';
import { createCampaignOrders, generateOrders } from './order-generator.js';
import { bubbleFor, createPersonProfile, createVisualProfile } from './procedural-content.js';
import { situationById } from './situations.js';

const STORAGE_KEY = 'fitout-mission-v4';
const ICONS = {
  survey: '⌁', project:'⌑', move: '↔', electric: 'ϟ', prep: '▧', paint: '◩', desks: '▤', clean: '✦', 'executive-docs':'▥', inspect: '✓',
};
const SKILL_LABELS = { management: 'Прораб', general:'Универсальная хозбригада', design:'Проектирование', documentation:'Исполнительная', support:'Команда', demolition:'Демонтаж',construction:'Общестрой',engineering:'Инженерные сети',moving: 'Перестановка', paint: 'Отделка', electric: 'Электрика', furniture: 'Мебель', cleaning: 'Клининг' };
const STATUS_LABELS = { locked: 'Ждёт зависимости', ready: 'Можно начинать', active: 'В работе', awaiting:'Готово к предъявлению', done: 'Принято', skipped:'Осознанно пропущено', blocked: 'Нет бюджета' };
const PERSON_NAMES = {
  foreman:['Илья Петрович'],moving:['Рустам','Вадим'],demolition:['Марат','Артур'],construction:['Пётр','Ринат'],engineering:['Ильдар','Максим'],paint:['Саша','Николай'],electric:['Денис','Тимур'],furniture:['Женя','Павел'],cleaning:['Лена','Марина'],
  architect:['Мария Корнилова'],client:['Анна Крылова'],police:['Капитан Орлов','Сержант Лебедев'],inspector:['Инспектор Семёнов'],medic:['Фельдшер Вера'],boss:['Виктор Аркадьевич'],delivery:['Водитель Гена'],worker:['Алексей','Марат','Сергей'],
};
const PERSON_JOBS = {foreman:'Прораб',moving:'Рабочий · переезд',demolition:'Демонтажник',construction:'Монтажник общестроя',engineering:'Монтажник инженерных сетей',paint:'Маляр',electric:'Электрик',furniture:'Сборщик мебели',cleaning:'Клининг',architect:'Архитектор',client:'Представитель заказчика',police:'Сотрудник службы',inspector:'Инспектор',medic:'Медик',boss:'Ваше начальство',delivery:'Водитель доставки',worker:'Рабочий'};
const PERSON_THOUGHTS = {
  foreman:['«Главное — чтобы никто не спросил про вчерашний график»','«Если записать проблему в протокол, она становится задачей»','«Рулетка опять у архитектора»'],
  architect:['«На рендере кран точно был»','«Инженеры сейчас снова скажут слово “невозможно”»','«Этот серый был теплее на мудборде»'],
  client:['«Почему стул стоит как отпуск?»','«Надо было остаться в коворкинге»','«В понедельник всё должно выглядеть неизбежно»'],
  police:['«Этаж точно тот?»','«Журнал допуска выглядит подозрительно новым»'],inspector:['«Удлинитель. Классика»','«Где акт скрытых работ?»'],boss:['«Эти люди нужнее на другом объекте»','«Экономия должна быть видна в отчёте»'],
  default:['«До обеда бы закончить»','«Кто опять передвинул материалы?»','«Это точно было в объёме?»','«###@!#!!»'],
};
const CONTRACT_CARDS=[
  {id:'reserve',title:'Открыть резерв',note:'+120 тыс. ₽ · заказчик хочет отчёт каждый вечер',budget:120,trust:-4},
  {id:'buffer',title:'Защитить срок',note:'+8 часов · обещаем ежедневный план/факт',deadline:8,trust:-3},
  {id:'acceptance',title:'Снизить планку',note:'качество −5 · доверие −6',quality:-5,trust:-6},
  {id:'transparent',title:'Прозрачная смета',note:'+55 тыс. ₽ · качество +2 · срок +3 ч',budget:55,quality:2,deadline:3,trust:2},
  {id:'audit',title:'Добровольный аудит',note:'доверие +3 · цена и срок без изменений',trust:3},
  {id:'protocol',title:'Особое мнение в протокол',note:'качество +1 · доверие −1',quality:1,trust:-1},
];
const EVENT_COPY = {
  'paint-change': {
    kicker: 'ЗАПРОС ЗАКАЗЧИКА',
    title: '«А давайте всё-таки не бежевый»',
    text: 'Анна увидела цвет стен в сторис дизайнера. До этого он был «идеальный тёплый». Теперь он «немного офис налоговой».',
    options: [
      { id: 'premium', title: 'Перекрасить как просит', effect: '−54 тыс. ₽ · +5 качество', note: 'Заказчик счастлив, маляры вспоминают новые слова.' },
      { id: 'keep', title: 'Защитить согласованный цвет', effect: '−5 доверие', note: 'Показываем подписанный мудборд. Он внезапно становится юридическим документом.' },
    ],
  },
  noise: {
    kicker: 'СЛУЧАЙНОЕ СОБЫТИЕ',
    title: 'Соседи обнаружили перфоратор',
    text: 'Юристы этажом ниже просят соблюдать тишину. Их письмо занимает 11 страниц и ссылается на традиционные ценности бизнес-центра.',
    options: [
      { id: 'quiet', title: 'Перенести шумные работы', effect: '+5 часов · +3 доверие', note: 'График хрустнет, зато управляющая компания запомнит вас добрым словом.' },
      { id: 'night', title: 'Оплатить ночную смену', effect: '−28 тыс. ₽', note: 'Ночью шум считается премиальным шумом.' },
    ],
  },
  nephew: {
    kicker: 'СЛУЧАЙНОЕ СОБЫТИЕ',
    title: 'Племянник заказчика — тоже дизайнер',
    text: 'Он привёз неоновую вывеску «WORK HARD / HARDLY WORK». Она шире переговорной, зато «делает культуру».',
    options: [
      { id: 'decline', title: 'Вежливо найти противопожарные нормы', effect: '−3 доверие · +2 качество', note: 'Нормы снова делают грязную работу за вас.' },
      { id: 'install', title: 'Смонтировать арт-объект', effect: '−44 тыс. ₽ · −4 качество', note: 'Зато племянник отметит офис в соцсетях. Возможно, дважды.' },
    ],
  },
  delivery: {
    kicker: 'СЛУЧАЙНОЕ СОБЫТИЕ',
    title: 'Столы приехали. Но в Тверь',
    text: 'Логист уверен, что адрес совпадает «практически полностью». В накладной действительно есть буква «Т».',
    options: [
      { id: 'express', title: 'Заказать экспресс-доставку', effect: '−36 тыс. ₽ · +2 доверие', note: 'Столы увидят Москву раньше логиста.' },
      { id: 'wait', title: 'Пусть исправляют за свой счёт', effect: '+6 часов · +1 качество', note: 'Принципиальность бесплатна. Кроме стоимости задержки.' },
    ],
  },
  calendar: {
    kicker: 'РИСК, КОТОРОГО НЕ БЫЛО В ГАНТЕ',
    title: 'У бригады внезапно праздник',
    text: 'Полсостава честно предупреждало об этом ещё месяц назад. Календарь проекта отвечал, что человеческий фактор не поддерживается.',
    options: [
      { id: 'reserve', title: 'Поднять резервную смену', effect: '−24 тыс. ₽ · +2 доверие', note: 'Опытный РП знает не только СНиП, но и календарь.' },
      { id: 'wait', title: 'Уважать праздник и график отдельно', effect: '+8 часов · −2 доверие', note: 'Диаграмма Ганта совершает традиционный обряд движения вправо.' },
    ],
  },
  'client-ghost': {
    kicker: 'МАТРИЦА РЕШЕНИЙ ПУСТА',
    title: 'Заказчик перестал согласовывать',
    text: 'Анна читает сообщения, но отвечает только реакцией 👍. Строить по эмодзи пока нельзя, хотя рынок близок.',
    options: [
      { id: 'matrix', title: 'Экстренный штаб решений', effect: '−8 тыс. ₽ · +3 доверие', note: 'Фиксируем допуски, ответственных и то, что 👍 не является цветом RAL.' },
      { id: 'wait', title: 'Ждать официального письма', effect: '+7 часов · −3 доверие', note: 'Юридически безупречно. Производственно неподвижно.' },
    ],
  },
  'italian-sofa': {
    kicker: 'ИМПОРТНАЯ КОМПЛЕКТАЦИЯ',
    title: 'Итальянский диван застрял красиво',
    text: 'Он уже стал легендой офиса, хотя ещё находится на таможне. Дизайнер считает замену предательством концепции.',
    options: [
      { id: 'local', title: 'Взять локальный аналог', effect: '−1 качество · −2 доверие', note: 'На нём можно сидеть уже сегодня — подозрительное преимущество.' },
      { id: 'wait', title: 'Спасти оригинальную концепцию', effect: '−62 тыс. ₽ · +3 часа', note: 'Платим за срочность и право произносить название фабрики.' },
    ],
  },
  ...Object.fromEntries(allRandomEvents.map((event)=>[event.id,event])),
};

let saved = null;
let state = createInitialState(Math.random,allRandomEvents);
if(!Array.isArray(state.randomEvents)||state.randomEvents.length<12||!Array.isArray(state.eventSchedule)||state.randomEvents.some(id=>!randomEventById.has(id))) {
  state.randomEvents=createInitialState(Math.random,allRandomEvents).randomEvents;
  state.randomEvent=state.randomEvents[0];
}
unlockTasks(state);
function decorateOrder(order) {
  if(!order)return order;
  const campaignLevels={1:1,2:2,3:4,4:6};
  const requiredLevel=order.requiredLevel??(order.campaign?(campaignLevels[order.chapter]??1):Math.max(1,Math.min(7,order.complexity)));
  const fixedContract=order.fixedContract??order.clientType==='state';
  const occupiedOffice=order.occupiedOffice??(!order.tutorial&&['refresh','restack','renovation'].includes(order.projectType)&&requiredLevel>=2);
  const startWithoutProject=order.startWithoutProject??(!order.tutorial&&requiredLevel>=4&&['shell','greenfield'].includes(order.projectType));
  const eventIntensity=order.eventIntensity??Math.min(1.55,1+(requiredLevel-1)*.09);
  const extraRisks=[occupiedOffice?'офис продолжает работать внутри стройки':null,startWithoutProject?'работы стартуют до выпуска финального РД':null,fixedContract?'фиксированные цена и срок: самодеятельность проверяют буквально':null].filter(Boolean);
  return {...order,requiredLevel,fixedContract,occupiedOffice,startWithoutProject,eventIntensity,riskTags:[...(order.riskTags??[]),...extraRisks].filter((risk,index,list)=>list.indexOf(risk)===index)};
}
function createOrderMarket(organization=ensureOrganization(state)) {
  const campaign=createCampaignOrders();
  const random=generateOrders(Math.random,5).map(order=>({...order,requiresProjects:Math.max(0,Math.min(2,Math.floor(order.complexity/2)-1))}));
  return [...campaign,...random].map(decorateOrder);
}
let orders = Array.isArray(state.orderOptions) && state.orderOptions.length ? state.orderOptions.map(decorateOrder) : createOrderMarket();
state.orderOptions = orders;
let selectedOrderId = state.selectedOrder?.id ?? orders[0]?.id;
let visualProfile = createVisualProfile(state.visualSeed ?? 1, state.selectedOrder);
let sessionUser = null;
let lastFrame = performance.now();
let lastSaved = 0;
let renderedLogLength = state.log.length;
let eventShowing = null;
let resultShown = false;
let selectedPerson = null;
let playerMoveTarget = null;
let playerMoveZoneTaskId = null;
let playerMoveMarker = null;
let communicationWasPaused = true;
let selectedEmailTemplate = 'client';
let eveningScheduleSnapshot=null;
let eveningScheduleDay=-1;
let eveningEditing=false;
let selectedScheduleRoute=null;
let lastCharacterFrame=performance.now();
let lastHqCharacterFrame=performance.now();
let sceneAnimationTime=0;
let audioEnabled=true;
let audioContext=null;
let cameraKick=0;
let companyTab='portfolio';

const COMPANY_ROLE_SKILLS={
  'project-manager':'management',foreman:'management',designer:'design',pto:'documentation',
  procurement:'support',accountant:'support',estimator:'support',safety:'support',lawyer:'support',
};

function syncAssignedStaffToActiveProject(){
  ensureGameSaveV2(state);if(!state.selectedOrder)return;
  const active=state.portfolio.projects.find(project=>project.id===state.portfolio.activeProjectId);if(!active)return;
  const assigned=new Map(state.staff.employees.filter(employee=>employee.status==='employed'&&(active.staffIds??[]).includes(employee.id)&&(employee.unavailableUntilDay??0)<=state.companyCalendar.day).map(employee=>[employee.id,employee]));
  state.crews=state.crews.filter(crew=>!crew.id.startsWith('company-')||assigned.has(crew.id.slice(8)));
  for(const employee of assigned.values()){
    const crewId=`company-${employee.id}`;const existing=state.crews.find(crew=>crew.id===crewId);const roleSkill=COMPANY_ROLE_SKILLS[employee.roleId]??'support';
    const data={name:employee.name,role:employee.role,skill:roleSkill,color:employee.color,initials:employee.initials,speed:.72+employee.discipline/250,quality:.76+employee.competence/250,manpower:1,level:employee.level,employeeId:employee.id,supportRole:roleSkill==='support'?employee.roleId:undefined};
    if(existing)Object.assign(existing,data);else state.crews.push({id:crewId,...data,taskId:null,x:6+(state.crews.length%3),y:5+(state.crews.length%4),state:'idle'});
  }
}

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g,(character)=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[character]));
const refs = {
  canvas: $('#siteCanvas'), hqCanvas:$('#hqCanvas'), taskList: $('#taskList'), contractorList: $('#contractorList'), crewList: $('#crewList'),
  budget: $('#budgetValue'), budgetDelta: $('#budgetDelta'), deadline: $('#deadlineValue'), deadlineStatus: $('#deadlineStatus'),
  quality: $('#qualityValue'), qualityBar: $('#qualityBar'), trust: $('#trustValue'), day: $('#dayLabel'), time: $('#timeLabel'),
  counter: $('#taskCounter'), progress: $('#missionProgress'), crewCount: $('#crewCount'), risk: $('#riskLine'), siteStatus: $('#siteStatus'),
  situationInbox:$('#situationInbox'), situationCount:$('#situationCount'), situationInboxEmpty:$('#situationInboxEmpty'),
  selection: $('#selectionCard'), toasts: $('#toastStack'), brief: $('#briefModal'), event: $('#eventModal'), result: $('#resultModal'),
  auth:$('#authModal'),menu:$('#mainMenuModal'),orders:$('#ordersModal'),market:$('#marketModal'),schedule:$('#scheduleModal'),planning:$('#planningModal'),communication:$('#communicationModal'),report:$('#reportModal'),team:$('#teamModal'),finance:$('#financeModal'),docs:$('#docsModal'),situation:$('#situationModal'),
};
let openSituationId=null;
let scheduleWasPaused=true;
let renderedSituationSignature='';
let situationWasPaused=false;

const profileStorageKey=(name)=>`${STORAGE_KEY}:${encodeURIComponent((name??'guest').toLowerCase())}`;

function persistGame() {
  if(!sessionUser)return;
  syncActiveProjectToPortfolio(state);
  const raw=serializeState(state);
  localStorage.setItem(profileStorageKey(sessionUser),raw);
  fetch('/fg-api/save',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({state})}).catch(()=>{});
}

async function localPasswordHash(name,password) {
  const bytes=new TextEncoder().encode(`fitout-local:${name.toLowerCase()}:${password}`);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
}

async function localAuth(mode,name,password) {
  const accounts=JSON.parse(localStorage.getItem(`${STORAGE_KEY}:accounts`)??'{}');
  const hash=await localPasswordHash(name,password);
  if(mode==='register') {
    if(accounts[name.toLowerCase()])throw new Error('Такой игрок уже существует в этом браузере.');
    accounts[name.toLowerCase()]={name,hash};localStorage.setItem(`${STORAGE_KEY}:accounts`,JSON.stringify(accounts));
  } else if(!accounts[name.toLowerCase()]||accounts[name.toLowerCase()].hash!==hash)throw new Error('Имя или пароль не подошли.');
  return {user:name,state:restoreState(localStorage.getItem(profileStorageKey(name))),localOnly:true};
}

function installPlayerState(rawState) {
  const loaded=rawState?(typeof rawState==='string'?restoreState(rawState):restoreState(JSON.stringify(rawState))):null;
  const hasLivePortfolio=loaded?.portfolio?.projects?.some(project=>!project.summary?.completed);
  saved=loaded&&(!loaded.completed||hasLivePortfolio)?loaded:null;
  state=saved??createInitialState(Math.random,allRandomEvents);
  if(!saved&&loaded?.organization){state.organization=loaded.organization;state.hq=loaded.hq??state.hq;state.playerAvatar=loaded.playerAvatar??state.playerAvatar;}
  ensureGameSaveV2(state);
  ensureOrganization(state);
  ensureRuntimeCrews(state);
  ensureWorkforceMarket(state);
  ensureMasterSchedule(state);
  if(state.selectedOrder)state.selectedOrder=decorateOrder(state.selectedOrder);
  if(!Array.isArray(state.randomEvents)||state.randomEvents.length<12||!Array.isArray(state.eventSchedule)||state.randomEvents.some(id=>!randomEventById.has(id))||state.eventSchedule.some(item=>(item.probability??0)<.42)) {
    const refreshedEvents=createInitialState(Math.random,allRandomEvents);const currentDay=Math.floor((state.elapsed??0)/24)*24;state.randomEvents=refreshedEvents.randomEvents;state.eventSchedule=refreshedEvents.eventSchedule.map(item=>({...item,hour:item.hour+currentDay}));state.randomEvent=state.randomEvents[0];state.nextMajorEventAt=(state.elapsed??0)+.65;
  }
  state.nextSituationAt=Math.min(state.nextSituationAt??state.elapsed+1.35,state.elapsed+1.35);
  orders=Array.isArray(state.orderOptions)&&state.orderOptions.length?state.orderOptions.map(decorateOrder):createOrderMarket();
  state.orderOptions=orders;selectedOrderId=state.selectedOrder?.id??orders[0]?.id;
  visualProfile=createVisualProfile(state.visualSeed??1,state.selectedOrder);unlockTasks(state);clearCrewMeshes();rebuildTaskMarkers();
  renderedLogLength=state.log.length;resultShown=false;selectedPerson=null;playerMoveTarget=null;playerMoveZoneTaskId=null;if(playerMoveMarker)playerMoveMarker.visible=false;
}

function renderCompanyConsole(){
  ensureGameSaveV2(state);syncActiveProjectToPortfolio(state);
  const content=$('#companyConsoleContent');if(!content)return;
  const company=state.company;const activeProjects=state.portfolio.projects.filter(project=>!project.summary?.completed);
  $('#companyDayLabel').textContent=`День ${state.companyCalendar.day+1} · ${activeProjects.length}/${state.portfolio.maxActive} объектов`;
  const urgent=state.companyInbox.filter(item=>item.urgent).length;$('#companyAlertCount').textContent=`${urgent} ${urgent===1?'срочный вопрос':'срочных вопросов'}`;
  document.querySelectorAll('[data-company-tab]').forEach(button=>button.classList.toggle('active',button.dataset.companyTab===companyTab));
  const projectOptions=(selected='')=>`<option value="">Свободен / штаб</option>${activeProjects.map(project=>`<option value="${project.id}" ${project.id===selected?'selected':''}>${escapeHtml(project.summary.title)}</option>`).join('')}`;
  if(companyTab==='portfolio'){
    const cards=activeProjects.map(project=>{const summary=project.summary;const manager=state.staff.employees.find(item=>item.id===project.managerEmployeeId);const pending=project.changeOrders?.find(item=>item.status==='requested');return `<article class="portfolio-card ${project.id===state.portfolio.activeProjectId?'active':''}">
      <div><strong>${escapeHtml(summary.title)}</strong><small>${escapeHtml(summary.location)} · ${summary.area} м² · ${manager?`РП ${escapeHtml(manager.name)}`:'без руководителя'}</small>${pending?`<small class="bad">⚠ ${escapeHtml(pending.title)}</small>`:''}</div>
      <span class="portfolio-metric"><small>ГОТОВО</small><b>${summary.progress}%</b></span><span class="portfolio-metric"><small>ПРОГНОЗ</small><b class="${summary.forecastProfit>=0?'good':'bad'}">${summary.forecastProfit>=0?'+':''}${money(summary.forecastProfit)}</b></span><span class="portfolio-metric"><small>РАЗРЫВ</small><b class="${summary.cashGap?'bad':'good'}">${money(summary.cashGap)}</b></span>
      <div class="portfolio-actions"><select data-delegation-project="${project.id}" aria-label="Режим управления"><option value="manual" ${project.delegation.mode==='manual'?'selected':''}>Вручную</option><option value="supervised" ${project.delegation.mode==='supervised'?'selected':''}>Под контролем</option><option value="autonomous" ${project.delegation.mode==='autonomous'?'selected':''}>Автономно</option></select><button type="button" data-open-project="${project.id}">${project.id===state.portfolio.activeProjectId?'На площадке':'Открыть 3D'}</button><button type="button" data-order-materials="${project.id}">Материалы</button><button type="button" data-create-change="${project.id}">Тест допа</button></div>
      ${pending?`<div class="portfolio-actions" style="grid-column:1/-1"><button data-resolve-change="${project.id}:${pending.uid}:formal">Допсоглашение</button><button data-resolve-change="${project.id}:${pending.uid}:risk">Начать на риск</button><button data-resolve-change="${project.id}:${pending.uid}:refuse">Отказать</button><button data-resolve-change="${project.id}:${pending.uid}:magic">Я в пути!</button></div>`:''}
    </article>`;}).join('');
    const inbox=state.companyInbox.slice(0,5).map(item=>`<article class="company-inbox-row"><i></i><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.text)}</small></span><time>день ${item.createdDay+1}</time></article>`).join('');
    content.innerHTML=`<div class="company-panel">${cards||'<div class="company-empty">Портфель пуст. Ни одного кассового разрыва — подозрительно.</div>'}${inbox?`<div class="company-panel">${inbox}</div>`:''}</div>`;
  } else if(companyTab==='staff'){
    const employees=state.staff.employees.filter(employee=>employee.status==='employed').map(employee=>{const strengths=employee.strengths.map(id=>staffTrait(id)?.title).filter(Boolean).join(' · ');const weakness=staffTrait(employee.weakness)?.title;return `<article class="staff-card"><i class="staff-avatar" style="--staff-color:${employee.color}">${employee.initials}</i><div><strong>${escapeHtml(employee.name)} · ${escapeHtml(employee.role)} · ур. ${employee.level}</strong><small>${escapeHtml(employee.biography)}</small><small>${escapeHtml(strengths)} · слабость: ${escapeHtml(weakness)}</small><small>${escapeHtml(employee.currentThought)}</small></div><div class="staff-bars"><span>ЭНЕРГИЯ<i><em style="--value:${employee.energy}%"></em></i></span><span>СТРЕСС<i><em style="--value:${employee.stress}%;--bar:var(--orange)"></em></i></span><span>ВЫГОРАНИЕ<i><em style="--value:${employee.burnout}%;--bar:var(--red)"></em></i></span></div><div class="staff-assign"><select data-staff-project="${employee.id}">${projectOptions(employee.assignedProjectId)}</select><button data-assign-employee="${employee.id}">Назначить</button><button data-transfer-employee="${employee.id}">Срочно</button><button data-dismiss-employee="${employee.id}">${money(employee.salary)}/мес · уволить</button></div></article>`;}).join('');
    content.innerHTML=`<div class="company-panel">${employees||'<div class="company-empty">Штат отсутствует. Директор уже открыл восемь вкладок с аутсорсом.</div>'}</div>`;
  } else if(companyTab==='contractors'){
    content.innerHTML=`<div class="company-panel">${state.contractorNetwork.map(item=>`<article class="contractor-network-card"><i style="--contractor:${item.color}">${escapeHtml(item.company.slice(0,2).toUpperCase())}</i><div><strong>${escapeHtml(item.company)}</strong><small>${escapeHtml(item.name)} · ${escapeHtml(item.quirk??'Характер уточняется после аванса')}</small></div><span>ЛЮДИ<b>${item.manpower}</b></span><span>НАДЁЖНОСТЬ<b>${item.reliability}%</b></span><span>ОТНОШЕНИЯ<b>${item.relationship}/100</b></span></article>`).join('')}</div>`;
  } else if(companyTab==='finance'){
    const forecast=companyCashForecast(state,30);const min=Math.min(...forecast.map(item=>item.balance));const maxAbs=Math.max(1,...forecast.map(item=>Math.abs(item.balance)));const obligations=company.obligations.filter(item=>item.status!=='paid').sort((a,b)=>a.dueDay-b.dueDay).slice(0,8);
    content.innerHTML=`<div class="company-panel"><div class="company-finance-kpis"><div><small>КАССА</small><strong>${money(company.cash)}</strong></div><div><small>РЕЗЕРВ</small><strong>${money(company.reserve)}</strong></div><div><small>ДЕБИТОРКА</small><strong>${money(company.receivables)}</strong></div><div><small>КРЕДИТОРКА</small><strong>${money(company.payables)}</strong></div><div><small>МИНИМУМ 30 ДНЕЙ</small><strong style="color:${min<0?'var(--red)':'var(--green)'}">${money(min)}</strong></div></div><div class="forecast-strip" title="Прогноз остатка на 30 дней">${forecast.map(item=>`<i style="--height:${Math.max(6,Math.round(Math.abs(item.balance)/maxAbs*100))}%;--forecast-color:${item.balance<0?'var(--red)':'var(--green)'}"></i>`).join('')}</div><div><button class="company-action" data-reserve="50">Отложить 50К</button> <button class="company-action" data-reserve="-50">Вернуть 50К</button></div>${obligations.map(item=>`<article class="finance-row"><span>день ${item.dueDay+1}</span><strong>${escapeHtml(item.text||item.counterparty)}</strong><b>${item.direction==='receivable'?'+':'−'}${money(item.remaining)}</b>${item.direction==='payable'?`<button class="company-action" data-pay-obligation="${item.id}">Оплатить</button>`:'<span>ожидаем</span>'}</article>`).join('')}</div>`;
  } else if(companyTab==='market'){
    const projectIds=new Set(state.portfolio.projects.map(project=>project.id));const marketOrders=orders.filter(order=>!projectIds.has(order.id)).slice(0,5);const candidates=state.staff.candidates.slice(0,5);
    content.innerHTML=`<div class="company-panel">${marketOrders.map(order=>`<article class="market-project-card"><div><strong>${escapeHtml(order.title)}</strong><small>${escapeHtml(order.location)} · ${order.area} м² · ${escapeHtml(order.client)}</small></div><span class="portfolio-metric"><small>ДОГОВОР</small><b>${money(order.budget)}</b></span><span class="portfolio-metric"><small>СЛОЖНОСТЬ</small><b>${order.complexity}/5</b></span><button class="company-action" data-add-portfolio-order="${order.id}">Взять в портфель</button></article>`).join('')}${candidates.map(employee=>`<article class="staff-card"><i class="staff-avatar" style="--staff-color:${employee.color}">${employee.initials}</i><div><strong>${escapeHtml(employee.name)} · ${escapeHtml(employee.role)}</strong><small>${escapeHtml(employee.biography)}</small></div><div class="staff-bars"><span>КОМПЕТЕНТНОСТЬ<i><em style="--value:${employee.competence}%"></em></i></span><span>ДИСЦИПЛИНА<i><em style="--value:${employee.discipline}%"></em></i></span><span>ЛОЯЛЬНОСТЬ<i><em style="--value:${employee.loyalty}%"></em></i></span></div><button class="company-action" data-hire-employee="${employee.id}">Нанять · ${money(employee.salary)}/мес</button></article>`).join('')}<div>${COMPANY_ROLES.map(role=>`<button class="company-action" data-outsource-role="${role.id}">${state.staff.outsourcedRoles.includes(role.id)?'✓ ':''}Аутсорс: ${role.title}</button>`).join(' ')}</div></div>`;
  } else if(companyTab==='office'){
    const project=state.hq?.project;const active=project?.status==='active';content.innerHTML=`<div class="company-panel"><article class="office-project-card"><div><strong>${escapeHtml(state.hq?.title??'Стол у принтера')} · уровень ${state.hq?.level??0}</strong><small>${active?`Ремонт идёт ${Math.round(project.progress*100)}%. Бюджет ${money(project.budget)}, перерасход ${money(project.overrun)}.`:'Улучшение штаба теперь строится как настоящий внутренний проект: с авансом, сроком и неизбежным «не учли».'}</small><div class="office-project-progress"><i style="--progress:${active?Math.round(project.progress*100):0}%"></i></div></div><button class="company-action" data-start-hq-project ${active?'disabled':''}>${active?'Проект идёт':'Начать улучшение'}</button></article><div class="company-empty">В свободное время здесь находятся сотрудники без назначения. Назначенные на объекты не телепортируются обратно ради красивой картинки.</div></div>`;
  }
}

function renderMainMenu() {
  const organization=ensureOrganization(state);
  $('#menuProfileName').textContent=sessionUser??'ИГРОК';
  const continueButton=$('#continueGameButton');
  const liveProjects=state.portfolio?.projects?.filter(project=>!project.summary?.completed)??[];
  continueButton.disabled=!saved&&!liveProjects.length;
  if(liveProjects.length) {
    const active=liveProjects.find(project=>project.id===state.portfolio.activeProjectId)??liveProjects[0];
    $('#continueSummary').textContent=`В портфеле ${liveProjects.length} ${liveProjects.length===1?'объект':'объекта'}. Активный: ${active.summary.title}, готовность ${active.summary.progress}%, прогноз ${active.summary.forecastProfit>=0?'+':''}${money(active.summary.forecastProfit)}.`;
  } else $('#continueSummary').textContent='Сохранённого объекта пока нет. Это самый спокойный момент вашей карьеры.';
  $('#organizationName').textContent=organization.name;
  $('#organizationCash').textContent=money(organization.cash);
  $('#organizationLevel').textContent=`${organization.playerLevel} · ${organization.playerXp} XP`;
  $('#organizationDebt').textContent=money(organization.debt);
  $('#organizationDebt').title=organization.loans.length?`${organization.loans.length} договоров · просрочка ${money(organization.arrears??0)}`:'Кредитов нет';
  $('#organizationProjects').textContent=String(organization.projectsCompleted);
  $('#organizationReputation').textContent=`${organization.reputation} / 100`;
  const hqCosts=[80,170,320,520];const hqCost=hqCosts[Math.min(state.hq?.level??0,hqCosts.length-1)];
  $('#hqLevel').textContent=String(state.hq?.level??0);$('#hqTitle').textContent=state.hq?.title??'Стол у принтера';$('#hqStatus').textContent=state.hq?.lastFailure??'Клиентам строим лучше, чем себе.';$('#hqCost').textContent=`${hqCost}К`;
  $('#hqSceneLevel').textContent=String(state.hq?.level??0);$('#hqSceneTitle').textContent=state.hq?.title??'Стол у принтера';$('#hqSceneStatus').textContent=state.hq?.lastFailure??'Клиентам строим лучше, чем себе.';hqPreviewKey='';
  $('#developHqButton').disabled=organization.cash<hqCost;
  const designButton=$('#designOfficeButton');const designStatus=$('#designOfficeStatus');const designActive=Boolean(organization.inHouseDesign);const projectActive=Boolean(state.selectedOrder)&&state.started&&!state.completed;
  designButton.childNodes[0].textContent=designActive?'Распустить проектный отдел · ':'Проектный отдел · ';designStatus.textContent=designActive?'12К/день':(state.hq?.level??0)<2?'нужен штаб 2':'240К + 12К/день';designButton.disabled=projectActive||(!designActive&&((state.hq?.level??0)<2||organization.cash<240));
  const avatar=state.playerAvatar??={color:'#ddff55',outfit:'vest',helmet:'classic'};
  document.querySelectorAll('[data-avatar-color]').forEach(button=>button.classList.toggle('active',button.dataset.avatarColor===avatar.color));
  document.querySelectorAll('[data-avatar-outfit]').forEach(button=>button.classList.toggle('active',button.dataset.avatarOutfit===avatar.outfit));
  document.querySelectorAll('[data-avatar-helmet]').forEach(button=>button.classList.toggle('active',button.dataset.avatarHelmet===avatar.helmet));
  document.querySelectorAll('[data-loan]').forEach(button=>{button.disabled=organization.debt>=2320;button.title=button.disabled?'Лимит долговой нагрузки исчерпан':'Деньги попадут в текущий проект или в кассу организации';});
  renderCompanyConsole();
}

function resumePlayerGame() {
  if(state.completed){const next=state.portfolio?.projects?.find(project=>!project.summary?.completed&&project.id!==state.portfolio.activeProjectId);if(next)activatePortfolioProject(state,next.id);}
  refs.menu.classList.remove('visible');
  if(state.started){state.paused=true;if(state.needsPlanning){renderDayPlan();refs.planning.classList.add('visible');}}
  else if(state.phase==='preparation'){renderPreparation();refs.market.classList.add('visible');}
  else if(state.phase==='schedule'){openMasterSchedule();}
  else if(state.selectedOrder)refs.brief.classList.add('visible');else refs.orders.classList.add('visible');
  renderAll();
}

async function authenticate(mode) {
  const name=$('#authName').value.trim();const password=$('#authPassword').value;
  if(name.length<2||password.length<4){$('#authMessage').textContent='Нужно хотя бы 2 символа в имени и 4 в пароле.';return;}
  $('#authMessage').textContent='Проверяем журнал допусков…';
  let payload;
  try {
    const response=await fetch(`/fg-api/${mode}`,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({username:name,password})});
    payload=await response.json();if(!response.ok)throw new Error(payload.error??'Сервер не согласовал вход.');
  } catch(error) {
    if(error instanceof TypeError){payload=await localAuth(mode,name,password);payload.warning='VPS недоступен — работает локальное сохранение.';}
    else{$('#authMessage').textContent=error.message;return;}
  }
  const migrationNeeded=Boolean(payload.state&&payload.state.schemaVersion!==2);
  sessionUser=payload.user;installPlayerState(payload.state??localStorage.getItem(profileStorageKey(sessionUser)));
  $('#profileName').textContent=sessionUser;$('#profileChip').hidden=false;refs.auth.classList.remove('visible');
  for(const modal of document.querySelectorAll('.modal-backdrop'))if(modal!==refs.auth)modal.classList.remove('visible');
  renderMainMenu();refs.menu.classList.add('visible');renderAll();if(migrationNeeded)persistGame();
  showToast(payload.warning??(migrationNeeded?'Старое сохранение перенесено в компанию v0.1.0. Объект и деньги на месте.':saved?'Сохранение найдено. Оно ждёт в главном меню.':'Профиль открыт. Можно начинать новую проблему.'),'done');
}

function money(value) {
  return `${Math.round(value * 1000).toLocaleString('ru-RU')} ₽`;
}

function formatClock(elapsed) {
  const totalHours = 9 + (elapsed%24);
  const day = (state.companyCalendar?.day??Math.floor(elapsed/24)) + 1;
  const hour = Math.floor(totalHours) % 24;
  const minute = Math.floor((elapsed % 1) * 60);
  const names = ['ПТ', 'СБ', 'ВС', 'ПН', 'ВТ','СР','ЧТ'];
  return { day: `${names[(day-1)%names.length]} · ДЕНЬ ${day}`, time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

function formatRemaining(hours) {
  const safe = Math.max(0, hours);
  return `${Math.floor(safe / 24)} д ${Math.floor(safe % 24)} ч`;
}

function showToast(text, type = '') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = text;
  refs.toasts.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function ensureAudio() {
  if(!audioEnabled)return null;
  audioContext??=new (window.AudioContext||window.webkitAudioContext)();
  if(audioContext.state==='suspended')audioContext.resume();
  return audioContext;
}

function playSound(kind='click') {
  const context=ensureAudio();if(!context)return;
  const now=context.currentTime;const gain=context.createGain();gain.connect(context.destination);
  const oscillator=context.createOscillator();oscillator.connect(gain);
  const settings={click:[360,.045,.035],cash:[620,.11,.07],message:[760,.08,.055],risk:[120,.18,.08],done:[520,.18,.075],build:[95,.09,.035]}[kind]??[320,.06,.04];
  oscillator.type=kind==='risk'||kind==='build'?'square':'sine';oscillator.frequency.setValueAtTime(settings[0],now);
  if(kind==='done')oscillator.frequency.exponentialRampToValueAtTime(880,now+settings[1]);
  if(kind==='build')oscillator.frequency.exponentialRampToValueAtTime(55,now+settings[1]);
  gain.gain.setValueAtTime(settings[2],now);gain.gain.exponentialRampToValueAtTime(.0001,now+settings[1]);oscillator.start(now);oscillator.stop(now+settings[1]);
}

function feedback(kind='done') {
  playSound(kind==='risk'?'risk':kind==='cash'?'cash':kind==='message'?'message':kind==='build'?'build':'done');
  const flash=$('#feedbackFlash');flash.className=`feedback-flash ${kind==='risk'?'risk':''} visible`;window.setTimeout(()=>flash.classList.remove('visible'),150);
  cameraKick=Math.max(cameraKick,kind==='risk'?.32:kind==='build'?.16:.08);
}

function renderOrders() {
  const selected=orders.find(order=>order.id===selectedOrderId)??orders[0];
  if(!selected)return;
  selectedOrderId=selected.id;
  const organization=ensureOrganization(state);const locked=(order)=>(order.requiresProjects??0)>organization.projectsCompleted||(order.requiredLevel??1)>organization.playerLevel;
  $('#orderPins').innerHTML=orders.map((order,index)=>`<button class="order-pin ${order.id===selected.id?'selected':''} ${locked(order)?'locked':''}" style="left:${order.mapX}%;top:${order.mapY}%;--pin:${order.color}" data-order-id="${order.id}" data-label="${order.location} · ${order.finishClass}"><span>${order.tutorial?'У':order.clientType==='state'?'Г':'₽'}${index+1}</span></button>`).join('');
  $('#orderDetails').innerHTML=`<h2>${selected.title}</h2><span class="order-location">${selected.location} · ${selected.area.toLocaleString('ru-RU')} м²</span>
    <div class="order-badges">${selected.tutorial?'<span>ОБУЧЕНИЕ</span>':''}${selected.campaign?`<span>ГЛАВА ${selected.chapter}</span>`:''}<span>УРОВЕНЬ ${selected.requiredLevel}</span><span class="${selected.clientType==='state'?'state':''}">${selected.clientType==='state'?'государство':'коммерция'}</span><span>${selected.projectTypeLabel}</span><span>класс ${selected.finishClass}</span><span>сложность ${'◆'.repeat(selected.complexity)}</span></div>
    <div class="order-metrics"><div><small>СТАРТОВЫЙ БЮДЖЕТ</small><strong>${money(selected.budget)}</strong></div><div><small>СРОК</small><strong>${selected.deadlineHours} ч</strong></div><div><small>КАЧЕСТВО</small><strong>≥ ${selected.qualityTarget}</strong></div><div><small>ЗАКУПКА</small><strong>${selected.procurement}</strong></div></div>
    <div class="order-client"><strong>Состав работ · ${selected.tasks.length} операций</strong><small>${selected.tasks.slice(0,8).map(task=>task.short).join(' · ')}${selected.tasks.length>8?` · ещё ${selected.tasks.length-8}`:''}</small></div>
    <div class="order-client"><strong>${selected.clientName}</strong><small>${selected.clientPerson} · ${selected.clientRole}<br>${selected.clientType==='state'?'Решение считается принятым, когда его приняли все отсутствующие.':'Хочет быстро, качественно и чтобы резерв не использовался.'}</small></div>
    <ul class="order-risks">${(selected.requiredLevel??1)>organization.playerLevel?`<li>Нужен уровень ${selected.requiredLevel}. Сейчас: ${organization.playerLevel}.</li>`:''}${(selected.requiresProjects??0)>organization.projectsCompleted?`<li>Нужно закрыть проектов: ${selected.requiresProjects}. Сейчас: ${organization.projectsCompleted}.</li>`:''}${selected.riskTags.map(risk=>`<li>${risk}</li>`).join('')}</ul>`;
  $('#acceptOrder').disabled=locked(selected);$('#acceptOrder').innerHTML=locked(selected)?'Недостаточно опыта организации':'Вести переговоры <span>→</span>';
}

function updateMissionCopy() {
  const order=state.selectedOrder;if(!order)return;
  $('#missionName').textContent=order.title;
  $('#missionLocation').textContent=`${order.area.toLocaleString('ru-RU')} м² · ${order.location} · класс ${order.finishClass}`;
  $('#objectiveText').textContent=order.projectType==='greenfield'?'Построить офис там, где пока буквально поле':`Сдать ${order.area.toLocaleString('ru-RU')} м² без превращения графика в мемуары`;
  $('#clientKpi').textContent=`${order.clientPerson.split(' ')[0]} · ${order.clientRole}`;
  $('#briefTitle').textContent=order.title;
  $('#briefDescription').textContent=`${order.projectTypeLabel}, ${order.area.toLocaleString('ru-RU')} м², класс отделки ${order.finishClass}. ${order.clientType==='state'?'Контракт формально прозрачен: сквозь него видно ещё один контракт.':'Заказчик просит относиться к бюджету как к своему, а к сроку — как к чужому.'}`;
  $('#clientQuote').textContent=order.clientType==='state'?'«Главное — соблюсти процедуру. Офис тоже желательно построить.»':'«Въехать нужно быстро. Решения мы почти все приняли, кроме тех, которые поменяем.»';
  $('#clientCitation').textContent=`${order.clientPerson} · ${order.clientRole}, ${order.clientName}`;
}

function renderNegotiation() {
  if(!state.selectedOrder)return;
  updateMissionCopy();
  $('#contractBudget').textContent=`${(state.contract.budget/1000).toFixed(2).replace('.',',')} млн ₽`;
  $('#contractDeadline').textContent=`${state.contract.deadlineHours} часов`;
  $('#contractQuality').textContent=`не ниже ${state.contract.qualityTarget}`;
  $('#cardsPlayed').textContent=`${state.contract.cardsPlayed.length} / 2`;
  $('#contractDeck').innerHTML=CONTRACT_CARDS.map(card=>{const fixedBlocked=state.selectedOrder?.fixedContract&&((card.budget??0)!==0||(card.deadline??0)!==0);return `<button class="contract-card ${state.contract.cardsPlayed.includes(card.id)?'played':''}" data-contract-card="${card.id}" ${state.contract.cardsPlayed.includes(card.id)||fixedBlocked?'disabled':''}><strong>${card.title}</strong><small>${fixedBlocked?'ГОСКОНТРАКТ: цену и срок менять нельзя':card.note}</small></button>`;}).join('');
  const ready=state.contract.cardsPlayed.length===2;$('#startMission').disabled=!ready;$('#startMission').innerHTML=ready?'Подписать и искать команду <span>→</span>':'Сначала договоритесь <span>→</span>';
}

function renderPreparation() {
  const organization=ensureOrganization(state);$('#prepBudget').textContent=money(state.budget);
  $('#prepCombinedFunds').textContent=money(state.budget+organization.cash);
  $('#mapGrid').innerHTML=state.contractors.filter(contractor=>contractor.contractClass==='standard').map(contractor=>`<span class="map-node" style="--node:${contractor.color}">${contractor.initials}<small>${contractor.company}</small></span>`).join('');
  $('#teamPicker').innerHTML=state.team.map(member=>`<article class="prep-card"><span class="contractor-avatar" style="--crew-color:${member.color}">${member.initials}</span><span><strong>${member.name} · ур. ${member.level??1}</strong><small>${member.role} · ${member.effect}</small></span><button class="hire-button ${member.hired?'revoke':''}" ${member.hired?`data-team-unhire="${member.id}"`:`data-team-hire="${member.id}"`}>${member.hired?'ОТОЗВАТЬ':`${member.price}К`}</button></article>`).join('');
  $('#mapContractors').innerHTML=state.contractors.map(contractor=>`<article class="prep-card"><span class="contractor-avatar" style="--crew-color:${contractor.color}">${contractor.initials}</span><span><strong>${contractor.company} · ур. ${contractor.level??1} · ${contractor.manpower} чел.</strong><small>${contractor.classLabel} · ${contractor.name} · темп ${Math.round(contractor.speed*100)}% · качество ${Math.round(contractor.quality*100)}%</small></span><button class="hire-button ${contractor.hired?'revoke':''}" ${contractor.hired?`data-map-unhire="${contractor.id}"`:`data-map-hire="${contractor.id}"`}>${contractor.hired?'ОТОЗВАТЬ':`${contractor.price}К`}</button></article>`).join('');
  $('#confirmPreparationButton').textContent=state.preparationConfirmed?'Состав подтверждён ✓':'Подтвердить выбранный состав';$('#confirmPreparationButton').disabled=Boolean(state.preparationConfirmed);$('#enterSite').disabled=!state.preparationConfirmed;$('#prepConfirmStatus').textContent=state.preparationConfirmed?'Выход на объект разблокирован. Любое изменение снова откроет черновик.':'Состав можно менять и отзывать без штрафа.';
}

function renderDayPlan() {
  const dayIndex=Math.floor(state.elapsed/24);
  const candidates=scheduledTasksForDay(state,dayIndex);
  const hasSelectedTask=candidates.some(task=>task.enabledToday&&!['done','active'].includes(task.status));
  $('#planningTitle').textContent=`День ${dayIndex+1}: что сегодня действительно важно?`;
  $('#dayPlanList').innerHTML=candidates.map(task=>{const blockers=hardTaskBlockers(state,task);return `<button class="day-plan-card ${task.enabledToday?'selected':''}" data-day-task="${task.id}"><span class="task-status" style="--task-color:${task.color}">${ICONS[task.reworkOf?'clean':task.id]??'↺'}</span><span><strong>${task.title}</strong><small>${task.duration} ч · ${SKILL_LABELS[task.skill]}${blockers.length?` · БЛОК: ${blockers.map(item=>item.short).join(', ')}`:task.outOfSequence?' · РИСК ПОСЛЕДОВАТЕЛЬНОСТИ':''}</small></span><b>P${task.priority}</b></button>`;}).join('');
  if(!candidates.length)$('#dayPlanList').innerHTML='<div class="empty-day-plan">На этот день незавершённых работ по графику нет. Редкий управленческий успех.</div>';
  $('#startDay').disabled=!hasSelectedTask;
}

function scheduleStage(task) {
  if(task.category==='design'||['survey','project'].includes(task.id))return ['ПОДГОТОВКА / ПРОЕКТ','design'];
  if(task.category==='handover'||['clean','executive-docs','inspect'].includes(task.id))return ['ПУСК / СДАЧА','handover'];
  return ['СТРОИТЕЛЬСТВО','build'];
}

function renderMasterSchedule() {
  ensureMasterSchedule(state);
  const ordered=[...state.tasks].sort((a,b)=>a.scheduleOrder-b.scheduleOrder);
  const dayCount=Math.max(6,Math.min(18,Math.max(...ordered.map(task=>task.plannedFinishDay))+2));
  const header=Array.from({length:dayCount},(_,index)=>`<span>Д${index+1}</span>`).join('');
  $('#scheduleCalendar').innerHTML=`<div class="schedule-days"><span>РАБОТА</span><div>${header}</div><span>НАСТРОЙКА</span></div>${ordered.map((task,index)=>{
    const [stage,stageClass]=scheduleStage(task);const start=Math.min(dayCount-1,task.plannedStartDay);const finish=Math.min(dayCount-1,task.plannedFinishDay);const left=start/dayCount*100;const width=Math.max(100/dayCount,(finish-start+1)/dayCount*100);
    const conflict=task.deps.some(id=>(state.tasks.find(item=>item.id===id)?.plannedFinishDay??0)>task.plannedStartDay);const hardConflict=(task.hardDeps??[]).some(id=>(state.tasks.find(item=>item.id===id)?.plannedFinishDay??0)>task.plannedStartDay);
    return `<article class="schedule-row ${conflict?'conflict':''}" data-schedule-row="${task.id}"><div class="schedule-task"><span>${String(index+1).padStart(2,'0')}</span><div><strong>${task.title}</strong><small>${stage} · ${task.duration} ч${hardConflict?' · ЖЁСТКИЙ БЛОКЕР':conflict?' · РИСК ПОСЛЕДОВАТЕЛЬНОСТИ':''}</small></div></div><div class="schedule-track" style="--schedule-days:${dayCount}"><i class="${stageClass}" style="left:${left}%;width:${width}%"><b>${Math.round(task.progress*100)}%</b></i></div><div class="schedule-controls"><button data-schedule-order="-1" data-schedule-task="${task.id}" aria-label="Поднять работу">↑</button><button data-schedule-day="-1" data-schedule-task="${task.id}" aria-label="Сдвинуть раньше">−</button><b>Д${task.plannedStartDay+1}</b><button data-schedule-day="1" data-schedule-task="${task.id}" aria-label="Сдвинуть позже">+</button><button data-schedule-order="1" data-schedule-task="${task.id}" aria-label="Опустить работу">↓</button></div></article>`;
  }).join('')}`;
  const conflicts=ordered.filter(task=>task.deps.some(id=>(state.tasks.find(item=>item.id===id)?.plannedFinishDay??0)>task.plannedStartDay)).length;const hardConflicts=ordered.filter(task=>(task.hardDeps??[]).some(id=>(state.tasks.find(item=>item.id===id)?.plannedFinishDay??0)>task.plannedStartDay)).length;
  $('#scheduleWarning').textContent=hardConflicts?`${hardConflicts} жёстких конфликт(а): график сохранить можно, но фронт физически не стартует до снятия блокера.`:conflicts?`${conflicts} мягких конфликт(а). Принять можно — переделки тоже можно.`:'Зависимости согласованы. Изменения попадут в утренние планёрки.';
}

function openMasterSchedule() {
  if(!state.selectedOrder){showToast('Сначала выберите заказ.');return;}
  $('#scheduleTitle').textContent=eveningEditing?'Вечерняя корректировка графика':'Общий график строительства';
  $('#acceptSchedule').textContent=eveningEditing?'Зафиксировать изменения →':'Принять общий график →';
  scheduleWasPaused=state.paused;state.paused=true;renderMasterSchedule();refs.schedule.classList.add('visible');
}

function closeMasterSchedule() {
  refs.schedule.classList.remove('visible');
  if(eveningEditing){eveningEditing=false;renderEveningScheduleDecision();refs.report.classList.add('visible');return;}
  if(state.started)state.paused=scheduleWasPaused;else refs.market.classList.add('visible');
}

function projectTime(hourOffset=0) {
  const workHour=9+((state.elapsed+hourOffset)%24);
  const hours=Math.floor(workHour)%24;const minutes=Math.floor((workHour-Math.floor(workHour))*60);
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
}

function renderWhatsapp() {
  const pending=state.tasks.filter(task=>!['done','active','awaiting'].includes(task.status));
  const recent=(state.log??[]).slice(-4).map((item,index)=>({name:index%2?'Прораб':'Алина · РП',text:item.text,time:projectTime(-.18*(4-index))}));
  const base=[
    {name:'Прораб',text:'Доброе утро. Закрепил план, пока никто его не отменил.',time:'09:04'},
    {name:'Мария · архитектор',text:'Коллеги, по узлам сначала смотрим рабочий проект. Потом импровизируем.',time:'09:11'},
  ];
  const messages=[...base,...recent,...(state.chatMessages??[])];
  const options=pending.map(task=>`<option value="${task.id}">${escapeHtml(task.title)}</option>`).join('');
  $('#communicationActions').innerHTML=`<div class="wa-shell">
    <header class="wa-header"><span class="wa-avatar">ОБ</span><div><strong>Стройка · ${escapeHtml(state.selectedOrder?.location??'объект')}</strong><small>${state.crews.length} участников · на связи</small></div><span class="wa-header-icons">⌕ ⋮</span></header>
    <div class="wa-thread"><div class="wa-system">Сообщения защищены. Сроки — нет.</div>${messages.map(message=>`<article class="wa-message ${message.mine?'mine':''}"><b>${escapeHtml(message.name??sessionUser??'Вы')}</b><span>${escapeHtml(message.text)}</span><time>${escapeHtml(message.time??projectTime())}${message.mine?' ✓✓':''}</time></article>`).join('')}</div>
    <div class="wa-compose"><button class="wa-attach" type="button" title="Прикрепить">＋</button><div><select id="urgentTaskSelect" aria-label="Работа для срочного сообщения" ${pending.length?'':'disabled'}>${options||'<option>Нет доступных работ</option>'}</select><input id="urgentMessageInput" aria-label="Текст сообщения" value="Сделать срочно. Почему ещё не начали?" ${pending.length?'':'disabled'} /></div><button class="wa-send" type="button" data-send-urgent ${pending.length?'':'disabled'} aria-label="Отправить сообщение">➤</button></div>
    <footer class="wa-consequence">Срочное сообщение: −5 тыс. ₽ · −1 доверие · выбранная работа получает P3</footer>
  </div>`;
  const thread=$('.wa-thread');if(thread)thread.scrollTop=thread.scrollHeight;
}

const EMAIL_TEMPLATES={
  client:{to:'Арсений Грачёв · заказчик',cc:'Мария Корнилова; Алина Ветрова',subject:'Требуется решение по объекту',body:'Коллеги, просим подтвердить решение по приложенному листу вопросов. До получения ответа работы выполняются по последней согласованной версии.',effect:'+2 доверие · +1 час на переписку',attachment:'Лист_вопросов_к_заказчику_v5.pdf'},
  clientMoney:{to:'Арсений Грачёв · заказчик',cc:'Финансовый директор; Алина Ветрова',subject:'Запрос дополнительного финансирования',body:'В связи с фактическим прогрессом и уточнением объёмов просим согласовать дополнительный резерв. Актуальный прогноз до завершения и подтверждающие документы приложены.',effect:'шанс зависит от прогресса и доверия · 1 запрос в день',attachment:'Прогноз_ДДС_и_обоснование_v11.xlsx'},
  boss:{to:'Виктор Аркадьевич · руководство',cc:'Финансовый директор; PMO',subject:'Запрос дополнительного резерва',body:'В связи с уточнением объёмов просим открыть резерв проекта. План корректирующих мероприятий и прогноз до завершения приложены.',effect:'+20 тыс. ₽ · −2 доверие',attachment:'Прогноз_денег_финал_v3.xlsx'},
  contractors:{to:'Руководители подрядных организаций',cc:'Технический надзор; Юридический отдел',subject:'ПРЕТЕНЗИЯ: немедленно устранить отставание',body:'Настоящим фиксируем критическое отставание. Требуем немедленно усилить выбранный фронт, предоставить корректирующий план и подтвердить персональную ответственность.',effect:'90% на сильное ускорение · 1 раз в день · −10 тыс. ₽',attachment:'Фотофиксация_и_таблица_ответственных.zip'},
};

function renderEmailComposer(templateId=selectedEmailTemplate) {
  selectedEmailTemplate=templateId;const template=EMAIL_TEMPLATES[templateId];
  const hiredContractors=state.contractors.filter(item=>item.hired);const taskPicker=templateId==='contractors'?`<label><span>Адресат</span><select id="emailContractorSelect"><option value="all">ВСЕМ подрядчикам · дороже и громче</option>${hiredContractors.map(item=>`<option value="${item.id}">${escapeHtml(item.company)} · ${escapeHtml(item.name)}</option>`).join('')}</select></label>`:'';
  $('#communicationActions').innerHTML=`<div class="mail-shell"><div class="mail-ribbon"><strong>Новое сообщение</strong><span>Файл</span><span>Сообщение</span><span>Вставка</span><span>Параметры</span></div><div class="mail-workspace"><nav class="mail-templates"><span>ШАБЛОН ПИСЬМА</span>${Object.entries(EMAIL_TEMPLATES).map(([id,item])=>`<button class="${id===templateId?'active':''}" data-email-template="${id}">${id==='client'?'Запросить решение':id==='clientMoney'?'Попросить денег':id==='boss'?'Запросить резерв':'Жёсткая претензия'}<small>${item.effect}</small></button>`).join('')}</nav><div class="mail-compose"><label><span>Кому</span><input value="${escapeHtml(template.to)}" readonly></label><label><span>Копия</span><input value="${escapeHtml(template.cc)}" readonly></label><label><span>Тема</span><input value="${escapeHtml(template.subject)}" readonly></label>${taskPicker}<textarea aria-label="Текст письма">${escapeHtml(template.body)}</textarea><div class="mail-attachment">▧ ${escapeHtml(template.attachment)} <small>248 КБ</small></div><div class="mail-send-row"><button class="mail-send" data-send-email="${templateId}">Отправить</button><span>Последствие: <b>${template.effect}</b></span></div></div></div></div>`;
}

function closeCommunication() {
  refs.communication.classList.remove('visible');
  state.paused=communicationWasPaused;
}

function openCommunication(mode) {
  if(!state.started){showToast('Сначала подпишите контракт и выйдите на объект.');return;}
  communicationWasPaused=state.paused;state.paused=true;
  const whatsapp=mode==='whatsapp';const window=$('#communicationWindow');
  window.classList.toggle('is-whatsapp',whatsapp);window.classList.toggle('is-email',!whatsapp);
  $('#communicationKicker').textContent=whatsapp?'WHATSAPP · ЧАТ СТРОЙКИ':'OUTLOOK · НОВОЕ ПИСЬМО';
  $('#communicationTitle').textContent=whatsapp?'Чат стройки':'Зафиксировать позицию письмом';
  $('#communicationText').textContent=whatsapp?'Объект стоит на паузе, пока вы читаете переписку.':'Выберите деловую операцию, проверьте адресатов и только потом отправляйте.';
  if(whatsapp)renderWhatsapp();else renderEmailComposer();
  refs.communication.classList.add('visible');
}

function openReport() {
  if(refs.report.classList.contains('visible'))return;
  const day=Math.floor(state.elapsed/24);if(eveningScheduleDay!==day){eveningScheduleSnapshot=captureMasterSchedule(state);eveningScheduleDay=day;selectedScheduleRoute=null;}
  const baseRows=[];
  for(let index=0;index<36;index++) {
    const task=state.tasks[index%state.tasks.length];const crew=state.crews.find(item=>item.id===task.crewId);
    const actual=Math.round(task.duration*Math.max(.15,task.progress)*10)/10;const variance=Math.round((actual-task.duration/(1+(index%3)*.08))*10)/10;
    baseRows.push(`<tr><td>${index+1}</td><td>1.${Math.floor(index/6)+1}.${index%6+1}</td><td>${task.title}${index>=state.tasks.length?' · уточняющая строка':''}</td><td>${task.duration.toFixed(1)}</td><td>${actual.toFixed(1)}</td><td>${variance>0?'+':''}${variance.toFixed(1)}</td><td>${STATUS_LABELS[task.status]??task.status}</td><td>${crew?.name??'Не назначен'}</td><td>${index%4===0?'Ожидается уточнение после уточнения':index%4===1?'Без критических критических замечаний':index%4===2?'В работе согласно текущей версии текущего графика':'Требуется письмо'}</td></tr>`);
  }
  $('#reportRows').innerHTML=baseRows.join('');
  $('#reportSummary').textContent=`36 строк · ${state.tasks.filter(t=>['done','skipped'].includes(t.status)).length} закрыто · файл весит больше, чем управленческое решение`;
  renderEveningScheduleDecision();
  refs.report.classList.add('visible');
}

function renderEveningScheduleDecision() {
  if(!eveningScheduleSnapshot)return;
  const before=new Map(eveningScheduleSnapshot.map(item=>[item.id,item]));
  const changed=state.tasks.filter(task=>{const old=before.get(task.id);return old&&!['done','active','awaiting'].includes(task.status)&&(old.start!==task.plannedStartDay||old.finish!==task.plannedFinishDay||old.order!==task.scheduleOrder);}).length;
  if(!changed)selectedScheduleRoute=null;
  $('#eveningScheduleDecision').innerHTML=`<div><span>ВЕЧЕРНЕЕ РЕШЕНИЕ</span><strong>${changed?`Изменено работ: ${changed}`:'График пока не трогали'}</strong><small>${changed?'Выберите, как легализовать новую версию.':'Можно сдвинуть будущие работы и попробовать выиграть срок.'}</small></div><div class="evening-tools"><button type="button" data-edit-evening-schedule>▦ Поправить график</button><button type="button" data-open-evening-team>♟ Состав / замена</button></div>${changed?`<div class="schedule-route"><button class="${selectedScheduleRoute==='restore'?'selected':''}" data-schedule-route="restore">Отменить правки<small>вернуть базу</small></button><button class="${selectedScheduleRoute==='secret'?'selected':''}" data-schedule-route="secret">Тайком<small>быстро · риск вскрытия</small></button><button class="${selectedScheduleRoute==='client'?'selected':''}" data-schedule-route="client">Через заказчика<small>может не согласовать</small></button></div>`:''}`;
  $('#sendReport').disabled=changed&&!selectedScheduleRoute;
}

function assignmentControls(crew) {
  if(!crew||(crew.unavailableUntil??0)>state.elapsed)return '';
  const tasks=state.tasks.filter(task=>['ready','locked'].includes(task.status)&&!task.crewId);
  if(!tasks.length)return '';
  return `<div class="crew-reassign"><select data-assignment-select="${crew.id}" aria-label="Новый фронт для ${escapeHtml(crew.name)}">${tasks.map(task=>`<option value="${task.id}">${escapeHtml(task.short)} · ${task.skill===crew.skill?'профиль':'не профиль'}</option>`).join('')}</select><button data-force-assign="${crew.id}">Нагнать</button></div>`;
}

function renderTeamBook() {
  const teamRows=state.team.map(member=>{const crew=state.crews.find(item=>item.id===`team-${member.id}`);const away=crew&&(crew.unavailableUntil??0)>state.elapsed;return `<article class="book-person contractor-book-row"><i style="--person:${member.color}">${member.initials}</i><span><strong>${member.name} · ур. ${member.level??1}</strong><small>${member.role} · ${member.effect}</small></span><div><b class="${!member.hired||away?'away':''}">${!member.hired?'НЕ НАНЯТ':away?'НЕТ НА ОБЪЕКТЕ':crew?.taskId?'В РАБОТЕ':'НА ОБХОДЕ'}</b>${member.hired?assignmentControls(crew):''}</div></article>`;});
  const permanentDesign=state.crews.find(crew=>crew.id==='inhouse-design');if(permanentDesign)teamRows.unshift(`<article class="book-person contractor-book-row"><i style="--person:#a58ae1">ПО</i><span><strong>Проектный отдел организации · 3 чел.</strong><small>Постоянный штат · 12К операционных расходов в день</small></span><div><b>${permanentDesign.taskId?'ВЫПУСКАЕТ ПРОЕКТ':'В ШТАБЕ'}</b>${assignmentControls(permanentDesign)}</div></article>`);
  const hired=state.contractors.filter(item=>item.hired);
  const contractorRows=hired.map(item=>{const crew=state.crews.find(crew=>crew.id===`crew-${item.id}`);const waiting=crew&&(crew.unavailableUntil??0)>state.elapsed;const actual=crewHeadcount(state,crew);const pending=crew?.pendingManpower??0;return `<article class="book-person contractor-book-row"><i style="--person:${item.color}">${item.initials}</i><span><strong>${item.company} · ур. ${item.level??1} · ${actual} чел.${pending?` +${pending} завтра`:''}</strong><small>${item.classLabel} · ${item.name} · ${item.quirk}</small></span><div><b class="${waiting?'away':''}">${waiting?'ВЫХОД ЗАВТРА':crew?.visualBehavior==='smoking'?'КУРЯТ':crew?.taskId?'РАБОТАЮТ':'НА ОБЪЕКТЕ'}</b><span class="manpower-controls"><button type="button" data-contract-manpower="${item.id}" data-manpower-delta="-1" ${item.manpower<=2?'disabled':''}>−1 человек</button><button type="button" data-contract-manpower="${item.id}" data-manpower-delta="1" ${item.manpower>=12?'disabled':''}>Усилить +1</button></span>${assignmentControls(crew)}<button data-dismiss-contractor="${item.id}" ${state.needsReport?'':'disabled'}>Снять вечером</button></div></article>`;}).join('');
  const replacements=state.contractors.filter(item=>!item.hired).map(item=>`<article class="book-person contractor-book-row"><i style="--person:${item.color}">${item.initials}</i><span><strong>${item.company} · ${item.classLabel} · ${item.manpower} чел.</strong><small>${item.quirk}<br>${item.price}К · темп ${Math.round(item.speed*100)}% · качество ${Math.round(item.quality*100)}%</small></span><button data-replace-contractor="${item.id}">Нанять · выход завтра</button></article>`).join('');
  const hiredPeople=hired.reduce((sum,item)=>sum+crewHeadcount(state,state.crews.find(crew=>crew.id===`crew-${item.id}`)),0);
  const ownPeople=state.team.filter(item=>item.hired).length+(permanentDesign?crewHeadcount(state,permanentDesign):0);$('#teamBook').innerHTML=`<div class="subheading"><span>ВАША КОМАНДА · ОПЫТ ОСТАЁТСЯ</span><strong>${ownPeople} ЧЕЛ.</strong></div>${teamRows.join('')}<div class="subheading" style="margin-top:16px"><span>ПОДРЯДЧИКИ · СНЯТИЕ ТОЛЬКО ВЕЧЕРОМ</span><strong>${hiredPeople} ЧЕЛ. · ${hired.length} БРИГ.</strong></div>${contractorRows||'<p class="empty-team">На объекте остался только оптимизм.</p>'}${replacements?`<div class="subheading" style="margin-top:16px"><span>ДОНАБОР ЛЮБОГО ПРОФИЛЯ · 1 ДЕНЬ</span><strong>${state.contractors.length} В ПУЛЕ</strong></div><div class="contractor-market-grid">${replacements}</div>`:''}`;
}

function renderFinanceBook() {
  const finance=ensureProjectFinance(state);
  const organization=ensureOrganization(state);const month=Math.floor((organization.calendarDay??0)/30)+1;
  const nextLoan=[...(organization.loans??[])].sort((a,b)=>(a.nextDueMonth??0)-(b.nextDueMonth??0))[0];
  const retention=Math.min(Math.max(0,(finance.contractValue??0)-(finance.received??0)),Math.round((finance.contractValue??0)*.15));const docsDone=state.tasks.find(task=>task.id==='executive-docs')?.status==='done';
  $('#financeKpis').innerHTML=`<div><small>СЧЁТ ОБЪЕКТА</small><strong>${money(state.budget)}</strong></div><div><small>КАССА ОРГАНИЗАЦИИ</small><strong>${money(organization.cash)}</strong></div><div><small>ДОЛГ БАНКУ</small><strong>${money(organization.debt)}</strong></div><div><small>УДЕРЖАНО ДО СДАЧИ ИД</small><strong>${money(retention)} · ${docsDone?'ИД ГОТОВА':'БЛОК'}</strong></div><div><small>СЛЕДУЮЩИЙ ПЛАТЁЖ</small><strong>${nextLoan?money(Math.min(nextLoan.remaining,nextLoan.monthlyPayment+(nextLoan.arrears??0))):'—'}</strong></div><div><small>КАЛЕНДАРЬ / ПРОСРОЧКА</small><strong>М${month} · ${money(organization.arrears??0)}</strong></div>`;
  const loanRows=(organization.loans??[]).map(loan=>`<article><span><strong>${loan.label}</strong><small>${Math.round(loan.rate*100)}% · ещё ${money(loan.remaining)}</small></span><b>${money(loan.monthlyPayment)}/мес</b></article>`).join('');
  const creditDisabled=organization.debt>=2320;
  $('#financeLoans').innerHTML=`<header><span><strong>БАНКОВСКАЯ ЛИНИЯ</strong><small>Деньги идут на счёт объекта. Платёж каждые 30 игровых дней списывается из кассы организации.</small></span><b>МЕСЯЦ ${month}</b></header><div class="finance-loan-actions"><button type="button" data-loan="300" data-loan-recipient="project" ${creditDisabled?'disabled':''}>Взять 300К на объект · 12 мес</button><button type="button" data-loan="800" data-loan-recipient="project" ${creditDisabled?'disabled':''}>Взять 800К на объект · 18 мес</button></div>${loanRows||'<p>Банк пока считает вас человеком, способным читать договор.</p>'}`;
  $('#cashLedger').innerHTML=(finance.ledger??[]).map(row=>`<article class="cash-row ${row.type}"><span>Д${Math.floor((row.hour??0)/24)+1} · ${row.category}</span><div>${row.text}<small>${row.type==='income'?'Деньги существуют до следующей поставки.':'Оплачено, поэтому теперь можно спорить о качестве.'}</small></div><b>${row.type==='income'?'+':'−'}${money(row.amount)}</b></article>`).join('')||'<p>Бухгалтерия ещё не нашла этот проект.</p>';
}

function renderDocsBook() {
  const project=state.tasks.find(task=>task.id==='project');const executive=state.tasks.find(task=>task.id==='executive-docs');
  const sheet=(title,task,code)=>`<article class="drawing-sheet"><h3>${title}</h3><p>${task?.title??'Раздел пока не предусмотрен договором, но понадобится на приёмке.'}</p><div class="drawing-plan"></div><div class="drawing-progress"><i style="width:${Math.round((task?.progress??0)*100)}%"></i></div><footer><span>${code}</span><span>${Math.round((task?.progress??0)*100)}% · ${STATUS_LABELS[task?.status]??'НЕ НАЧАТО'}</span></footer></article>`;
  $('#drawingBoard').innerHTML=sheet('РАБОЧИЙ ПРОЕКТ',project,'РД-АР/ОВ/ЭОМ')+sheet('ИСПОЛНИТЕЛЬНАЯ',executive,'ИД-АКТ/СХЕМА/ПАСПОРТ');
}

function taskProblem(task) {
  if(task.status==='awaiting')return 'Физически готово, но этапных денег ещё нет — предъявите заказчику';
  if(task.reworkOf)return 'Переделка из-за неверной последовательности работ';
  if(task.status==='blocked'){
    const shortage=Math.max(0,Math.ceil((task.cost-state.budget)*10)/10);
    return shortage>0?`Не хватает ${shortage.toLocaleString('ru-RU')} тыс. ₽ на запуск`:'Финансирование уже поступило — работа возвращается в очередь';
  }
  const activeQuestion=(state.activeSituations??[]).find(item=>item.crewId===task.crewId);
  if(activeQuestion)return situationById.get(activeQuestion.templateId)?.title??'Бригада ждёт решения';
  const crew=task.crewId?state.crews.find(item=>item.id===task.crewId):null;
  if(crew&&(crew.unavailableUntil??0)>state.elapsed)return 'Исполнитель временно снят с объекта';
  if(task.outOfSequence&&task.status!=='done')return 'Риск: работа начата раньше зависимостей';
  if(task.status==='locked') {
    const hard=hardTaskBlockers(state,task).map(item=>item.short);
    if(hard.length)return `Жёсткий блокер: сначала ${hard.join(', ')}`;
    const waiting=task.deps.map(id=>state.tasks.find(item=>item.id===id)?.short).filter(Boolean);
    return waiting.length?`Ждёт: ${waiting.join(', ')}`:'Ждёт предыдущие работы';
  }
  if(task.manualPaused)return `Приостановлено на ${Math.round((task.progress??0)*100)}% · бригада освобождена`;
  if(task.status==='ready'&&state.started&&!state.crews.some(item=>item.skill===task.skill||item.skill==='general'))return `Нет исполнителя: ${SKILL_LABELS[task.skill]}`;
  if(task.status==='ready'&&state.started&&!task.enabledToday)return 'Не включено в план текущего дня';
  return '';
}

function taskStatus(task) {
  if(task.status==='done')return ['ГОТОВО','done'];
  if(task.status==='skipped')return ['ПРОПУЩЕНО','waiting'];
  if(task.status==='awaiting')return ['ПРЕДЪЯВИТЬ','acceptance'];
  if(task.status==='active')return ['ИДЁТ','active'];
  if(task.status==='blocked')return ['ПРОБЛЕМА','problem'];
  if(task.status==='locked')return ['ОЖИДАЕТ','waiting'];
  if(task.manualPaused)return ['ПАУЗА','waiting'];
  if(task.enabledToday)return ['В ПЛАНЕ','planned'];
  return ['К СТАРТУ','ready'];
}

function renderTasks() {
  refs.taskList.innerHTML = state.tasks.map((task) => {
    const percent = Math.round(task.progress * 100);
    const [statusLabel,statusClass]=taskStatus(task);
    const issue=taskProblem(task);
    return `<article class="task-card ${task.status} ${issue?'has-problem':''} ${state.selectedTaskId === task.id ? 'selected' : ''}" data-task="${task.id}" style="--task-color:${task.color};--progress:${percent}%">
      <span class="task-status">${task.status === 'done' ? '✓' : task.status==='skipped'?'×':(ICONS[task.reworkOf?'clean':task.id]??'◆')}</span>
      <span class="task-copy">
        <span class="task-title-row"><strong>${task.title}</strong><b class="task-state ${statusClass}">${statusLabel}</b></span>
        <span class="task-progress-row"><i><em style="width:${percent}%"></em></i><b>${percent}%</b><small>${SKILL_LABELS[task.skill]} · ${task.duration} ч</small></span>
        ${issue?`<span class="task-problem">! ${issue}</span>`:''}
        ${task.status==='ready'&&!task.enabledToday?`<button class="task-start-button" data-start-task="${task.id}">${task.manualPaused?'Возобновить работы':'Включить сегодня · начать'}</button>`:''}
        ${task.status==='active'?`<button class="task-stop-button" data-stop-task="${task.id}">Остановить работы</button>`:''}
        ${task.optional&&['ready','locked','blocked'].includes(task.status)?`<button class="task-skip-button" data-skip-task="${task.id}">Сэкономить · пропустить с риском</button>`:''}
        ${task.status==='awaiting'?`<button class="acceptance-button" data-submit-task="${task.id}">Предъявить работу · попытка ${(task.acceptanceAttempts??0)+1}</button>`:''}
      </span>
      <button class="priority-button" data-priority="${task.id}" title="Изменить приоритет" aria-label="Приоритет ${task.priority}">
        <span>P${task.priority}</span><span class="priority-bars">${[1,2,3].map((i) => `<i class="${i > task.priority ? 'off' : ''}"></i>`).join('')}</span>
      </button>
    </article>`;
  }).join('');
}

function renderContractors() {
  refs.contractorList.innerHTML = state.contractors.map((contractor) => `<article class="contractor-card">
    <span class="contractor-avatar" style="--crew-color:${contractor.color}">${contractor.initials}</span>
    <span class="contractor-copy"><strong>${contractor.company} · ур. ${contractor.level??1}</strong><small>${contractor.classLabel} · ${contractor.name} · ${contractor.quirk}</small><span class="contractor-meta"><b>♟ ${contractor.manpower} чел.</b><b>★ ${contractor.rating}</b><b>↗ ${Math.round(contractor.speed * 100)}% темп</b><b>◆ ${Math.round(contractor.quality*100)}% качество</b></span></span>
    <button class="hire-button" data-hire="${contractor.id}" ${contractor.hired||state.started ? 'disabled' : ''}>${contractor.hired ? 'НАНЯТЫ' : state.started?'КАРТА':`${contractor.price}К`}</button>
  </article>`).join('');
}

function renderCrews() {
  refs.crewList.innerHTML = state.crews.map((crew) => {
    const task = state.tasks.find((item) => item.id === crew.taskId);
    const behavior=crew.visualBehavior;const stateLabel=behavior==='cleaning'?'УБИРАЕТ':behavior==='to-clean'?'К МУСОРУ':behavior==='smoking'?'КУРИТ':behavior==='to-smoke'?'НА ПЕРЕКУР':behavior==='to-work'?'ИДЁТ':task?'РАБОТАЕТ':'ЖДЁТ';
    return `<article class="crew-card"><span class="crew-avatar" style="--crew-color:${crew.color}">${crew.initials}</span><span><strong>${crew.name} · ${crewHeadcount(state,crew)} чел.</strong><small>${task ? task.short : crew.role}</small></span><span class="crew-state ${task&&!behavior?.includes('smoke')?'':'idle'}">${stateLabel}</span></article>`;
  }).join('');
  const presentCrews=state.crews.filter(crew=>(crew.unavailableUntil??0)<=state.elapsed);const presentPeople=presentCrews.reduce((sum,crew)=>sum+crewHeadcount(state,crew),0);
  refs.crewCount.textContent = `${presentPeople} чел. · ${presentCrews.length} групп →`;
}

function renderSelection() {
  if(selectedPerson?.userData?.isPerson) {
    const data=selectedPerson.userData;
    const crew=state.crews.find(item=>item.id===data.crewId);
    const task=crew?.taskId?state.tasks.find(item=>item.id===crew.taskId):null;
    const thoughts=PERSON_THOUGHTS[data.role]??PERSON_THOUGHTS.default;
    const thought=thoughts[(Math.floor(state.elapsed/6)+(data.variant??0))%thoughts.length];
    const mood=data.isSmoker?'Подозрительно расслаблен':data.eventActor?'Официально сосредоточен':task?'Занят и слегка раздражён':data.role==='client'?(state.trust>75?'Осторожно доволен':'Считает чужие деньги'):data.role==='architect'?'Защищает концепцию':'Ждёт указаний';
    const roleActions={architect:'Сверяет чертёж с тем, что получилось',client:'Осматривает объект и ищет сюрпризы',police:'Проверяет документы и этаж',inspector:'Ищет акт, журнал и удлинитель',boss:'Решает, кого забрать на другой объект',medic:'Проверяет состояние человека',delivery:'Ищет место разгрузки'};
    const action=data.isSmoker?'Обсуждает проблему, не двигаясь к ней':crew?.visualBehavior==='cleaning'?'Убирает накопившийся строительный мусор':crew?.visualBehavior==='to-clean'?'Идёт к следующей куче мусора':crew?.visualBehavior==='smoking'?'Курит. Квалификация пока позволяет только это':crew?.visualBehavior==='to-smoke'?'Целенаправленно идёт в курилку':crew?.visualBehavior==='to-work'?'Идёт на назначенный фронт':crew?.visualBehavior==='idle'?'Бездельничает в отведённом месте':task?.title??roleActions[data.role]??'Ожидает доступную работу';
    refs.selection.hidden=false;
    refs.selection.style.setProperty('--task-color',data.role==='client'?'#d6a579':data.role==='architect'?'#d87561':'#ddff55');
    refs.selection.innerHTML=`<div class="selection-top"><div><span class="eyebrow">${data.role==='player'?'ВЫ НА ОБЪЕКТЕ':'ПЕРСОНАЖ'}</span><h3>${data.displayName}</h3></div><button class="selection-close" data-close-selection type="button" aria-label="Закрыть">×</button></div>
      <p><b>${data.job}${data.company?` · ${data.company}`:''}</b></p>
      <p><span class="person-label">НАСТРОЕНИЕ</span>${mood}</p>
      <p><span class="person-label">ДУМАЕТ</span>${thought}</p>
      <p><span class="person-label">ДЕЛАЕТ</span>${action}</p>${data.role==='player'?`<p><span class="person-label">УПРАВЛЕНИЕ</span>Кликните по полу — аватар пойдёт в указанную точку</p><p><span class="person-label">ЭФФЕКТ</span>В выбранной зоне темп работ +18%</p>`:''}`;
    return;
  }
  const task = state.tasks.find((item) => item.id === state.selectedTaskId);
  if (!task) {
    refs.selection.hidden = true;
    return;
  }
  const crew = state.crews.find((item) => item.id === task.crewId);
  refs.selection.hidden = false;
  refs.selection.style.setProperty('--task-color', task.color);
  refs.selection.innerHTML = `<div class="selection-top"><div><span class="eyebrow">${SKILL_LABELS[task.skill].toUpperCase()}</span><h3>${task.title}</h3></div><button class="selection-close" data-close-selection type="button" aria-label="Закрыть">×</button></div>
    <p>${crew ? `${crew.name} уже на месте. Осталось примерно ${Math.max(1, Math.ceil(task.duration * (1 - task.progress) / crew.speed))} ч.` : task.status === 'locked' ? 'Сначала завершите зависимые работы. Бетон не читает диаграмму Ганта, но всё равно требует последовательности.' : task.status === 'done' ? 'Работа закрыта. Фото приложены, замечания предусмотрительно не найдены.' : task.status==='skipped'?'Вы осознанно не стали это делать. Экономия уже случилась, последствия ещё выбирают время.':'Свободная подходящая бригада возьмёт эту работу автоматически.'}</p>
    <div class="selection-progress"><i style="width:${Math.round(task.progress * 100)}%"></i></div><button class="player-zone-button" data-player-zone="${task.id}" type="button">${state.playerZoneTaskId===task.id?'ВЫ УЖЕ ЗДЕСЬ · ТЕМП +18%':'ПРИЙТИ В ЭТУ ЗОНУ'}</button>`;
}

function renderHud() {
  ensureProjectFinance(state);
  const done = state.tasks.filter((task) => ['done','skipped'].includes(task.status)).length;
  const deadline=state.contract?.deadlineHours??DEADLINE_HOURS;
  const initialBudget=state.contract?.budget??INITIAL_BUDGET;
  const remaining = deadline - state.elapsed;
  const clock = formatClock(state.elapsed);
  const risk = getRisk(state);
  refs.budget.textContent = money(state.budget);
  refs.budgetDelta.textContent = `расходы ${money(state.finance?.spent??Math.max(0,initialBudget-state.budget))}`;
  refs.deadline.textContent = remaining >= 0 ? formatRemaining(remaining) : `просрочка ${Math.ceil(-remaining)} ч`;
  refs.deadlineStatus.textContent = remaining > 24 ? 'В графике' : remaining > 0 ? 'На грани' : 'Опоздание';
  refs.deadlineStatus.className = `status-pill ${remaining > 24 ? 'safe' : remaining > 0 ? 'warning' : 'critical'}`;
  refs.quality.textContent = `${Math.round(state.quality)} / 100`;
  refs.qualityBar.style.width = `${Math.max(0, Math.min(100, state.quality))}%`;
  refs.qualityBar.style.backgroundColor = state.quality >= (state.contract?.qualityTarget??78) ? 'var(--green)' : 'var(--blue)';
  refs.trust.textContent = `${Math.round(state.trust)}%`;
  refs.day.textContent = clock.day;
  refs.time.textContent = clock.time;
  refs.counter.textContent = `${done} / ${state.tasks.length}`;
  refs.progress.style.width = `${(done / state.tasks.length) * 100}%`;
  refs.risk.className = `risk ${risk.level}`;
  refs.risk.innerHTML = `<span>РИСК</span><strong>${risk.text}</strong>`;
  const active = state.tasks.filter((task) => task.status === 'active').length;
  const congestion=state.siteCongestion;const congestionText=congestion&&congestion.penalty<.995?` · теснота −${Math.round((1-congestion.penalty)*100)}%`:'';const dirtText=(state.siteDirt??0)>4?` · мусор ${Math.round(state.siteDirt)}%`:'';
  refs.siteStatus.textContent = state.paused ? `Пауза на объекте${congestionText}${dirtText}` : active ? `${active} работ в процессе${congestionText}${dirtText}` : `Люди ждут доступный фронт${congestionText}${dirtText}`;
  const magicButton=$('#magicResolveButton');const magicStatus=$('#magicResolveStatus');
  if(magicButton&&magicStatus){const lastAt=Number.isFinite(state.magicResolve?.lastAt)?state.magicResolve.lastAt:-1e9;const remaining=Math.max(0,48-(state.elapsed-lastAt));magicButton.disabled=!state.started||remaining>0;magicStatus.textContent=!state.started?'ПОСЛЕ СТАРТА':remaining>0?`ЧЕРЕЗ ${Math.ceil(remaining)} Ч`:'ГОТОВО';}
  $('#pauseButton').innerHTML = state.paused
    ? '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M7 5v14M17 5v14"/></svg>';
  document.querySelectorAll('[data-speed]').forEach((button) => button.classList.toggle('active', Number(button.dataset.speed) === state.speed));
  renderAmbientBeat();
  renderSituationInbox();
}

function renderSituationInbox(){
  if(!refs.situationInbox)return;
  const active=[...(state.activeSituations??[])].sort((a,b)=>a.expiresAt-b.expiresAt);
  const signature=active.map(item=>`${item.uid}:${item.delegated?1:0}:${Math.ceil(Math.max(0,item.expiresAt-state.elapsed)*6)}`).join('|');
  if(signature===renderedSituationSignature)return;renderedSituationSignature=signature;
  refs.situationCount.textContent=String(active.length);
  refs.situationInboxEmpty.hidden=active.length>0;
  refs.situationInbox.innerHTML=active.map(item=>{
    const template=situationById.get(item.templateId);const crew=state.crews.find(candidate=>candidate.id===item.crewId);
    const left=Math.max(0,item.expiresAt-state.elapsed);const resolver=state.team?.find(member=>member.id===template?.resolver&&member.hired);
    return `<button class="situation-inbox-item${item.delegated?' delegated':''}" data-open-situation="${item.uid}" type="button"><span class="situation-pulse">${item.delegated?'✓':'!'}</span><span><strong>${escapeHtml(template?.title??'Вопрос с площадки')}</strong><small>${escapeHtml(crew?.name??'Прораб')} · ${item.delegated?`${escapeHtml(resolver?.name??'Профильный специалист')} уже разбирается`:'ждут вашего решения'}</small></span><time>${formatRemaining(left)}</time></button>`;
  }).join('');
}

let renderedAmbientBeatId=null;
function renderAmbientBeat() {
  const chip=$('#siteBeat');
  const label=$('#siteBeatText');
  const beat=state.ambientBeat;
  if(!chip||!label)return;
  if(!beat){chip.hidden=true;renderedAmbientBeatId=null;return;}
  chip.hidden=false;
  chip.dataset.kind=beat.kind;
  label.textContent=beat.text;
  if(renderedAmbientBeatId===beat.id)return;
  renderedAmbientBeatId=beat.id;
  chip.classList.remove('fresh');
  requestAnimationFrame(()=>chip.classList.add('fresh'));
  if(audioContext&&audioEnabled)playSound(['delivery','drill','power-test'].includes(beat.kind)?'build':'message');
}

function renderTutorial() {
  document.querySelectorAll('.tutorial-highlight').forEach(element=>element.classList.remove('tutorial-highlight'));
  const coach=$('#tutorialCoach');const tutorial=state.tutorial;
  const tutorialSuppressed=[refs.auth,refs.menu,refs.orders,refs.result].some(modal=>modal?.classList.contains('visible'));
  if(!tutorial?.active||tutorial.completed||tutorialSuppressed){coach.hidden=true;coach.removeAttribute('data-placement');return;}
  const pm=state.team?.find(member=>member.id==='pm')?.hired;
  const movers=state.contractors?.find(item=>item.id==='movers')?.hired;
  const enabled=state.tasks.some(task=>task.enabledToday&&!['done','active'].includes(task.status));
  let step;
  if((state.contract?.cardsPlayed?.length??0)<2)step={n:1,title:'Договоритесь о треугольнике',text:'Сыграйте две карты. Вы меняете бюджет, срок и качество ещё до выхода на площадку.',target:'#contractDeck'};
  else if(state.phase==='negotiation')step={n:2,title:'Зафиксируйте договорённость',text:'Подпишите контракт. Аванс поступит на счёт объекта, остальное заказчик платит по закрытым этапам.',target:'#startMission'};
  else if(state.phase==='preparation'&&!pm)step={n:3,title:'Наймите руководителя проекта',text:'Без своей команды подрядчики выбирают удобные задачи. РП заставит их соблюдать ваши приоритеты.',target:'[data-team-hire="pm"]'};
  else if(state.phase==='preparation'&&!movers)step={n:4,title:'Дайте объекту руки',text:'Наймите перестановщиков. Они будут физически таскать материалы со склада в рабочую зону.',target:'[data-map-hire="movers"]'};
  else if(state.phase==='preparation')step={n:5,title:'Выходите на объект',text:'Для следующих дней понадобятся и другие специалисты, но начать можно с управляемой связки.',target:'#enterSite'};
  else if(state.phase==='schedule'&&!state.masterScheduleAccepted)step={n:6,title:'Примите общий график',text:'Задачи утренней планёрки берутся отсюда. Неверная последовательность создаёт настоящие переделки.',target:'#acceptSchedule'};
  else if(state.needsPlanning&&!enabled)step={n:7,title:'Соберите план дня',text:'Выберите работы из графика. Для первого дня возьмите обследование и освобождение зоны.',target:'#dayPlanList'};
  else if(state.needsPlanning)step={n:8,title:'Отправьте план бригадам',text:'После запуска смены вы управляете только связью, приоритетами и решениями.',target:'#startDay'};
  else if(!tutorial.observedBuild)step={n:9,title:'Посмотрите, как строят',text:'Камера показывает результат буквально: материалы несут, инженерия и стены монтируются, мусор исчезает.',target:'.site-stage'};
  else if(!tutorial.chatSent){const chatOpen=refs.communication.classList.contains('visible')&&$('#communicationWindow').classList.contains('is-whatsapp');step={n:10,title:'Вмешайтесь через чат',text:chatOpen?'Выберите работу и отправьте «сделать срочно». Это стоит денег и доверия, но меняет приоритет сразу.':'Откройте чат стройки и отправьте одно срочное сообщение. Время внутри чата остановлено.',target:chatOpen?'[data-send-urgent]':'#siteWhatsappButton'};}
  else step={n:11,title:'Первый урок почти закрыт',text:'Завершите хотя бы одну работу. После этого случайные события снова получат право происходить.',target:'#taskList'};
  $('#tutorialProgress').textContent=`ОБУЧЕНИЕ · ${step.n}/11`;$('#tutorialTitle').textContent=step.title;$('#tutorialText').textContent=step.text;
  const target=document.querySelector(step.target);
  const activeModal=[...document.querySelectorAll('.modal-backdrop.visible')].find(modal=>!modal.hidden);
  if(activeModal&&(!target||!activeModal.contains(target))){coach.hidden=true;coach.removeAttribute('data-placement');return;}
  coach.hidden=false;target?.classList.add('tutorial-highlight');
  if(window.matchMedia('(max-width: 640px)').matches&&target){
    const rect=target.getBoundingClientRect();
    coach.dataset.placement=rect.top+rect.height/2>window.innerHeight*.52?'top':'bottom';
  } else coach.removeAttribute('data-placement');
}

function renderAll() {
  syncAssignedStaffToActiveProject();
  unlockTasks(state);
  renderOrders();
  if(state.selectedOrder)renderNegotiation();
  renderHud();
  renderTasks();
  renderContractors();
  renderCrews();
  renderSelection();
  renderTutorial();
  syncSceneFromState();
}

// --- Three.js office -------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a2420');
scene.fog = new THREE.FogExp2('#1a2420', 0.025);
const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 100);
let cameraAngle = Math.PI / 4;
let cameraZoom = 1;
const cameraTarget = new THREE.Vector3(1.6, 0.3, 0);
const cameraFocus = new THREE.Vector3();

const renderer = new THREE.WebGLRenderer({ canvas: refs.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

scene.add(new THREE.HemisphereLight('#dfffe5', '#20241d', 2.0));
const sun = new THREE.DirectionalLight('#fff6dc', 3.2);
sun.position.set(5, 10, 7);
sun.castShadow = true;
const shadowSize=window.matchMedia('(max-width: 640px)').matches?1024:2048;
sun.shadow.mapSize.set(shadowSize, shadowSize);
sun.shadow.camera.left = -10; sun.shadow.camera.right = 10; sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
scene.add(sun);
const fill = new THREE.PointLight('#9cc7ff', 8, 18);
fill.position.set(-5, 5, -3);
scene.add(fill);

const office = new THREE.Group();
scene.add(office);
const markerMeshes = new Map();
const crewMeshes = new Map();
function clearCrewMeshes(){for(const mesh of crewMeshes.values())office.remove(mesh);crewMeshes.clear();selectedPerson=null;}
const sceneProps = {};
sceneProps.workLight=new THREE.PointLight('#ffd07a',0,4.8);
sceneProps.workLight.castShadow=false;
office.add(sceneProps.workLight);
const morningSky=new THREE.Color('#1a2420');
const eveningSky=new THREE.Color('#17201f');
const morningSun=new THREE.Color('#fff6dc');
const eveningSun=new THREE.Color('#ffc883');
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const unit = 1.15;
const gx = (x) => (x - 4) * unit;
const gz = (y) => (y - 3.4) * unit;
const footprintScale=()=>Math.max(.68,Math.min(1.65,Math.sqrt((state.selectedOrder?.area??600)/600)));
const siteX=(x)=>gx(x)*footprintScale();
const siteZ=(y)=>gz(y)*footprintScale();
const CREW_STAGING_POINTS={
  moving:[6.7,5.35],demolition:[2.4,4.7],construction:[3.5,4.8],engineering:[6.2,3.6],paint:[1.35,4.75],electric:[6.7,1.25],furniture:[4.85,4.75],cleaning:[7.15,4.05],
  design:[2.05,1.55],documentation:[5.65,1.35],general:[3.25,5.2],support:[7.2,5.2],management:[4.25,5.55],
};

function crewStagingPoint(crew,crewIndex=0) {
  if(crew.id==='foreman'||crew.taskId)return new THREE.Vector3(siteX(crew.x),.03,siteZ(crew.y));
  const key=crew.supportRole?'support':crew.skill;
  const [x,y]=CREW_STAGING_POINTS[key]??CREW_STAGING_POINTS.general;
  const hash=[...crew.id].reduce((sum,char)=>sum+char.charCodeAt(0),crewIndex*17);
  const angle=(hash%12)/12*Math.PI*2;
  const radius=.18+(hash%3)*.12;
  return new THREE.Vector3(siteX(x)+Math.cos(angle)*radius,.03,siteZ(y)+Math.sin(angle)*radius);
}

function crewDiscipline(crew){
  if(crew.id==='foreman')return 1;
  return THREE.MathUtils.clamp(.3+((crew.quality??.78)-.65)*1.2+((crew.level??1)-1)*.11+(crew.id.startsWith('team-') ? .08 : 0),.32,.98);
}

function crewWorkPoint(crew,crewIndex=0){
  const task=state.tasks.find(item=>item.id===crew.taskId);if(!task)return crewStagingPoint(crew,crewIndex);
  const hash=[...crew.id].reduce((sum,char)=>sum+char.charCodeAt(0),crewIndex*13);const angle=(hash%16)/16*Math.PI*2;const radius=.26+(hash%4)*.06;
  return new THREE.Vector3(siteX(task.x)+Math.cos(angle)*radius,.03,siteZ(task.y)+Math.sin(angle)*radius);
}

function crewSmokePoint(crew,crewIndex=0){
  const shift=(footprintScale()-1)*5.2;const slot=crewIndex%6;
  return new THREE.Vector3(6.02+shift+(slot%3)*.48,.03,-2.62+Math.floor(slot/3)*.42);
}

function crewCleaningPoint(crew,crewIndex=0){
  const hash=[...crew.id].reduce((sum,char)=>sum+char.charCodeAt(0),crewIndex*19);const slot=hash%6;
  return new THREE.Vector3(siteX(2.2+(slot%3)*1.75),.03,siteZ(2.1+Math.floor(slot/3)*2.1));
}

function crewTakesBreak(crew,t){
  if(crew.id==='foreman')return false;
  const discipline=crewDiscipline(crew);const hash=[...crew.id].reduce((sum,char)=>sum+char.charCodeAt(0),0);const cycle=20+discipline*22;const phase=(t+(hash%17)*1.7)%cycle;const duration=(1-discipline)*(crew.taskId?4.2:8.5);
  return state.smokeBreak||phase<duration;
}

function routedCrewWaypoint(mesh,finalTarget,routeKey,crew,smoking=false){
  if(mesh.userData.routeKey!==routeKey){
    const hash=[...crew.id].reduce((sum,char)=>sum+char.charCodeAt(0),0);const lane=((hash%5)-2)*.11;const points=[];const distance=mesh.position.distanceTo(finalTarget);
    if(distance>1.25){
      const entry=new THREE.Vector3(siteX(7.45)+lane,.03,siteZ(5.55));const corridor=new THREE.Vector3(siteX(4.15)+lane,.03,siteZ(4.15));
      if(smoking){points.push(entry);}else if(mesh.position.z>corridor.z+.55||finalTarget.z>corridor.z+.55){points.push(corridor);}
    }
    points.push(finalTarget.clone());mesh.userData.routeKey=routeKey;mesh.userData.routePoints=points;mesh.userData.routeIndex=0;
  }
  const points=mesh.userData.routePoints??[finalTarget];let waypoint=points[Math.min(mesh.userData.routeIndex??0,points.length-1)];
  if(mesh.position.distanceTo(waypoint)<.16&&(mesh.userData.routeIndex??0)<points.length-1){mesh.userData.routeIndex+=1;waypoint=points[mesh.userData.routeIndex];}
  return waypoint;
}

function crewSeparation(mesh){
  const force=new THREE.Vector3();
  for(const other of crewMeshes.values()){
    if(other===mesh||!other.visible)continue;const delta=mesh.position.clone().sub(other.position);delta.y=0;const distance=delta.length();
    if(distance>.03&&distance<.72)force.add(delta.normalize().multiplyScalar((.72-distance)/.72));
  }
  return force;
}

function mat(color, roughness = .72, metalness = .04) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(name, size, pos, material, parent = office, cast = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// The organization headquarters is the main menu itself: a small, persistent
// Three.js diorama that changes with the notoriously unreliable HQ upgrades.
const hqScene=new THREE.Scene();hqScene.background=new THREE.Color('#16211b');
const hqCamera=new THREE.OrthographicCamera(-4.8,4.8,3.7,-3.7,.1,40);hqCamera.position.set(7.2,7.4,7.2);hqCamera.lookAt(0,.45,0);
const hqRenderer=new THREE.WebGLRenderer({canvas:refs.hqCanvas,antialias:true,alpha:false,powerPreference:'low-power'});hqRenderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));hqRenderer.outputColorSpace=THREE.SRGBColorSpace;hqRenderer.toneMapping=THREE.ACESFilmicToneMapping;hqRenderer.toneMappingExposure=1.08;hqRenderer.shadowMap.enabled=true;hqRenderer.shadowMap.type=THREE.PCFShadowMap;
hqScene.add(new THREE.HemisphereLight('#e6ffe5','#273029',2.25));const hqSun=new THREE.DirectionalLight('#fff0c8',3.1);hqSun.position.set(4.5,8,5.5);hqSun.castShadow=true;hqSun.shadow.mapSize.set(768,768);hqSun.shadow.camera.left=-6;hqSun.shadow.camera.right=6;hqSun.shadow.camera.top=6;hqSun.shadow.camera.bottom=-6;hqScene.add(hqSun);
const hqRoot=new THREE.Group();hqScene.add(hqRoot);let hqPreviewKey='';let hqPreviewPeople=[];let hqPreviewScreens=[];

function hqMat(color,roughness=.72,metalness=.04){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
function hqBox(name,size,pos,material,parent=hqRoot,cast=true){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),material);mesh.name=name;mesh.position.set(...pos);mesh.castShadow=cast;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function hqDesk(x,z,rotation=0){const group=new THREE.Group();group.position.set(x,0,z);group.rotation.y=rotation;hqRoot.add(group);hqBox('hq-desk-top',[1.35,.1,.66],[0,.69,0],hqMat('#98704e'),group);hqBox('hq-desk-leg',[.08,.65,.5],[-.5,.34,0],hqMat('#303b36',.42,.28),group);hqBox('hq-desk-leg',[.08,.65,.5],[.5,.34,0],hqMat('#303b36',.42,.28),group);const screen=hqBox('hq-screen',[.48,.34,.04],[0,.97,.06],new THREE.MeshStandardMaterial({color:'#182b26',emissive:'#6ed6b1',emissiveIntensity:.25,roughness:.28}),group);hqPreviewScreens.push(screen);return group;}
function hqPerson(x,z,color,index){
  const avatar=state.playerAvatar??{};const isPlayer=index===0;color=isPlayer?(avatar.color??color):color;
  const group=new THREE.Group();group.position.set(x,.02,z);
  const leftLeg=new THREE.Mesh(new THREE.CapsuleGeometry(.065,.3,4,8),hqMat('#303a36'));leftLeg.position.set(-.09,.27,0);group.add(leftLeg);
  const rightLeg=leftLeg.clone();rightLeg.position.x=.09;group.add(rightLeg);
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.17,.25,5,10),hqMat(color,.58));torso.position.y=.72;group.add(torso);
  const leftArm=new THREE.Mesh(new THREE.CapsuleGeometry(.045,.28,4,8),hqMat(isPlayer&&avatar.outfit==='suit'?color:'#d7a37c'));leftArm.position.set(-.22,.68,0);leftArm.rotation.z=-.12;group.add(leftArm);
  const rightArm=leftArm.clone();rightArm.position.x=.22;rightArm.rotation.z=.12;group.add(rightArm);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.14,14,10),hqMat('#d7a37c'));head.position.y=1.08;group.add(head);
  const hair=new THREE.Mesh(new THREE.SphereGeometry(.145,12,7,0,Math.PI*2,0,Math.PI/2),hqMat(index%2?'#3c302b':'#6a5548'));hair.position.y=1.145;group.add(hair);
  const legacyVisuals=group.children.slice();let playerAura=null;
  if(isPlayer){playerAura=new THREE.Mesh(new THREE.RingGeometry(.38,.5,28),new THREE.MeshBasicMaterial({color:'#ddff55',transparent:true,opacity:.9,side:THREE.DoubleSide}));playerAura.rotation.x=-Math.PI/2;playerAura.position.y=.015;group.add(playerAura);}
  group.scale.setScalar(isPlayer?.78:.68);group.userData={baseX:x,baseZ:z,leftLeg,rightLeg,leftArm,rightArm,index,playerAura};hqRoot.add(group);hqPreviewPeople.push(group);
  const role=isPlayer?'player':index%3===1?'worker':index%3===2?'client':'architect';const profile=createPersonProfile(role,(state.visualSeed??1)+index*19,index);
  requestRiggedCharacter(group,{role,color,profile,avatar:isPlayer?avatar:null,variant:index},legacyVisuals);
  return group;
}
function hqPlant(x,z){const group=new THREE.Group();group.position.set(x,0,z);hqRoot.add(group);const pot=new THREE.Mesh(new THREE.CylinderGeometry(.2,.16,.34,12),hqMat('#c87552'));pot.position.y=.17;group.add(pot);for(let i=0;i<6;i++){const leaf=new THREE.Mesh(new THREE.SphereGeometry(.17,8,6),hqMat(i%2?'#69a977':'#82bd82'));leaf.scale.set(.5,1.55,.4);leaf.rotation.z=(i-2.5)*.3;leaf.position.set(Math.sin(i)*.12,.58+(i%2)*.1,Math.cos(i)*.12);group.add(leaf);}}
function rebuildHqPreview(){const hq=state.hq??{level:0,attempts:0};const avatar=state.playerAvatar??{};const freeStaff=(state.staff?.employees??[]).filter(employee=>employee.status==='employed'&&!employee.assignedProjectId&&(employee.unavailableUntilDay??0)<=(state.companyCalendar?.day??0));const key=`${hq.level}:${hq.attempts}:${avatar.color}:${avatar.outfit}:${avatar.helmet}:${freeStaff.map(employee=>employee.id).join(',')}`;if(key===hqPreviewKey)return;hqPreviewKey=key;hqRoot.traverse(node=>{if(node.isMesh){if(!node.userData.riggedAsset)node.geometry?.dispose();if(Array.isArray(node.material))node.material.forEach(item=>item.dispose());else node.material?.dispose();}});hqRoot.clear();hqPreviewPeople=[];hqPreviewScreens=[];const level=hq.level??0;
  hqBox('hq-slab',[6.4,.22,4.7],[0,-.13,0],hqMat(level>=3?'#c9c3b4':'#8d8b7d'),hqRoot,false);hqBox('hq-back-wall',[6.4,2.1,.12],[0,1.02,-2.3],hqMat(level>=3?'#e5e0d3':'#c8c4b6'));hqBox('hq-left-wall',[.12,2.1,4.7],[-3.15,1.02,0],hqMat(level>=2?'#ded9cc':'#bdbbad'));
  hqDesk(-.75,.35);hqBox('hq-printer',[.58,.48,.52],[-2.35,.28,-1.35],hqMat('#d9ded9',.35,.16));hqBox('hq-paper',[.34,.03,.42],[-2.35,.55,-1.34],hqMat('#f3f0e7'),hqRoot,false);
  if(level===0){hqBox('hq-folding-chair',[.48,.08,.46],[-.7,.39,1.12],hqMat('#65716a'));for(let i=0;i<4;i++)hqBox('hq-failure-box',[.55,.35,.48],[1.45+(i%2)*.62,.18,-.9+Math.floor(i/2)*.55],hqMat(i%2?'#b57b45':'#c98c50'));}
  if(level>=1){hqBox('hq-partition',[.1,1.65,2.0],[1.55,.82,-1.25],hqMat('#d7d2c6'));hqBox('hq-cabinet',[.72,1.35,.5],[2.45,.67,-1.85],hqMat('#65756d'));}
  if(level>=2){hqPlant(2.45,1.45);hqBox('hq-meeting-table',[1.8,.12,.9],[1.35,.65,.9],hqMat('#9a704d'));for(const x of [.7,1.35,2])hqBox('hq-chair',[.38,.55,.38],[x,.3,1.55],hqMat('#496d61'));}
  if(level>=3){hqDesk(-2.05,.55,Math.PI);hqDesk(-.65,-1.25,Math.PI);hqBox('hq-sofa',[1.65,.48,.72],[1.65,.34,-1.2],hqMat('#d87561'));hqBox('hq-rug',[2.0,.025,1.35],[1.5,.02,.1],hqMat('#527369'),hqRoot,false);}
  if(level>=4){const glass=new THREE.MeshPhysicalMaterial({color:'#91cfd0',transparent:true,opacity:.32,roughness:.1,transmission:.2});hqBox('hq-glass',[2.6,1.8,.04],[1.45,.9,-.35],glass);hqBox('hq-sign',[1.35,.45,.06],[-1.65,1.45,-2.21],new THREE.MeshStandardMaterial({color:'#ddff55',emissive:'#8fa82e',emissiveIntensity:.45}));}
  const visibleStaff=freeStaff.slice(0,4);hqPerson(-1.6,1.25,avatar.color??'#ddff55',0);visibleStaff.forEach((employee,index)=>hqPerson(-.88+index*.72,1.25-((index+1)%2)*.6,employee.color,index+1));
}
function renderHqPreview(now){
  if(!refs.menu.classList.contains('visible'))return;rebuildHqPreview();
  const stage=refs.hqCanvas.parentElement;const width=Math.floor(stage.clientWidth),height=Math.floor(stage.clientHeight);if(!width||!height)return;
  hqRenderer.setSize(width,height,false);const aspect=width/height;hqCamera.left=-4.2*aspect;hqCamera.right=4.2*aspect;hqCamera.top=4.2;hqCamera.bottom=-4.2;hqCamera.updateProjectionMatrix();
  const t=now*.001;const characterDelta=Math.min(.05,Math.max(0,(now-lastHqCharacterFrame)/1000));lastHqCharacterFrame=now;
  hqPreviewPeople.forEach((person,index)=>{const u=person.userData;u.characterMixer?.update(characterDelta);setPersonMotion(person,'walk');const phase=t*(.55+index*.08)+index*1.7;person.position.x=u.baseX+Math.sin(phase)*(.18+index*.035);person.position.z=u.baseZ+Math.cos(phase*.82)*.16;person.rotation.y=Math.atan2(Math.cos(phase),-Math.sin(phase*.82));const swing=Math.sin(t*7.2+index)*.38;u.leftLeg.rotation.x=swing;u.rightLeg.rotation.x=-swing;u.leftArm.rotation.x=-swing*.7;u.rightArm.rotation.x=swing*.7;if(u.playerAura){const pulse=1+Math.sin(t*3.2)*.08;u.playerAura.scale.setScalar(pulse);}});
  hqPreviewScreens.forEach((screen,index)=>{screen.material.emissiveIntensity=.28+Math.abs(Math.sin(t*1.8+index))*.55;});hqRenderer.render(hqScene,hqCamera);
}

function makeDesk(x, z, rotation = 0) {
  const group = new THREE.Group();
  group.name='desk-asset';
  group.position.set(x, .02, z);
  group.rotation.y = rotation;
  const top = box('desk-top', [1.25,.09,.56], [0,.66,0], mat('#b88a5b'), group);
  box('desk-leg', [.07,.63,.45], [-.49,.32,0], mat('#2d3732',.45,.2), group);
  box('desk-leg', [.07,.63,.45], [.49,.32,0], mat('#2d3732',.45,.2), group);
  box('screen', [.43,.31,.035], [0,.92,.04], mat('#172420',.3,.15), group);
  box('stand', [.05,.18,.05], [0,.75,.02], mat('#4e5a54',.35,.3), group);
  office.add(group);
  return group;
}

function makeChair(x, z, rotation = 0) {
  const group = new THREE.Group();
  group.name='chair-asset';
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  box('chair-seat',[.42,.08,.42],[0,.42,0],mat('#496d61'),group);
  box('chair-back',[.42,.48,.08],[0,.67,.18],mat('#496d61'),group);
  box('chair-post',[.06,.4,.06],[0,.2,0],mat('#27312d'),group);
  office.add(group);
  return group;
}

function makePlant(x, z, scale = 1) {
  const group = new THREE.Group();
  group.name='plant-asset';
  group.position.set(x, 0, z);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(.2*scale,.16*scale,.32*scale,12), mat('#c27551'));
  pot.position.y=.16*scale; pot.castShadow=true; group.add(pot);
  for (let i=0;i<7;i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.17*scale,8,6), mat(i%2?'#5f9a6e':'#76b47e'));
    leaf.scale.set(.55,1.7,.45); leaf.rotation.z=(i-3)*.28; leaf.position.set(Math.sin(i)*.13*scale,.55*scale+(i%2)*.12*scale,Math.cos(i)*.13*scale); leaf.castShadow=true; group.add(leaf);
  }
  office.add(group);
  return group;
}

function makeSofa(x,z,rotation=0) {
  const group = new THREE.Group(); group.name='sofa-asset'; group.position.set(x,0,z); group.rotation.y=rotation;
  box('sofa-base',[1.5,.35,.62],[0,.31,0],mat('#d57a64'),group);
  box('sofa-back',[1.5,.58,.18],[0,.62,.24],mat('#c96e59'),group);
  box('sofa-arm',[.18,.5,.64],[-.7,.43,0],mat('#c96e59'),group);
  box('sofa-arm',[.18,.5,.64],[.7,.43,0],mat('#c96e59'),group); office.add(group); return group;
}

function makeToilet(x,z,rotation=0) {
  const group=new THREE.Group();group.name='toilet-asset';group.position.set(x,0,z);group.rotation.y=rotation;
  const bowl=new THREE.Mesh(new THREE.CylinderGeometry(.18,.14,.26,16),mat('#eef1ec',.32));bowl.scale.z=1.3;bowl.position.set(0,.2,0);bowl.castShadow=true;group.add(bowl);
  box('toilet-cistern',[.34,.42,.16],[0,.39,-.17],mat('#eef1ec',.32),group);
  office.add(group);return group;
}

function makeSink(x,z) {
  const group=new THREE.Group();group.name='sink-asset';group.position.set(x,0,z);
  box('sink',[.52,.12,.34],[0,.62,0],mat('#eef1ec',.28),group);
  box('sink-leg',[.12,.55,.12],[0,.3,0],mat('#d8ded9'),group);
  const tap=new THREE.Mesh(new THREE.TorusGeometry(.09,.018,8,14,Math.PI),mat('#87928d',.25,.5));tap.rotation.x=Math.PI/2;tap.position.set(0,.76,-.04);group.add(tap);
  office.add(group);return group;
}

function addVehicleWheel(vehicle,x,z,radius=.255) {
  const axle=new THREE.Group();axle.position.set(x,radius,z);vehicle.add(axle);
  const tire=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,.18,22),mat('#111514',.62,.08));tire.rotation.z=Math.PI/2;tire.castShadow=true;axle.add(tire);
  const rim=new THREE.Mesh(new THREE.CylinderGeometry(radius*.48,radius*.48,.188,18),mat('#9da7a2',.3,.72));rim.rotation.z=Math.PI/2;axle.add(rim);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(radius*.16,radius*.16,.195,14),mat('#303a36',.3,.58));hub.rotation.z=Math.PI/2;axle.add(hub);
  vehicle.userData.wheels.push(axle);return axle;
}

function makeTruck() {
  const truck=new THREE.Group();truck.name='delivery-truck';truck.userData={wheels:[],vehicle:true};
  box('truck-chassis',[1.42,.16,3.42],[0,.36,.22],mat('#252e2b',.42,.55),truck);
  box('truck-cargo',[1.48,1.18,1.96],[0,1.03,-.45],mat('#e5e8e2',.48,.08),truck);
  box('truck-cargo-roof',[1.54,.09,2.03],[0,1.66,-.45],mat('#cdd4cf',.38,.18),truck);
  box('truck-side-panel',[.025,.52,1.35],[-.752,1.07,-.42],mat('#d6e644',.46,.04),truck);
  box('truck-side-stripe',[.028,.12,1.65],[-.77,.82,-.42],mat('#28342f',.5,.16),truck);
  box('truck-rear-door',[1.22,.9,.035],[0,1.05,-1.45],mat('#d5dad5',.52,.12),truck);
  box('truck-rear-split',[.035,.88,.04],[0,1.05,-1.475],mat('#65716c',.45,.3),truck);
  box('truck-cab',[1.42,.95,.96],[0,.84,1.02],mat('#dc755f',.42,.12),truck);
  box('truck-cab-roof',[1.48,.1,.94],[0,1.37,1.0],mat('#bc5949',.38,.16),truck);
  box('truck-windshield',[1.08,.4,.035],[0,1.04,1.515],mat('#4d7e8c',.12,.42),truck);
  for(const x of [-.718,.718]) {
    box('truck-side-window',[.025,.35,.48],[x,1.05,1.06],mat('#4f7d88',.14,.38),truck);
    box('truck-mirror',[.07,.17,.13],[x*1.12,1.12,1.42],mat('#202927',.38,.48),truck);
  }
  box('truck-grille',[.75,.26,.04],[0,.66,1.515],mat('#29332f',.38,.66),truck);
  box('truck-bumper',[1.5,.14,.18],[0,.37,1.52],mat('#b7c0bb',.3,.7),truck);
  for(const x of [-.47,.47]) {
    box('truck-headlight',[.22,.16,.045],[x,.72,1.54],new THREE.MeshStandardMaterial({color:'#fff0b2',emissive:'#ffd45c',emissiveIntensity:.9,roughness:.25}),truck);
  }
  addVehicleWheel(truck,-.72,-.92,.29);addVehicleWheel(truck,.72,-.92,.29);addVehicleWheel(truck,-.72,.96,.29);addVehicleWheel(truck,.72,.96,.29);
  truck.scale.set(.82,.82,.82);return truck;
}

function makeServiceVan() {
  const van=new THREE.Group();van.name='service-van';van.userData={wheels:[],vehicle:true};
  box('van-chassis',[1.2,.14,2.38],[0,.31,0],mat('#222b28',.45,.5),van);
  box('van-body',[1.18,.72,1.68],[0,.74,-.16],mat('#f0eee5',.4,.06),van);
  box('van-cab',[1.18,.65,.76],[0,.68,.9],mat('#69bfe8',.38,.12),van);
  box('van-roof',[1.2,.1,1.9],[0,1.14,.03],mat('#d9e1df',.35,.12),van);
  box('van-windshield',[.88,.29,.035],[0,.88,1.295],mat('#426b78',.1,.42),van);
  for(const x of [-.598,.598]) box('van-side-window',[.025,.27,.48],[x,.88,.83],mat('#426b78',.12,.38),van);
  box('van-side-mark',[.028,.24,.76],[-.61,.72,-.27],mat('#25332e',.48,.12),van);
  box('van-bumper-front',[1.26,.12,.13],[0,.33,1.3],mat('#353f3b',.44,.42),van);
  box('van-bumper-rear',[1.26,.12,.13],[0,.33,-1.19],mat('#353f3b',.44,.42),van);
  for(const x of [-.4,.4])box('van-headlight',[.18,.12,.04],[x,.58,1.32],new THREE.MeshStandardMaterial({color:'#fff1ad',emissive:'#ffd45c',emissiveIntensity:.65}),van);
  addVehicleWheel(van,-.6,-.72,.235);addVehicleWheel(van,.6,-.72,.235);addVehicleWheel(van,-.6,.78,.235);addVehicleWheel(van,.6,.78,.235);
  van.scale.set(.76,.76,.76);return van;
}

function makeOffice() {
  // Base slab and floor tiles.
  box('slab',[11.4,.25,8.8],[0,-.16,0],mat('#2a332f'),office,false);
  sceneProps.floorTiles = [];
  for (let x=0;x<9;x++) for(let y=0;y<7;y++) {
    const tile = box('floor-tile',[unit-.025,.05,unit-.025],[gx(x),0,gz(y)],mat((x+y)%2?'#d3cdbc':'#cbc4b2'),office,false);
    tile.receiveShadow=true; tile.userData.baseColor=(x+y)%2?'#d3cdbc':'#cbc4b2'; sceneProps.floorTiles.push(tile);
  }
  // Exterior walls, kept low for readable dollhouse view.
  box('north-wall',[10.35,1.55,.13],[0,.78,gz(0)-.55],mat('#e8e3d5'));
  box('west-wall',[.13,1.55,8.05],[gx(0)-.55,.78,0],mat('#e1ddcf'));
  // Window panels.
  for (let i=0;i<5;i++) {
    const windowMat = new THREE.MeshPhysicalMaterial({ color:'#84b7b8',transparent:true,opacity:.34,roughness:.15,transmission:.25 });
    box('window',[1.35,.82,.035],[-3.55+i*1.75,1.0,gz(0)-.62],windowMat);
  }
  // Meeting room glass.
  const glass = new THREE.MeshPhysicalMaterial({ color:'#a5dbe0',transparent:true,opacity:.24,roughness:.1,metalness:.05,side:THREE.DoubleSide });
  box('glass-wall',[3.2,1.45,.045],[-2.65,.74,-.75],glass);
  box('glass-wall',[.045,1.45,2.55],[-1.05,.74,-2.0],glass);
  box('meeting-table',[2.15,.12,.95],[-2.65,.67,-2.02],mat('#875f42'));
  for(let i=0;i<4;i++) makeChair(-3.35+i*.48,-2.7,Math.PI);
  for(let i=0;i<3;i++) makeChair(-3.15+i*.5,-1.35,0);
  // Service core: toilets, wash basins and a small janitor/print room off circulation.
  const coreWall=mat('#d8d5c9');
  box('core-left',[.11,1.42,2.35],[2.28,.72,-2.75],coreWall);
  box('core-divider',[.1,1.42,2.35],[3.46,.72,-2.75],coreWall);
  box('core-front-a',[.72,1.42,.11],[2.65,.72,-1.62],coreWall);
  box('core-front-b',[.55,1.42,.11],[3.82,.72,-1.62],coreWall);
  box('core-front-c',[.35,1.42,.11],[4.45,.72,-1.62],coreWall);
  makeToilet(2.82,-3.18,Math.PI);makeToilet(4.05,-3.18,Math.PI);
  makeSink(2.82,-2.08);makeSink(4.05,-2.08);
  box('toilet-sign-a',[.16,.16,.025],[3.12,1.13,-1.54],mat('#69bfe8'));
  box('toilet-sign-b',[.16,.16,.025],[4.28,1.13,-1.54],mat('#d87561'));
  // Pantry / social hub sits at a natural crossroads between meeting and open work.
  box('pantry-counter',[1.75,.82,.48],[.75,.41,-3.2],mat('#72857b'));
  box('pantry-top',[1.82,.07,.54],[.75,.84,-3.2],mat('#d3c8ae'));
  const coffee=new THREE.Mesh(new THREE.CylinderGeometry(.13,.15,.31,12),mat('#252d29',.35,.18));coffee.position.set(.32,1.03,-3.18);office.add(coffee);
  box('fridge',[.55,1.25,.52],[1.65,.63,-3.18],mat('#dce0db',.33,.22));
  box('high-table',[.82,.08,.55],[.35,.76,-2.23],mat('#9b704b'));
  // Printer and storage support the team neighborhood.
  box('storage',[.58,1.2,.72],[-4.18,.6,.35],mat('#718078'));
  box('printer',[.55,.42,.5],[-4.18,.92,1.18],mat('#d9dfdc',.36,.15));
  // Open space desks.
  sceneProps.desks = [];
  for(let row=0;row<3;row++) for(let col=0;col<4;col++) {
    const desk=makeDesk(-.55+col*1.35,.25+row*1.12,row%2?Math.PI:0); desk.visible=false; sceneProps.desks.push(desk);
  }
  // Lounge / reception.
  sceneProps.sofa=makeSofa(-3.35,2.48,0);
  sceneProps.plants=[makePlant(1.95,-2.85,.9),makePlant(-4.35,3.0,.9)];
  box('reception',[1.45,.88,.55],[3.15,.44,3.1],mat('#688277'));
  // Entrance sequence with mat, glass leaf and access-control pedestal.
  box('entry-mat',[1.2,.025,.75],[4.22,.035,3.35],mat('#3c5149',.88),office,false);
  const doorGlass=new THREE.MeshPhysicalMaterial({color:'#9dd2d0',transparent:true,opacity:.36,roughness:.12,transmission:.3});
  sceneProps.entryDoor=box('entry-door',[.06,1.45,1.05],[4.72,.73,2.86],doorGlass);
  sceneProps.entryDoor.geometry.translate(0,0,-.52);
  box('access-control',[.18,.9,.22],[4.25,.45,2.55],mat('#26342e',.4,.2));

  // Exterior service yard: smoking shelter, temporary storage and delivery lane.
  sceneProps.yard=new THREE.Group();office.add(sceneProps.yard);
  box('yard-slab',[4.6,.12,8.7],[7.9,-.18,0],mat('#58605b',.96),sceneProps.yard,false);
  for(let z=-3.7;z<=3.7;z+=1.2) box('yard-mark',[1.1,.016,.055],[8.95,.0,z],mat('#d9c460'),sceneProps.yard,false);
  box('yard-fence',[.08,1.05,3.1],[10.15,.48,-2.75],mat('#3c4641',.38,.4),sceneProps.yard);
  box('yard-fence',[.08,1.05,2.3],[10.15,.48,3.15],mat('#3c4641',.38,.4),sceneProps.yard);
  // Smoking shelter — the unofficial R&D department.
  box('smoke-back',[2.05,1.55,.06],[6.65,.78,-3.45],mat('#5f7470'),sceneProps.yard);
  box('smoke-roof',[2.25,.08,1.15],[6.65,1.58,-2.98],mat('#33433d',.45,.2),sceneProps.yard);
  box('smoke-bench',[1.45,.12,.35],[6.65,.42,-3.25],mat('#9b704b'),sceneProps.yard);
  box('smoke-sign',[.85,.32,.025],[6.65,1.16,-3.40],mat('#e8e4d8'),sceneProps.yard);
  const ashtray=new THREE.Mesh(new THREE.CylinderGeometry(.11,.16,.62,12),mat('#3f4b46',.3,.35));ashtray.position.set(7.55,.31,-2.95);sceneProps.yard.add(ashtray);
  // Temporary warehouse / dump where every object is "needed tomorrow".
  box('storage-roof',[2.5,.09,2.4],[6.85,1.66,1.72],mat('#46534e',.45,.25),sceneProps.yard);
  box('storage-back',[2.35,1.55,.08],[6.85,.79,2.85],mat('#66706b'),sceneProps.yard);
  for(let i=0;i<5;i++) box('yard-pallet',[.75,.16,.58],[6.05+(i%2)*.84,.09+i*.11,1.0+Math.floor(i/2)*.62],mat('#9b704b'),sceneProps.yard);
  for(let i=0;i<4;i++) box('yard-scrap',[.4+i*.09,.08,.28],[7.65+(i%2)*.4,.12,1.0+Math.floor(i/2)*.62],mat(i%2?'#8e5e45':'#828d88'),sceneProps.yard);
  sceneProps.truck=makeTruck();sceneProps.truck.position.set(8.95,.01,4.8);sceneProps.yard.add(sceneProps.truck);
  sceneProps.serviceVan=makeServiceVan();sceneProps.serviceVan.position.set(7.55,.01,-1.1);sceneProps.serviceVan.rotation.y=Math.PI;sceneProps.yard.add(sceneProps.serviceVan);
  sceneProps.smokers=[];
  for(let i=0;i<3;i++) {
    const smoker=makePerson({role:'worker',color:['#e9ad52','#69bfe8','#9d85d8'][i],skin:['#d6a47d','#b97855','#edc39d'][i],variant:i});
    smoker.userData.isSmoker=true;smoker.userData.displayName=['Рустам','Денис','Женя'][i];smoker.userData.job=['Перестановщик','Электрик','Сборщик мебели'][i];
    smoker.position.set(6.1+i*.52,.02,-2.7+(i%2)*.18);smoker.rotation.y=2.5-i*.4;smoker.visible=false;sceneProps.yard.add(smoker);sceneProps.smokers.push(smoker);
  }
  sceneProps.smokePuffs=[];
  for(let i=0;i<6;i++) {
    const puff=new THREE.Mesh(new THREE.SphereGeometry(.055+i*.012,8,6),new THREE.MeshBasicMaterial({color:'#c9d0cb',transparent:true,opacity:.28,depthWrite:false}));
    puff.position.set(6.2+(i%3)*.48,.95+(i%2)*.25,-2.63);puff.visible=false;sceneProps.yard.add(puff);sceneProps.smokePuffs.push(puff);
  }
  // Crates that disappear after movers finish.
  sceneProps.crates = new THREE.Group(); office.add(sceneProps.crates);
  [[-.1,.4],[1.1,1.1],[2.2,.35],[-.7,2.0],[1.7,2.2]].forEach(([x,z],i)=> {
    const crate=box('crate',[.55,.45+(i%2)*.2,.55],[x,.23+(i%2)*.1,z],mat(i%2?'#b27a44':'#c68d50'),sceneProps.crates);
    crate.rotation.y=(i*.37);
  });
  // What the client calls "the existing office": mismatched furniture and
  // partitions that must physically leave before the new fit-out can appear.
  sceneProps.legacyInterior=new THREE.Group();sceneProps.legacyInterior.name='legacy-interior';office.add(sceneProps.legacyInterior);
  [[-2.8,.35,'#786d62'],[-1.25,.55,'#67766f'],[.35,.3,'#8a6c57'],[1.8,.65,'#666f77'],[-1.75,2.1,'#75695f'],[.45,2.25,'#596d66']].forEach(([x,z,color],index)=>{
    const oldDesk=makeDesk(x,z,index%2?Math.PI:.06);oldDesk.name='legacy-desk';office.remove(oldDesk);sceneProps.legacyInterior.add(oldDesk);
    oldDesk.traverse(node=>{if(node.isMesh&&node.name==='desk-top')node.material=mat(color,.82);});
  });
  const oldCabinet=box('legacy-cabinet',[1.05,1.25,.42],[2.85,.63,1.35],mat('#7b766d',.88),sceneProps.legacyInterior);oldCabinet.rotation.y=.08;
  const oldPartitionA=box('legacy-partition',[3.15,1.5,.1],[-.65,.76,1.15],mat('#b5aa93',.9),sceneProps.legacyInterior);oldPartitionA.rotation.y=.03;
  const oldPartitionB=box('legacy-partition',[.1,1.5,2.25],[1.15,.76,.15],mat('#a99f8b',.9),sceneProps.legacyInterior);oldPartitionB.rotation.y=-.04;
  sceneProps.legacyInterior.children.forEach(child=>{child.userData.legacyBasePosition=child.position.clone();child.userData.legacyBaseScale=child.scale.clone();});
  // Paint cans and protective sheets.
  sceneProps.paint = new THREE.Group(); office.add(sceneProps.paint);
  for(let i=0;i<3;i++) {
    const can=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,.26,16),mat(i===1?'#d87561':'#e6e2d5',.35,.1));
    can.position.set(-3.9+i*.38,.14,-.45); can.castShadow=true; sceneProps.paint.add(can);
  }
  // Temporary protection, cables and construction debris make stages visible.
  sceneProps.protection = new THREE.Group(); office.add(sceneProps.protection);
  [[-3.65,-.85,1.25,.8],[-2.25,-.85,1.25,.8],[-3.15,-1.7,2.1,.42]].forEach(([x,z,w,d],i)=>{
    const sheet=box('protection-sheet',[w,.018,d],[x,.04,z],mat(i===2?'#557a83':'#7d93a0',.9),sceneProps.protection,false); sheet.rotation.y=i===2?.12:0;
  });
  sceneProps.cables = new THREE.Group(); office.add(sceneProps.cables);
  for(let i=0;i<3;i++) {
    const reel=new THREE.Mesh(new THREE.TorusGeometry(.2,.045,8,18),mat(i===1?'#e1bb4f':'#3f4a45',.55,.18));
    reel.rotation.y=Math.PI/2; reel.position.set(2.15+i*.42,.22,-.25+i*.18); reel.castShadow=true; sceneProps.cables.add(reel);
  }
  sceneProps.debris = new THREE.Group(); office.add(sceneProps.debris);
  [[-1.8,.2],[2.7,1.4],[.8,-.9],[-.8,2.8],[3.4,.4]].forEach(([x,z],i)=>{
    const scrap=box('debris',[.18+i*.025,.04,.1+i*.03],[x,.055,z],mat(i%2?'#d8c6a4':'#848d86'),sceneProps.debris,false); scrap.rotation.y=i*.9;
  });
  sceneProps.greenfieldFoundation=new THREE.Group();office.add(sceneProps.greenfieldFoundation);
  box('foundation-slab',[9.45,.22,7.15],[0,.03,0],mat('#9d9c91',.92),sceneProps.greenfieldFoundation,false);
  sceneProps.greenfieldFrame=new THREE.Group();office.add(sceneProps.greenfieldFrame);
  for(const x of [-4.35,-1.45,1.45,4.35])for(const z of [-3.15,0,3.15])box('frame-column',[.16,2.15,.16],[x,1.08,z],mat('#7d8988',.38,.35),sceneProps.greenfieldFrame);
  for(const z of [-3.15,0,3.15])box('frame-beam',[8.85,.16,.16],[0,2.1,z],mat('#7d8988',.38,.35),sceneProps.greenfieldFrame);
  // Physical construction layers. Their geometry grows with task progress instead
  // of teleporting from a spreadsheet state into a finished office.
  sceneProps.partitions=new THREE.Group();sceneProps.partitions.name='build-partitions';office.add(sceneProps.partitions);
  const partitionSpecs=[[-.9,-.2,3.25,.11,0],[1.55,.72,2.7,.11,0],[-.15,1.75,.11,2.35,1],[2.75,1.52,.11,1.75,1]];
  sceneProps.partitionStuds=new THREE.Group();sceneProps.partitionStuds.name='partition-studs';office.add(sceneProps.partitionStuds);
  sceneProps.partitionStudMembers=[];
  partitionSpecs.forEach(([x,z,w,d,axis],segmentIndex)=>{
    const run=axis?d:w;
    for(let index=0;index<5;index++){
      const offset=-run/2+(run*index/4);
      const stud=box('partition-stud',[.045,1.5,.045],[x+(axis?0:offset),.78,z+(axis?offset:0)],mat('#aeb8b6',.32,.72),sceneProps.partitionStuds);
      stud.userData={segmentIndex,index};sceneProps.partitionStudMembers.push(stud);
    }
    const track=box('partition-track',axis?[.07,.045,d]:[w,.045,.07],[x,.055,z],mat('#9aa7a5',.3,.76),sceneProps.partitionStuds);
    track.userData={segmentIndex,index:5,isTrack:true};sceneProps.partitionStudMembers.push(track);
  });
  sceneProps.partitionSegments=partitionSpecs.map(([x,z,w,d,axis],index)=>{
    const wall=box('partition-segment',[w,1.55,d],[x,.78,z],mat(index%2?'#d9d6ca':'#e4dfd2'),sceneProps.partitions);wall.userData={axis,index,baseHeight:1.55};return wall;
  });
  sceneProps.measureTape=new THREE.Group();sceneProps.measureTape.name='measurement-action';office.add(sceneProps.measureTape);
  box('measure-line',[2.7,.022,.035],[0,.08,0],mat('#f4cb42',.4,.15),sceneProps.measureTape,false);
  box('measure-stop',[.035,.14,.08],[-1.35,.12,0],mat('#f4cb42'),sceneProps.measureTape,false);
  box('measure-stop',[.035,.14,.08],[1.35,.12,0],mat('#f4cb42'),sceneProps.measureTape,false);
  sceneProps.measureTape.visible=false;
  sceneProps.engineering=new THREE.Group();sceneProps.engineering.name='build-engineering';office.add(sceneProps.engineering);
  sceneProps.engineeringSegments=[];
  [[-3.7,2.15,-.4,3.7,.07,.08],[-3.7,2.22,.25,3.7,.06,.06],[-1.8,2.32,-2.55,.08,.07,4.8],[1.65,2.28,-2.55,.12,.11,4.8]].forEach(([x,y,z,w,h,d],index)=>{
    const conduit=box('engineering-segment',[w,h,d],[x,y,z],mat(index===3?'#7a9198':'#4d777f',.34,.4),sceneProps.engineering);conduit.userData={index,baseScale:conduit.scale.clone()};sceneProps.engineeringSegments.push(conduit);
  });
  sceneProps.ceilingTiles=new THREE.Group();sceneProps.ceilingTiles.name='ceiling-grid';office.add(sceneProps.ceilingTiles);
  for(let x=-3.3;x<=3.3;x+=1.1)for(let z=-2.5;z<=2.5;z+=1.25){const panel=box('ceiling-panel',[.92,.025,.92],[x,2.52,z],mat('#e5e4dc',.55),sceneProps.ceilingTiles);panel.visible=false;}
  sceneProps.finishBands=new THREE.Group();sceneProps.finishBands.name='finish-bands';office.add(sceneProps.finishBands);
  for(let i=0;i<10;i++){const band=box('paint-band',[.96,1.46,.018],[-4.55+i*1.01,.77,gz(0)-.62],mat('#d87561',.64),sceneProps.finishBands);band.visible=false;}
  sceneProps.handover=new THREE.Group();sceneProps.handover.name='handover';office.add(sceneProps.handover);
  box('handover-stand',[1.65,.08,.55],[3.15,.74,3.1],mat('#ddff55'),sceneProps.handover);box('handover-sign',[1.45,.72,.06],[3.15,1.12,3.12],mat('#18211d'),sceneProps.handover);sceneProps.handover.visible=false;
  sceneProps.workParticles=[];
  for(let i=0;i<18;i++){const particle=new THREE.Mesh(new THREE.SphereGeometry(.025+(i%3)*.008,6,4),new THREE.MeshBasicMaterial({color:i%4===0?'#ffd45c':'#c4b59d',transparent:true,opacity:.72,depthWrite:false}));particle.visible=false;office.add(particle);sceneProps.workParticles.push(particle);}
  sceneProps.beacon=new THREE.Group();sceneProps.beacon.name='delivery-beacon';sceneProps.yard.add(sceneProps.beacon);
  const beaconBase=new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,.1,12),mat('#303936',.34,.45));beaconBase.position.y=.05;sceneProps.beacon.add(beaconBase);
  const beaconLamp=new THREE.Mesh(new THREE.CylinderGeometry(.1,.12,.2,12),new THREE.MeshStandardMaterial({color:'#f6a843',emissive:'#ff6b24',emissiveIntensity:2,transparent:true,opacity:.82}));beaconLamp.position.y=.2;sceneProps.beacon.add(beaconLamp);sceneProps.beacon.userData.lamp=beaconLamp;
  sceneProps.beacon.position.set(8.15,.02,3.35);sceneProps.beacon.visible=false;
  // Ceiling lights.
  sceneProps.lights = [];
  for(let x=-3;x<=3;x+=2) for(let z=-2;z<=2;z+=2) {
    const lamp=box('light',[.8,.035,.22],[x,2.65,z],mat('#f8f0cb',.2,.1));
    const light=new THREE.PointLight('#fff3cc',0,3.2); light.position.set(x,2.5,z); light.userData.fixture=lamp; office.add(light); sceneProps.lights.push(light);
  }

  // The architect observes every compromise; the client appears for decisions and handover.
  sceneProps.architect = makePerson({ role:'architect', color:'#a95f5f', skin:'#c98c68', variant:0 });
  sceneProps.architect.position.set(-1.25,.03,-2.95); sceneProps.architect.rotation.y=.65; office.add(sceneProps.architect);
  sceneProps.client = makePerson({ role:'client', color:'#32495a', skin:'#d6a47d', variant:1 });
  sceneProps.client.position.set(3.15,.03,2.25); sceneProps.client.rotation.y=-2.35; office.add(sceneProps.client);
}

function makeTextSprite(text, color) {
  const canvas = document.createElement('canvas'); canvas.width=512; canvas.height=128;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(15,22,18,.90)'; ctx.beginPath(); ctx.roundRect(8,8,496,112,28); ctx.fill();
  ctx.strokeStyle=color; ctx.lineWidth=4; ctx.stroke();
  ctx.fillStyle='#f5f7f2'; ctx.font='800 38px Manrope, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(text,256,64);
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false}));
  sprite.scale.set(2.35,.59,1); return sprite;
}

function makeBubbleSprite(text) {
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=160;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(248,250,244,.96)';ctx.beginPath();ctx.roundRect(12,10,360,112,34);ctx.fill();
  ctx.beginPath();ctx.moveTo(175,120);ctx.lineTo(205,120);ctx.lineTo(188,150);ctx.closePath();ctx.fill();
  ctx.fillStyle='#17201c';ctx.font='900 46px ui-sans-serif, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,192,66);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false}));
  sprite.scale.set(1.05,.44,1);sprite.position.y=1.57;sprite.visible=false;sprite.renderOrder=20;
  sprite.userData.bubbleCanvas=canvas;sprite.userData.bubbleTexture=texture;sprite.userData.bubbleText=text;
  return sprite;
}

const ENCOUNTER_DIALOGUES={
  general:[
    ['Ты это в графике видел?','Я график видел. Он меня — нет.'],['Кто крайний по акту?','Акт крайний. Мы внутри.'],['Материал приехал?','Приехало письмо о материале.'],['Срочно — это сегодня?','Нет, это вчера после обеда.'],
    ['Прораб сказал «пять минут».','Значит, до следующей пятницы.'],['Здесь всегда так?','Нет. Иногда ещё хуже.'],['Чей удлинитель?','Теперь уже юридический вопрос.'],['Ты обедал?','Я согласовывал обед.'],
    ['Почему стоим?','Ждём человека, который знает, почему.'],['Где чертёж?','В почте. В какой — решает судьба.'],['Я всё сделал.','Тогда молчи, а то найдут ещё.'],['Это временно?','На стройке всё временно. Даже постоянное.'],
    ['Кто перенёс коробки?','Тот же, кто потерял накладную.'],['Сегодня сдадим?','Сегодня обязательно пообещаем.'],['Тут была стена.','Она ушла по замечанию.'],['Кофе есть?','Есть замечание к кофе.'],
    ['Ты видел заказчика?','Он видел наш процент выполнения.'],['Проблемы есть?','Проблем нет. Есть вопросы.'],['Что сверлим?','Уверенность заказчика.'],['Сначала делаем или согласуем?','Сначала делаем вид.'],
  ],
  work:[
    ['Цвет тот?','Тот. До следующего письма.'],['Кабель куда?','По проекту — сюда. По факту — созвонимся.'],['Стол проходит?','Если снять дверь, стену и амбиции.'],['Труба за стеной.','Значит, стену строили убедительно.'],
    ['Уровень ровный?','Уровень честный. Пол — нет.'],['Можно закрывать?','Сфотографируй сначала. Мы учёные.'],['Перфоратор заряжен?','Соседи уже тоже.'],['Мебель собрана?','Лишние детали подтверждают запас прочности.'],
    ['Акт подписали?','Подписант на совещании про ускорение.'],['Краска сохнет?','Да. График — быстрее.'],['Фронт готов?','Фронт морально готовится.'],['Это по РД?','Это по сильной команде.'],
  ],
  client:[
    ['Когда закончите?','Раньше отчёта. Возможно.'],['Почему здесь люди стоят?','Это оперативный штаб в курилке.'],['А можно дешевле?','Можно. Но потом будет дороже.'],['Почему не тот цвет?','Он тот при согласованном освещении.'],
    ['Где мой кабинет?','Сейчас он проходит стадию поля.'],['Процент настоящий?','Он управленческий.'],['Вы успеваете?','Мы уже формулируем ответ.'],['Почему шумно?','Офис становится тише через разрушение.'],
    ['Сколько ещё денег?','Смотря насколько точно вы хотите знать.'],['Можно завтра заехать?','Можно. Работать — отдельное согласование.'],['Это входит в смету?','В разговор — точно входит.'],['Почему дверь тут?','Она ищет своё место вместе с нами.'],
  ],
  architect:[
    ['Так было задумано.','А построено тоже будет задумано?'],['Этот серый слишком холодный.','Рабочим пока жарко.'],['Где теневой шов?','Ушёл в тень.'],['Не трогайте композицию.','Она перекрывает кабельный лоток.'],
    ['На визуализации красивее.','Там подрядчика не было.'],['Нужен бесшовный узел.','У нас пока бесхозный.'],['Сдвинем стену на 40 мм.','Трубу предупредить?'],['Свет должен быть мягким.','Электрик сегодня тоже.'],
    ['Это авторский надзор.','Тогда автор сейчас удивится.'],['Мебель должна парить.','Грузчики уже готовы отпустить.'],
  ],
  authority:[
    ['Где журнал работ?','Он ведётся к вам.'],['Акт скрытых работ?','Работы так хорошо скрыты, что ищем.'],['Каска застёгнута?','После вашего вопроса — да.'],['Кто ответственный?','Сейчас все посмотрят на прораба.'],
    ['Почему проход закрыт?','Чтобы никто не увидел открытый вопрос.'],['Документация готова?','Физически она существует.'],['Предъявляли работу?','Мы предъявляли намерение.'],['Замечание устранили?','Мы устранили слово «проблема».'],
  ],
};
let activeEncounterDialogue=null;
let nextEncounterDialogueAt=0;

function paintBubble(sprite,text) {
  if(!sprite||sprite.userData.bubbleText===text)return;
  const canvas=sprite.userData.bubbleCanvas,texture=sprite.userData.bubbleTexture;if(!canvas||!texture)return;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='rgba(248,250,244,.96)';ctx.beginPath();ctx.roundRect(12,10,360,112,34);ctx.fill();ctx.beginPath();ctx.moveTo(175,120);ctx.lineTo(205,120);ctx.lineTo(188,150);ctx.closePath();ctx.fill();
  ctx.fillStyle='#17201c';ctx.font=`900 ${text.length>26?31:text.length>18?37:46}px ui-sans-serif, sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,192,66,340);texture.needsUpdate=true;sprite.userData.bubbleText=text;
}

function encounterPoolFor(a,b) {
  const roles=new Set([a.userData.role,b.userData.role]);
  if(['police','inspector','boss'].some(role=>roles.has(role)))return ENCOUNTER_DIALOGUES.authority;
  if(roles.has('client'))return ENCOUNTER_DIALOGUES.client;
  if(roles.has('architect'))return ENCOUNTER_DIALOGUES.architect;
  if(a.userData.crewId||b.userData.crewId)return Math.random()<.56?ENCOUNTER_DIALOGUES.work:ENCOUNTER_DIALOGUES.general;
  return ENCOUNTER_DIALOGUES.general;
}

function hierarchyVisible(node) { for(let cursor=node;cursor;cursor=cursor.parent)if(!cursor.visible)return false;return true; }

function updateEncounterDialogue(t) {
  if(activeEncounterDialogue){
    const dialogue=activeEncounterDialogue;const elapsed=t-dialogue.started;
    if(elapsed>3.25||!hierarchyVisible(dialogue.a)||!hierarchyVisible(dialogue.b)){
      dialogue.a.userData.bubble.visible=false;dialogue.b.userData.bubble.visible=false;paintBubble(dialogue.a.userData.bubble,dialogue.a.userData.defaultBubble);paintBubble(dialogue.b.userData.bubble,dialogue.b.userData.defaultBubble);activeEncounterDialogue=null;nextEncounterDialogueAt=t+5+Math.random()*8;return;
    }
    const first=elapsed<1.55;paintBubble(dialogue.a.userData.bubble,dialogue.lines[0]);paintBubble(dialogue.b.userData.bubble,dialogue.lines[1]);dialogue.a.userData.bubble.visible=first;dialogue.b.userData.bubble.visible=!first;setPersonMotion(dialogue.a,first?'argue':'idle');setPersonMotion(dialogue.b,first?'idle':'argue');return;
  }
  if(t<nextEncounterDialogueAt||state.paused||!state.started)return;
  nextEncounterDialogueAt=t+2.5;
  const people=[];office.traverse(node=>{if(node.userData?.isPerson&&hierarchyVisible(node))people.push(node);});
  const positionA=new THREE.Vector3(),positionB=new THREE.Vector3(),candidates=[];
  for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++){
    const a=people[i],b=people[j];if((a.userData.dialogueCooldown??0)>t||(b.userData.dialogueCooldown??0)>t)continue;a.getWorldPosition(positionA);b.getWorldPosition(positionB);const distance=positionA.distanceTo(positionB);if(distance<1.05)candidates.push({a,b,distance});
  }
  if(!candidates.length||Math.random()>.64)return;
  const pair=candidates[Math.floor(Math.random()*candidates.length)];const pool=encounterPoolFor(pair.a,pair.b);const lines=pool[Math.floor(Math.random()*pool.length)];
  pair.a.userData.dialogueCooldown=t+20+Math.random()*18;pair.b.userData.dialogueCooldown=t+20+Math.random()*18;activeEncounterDialogue={...pair,lines,started:t};
}

function makeTaskMarkers() {
  // Work status belongs to the checklist. The 3D office now shows only the
  // physical result, people and real incident bubbles — no floating WBS labels.
}

function rebuildTaskMarkers() {
  for(const group of markerMeshes.values())office.remove(group);
  markerMeshes.clear();
  makeTaskMarkers();
}

const CHARACTER_ASSETS={
  workerMale:'./assets/characters/Worker_Male.glb',
  workerFemale:'./assets/characters/Worker_Female.glb',
  suitMale:'./assets/characters/Suit_Male.glb',
  suitFemale:'./assets/characters/Suit_Female.glb',
};
const characterTemplates=new Map();
const pendingCharacterUpgrades=new Set();
let characterAssetsLoading=false;
let cloneCharacterSkeleton=null;

function characterAssetKey(role,variant,avatar) {
  const female=variant%2===1||['architect','medic'].includes(role);
  const suited=['client','boss','inspector','architect','police','medic'].includes(role)||(role==='player'&&avatar?.outfit==='suit');
  return `${suited?'suit':'worker'}${female?'Female':'Male'}`;
}

async function loadCharacterAssets() {
  if(characterAssetsLoading)return;
  characterAssetsLoading=true;
  const [{GLTFLoader},{clone}]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('three/addons/utils/SkeletonUtils.js')]);
  cloneCharacterSkeleton=clone;
  const loader=new GLTFLoader();
  await Promise.all(Object.entries(CHARACTER_ASSETS).map(async ([key,url])=>{
    try { characterTemplates.set(key,await loader.loadAsync(url)); }
    catch(error){ console.warn(`Character asset ${key} unavailable; keeping lightweight fallback.`,error); }
  }));
  for(const request of pendingCharacterUpgrades) attachRiggedCharacter(request.person,request.spec,request.legacyVisuals,request.hq);
  pendingCharacterUpgrades.clear();
}

const PROP_ASSETS={
  desk:'./assets/props/kenney-furniture/desk.glb',chair:'./assets/props/kenney-furniture/chair-desk.glb',laptop:'./assets/props/kenney-furniture/laptop.glb',
  sofa:'./assets/props/kenney-furniture/lounge-sofa.glb',bookcase:'./assets/props/kenney-furniture/bookcase.glb',coffee:'./assets/props/kenney-furniture/coffee-machine.glb',plant:'./assets/props/kenney-furniture/plant.glb',
};

async function loadPropAssets() {
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const loader=new GLTFLoader();const templates=new Map();
  await Promise.all(Object.entries(PROP_ASSETS).map(async([key,url])=>{try{templates.set(key,(await loader.loadAsync(url)).scene);}catch(error){console.warn(`Prop asset ${key} unavailable; keeping procedural furniture.`,error);}}));
  if(!templates.size)return;
  const fitout=new THREE.Group();fitout.name='kenney-fitout';fitout.userData.ready=true;sceneProps.kenneyFitout=fitout;office.add(fitout);sceneProps.kenneyStations=[];
  const addModel=(key,parent,x,y,z,scale=1,rotation=0)=>{const source=templates.get(key);if(!source)return null;const model=source.clone(true);model.name=`kenney-${key}`;model.position.set(x,y,z);model.scale.setScalar(scale);model.rotation.y=rotation;model.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});parent.add(model);return model;};
  for(let index=0;index<8;index++){
    const station=new THREE.Group();station.name='kenney-workstation';station.userData.stationIndex=index;station.position.set(-.55+(index%4)*1.35,.02,.25+Math.floor(index/4)*1.12);station.rotation.y=Math.floor(index/4)%2?Math.PI:0;fitout.add(station);sceneProps.kenneyStations.push(station);
    addModel('desk',station,0,0,0,.68);addModel('chair',station,0,0,.64,.62,Math.PI);addModel('laptop',station,.12,.7,-.03,.58,Math.PI);
  }
  addModel('sofa',fitout,-3.35,.02,2.48,.82);addModel('bookcase',fitout,-4.18,.02,.55,.72,Math.PI/2);addModel('coffee',fitout,.32,.86,-3.18,.62);addModel('plant',fitout,1.95,.02,-2.85,.76);
  syncSceneFromState();
}

function addRigAccessories(person,{role,color,profile,avatar}) {
  const isPlayer=role==='player';
  const isWorker=['worker','foreman','moving','demolition','construction','engineering','paint','electric','furniture','cleaning','delivery'].includes(role)||(isPlayer&&avatar?.outfit!=='suit');
  const accessoryRoot=new THREE.Group();accessoryRoot.name='rig-accessories';person.add(accessoryRoot);
  if(isPlayer&&!isWorker){
    const helmetColor=avatar?.helmet==='visor'?'#202a2b':'#f4f5ee';
    const cap=isPlayer&&avatar?.helmet==='cap';
    const dome=new THREE.Mesh(cap?new THREE.CylinderGeometry(.105,.165,.075,16):new THREE.SphereGeometry(.158,16,8,0,Math.PI*2,0,Math.PI/2),mat(helmetColor,.34,.08));
    dome.position.y=1.28;dome.castShadow=true;accessoryRoot.add(dome);
    const brim=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.035,18),mat(helmetColor,.34,.08));brim.position.set(0,1.245,.035);accessoryRoot.add(brim);
  }
  if(role==='architect'){
    const beret=new THREE.Mesh(new THREE.CylinderGeometry(.12,.19,.06,20),mat(['#2c2e2d','#643e48','#3b5460'][profile.accessory%3],.55));beret.position.set(-.025,1.29,0);beret.rotation.z=.14;accessoryRoot.add(beret);
    const scarfColor=['#d87561','#d1b45c','#6f9a91'][profile.bubbleVariant%3];const scarf=new THREE.Mesh(new THREE.TorusGeometry(.15,.025,8,20),mat(scarfColor));scarf.rotation.x=Math.PI/2;scarf.position.y=.98;accessoryRoot.add(scarf);
    box('rig-plans',[.28,.38,.025],[-.29,.64,.14],mat('#dce7e3'),accessoryRoot);
  }
  if(['client','boss','inspector'].includes(role))box('rig-folder',[.28,.34,.035],[-.3,.59,.16],mat(role==='client'?'#704d35':role==='boss'?'#2d3431':'#d2b95f'),accessoryRoot);
  if(role==='police'){
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,.09,16),mat('#17345a',.5));cap.position.y=1.28;accessoryRoot.add(cap);box('rig-cap-brim',[.23,.025,.12],[0,1.245,.11],mat('#17345a'),accessoryRoot);box('rig-badge',[.055,.075,.018],[-.1,.76,.17],mat('#e4c44c',.3,.3),accessoryRoot);
  }
  if(role==='medic'){
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.16,14,8,0,Math.PI*2,0,Math.PI/2),mat('#e6efeb'));cap.position.y=1.25;accessoryRoot.add(cap);box('rig-medical-cross',[.13,.035,.02],[0,.76,.17],mat('#dc554d'),accessoryRoot);box('rig-medical-cross',[.035,.13,.022],[0,.76,.175],mat('#dc554d'),accessoryRoot);
  }
  if(role==='moving')box('rig-held-box',[.38,.3,.31],[0,.56,.31],mat('#b9824c'),accessoryRoot);
  if(role==='furniture')box('rig-furniture-panel',[.56,.09,.34],[0,.55,.31],mat('#9b704b'),accessoryRoot).rotation.x=-.08;
  if(role==='paint'){const roller=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.72,8),mat('#59645e'));roller.position.set(.31,.63,.08);roller.rotation.z=-.2;accessoryRoot.add(roller);box('rig-roller-head',[.25,.07,.08],[.39,.96,.08],mat('#e5e1d5'),accessoryRoot);}
  if(role==='cleaning'){const mop=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.9,8),mat('#718078'));mop.position.set(.34,.52,.08);mop.rotation.z=-.28;accessoryRoot.add(mop);box('rig-mop-head',[.3,.045,.14],[.46,.08,.08],mat('#78cbb0'),accessoryRoot);}
  if(['electric','engineering','construction','demolition'].includes(role))box('rig-tool-bag',[.18,.2,.13],[.25,.46,-.02],mat(role==='demolition'?'#5b4437':'#284a5e'),accessoryRoot);
  if(role==='foreman'||isPlayer)box('rig-tablet',[.23,.32,.028],[-.3,.63,.16],mat('#263b40',.28,.2),accessoryRoot);
}

function rigMaterialColor(name,{role,color,profile,avatar}) {
  const roleColor=role==='player'?(avatar?.color??color):role==='client'?'#3f6d86':role==='boss'?'#72536f':role==='inspector'?'#66808a':role==='architect'?'#9a6578':role==='police'?'#275b91':role==='medic'?'#d7e9e5':color;
  const key=name.toLowerCase();
  if(key.includes('face')||key==='skin')return profile.skin;
  if(key.includes('hair'))return profile.hair;
  if(key.includes('hat'))return role==='player'?'#f4f5ee':role==='foreman'?'#f4f5ee':role==='police'?'#17345a':role==='medic'?'#e6efeb':'#f2c84e';
  if(key.includes('vest')||key==='black')return roleColor;
  if(key.includes('shirt'))return ['worker','moving','demolition','construction','engineering','paint','electric','furniture','cleaning','delivery','foreman','player'].includes(role)?new THREE.Color(roleColor).lerp(new THREE.Color('#dbe6dc'),.42):'#edf1ec';
  if(key.includes('detail'))return role==='architect'?'#d1b45c':role==='client'?'#d87561':'#b9d6c9';
  if(key.includes('pants'))return role==='police'?'#172c48':'#33433f';
  if(key.includes('belt'))return '#29312f';
  return null;
}

function customizeRigMaterial(material,spec) {
  const customized=material.clone();const target=rigMaterialColor(customized.name??'',spec);if(target)customized.color.set(target);
  if('emissive' in customized){customized.emissive.copy(customized.color);customized.emissiveIntensity=.1;}
  customized.roughness=Math.max(.56,customized.roughness??.7);return customized;
}

function attachRiggedCharacter(person,spec,legacyVisuals,hq=false) {
  if(person.userData.characterRig)return true;
  const template=characterTemplates.get(characterAssetKey(spec.role,spec.variant,spec.avatar));
  if(!template)return false;
  if(!cloneCharacterSkeleton)return false;
  const rig=cloneCharacterSkeleton(template.scene);rig.name='animated-character';rig.userData.riggedAsset=true;
  rig.traverse(node=>{node.userData.riggedAsset=true;if(node.isMesh){node.castShadow=true;node.receiveShadow=true;node.frustumCulled=false;node.material=Array.isArray(node.material)?node.material.map(material=>customizeRigMaterial(material,spec)):customizeRigMaterial(node.material,spec);}});
  const bounds=new THREE.Box3().setFromObject(rig);const size=bounds.getSize(new THREE.Vector3());const rigScale=1.34/Math.max(size.y,.01);
  rig.scale.setScalar(rigScale);rig.position.y=-bounds.min.y*rigScale;rig.rotation.y=Math.PI;
  legacyVisuals.forEach(item=>{item.visible=false;});person.add(rig);
  if(!hq)addRigAccessories(person,spec);
  const mixer=new THREE.AnimationMixer(rig);const actions={};
  for(const clip of template.animations){actions[clip.name]=mixer.clipAction(clip);}
  const idle=actions.Idle??Object.values(actions)[0];idle?.play();
  person.userData.characterRig=rig;person.userData.characterMixer=mixer;person.userData.characterActions=actions;person.userData.characterAction=idle;
  return true;
}

function requestRiggedCharacter(person,spec,legacyVisuals,hq=false) {
  if(!attachRiggedCharacter(person,spec,legacyVisuals,hq))pendingCharacterUpgrades.add({person,spec,legacyVisuals,hq});
}

function setPersonMotion(person,motion) {
  const actions=person.userData.characterActions;if(!actions)return;
  const clipNames={idle:'Idle',walk:'Walk',carry:'Walk_Carry',work:'PickUp',argue:'Punch',celebrate:'Victory'};
  const next=actions[clipNames[motion]]??actions.Idle??Object.values(actions)[0];
  if(!next||person.userData.characterAction===next)return;
  const previous=person.userData.characterAction;next.reset().fadeIn(.18).play();previous?.fadeOut(.18);person.userData.characterAction=next;
}

function makeCapsule(radius, length, color, roughness=.72) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius,length,5,10),mat(color,roughness));
  mesh.castShadow=true;
  return mesh;
}

function makePerson({ role='worker', color='#e9ad52', skin='#d6a47d', variant=0, profile, avatar } = {}) {
  const person=new THREE.Group();
  profile ??= createPersonProfile(role, state.visualSeed ?? 1, variant);
  skin=profile.skin??skin;
  const isPlayer=role==='player';const isWorker=['worker','foreman','moving','demolition','construction','engineering','paint','electric','furniture','cleaning','delivery'].includes(role)||(isPlayer&&avatar?.outfit!=='suit');
  const isForeman=role==='foreman';
  const isSuit=['client','boss','inspector'].includes(role)||(isPlayer&&avatar?.outfit==='suit');
  const trouserColor=isSuit?'#1e2b33':role==='architect'?'#27302e':role==='police'?'#172c48':role==='medic'?'#d8e4df':'#343e39';

  const leftLeg=makeCapsule(.06,.29,trouserColor); leftLeg.position.set(-.095,.25,0); person.add(leftLeg);
  const rightLeg=makeCapsule(.06,.29,trouserColor); rightLeg.position.set(.095,.25,0); person.add(rightLeg);
  const leftShoe=box('shoe',[.13,.07,.22],[-.095,.055,.045],mat('#151a18',.55),person); leftShoe.rotation.y=.04;
  const rightShoe=box('shoe',[.13,.07,.22],[.095,.055,.045],mat('#151a18',.55),person); rightShoe.rotation.y=-.04;

  const torsoColor=isPlayer?(avatar?.color??color):role==='client'?'#31495a':role==='boss'?'#3c3545':role==='inspector'?'#48565b':role==='architect'?'#79525d':role==='police'?'#1f4168':role==='medic'?'#e8efeb':color;
  const torso=makeCapsule(.155,.23,torsoColor,.62); torso.scale.set(1,.98,.72); torso.position.y=.68; person.add(torso);
  const leftArm=makeCapsule(.047,.27,role==='client'?torsoColor:skin); leftArm.position.set(-.215,.66,0); leftArm.rotation.z=-.15; person.add(leftArm);
  const rightArm=makeCapsule(.047,.27,role==='client'?torsoColor:skin); rightArm.position.set(.215,.66,0); rightArm.rotation.z=.15; person.add(rightArm);
  const leftHand=new THREE.Mesh(new THREE.SphereGeometry(.06,10,8),mat(skin)); leftHand.position.set(-.25,.46,0); leftHand.castShadow=true; person.add(leftHand);
  const rightHand=new THREE.Mesh(new THREE.SphereGeometry(.06,10,8),mat(skin)); rightHand.position.set(.25,.46,0); rightHand.castShadow=true; person.add(rightHand);

  const neck=new THREE.Mesh(new THREE.CylinderGeometry(.065,.07,.09,10),mat(skin)); neck.position.y=.94; person.add(neck);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.14,16,12),mat(skin)); head.scale.set(.9,1.08,.92); head.position.y=1.075; head.castShadow=true; person.add(head);
  const nose=new THREE.Mesh(new THREE.SphereGeometry(.025,8,6),mat(skin)); nose.position.set(0,1.07,.135); person.add(nose);

  if(isWorker) {
    // Yellow hard hats for crews, white for the foreman.
    const helmetColor=isPlayer?(avatar?.helmet==='visor'?'#202a2b':'#f0f2e9'):isForeman?'#f0f2e9':'#f2c84e';
    const domeGeometry=isPlayer&&avatar?.helmet==='cap'?new THREE.CylinderGeometry(.105,.165,.075,16):new THREE.SphereGeometry(.158,16,8,0,Math.PI*2,0,Math.PI/2);
    const dome=new THREE.Mesh(domeGeometry,mat(helmetColor,.38,.08)); dome.position.y=isPlayer&&avatar?.helmet==='cap'?1.18:1.16; dome.castShadow=true; person.add(dome);
    const brim=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.035,18),mat(helmetColor,.38,.08)); brim.position.set(0,1.155,.025); brim.castShadow=true; person.add(brim);
    if(isPlayer&&avatar?.helmet==='visor')box('player-visor',[.25,.16,.025],[0,1.1,.16],new THREE.MeshPhysicalMaterial({color:'#8bcad0',transparent:true,opacity:.42,roughness:.08}),person);
    const vest=box('safety-vest',[.29,.24,.17],[0,.7,.075],mat(isForeman?'#d9f45b':color,.7),person);
    box('vest-stripe',[.3,.026,.178],[0,.68,.079],mat('#eef3dc',.45,.05),person);
    if(['electric','engineering','construction','demolition'].includes(role)) box('tool-bag',[.16,.18,.12],[.23,.44,-.03],mat(role==='demolition'?'#5b4437':'#284a5e'),person);
    if(role==='paint') {
      const roller=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.65,8),mat('#59645e')); roller.position.set(.32,.58,.02); roller.rotation.z=-.15; person.add(roller);
      box('roller-head',[.25,.07,.08],[.37,.9,.02],mat('#e5e1d5'),person);
    }
    if(role==='cleaning') {
      const mop=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.82,8),mat('#718078')); mop.position.set(.34,.48,.04); mop.rotation.z=-.28; person.add(mop);
      box('mop-head',[.28,.045,.13],[.45,.08,.04],mat('#78cbb0'),person);
    }
    if(role==='moving') box('held-box',[.34,.28,.28],[0,.48,.27],mat('#b9824c'),person);
    if(role==='furniture') {
      box('tool',[.3,.045,.045],[.3,.5,.05],mat('#94a2a0',.35,.3),person);
      const panel=box('furniture-panel',[.52,.08,.3],[0,.49,.28],mat('#9b704b'),person);panel.rotation.x=-.08;
    }
    if(isForeman) box('tablet',[.22,.31,.025],[-.27,.61,.11],mat('#2b4144',.3,.2),person);
    if(profile.helmetVariant===1) box('helmet-lamp',[.075,.055,.035],[0,1.21,.15],mat('#e8f2d3',.2,.2),person);
    if(profile.helmetVariant===2) {
      const leftMuff=new THREE.Mesh(new THREE.SphereGeometry(.055,8,6),mat('#2c3c46'));leftMuff.position.set(-.16,1.1,0);person.add(leftMuff);
      const rightMuff=leftMuff.clone();rightMuff.position.x=.16;person.add(rightMuff);
    }
    if(profile.accessory===3) box('tool-pouch',[.15,.17,.09],[-.2,.42,-.02],mat('#634934'),person);
  }

  if(isPlayer&&avatar?.outfit==='suit'){
    box('player-shirt',[.12,.23,.175],[0,.75,.085],mat('#eef1ec'),person);box('player-tie',[.035,.2,.02],[0,.72,.18],mat('#d87561'),person);
    const headwear=avatar.helmet==='cap'?new THREE.CylinderGeometry(.11,.17,.08,16):new THREE.SphereGeometry(.16,16,8,0,Math.PI*2,0,Math.PI/2);const helmet=new THREE.Mesh(headwear,mat(avatar.helmet==='visor'?'#202a2b':'#f0f2e9',.35,.1));helmet.position.y=1.19;person.add(helmet);
  }

  if(role==='architect') {
    const hair=new THREE.Mesh(new THREE.SphereGeometry(.145,14,8,0,Math.PI*2,0,Math.PI/2),mat(profile.hair)); hair.position.y=1.145; person.add(hair);
    const beretColor=['#2c2e2d','#643e48','#3b5460'][profile.accessory%3];
    const scarfColor=['#d87561','#d1b45c','#6f9a91'][profile.bubbleVariant%3];
    const beret=new THREE.Mesh(new THREE.CylinderGeometry(.11,.18,.055,20),mat(beretColor,.62)); beret.position.set(-.025,1.205,0); beret.rotation.z=.14; beret.castShadow=true; person.add(beret);
    const scarf=new THREE.Mesh(new THREE.TorusGeometry(.145,.025,8,20),mat(scarfColor)); scarf.rotation.x=Math.PI/2; scarf.position.y=.92; person.add(scarf);
    box('scarf-tail',[.065,.31,.035],[.13,.78,.12],mat(scarfColor),person).rotation.z=-.13;
    box('plans',[.28,.38,.025],[-.28,.61,.12],mat('#dce7e3'),person);
  }

  if(role==='client') {
    const hair=new THREE.Mesh(new THREE.SphereGeometry(.145,14,8,0,Math.PI*2,0,Math.PI/2),mat(profile.hair)); hair.position.y=1.145; hair.scale.set(1,.55,1); person.add(hair);
    box('shirt',[.12,.23,.175],[0,.75,.085],mat('#eef1ec'),person);
    const tie=box('tie',[.035,.2,.02],[0,.72,.18],mat('#d87561'),person); tie.rotation.z=.03;
    box('briefcase',[.28,.22,.09],[.31,.37,.02],mat('#6c4b35',.45,.12),person);
    if(profile.accessory%2===0) box('phone',[.09,.17,.018],[-.25,.5,.1],mat('#152429',.2,.2),person);
  }

  if(role==='boss'||role==='inspector') {
    const hair=new THREE.Mesh(new THREE.SphereGeometry(.145,14,8,0,Math.PI*2,0,Math.PI/2),mat(role==='boss'?'#46413c':'#6d6259')); hair.position.y=1.145; hair.scale.y=.55; person.add(hair);
    box('shirt',[.12,.23,.175],[0,.75,.085],mat('#eef1ec'),person);
    box('tie',[.035,.2,.02],[0,.72,.18],mat(role==='boss'?'#9b4c52':'#446d78'),person);
    box('folder',[.26,.34,.025],[-.28,.6,.12],mat(role==='boss'?'#2d3431':'#d2b95f'),person);
  }

  if(role==='police') {
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.12,.17,.09,16),mat('#17345a',.55)); cap.position.y=1.19; cap.castShadow=true; person.add(cap);
    box('cap-brim',[.22,.025,.11],[0,1.155,.1],mat('#17345a'),person);
    box('badge',[.05,.07,.015],[-.09,.75,.15],mat('#e4c44c',.3,.3),person);
    box('radio',[.06,.15,.05],[.19,.76,.05],mat('#161b1e',.35,.2),person);
  }

  if(role==='medic') {
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.15,14,8,0,Math.PI*2,0,Math.PI/2),mat('#e6efeb')); cap.position.y=1.16; person.add(cap);
    box('medical-cross',[.12,.035,.018],[0,.75,.15],mat('#dc554d'),person);
    box('medical-cross',[.035,.12,.02],[0,.75,.155],mat('#dc554d'),person);
  }

  if(profile.accessory===1&&!isWorker) {
    for(const x of [-.07,.07]){const lens=new THREE.Mesh(new THREE.TorusGeometry(.045,.009,6,14),mat('#252b2a',.3,.25));lens.position.set(x,1.09,.132);person.add(lens);}
  }
  const legacyVisuals=person.children.slice();
  const hitbox=new THREE.Mesh(new THREE.CapsuleGeometry(.36,1.02,4,8),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false}));
  hitbox.position.y=.62;person.add(hitbox);
  const bubbleText=bubbleFor(role,profile.bubbleVariant+variant);
  const bubble=makeBubbleSprite(bubbleText);person.add(bubble);
  const alertBubble=makeBubbleSprite('!');alertBubble.scale.set(.48,.48,1);alertBubble.position.set(.22,1.58,0);person.add(alertBubble);
  const selectionRing=new THREE.Mesh(new THREE.RingGeometry(.3,.38,24),new THREE.MeshBasicMaterial({color:isPlayer?'#ddff55':'#ffffff',transparent:true,opacity:.9,side:THREE.DoubleSide,depthWrite:false}));selectionRing.rotation.x=-Math.PI/2;selectionRing.position.y=.015;selectionRing.visible=false;person.add(selectionRing);
  let playerAura=null;let playerBadge=null;let playerMarker=null;
  if(isPlayer){
    playerAura=new THREE.Mesh(new THREE.RingGeometry(.55,.7,32),new THREE.MeshBasicMaterial({color:'#ddff55',transparent:true,opacity:.88,side:THREE.DoubleSide,depthWrite:false}));playerAura.rotation.x=-Math.PI/2;playerAura.position.y=.012;person.add(playerAura);
    const innerAura=new THREE.Mesh(new THREE.RingGeometry(.25,.28,24),new THREE.MeshBasicMaterial({color:avatar?.color??'#ddff55',transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));innerAura.rotation.x=-Math.PI/2;innerAura.position.y=.014;playerAura.add(innerAura);
    playerBadge=makeBubbleSprite('ВЫ');playerBadge.scale.set(1.38,.68,1);playerBadge.position.set(0,1.9,0);person.add(playerBadge);
    playerMarker=new THREE.Mesh(new THREE.OctahedronGeometry(.22,0),new THREE.MeshStandardMaterial({color:'#ddff55',emissive:'#9cbc1f',emissiveIntensity:1.8,roughness:.2}));playerMarker.scale.y=1.55;playerMarker.position.set(0,2.34,0);person.add(playerMarker);
    box('player-tablet',[.24,.32,.028],[-.28,.62,.13],mat('#263b40',.28,.2),person);
  }

  const names=PERSON_NAMES[role]??PERSON_NAMES.worker;
  const displayName=role==='client'&&state.selectedOrder?.clientPerson?state.selectedOrder.clientPerson:(['police','inspector','boss','medic'].includes(role)?names[variant%names.length]:profile.name);
  const personScale=isPlayer?.86:.64;
  person.scale.set(profile.body*personScale,profile.height*personScale,profile.body*personScale);
  person.userData={isPerson:true,role,displayName:isPlayer?(sessionUser??'Вы'):displayName,job:isPlayer?'Генеральный директор · ваш аватар':PERSON_JOBS[role]??PERSON_JOBS.worker,leftLeg,rightLeg,leftArm,rightArm,variant,bubble,defaultBubble:bubbleText,alertBubble,selectionRing,playerAura,playerBadge,playerMarker,profile};
  requestRiggedCharacter(person,{role,color,profile,avatar,variant},legacyVisuals);
  return person;
}

function makeCrewMesh(crew) {
  const group = new THREE.Group();
  const role=crew.id==='foreman'?'player':crew.skill==='design'?'architect':crew.skill==='documentation'?'foreman':crew.supportRole==='procurement'?'client':crew.supportRole?'foreman':crew.skill;
  const count=crewHeadcount(state,crew);
  const people=[];
  for(let i=0;i<count;i++) {
    const profile=createPersonProfile(role,(state.visualSeed??1)+crew.id.length*41,i);
    const person=makePerson({role,color:crew.color,variant:i,profile,avatar:crew.id==='foreman'?state.playerAvatar:null});
    person.userData.crewId=crew.id;person.userData.company=crew.id==='foreman'?(state.organization?.name??'Ваша организация'):crew.name;
    if(crew.id.startsWith('team-')){person.userData.job=crew.role;person.userData.displayName=crew.name;}
    const columns=Math.min(3,Math.ceil(Math.sqrt(count)));const row=Math.floor(i/columns),column=i%columns;const rows=Math.ceil(count/columns);
    person.position.set((column-(columns-1)/2)*.36,0,(row-(rows-1)/2)*.3);person.userData.baseLocal=person.position.clone();person.rotation.y=(column-(columns-1)/2)*.18;group.add(person);people.push(person);
  }
  group.userData={crewId:crew.id,people};group.position.copy(crewStagingPoint(crew,state.crews.indexOf(crew)));office.add(group);crewMeshes.set(crew.id,group);return group;
}

function syncEventActors() {
  const effect=state.sceneEffect;
  const effectKey=effect?`${effect.eventId}:${effect.actor}:${effect.actorCount??1}`:'none';
  if(sceneProps.eventActorKey===effectKey)return;
  if(sceneProps.eventActors) {
    for(const actor of sceneProps.eventActors) office.remove(actor);
  }
  sceneProps.eventActors=[];sceneProps.eventActorKey=effectKey;
  if(!effect?.actor)return;
  const count=Math.max(1,Math.min(5,effect.actorCount??1));
  const roleMap={worker:'worker',delivery:'delivery',police:'police',inspector:'inspector',medic:'medic',boss:'boss',client:'client',architect:'architect'};
  const colors={worker:'#e8ad4e',delivery:'#e18a42',police:'#1f4168',inspector:'#48565b',medic:'#e8efeb',boss:'#3c3545',client:'#31495a',architect:'#79525d'};
  for(let i=0;i<count;i++) {
    const role=roleMap[effect.actor]??'inspector';
    const actor=makePerson({role,color:colors[role],skin:['#d6a47d','#b97855','#edc39d','#8f5d43'][i%4],variant:i});actor.userData.eventActor=true;
    actor.position.set(3.65-(i%3)*.48,.03,2.75+Math.floor(i/3)*.45);actor.rotation.y=-2.35+i*.15;office.add(actor);sceneProps.eventActors.push(actor);
  }
}

loadCharacterAssets().catch(error=>console.warn('Rigged characters failed to initialize; lightweight fallback remains active.',error));
loadPropAssets().catch(error=>console.warn('Curated office props failed to initialize; procedural furniture remains active.',error));
makeOffice();
sceneProps.scalableAssets=office.children.filter(child=>![sceneProps.yard,sceneProps.architect,sceneProps.client].includes(child));
sceneProps.scalableAssets.forEach(child=>{child.userData.baseTransform={position:child.position.clone(),scale:child.scale.clone()};});
makeTaskMarkers();
playerMoveMarker=new THREE.Mesh(new THREE.RingGeometry(.2,.34,32),new THREE.MeshBasicMaterial({color:'#ddff55',transparent:true,opacity:.92,side:THREE.DoubleSide,depthWrite:false}));
playerMoveMarker.name='player-move-target';playerMoveMarker.rotation.x=-Math.PI/2;playerMoveMarker.position.y=.045;playerMoveMarker.visible=false;office.add(playerMoveMarker);

function updateCamera(t=0) {
  const scale=footprintScale();const distance=13*Math.max(1,scale*.9);
  const beatTask=state.ambientBeat?.taskId?state.tasks.find(task=>task.id===state.ambientBeat.taskId):null;
  const desiredX=beatTask?siteX(beatTask.x)*.08:0;
  const desiredZ=beatTask?siteZ(beatTask.y)*.08:0;
  cameraFocus.x=THREE.MathUtils.lerp(cameraFocus.x,desiredX,.025);
  cameraFocus.z=THREE.MathUtils.lerp(cameraFocus.z,desiredZ,.025);
  cameraTarget.x=1.6+(scale-1)*2.6+cameraFocus.x;
  cameraTarget.z=cameraFocus.z;
  const drift=Math.sin(t*.18)*.055;
  camera.position.set(cameraTarget.x+Math.cos(cameraAngle)*distance+drift,10+Math.sin(t*.11)*.025,cameraTarget.z+Math.sin(cameraAngle)*distance-drift);
  camera.lookAt(cameraTarget);
  camera.zoom=cameraZoom;
  camera.updateProjectionMatrix();
}
updateCamera();

function syncSceneFromState() {
  if(sceneProps.appliedProfileSeed!==visualProfile.seed) {
    sceneProps.appliedProfileSeed=visualProfile.seed;
    const theme=visualProfile.theme;
    sceneProps.floorTiles.forEach((tile,index)=>{
      tile.userData.baseColor=index%2?theme.floorA:theme.floorB;
      tile.material.color.set(tile.userData.baseColor);
    });
    sceneProps.sofa?.traverse(child=>{if(child.isMesh)child.material.color.set(theme.accent);});
    sceneProps.desks.forEach(desk=>desk.traverse(child=>{if(child.name==='desk-top')child.material.color.set(theme.wood);}));
    const glassVisible=visualProfile.layout.glassMeeting;
    office.children.filter(child=>child.name==='glass-wall').forEach(child=>{child.userData.profileVisible=glassVisible;});
    sceneProps.plants?.forEach((plant,index)=>{plant.userData.profileVisible=index<visualProfile.layout.plants;});
    const scale=footprintScale();
    sceneProps.scalableAssets.forEach(child=>{const base=child.userData.baseTransform;if(!base)return;child.position.set(base.position.x*scale,base.position.y,base.position.z*scale);child.scale.set(base.scale.x*scale,base.scale.y,base.scale.z*scale);});
    sceneProps.yard.position.x=(scale-1)*5.2;updateCamera();
  }

  const siteType=visualProfile.site;
  const taskById=(id)=>state.tasks.find(task=>task.id===id);const progressOf=(task)=>task?.status==='done'||task?.status==='skipped'?1:task?.progress??0;const averageProgress=(ids)=>{const tasks=ids.map(taskById).filter(Boolean);return tasks.length?tasks.reduce((sum,task)=>sum+progressOf(task),0)/tasks.length:0;};
  const moveTask=taskById('move');
  const electricTask=taskById('electric')??taskById('external-networks');
  const prepStage=taskById('partitions')??taskById('prep')??taskById('structure');
  const paintStage=taskById('wall-finish')??taskById('paint');
  const deskTask=state.tasks.find(task=>task.id==='desks');
  const cleanTask=state.tasks.find(task=>task.id==='clean');
  const inspectTask=state.tasks.find(task=>task.id==='inspect');
  const shellStage=taskById('structure')??prepStage;const structureReady=siteType!=='field'||progressOf(shellStage)>.35;
  const foundationProgress=progressOf(taskById('foundations'));const frameProgress=progressOf(taskById('structure'));
  sceneProps.greenfieldFoundation.visible=siteType==='field'&&foundationProgress>.01;sceneProps.greenfieldFoundation.scale.y=Math.max(.02,foundationProgress);
  sceneProps.greenfieldFrame.visible=siteType==='field'&&frameProgress>.01;sceneProps.greenfieldFrame.scale.y=Math.max(.02,frameProgress);
  const furnitureProgress=deskTask?.status==='done'?1:deskTask?.progress??0;
  const fitoutReady=furnitureProgress>.02;
  const structureNames=new Set(['north-wall','west-wall','window','glass-wall','core-left','core-divider','core-front-a','core-front-b','core-front-c','toilet-asset','sink-asset','toilet-sign-a','toilet-sign-b','entry-door','access-control']);
  const fitoutNames=new Set(['meeting-table','chair-asset','pantry-counter','pantry-top','fridge','high-table','storage','printer','sofa-asset','plant-asset','reception','entry-mat']);
  for(const child of office.children) {
    if(structureNames.has(child.name))child.visible=structureReady&&(child.userData.profileVisible??true);
    if(fitoutNames.has(child.name))child.visible=fitoutReady&&(child.userData.profileVisible??true);
  }
  const upgradedFitout=Boolean(sceneProps.kenneyFitout?.userData.ready);
  if(sceneProps.kenneyFitout)sceneProps.kenneyFitout.visible=fitoutReady;
  if(upgradedFitout){sceneProps.sofa.visible=false;sceneProps.plants.forEach(plant=>{plant.visible=false;});}
  for (const task of state.tasks) {
    const group=markerMeshes.get(task.id); if(!group) continue;
    group.visible=task.status!=='done';
    group.children[0].material.opacity=task.status==='locked'?.16:task.status==='active'?.95:.68;
    group.children[1].scale.setScalar(task.status==='active' ? .6 + task.progress*.9 : 1);
    group.children[2].material.opacity=task.status==='locked'?.32:1;
  }
  for(const crew of state.crews){const existing=crewMeshes.get(crew.id);if(existing&&existing.userData.people?.length!==crewHeadcount(state,crew)){if(selectedPerson?.userData?.crewId===crew.id)selectedPerson=null;office.remove(existing);crewMeshes.delete(crew.id);}if(!crewMeshes.has(crew.id))makeCrewMesh(crew);}
  for(const [crewId,mesh] of crewMeshes) {
    const crew=state.crews.find(item=>item.id===crewId);
    mesh.visible=Boolean(crew)&&((crew.unavailableUntil??0)<=state.elapsed);
    mesh.userData.people?.forEach(person=>{person.visible=true;});
  }
  syncEventActors();
  const ambientKind=state.ambientBeat?.kind;
  const ambientBreak=ambientKind==='break';
  sceneProps.smokers.forEach((smoker,index)=>{smoker.visible=state.started&&(index===0||state.smokeBreak||ambientBreak);});
  sceneProps.smokePuffs.forEach(puff=>{puff.visible=state.started&&(state.smokeBreak||ambientBreak||sceneProps.smokers[0]?.visible);});

  const prepTask=prepStage;
  const paintTask=paintStage;

  const demolitionProgress=averageProgress(['move','demo-partitions','demo-equipment','demo-floor','demo-ceiling']);
  sceneProps.legacyInterior.visible=siteType==='existing'&&demolitionProgress<.999;
  sceneProps.legacyInterior.children.forEach((asset,index)=>{
    const removal=THREE.MathUtils.clamp(demolitionProgress*sceneProps.legacyInterior.children.length-index,0,1);
    const remaining=1-removal;const basePosition=asset.userData.legacyBasePosition;const baseScale=asset.userData.legacyBaseScale;
    asset.visible=sceneProps.legacyInterior.visible&&remaining>.015;
    asset.position.set(THREE.MathUtils.lerp(basePosition.x,4.2,removal),basePosition.y,THREE.MathUtils.lerp(basePosition.z,3.15,removal));
    asset.scale.set(baseScale.x*Math.max(.08,remaining),baseScale.y*Math.max(.08,remaining),baseScale.z*Math.max(.08,remaining));
  });

  const prepProgress=progressOf(prepTask);
  const partitionProgress=prepProgress;
  sceneProps.partitions.visible=partitionProgress>.01;
  sceneProps.partitionStuds.visible=partitionProgress>.01&&partitionProgress<.99;
  sceneProps.partitionSegments.forEach((wall,index)=>{
    const raw=THREE.MathUtils.clamp(partitionProgress*sceneProps.partitionSegments.length-index,0,1);
    const fraction=THREE.MathUtils.clamp((raw-.28)/.72,0,1);
    wall.visible=fraction>.01;
    wall.scale.y=Math.max(.025,fraction);wall.position.y=.03+.75*fraction;
  });
  sceneProps.partitionStudMembers.forEach(stud=>{
    const raw=THREE.MathUtils.clamp(partitionProgress*sceneProps.partitionSegments.length-stud.userData.segmentIndex,0,1);
    const fraction=THREE.MathUtils.clamp(raw/.42,0,1);
    stud.visible=fraction>.01&&raw<.98;
    if(!stud.userData.isTrack){stud.scale.y=Math.max(.025,fraction);stud.position.y=.03+.75*fraction;}
  });

  const engineeringProgress=averageProgress(['external-networks','hvac','electric','lowcurrent','fire','plumbing','lighting']);
  sceneProps.engineering.visible=engineeringProgress>.01;
  sceneProps.engineeringSegments.forEach((segment,index)=>{
    const fraction=THREE.MathUtils.clamp(engineeringProgress*sceneProps.engineeringSegments.length-index,0,1);
    segment.scale.x=segment.geometry.parameters?.width>1?Math.max(.02,fraction):1;
    segment.scale.z=segment.geometry.parameters?.depth>1?Math.max(.02,fraction):1;
    segment.visible=fraction>.01;
  });
  const ceilingCount=Math.round(engineeringProgress*sceneProps.ceilingTiles.children.length);
  sceneProps.ceilingTiles.children.forEach((panel,index)=>{panel.visible=index<ceilingCount;panel.position.y=2.32+Math.min(1,engineeringProgress*sceneProps.ceilingTiles.children.length-index)*.2;});

  const finishProgress=averageProgress(['wall-finish','floor-finish','ceiling-finish','paint']);
  sceneProps.finishBands.children.forEach((band,index)=>{const fraction=THREE.MathUtils.clamp(finishProgress*sceneProps.finishBands.children.length-index,0,1);band.visible=fraction>.01;band.scale.y=Math.max(.02,fraction);band.position.y=.04+.73*fraction;band.material.color.set(state.sceneEffect?.wallColor??visualProfile.theme.wall);});
  sceneProps.handover.visible=inspectTask?.status==='done'||(inspectTask?.progress??0)>.65;

  const cratesRemoved=moveTask?.status==='done'?sceneProps.crates.children.length:Math.floor((moveTask?.progress??0)*sceneProps.crates.children.length);
  sceneProps.crates.children.forEach((crate,index)=>{crate.visible=index<sceneProps.crates.children.length-cratesRemoved;});

  const layoutDeskCount=Math.min(sceneProps.desks.length,Math.max(4,Math.round((state.selectedOrder?.area??600)/180)));
  const deskAmount=deskTask?.status==='done'?layoutDeskCount:deskTask?.status==='active'?Math.max(1,Math.ceil(deskTask.progress*layoutDeskCount)):0;
  sceneProps.desks.forEach((desk,index)=>{
    desk.visible=!upgradedFitout&&index<deskAmount;
    if(desk.visible){const build=Math.min(1,Math.max(.18,(deskTask?.progress??1)*sceneProps.desks.length-index));desk.scale.y=build;}
  });
  sceneProps.kenneyStations?.forEach((station,index)=>{station.visible=index<deskAmount;});

  const protectionTask=taskById('protection');const prepStarted=['active','done','awaiting'].includes(prepTask?.status);
  const paintDone=progressOf(paintTask)>=.999;
  sceneProps.protection.visible=protectionTask?['active','done','awaiting'].includes(protectionTask.status)&&!paintDone:prepStarted&&!paintDone;
  sceneProps.paint.visible=['active','awaiting'].includes(paintTask?.status)&&!paintDone;
  const temporaryTask=taskById('temporary-networks');sceneProps.cables.visible=temporaryTask?!['done','skipped'].includes(temporaryTask.status):electricTask?.status!=='done';
  const constructionStarted=state.tasks.some(task=>task.id!=='survey'&&['active','done','awaiting'].includes(task.status));
  const dirtCount=Math.min(sceneProps.debris.children.length,Math.ceil((state.siteDirt??0)/100*sceneProps.debris.children.length));
  sceneProps.debris.visible=constructionStarted&&dirtCount>0;
  sceneProps.debris.children.forEach((item,index)=>{item.visible=sceneProps.debris.visible&&index<dirtCount;});
  const activePhysical=state.tasks.find(task=>task.status==='active'&&!['management','design','documentation'].includes(task.skill));
  const ambientPhysical=['drill','cleanup','power-test'].includes(ambientKind);
  sceneProps.workParticles.forEach(particle=>{particle.visible=Boolean(activePhysical||ambientPhysical);particle.userData.taskId=activePhysical?.id??(ambientKind==='cleanup'?'clean':'electric');});
  const beatTask=state.ambientBeat?.taskId?state.tasks.find(task=>task.id===state.ambientBeat.taskId):null;
  sceneProps.measureTape.visible=ambientKind==='measurement';
  if(sceneProps.measureTape.visible){sceneProps.measureTape.position.set(siteX(beatTask?.x??3.6),.02,siteZ(beatTask?.y??2.5));}
  sceneProps.beacon.visible=ambientKind==='delivery';

  const electricPower=state.sceneEffect?.lightPower??Math.max(progressOf(electricTask),progressOf(taskById('lighting')));
  sceneProps.lights.forEach(light=>{light.intensity=electricPower*1.15;light.userData.fixture.material.emissive?.set('#fff0bc');light.userData.fixture.material.emissiveIntensity=electricPower*1.6;});

  const north=office.children.find(child=>child.name==='north-wall');
  if(north) {
    const wallProgress=paintDone?1:paintTask?.status==='active'?paintTask.progress:prepTask?.status==='done'?.18:0;
    const targetWall=state.sceneEffect?.wallColor??visualProfile.theme.wall;
    north.material.color.lerpColors(new THREE.Color('#e8e3d5'),new THREE.Color(targetWall),state.sceneEffect?.wallColor?1:wallProgress);
  }
  const cleanProgress=cleanTask?.status==='done'?1:cleanTask?.progress??0;
  sceneProps.floorTiles.forEach(tile=>{
    if(siteType==='field'&&!structureReady)tile.material.color.lerpColors(new THREE.Color(indexedFieldColor(tile)),new THREE.Color(tile.userData.baseColor),(prepStage?.progress??0)*.5);
    else tile.material.color.lerpColors(new THREE.Color(tile.userData.baseColor),new THREE.Color('#e4dec9'),cleanProgress*.55);
    tile.material.roughness=.72-cleanProgress*.25;
  });

  sceneProps.architect.visible=state.started;
  sceneProps.client.visible=state.started&&(state.elapsed>10||['inspection','briefing'].includes(ambientKind)||['ready','active','done'].includes(inspectTask?.status));
  if(state.sceneEffect?.debris) {
    const visibleCount=Math.min(sceneProps.debris.children.length,Math.max(0,state.sceneEffect.debris));
    sceneProps.debris.visible=visibleCount>0;sceneProps.debris.children.forEach((item,index)=>{item.visible=index<Math.max(dirtCount,visibleCount);});
  }
}

function indexedFieldColor(tile) {
  const index=sceneProps.floorTiles.indexOf(tile);
  return index%3===0?'#758060':index%3===1?'#667252':'#75684d';
}

function animateScene(now) {
  const frameDelta=Math.min(.05,Math.max(0,(now-lastCharacterFrame)/1000));lastCharacterFrame=now;
  if(!state.paused)sceneAnimationTime+=frameDelta;
  const t=sceneAnimationTime;
  const characterDelta=state.paused?0:frameDelta;
  if(characterDelta)office.traverse(node=>{node.userData?.characterMixer?.update(characterDelta);});
  const beat=state.ambientBeat;
  const beatKind=beat?.kind;
  const dayProgress=THREE.MathUtils.clamp((state.elapsed%24)/9,0,1);
  scene.background.copy(morningSky).lerp(eveningSky,dayProgress);
  scene.fog.color.copy(scene.background);
  sun.color.copy(morningSun).lerp(eveningSun,dayProgress);
  sun.intensity=3.2-dayProgress*.65;
  fill.intensity=8+dayProgress*1.4;
  for(const task of state.tasks) {
    const marker=markerMeshes.get(task.id); if(!marker||!marker.visible) continue;
    marker.children[0].rotation.z=t*(task.status==='active'?1.3:.35);
    marker.children[2].position.y=1.15+Math.sin(t*2+task.x)*.05;
  }
  for(const [crewIndex,crew] of state.crews.entries()) {
    const mesh=crewMeshes.get(crew.id); if(!mesh) continue;
    const inBeat=beat?.crewId===crew.id;
    const groupMoment=inBeat&&['argument','briefing','inspection'].includes(beatKind);
    const sceneRunning=state.started&&!state.paused;
    const isPlayerCrew=crew.id==='foreman';
    const manualPlayerMove=isPlayerCrew&&Boolean(playerMoveTarget);
    const smoking=!isPlayerCrew&&sceneRunning&&crewTakesBreak(crew,t);
    const maintenance=!isPlayerCrew&&crew.skill==='cleaning'&&!crew.taskId&&(state.siteDirt??0)>3&&!smoking;
    const activeWork=Boolean(crew.taskId)&&!smoking;
    const baseTarget=manualPlayerMove?playerMoveTarget.clone():isPlayerCrew?mesh.position.clone():smoking?crewSmokePoint(crew,crewIndex):maintenance?crewCleaningPoint(crew,crewIndex):activeWork?crewWorkPoint(crew,crewIndex):crewStagingPoint(crew,crewIndex);
    const routeKey=manualPlayerMove?`player:${baseTarget.x.toFixed(2)}:${baseTarget.z.toFixed(2)}`:smoking?'smoke':maintenance?`clean:${Math.floor(t/9)}`:activeWork?`work:${crew.taskId}`:'idle';
    const target=isPlayerCrew&&!manualPlayerMove?baseTarget:routedCrewWaypoint(mesh,baseTarget,routeKey,crew,smoking);
    const delta=target.clone().sub(mesh.position);
    const siteWalking=sceneRunning&&!groupMoment&&delta.lengthSq()>.018;
    if(siteWalking)mesh.rotation.y=THREE.MathUtils.lerp(mesh.rotation.y,Math.atan2(delta.x,delta.z),.12);
    if(siteWalking){
      const direction=delta.normalize();if(!isPlayerCrew)direction.add(crewSeparation(mesh).multiplyScalar(.72)).normalize();
      const speed=manualPlayerMove?2.35:.8+crewDiscipline(crew)*.85;mesh.position.addScaledVector(direction,Math.min(mesh.position.distanceTo(target),characterDelta*speed));mesh.position.y=.03;
    }
    crew.visualBehavior=siteWalking?(smoking?'to-smoke':maintenance?'to-clean':activeWork?'to-work':'moving'):smoking?'smoking':maintenance?'cleaning':activeWork?'working':'idle';
    if(manualPlayerMove&&sceneRunning&&mesh.position.distanceTo(playerMoveTarget)<.08){
      mesh.position.copy(playerMoveTarget);playerMoveTarget=null;state.playerZoneTaskId=playerMoveZoneTaskId;playerMoveZoneTaskId=null;playerMoveMarker.visible=false;
      crew.state=state.playerZoneTaskId?'supervising':'idle';renderSelection();persistGame();showToast(state.playerZoneTaskId?'Вы на месте. Этот фронт теперь под личным присмотром.':'Вы на месте. Здесь особенно хорошо видно, кто не работает.','done');
    }
    if(siteWalking||activeWork||maintenance||groupMoment||smoking) {
      mesh.position.y=.03+Math.abs(Math.sin(t*7.4+crew.x))*(siteWalking?.038:.012);
      for(const [index,person] of mesh.userData.people.entries()) {
        const physical=['moving','demolition','construction','engineering','paint','electric','furniture','cleaning'].includes(crew.skill)&&(activeWork||maintenance)&&!groupMoment;
        const transporting=['moving','furniture'].includes(crew.skill)&&physical;
        const deliveryCycle=(t*.105+crewIndex*.17)%1;
        const travel=transporting&&index===0?(deliveryCycle<.42?THREE.MathUtils.smoothstep(deliveryCycle,0,.42):deliveryCycle<.56?1:THREE.MathUtils.smoothstep(1-deliveryCycle,0,.44)):0;
        const base=person.userData.baseLocal;
        const yardDx=(6.25+(footprintScale()-1)*5.2)-mesh.position.x;const yardDz=1.2-mesh.position.z;const crewCos=Math.cos(mesh.rotation.y);const crewSin=Math.sin(mesh.rotation.y);
        const yardX=crewCos*yardDx-crewSin*yardDz;const yardZ=crewSin*yardDx+crewCos*yardDz;
        person.position.x=THREE.MathUtils.lerp(base.x+Math.sin(t*1.65+index)*.1,yardX,travel);person.position.z=THREE.MathUtils.lerp(base.z+Math.cos(t*1.35+index)*.12,yardZ,travel);
        const walking=(travel>.03&&travel<.97)||(siteWalking&&travel<.03);const swing=Math.sin(t*(walking?11.4:6.8)+index)*(.3+(walking?.48:.08));
        const workBeat=(activeWork||maintenance)?Math.sin(t*4.6+index):0;
        person.userData.leftLeg.rotation.x=swing; person.userData.rightLeg.rotation.x=-swing;
        const argumentMotion=inBeat&&beatKind==='argument'?Math.sin(t*7.4+index)*.72:0;
        const briefingPose=inBeat&&beatKind==='briefing'?(index%2?-.25:.3):0;
        const paintMotion=crew.skill==='paint'&&!walking?workBeat*1.02:0;const cleaningMotion=crew.skill==='cleaning'&&!walking?workBeat*.92:0;const drillMotion=(['electric','engineering','construction','demolition'].includes(crew.skill)||beatKind==='drill')&&!walking?Math.sin(t*21+index)*.62:0;const carryPose=walking&&physical?-.86:0;
        person.userData.leftArm.rotation.x=-swing*.55+paintMotion+cleaningMotion+carryPose;person.userData.rightArm.rotation.x=swing*.55+drillMotion-cleaningMotion+(crew.skill==='furniture'&&!walking?-.55:carryPose);
        person.userData.leftArm.rotation.z=argumentMotion+briefingPose;
        person.userData.rightArm.rotation.z=-argumentMotion-briefingPose;
        person.rotation.y=travel>.03?Math.atan2(yardX-base.x,yardZ-base.z)+(deliveryCycle>.56?Math.PI:0):siteWalking?0:groupMoment?(index%2?-.9:.9):Math.sin(t*.55+index)*.32;
        person.userData.bubble.visible=!walking&&(smoking?index===0:groupMoment||Math.sin(t*.9+index*2.1+crew.x)>.78);
        setPersonMotion(person,walking?(physical?'carry':'walk'):groupMoment&&beatKind==='argument'?'argue':physical?'work':'idle');
      }
    } else {
      mesh.position.y=.03;
      for(const person of mesh.userData.people) {
        const idleShift=Math.sin(t*2.1+(person.userData.variant??0));
        person.position.y=(person.userData.baseLocal?.y??0)+Math.abs(idleShift)*.018;
        person.userData.leftLeg.rotation.x=idleShift*.06;person.userData.rightLeg.rotation.x=-idleShift*.06;
        person.userData.leftArm.rotation.x=Math.sin(t*1.7+crew.x)*.13;person.userData.rightArm.rotation.x=-Math.sin(t*1.7+crew.x)*.13;
        person.rotation.y=Math.sin(t*.22+(person.userData.variant??0))*.32;person.userData.bubble.visible=Math.sin(t*.42+(person.userData.variant??0)*2.4)>.9;
        setPersonMotion(person,'idle');
      }
    }
    const hasQuestion=(state.activeSituations??[]).some(item=>item.crewId===crew.id);
    mesh.userData.people.forEach((person,index)=>{person.userData.alertBubble.visible=hasQuestion&&index===0;if(hasQuestion)person.userData.bubble.visible=false;person.userData.selectionRing.visible=person===selectedPerson;});
  }
  if(playerMoveMarker?.visible){const pulse=1+Math.sin(t*5.5)*.13;playerMoveMarker.scale.setScalar(pulse);playerMoveMarker.material.opacity=.72+Math.sin(t*5.5)*.2;}

  const activeTask=state.tasks.find(task=>task.status==='active'&&!['management','design','documentation'].includes(task.skill));
  const particleTask=activeTask??(beatKind==='cleanup'?state.tasks.find(task=>task.id==='clean'):['drill','power-test'].includes(beatKind)?state.tasks.find(task=>task.id==='electric'):null);
  for(const [index,particle] of sceneProps.workParticles.entries()) {
    if(!particle.visible||!particleTask)continue;
    const electric=particleTask.id==='electric';
    const cycle=(t*(electric?2.8:.72)+index*.113)%1;
    particle.position.set(siteX(particleTask.x)+Math.sin(index*2.4)*(.2+cycle*.45),.12+cycle*(electric?.55:1.15),siteZ(particleTask.y)+Math.cos(index*1.7)*(.18+cycle*.38));
    particle.material.color.set(electric?'#75cfff':'#c4b59d');
    particle.material.opacity=(1-cycle)*(electric?.95:.38);particle.scale.setScalar(electric?.55+cycle:1+cycle*1.6);
  }

  if(sceneProps.workLight){
    const focusTask=particleTask??(beat?.taskId?state.tasks.find(task=>task.id===beat.taskId):null);
    if(focusTask){sceneProps.workLight.position.set(siteX(focusTask.x),1.45,siteZ(focusTask.y));sceneProps.workLight.intensity=.65+Math.sin(t*8)*.12+(beatKind==='power-test'?1.25:0);}
    else sceneProps.workLight.intensity=0;
  }
  if(beatKind==='power-test') {
    sceneProps.lights.forEach((light,index)=>{
      const pulse=.45+Math.abs(Math.sin(t*(9.5+index*.7)+index*1.9))*.75;
      light.intensity=Math.max(light.intensity,pulse);
      light.userData.fixture.material.emissiveIntensity=pulse*1.35;
    });
  }

  if(sceneProps.architect?.visible) {
    sceneProps.architect.position.x=-1.25+Math.sin(t*(beatKind==='inspection'?.62:.28))*(beatKind==='inspection'?.72:.32);
    sceneProps.architect.rotation.y=.65+Math.sin(t*.21)*.22;
    sceneProps.architect.userData.rightArm.rotation.x=Math.sin(t*1.3)*.18;
    setPersonMotion(sceneProps.architect,beatKind==='inspection'?'walk':'idle');
  }
  if(sceneProps.client?.visible) {
    sceneProps.client.position.z=2.25+Math.sin(t*.22)*.28;
    sceneProps.client.rotation.y=-2.35+Math.sin(t*.19)*.18;
    sceneProps.client.userData.leftArm.rotation.x=Math.sin(t*(beatKind==='inspection'?2.2:.9))*(beatKind==='inspection'?.28:.12);
    sceneProps.client.userData.bubble.visible=beatKind==='inspection'||beatKind==='briefing';
    setPersonMotion(sceneProps.client,beatKind==='inspection'?'walk':'idle');
  }
  for(const [index,actor] of (sceneProps.eventActors??[]).entries()) {
    actor.position.y=.03+Math.abs(Math.sin(t*2.2+index))*.025;
    actor.userData.leftArm.rotation.x=Math.sin(t*1.4+index)*.1;
    actor.userData.rightArm.rotation.x=-Math.sin(t*1.4+index)*.1;
    actor.userData.bubble.visible=Math.sin(t*.75+index*1.8)>.62;
    setPersonMotion(actor,index%2?'idle':'walk');
  }
  if(sceneProps.truck) {
    const truckCycle=(t*.09)%1;
    if(beatKind==='delivery')sceneProps.truck.position.z=2.72;
    else if(truckCycle<.34)sceneProps.truck.position.z=THREE.MathUtils.lerp(5.25,2.72,THREE.MathUtils.smoothstep(truckCycle,0,.34));
    else if(truckCycle<.58)sceneProps.truck.position.z=2.72;
    else sceneProps.truck.position.z=THREE.MathUtils.lerp(2.72,-5.35,THREE.MathUtils.smoothstep(truckCycle,.58,1));
    sceneProps.truck.rotation.y=Math.PI;
    sceneProps.truck.userData.wheels.forEach(wheel=>{wheel.rotation.x=-t*7.5;});
    const doorOpen=Math.abs(sceneProps.truck.position.z-2.72)<.72||sceneProps.client?.visible;
    sceneProps.entryDoor.rotation.y=THREE.MathUtils.lerp(sceneProps.entryDoor.rotation.y,doorOpen?-1.12:0,.06);
  }
  if(sceneProps.serviceVan) {
    const vanCycle=(t*.075+.46)%1;
    sceneProps.serviceVan.position.z=THREE.MathUtils.lerp(-5.15,5.15,vanCycle);
    sceneProps.serviceVan.rotation.y=0;
    sceneProps.serviceVan.userData.wheels.forEach(wheel=>{wheel.rotation.x=t*8.2;});
  }
  if(sceneProps.beacon?.visible){sceneProps.beacon.rotation.y=t*4.8;sceneProps.beacon.userData.lamp.material.emissiveIntensity=1.4+Math.sin(t*12)*.8;}
  if(sceneProps.measureTape?.visible){sceneProps.measureTape.rotation.y=Math.sin(t*.55)*.18;sceneProps.measureTape.scale.x=.82+Math.sin(t*1.8)*.16;}
  for(const [index,smoker] of sceneProps.smokers.entries()) {
    if(!smoker.visible)continue;
    smoker.position.y=.02+Math.sin(t*1.4+index)*.012;
    smoker.userData.leftArm.rotation.x=-.6+Math.sin(t*2+index)*.18;
    smoker.userData.bubble.visible=Math.sin(t*.55+index*2)>.72;
    setPersonMotion(smoker,'idle');
  }
  for(const [index,puff] of sceneProps.smokePuffs.entries()) {
    if(!puff.visible)continue;
    const cycle=(t*.22+index*.17)%1;
    puff.position.y=.9+cycle*1.15;puff.position.x=6.15+(index%3)*.48+Math.sin(t+index)*.08;
    puff.material.opacity=(1-cycle)*.24;
  }
  office.traverse(node=>{if(node.userData?.isPerson&&node.userData.selectionRing){node.userData.selectionRing.visible=node===selectedPerson;if(node.userData.playerAura){const pulse=1+Math.sin(t*3.6)*.09;node.userData.playerAura.scale.setScalar(pulse);node.userData.playerAura.rotation.z=t*.4;}if(node.userData.playerBadge)node.userData.playerBadge.material.opacity=.9+Math.sin(t*2.4)*.08;if(node.userData.playerMarker){node.userData.playerMarker.position.y=2.34+Math.sin(t*3.4)*.09;node.userData.playerMarker.rotation.y=t*1.7;}}});
  updateEncounterDialogue(t);
}

function resizeRenderer() {
  const stage=refs.canvas.parentElement;
  const width=Math.floor(stage.clientWidth), height=Math.floor(stage.clientHeight);
  if(!width||!height) return;
  renderer.setSize(width,height,false);
  const aspect=width/height;
  const view=7.2*Math.max(1,footprintScale()*.9);
  camera.left=-view*aspect; camera.right=view*aspect; camera.top=view; camera.bottom=-view;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize',resizeRenderer); resizeRenderer();

let drag={active:false,x:0,moved:0,angle:cameraAngle};
refs.canvas.addEventListener('pointerdown',(event)=>{drag={active:true,x:event.clientX,moved:0,angle:cameraAngle}; refs.canvas.setPointerCapture(event.pointerId);});
refs.canvas.addEventListener('pointermove',(event)=>{if(!drag.active)return; const dx=event.clientX-drag.x; drag.moved=Math.max(drag.moved,Math.abs(dx)); cameraAngle=drag.angle-dx*.006; updateCamera();});
refs.canvas.addEventListener('pointerup',(event)=>{
  drag.active=false;
  if(drag.moved>5)return;
  const rect=refs.canvas.getBoundingClientRect(); mouse.x=((event.clientX-rect.left)/rect.width)*2-1; mouse.y=-((event.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(mouse,camera);
  const hits=raycaster.intersectObject(office,true);
  let personHit=null;
  for(const hit of hits){let node=hit.object;while(node&&node!==office){if(node.userData?.isPerson){personHit=node;break;}node=node.parent;}if(personHit)break;}
  if(personHit){const question=(state.activeSituations??[]).find(item=>item.crewId===personHit.userData.crewId);if(question){showSituation(question);return;}selectedPerson=personHit;state.selectedTaskId=null;renderTasks();renderSelection();return;}
  let taskId=null;
  for(const hit of hits){let node=hit.object;while(node&&node!==office){if(node.userData?.taskId){taskId=node.userData.taskId;break;}node=node.parent;}if(taskId)break;}
  if(taskId){selectedPerson=null;state.selectedTaskId=taskId;renderTasks();renderSelection();return;}
  const floorHit=hits.find(hit=>['floor-tile','yard-slab','slab'].includes(hit.object.name));
  const navigationPoint=floorHit?.point.clone()??raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.03),new THREE.Vector3());
  if(navigationPoint&&selectedPerson?.userData?.role==='player'){
    const scale=footprintScale();const yardShift=(scale-1)*5.2;
    const destination=navigationPoint.clone();destination.set(Math.max(-5.05*scale,Math.min(10.05+yardShift,destination.x)),.03,Math.max(-4.05*scale,Math.min(4.05*scale,destination.z)));
    const player=state.crews.find(item=>item.id==='foreman');
    if(!player)return;
    playerMoveTarget=destination;player.state='moving';
    player.x=destination.x/(unit*footprintScale())+4;player.y=destination.z/(unit*footprintScale())+3.4;
    const nearbyTask=state.tasks.filter(task=>!['done','locked'].includes(task.status)).map(task=>({task,distance:destination.distanceTo(new THREE.Vector3(siteX(task.x),.03,siteZ(task.y)))})).sort((a,b)=>a.distance-b.distance)[0];
    playerMoveZoneTaskId=nearbyTask&&nearbyTask.distance<unit*footprintScale()*1.3?nearbyTask.task.id:null;
    state.playerZoneTaskId=null;playerMoveMarker.position.copy(destination);playerMoveMarker.visible=true;state.selectedTaskId=null;
    renderTasks();renderSelection();persistGame();feedback('message');showToast('Маршрут принят. Генеральный директор наконец идёт туда, куда нажали.','done');
  }
});
refs.canvas.addEventListener('wheel',(event)=>{event.preventDefault();cameraZoom=Math.max(.72,Math.min(1.65,cameraZoom-event.deltaY*.0007));updateCamera();},{passive:false});

function openEvent(eventId) {
  const event=EVENT_COPY[eventId]; if(!event)return;
  eventShowing=eventId; state.paused=true;
  $('#eventKicker').textContent=event.kicker; $('#eventTitle').textContent=event.title; $('#eventText').textContent=event.text;
  $('#eventOptions').innerHTML=event.options.map(option=>`<button class="event-option" data-event-choice="${option.id}"><strong>${option.title}</strong><span>${option.effect}</span><small>${option.note}</small></button>`).join('');
  refs.event.classList.add('visible');
}

function deltaText(deltas){return [['budget','тыс. ₽'],['deadline','ч к сроку'],['time','ч'],['quality','качество'],['trust','доверие']].filter(([key])=>deltas[key]).map(([key,label])=>`${deltas[key]>0?'+':''}${deltas[key]} ${label}`).join(' · ')||'без прямых затрат';}
function showSituation(active){
  const template=situationById.get(active.templateId);if(!template)return;
  if(!openSituationId)situationWasPaused=state.paused;openSituationId=active.uid;state.paused=true;$('#situationTitle').textContent=template.title;$('#situationText').textContent=template.text;
  $('#situationOptions').innerHTML=template.choices.map(choice=>`<button class="event-option" data-situation-choice="${choice.id}"><strong>${choice.title}</strong><span>${deltaText(choice.deltas)}</span><small>${choice===template.choices[0]?'Разобраться сейчас и оставить след в документах.':'Быстрое решение, которое удобно исполнителю.'}</small></button>`).join('');refs.situation.classList.add('visible');
}

function focusSituation(active){
  const crew=state.crews.find(item=>item.id===active.crewId);const mesh=crewMeshes.get(active.crewId);
  if(mesh){cameraFocus.set(mesh.position.x-1.6,0,mesh.position.z);cameraZoom=Math.max(cameraZoom,1.24);updateCamera();selectedPerson=mesh.userData.people?.[0]??null;}
  else if(crew){cameraFocus.set(siteX(crew.x)-1.6,0,siteZ(crew.y));cameraZoom=Math.max(cameraZoom,1.18);updateCamera();}
  showSituation(active);
}

function showResult() {
  if(resultShown)return; resultShown=true;
  const result=getResult(state); const onTime=result.late<=0;
  const settlement=state.projectSettlement??{profit:state.budget,debtPayment:0};
  $('#resultSeal').textContent=result.grade;
  $('#resultTitle').textContent=result.grade==='D'?'Офис открыт. Технически.':'Офис принят';
  $('#resultText').textContent=onTime?'В понедельник сотрудники нашли столы, розетки и даже стены одного цвета. Для fit-out это почти чудо.':`Открылись с опозданием на ${Math.ceil(result.late)} ч. Заказчик называет это «поэтапным вводом», и мы не спорим.`;
  $('#resultStats').innerHTML=`<div><small>ПРИБЫЛЬ / УБЫТОК</small><strong>${settlement.profit>=0?'+':''}${money(settlement.profit)}</strong></div><div><small>ОПЫТ ОРГАНИЗАЦИИ</small><strong>+${settlement.gainedXp??0} XP · ур. ${settlement.playerLevel??ensureOrganization(state).playerLevel}</strong></div><div><small>КАЧЕСТВО</small><strong>${Math.round(state.quality)}</strong></div><div><small>ДОВЕРИЕ</small><strong>${Math.round(state.trust)}%</strong></div><div><small>ПОГАШЕНО ДОЛГА</small><strong>${money(settlement.debtPayment??0)}</strong></div>
    <div class="hq-card"><small>ВАШ СОБСТВЕННЫЙ ОФИС · УРОВЕНЬ ${state.hq?.level ?? 0}</small><strong>${state.hq?.title ?? 'Стол у принтера'}</strong><small id="hqFailure">${state.hq?.lastFailure ?? 'Клиентам строим лучше, чем себе.'}</small><button class="secondary-button" id="upgradeHq">Вложить прибыль в штаб (сомнительно)</button></div>`;
  refs.result.classList.add('visible'); persistGame();
  $('#upgradeHq').addEventListener('click',()=>{
    const outcome=startHeadquartersProject(state);
    $('#hqFailure').textContent=outcome.ok?'Внутренний проект запущен. Теперь штаб улучшается по дням, с платежами и перерасходом.':'Штаб уже строится или в кассе нет аванса.';
    $('#upgradeHq').textContent=outcome.ok?'Открыть штаб и следить за ремонтом':'Сначала разобраться с текущим ремонтом';
    persistGame();
  });
}

document.addEventListener('click',(event)=>{
  ensureAudio();
  const companyTabButton=event.target.closest('[data-company-tab]');
  if(companyTabButton){companyTab=companyTabButton.dataset.companyTab;renderCompanyConsole();return;}
  const openProject=event.target.closest('[data-open-project]');
  if(openProject){const result=activatePortfolioProject(state,openProject.dataset.openProject);if(result.ok){saved=state;visualProfile=createVisualProfile(state.visualSeed??1,state.selectedOrder);renderedLogLength=state.log?.length??0;resultShown=false;selectedPerson=null;clearCrewMeshes();ensureRuntimeCrews(state);unlockTasks(state);rebuildTaskMarkers();renderMainMenu();refs.menu.classList.remove('visible');resumePlayerGame();persistGame();showToast(`Открыт объект: ${state.selectedOrder?.title}. Остальные продолжают жить в фоне.`,'done');}return;}
  const addOrderButton=event.target.closest('[data-add-portfolio-order]');
  if(addOrderButton){const order=orders.find(item=>item.id===addOrderButton.dataset.addPortfolioOrder);if(!order)return;const projectState=createInitialState(Math.random,allRandomEvents);projectState.company={...state.company,loans:[...(state.company.loans??[])],ledger:[...(state.company.ledger??[])],obligations:[...(state.company.obligations??[])]};projectState.organization=projectState.company;projectState.hq=state.hq;projectState.playerAvatar=state.playerAvatar;if(!selectOrder(projectState,order)){showToast('Компания пока не тянет мобилизацию этого объекта. Банк уже открыл вкладку с кредитами.','risk');return;}state.company.cash=projectState.company.cash;state.organization=state.company;projectState.phase='preparation';const added=addPortfolioProject(state,projectState,'supervised');if(!added.ok){showToast(added.reason==='limit'?'Три объекта — предел текущего штаба. Четвёртый пока существует только в обещаниях.':'Этот объект уже лежит в портфеле.','risk');return;}companyTab='portfolio';renderMainMenu();persistGame();showToast(`«${order.title}» добавлен в портфель. Аванс есть, свободных людей — как получится.`,'done');return;}
  const assignButton=event.target.closest('[data-assign-employee]');
  if(assignButton){const select=document.querySelector(`[data-staff-project="${CSS.escape(assignButton.dataset.assignEmployee)}"]`);const projectId=select?.value;if(!projectId){const employee=state.staff.employees.find(item=>item.id===assignButton.dataset.assignEmployee);if(employee?.assignedProjectId){const old=state.portfolio.projects.find(item=>item.id===employee.assignedProjectId);if(old)old.staffIds=(old.staffIds??[]).filter(id=>id!==employee.id);employee.assignedProjectId=null;}renderCompanyConsole();persistGame();return;}const result=assignEmployee(state,assignButton.dataset.assignEmployee,projectId);if(result.ok){renderCompanyConsole();persistGame();showToast(`${result.employee.name} закреплён за «${result.project.summary.title}». В другом месте сегодня его нет.`,'done');}return;}
  const transferButton=event.target.closest('[data-transfer-employee]');
  if(transferButton){const select=document.querySelector(`[data-staff-project="${CSS.escape(transferButton.dataset.transferEmployee)}"]`);const result=emergencyTransferEmployee(state,transferButton.dataset.transferEmployee,select?.value);if(result.ok){renderCompanyConsole();persistGame();showToast(`Экстренная переброска: −${result.lostHours} часа и +15 стресса. Телепортацию бухгалтерия не согласовала.`,'risk');}else showToast(result.reason==='already-transferred'?'Сегодня этого человека уже перебрасывали. Он физически конечен.':'Выберите другой объект.','risk');return;}
  const hireStaffButton=event.target.closest('[data-hire-employee]');
  if(hireStaffButton){const result=hireEmployee(state,hireStaffButton.dataset.hireEmployee);if(result.ok){renderMainMenu();persistGame();showToast(`${result.employee.name} принят(а) в штат. ФОТ стал серьёзнее, компания — чуть менее одинокой.`,'done');}else showToast('Не хватает денег даже на выход сотрудника. Собеседование прошло особенно честно.','risk');return;}
  const dismissStaffButton=event.target.closest('[data-dismiss-employee]');
  if(dismissStaffButton){const result=dismissEmployee(state,dismissStaffButton.dataset.dismissEmployee);if(result.ok){renderMainMenu();persistGame();showToast(`${result.employee.name} уволен(а). Память компании уменьшилась сразу.`,'risk');}else showToast('Не хватает денег на расчёт при увольнении. Даже расстаться дорого.','risk');return;}
  const outsourceButton=event.target.closest('[data-outsource-role]');
  if(outsourceButton){const result=toggleOutsourcedRole(state,outsourceButton.dataset.outsourceRole);if(result.ok){renderCompanyConsole();persistGame();showToast(result.active?'Функция выведена на аутсорс. Ответ обещали в течение SLA.':'Функция возвращена внутрь компании. Теперь нужен живой человек.');}return;}
  const payButton=event.target.closest('[data-pay-obligation]');
  if(payButton){const result=settleObligation(state,payButton.dataset.payObligation);if(result.ok){renderMainMenu();persistGame();feedback('cash');showToast(`Оплачено ${money(result.amount)}. Контрагент снова отвечает без многоточий.`,'done');}else showToast(`В кассе не хватает ${money(result.needed??0)}.`,'risk');return;}
  const reserveButton=event.target.closest('[data-reserve]');
  if(reserveButton){const amount=Number(reserveButton.dataset.reserve);if(amount>0&&state.company.cash<amount){showToast('В резерв нечего откладывать. Он пока состоит из намерений.','risk');return;}postLedgerEntry(state,{type:amount>0?'reserve-in':'reserve-out',category:'Резерв',amount:Math.abs(amount),text:amount>0?'Отчисление в финансовую подушку':'Использование финансовой подушки'});renderMainMenu();persistGame();return;}
  const hqProjectButton=event.target.closest('[data-start-hq-project]');
  if(hqProjectButton){const result=startHeadquartersProject(state);if(result.ok){hqPreviewKey='';renderMainMenu();persistGame();showToast('Свой офис официально стал ещё одним объектом. Наконец-то проблемы дома.','done');}else showToast(result.reason==='active'?'Штаб уже ремонтируется. Вторая бригада только увеличит число коробок.':'Не хватает аванса на ремонт собственного офиса. Символично.','risk');return;}
  const materialButton=event.target.closest('[data-order-materials]');
  if(materialButton){const project=state.portfolio.projects.find(item=>item.id===materialButton.dataset.orderMaterials);const taskIds=(project?.snapshot.tasks??[]).filter(task=>!['done','skipped'].includes(task.status)).slice(0,3).map(task=>task.id);const result=createMaterialOrder(state,materialButton.dataset.orderMaterials,{title:`Комплект для ${project?.summary.title??'объекта'}`,taskIds,amount:45+taskIds.length*12,leadDays:2,paymentTermsDays:3,certificates:true});if(result.ok){renderMainMenu();persistGame();showToast(`Материалы заказаны. Поставка через ${result.order.deliveryDay-state.companyCalendar.day} дня, оплата чуть позже — так рождается кредиторка.`,'done');}return;}
  const createChangeButton=event.target.closest('[data-create-change]');
  if(createChangeButton){const result=createChangeOrder(state,createChangeButton.dataset.createChange);if(result.ok){renderMainMenu();persistGame();showToast(result.change.description,'risk');}return;}
  const resolveChangeButton=event.target.closest('[data-resolve-change]');
  if(resolveChangeButton){const [projectId,changeId,strategy]=resolveChangeButton.dataset.resolveChange.split(':');const result=resolveChangeOrder(state,projectId,changeId,strategy);if(result.ok){renderMainMenu();persistGame();showToast(result.approved?'Изменение согласовано с деньгами и сроком. Почти фантастика.':'Изменение принято в работу. Кто платит — сюжет следующей серии.',result.approved?'done':'risk');}return;}
  const closeSelection=event.target.closest('[data-close-selection]');
  if(closeSelection){selectedPerson=null;state.selectedTaskId=null;renderSelection();return;}
  const avatarControl=event.target.closest('[data-avatar-color],[data-avatar-outfit],[data-avatar-helmet]');
  if(avatarControl){state.playerAvatar??={color:'#ddff55',outfit:'vest',helmet:'classic'};if(avatarControl.dataset.avatarColor)state.playerAvatar.color=avatarControl.dataset.avatarColor;if(avatarControl.dataset.avatarOutfit)state.playerAvatar.outfit=avatarControl.dataset.avatarOutfit;if(avatarControl.dataset.avatarHelmet)state.playerAvatar.helmet=avatarControl.dataset.avatarHelmet;const playerMesh=crewMeshes.get('foreman');if(playerMesh){office.remove(playerMesh);crewMeshes.delete('foreman');}selectedPerson=null;hqPreviewKey='';renderMainMenu();syncSceneFromState();persistGame();showToast('Аватар обновлён. Каска по-прежнему не заменяет решение.','done');return;}
  const playerZone=event.target.closest('[data-player-zone]');
  if(playerZone){const task=state.tasks.find(item=>item.id===playerZone.dataset.playerZone);const player=state.crews.find(item=>item.id==='foreman');if(task&&player){playerMoveTarget=null;playerMoveZoneTaskId=null;playerMoveMarker.visible=false;state.playerZoneTaskId=task.id;player.x=task.x;player.y=task.y;player.state='supervising';const mesh=crewMeshes.get(player.id);if(mesh){mesh.position.set(siteX(player.x),.03,siteZ(player.y));selectedPerson=mesh.userData.people?.[0]??null;}renderSelection();persistGame();feedback('message');showToast(`Вы перешли в зону «${task.short}». Пока вы рядом, темп +18%.`,'done');}return;}
  const loanButton=event.target.closest('[data-loan]');
  if(loanButton){const loan=takeOrganizationLoan(state,Number(loanButton.dataset.loan),loanButton.dataset.loanRecipient??'auto');if(loan.ok){renderMainMenu();if(refs.market.classList.contains('visible'))renderPreparation();if(refs.finance.classList.contains('visible'))renderFinanceBook();renderHud();persistGame();feedback('cash');showToast(`Кредит ${money(loan.principal)} поступил ${loan.recipient==='project'?'на счёт объекта':'в кассу организации'}. Платёж ${money(loan.monthlyPayment)} каждый месяц.`,'risk');}else showToast('Кредитный комитет уже нервничает. Лимит исчерпан.','risk');}
  if(event.target.closest('[data-edit-evening-schedule]')){refs.report.classList.remove('visible');eveningEditing=true;openMasterSchedule();}
  if(event.target.closest('[data-open-evening-team]')){renderTeamBook();refs.team.classList.add('visible');}
  const scheduleRoute=event.target.closest('[data-schedule-route]');
  if(scheduleRoute){selectedScheduleRoute=scheduleRoute.dataset.scheduleRoute;renderEveningScheduleDecision();}
  const orderPin=event.target.closest('[data-order-id]');
  if(orderPin){selectedOrderId=orderPin.dataset.orderId;renderOrders();}
  const contractCard=event.target.closest('[data-contract-card]');
  if(contractCard){const card=CONTRACT_CARDS.find(item=>item.id===contractCard.dataset.contractCard);if(applyContractCard(state,card)){renderNegotiation();renderHud();}}
  const teamHire=event.target.closest('[data-team-hire]');
  if(teamHire){const result=hireTeamMember(state,teamHire.dataset.teamHire);if(result.ok){state.preparationConfirmed=false;renderPreparation();renderAll();feedback('cash');showToast(`${result.member.name}: теперь у проекта есть ${result.member.role.toLowerCase()}.`,'done');}else if(result.reason==='budget')showToast('Не хватило ни аванса, ни денег компании. Бухгалтерия редкий раз единодушна.','risk');}
  const teamUnhire=event.target.closest('[data-team-unhire]');if(teamUnhire){const result=unhireTeamMember(state,teamUnhire.dataset.teamUnhire);if(result.ok){state.preparationConfirmed=false;renderPreparation();renderAll();showToast(`${result.member.name} отозван(а). Деньги вернулись туда, откуда списались.`);}}
  const mapHire=event.target.closest('[data-map-hire]');
  if(mapHire){const result=hireContractor(state,mapHire.dataset.mapHire);if(result.ok){state.preparationConfirmed=false;renderPreparation();renderAll();feedback('cash');showToast(`${result.contractor.company}: едут на объект. Возможно, даже на этот.`,'done');}else if(result.reason==='budget')showToast('Не хватило аванса и кассы компании. Кредитная кнопка подозрительно близко.','risk');}
  const mapUnhire=event.target.closest('[data-map-unhire]');if(mapUnhire){const result=unhireContractor(state,mapUnhire.dataset.mapUnhire);if(result.ok){state.preparationConfirmed=false;renderPreparation();renderAll();showToast(`${result.contractor.company}: мобилизация отменена, деньги возвращены.`);}}
  const manpowerControl=event.target.closest('[data-contract-manpower]');
  if(manpowerControl){const result=adjustContractorManpower(state,manpowerControl.dataset.contractManpower,Number(manpowerControl.dataset.manpowerDelta));if(result.ok){if(!result.pending){const mesh=crewMeshes.get(result.crew.id);if(mesh){office.remove(mesh);crewMeshes.delete(result.crew.id);if(selectedPerson?.userData?.crewId===result.crew.id)selectedPerson=null;}syncSceneFromState();}renderTeamBook();renderAll();persistGame();feedback(result.delta>0?'cash':'message');showToast(result.delta>0?`${result.contractor.company}: +1 человек оплачен за ${money(result.cost)} и выйдет ${result.pending?'завтра':'сейчас'}.`:`${result.contractor.company}: один человек снят. Теснота уменьшилась, мощность бригады тоже.` ,result.delta>0?'done':'risk');}else showToast(result.reason==='budget'?'На усиление не хватает денег.':result.reason==='max'?'Двенадцать человек — предел одной бригады. Дальше это уже митинг.':'Меньше двух человек подрядчик называет расторжением договора.','risk');}
  const dismiss=event.target.closest('[data-dismiss-contractor]');
  if(dismiss){const result=dismissContractor(state,dismiss.dataset.dismissContractor);if(result.ok){renderTeamBook();renderAll();persistGame();showToast(`${result.contractor.company} сняты. Сегодня уже никто новый не выйдет.`,'risk');}else showToast('Менять подрядчика можно на вечернем закрытии дня.','risk');}
  const replacement=event.target.closest('[data-replace-contractor]');
  if(replacement){const result=hireContractor(state,replacement.dataset.replaceContractor);if(result.ok){renderTeamBook();renderAll();persistGame();showToast(`${result.contractor.company}: оплачены, выйдут завтра. Профиль уже никто не проверяет.`,'done');}else if(result.reason==='budget')showToast('На донабор не хватает денег объекта.','risk');}
  const forceAssign=event.target.closest('[data-force-assign]');
  if(forceAssign){const select=document.querySelector(`[data-assignment-select="${CSS.escape(forceAssign.dataset.forceAssign)}"]`);const result=forceAssignCrew(state,forceAssign.dataset.forceAssign,select?.value);if(result.ok){renderTeamBook();renderAll();persistGame();showToast(result.mismatch?'Нагнали непрофильного специалиста: темп 55%, качество под вопросом.':'Фронт усилен профильной командой.','risk');}else showToast(result.reason==='budget'?'На этот нагон не хватает денег.':result.reason==='hard-blocker'?`Физический блокер: сначала ${result.blockers.map(item=>item.short).join(', ')}.`:'Этот фронт уже занят или человек ещё не вышел.','risk');}
  const dayTask=event.target.closest('[data-day-task]');
  if(dayTask){const task=state.tasks.find(item=>item.id===dayTask.dataset.dayTask);if(task){if(task.enabledToday)cyclePriority(state,task.id);else task.enabledToday=true;renderDayPlan();}}
  const skipTaskButton=event.target.closest('[data-skip-task]');
  if(skipTaskButton){const result=skipOptionalTask(state,skipTaskButton.dataset.skipTask);if(result.ok){renderAll();syncSceneFromState();persistGame();feedback('risk');showToast(result.effect.dirt?`Укрытие пропущено: сразу +${result.effect.dirt}% мусора и риск качества.`:'Временные сети пропущены: стройка дешевле, но медленнее и нервнее.','risk');}return;}
  const scheduleDay=event.target.closest('[data-schedule-day]');
  if(scheduleDay){shiftMasterScheduleTask(state,scheduleDay.dataset.scheduleTask,Number(scheduleDay.dataset.scheduleDay));renderMasterSchedule();renderTasks();}
  const scheduleOrder=event.target.closest('[data-schedule-order]');
  if(scheduleOrder){moveMasterScheduleTask(state,scheduleOrder.dataset.scheduleTask,Number(scheduleOrder.dataset.scheduleOrder));renderMasterSchedule();}
  const sendUrgent=event.target.closest('[data-send-urgent]');
  if(sendUrgent){const task=state.tasks.find(item=>item.id===$('#urgentTaskSelect')?.value);const message=$('#urgentMessageInput')?.value?.trim()||'Сделать срочно.';if(task&&state.budget>=5){const outcome=sendPressureInstruction(state,task.id,'chat');state.chatMessages??=[];state.chatMessages.push({mine:true,name:sessionUser??'Вы',text:`${message} — ${task.title}`,time:projectTime()});state.chatMessages=state.chatMessages.slice(-14);if(state.tutorial)state.tutorial.chatSent=true;feedback(outcome.worked?'message':'risk');renderAll();renderWhatsapp();persistGame();showToast(outcome.worked?'Сообщение подействовало: на 2,5 часа темп выше.':'Сообщение прочитали. Потом обсудили тон сообщения.','risk');}else showToast('Даже срочность теперь не по бюджету.','risk');}
  const emailTemplate=event.target.closest('[data-email-template]');
  if(emailTemplate)renderEmailComposer(emailTemplate.dataset.emailTemplate);
  const sendEmail=event.target.closest('[data-send-email]');
  if(sendEmail){
    const target=sendEmail.dataset.sendEmail;let outcome=null;
    if(target==='client'){state.trust=Math.min(100,state.trust+2);state.elapsed+=1;}
    if(target==='clientMoney')outcome=requestClientFunding(state);
    if(target==='boss'){state.budget+=20;state.trust=Math.max(0,state.trust-2);}
    if(target==='contractors')outcome=sendContractorEscalation(state,$('#emailContractorSelect')?.value??'all');
    state.emailHistory??=[];state.emailHistory.push({template:target,time:projectTime()});closeCommunication();renderAll();persistGame();
    if(outcome?.reason==='already-requested')showToast('Сегодня заказчик уже читал одну просьбу о деньгах. Вторую он удалил не открывая.','risk');
    else if(outcome?.reason==='fixed-contract')showToast('На госзаказе цена зафиксирована. Просьба о деньгах теперь называется материалом проверки.','risk');
    else if(outcome?.reason==='daily-limit')showToast('Вторую жёсткую претензию за день юристы назвали эмоциональной рассылкой.','risk');
    else if(outcome?.reason==='contractor'||outcome?.reason==='no-front')showToast('Письмо некому исполнять: сначала наймите подрядчика или дайте ему фронт.','risk');
    else if(target==='contractors'&&outcome)showToast(outcome.worked?'Претензия сработала: пять часов усиленного темпа.':'Даже жёсткое письмо попало в редкие 10% административного вакуума.',outcome.worked?'done':'risk');
    else if(outcome)showToast(outcome.approved?`Заказчик согласовал ещё ${money(outcome.amount)}. Теперь это тоже надо освоить.`:'Заказчик отказал: «это уже входило в исходный объём».',outcome.approved?'done':'risk');
    else showToast('Письмо отправлено. В копии 17 человек, решение теперь хотя бы ищется.');
  }
  const startTaskButton=event.target.closest('[data-start-task]');
  if(startTaskButton){
    event.stopPropagation();const task=state.tasks.find(item=>item.id===startTaskButton.dataset.startTask);
    if(task?.status==='ready'){
      task.enabledToday=true;task.manualPaused=false;task.priority=Math.max(2,task.priority);const available=state.crews.find(crew=>(crew.unavailableUntil??0)<=state.elapsed&&!crew.taskId&&(crew.skill===task.skill||crew.skill==='general'));
      renderAll();persistGame();feedback('message');showToast(available?`«${task.short}» включена в план. Свободная бригада выходит на фронт.`:`«${task.short}» включена в план и ждёт подходящую свободную бригаду.`,available?'done':'risk');
    }
  }
  const stopTaskButton=event.target.closest('[data-stop-task]');
  if(stopTaskButton){event.stopPropagation();const result=pauseTask(state,stopTaskButton.dataset.stopTask);if(result.ok){renderAll();persistGame();feedback('message');showToast(`«${result.task.short}» остановлена на ${Math.round(result.task.progress*100)}%. ${result.crew?.name??'Бригада'} освобождена.`,'risk');}}
  const taskCard=event.target.closest('[data-task]');
  if(taskCard&&!event.target.closest('[data-priority],[data-submit-task],[data-start-task],[data-stop-task]')){selectedPerson=null;state.selectedTaskId=taskCard.dataset.task;renderTasks();renderSelection();}
  const priority=event.target.closest('[data-priority]');
  if(priority){event.stopPropagation(); if(cyclePriority(state,priority.dataset.priority)){renderTasks();showToast('Приоритет изменён. Прораб многозначительно переставил стикер.');}}
  const submitTask=event.target.closest('[data-submit-task]');
  if(submitTask){event.stopPropagation();const result=submitTaskForAcceptance(state,submitTask.dataset.submitTask);if(result.ok){renderAll();persistGame();feedback(result.accepted?(result.payment?'cash':'done'):'risk');const acceptedText=result.payment?`Работа принята — заказчик перечислил ${money(result.payment)}.`:result.paymentReason==='retention'?'Работа принята. Промежуточный лимит выплачен; остаток заказчик удерживает до сдачи ИД.':'Работа принята, но платёж по этому этапу договором не предусмотрен.';showToast(result.accepted?acceptedText:`Не приняли. Замечания займут минимум полсмены и ${money(result.remedialCost)}.`,result.accepted?'done':'risk');}}
  const hire=event.target.closest('[data-hire]');
  if(hire){const result=hireContractor(state,hire.dataset.hire); if(result.ok){renderAll();showToast(`${result.contractor.company}: мобилизация подтверждена`,'done');}else if(result.reason==='budget'){showToast('На счёте недостаточно оптимизма и денег.','risk');}}
  const choice=event.target.closest('[data-event-choice]');
  if(choice&&eventShowing){
    const catalogEvent=randomEventById.get(eventShowing);
    if(catalogEvent) applyCatalogEventChoice(state,catalogEvent,choice.dataset.eventChoice);
    else applyEventChoice(state,eventShowing,choice.dataset.eventChoice);
    refs.event.classList.remove('visible');feedback(catalogEvent?.options?.find(option=>option.id===choice.dataset.eventChoice)?.deltas?.budget<0?'risk':'done');showToast('Решение принято. Последствия уже в пути.');eventShowing=null;renderAll();
  }
  const situationChoice=event.target.closest('[data-situation-choice]');
  if(situationChoice&&openSituationId){resolveSituation(state,openSituationId,situationChoice.dataset.situationChoice);openSituationId=null;refs.situation.classList.remove('visible');state.paused=situationWasPaused;renderAll();showToast('Ответ отправлен. Подрядчик понял его в пределах своей сметы.');}
  const openSituation=event.target.closest('[data-open-situation]');
  if(openSituation){const active=(state.activeSituations??[]).find(item=>item.uid===openSituation.dataset.openSituation);if(active)focusSituation(active);}
  if(event.target.closest('[data-close-modal]'))cancelCurrentOrder();
  if(event.target.closest('[data-close-sidebook]'))event.target.closest('.modal-backdrop').classList.remove('visible');
});

document.addEventListener('change',(event)=>{
  const delegation=event.target.closest('[data-delegation-project]');if(!delegation)return;
  const result=setProjectDelegation(state,delegation.dataset.delegationProject,delegation.value);
  if(result.ok){renderCompanyConsole();persistGame();showToast(delegation.value==='manual'?'Объект переведён в ручной режим. Телефон уже вибрирует.':delegation.value==='autonomous'?'Объект отдан команде. В отчётах всё будет выглядеть спокойнее, чем на площадке.':'Команда действует сама, но отклонения приносит вам.','done');}
});

$('#acceptOrder').addEventListener('click',()=>{
  const order=orders.find(item=>item.id===selectedOrderId);if(!order)return;if(!selectOrder(state,order)){const organization=ensureOrganization(state);showToast((order.requiredLevel??1)>organization.playerLevel?`Нужен уровень ${order.requiredLevel}. Улучшайте штаб и закрывайте проекты.`:(order.requiresProjects??0)>organization.projectsCompleted?'Этот заказ откроется после предыдущей главы.':'Не хватает оборотных денег организации. Кредит доступен и в финансах объекта.','risk');feedback('risk');return;}
  visualProfile=createVisualProfile(order.visualSeed,order);
  rebuildTaskMarkers();
  if(sceneProps.client)sceneProps.client.userData.displayName=order.clientPerson;
  refs.orders.classList.remove('visible');refs.brief.classList.add('visible');renderAll();feedback('cash');showToast(`Заказ выбран: ${order.location}. Мобилизация организации ${money(state.organizationMobilization)}.`);
});
$('#regenerateOrders').addEventListener('click',()=>{orders=createOrderMarket();state.orderOptions=orders;selectedOrderId=orders.find(order=>(order.requiresProjects??0)<=ensureOrganization(state).projectsCompleted)?.id??orders[0].id;renderOrders();showToast('Рынок обновлён. Сюжетные заказы остались: рекомендации помнят ваши объекты.');});
$('#startMission').addEventListener('click',()=>{if(state.contract.cardsPlayed.length!==2)return;state.phase='preparation';refs.brief.classList.remove('visible');refs.market.classList.add('visible');renderPreparation();renderAll();showToast('Контракт подписан. Мелкий шрифт ликует.');});
$('#confirmPreparationButton').addEventListener('click',()=>{state.preparationConfirmed=true;renderPreparation();persistGame();showToast('Состав подтверждён. На бумаге все уже почти работают.','done');});
$('#enterSite').addEventListener('click',()=>{if(!state.preparationConfirmed){showToast('Сначала подтвердите состав. Даже если состав — вы и хозбригада.','risk');return;}state.phase='schedule';state.paused=true;refs.market.classList.remove('visible');openMasterSchedule();showToast('Сначала примите общий график. Потом начнётся ежедневный управленческий оптимизм.');});
$('#cancelPreparationButton').addEventListener('click',cancelCurrentOrder);
$('#acceptSchedule').addEventListener('click',()=>{state.masterScheduleAccepted=true;refs.schedule.classList.remove('visible');if(eveningEditing){eveningEditing=false;renderEveningScheduleDecision();refs.report.classList.add('visible');showToast('Правки записаны в черновик. Теперь решите, как их провести.','risk');renderAll();persistGame();return;}if(!state.started){state.started=true;state.phase='planning';state.paused=true;state.needsPlanning=true;state.plannedDay=Math.floor(state.elapsed/24);for(const task of state.tasks)task.enabledToday=false;unlockTasks(state);renderDayPlan();refs.planning.classList.add('visible');showToast('Общий график принят. Утро берёт из него работы дня.','done');}else{state.paused=scheduleWasPaused;showToast('Общий график обновлён. Завершённые работы в планёрку не вернутся.','done');}renderAll();persistGame();});
$('#startDay').addEventListener('click',()=>{if(!state.tasks.some(task=>task.enabledToday&&!['done','active'].includes(task.status))){showToast('Выберите хотя бы одну работу. Даже хаосу нужен старт.','risk');return;}state.needsPlanning=false;state.plannedDay=Math.floor(state.elapsed/24);state.phase='execution';state.paused=false;refs.planning.classList.remove('visible');renderAll();feedback('build');showToast('План отправлен. Площадка реагирует сразу: смотрите, что люди реально делают.','done');});
$('#whatsappButton').addEventListener('click',()=>openCommunication('whatsapp'));
$('#emailButton').addEventListener('click',()=>openCommunication('email'));
$('#siteWhatsappButton').addEventListener('click',()=>openCommunication('whatsapp'));
$('#siteEmailButton').addEventListener('click',()=>openCommunication('email'));
$('#teamButton').addEventListener('click',()=>{renderTeamBook();refs.team.classList.add('visible');});
$('#magicResolveButton').addEventListener('click',()=>{const result=tryMagicResolve(state);if(!result.ok){showToast(result.reason==='cooldown'?`Связи ещё заняты. Следующая попытка через ${Math.ceil(result.remaining)} ч.`:'Сначала выйдите на объект. Пока порешать можно только выбор заказа.','risk');return;}renderAll();syncSceneFromState();persistGame();if(!result.success){feedback('risk');showToast('«Я в пути!» прочитали. Никто не понял, что именно вы собирались решить. Попытка потрачена.','risk');return;}feedback(result.outcome==='money'?'cash':'done');const message=result.outcome==='acceptance'?`Порешали: закрыто работ — ${result.accepted}${result.payment?`, пришло ${money(result.payment)}`:''}.`:result.outcome==='money'?`Порешали: на объект поступило ${money(result.amount)}.`:`Порешали: срок вырос на ${result.hours} часов.`;showToast(message,'done');});
$('#financeButton').addEventListener('click',()=>{renderFinanceBook();refs.finance.classList.add('visible');});
$('#docsButton').addEventListener('click',()=>{renderDocsBook();refs.docs.classList.add('visible');});
function saveAndOpenMenu(){state.paused=true;saved=state;persistGame();for(const modal of document.querySelectorAll('.modal-backdrop'))modal.classList.remove('visible');renderMainMenu();refs.menu.classList.add('visible');showToast('Объект сохранён и поставлен на управленческую паузу.','done');}
$('#saveExitButton').addEventListener('click',saveAndOpenMenu);
$('#menuButton').addEventListener('click',saveAndOpenMenu);
$('#closeCommunication').addEventListener('click',closeCommunication);
$('#masterScheduleButton').addEventListener('click',openMasterSchedule);
$('#topScheduleButton').addEventListener('click',openMasterSchedule);
$('#closeSchedule').addEventListener('click',closeMasterSchedule);
$('#closeSituation').addEventListener('click',()=>{refs.situation.classList.remove('visible');openSituationId=null;state.paused=situationWasPaused;showToast('Вопрос оставлен висеть над человеком. Буквально.');});
$('#sendReport').addEventListener('click',()=>{const day=Math.floor(state.elapsed/24);const revision=resolveScheduleRevision(state,selectedScheduleRoute??'restore',eveningScheduleSnapshot);const dailyCost=closeDayFinances(state);state.reportedDay=day;state.elapsed=(day+1)*24;state.needsReport=false;state.needsPlanning=true;state.paused=true;for(const task of state.tasks)task.enabledToday=false;const companyDay=advanceCompanyDay(state);refs.report.classList.remove('visible');eveningScheduleSnapshot=null;eveningScheduleDay=-1;selectedScheduleRoute=null;renderDayPlan();refs.planning.classList.add('visible');const revisionText=revision.changed?(revision.mode==='client'?(revision.approved?' Заказчик согласовал новую версию графика.':' Заказчик отклонил правки — вернули базу.'):(revision.mode==='secret'?(revision.detected?' Тайную правку заметили.':' Тихая версия графика вступила в силу.'):' Правки отменены.')):'';const portfolioText=companyDay.background.length?` Фоновых объектов посчитано: ${companyDay.background.length}.`:'';const crisisText=companyDay.crisis?` КРИЗИС: ${companyDay.crisis.reason}, на спасение ${companyDay.crisis.deadlineDay-companyDay.day} дней.`:'';showToast(`Отчёт ушёл. За день объекта списано ${money(dailyCost)}.${revisionText}${portfolioText}${crisisText}`,companyDay.crisis?'risk':'done');persistGame();});
$('#briefButton').addEventListener('click',()=>state.selectedOrder?refs.brief.classList.add('visible'):refs.orders.classList.add('visible'));
$('#pauseButton').addEventListener('click',()=>{if(!state.started)return;state.paused=!state.paused;renderHud();});
$('#endDayButton').addEventListener('click',()=>{if(!state.started||state.completed){showToast('Сначала выйдите на объект. Заканчивать рынок заказов рано.','risk');return;}state.paused=true;state.needsReport=true;openReport();renderHud();persistGame();showToast('Смена остановлена. Вечерний Excel уже требует внимания.','risk');});
$('#soundToggle').addEventListener('click',()=>{audioEnabled=!audioEnabled;$('#soundToggle').textContent=audioEnabled?'♪':'×';$('#soundToggle').title=audioEnabled?'Звук включён':'Звук выключен';if(audioEnabled)playSound('click');});
$('#skipTutorial').addEventListener('click',()=>{if(state.tutorial){state.tutorial.active=false;state.tutorial.completed=true;}renderTutorial();persistGame();showToast('Обучение пропущено. События снова имеют доступ к объекту.','risk');});
$('#developHqButton').addEventListener('click',()=>{const outcome=startHeadquartersProject(state);if(!outcome.ok){showToast(outcome.reason==='active'?'Ремонт штаба уже идёт. Вторая бригада просит отдельный штаб.':'На аванс собственного ремонта снова не хватило денег. Символично.','risk');return;}feedback('build');companyTab='office';renderMainMenu();persistGame();showToast('Улучшение штаба запущено как внутренний проект. Результат появится физически после выполнения.','done');});
$('#designOfficeButton').addEventListener('click',()=>{const outcome=toggleInHouseDesign(state);if(!outcome.ok){showToast(outcome.reason==='hq-level'?'Сначала нужен штаб уровня 2. Проектировщики отказываются сидеть у принтера.':outcome.reason==='active-project'?'Штат меняют между проектами, а не во время горящего выпуска.':'В кассе нет 240К на постоянный проектный отдел.','risk');return;}renderMainMenu();renderAll();persistGame();feedback(outcome.active?'cash':'message');showToast(outcome.active?'Проектный отдел принят в штат: 12К операционных расходов каждый день, отдельный подрядчик больше не обязателен.':'Проектный отдел распущен. Операционные расходы упали, память организации тоже.','done');});
document.querySelectorAll('[data-speed]').forEach(button=>button.addEventListener('click',()=>{state.speed=Number(button.dataset.speed);state.paused=false;renderHud();}));
$('#zoomIn').addEventListener('click',()=>{cameraZoom=Math.min(1.65,cameraZoom+.12);updateCamera();});
$('#zoomOut').addEventListener('click',()=>{cameraZoom=Math.max(.72,cameraZoom-.12);updateCamera();});
$('#zoomReset').addEventListener('click',()=>{cameraAngle=Math.PI/4;cameraZoom=1;updateCamera();});
function resetGame(){const hq=state.hq;const playerAvatar=state.playerAvatar;const organization=ensureOrganization(state);const staff=state.staff;const network=state.contractorNetwork;const calendar=state.companyCalendar;state=createInitialState(Math.random,allRandomEvents);state.hq=hq;state.playerAvatar=playerAvatar;state.company=organization;state.organization=organization;state.staff=staff;state.contractorNetwork=network;state.companyCalendar=calendar;state.portfolio={projects:[],activeProjectId:null,maxActive:3,archive:state.portfolio?.archive??[]};ensureGameSaveV2(state);ensureWorkforceMarket(state);saved=null;eveningScheduleSnapshot=null;eveningScheduleDay=-1;eveningEditing=false;selectedScheduleRoute=null;orders=createOrderMarket(organization);state.orderOptions=orders;selectedOrderId=orders.find(order=>(order.requiresProjects??0)<=organization.projectsCompleted)?.id??orders[0].id;visualProfile=createVisualProfile(1);unlockTasks(state);renderedLogLength=0;resultShown=false;clearCrewMeshes();for(const modal of document.querySelectorAll('.modal-backdrop'))modal.classList.remove('visible');refs.orders.classList.add('visible');rebuildTaskMarkers();renderAll();persistGame();}
function cancelCurrentOrder(){if(state.started){showToast('После выхода на площадку отказаться можно только через «сохранить и выйти».','risk');return;}const organization=ensureOrganization(state);const refund=Math.round((state.organizationMobilization??0)*.5);if(refund)postLedgerEntry(state,{type:'income',category:'Возврат мобилизации',amount:refund,projectId:state.selectedOrder?.id,text:'Частичный возврат после отказа от заказа'});const hq=state.hq;const playerAvatar=state.playerAvatar;const currentOrders=orders;const staff=state.staff;const network=state.contractorNetwork;const portfolio=state.portfolio;const calendar=state.companyCalendar;state=createInitialState(Math.random,allRandomEvents);state.hq=hq;state.playerAvatar=playerAvatar;state.company=organization;state.organization=organization;state.staff=staff;state.contractorNetwork=network;state.portfolio=portfolio;state.companyCalendar=calendar;ensureGameSaveV2(state);ensureWorkforceMarket(state);state.orderOptions=currentOrders;orders=currentOrders;selectedOrderId=orders.find(order=>(order.requiredLevel??1)<=organization.playerLevel&&(order.requiresProjects??0)<=organization.projectsCompleted)?.id??orders[0]?.id;saved=null;visualProfile=createVisualProfile(1);renderedLogLength=0;resultShown=false;clearCrewMeshes();for(const modal of document.querySelectorAll('.modal-backdrop'))modal.classList.remove('visible');refs.orders.classList.add('visible');rebuildTaskMarkers();renderAll();persistGame();showToast(`От заказа отказались. Вернули ${money(refund)}, остальное ушло в опыт переговоров.`,'risk');}
$('#resetButton').addEventListener('click',resetGame);
$('#playAgain').addEventListener('click',()=>{refs.result.classList.remove('visible');saved=null;renderMainMenu();refs.menu.classList.add('visible');});
$('#continueGameButton').addEventListener('click',()=>{if(saved)resumePlayerGame();});
$('#newGameButton').addEventListener('click',()=>{refs.menu.classList.remove('visible');resetGame();});

function frame(now) {
  const dt=Math.min(.08,(now-lastFrame)/1000); lastFrame=now;
  tickState(state,dt*state.speed*GAME_HOURS_PER_REAL_SECOND);
  if(state.log.length>renderedLogLength){for(const item of state.log.slice(renderedLogLength)){showToast(item.text,item.type);if(item.type==='start')feedback('build');else if(item.type==='done')feedback('done');else if(item.type==='risk'||item.type==='event')feedback('risk');}renderedLogLength=state.log.length;renderAll();}
  const planningBlocked=[refs.auth,refs.menu,refs.orders,refs.brief,refs.market,refs.schedule,refs.communication,refs.team,refs.finance,refs.docs,refs.report,refs.situation,refs.result].some(modal=>modal?.classList.contains('visible'));
  if(state.needsPlanning&&!planningBlocked&&!refs.planning.classList.contains('visible')){renderDayPlan();refs.planning.classList.add('visible');}
  if(state.needsReport&&!refs.auth.classList.contains('visible')&&!refs.menu.classList.contains('visible')&&!refs.orders.classList.contains('visible'))openReport();
  const managementOpen=[refs.auth,refs.menu,refs.orders,refs.brief,refs.market,refs.communication,refs.schedule,refs.team,refs.finance,refs.docs,refs.planning,refs.report,refs.situation,refs.result].some(modal=>modal?.classList.contains('visible'));
  if(state.eventQueue.length&&!eventShowing&&!refs.event.classList.contains('visible')&&!managementOpen)openEvent(state.eventQueue[0]);
  if(state.completed)showResult();
  renderHud();renderTutorial();syncSceneFromState();animateScene(now);resizeRenderer();updateCamera(now*.001);
  if(cameraKick>.005){camera.position.x+=Math.sin(now*.11)*cameraKick;camera.position.y+=Math.cos(now*.09)*cameraKick*.35;camera.lookAt(cameraTarget);cameraKick*=.86;}
  renderer.render(scene,camera);
  renderHqPreview(now);
  if(now-lastSaved>2500){persistGame();lastSaved=now;}
  requestAnimationFrame(frame);
}

$('#authForm').addEventListener('submit',(event)=>{event.preventDefault();authenticate('login');});
$('#registerButton').addEventListener('click',()=>authenticate('register'));
$('#logoutButton').addEventListener('click',async()=>{persistGame();fetch('/fg-api/logout',{method:'POST',credentials:'include'}).catch(()=>{});sessionUser=null;$('#profileChip').hidden=true;for(const modal of document.querySelectorAll('.modal-backdrop'))modal.classList.remove('visible');refs.auth.classList.add('visible');$('#authPassword').value='';$('#authMessage').textContent='Профиль закрыт. Объект всё запомнил.';});
renderAll();
requestAnimationFrame(frame);
