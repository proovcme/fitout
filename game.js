import * as THREE from 'three';
import {
  DEADLINE_HOURS,
  GAME_HOURS_PER_REAL_SECOND,
  INITIAL_BUDGET,
  applyEventChoice,
  applyCatalogEventChoice,
  applyContractCard,
  attemptHqUpgrade,
  closeDayFinances,
  createInitialState,
  cyclePriority,
  developHeadquarters,
  ensureOrganization,
  getResult,
  getRisk,
  hireContractor,
  hireTeamMember,
  ensureMasterSchedule,
  moveMasterScheduleTask,
  restoreState,
  resolveSituation,
  scheduledTasksForDay,
  selectOrder,
  serializeState,
  shiftMasterScheduleTask,
  takeOrganizationLoan,
  tickState,
  unlockTasks,
} from './game-core.js';
import { allRandomEvents, randomEventById } from './events/index.js';
import { createCampaignOrders, generateOrders } from './order-generator.js';
import { bubbleFor, createPersonProfile, createVisualProfile } from './procedural-content.js';
import { situationById } from './situations.js';

const STORAGE_KEY = 'fitout-mission-v4';
const ICONS = {
  survey: '⌁', project:'⌑', move: '↔', electric: 'ϟ', prep: '▧', paint: '◩', desks: '▤', clean: '✦', 'executive-docs':'▥', inspect: '✓',
};
const SKILL_LABELS = { management: 'Прораб', design:'Проектирование', documentation:'Исполнительная', support:'Команда', moving: 'Перестановка', paint: 'Отделка', electric: 'Электрика', furniture: 'Мебель', cleaning: 'Клининг' };
const STATUS_LABELS = { locked: 'Ждёт зависимости', ready: 'Можно начинать', active: 'В работе', done: 'Завершено', blocked: 'Нет бюджета' };
const PERSON_NAMES = {
  foreman:['Илья Петрович'],moving:['Рустам','Вадим'],paint:['Саша','Николай'],electric:['Денис','Тимур'],furniture:['Женя','Павел'],cleaning:['Лена','Марина'],
  architect:['Мария Корнилова'],client:['Анна Крылова'],police:['Капитан Орлов','Сержант Лебедев'],inspector:['Инспектор Семёнов'],medic:['Фельдшер Вера'],boss:['Виктор Аркадьевич'],delivery:['Водитель Гена'],worker:['Алексей','Марат','Сергей'],
};
const PERSON_JOBS = {foreman:'Прораб',moving:'Рабочий · переезд',paint:'Маляр',electric:'Электрик',furniture:'Сборщик мебели',cleaning:'Клининг',architect:'Архитектор',client:'Представитель заказчика',police:'Сотрудник службы',inspector:'Инспектор',medic:'Медик',boss:'Ваше начальство',delivery:'Водитель доставки',worker:'Рабочий'};
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
function createOrderMarket(organization=ensureOrganization(state)) {
  const campaign=createCampaignOrders();
  const random=generateOrders(Math.random,5).map(order=>({...order,requiresProjects:Math.max(0,Math.min(2,Math.floor(order.complexity/2)-1))}));
  return [...campaign,...random];
}
let orders = Array.isArray(state.orderOptions) && state.orderOptions.length ? state.orderOptions : createOrderMarket();
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
let communicationWasPaused = true;
let selectedEmailTemplate = 'client';
let audioEnabled=true;
let audioContext=null;
let cameraKick=0;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g,(character)=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[character]));
const refs = {
  canvas: $('#siteCanvas'), taskList: $('#taskList'), contractorList: $('#contractorList'), crewList: $('#crewList'),
  budget: $('#budgetValue'), budgetDelta: $('#budgetDelta'), deadline: $('#deadlineValue'), deadlineStatus: $('#deadlineStatus'),
  quality: $('#qualityValue'), qualityBar: $('#qualityBar'), trust: $('#trustValue'), day: $('#dayLabel'), time: $('#timeLabel'),
  counter: $('#taskCounter'), progress: $('#missionProgress'), crewCount: $('#crewCount'), risk: $('#riskLine'), siteStatus: $('#siteStatus'),
  selection: $('#selectionCard'), toasts: $('#toastStack'), brief: $('#briefModal'), event: $('#eventModal'), result: $('#resultModal'),
  auth:$('#authModal'),menu:$('#mainMenuModal'),orders:$('#ordersModal'),market:$('#marketModal'),schedule:$('#scheduleModal'),planning:$('#planningModal'),communication:$('#communicationModal'),report:$('#reportModal'),team:$('#teamModal'),finance:$('#financeModal'),docs:$('#docsModal'),situation:$('#situationModal'),
};
let openSituationId=null;
let scheduleWasPaused=true;

const profileStorageKey=(name)=>`${STORAGE_KEY}:${encodeURIComponent((name??'guest').toLowerCase())}`;

function persistGame() {
  if(!sessionUser)return;
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
  saved=loaded&&!loaded.completed?loaded:null;
  state=saved??createInitialState(Math.random,allRandomEvents);
  if(!saved&&loaded?.organization){state.organization=loaded.organization;state.hq=loaded.hq??state.hq;}
  ensureOrganization(state);
  ensureMasterSchedule(state);
  if(!Array.isArray(state.randomEvents)||state.randomEvents.length<12||!Array.isArray(state.eventSchedule)||state.randomEvents.some(id=>!randomEventById.has(id))) {
    const refreshedEvents=createInitialState(Math.random,allRandomEvents);state.randomEvents=refreshedEvents.randomEvents;state.eventSchedule=refreshedEvents.eventSchedule;state.randomEvent=state.randomEvents[0];
  }
  orders=Array.isArray(state.orderOptions)&&state.orderOptions.length?state.orderOptions:createOrderMarket();
  state.orderOptions=orders;selectedOrderId=state.selectedOrder?.id??orders[0]?.id;
  visualProfile=createVisualProfile(state.visualSeed??1,state.selectedOrder);unlockTasks(state);rebuildTaskMarkers();
  renderedLogLength=state.log.length;resultShown=false;selectedPerson=null;
}

function renderMainMenu() {
  const organization=ensureOrganization(state);
  $('#menuProfileName').textContent=sessionUser??'ИГРОК';
  const continueButton=$('#continueGameButton');
  continueButton.disabled=!saved;
  if(saved?.selectedOrder) {
    const completed=saved.tasks?.filter(task=>task.status==='done').length??0;
    $('#continueSummary').textContent=`${saved.selectedOrder.title} · ${saved.selectedOrder.location}. Закрыто ${completed} из ${saved.tasks.length} работ, на счёте ${money(saved.budget)}.`;
  } else $('#continueSummary').textContent='Сохранённого объекта пока нет. Это самый спокойный момент вашей карьеры.';
  $('#organizationName').textContent=organization.name;
  $('#organizationCash').textContent=money(organization.cash);
  $('#organizationDebt').textContent=money(organization.debt);
  $('#organizationProjects').textContent=String(organization.projectsCompleted);
  $('#organizationReputation').textContent=`${organization.reputation} / 100`;
  const hqCosts=[80,170,320,520];const hqCost=hqCosts[Math.min(state.hq?.level??0,hqCosts.length-1)];
  $('#hqLevel').textContent=String(state.hq?.level??0);$('#hqTitle').textContent=state.hq?.title??'Стол у принтера';$('#hqStatus').textContent=state.hq?.lastFailure??'Клиентам строим лучше, чем себе.';$('#hqCost').textContent=`${hqCost}К`;
  $('#developHqButton').disabled=organization.cash<hqCost;
  document.querySelectorAll('[data-loan]').forEach(button=>{button.disabled=state.started&&!state.completed;button.title=button.disabled?'Кредиты доступны только между проектами':'';});
}

function resumePlayerGame() {
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
  sessionUser=payload.user;installPlayerState(payload.state??localStorage.getItem(profileStorageKey(sessionUser)));
  $('#profileName').textContent=sessionUser;$('#profileChip').hidden=false;refs.auth.classList.remove('visible');
  for(const modal of document.querySelectorAll('.modal-backdrop'))if(modal!==refs.auth)modal.classList.remove('visible');
  renderMainMenu();refs.menu.classList.add('visible');renderAll();
  showToast(payload.warning??(saved?'Сохранение найдено. Оно ждёт в главном меню.':'Профиль открыт. Можно начинать новую проблему.'),'done');
}

function money(value) {
  return `${Math.round(value * 1000).toLocaleString('ru-RU')} ₽`;
}

