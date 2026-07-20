const FIRST_NAMES=['Алина','Борис','Катя','Мария','Семён','Олег','Ирина','Денис','Роман','Жанна','Павел','Лев','Надежда','Аркадий','Вера','Тимур','Светлана','Глеб','Яна','Максим'];
const LAST_NAMES=['Ветрова','Тихонов','Руднева','Корнилова','Актов','Сметанин','Прорабов','Накладная','Кассов','Планёркин','Резервова','Шовный','Уровнева','Дедлайнов','Исполнин','Согласова','Бетонова','Листков','Подрядов','Правкин'];

export const COMPANY_ROLES=[
  {id:'accountant',title:'Бухгалтер',salary:110,specialties:['finance','payroll'],color:'#69daa9'},
  {id:'estimator',title:'Сметчик',salary:125,specialties:['estimating','contracts'],color:'#ddff55'},
  {id:'project-manager',title:'Руководитель проекта',salary:165,specialties:['management','client'],color:'#e9ad52'},
  {id:'foreman',title:'Прораб',salary:145,specialties:['site','management'],color:'#cf765f'},
  {id:'procurement',title:'Снабженец',salary:120,specialties:['procurement','logistics'],color:'#69bfe8'},
  {id:'pto',title:'Инженер ПТО',salary:140,specialties:['documentation','quality'],color:'#a58ae1'},
  {id:'designer',title:'Проектировщик',salary:155,specialties:['design','coordination'],color:'#d87561'},
  {id:'safety',title:'Специалист ОТ',salary:105,specialties:['safety','audit'],color:'#f0c46a'},
  {id:'lawyer',title:'Юрист',salary:175,specialties:['legal','claims'],color:'#8eb6d8'},
];

export const STAFF_TRAITS=[
  {id:'steel-nerves',title:'Стальные нервы',effect:'Медленнее копит стресс'},
  {id:'remembers-promises',title:'Помнит обещания заказчика',effect:'Сильнее в претензиях'},
  {id:'excel-sorcerer',title:'Колдун Excel',effect:'Точнее прогнозирует деньги'},
  {id:'site-language',title:'Говорит на прорабском',effect:'Быстрее решает вопросы площадки'},
  {id:'supplier-friend',title:'Друг поставщиков',effect:'Получает отсрочку'},
  {id:'reads-drawings',title:'Читает чертежи до конца',effect:'Меньше переделок'},
  {id:'early-bird',title:'Приходит до планёрки',effect:'Больше энергии утром'},
  {id:'calm-client',title:'Успокаивает заказчика',effect:'Меньше потери доверия'},
  {id:'photo-memory',title:'Помнит, где фото',effect:'Ускоряет ИД'},
  {id:'hard-mail',title:'Пишет письма с приложениями',effect:'Усиливает формальные требования'},
  {id:'mentor',title:'Наставник',effect:'Ускоряет рост коллег'},
  {id:'universal',title:'Многостаночник',effect:'Меньше штраф вне специализации'},
  {id:'optimist',title:'Нездоровый оптимизм',effect:'Поддерживает мораль'},
  {id:'skeptic',title:'Проверяет даже итого',effect:'Ловит лишние расходы'},
  {id:'networker',title:'У всех есть телефон',effect:'Расширяет рынок подрядчиков'},
  {id:'quiet-authority',title:'Тихий авторитет',effect:'Улучшает дисциплину'},
  {id:'night-closer',title:'Закрывает КС ночью',effect:'Быстрее выпускает закрытия'},
  {id:'clean-desk',title:'Чистый стол',effect:'Реже теряет задачи'},
  {id:'fast-call',title:'Берёт трубку',effect:'Быстрее реагирует на события'},
  {id:'contract-memory',title:'Помнит пункт 7.4',effect:'Сильнее в изменениях'},
  {id:'overconfident',title:'Уже всё понял',effect:'Быстрее, но чаще ошибается',negative:true},
  {id:'perfectionist',title:'Согласует шрифт',effect:'Качество выше, сроки хуже',negative:true},
  {id:'smoke-council',title:'Член совета курилки',effect:'Чаще отвлекается',negative:true},
  {id:'vanishing',title:'Телефон вне зоны',effect:'Может пропасть в важный момент',negative:true},
  {id:'conflict',title:'Любит принципиальность',effect:'Чаще конфликтует',negative:true},
  {id:'burnout',title:'Работает на износ',effect:'Быстрее выгорает',negative:true},
  {id:'creative-accounting',title:'Творческий учёт',effect:'Требует дополнительного контроля',negative:true},
  {id:'client-pleaser',title:'Заказчик всегда прав',effect:'Берёт допы без денег',negative:true},
  {id:'paper-allergy',title:'Аллергия на акты',effect:'Медленнее оформляет документы',negative:true},
  {id:'monday-risk',title:'Сложный понедельник',effect:'Риск отсутствия после аврала',negative:true},
];

