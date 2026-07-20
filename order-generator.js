const CITIES = [
  { city: 'Москва', districts: ['Басманный', 'Ходынка', 'Павелецкая', 'Сити', 'Сокольники'], x: 57, y: 39 },
  { city: 'Санкт-Петербург', districts: ['Петроградская', 'Васильевский', 'Обводный канал'], x: 43, y: 23 },
  { city: 'Казань', districts: ['Ново-Савиновский', 'Центр'], x: 70, y: 50 },
  { city: 'Екатеринбург', districts: ['ВИЗ', 'Центр', 'Уралмаш'], x: 82, y: 56 },
  { city: 'Новосибирск', districts: ['Тихий центр', 'Октябрьский'], x: 91, y: 66 },
  { city: 'Нижний Новгород', districts: ['Стрелка', 'Нижегородский'], x: 64, y: 46 },
  { city: 'Сочи', districts: ['Адлер', 'Центральный'], x: 54, y: 78 },
];

const CLIENTS = {
  commercial: [
    ['АО «Север Софт»', 'Анна Крылова', 'генеральный директор'],
    ['«Параллель Банк»', 'Олег Марков', 'директор по развитию'],
    ['«Доставка Уже»', 'Лидия Воронова', 'операционный директор'],
    ['«Смысл Медиа»', 'Арсений Грачёв', 'основатель'],
    ['«Кубик Консалтинг»', 'Инга Мельник', 'партнёр'],
    ['«Нормальный Девелопмент»', 'Роман Белов', 'директор продукта'],
  ],
  state: [
    ['ГБУ «Единый центр координации»', 'Тамара Сергеевна', 'начальник управления'],
    ['Министерство понятных процедур', 'Валерий Петрович', 'заместитель директора департамента'],
    ['МБУ «Городская дирекция»', 'Нина Аркадьевна', 'руководитель учреждения'],
    ['Казённый центр цифровых справок', 'Геннадий Львович', 'контрактный управляющий'],
  ],
};

const TYPES = [
  { id: 'refresh', label: 'Ремонт без выселения', scale: .75, area: [180, 620], hours: [58, 96], complexity: [1, 3] },
  { id: 'renovation', label: 'Капитальный ремонт', scale: 1, area: [260, 1100], hours: [84, 150], complexity: [2, 4] },
  { id: 'shell', label: 'Fit-out в shell & core', scale: 1.25, area: [420, 1700], hours: [118, 210], complexity: [3, 5] },
  { id: 'greenfield', label: 'Стройка с чистого поля', scale: 1.65, area: [720, 2600], hours: [180, 310], complexity: [4, 5] },
  { id: 'restack', label: 'Пересборка работающего офиса', scale: .86, area: [350, 1300], hours: [70, 126], complexity: [2, 4] },
];

const FINISH = [
  { id: 'economy', label: 'Эконом', rate: 1, quality: 70, color: '#8fa396' },
  { id: 'b', label: 'B', rate: 1.28, quality: 76, color: '#69bfe8' },
  { id: 'a', label: 'A', rate: 1.68, quality: 82, color: '#a58ae1' },
  { id: 'aplus', label: 'A+', rate: 2.18, quality: 88, color: '#ddff55' },
];

const TITLES = {
  refresh: ['Люди работают, стены тоже', 'Освежить, никого не выселяя', 'Ремонт между созвонами'],
  renovation: ['Снять старое, не снести лишнее', 'Офис после прежней жизни', 'Капремонт с историей'],
  shell: ['Бетон уже есть. Остальное — ваше', 'Из shell & core в понедельник', 'Коробка просит стать офисом'],
  greenfield: ['Офис там, где пока растёт трава', 'Чистое поле, грязный график', 'Штаб-квартира с нулевой отметки'],
  restack: ['Пересадить всех и выжить', 'Большая офисная рокировка', 'Двести столов, один проход'],
};

const RISKS = [
  'заказчик любит менять решения голосовыми',
  'вводные утверждены, но не найдены',
  'единственный грузовой лифт уже занят',
  'соседи знают телефон управляющей компании',
  'импортная мебель существует пока только в презентации',
  'смета прошла семь согласований и стала короче проекта',
  'часть сотрудников отказывается покидать любимые столы',
  'под землёй лежит коммуникация, которую никто не рисовал',
];
const MAP_SLOTS = [[16,27],[34,18],[55,31],[78,20],[24,68],[46,60],[68,73],[87,51],[50,84],[91,79]];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pick = (items, rng) => items[Math.floor(rng() * items.length) % items.length];
const between = ([min, max], rng) => Math.round(min + rng() * (max - min));