function formatClock(elapsed) {
  const totalHours = 9 + elapsed;
  const day = Math.floor(totalHours / 24) + 1;
  const hour = Math.floor(totalHours) % 24;
  const minute = Math.floor((elapsed % 1) * 60);
  const names = ['ПТ', 'СБ', 'ВС', 'ПН', 'ВТ'];
  return { day: `${names[Math.min(day - 1, names.length - 1)]} · ДЕНЬ ${day}`, time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
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
  const organization=ensureOrganization(state);const locked=(order)=>(order.requiresProjects??0)>organization.projectsCompleted;
  $('#orderPins').innerHTML=orders.map((order,index)=>`<button class="order-pin ${order.id===selected.id?'selected':''} ${locked(order)?'locked':''}" style="left:${order.mapX}%;top:${order.mapY}%;--pin:${order.color}" data-order-id="${order.id}" data-label="${order.location} · ${order.finishClass}"><span>${order.tutorial?'У':order.clientType==='state'?'Г':'₽'}${index+1}</span></button>`).join('');
  $('#orderDetails').innerHTML=`<h2>${selected.title}</h2><span class="order-location">${selected.location} · ${selected.area.toLocaleString('ru-RU')} м²</span>
    <div class="order-badges">${selected.tutorial?'<span>ОБУЧЕНИЕ</span>':''}${selected.campaign?`<span>ГЛАВА ${selected.chapter}</span>`:''}<span class="${selected.clientType==='state'?'state':''}">${selected.clientType==='state'?'государство':'коммерция'}</span><span>${selected.projectTypeLabel}</span><span>класс ${selected.finishClass}</span><span>сложность ${'◆'.repeat(selected.complexity)}</span></div>
    <div class="order-metrics"><div><small>СТАРТОВЫЙ БЮДЖЕТ</small><strong>${money(selected.budget)}</strong></div><div><small>СРОК</small><strong>${selected.deadlineHours} ч</strong></div><div><small>КАЧЕСТВО</small><strong>≥ ${selected.qualityTarget}</strong></div><div><small>ЗАКУПКА</small><strong>${selected.procurement}</strong></div></div>
    <div class="order-client"><strong>${selected.clientName}</strong><small>${selected.clientPerson} · ${selected.clientRole}<br>${selected.clientType==='state'?'Решение считается принятым, когда его приняли все отсутствующие.':'Хочет быстро, качественно и чтобы резерв не использовался.'}</small></div>
    <ul class="order-risks">${locked(selected)?`<li>Нужно закрыть проектов: ${selected.requiresProjects}. Сейчас: ${organization.projectsCompleted}.</li>`:''}${selected.riskTags.map(risk=>`<li>${risk}</li>`).join('')}</ul>`;
  $('#acceptOrder').disabled=locked(selected);$('#acceptOrder').innerHTML=locked(selected)?`Сначала закрыть ${selected.requiresProjects} проект(а)`:'Вести переговоры <span>→</span>';
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
  $('#contractDeck').innerHTML=CONTRACT_CARDS.map(card=>`<button class="contract-card ${state.contract.cardsPlayed.includes(card.id)?'played':''}" data-contract-card="${card.id}" ${state.contract.cardsPlayed.includes(card.id)?'disabled':''}><strong>${card.title}</strong><small>${card.note}</small></button>`).join('');
  const ready=state.contract.cardsPlayed.length===2;$('#startMission').disabled=!ready;$('#startMission').innerHTML=ready?'Подписать и искать команду <span>→</span>':'Сначала договоритесь <span>→</span>';
}

function renderPreparation() {
  $('#prepBudget').textContent=money(state.budget);
  $('#mapGrid').innerHTML=state.contractors.map(contractor=>`<span class="map-node" style="--node:${contractor.color}">${contractor.initials}<small>${contractor.company}</small></span>`).join('');
  $('#teamPicker').innerHTML=state.team.map(member=>`<article class="prep-card"><span class="contractor-avatar" style="--crew-color:${member.color}">${member.initials}</span><span><strong>${member.name}</strong><small>${member.role} · ${member.effect}</small></span><button class="hire-button" data-team-hire="${member.id}" ${member.hired?'disabled':''}>${member.hired?'В ШТАБЕ':`${member.price}К`}</button></article>`).join('');
  $('#mapContractors').innerHTML=state.contractors.map(contractor=>`<article class="prep-card"><span class="contractor-avatar" style="--crew-color:${contractor.color}">${contractor.initials}</span><span><strong>${contractor.company}</strong><small>${contractor.name} · ${contractor.quirk}</small></span><button class="hire-button" data-map-hire="${contractor.id}" ${contractor.hired?'disabled':''}>${contractor.hired?'НАНЯТЫ':`${contractor.price}К`}</button></article>`).join('');
}

function renderDayPlan() {
  const dayIndex=Math.floor(state.elapsed/24);
  const candidates=scheduledTasksForDay(state,dayIndex);
  const hasSelectedTask=candidates.some(task=>task.enabledToday&&!['done','active'].includes(task.status));
  $('#planningTitle').textContent=`День ${dayIndex+1}: что сегодня действительно важно?`;
  $('#dayPlanList').innerHTML=candidates.map(task=>`<button class="day-plan-card ${task.enabledToday?'selected':''}" data-day-task="${task.id}"><span class="task-status" style="--task-color:${task.color}">${ICONS[task.reworkOf?'clean':task.id]??'↺'}</span><span><strong>${task.title}</strong><small>${task.duration} ч · ${SKILL_LABELS[task.skill]}${task.outOfSequence?' · РИСК ПОСЛЕДОВАТЕЛЬНОСТИ':''}</small></span><b>P${task.priority}</b></button>`).join('');
  if(!candidates.length)$('#dayPlanList').innerHTML='<div class="empty-day-plan">На этот день незавершённых работ по графику нет. Редкий управленческий успех.</div>';
  $('#startDay').disabled=!hasSelectedTask;
}

function scheduleStage(task) {
  if(['survey','project'].includes(task.id))return ['ПОДГОТОВКА / ПРОЕКТ','design'];
  if(['clean','executive-docs','inspect'].includes(task.id))return ['ПУСК / СДАЧА','handover'];
  return ['СТРОИТЕЛЬСТВО','build'];
}

function renderMasterSchedule() {
  ensureMasterSchedule(state);
  const ordered=[...state.tasks].sort((a,b)=>a.scheduleOrder-b.scheduleOrder);
  const dayCount=Math.max(6,Math.min(18,Math.max(...ordered.map(task=>task.plannedFinishDay))+2));
  const header=Array.from({length:dayCount},(_,index)=>`<span>Д${index+1}</span>`).join('');
  $('#scheduleCalendar').innerHTML=`<div class="schedule-days"><span>РАБОТА</span><div>${header}</div><span>НАСТРОЙКА</span></div>${ordered.map((task,index)=>{
    const [stage,stageClass]=scheduleStage(task);const start=Math.min(dayCount-1,task.plannedStartDay);const finish=Math.min(dayCount-1,task.plannedFinishDay);const left=start/dayCount*100;const width=Math.max(100/dayCount,(finish-start+1)/dayCount*100);
    const conflict=task.deps.some(id=>(state.tasks.find(item=>item.id===id)?.plannedFinishDay??0)>task.plannedStartDay);
    return `<article class="schedule-row ${conflict?'conflict':''}" data-schedule-row="${task.id}"><div class="schedule-task"><span>${String(index+1).padStart(2,'0')}</span><div><strong>${task.title}</strong><small>${stage} · ${task.duration} ч${conflict?' · КОНФЛИКТ ЗАВИСИМОСТИ':''}</small></div></div><div class="schedule-track" style="--schedule-days:${dayCount}"><i class="${stageClass}" style="left:${left}%;width:${width}%"><b>${Math.round(task.progress*100)}%</b></i></div><div class="schedule-controls"><button data-schedule-order="-1" data-schedule-task="${task.id}" aria-label="Поднять работу">↑</button><button data-schedule-day="-1" data-schedule-task="${task.id}" aria-label="Сдвинуть раньше">−</button><b>Д${task.plannedStartDay+1}</b><button data-schedule-day="1" data-schedule-task="${task.id}" aria-label="Сдвинуть позже">+</button><button data-schedule-order="1" data-schedule-task="${task.id}" aria-label="Опустить работу">↓</button></div></article>`;
  }).join('')}`;
  const conflicts=ordered.filter(task=>task.deps.some(id=>(state.tasks.find(item=>item.id===id)?.plannedFinishDay??0)>task.plannedStartDay)).length;
  $('#scheduleWarning').textContent=conflicts?`${conflicts} конфликт(а) зависимостей. Принять можно — переделки тоже можно.`:'Зависимости согласованы. Изменения попадут в утренние планёрки.';
}

function openMasterSchedule() {
  if(!state.selectedOrder){showToast('Сначала выберите заказ.');return;}
  scheduleWasPaused=state.paused;state.paused=true;renderMasterSchedule();refs.schedule.classList.add('visible');
}

function closeMasterSchedule() {
  refs.schedule.classList.remove('visible');
  if(state.started)state.paused=scheduleWasPaused;else refs.market.classList.add('visible');
}

function projectTime(hourOffset=0) {
  const workHour=9+((state.elapsed+hourOffset)%24);
  const hours=Math.floor(workHour)%24;const minutes=Math.floor((workHour-Math.floor(workHour))*60);
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
}

function renderWhatsapp() {
  const pending=state.tasks.filter(task=>!['done','active'].includes(task.status));
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
  boss:{to:'Виктор Аркадьевич · руководство',cc:'Финансовый директор; PMO',subject:'Запрос дополнительного резерва',body:'В связи с уточнением объёмов просим открыть резерв проекта. План корректирующих мероприятий и прогноз до завершения приложены.',effect:'+20 тыс. ₽ · −2 доверие',attachment:'Прогноз_денег_финал_v3.xlsx'},
  contractors:{to:'Руководители подрядных организаций',cc:'Технический надзор; Юридический отдел',subject:'Претензия по качеству и срокам работ',body:'Настоящим фиксируем отставание и замечания к качеству. Просим предоставить корректирующий план и устранить нарушения в установленный срок.',effect:'+1 качество · −10 тыс. ₽',attachment:'Фотофиксация_замечаний.zip'},
};

function renderEmailComposer(templateId=selectedEmailTemplate) {
  selectedEmailTemplate=templateId;const template=EMAIL_TEMPLATES[templateId];
  $('#communicationActions').innerHTML=`<div class="mail-shell"><div class="mail-ribbon"><strong>Новое сообщение</strong><span>Файл</span><span>Сообщение</span><span>Вставка</span><span>Параметры</span></div><div class="mail-workspace"><nav class="mail-templates"><span>ШАБЛОН ПИСЬМА</span>${Object.entries(EMAIL_TEMPLATES).map(([id,item])=>`<button class="${id===templateId?'active':''}" data-email-template="${id}">${id==='client'?'Запросить решение':id==='boss'?'Запросить резерв':'Выставить претензию'}<small>${item.effect}</small></button>`).join('')}</nav><div class="mail-compose"><label><span>Кому</span><input value="${escapeHtml(template.to)}" readonly></label><label><span>Копия</span><input value="${escapeHtml(template.cc)}" readonly></label><label><span>Тема</span><input value="${escapeHtml(template.subject)}" readonly></label><textarea aria-label="Текст письма">${escapeHtml(template.body)}</textarea><div class="mail-attachment">▧ ${escapeHtml(template.attachment)} <small>248 КБ</small></div><div class="mail-send-row"><button class="mail-send" data-send-email="${templateId}">Отправить</button><span>Последствие: <b>${template.effect}</b></span></div></div></div></div>`;
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
  const baseRows=[];
  for(let index=0;index<36;index++) {
    const task=state.tasks[index%state.tasks.length];const crew=state.crews.find(item=>item.id===task.crewId);
    const actual=Math.round(task.duration*Math.max(.15,task.progress)*10)/10;const variance=Math.round((actual-task.duration/(1+(index%3)*.08))*10)/10;
    baseRows.push(`<tr><td>${index+1}</td><td>1.${Math.floor(index/6)+1}.${index%6+1}</td><td>${task.title}${index>=state.tasks.length?' · уточняющая строка':''}</td><td>${task.duration.toFixed(1)}</td><td>${actual.toFixed(1)}</td><td>${variance>0?'+':''}${variance.toFixed(1)}</td><td>${STATUS_LABELS[task.status]??task.status}</td><td>${crew?.name??'Не назначен'}</td><td>${index%4===0?'Ожидается уточнение после уточнения':index%4===1?'Без критических критических замечаний':index%4===2?'В работе согласно текущей версии текущего графика':'Требуется письмо'}</td></tr>`);
  }
  $('#reportRows').innerHTML=baseRows.join('');
  $('#reportSummary').textContent=`36 строк · ${state.tasks.filter(t=>t.status==='done').length} закрыто · файл весит больше, чем управленческое решение`;
  refs.report.classList.add('visible');
}

function renderTeamBook() {
  const teamRows=state.team.map(member=>{const crew=state.crews.find(item=>item.id===`team-${member.id}`)||(member.id==='pm'?state.crews.find(item=>item.id==='foreman'):null);const away=crew&&(crew.unavailableUntil??0)>state.elapsed;return `<article class="book-person"><i style="--person:${member.color}">${member.initials}</i><span><strong>${member.name}</strong><small>${member.role} · ${member.effect}</small></span><b class="${!member.hired||away?'away':''}">${!member.hired?'НЕ НАНЯТ':away?'НЕТ НА ОБЪЕКТЕ':crew?.taskId?'В РАБОТЕ':'НА ОБХОДЕ'}</b></article>`;});
  const contractorRows=state.contractors.map(item=>{const crew=state.crews.find(crew=>crew.id===`crew-${item.id}`);return `<article class="book-person"><i style="--person:${item.color}">${item.initials}</i><span><strong>${item.company}</strong><small>${item.name} · форма ${item.color} · ${item.quirk}</small></span><b class="${item.hired?'':'away'}">${item.hired?(crew?.taskId?'РАБОТАЕТ':'НА ОБЪЕКТЕ'):'НЕ НАНЯТЫ'}</b></article>`;});
  $('#teamBook').innerHTML=`<div class="subheading"><span>ВАША КОМАНДА</span><strong>${state.team.filter(item=>item.hired).length}</strong></div>${teamRows.join('')}<div class="subheading" style="margin-top:16px"><span>ПОДРЯДЧИКИ</span><strong>${state.contractors.filter(item=>item.hired).length}</strong></div>${contractorRows.join('')}`;
}

function renderFinanceBook() {
  const finance=state.finance??{ledger:[],received:0,spent:0};
  $('#financeKpis').innerHTML=`<div><small>НА СЧЁТЕ</small><strong>${money(state.budget)}</strong></div><div><small>ПОЛУЧЕНО</small><strong>${money(finance.received??0)}</strong></div><div><small>ПОТРАЧЕНО</small><strong>${money(finance.spent??0)}</strong></div>`;
  $('#cashLedger').innerHTML=(finance.ledger??[]).map(row=>`<article class="cash-row ${row.type}"><span>Д${Math.floor((row.hour??0)/24)+1} · ${row.category}</span><div>${row.text}<small>${row.type==='income'?'Деньги существуют до следующей поставки.':'Оплачено, поэтому теперь можно спорить о качестве.'}</small></div><b>${row.type==='income'?'+':'−'}${money(row.amount)}</b></article>`).join('')||'<p>Бухгалтерия ещё не нашла этот проект.</p>';
}

function renderDocsBook() {
  const project=state.tasks.find(task=>task.id==='project');const executive=state.tasks.find(task=>task.id==='executive-docs');
  const sheet=(title,task,code)=>`<article class="drawing-sheet"><h3>${title}</h3><p>${task?.title??'Раздел пока не предусмотрен договором, но понадобится на приёмке.'}</p><div class="drawing-plan"></div><div class="drawing-progress"><i style="width:${Math.round((task?.progress??0)*100)}%"></i></div><footer><span>${code}</span><span>${Math.round((task?.progress??0)*100)}% · ${STATUS_LABELS[task?.status]??'НЕ НАЧАТО'}</span></footer></article>`;
  $('#drawingBoard').innerHTML=sheet('РАБОЧИЙ ПРОЕКТ',project,'РД-АР/ОВ/ЭОМ')+sheet('ИСПОЛНИТЕЛЬНАЯ',executive,'ИД-АКТ/СХЕМА/ПАСПОРТ');
}

function taskProblem(task) {
  if(task.reworkOf)return 'Переделка из-за неверной последовательности работ';
  if(task.status==='blocked')return `Не хватает ${Math.max(0,task.cost-state.budget)} тыс. ₽ на запуск`;
  const activeQuestion=(state.activeSituations??[]).find(item=>item.crewId===task.crewId);
  if(activeQuestion)return situationById.get(activeQuestion.templateId)?.title??'Бригада ждёт решения';
  const crew=task.crewId?state.crews.find(item=>item.id===task.crewId):null;
  if(crew&&(crew.unavailableUntil??0)>state.elapsed)return 'Исполнитель временно снят с объекта';
  if(task.outOfSequence&&task.status!=='done')return 'Риск: работа начата раньше зависимостей';
  if(task.status==='locked') {
    const waiting=task.deps.map(id=>state.tasks.find(item=>item.id===id)?.short).filter(Boolean);
    return waiting.length?`Ждёт: ${waiting.join(', ')}`:'Ждёт предыдущие работы';
  }
  if(task.status==='ready'&&state.started&&!state.crews.some(item=>item.skill===task.skill))return `Нет исполнителя: ${SKILL_LABELS[task.skill]}`;
  if(task.status==='ready'&&state.started&&!task.enabledToday)return 'Не включено в план текущего дня';
  return '';
}

function taskStatus(task) {
  if(task.status==='done')return ['ГОТОВО','done'];
  if(task.status==='active')return ['ИДЁТ','active'];
  if(task.status==='blocked')return ['ПРОБЛЕМА','problem'];
  if(task.status==='locked')return ['ОЖИДАЕТ','waiting'];
  if(task.enabledToday)return ['В ПЛАНЕ','planned'];
  return ['К СТАРТУ','ready'];
}

function renderTasks() {
  refs.taskList.innerHTML = state.tasks.map((task) => {
    const percent = Math.round(task.progress * 100);
    const [statusLabel,statusClass]=taskStatus(task);
    const issue=taskProblem(task);
    return `<article class="task-card ${task.status} ${issue?'has-problem':''} ${state.selectedTaskId === task.id ? 'selected' : ''}" data-task="${task.id}" style="--task-color:${task.color};--progress:${percent}%">
      <span class="task-status">${task.status === 'done' ? '✓' : (ICONS[task.reworkOf?'clean':task.id]??'◆')}</span>
      <span class="task-copy">
        <span class="task-title-row"><strong>${task.title}</strong><b class="task-state ${statusClass}">${statusLabel}</b></span>
        <span class="task-progress-row"><i><em style="width:${percent}%"></em></i><b>${percent}%</b><small>${SKILL_LABELS[task.skill]} · ${task.duration} ч</small></span>
        ${issue?`<span class="task-problem">! ${issue}</span>`:''}
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
    <span class="contractor-copy"><strong>${contractor.company}</strong><small>${contractor.name} · ${contractor.quirk}</small><span class="contractor-meta"><b>★ ${contractor.rating}</b><b>↗ ${Math.round((contractor.speed - 1) * 100)}% темп</b></span></span>
    <button class="hire-button" data-hire="${contractor.id}" ${contractor.hired||state.started ? 'disabled' : ''}>${contractor.hired ? 'НАНЯТЫ' : state.started?'КАРТА':`${contractor.price}К`}</button>
  </article>`).join('');
}

function renderCrews() {
  refs.crewList.innerHTML = state.crews.map((crew) => {
    const task = state.tasks.find((item) => item.id === crew.taskId);
    return `<article class="crew-card"><span class="crew-avatar" style="--crew-color:${crew.color}">${crew.initials}</span><span><strong>${crew.name}</strong><small>${task ? task.short : crew.role}</small></span><span class="crew-state ${task ? '' : 'idle'}">${task ? 'РАБОТАЕТ' : 'ЖДЁТ'}</span></article>`;
  }).join('');
  refs.crewCount.textContent = `${state.crews.length} ${state.crews.length === 1 ? 'человек' : 'бригад'}`;
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
    const action=data.isSmoker?'Обсуждает проблему, не двигаясь к ней':task?.title??roleActions[data.role]??'Ожидает доступную работу';
    refs.selection.hidden=false;
    refs.selection.style.setProperty('--task-color',data.role==='client'?'#d6a579':data.role==='architect'?'#d87561':'#ddff55');
    refs.selection.innerHTML=`<div class="selection-top"><div><span class="eyebrow">ПЕРСОНАЖ</span><h3>${data.displayName}</h3></div><strong>${data.role==='police'?'★':'●'}</strong></div>
      <p><b>${data.job}${data.company?` · ${data.company}`:''}</b></p>
      <p><span class="person-label">НАСТРОЕНИЕ</span>${mood}</p>
      <p><span class="person-label">ДУМАЕТ</span>${thought}</p>
      <p><span class="person-label">ДЕЛАЕТ</span>${action}</p>`;
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
  refs.selection.innerHTML = `<div class="selection-top"><div><span class="eyebrow">${SKILL_LABELS[task.skill].toUpperCase()}</span><h3>${task.title}</h3></div><strong>${Math.round(task.progress * 100)}%</strong></div>
    <p>${crew ? `${crew.name} уже на месте. Осталось примерно ${Math.max(1, Math.ceil(task.duration * (1 - task.progress) / crew.speed))} ч.` : task.status === 'locked' ? 'Сначала завершите зависимые работы. Бетон не читает диаграмму Ганта, но всё равно требует последовательности.' : task.status === 'done' ? 'Работа закрыта. Фото приложены, замечания предусмотрительно не найдены.' : 'Свободная подходящая бригада возьмёт эту работу автоматически.'}</p>
    <div class="selection-progress"><i style="width:${Math.round(task.progress * 100)}%"></i></div>`;
}

function renderHud() {
  const done = state.tasks.filter((task) => task.status === 'done').length;
  const deadline=state.contract?.deadlineHours??DEADLINE_HOURS;
  const initialBudget=state.contract?.budget??INITIAL_BUDGET;
  const remaining = deadline - state.elapsed;
  const clock = formatClock(state.elapsed);
  const risk = getRisk(state);
  refs.budget.textContent = money(state.budget);
  refs.budgetDelta.textContent = `оплачено ${money(state.finance?.spent??Math.max(0,initialBudget-state.budget))}`;
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
  refs.siteStatus.textContent = state.paused ? 'Пауза на объекте' : active ? `${active} работ в процессе` : 'Прораб изучает горизонт';
  $('#pauseButton').innerHTML = state.paused
    ? '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M7 5v14M17 5v14"/></svg>';
  const sitePause=$('#sitePauseButton');
  sitePause?.classList.toggle('is-paused',state.paused);
  if(sitePause)sitePause.innerHTML=state.paused?'▶ <span>ПРОДОЛЖИТЬ</span>':'Ⅱ <span>ПАУЗА</span>';
  document.querySelectorAll('[data-speed]').forEach((button) => button.classList.toggle('active', Number(button.dataset.speed) === state.speed));
  renderAmbientBeat();
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

function makeTruck() {
  const truck=new THREE.Group();
  box('truck-cargo',[1.35,.92,1.9],[0,.72,0],mat('#d7ddd6'),truck);
  box('truck-cab',[1.35,.85,.8],[0,.63,1.32],mat('#d87561'),truck);
  box('windshield',[1.08,.34,.025],[0,.82,1.73],mat('#6f999b',.2,.25),truck);
  for(const x of [-.58,.58])for(const z of [-.58,1.28]) {
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.23,.23,.16,18),mat('#171b19',.45));wheel.rotation.z=Math.PI/2;wheel.position.set(x,.27,z);truck.add(wheel);
  }
  return truck;
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
  sprite.scale.set(1.05,.44,1);sprite.position.y=1.57;sprite.visible=false;sprite.renderOrder=20;return sprite;
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

function makeCapsule(radius, length, color, roughness=.72) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius,length,5,10),mat(color,roughness));
  mesh.castShadow=true;
  return mesh;
}

