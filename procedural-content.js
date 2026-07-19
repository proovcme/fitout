const pick = (items, value) => items[Math.abs(Math.floor(value)) % items.length];
function mix(value, salt) {
  let result=(Number(value)||0)^(salt*0x45d9f3b);
  result=Math.imul(result^(result>>>16),0x45d9f3b);
  result=Math.imul(result^(result>>>16),0x45d9f3b);
  return (result^(result>>>16))>>>0;
}

export const OFFICE_THEMES = [
  { id:'sage', name:'Корпоративный шалфей', wall:'#a9c4ad', floorA:'#d3cdbc', floorB:'#cbc4b2', wood:'#b88a5b', accent:'#d87561' },
  { id:'graphite', name:'Дорогой графит', wall:'#9da7a2', floorA:'#c8c6bc', floorB:'#babbb4', wood:'#8f6f51', accent:'#d1b45c' },
  { id:'peach', name:'Смелый персик из презентации', wall:'#d7a184', floorA:'#d8d0c0', floorB:'#c9c0ad', wood:'#a87955', accent:'#6f9a91' },
  { id:'bureau', name:'Государственный оптимизм', wall:'#c7c2a9', floorA:'#d2cec1', floorB:'#c0bcae', wood:'#9a744c', accent:'#6f8796' },
  { id:'studio', name:'Креативный бетон', wall:'#9fa09d', floorA:'#b8b6af', floorB:'#aaa9a4', wood:'#bd8856', accent:'#b16c7c' },
  { id:'blue', name:'Технологичный синий', wall:'#91aeb5', floorA:'#c5cbc5', floorB:'#b4beb8', wood:'#a67b52', accent:'#d79162' },
];

export function createVisualProfile(seed = 1, order = {}) {
  const theme = OFFICE_THEMES[Math.abs(seed) % OFFICE_THEMES.length];
  return {
    seed,
    theme,
    layout: {
      deskRows: 1 + (seed % 3),
      deskColumns: 2 + (Math.floor(seed / 3) % 3),
      plants: 1 + (Math.floor(seed / 11) % 5),
      loungeVariant: Math.floor(seed / 17) % 3,
      glassMeeting: Math.floor(seed / 23) % 2 === 0,
      clutter: 3 + (Math.floor(seed / 29) % 7),
    },
    site: order.projectType === 'greenfield' ? 'field' : order.projectType === 'shell' ? 'shell' : 'existing',
  };
}

const FIRST_NAMES = ['Алексей','Рустам','Марат','Сергей','Денис','Тимур','Женя','Павел','Саша','Николай','Лена','Марина','Света','Азамат','Вадим','Игорь','Ринат','Юра','Оксана','Галина'];
const LAST_NAMES = ['Ким','Орлов','Сафиуллин','Петров','Лебедев','Коваль','Рахимов','Волков','Мельник','Карпов','Белов','Сидорова'];
const SKINS = ['#d6a47d','#b97855','#edc39d','#8f5d43','#c98c68','#7c4e37'];
const HAIRS = ['#2b2522','#4a352a','#6d513d','#171918','#8a7864'];

export function createPersonProfile(role, seed = 1, index = 0) {
  const value = Math.abs(seed + index * 97 + role.length * 31);
  return {
    name: `${pick(FIRST_NAMES, value)} ${pick(LAST_NAMES, value / 7)}`,
    skin: pick(SKINS, value / 3),
    hair: pick(HAIRS, value / 5),
    height: .91 + (value % 19) / 100,
    body: .88 + (Math.floor(value / 19) % 22) / 100,
    accessory: Math.floor(value / 13) % 6,
    helmetVariant: Math.floor(value / 17) % 4,
    bubbleVariant: Math.floor(value / 23) % 12,
  };
}