export function makeSeededRng(seed = 1) {
  let value = (Number(seed) || 1) >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

const INTERVENTION_SCOPES=['electrical','hvac','lowcurrent','fire','plumbing','finishes','furniture','layout'];

function idsForOrder(order){
  if(order.tutorial)return new Set(['survey','project','protection','temporary-networks','move','demo-equipment','electric','wall-finish','lighting','desks','clean','executive-docs','inspect']);
  const scopes=new Set(order.workScopes??(order.projectType==='refresh'?['electrical','lowcurrent','finishes','furniture']:INTERVENTION_SCOPES));
  const ids=new Set(['survey','project','temporary-networks','clean','executive-docs','inspect']);
  if(order.projectType!=='shell'&&order.projectType!=='greenfield')ids.add('protection');
  const add=(...values)=>values.forEach(value=>ids.add(value));
  if(order.projectType==='greenfield')add('site-camp','layout','foundations','structure','envelope','roof','external-networks','protection','partitions','hvac','electric','lowcurrent','fire','plumbing','wall-finish','floor-finish','ceiling-finish','lighting','desks');
  else if(order.projectType==='shell')add('protection','partitions','hvac','electric','lowcurrent','fire','plumbing','wall-finish','floor-finish','ceiling-finish','lighting','desks');
  else if(order.projectType==='renovation')add('move','demo-partitions','demo-equipment','demo-floor','demo-ceiling','partitions','hvac','electric','lowcurrent','fire','plumbing','wall-finish','floor-finish','ceiling-finish','lighting','desks');
  else {
    if(scopes.has('layout')||scopes.has('furniture')||scopes.has('finishes'))add('move');
    if(scopes.has('layout'))add('demo-partitions','partitions');
    if(['electrical','hvac','lowcurrent','fire','plumbing'].some(scope=>scopes.has(scope)))add('demo-equipment','wall-finish');
    if(scopes.has('electrical'))add('electric','lighting');
    if(scopes.has('hvac'))add('hvac','demo-ceiling','ceiling-finish');
    if(scopes.has('lowcurrent'))add('lowcurrent');
    if(scopes.has('fire'))add('fire','demo-ceiling','ceiling-finish');
    if(scopes.has('plumbing'))add('plumbing','demo-floor','floor-finish');
    if(scopes.has('finishes'))add('demo-floor','demo-ceiling','wall-finish','floor-finish','ceiling-finish');
    if(scopes.has('furniture'))add('desks');
  }
  return ids;
}

export function buildTasksForOrder(order) {
  const selected=idsForOrder(order);const works=WORK_CATALOG.filter(work=>selected.has(work.id));const totalWeight=works.reduce((sum,work)=>sum+work.costWeight,0);const areaFactor=clamp(Math.sqrt((order.area??500)/500),.58,2.15);const complexityFactor=.78+(order.complexity??2)*.075;
  return works.map((work,index)=>({
    ...work,
    duration:Math.max(2,Math.min(Math.round((order.deadlineHours??96)*.22),Math.round(work.baseDuration*areaFactor*complexityFactor))),
    cost:Math.max(6,Math.round((order.budget??900)*.58*work.costWeight/totalWeight)),
    deps:work.after.filter(id=>selected.has(id)),
    hardDeps:(work.hardAfter??[]).filter(id=>selected.has(id)),
    priority:work.category==='design'?3:['handover','finish'].includes(work.category)?1:2,
    progress:0,status:'locked',crewId:null,committed:false,enabledToday:false,scheduleOrder:index,
  }));
}

const CAMPAIGN_SPECS = [
  {
    id:'campaign-tutorial', tutorial:true, requiresProjects:0, chapter:1,
    title:'Переговорная к понедельнику', clientName:'ООО «Первые вводные»', clientPerson:'Анна Крылова', clientRole:'генеральный директор', clientType:'commercial',
    projectType:'refresh', projectTypeLabel:'Учебный ремонт без выселения', area:180, finishClass:'B', finishClassId:'b', finishQuality:76,
    workScopes:['electrical','lowcurrent','finishes','furniture'],
    complexity:1, budget:760, deadlineHours:72, qualityTarget:74, location:'Москва, Басманный', mapX:28, mapY:36, color:'#ddff55',
    riskTags:['первая миссия: события отключены, пока вы осваиваете управление','заказчик уже выбрал цвет, но это не считается гарантией'], procurement:'прямой договор и одна честная смета', visualSeed:5005,
  },
  {
    id:'campaign-floor', requiresProjects:1, chapter:2,
    title:'Этаж для компании, которая выросла быстрее проекта', clientName:'АО «Север Софт»', clientPerson:'Игорь Ланской', clientRole:'операционный директор', clientType:'commercial',
    projectType:'renovation', projectTypeLabel:'Капитальный ремонт', area:620, finishClass:'A', finishClassId:'a', finishQuality:82,
    workScopes:[...INTERVENTION_SCOPES],
    complexity:2, budget:1580, deadlineHours:118, qualityTarget:81, location:'Москва, Павелецкая', mapX:47, mapY:30, color:'#a58ae1',
    riskTags:['заказчик помнит, как вы сдали первую переговорную','сотрудники продолжают работать внутри будущего объекта'], procurement:'рамочный договор после учебного успеха', visualSeed:5017,
  },
  {
    id:'campaign-hq', requiresProjects:2, chapter:3,
    title:'Штаб-квартира с бетоном и амбициями', clientName:'«Параллель Банк»', clientPerson:'Олег Марков', clientRole:'директор по развитию', clientType:'commercial',
    projectType:'shell', projectTypeLabel:'Fit-out в shell & core', area:1180, finishClass:'A+', finishClassId:'aplus', finishQuality:88,
    workScopes:[...INTERVENTION_SCOPES],
    complexity:4, budget:3520, deadlineHours:188, qualityTarget:88, location:'Москва, Сити', mapX:64, mapY:42, color:'#69bfe8',
    riskTags:['этот заказчик пришёл по рекомендации предыдущего','итальянская мебель пока существует только в презентации'], procurement:'закрытый тендер, открытые нервы', visualSeed:5033,
  },
  {
    id:'campaign-ministry', requiresProjects:3, chapter:4,
    title:'Дирекция понятных процедур на чистом поле', clientName:'Министерство понятных процедур', clientPerson:'Валерий Петрович', clientRole:'заместитель директора департамента', clientType:'state',
    projectType:'greenfield', projectTypeLabel:'Стройка с чистого поля', area:2240, finishClass:'B', finishClassId:'b', finishQuality:76,
    workScopes:[...INTERVENTION_SCOPES],
    complexity:5, budget:5980, deadlineHours:286, qualityTarget:80, location:'Нижний Новгород, Стрелка', mapX:76, mapY:57, color:'#d87561',
    riskTags:['квалификацию дали три предыдущих объекта','решение считается принятым после регистрации решения о регистрации'], procurement:'44-ФЗ и двенадцать печатей', visualSeed:5051,
  },
];

export function createCampaignOrders() {
  return CAMPAIGN_SPECS.map((spec)=>{
    const tasks=buildTasksForOrder(spec);
    if(spec.tutorial){for(const task of tasks)task.duration=Math.max(2,Math.round(task.duration*.62));tasks.find(task=>task.id==='move').deps=[];}
    return { ...spec, campaign:true, tasks };
  });
}

export function generateOrders(rng = Math.random, count = 7) {
  const orders = [];
  for (let index = 0; index < count; index += 1) {
    const type = TYPES[index % TYPES.length];
    const clientType = index % 3 === 1 ? 'state' : 'commercial';
    const finish = FINISH[(index + Math.floor(rng() * FINISH.length)) % FINISH.length];
    const location = CITIES[(index + Math.floor(rng() * CITIES.length)) % CITIES.length];
    const [clientName, clientPerson, clientRole] = pick(CLIENTS[clientType], rng);
    const area = Math.round(between(type.area, rng) / 10) * 10;
    const complexity = between(type.complexity, rng);
    const deadlineHours = between(type.hours, rng) + (clientType === 'state' ? 18 : 0);
    const rawBudget = area * (1.65 + complexity * .26) * type.scale * finish.rate;
    const budget = Math.round(rawBudget / 10) * 10;
    const slot=MAP_SLOTS[index%MAP_SLOTS.length];
    const jitterX = (rng() - .5) * 4;
    const jitterY = (rng() - .5) * 4;
    const scopeCount=type.id==='refresh'?2+Math.floor(rng()*4):type.id==='restack'?4+Math.floor(rng()*3):INTERVENTION_SCOPES.length;
    const scopeOffset=Math.floor(rng()*INTERVENTION_SCOPES.length);const workScopes=type.id==='refresh'||type.id==='restack'?Array.from({length:scopeCount},(_,scopeIndex)=>INTERVENTION_SCOPES[(scopeOffset+scopeIndex)%INTERVENTION_SCOPES.length]):[...INTERVENTION_SCOPES];
    const order = {
      id: `order-${index + 1}-${Math.floor(rng() * 9999).toString(36)}`,
      title: pick(TITLES[type.id], rng),
      clientName, clientPerson, clientRole, clientType,
      projectType: type.id, projectTypeLabel: type.label,
      workScopes,
      area, finishClass: finish.label, finishClassId: finish.id, finishQuality: finish.quality,
      complexity, budget, deadlineHours,
      qualityTarget: clamp(finish.quality + complexity - (clientType === 'state' ? 1 : 0), 68, 94),
      location: `${location.city}, ${pick(location.districts, rng)}`,
      mapX: clamp(slot[0] + jitterX, 5, 95), mapY: clamp(slot[1] + jitterY, 8, 90),
      color: finish.color,
      riskTags: [pick(RISKS, rng), pick(RISKS, rng)].filter((risk, riskIndex, list) => list.indexOf(risk) === riskIndex),
      procurement: clientType === 'state' ? '44-ФЗ и двенадцать печатей' : pick(['быстрый тендер', 'рамочный договор', 'подрядчик знакомого знакомого'], rng),
      visualSeed: Math.floor(rng() * 1_000_000),
    };
    order.tasks = buildTasksForOrder(order);
    orders.push(order);
  }
  return orders;
}
import { WORK_CATALOG } from './work-catalog.js';