function makePerson({ role='worker', color='#e9ad52', skin='#d6a47d', variant=0, profile } = {}) {
  const person=new THREE.Group();
  profile ??= createPersonProfile(role, state.visualSeed ?? 1, variant);
  skin=profile.skin??skin;
  const isWorker=['worker','foreman','moving','paint','electric','furniture','cleaning','delivery'].includes(role);
  const isForeman=role==='foreman';
  const isSuit=['client','boss','inspector'].includes(role);
  const trouserColor=isSuit?'#1e2b33':role==='architect'?'#27302e':role==='police'?'#172c48':role==='medic'?'#d8e4df':'#343e39';

  const leftLeg=makeCapsule(.06,.29,trouserColor); leftLeg.position.set(-.095,.25,0); person.add(leftLeg);
  const rightLeg=makeCapsule(.06,.29,trouserColor); rightLeg.position.set(.095,.25,0); person.add(rightLeg);
  const leftShoe=box('shoe',[.13,.07,.22],[-.095,.055,.045],mat('#151a18',.55),person); leftShoe.rotation.y=.04;
  const rightShoe=box('shoe',[.13,.07,.22],[.095,.055,.045],mat('#151a18',.55),person); rightShoe.rotation.y=-.04;

  const torsoColor=role==='client'?'#31495a':role==='boss'?'#3c3545':role==='inspector'?'#48565b':role==='architect'?'#79525d':role==='police'?'#1f4168':role==='medic'?'#e8efeb':color;
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
    const helmetColor=isForeman?'#f0f2e9':'#f2c84e';
    const dome=new THREE.Mesh(new THREE.SphereGeometry(.158,16,8,0,Math.PI*2,0,Math.PI/2),mat(helmetColor,.38,.08)); dome.position.y=1.16; dome.castShadow=true; person.add(dome);
    const brim=new THREE.Mesh(new THREE.CylinderGeometry(.19,.19,.035,18),mat(helmetColor,.38,.08)); brim.position.set(0,1.155,.025); brim.castShadow=true; person.add(brim);
    const vest=box('safety-vest',[.29,.24,.17],[0,.7,.075],mat(isForeman?'#d9f45b':color,.7),person);
    box('vest-stripe',[.3,.026,.178],[0,.68,.079],mat('#eef3dc',.45,.05),person);
    if(role==='electric') box('tool-bag',[.16,.18,.12],[.23,.44,-.03],mat('#284a5e'),person);
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
  const hitbox=new THREE.Mesh(new THREE.CapsuleGeometry(.36,1.02,4,8),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false}));
  hitbox.position.y=.62;person.add(hitbox);
  const bubbleText=bubbleFor(role,profile.bubbleVariant+variant);
  const bubble=makeBubbleSprite(bubbleText);person.add(bubble);
  const alertBubble=makeBubbleSprite('!');alertBubble.scale.set(.48,.48,1);alertBubble.position.set(.22,1.58,0);person.add(alertBubble);

  const names=PERSON_NAMES[role]??PERSON_NAMES.worker;
  const displayName=role==='client'&&state.selectedOrder?.clientPerson?state.selectedOrder.clientPerson:(['police','inspector','boss','medic'].includes(role)?names[variant%names.length]:profile.name);
  const personScale=.74;
  person.scale.set(profile.body*personScale,profile.height*personScale,profile.body*personScale);
  person.userData={isPerson:true,role,displayName,job:PERSON_JOBS[role]??PERSON_JOBS.worker,leftLeg,rightLeg,leftArm,rightArm,variant,bubble,alertBubble,profile};
  return person;
}