const BIO_START=['Начинал с объекта, где проект был фотографией экрана','Пришёл из компании, в которой планёрка длилась дольше смены','Однажды закрыл объект без единого голосового сообщения','Помнит времена, когда замечания печатали на бумаге','Считает, что любой кризис начинается со слов «там мелочь»','Выжил после трёх переездов заказчика за одну неделю','Знает, почему нельзя доверять ведомости без версии'];
const BIO_END=['мечтает однажды увидеть подписанный акт с первой попытки','не верит в фразу «деньги уже поставили на оплату»','коллекционирует версии финального проекта','сохраняет спокойствие до второго изменения после обеда','втайне хочет работать в бизнесе без скрытых работ','точно знает, у кого лежит последний комплект ключей','считает кассовый разрыв погодным явлением'];
const THOUGHTS=['«А это точно последняя версия?»','«До обеда бы закончить»','«Я это письмом фиксировал»','«Главное не открывать общий чат»','«Нужен ещё один человек. Лучше два»','«В графике этого не было»','«Заказчик сейчас перезвонит. Наверное»','«Сначала кофе, потом претензия»','«Кто опять забрал лазер?»','«ИД сама себя не соберёт»'];

function hash(seed){const value=Math.sin(Number(seed||1)*12.9898)*43758.5453;return value-Math.floor(value);}
const pick=(items,seed)=>items[Math.floor(hash(seed)*items.length)%items.length];

export function generateEmployee(seed=1,roleId=null,status='candidate'){
  const role=COMPANY_ROLES.find(item=>item.id===roleId)??pick(COMPANY_ROLES,seed+3);
  const first=pick(FIRST_NAMES,seed+11);const last=pick(LAST_NAMES,seed+23);
  const positive=STAFF_TRAITS.filter(item=>!item.negative);const negative=STAFF_TRAITS.filter(item=>item.negative);
  const strengthA=pick(positive,seed+31);let strengthB=pick(positive,seed+47);if(strengthB.id===strengthA.id)strengthB=positive[(positive.indexOf(strengthB)+1)%positive.length];
  const weakness=pick(negative,seed+59);const level=1+Math.floor(hash(seed+71)*3);
  return {
    id:`employee-${seed}-${role.id}`,name:`${first} ${last}`,initials:`${first[0]}${last[0]}`,roleId:role.id,role:role.title,specialties:[...role.specialties],salary:Math.round(role.salary*(.88+level*.08)),level,xp:0,status,color:role.color,
    biography:`${pick(BIO_START,seed+83)}; ${pick(BIO_END,seed+97)}.`,strengths:[strengthA.id,strengthB.id],weakness:weakness.id,
    competence:48+level*10+Math.round(hash(seed+101)*9),discipline:45+Math.round(hash(seed+103)*42),leadership:35+Math.round(hash(seed+107)*50),loyalty:50+Math.round(hash(seed+109)*35),
    energy:82,mood:68,stress:12,burnout:0,conflictRisk:Math.round(hash(seed+113)*35)+(weakness.id==='conflict'?28:0),alcoholRisk:Math.round(hash(seed+127)*22)+(weakness.id==='monday-risk'?32:0),quitRisk:6,
    assignedProjectId:null,transferDay:null,unavailableUntilDay:0,currentThought:pick(THOUGHTS,seed+131),history:[],
  };
}