const OPENINGS = [
  'Коллеги, важный вопрос:', 'Так, без паники:', 'Кто последний трогал', 'В проекте написано одно, но',
  'Прораб просил передать:', 'Сейчас будет быстро:', 'Заказчик только что спросил, почему', 'Есть две новости, и обе про',
  'Я ничего не утверждаю, однако', 'До обеда надо понять, куда делся', 'На планёрке забыли обсудить', 'Кто в чате отвечает за',
];
const SUBJECTS = {
  management:['актуальный график','подписанный акт','резерв бюджета','ответственный за ответственного','вчерашний протокол','доступ на этаж','фото до начала','финальная версия финальной версии'],
  moving:['коробка «НЕ ТЕРЯТЬ»','единственный грузовой лифт','шкаф, который не проходит','сорок третий стул','наклейки на мебель','тележка без колеса','чужой сервер','диван из Италии'],
  paint:['тёплый серый','согласованный выкрас','угол за шкафом','вторая банка первого цвета','мудборд архитектора','валик прораба','стена с розеткой','надпись «не красить»'],
  electric:['кабель без проекта','проект без кабеля','розетка за шкафом','автомат без подписи','слаботочный лоток','удлинитель заказчика','свет в переговорной','отверстие в готовой стене'],
  furniture:['левая правая опора','инструкция на шведском','лишний винт','стол, собранный зеркально','тумба без ключа','кресло руководителя','панель скромности','двадцать четвёртое рабочее место'],
  cleaning:['настоящий цвет пола','следы новых ботинок','защитная плёнка под защитной плёнкой','пыль после «последней» работы','строительный скотч','мешок без хозяина','угол за диваном','блеск в акте приёмки'],
};
const ENDINGS = [
  'это точно сегодня?', 'оно само так получилось.', 'в чате уже сто сообщений.', 'заказчик идёт сюда.',
  'в графике этого почему-то нет.', 'не фотографируйте пока.', 'архитектор просил не называть это ошибкой.', 'до отчёта осталось два часа.',
  'если что, это временно.', 'главное — зафиксировать письмом.', '###@!#!!', 'кто-нибудь видел рулетку?',
];

export function generateSiteLine(skill = 'management', token = 0) {
  const subjects = SUBJECTS[skill] ?? SUBJECTS.management;
  const opening = pick(OPENINGS, mix(token+skill.length,11));
  const subject = pick(subjects, mix(token+skill.charCodeAt(0),29));
  const ending = pick(ENDINGS, mix(token+skill.length*3,47));
  return `${opening} ${subject} — ${ending}`;
}

export function bubbleFor(role, token = 0) {
  const official = {
    police:['ДОКУМЕНТЫ','НЕ РАСХОДИМСЯ','КТО ПРОРАБ?','ПРОПУСК ЕСТЬ?'],
    inspector:['АКТ ГДЕ?','ЖУРНАЛ!','НЕ ПРИМУ','ФОТО ДО!'],
    boss:['ЛЮДЕЙ ОТДАЙ','КТО ДАЛ БЮДЖЕТ?','СРОЧНО НА ДРУГОЙ','ОТЧЁТ ГДЕ?'],
    client:['А ПОЧЕМУ?','ЭТО ТОЧНО A?','К ПОНЕДЕЛЬНИКУ','Я ТАК НЕ ПРОСИЛ'],
    architect:['ТАК В МУДБОРДЕ','ЭТО КОНЦЕПЦИЯ','СЕРЫЙ НЕ ТОТ','ГДЕ СВЕТ?'],
  };
  const casual = ['###@!#!!','НЕ ПО ПРОЕКТУ!','КТО ЗАКАЗАЛ?!','ГДЕ РУЛЕТКА?','ЭТО НЕ МОЁ','СРОЧНО?!','А ДОПЫ?','КТО СЛОМАЛ?','Я ПИСАЛ!','НЕ ТРОГАЙ','УЖЕ КРАСИЛИ','ЧЕЙ КАБЕЛЬ?'];
  return pick(official[role] ?? casual, token);
}