function makeCrewMesh(crew) {
  const group = new THREE.Group();
  const role=crew.id==='foreman'?'foreman':crew.skill==='design'?'architect':crew.skill==='documentation'?'foreman':crew.supportRole==='procurement'?'client':crew.supportRole?'foreman':crew.skill;
  const areaWorkers=Math.min(3,Math.floor((state.selectedOrder?.area??280)/700));
  const count=crew.id==='foreman'||crew.id.startsWith('team-')?1:2+areaWorkers+((state.visualSeed??1)+crew.id.length)%2;
  const people=[];
  for(let i=0;i<count;i++) {
    const profile=createPersonProfile(role,(state.visualSeed??1)+crew.id.length*41,i);
    const person=makePerson({role,color:crew.color,variant:i,profile});
    person.userData.crewId=crew.id;person.userData.company=crew.name;
    if(crew.id.startsWith('team-'))person.userData.job=crew.role;
    person.position.set((i-.5*(count-1))*.38,0,i*.18);person.userData.baseLocal=person.position.clone();person.rotation.y=i?.28:-.16; group.add(person); people.push(person);
  }
  group.userData={crewId:crew.id,people}; group.position.set(siteX(crew.x),.03,siteZ(crew.y)); office.add(group); crewMeshes.set(crew.id,group); return group;
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

makeOffice();
sceneProps.scalableAssets=office.children.filter(child=>![sceneProps.yard,sceneProps.architect,sceneProps.client].includes(child));
sceneProps.scalableAssets.forEach(child=>{child.userData.baseTransform={position:child.position.clone(),scale:child.scale.clone()};});
makeTaskMarkers();

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
  const prepStage=state.tasks.find(task=>task.id==='prep');
  const paintStage=state.tasks.find(task=>task.id==='paint');
  const structureReady=siteType!=='field'||prepStage?.status==='done'||(prepStage?.progress??0)>.35;
  const fitoutReady=siteType==='existing'||paintStage?.status==='done'||(paintStage?.progress??0)>.45;
  const structureNames=new Set(['north-wall','west-wall','window','glass-wall','core-left','core-divider','core-front-a','core-front-b','core-front-c','toilet-asset','sink-asset','toilet-sign-a','toilet-sign-b','entry-door','access-control']);
  const fitoutNames=new Set(['meeting-table','chair-asset','pantry-counter','pantry-top','fridge','high-table','storage','printer','sofa-asset','plant-asset','reception','entry-mat']);
  for(const child of office.children) {
    if(structureNames.has(child.name))child.visible=structureReady&&(child.userData.profileVisible??true);
    if(fitoutNames.has(child.name))child.visible=fitoutReady&&(child.userData.profileVisible??true);
  }
  for (const task of state.tasks) {
    const group=markerMeshes.get(task.id); if(!group) continue;
    group.visible=task.status!=='done';
    group.children[0].material.opacity=task.status==='locked'?.16:task.status==='active'?.95:.68;
    group.children[1].scale.setScalar(task.status==='active' ? .6 + task.progress*.9 : 1);
    group.children[2].material.opacity=task.status==='locked'?.32:1;
  }
  for(const crew of state.crews) if(!crewMeshes.has(crew.id)) makeCrewMesh(crew);
  for(const [crewId,mesh] of crewMeshes) {
    const crew=state.crews.find(item=>item.id===crewId);
    mesh.visible=Boolean(crew)&&((crew.unavailableUntil??0)<=state.elapsed);
    if(mesh.userData.people?.length>1) mesh.userData.people[1].visible=!state.smokeBreak;
  }
  syncEventActors();
  const ambientKind=state.ambientBeat?.kind;
  const ambientBreak=ambientKind==='break';
  sceneProps.smokers.forEach((smoker,index)=>{smoker.visible=state.started&&(index===0||state.smokeBreak||ambientBreak);});
  sceneProps.smokePuffs.forEach(puff=>{puff.visible=state.started&&(state.smokeBreak||ambientBreak||sceneProps.smokers[0]?.visible);});

  const moveTask=state.tasks.find(t=>t.id==='move');
  const electricTask=state.tasks.find(t=>t.id==='electric');
  const prepTask=state.tasks.find(t=>t.id==='prep');
  const paintTask=state.tasks.find(t=>t.id==='paint');
  const deskTask=state.tasks.find(t=>t.id==='desks');
  const cleanTask=state.tasks.find(t=>t.id==='clean');
  const inspectTask=state.tasks.find(t=>t.id==='inspect');

  const prepProgress=prepTask?.status==='done'?1:prepTask?.progress??0;
  const partitionBase=siteType==='existing'?.18:0;
  const partitionProgress=Math.max(partitionBase,prepProgress);
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

  const engineeringProgress=electricTask?.status==='done'?1:electricTask?.progress??0;
  sceneProps.engineering.visible=engineeringProgress>.01;
  sceneProps.engineeringSegments.forEach((segment,index)=>{
    const fraction=THREE.MathUtils.clamp(engineeringProgress*sceneProps.engineeringSegments.length-index,0,1);
    segment.scale.x=segment.geometry.parameters?.width>1?Math.max(.02,fraction):1;
    segment.scale.z=segment.geometry.parameters?.depth>1?Math.max(.02,fraction):1;
    segment.visible=fraction>.01;
  });
  const ceilingCount=Math.round(engineeringProgress*sceneProps.ceilingTiles.children.length);
  sceneProps.ceilingTiles.children.forEach((panel,index)=>{panel.visible=index<ceilingCount;panel.position.y=2.32+Math.min(1,engineeringProgress*sceneProps.ceilingTiles.children.length-index)*.2;});

  const finishProgress=paintTask?.status==='done'?1:paintTask?.progress??0;
  sceneProps.finishBands.children.forEach((band,index)=>{const fraction=THREE.MathUtils.clamp(finishProgress*sceneProps.finishBands.children.length-index,0,1);band.visible=fraction>.01;band.scale.y=Math.max(.02,fraction);band.position.y=.04+.73*fraction;band.material.color.set(state.sceneEffect?.wallColor??visualProfile.theme.wall);});
  sceneProps.handover.visible=inspectTask?.status==='done'||(inspectTask?.progress??0)>.65;

  const cratesRemoved=moveTask?.status==='done'?sceneProps.crates.children.length:Math.floor((moveTask?.progress??0)*sceneProps.crates.children.length);
  sceneProps.crates.children.forEach((crate,index)=>{crate.visible=index<sceneProps.crates.children.length-cratesRemoved;});

  const layoutDeskCount=Math.min(sceneProps.desks.length,Math.max(4,Math.round((state.selectedOrder?.area??600)/180)));
  const deskAmount=deskTask?.status==='done'?layoutDeskCount:deskTask?.status==='active'?Math.max(1,Math.ceil(deskTask.progress*layoutDeskCount)):0;
  sceneProps.desks.forEach((desk,index)=>{
    desk.visible=index<deskAmount;
    if(desk.visible){const build=Math.min(1,Math.max(.18,(deskTask?.progress??1)*sceneProps.desks.length-index));desk.scale.y=build;}
  });

  const prepStarted=['active','done'].includes(prepTask?.status);
  const paintDone=paintTask?.status==='done';
  sceneProps.protection.visible=prepStarted&&!paintDone;
  sceneProps.paint.visible=prepStarted&&!paintDone;
  sceneProps.cables.visible=electricTask?.status!=='done';
  const constructionStarted=state.tasks.some(task=>task.id!=='survey'&&['active','done'].includes(task.status));
  sceneProps.debris.visible=constructionStarted&&cleanTask?.status!=='done';
  const activePhysical=state.tasks.find(task=>task.status==='active'&&['move','electric','prep','paint','desks','clean'].includes(task.id));
  const ambientPhysical=['drill','cleanup','power-test'].includes(ambientKind);
  sceneProps.workParticles.forEach(particle=>{particle.visible=Boolean(activePhysical||ambientPhysical);particle.userData.taskId=activePhysical?.id??(ambientKind==='cleanup'?'clean':'electric');});
  const beatTask=state.ambientBeat?.taskId?state.tasks.find(task=>task.id===state.ambientBeat.taskId):null;
  sceneProps.measureTape.visible=ambientKind==='measurement';
  if(sceneProps.measureTape.visible){sceneProps.measureTape.position.set(siteX(beatTask?.x??3.6),.02,siteZ(beatTask?.y??2.5));}
  sceneProps.beacon.visible=ambientKind==='delivery';

  const electricPower=state.sceneEffect?.lightPower??(electricTask?.status==='done'?1:electricTask?.status==='active'?electricTask.progress:0);
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
    sceneProps.debris.children.forEach((item,index)=>{item.visible=sceneProps.debris.visible&&index<visibleCount;});
  }
}