export function generateStaffMarket(seed=1,count=18){return Array.from({length:count},(_,index)=>generateEmployee(seed+index*17,COMPANY_ROLES[index%COMPANY_ROLES.length].id));}

const PERSONAL_CAUSES=['переработал три вечера','получил замечание без номера','нашёл старую версию проекта','не дождался ответа заказчика','закрыл сложную задачу','увидел зарплату вовремя'];
const PERSONAL_RESULTS=['просит день тишины','ушёл спорить в курилку','требует премию и новый стул','собрался и спас чужую задачу','временно не берёт трубку','заявил, что всё под контролем'];
export const PERSONAL_EVENT_LIBRARY=Array.from({length:60},(_,index)=>({
  id:`staff-event-${index+1}`,title:`Личное дело №${String(index+1).padStart(2,'0')}`,
  text:`Сотрудник ${PERSONAL_CAUSES[index%PERSONAL_CAUSES.length]} и теперь ${PERSONAL_RESULTS[Math.floor(index/PERSONAL_CAUSES.length)%PERSONAL_RESULTS.length]}.`,
  stress:(index%5)-1,mood:index%4===0?5:-3,energy:index%3===0?-8:2,weight:1+(index%4),
}));

const COMPANY_CAUSES=['Заказчик перенёс платёж','Поставщик вспомнил про вашу репутацию','Банк пересчитал риск','В офисе кончился кофе','На объекте нашли неучтённый объём','Подрядчик освободил сильную бригаду','Бухгалтер открыл таблицу целиком','Конкурент забрал знакомого прораба'];
const COMPANY_RESULTS=['кассовый прогноз покраснел','появилась отсрочка','проценты стали убедительнее','производительность офиса упала символически','смета стала толще','можно усилить один объект','выяснилось, что прибыль была оформлением ячейки','рынок кадров снова ожил'];
export const COMPANY_EVENT_LIBRARY=Array.from({length:40},(_,index)=>({id:`company-event-${index+1}`,title:COMPANY_CAUSES[index%COMPANY_CAUSES.length],text:`${COMPANY_CAUSES[index%COMPANY_CAUSES.length]}; ${COMPANY_RESULTS[Math.floor(index/COMPANY_CAUSES.length)%COMPANY_RESULTS.length]}.`,cash:(index%7===0?45:index%5===0?-35:0),reputation:index%9===0?2:index%6===0?-2:0,weight:1+(index%5)}));

const CHANGE_ACTIONS=['перенести переговорную','добавить розетки в уже окрашенной стене','заменить потолок после поставки светильников','переехать в офис до приёмки','сделать ещё одну кухню','убрать серверную, но оставить серверы','поменять всю навигацию','добавить рабочие места без увеличения площади','вернуть стену, которую просили снести','показать образец цвета генеральному директору'];
const CHANGE_REASONS=['так решил новый руководитель','дизайнер увидел другой референс','эксплуатация пришла на встречу','арендодатель нашёл старое приложение','брендбук обновился ночью','никто не записал прошлое решение'];
export const CHANGE_ORDER_LIBRARY=Array.from({length:30},(_,index)=>({
  id:`change-${index+1}`,title:`Изменение: ${CHANGE_ACTIONS[index%CHANGE_ACTIONS.length]}`,
  description:`Заказчик просит ${CHANGE_ACTIONS[index%CHANGE_ACTIONS.length]}, потому что ${CHANGE_REASONS[Math.floor(index/CHANGE_ACTIONS.length)%CHANGE_REASONS.length]}.`,
  cost:35+(index%8)*18,durationHours:4+(index%6)*3,workMultiplier:1.05+(index%5)*.04,weight:1+(index%4),
}));

export function staffTrait(id){return STAFF_TRAITS.find(item=>item.id===id);}
export function nextEmployeeThought(employee,day=0){return pick(THOUGHTS,day*29+employee.id.length*7);}
