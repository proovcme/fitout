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

function workTitles(type) {
  if (type === 'greenfield') return [
    'Инженерные изыскания и разбивка осей', 'Рабочий проект и разрешения', 'Мобилизация и временный городок', 'Внешние сети и электроснабжение',
    'Каркас, кровля и ограждающие конструкции', 'Фасад и внутренняя отделка', 'Инженерия, мебель и рабочие места',
    'Пусконаладка и генеральная уборка', 'Исполнительные схемы и акты', 'Ввод и итоговая приёмка',
  ];
  if (type === 'shell') return [
    'Обмеры бетонной коробки', 'Рабочий проект fit-out', 'Логистика материалов и подъём', 'Черновая инженерия', 'Перегородки и подготовка оснований',
    'Чистовая отделка', 'Мебель, свет и оборудование', 'Финишный клининг', 'Исполнительная документация', 'Комплексная приёмка',
  ];
  if (type === 'refresh' || type === 'restack') return [
    'Зафиксировать людей, мебель и реальность', 'Проект этапности и временных зон', 'Поэтапно освободить рабочие зоны', 'Перенести розетки и слаботочку',
    'Локально подготовить стены', 'Обновить отделку', 'Пересобрать рабочие места', 'Убрать следы вмешательства', 'Закрыть акты и схемы', 'Сдать зоны заказчику',
  ];
  return [
    'Обследование существующего офиса', 'Рабочий проект ремонта', 'Демонтаж и вывоз', 'Новые инженерные сети', 'Перегородки и подготовка',
    'Чистовая отделка', 'Мебель и оборудование', 'Финишный клининг', 'Исполнительная документация', 'Приёмка и дефектовка',
  ];
}

export function buildTasksForOrder(order) {
  const ids = ['survey','project','move','electric','prep','paint','desks','clean','executive-docs','inspect'];
  const skills = ['management','design','moving','electric','paint','paint','furniture','cleaning','documentation','management'];
  const positions = [[1,5],[2,3],[3,4],[6,2],[2,1],[1,1],[5,4],[7,5],[6,5],[4,2]];
  const colors = ['#b7c7b8','#a58ae1','#e9ad52','#69bfe8','#d48f72','#d87561','#9d85d8','#62cba0','#69daa9','#ddff55'];
  const deps = [[],['survey'],['survey'],['project'],['move','project'],['prep'],['move','electric'],['paint','desks'],['electric','paint','desks'],['clean','executive-docs']];
  const weights = [.05,.07,.1,.13,.13,.14,.16,.06,.09,.07];
  const titles = workTitles(order.projectType);
  return ids.map((id, index) => ({
    id,
    title: titles[index],
    short: titles[index].split(' ').slice(0, 2).join(' '),
    skill: skills[index], x: positions[index][0], y: positions[index][1],
    duration: Math.max(3, Math.round(order.deadlineHours * weights[index] * (.72 + order.complexity * .07))),
    cost: Math.max(10, Math.round(order.budget * weights[index] * .56)),
    quality: index === 7 ? 5 : Math.max(1, Math.round(1 + order.finishQuality / 24 * weights[index] * 5)),
    deps: deps[index], priority: index < 1 ? 3 : index < 6 ? 2 : 1, color: colors[index],
    progress: 0, status: 'locked', crewId: null, committed: false, enabledToday: false,
  }));
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
    const order = {
      id: `order-${index + 1}-${Math.floor(rng() * 9999).toString(36)}`,
      title: pick(TITLES[type.id], rng),
      clientName, clientPerson, clientRole, clientType,
      projectType: type.id, projectTypeLabel: type.label,
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