function indexedFieldColor(tile) {
  const index=sceneProps.floorTiles.indexOf(tile);
  return index%3===0?'#758060':index%3===1?'#667252':'#75684d';
}

function animateScene(now) {
  const t=now*.001;
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
    const patrol=crew.taskId||crew.id==='foreman'||crew.id.startsWith('team-');
    const wander=groupMoment?.08:patrol?(crew.taskId ? .34 : .72):0;
    const phase=crewIndex*1.73;
    const routeX=Math.sin(t*.48+phase)+Math.sin(t*.19+phase*.7)*.34;
    const routeZ=Math.cos(t*.37+phase*.82)+Math.sin(t*.23+phase)*.28;
    const target=new THREE.Vector3(siteX(crew.x)+routeX*wander,.03,siteZ(crew.y)+routeZ*wander);
    const delta=target.clone().sub(mesh.position);
    mesh.rotation.y=0;
    mesh.position.lerp(target,.055);
    if(patrol) {
      mesh.position.y=.03+Math.abs(Math.sin(t*6.6+crew.x))*.065;
      for(const [index,person] of mesh.userData.people.entries()) {
        const physical=['moving','paint','electric','furniture','cleaning'].includes(crew.skill)&&crew.taskId&&!groupMoment;
        const deliveryCycle=(t*.075+crewIndex*.17)%1;
        const travel=physical&&index===0?(deliveryCycle<.45?THREE.MathUtils.smoothstep(deliveryCycle,0,.45):deliveryCycle<.56?1:THREE.MathUtils.smoothstep(1-deliveryCycle,0,.44)):0;
        const base=person.userData.baseLocal;
        const yardX=(6.25+(footprintScale()-1)*5.2)-mesh.position.x;const yardZ=1.2-mesh.position.z;
        person.position.x=THREE.MathUtils.lerp(base.x+Math.sin(t*1.35+index)*.08,yardX,travel);person.position.z=THREE.MathUtils.lerp(base.z+Math.cos(t*1.05+index)*.1,yardZ,travel);
        const walking=travel>.03&&travel<.97;const swing=Math.sin(t*(walking?10.2:6.4)+index)*(.22+(walking?.48:.08));
        const workBeat=crew.taskId?Math.sin(t*4.6+index):0;
        person.userData.leftLeg.rotation.x=swing; person.userData.rightLeg.rotation.x=-swing;
        const argumentMotion=inBeat&&beatKind==='argument'?Math.sin(t*7.4+index)*.72:0;
        const briefingPose=inBeat&&beatKind==='briefing'?(index%2?-.25:.3):0;
        const paintMotion=crew.skill==='paint'&&!walking?workBeat*.82:0;const drillMotion=(crew.skill==='electric'||beatKind==='drill')&&!walking?Math.sin(t*18+index)*.34:0;const carryPose=walking&&physical?-.72:0;
        person.userData.leftArm.rotation.x=-swing*.55+paintMotion+carryPose;person.userData.rightArm.rotation.x=swing*.55+drillMotion+(crew.skill==='furniture'&&!walking?-.55:carryPose);
        person.userData.leftArm.rotation.z=argumentMotion+briefingPose;
        person.userData.rightArm.rotation.z=-argumentMotion-briefingPose;
        person.rotation.y=walking?Math.atan2(yardX-base.x,yardZ-base.z)+(deliveryCycle>.56?Math.PI:0):groupMoment?(index%2?-.9:.9):Math.sin(t*.4+index)*.25;
        person.userData.bubble.visible=!walking&&(groupMoment||Math.sin(t*.9+index*2.1+crew.x)>.78);
      }
    } else {
      mesh.position.y=.03;
      for(const person of mesh.userData.people) {
        person.userData.leftLeg.rotation.x=0;person.userData.rightLeg.rotation.x=0;
        person.userData.leftArm.rotation.x=Math.sin(t*1.7+crew.x)*.05;person.userData.rightArm.rotation.x=-Math.sin(t*1.7+crew.x)*.05;
        person.rotation.y=Math.sin(t*.22+(person.userData.variant??0))*.32;person.userData.bubble.visible=Math.sin(t*.42+(person.userData.variant??0)*2.4)>.9;
      }
    }
    const hasQuestion=(state.activeSituations??[]).some(item=>item.crewId===crew.id);
    mesh.userData.people.forEach((person,index)=>{person.userData.alertBubble.visible=hasQuestion&&index===0;if(hasQuestion)person.userData.bubble.visible=false;});
  }

  const activeTask=state.tasks.find(task=>task.status==='active'&&['move','electric','prep','paint','desks','clean'].includes(task.id));
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
  }
  if(sceneProps.client?.visible) {
    sceneProps.client.position.z=2.25+Math.sin(t*.22)*.28;
    sceneProps.client.rotation.y=-2.35+Math.sin(t*.19)*.18;
    sceneProps.client.userData.leftArm.rotation.x=Math.sin(t*(beatKind==='inspection'?2.2:.9))*(beatKind==='inspection'?.28:.12);
    sceneProps.client.userData.bubble.visible=beatKind==='inspection'||beatKind==='briefing';
  }
  for(const [index,actor] of (sceneProps.eventActors??[]).entries()) {
    actor.position.y=.03+Math.abs(Math.sin(t*2.2+index))*.025;
    actor.userData.leftArm.rotation.x=Math.sin(t*1.4+index)*.1;
    actor.userData.rightArm.rotation.x=-Math.sin(t*1.4+index)*.1;
    actor.userData.bubble.visible=Math.sin(t*.75+index*1.8)>.62;
  }
  if(sceneProps.truck) {
    sceneProps.truck.position.z=beatKind==='delivery'?3.05:5.4-((t*.62)%11.4);
    sceneProps.truck.rotation.y=Math.PI;
    const doorOpen=Math.abs(sceneProps.truck.position.z-3.0)<1.25||sceneProps.client?.visible;
    sceneProps.entryDoor.rotation.y=THREE.MathUtils.lerp(sceneProps.entryDoor.rotation.y,doorOpen?-1.12:0,.06);
  }
  if(sceneProps.beacon?.visible){sceneProps.beacon.rotation.y=t*4.8;sceneProps.beacon.userData.lamp.material.emissiveIntensity=1.4+Math.sin(t*12)*.8;}
  if(sceneProps.measureTape?.visible){sceneProps.measureTape.rotation.y=Math.sin(t*.55)*.18;sceneProps.measureTape.scale.x=.82+Math.sin(t*1.8)*.16;}
  for(const [index,smoker] of sceneProps.smokers.entries()) {
    if(!smoker.visible)continue;
    smoker.position.y=.02+Math.sin(t*1.4+index)*.012;
    smoker.userData.leftArm.rotation.x=-.6+Math.sin(t*2+index)*.18;
    smoker.userData.bubble.visible=Math.sin(t*.55+index*2)>.72;
  }
  for(const [index,puff] of sceneProps.smokePuffs.entries()) {
    if(!puff.visible)continue;
    const cycle=(t*.22+index*.17)%1;
    puff.position.y=.9+cycle*1.15;puff.position.x=6.15+(index%3)*.48+Math.sin(t+index)*.08;
    puff.material.opacity=(1-cycle)*.24;
  }
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
  if(taskId){selectedPerson=null;state.selectedTaskId=taskId;renderTasks();renderSelection();}
});
refs.canvas.addEventListener('wheel',(event)=>{event.preventDefault();cameraZoom=Math.max(.72,Math.min(1.65,cameraZoom-event.deltaY*.0007));updateCamera();},{passive:false});

function openEvent(eventId) {
  const event=EVENT_COPY[eventId]; if(!event)return;
  eventShowing=eventId; state.paused=true;
  $('#eventKicker').textContent=event.kicker; $('#eventTitle').textContent=event.title; $('#eventText').textContent=event.text;
  $('#eventOptions').innerHTML=event.options.map(option=>`<button class="event-option" data-event-choice="${option.id}"><strong>${option.title}</strong><span>${option.effect}</span><small>${option.note}</small></button>`).join('');
  refs.event.classList.add('visible');
}

function deltaText(deltas){return [['budget','тыс. ₽'],['time','ч'],['quality','качество'],['trust','доверие']].filter(([key])=>deltas[key]).map(([key,label])=>`${deltas[key]>0?'+':''}${deltas[key]} ${label}`).join(' · ')||'без прямых затрат';}
function showSituation(active){
  const template=situationById.get(active.templateId);if(!template)return;
  openSituationId=active.uid;state.paused=true;$('#situationTitle').textContent=template.title;$('#situationText').textContent=template.text;
  $('#situationOptions').innerHTML=template.choices.map(choice=>`<button class="event-option" data-situation-choice="${choice.id}"><strong>${choice.title}</strong><span>${deltaText(choice.deltas)}</span><small>${choice===template.choices[0]?'Разобраться сейчас и оставить след в документах.':'Быстрое решение, которое удобно исполнителю.'}</small></button>`).join('');refs.situation.classList.add('visible');
}

function showResult() {
  if(resultShown)return; resultShown=true;
  const result=getResult(state); const onTime=result.late<=0;
  const settlement=state.projectSettlement??{profit:state.budget,debtPayment:0};
  $('#resultSeal').textContent=result.grade;
  $('#resultTitle').textContent=result.grade==='D'?'Офис открыт. Технически.':'Офис принят';
  $('#resultText').textContent=onTime?'В понедельник сотрудники нашли столы, розетки и даже стены одного цвета. Для fit-out это почти чудо.':`Открылись с опозданием на ${Math.ceil(result.late)} ч. Заказчик называет это «поэтапным вводом», и мы не спорим.`;
  $('#resultStats').innerHTML=`<div><small>ПРИБЫЛЬ / УБЫТОК</small><strong>${settlement.profit>=0?'+':''}${money(settlement.profit)}</strong></div><div><small>КАЧЕСТВО</small><strong>${Math.round(state.quality)}</strong></div><div><small>ДОВЕРИЕ</small><strong>${Math.round(state.trust)}%</strong></div><div><small>ПОГАШЕНО ДОЛГА</small><strong>${money(settlement.debtPayment??0)}</strong></div>
    <div class="hq-card"><small>ВАШ СОБСТВЕННЫЙ ОФИС · УРОВЕНЬ ${state.hq?.level ?? 0}</small><strong>${state.hq?.title ?? 'Стол у принтера'}</strong><small id="hqFailure">${state.hq?.lastFailure ?? 'Клиентам строим лучше, чем себе.'}</small><button class="secondary-button" id="upgradeHq">Вложить прибыль в штаб (сомнительно)</button></div>`;
  refs.result.classList.add('visible'); persistGame();
  $('#upgradeHq').addEventListener('click',()=>{
    const outcome=attemptHqUpgrade(state);
    $('#hqFailure').textContent=outcome.success?`Успех: теперь это «${outcome.title}». Никто не ожидал.`:`Попытка ${outcome.attempts}: ${outcome.lastFailure}`;
    $('#upgradeHq').textContent=outcome.success?'Попробовать испортить улучшение':'Попробовать ещё раз, ничему не научившись';
    persistGame();
  });
}

document.addEventListener('click',(event)=>{
  ensureAudio();
  const loanButton=event.target.closest('[data-loan]');
  if(loanButton){const loan=takeOrganizationLoan(state,Number(loanButton.dataset.loan));if(loan.ok){renderMainMenu();persistGame();feedback('cash');showToast(`Кредит получен: ${money(loan.principal)}. Вернуть придётся ${money(loan.repayment)}.`,'risk');}else showToast(loan.reason==='project-active'?'Банк кредитует только между проектами.':'Кредитный комитет уже нервничает. Лимит исчерпан.','risk');}
  const orderPin=event.target.closest('[data-order-id]');
  if(orderPin){selectedOrderId=orderPin.dataset.orderId;renderOrders();}
  const contractCard=event.target.closest('[data-contract-card]');
  if(contractCard){const card=CONTRACT_CARDS.find(item=>item.id===contractCard.dataset.contractCard);if(applyContractCard(state,card)){renderNegotiation();renderHud();}}
  const teamHire=event.target.closest('[data-team-hire]');
  if(teamHire){const result=hireTeamMember(state,teamHire.dataset.teamHire);if(result.ok){renderPreparation();renderAll();feedback('cash');showToast(`${result.member.name}: теперь у проекта есть ${result.member.role.toLowerCase()}.`,'done');}else if(result.reason==='budget')showToast('На собственную команду не хватило собственного бюджета.','risk');}
  const mapHire=event.target.closest('[data-map-hire]');
  if(mapHire){const result=hireContractor(state,mapHire.dataset.mapHire);if(result.ok){renderPreparation();renderAll();feedback('cash');showToast(`${result.contractor.company}: едут на объект. Возможно, даже на этот.`,'done');}else if(result.reason==='budget')showToast('Мобилизация не помещается в бюджет.','risk');}
  const dayTask=event.target.closest('[data-day-task]');
  if(dayTask){const task=state.tasks.find(item=>item.id===dayTask.dataset.dayTask);if(task){if(task.enabledToday)cyclePriority(state,task.id);else task.enabledToday=true;renderDayPlan();}}
  const scheduleDay=event.target.closest('[data-schedule-day]');
  if(scheduleDay){shiftMasterScheduleTask(state,scheduleDay.dataset.scheduleTask,Number(scheduleDay.dataset.scheduleDay));renderMasterSchedule();renderTasks();}
  const scheduleOrder=event.target.closest('[data-schedule-order]');
  if(scheduleOrder){moveMasterScheduleTask(state,scheduleOrder.dataset.scheduleTask,Number(scheduleOrder.dataset.scheduleOrder));renderMasterSchedule();}
  const sendUrgent=event.target.closest('[data-send-urgent]');
  if(sendUrgent){const task=state.tasks.find(item=>item.id===$('#urgentTaskSelect')?.value);const message=$('#urgentMessageInput')?.value?.trim()||'Сделать срочно.';if(task&&state.budget>=5){state.budget-=5;state.trust=Math.max(0,state.trust-1);task.enabledToday=true;task.priority=3;state.chatMessages??=[];state.chatMessages.push({mine:true,name:sessionUser??'Вы',text:`${message} — ${task.title}`,time:projectTime()});state.chatMessages=state.chatMessages.slice(-14);if(state.tutorial)state.tutorial.chatSent=true;feedback('message');renderAll();renderWhatsapp();persistGame();showToast(`Сообщение отправлено: «${task.short} — срочно».`,'risk');}else showToast('Даже срочность теперь не по бюджету.','risk');}
  const emailTemplate=event.target.closest('[data-email-template]');
  if(emailTemplate)renderEmailComposer(emailTemplate.dataset.emailTemplate);
  const sendEmail=event.target.closest('[data-send-email]');
  if(sendEmail){const target=sendEmail.dataset.sendEmail;if(target==='client'){state.trust=Math.min(100,state.trust+2);state.elapsed+=1;}if(target==='boss'){state.budget+=20;state.trust=Math.max(0,state.trust-2);}if(target==='contractors'){state.quality=Math.min(100,state.quality+1);state.budget-=10;}state.emailHistory??=[];state.emailHistory.push({template:target,time:projectTime()});closeCommunication();renderAll();persistGame();showToast('Письмо отправлено. В копии 17 человек, решение теперь хотя бы ищется.');}
  const taskCard=event.target.closest('[data-task]');
  if(taskCard&&!event.target.closest('[data-priority]')){selectedPerson=null;state.selectedTaskId=taskCard.dataset.task;renderTasks();renderSelection();}
  const priority=event.target.closest('[data-priority]');
  if(priority){event.stopPropagation(); if(cyclePriority(state,priority.dataset.priority)){renderTasks();showToast('Приоритет изменён. Прораб многозначительно переставил стикер.');}}
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
  if(situationChoice&&openSituationId){resolveSituation(state,openSituationId,situationChoice.dataset.situationChoice);openSituationId=null;refs.situation.classList.remove('visible');state.paused=false;renderAll();showToast('Ответ отправлен. Подрядчик понял его в пределах своей сметы.');}
  if(event.target.closest('[data-close-modal]')) refs.brief.classList.remove('visible');
  if(event.target.closest('[data-close-sidebook]'))event.target.closest('.modal-backdrop').classList.remove('visible');
});

$('#acceptOrder').addEventListener('click',()=>{
  const order=orders.find(item=>item.id===selectedOrderId);if(!order)return;if(!selectOrder(state,order)){showToast((order.requiresProjects??0)>ensureOrganization(state).projectsCompleted?'Этот заказ откроется после предыдущей главы.':'Не хватает оборотных денег организации. Вернитесь в меню за кредитом.','risk');feedback('risk');return;}
  visualProfile=createVisualProfile(order.visualSeed,order);
  rebuildTaskMarkers();
  if(sceneProps.client)sceneProps.client.userData.displayName=order.clientPerson;
  refs.orders.classList.remove('visible');refs.brief.classList.add('visible');renderAll();feedback('cash');showToast(`Заказ выбран: ${order.location}. Мобилизация организации ${money(state.organizationMobilization)}.`);
});
$('#regenerateOrders').addEventListener('click',()=>{orders=createOrderMarket();state.orderOptions=orders;selectedOrderId=orders.find(order=>(order.requiresProjects??0)<=ensureOrganization(state).projectsCompleted)?.id??orders[0].id;renderOrders();showToast('Рынок обновлён. Сюжетные заказы остались: рекомендации помнят ваши объекты.');});
$('#startMission').addEventListener('click',()=>{if(state.contract.cardsPlayed.length!==2)return;state.phase='preparation';refs.brief.classList.remove('visible');refs.market.classList.add('visible');renderPreparation();renderAll();showToast('Контракт подписан. Мелкий шрифт ликует.');});
$('#enterSite').addEventListener('click',()=>{state.phase='schedule';state.paused=true;refs.market.classList.remove('visible');openMasterSchedule();showToast('Сначала примите общий график. Потом начнётся ежедневный управленческий оптимизм.');});
$('#acceptSchedule').addEventListener('click',()=>{state.masterScheduleAccepted=true;refs.schedule.classList.remove('visible');if(!state.started){state.started=true;state.phase='planning';state.paused=true;state.needsPlanning=true;state.plannedDay=Math.floor(state.elapsed/24);for(const task of state.tasks)task.enabledToday=false;unlockTasks(state);renderDayPlan();refs.planning.classList.add('visible');showToast('Общий график принят. Утро берёт из него работы дня.','done');}else{state.paused=scheduleWasPaused;showToast('Общий график обновлён. Завершённые работы в планёрку не вернутся.','done');}renderAll();persistGame();});
$('#startDay').addEventListener('click',()=>{if(!state.tasks.some(task=>task.enabledToday&&!['done','active'].includes(task.status))){showToast('Выберите хотя бы одну работу. Даже хаосу нужен старт.','risk');return;}state.needsPlanning=false;state.plannedDay=Math.floor(state.elapsed/24);state.phase='execution';state.paused=false;refs.planning.classList.remove('visible');renderAll();feedback('build');showToast('План отправлен. Площадка реагирует сразу: смотрите, что люди реально делают.','done');});
$('#whatsappButton').addEventListener('click',()=>openCommunication('whatsapp'));
$('#emailButton').addEventListener('click',()=>openCommunication('email'));
$('#siteWhatsappButton').addEventListener('click',()=>openCommunication('whatsapp'));
$('#siteEmailButton').addEventListener('click',()=>openCommunication('email'));
$('#teamButton').addEventListener('click',()=>{renderTeamBook();refs.team.classList.add('visible');});
$('#financeButton').addEventListener('click',()=>{renderFinanceBook();refs.finance.classList.add('visible');});
$('#docsButton').addEventListener('click',()=>{renderDocsBook();refs.docs.classList.add('visible');});
$('#saveExitButton').addEventListener('click',()=>{state.paused=true;saved=state;persistGame();for(const modal of document.querySelectorAll('.modal-backdrop'))modal.classList.remove('visible');renderMainMenu();refs.menu.classList.add('visible');showToast('Объект сохранён и поставлен на управленческую паузу.','done');});
$('#closeCommunication').addEventListener('click',closeCommunication);
$('#masterScheduleButton').addEventListener('click',openMasterSchedule);
$('#topScheduleButton').addEventListener('click',openMasterSchedule);
$('#closeSchedule').addEventListener('click',closeMasterSchedule);
$('#closeSituation').addEventListener('click',()=>{refs.situation.classList.remove('visible');openSituationId=null;state.paused=false;showToast('Вопрос оставлен висеть над человеком. Буквально.');});
$('#sendReport').addEventListener('click',()=>{const day=Math.floor(state.elapsed/24);const dailyCost=closeDayFinances(state);state.reportedDay=day;state.elapsed=(day+1)*24;state.needsReport=false;state.needsPlanning=true;state.paused=true;for(const task of state.tasks)task.enabledToday=false;refs.report.classList.remove('visible');renderDayPlan();refs.planning.classList.add('visible');showToast(`Отчёт ушёл. За день списано ${money(dailyCost)}. Ночной бесплатной смены нет.`,'done');});
$('#briefButton').addEventListener('click',()=>state.selectedOrder?refs.brief.classList.add('visible'):refs.orders.classList.add('visible'));
$('#pauseButton').addEventListener('click',()=>{if(!state.started)return;state.paused=!state.paused;renderHud();});
$('#sitePauseButton').addEventListener('click',()=>{if(!state.started)return;state.paused=!state.paused;renderHud();});
$('#soundToggle').addEventListener('click',()=>{audioEnabled=!audioEnabled;$('#soundToggle').textContent=audioEnabled?'♪':'×';$('#soundToggle').title=audioEnabled?'Звук включён':'Звук выключен';if(audioEnabled)playSound('click');});
$('#skipTutorial').addEventListener('click',()=>{if(state.tutorial){state.tutorial.active=false;state.tutorial.completed=true;}renderTutorial();persistGame();showToast('Обучение пропущено. События снова имеют доступ к объекту.','risk');});
$('#developHqButton').addEventListener('click',()=>{const outcome=developHeadquarters(state);if(!outcome.ok){showToast('На офис для себя снова не хватило денег. Символично.','risk');return;}feedback(outcome.success?'done':'risk');renderMainMenu();persistGame();showToast(outcome.success?`Собственный офис улучшен: ${outcome.title}.`:`Потрачено ${money(outcome.cost)}. ${outcome.lastFailure}`,outcome.success?'done':'risk');});
document.querySelectorAll('[data-speed]').forEach(button=>button.addEventListener('click',()=>{state.speed=Number(button.dataset.speed);state.paused=false;renderHud();}));
$('#zoomIn').addEventListener('click',()=>{cameraZoom=Math.min(1.65,cameraZoom+.12);updateCamera();});
$('#zoomOut').addEventListener('click',()=>{cameraZoom=Math.max(.72,cameraZoom-.12);updateCamera();});
$('#zoomReset').addEventListener('click',()=>{cameraAngle=Math.PI/4;cameraZoom=1;updateCamera();});
function resetGame(){const hq=state.hq;const organization=ensureOrganization(state);state=createInitialState(Math.random,allRandomEvents);state.hq=hq;state.organization=organization;saved=null;orders=createOrderMarket(organization);state.orderOptions=orders;selectedOrderId=orders.find(order=>(order.requiresProjects??0)<=organization.projectsCompleted)?.id??orders[0].id;visualProfile=createVisualProfile(1);unlockTasks(state);renderedLogLength=0;resultShown=false;selectedPerson=null;for(const modal of document.querySelectorAll('.modal-backdrop'))modal.classList.remove('visible');refs.orders.classList.add('visible');rebuildTaskMarkers();renderAll();persistGame();}
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
  if(state.needsReport)openReport();
  const managementOpen=[refs.auth,refs.menu,refs.orders,refs.brief,refs.market,refs.communication,refs.schedule,refs.team,refs.finance,refs.docs,refs.planning,refs.report,refs.situation,refs.result].some(modal=>modal?.classList.contains('visible'));
  if(state.eventQueue.length&&!eventShowing&&!refs.event.classList.contains('visible')&&!managementOpen)openEvent(state.eventQueue[0]);
  if(state.completed)showResult();
  renderHud();renderTutorial();syncSceneFromState();animateScene(now);resizeRenderer();updateCamera(now*.001);
  if(cameraKick>.005){camera.position.x+=Math.sin(now*.11)*cameraKick;camera.position.y+=Math.cos(now*.09)*cameraKick*.35;camera.lookAt(cameraTarget);cameraKick*=.86;}
  renderer.render(scene,camera);
  if(now-lastSaved>2500){persistGame();lastSaved=now;}
  requestAnimationFrame(frame);
}

$('#authForm').addEventListener('submit',(event)=>{event.preventDefault();authenticate('login');});
$('#registerButton').addEventListener('click',()=>authenticate('register'));
$('#logoutButton').addEventListener('click',async()=>{persistGame();fetch('/fg-api/logout',{method:'POST',credentials:'include'}).catch(()=>{});sessionUser=null;$('#profileChip').hidden=true;for(const modal of document.querySelectorAll('.modal-backdrop'))modal.classList.remove('visible');refs.auth.classList.add('visible');$('#authPassword').value='';$('#authMessage').textContent='Профиль закрыт. Объект всё запомнил.';});
renderAll();
requestAnimationFrame(frame);
