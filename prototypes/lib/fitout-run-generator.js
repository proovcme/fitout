import{createSeededRng,pickSeeded}from'./seed-utils.js';

export const FITOUT_LAYOUT_VARIANTS={
  central_spine:{id:'central_spine',label:'Центральный коридор',entrance:'south-center'},
  side_spine:{id:'side_spine',label:'Боковой коридор',entrance:'south-east'},
  cross:{id:'cross',label:'Крестовая связь',entrance:'south-center'},
  bent:{id:'bent',label:'Г-образный этаж',entrance:'south-west'},
};

export const FITOUT_BRIEFS={
  startup:{id:'startup',label:'Стартап после раунда',seats:24,meeting:1,workCells:12,desks:3,lights:6,sockets:6,requiredRooms:['work','meeting','restroom','server'],flavour:'Много людей, один созвон и сервер, который нельзя поставить под стол.'},
  agency:{id:'agency',label:'Креативное агентство',seats:20,meeting:1,workCells:10,desks:3,lights:7,sockets:6,requiredRooms:['work','meeting','restroom','lounge'],flavour:'Нужны общая работа, большая встреча и кухня, где рождаются срочные правки.'},
  legal:{id:'legal',label:'Юридическое бюро',seats:16,meeting:2,workCells:8,desks:2,lights:7,sockets:5,requiredRooms:['work','meeting','restroom','focus'],flavour:'Меньше мест, больше тишины и две комнаты для разговоров, которых не было.'},
  support:{id:'support',label:'Служба поддержки',seats:28,meeting:1,workCells:13,desks:4,lights:8,sockets:8,requiredRooms:['work','meeting','restroom','server'],flavour:'Плотная посадка, непрерывная связь и ни одного удобного места для ошибки.'},
  hybrid:{id:'hybrid',label:'Гибридный офис',seats:18,meeting:1,workCells:9,desks:3,lights:7,sockets:7,requiredRooms:['work','meeting','restroom','focus','lounge'],flavour:'Столы делят люди, переговорные делят календари, тишину не делит никто.'},
};

export const FITOUT_SITE_CONDITIONS={
  narrow_delivery:{id:'narrow_delivery',label:'Узкий грузовой вход',effect:'Длинные материалы несут медленнее.',modifierId:'narrow_delivery'},
  legacy_wiring:{id:'legacy_wiring',label:'Чужая проводка под полом',effect:'Инженерия обнаруживает прошлое прямо во время монтажа.',modifierId:'legacy_wiring'},
  live_office:{id:'live_office',label:'Соседи уже работают',effect:'Шумные операции приходится дробить.',modifierId:'live_office'},
  late_change:{id:'late_change',label:'Заказчик смотрит презентацию',effect:'Новая хотелка гарантированно появится после стен.',modifierId:'late_change'},
  missing_lift:{id:'missing_lift',label:'Лифт занят чужой мебелью',effect:'Поставки приходят короткими рывками.',modifierId:'missing_lift'},
  crooked_slab:{id:'crooked_slab',label:'Плита гуляет на 42 мм',effect:'Разметка и чистовая отделка требуют проверки.',modifierId:'fixed_opening'},
  cost_pressure:{id:'cost_pressure',label:'Бюджет уже сократили',effect:'Каждое исправление съедает резерв.',modifierId:'cost_pressure'},
};

export const FITOUT_SITUATIONS=[
  {id:'axis_shift',phase:'demolition',title:'Старая ось вернулась',text:'Борис отбил линию по листу, который все просили удалить.',fix:'Отбить заново',risk:'Строить по старой оси',mistake:'axis_not_verified'},
  {id:'column_in_door',phase:'demolition',title:'Колонна стоит во входе',text:'На обмере она была тоньше. В бетоне — убедительнее.',fix:'Сместить дверной проём',risk:'Сузить проход',mistake:'column_narrows_entry'},
  {id:'narrow_door',phase:'partition',title:'Мебель не пройдёт',text:'Люди проходят. Стол переговорной уже нет.',fix:'Расширить проём',risk:'Разобрать стол при доставке',mistake:'doorway_not_verified'},
  {id:'extra_meeting',phase:'partition',title:'Обещана ещё одна переговорная',text:'На плане её нет, но в презентации инвестору она уже подписана.',fix:'Перекроить комнату',risk:'Отгородить шкафами',mistake:'verbal_meeting_room'},
  {id:'socket_behind_rack',phase:'engineering',title:'Розетка ушла за стойку',text:'Электрика совпала с проектом. Мебель тоже. Друг с другом — нет.',fix:'Перенести трассу',risk:'Оставить удлинитель',mistake:'socket_hidden_behind_furniture'},
  {id:'ceiling_collision',phase:'engineering',title:'Все разделы встретились в потолке',text:'Светильник, воздуховод и спринклер заняли одну клетку.',fix:'Развести трассы',risk:'Опустить потолок',mistake:'low_ceiling'},
  {id:'server_heat',phase:'engineering',title:'Серверной нечем дышать',text:'Стойка включится. Потом выключится сама, но уже по температуре.',fix:'Добавить охлаждение',risk:'Оставить дверь открытой',mistake:'server_without_cooling'},
  {id:'wrong_tone',phase:'finish',title:'Цвет совпал только по номеру',text:'Марина смотрит на выкрас так, будто он признался первым.',fix:'Сверить рабочий свет',risk:'Назвать оттенок авторским',mistake:'finish_sample_not_verified'},
  {id:'wet_wall',phase:'finish',title:'Стена ещё мокрая',text:'Маляр готов красить. Влажность тоже готова участвовать.',fix:'Просушить участок',risk:'Закрыть пятно краской',mistake:'paint_over_damp'},
  {id:'desk_blocks_socket',phase:'furniture',title:'Стол съел розетку',text:'Рабочее место готово, если сотрудник не собирается работать.',fix:'Переставить по сетке',risk:'Выдать удлинитель',mistake:'furniture_clearance_not_verified'},
  {id:'early_delivery',phase:'furniture',title:'Мебель приехала раньше офиса',text:'Поставщик впервые не опоздал и этим сломал график.',fix:'Разнести по комнатам',risk:'Сложить в коридоре',mistake:'furniture_blocks_corridor'},
  {id:'wrong_chairs',phase:'furniture',title:'Кресла из другой комплектации',text:'Цвет бодрый. Спина после восьми часов — ещё бодрее.',fix:'Вернуть поставщику',risk:'Принять со скидкой',mistake:'wrong_furniture_batch'},
];

const available=(catalog,ids)=>ids.map(id=>catalog[id]).filter(Boolean);
const uniquePick=(rng,pool,count)=>{const copy=[...pool],result=[];while(copy.length&&result.length<count){const index=Math.floor(rng()*copy.length);result.push(copy.splice(index,1)[0])}return result};

export function generateFitoutRun(seed='fitout-run',profile={}){
  const rng=createSeededRng(`${seed}:${Number(profile.runs)||0}`),layouts=available(FITOUT_LAYOUT_VARIANTS,profile.unlockedLayouts?.length?profile.unlockedLayouts:['central_spine']),briefs=available(FITOUT_BRIEFS,profile.unlockedBriefs?.length?profile.unlockedBriefs:['startup']),conditions=available(FITOUT_SITE_CONDITIONS,profile.unlockedConditions?.length?profile.unlockedConditions:['narrow_delivery','legacy_wiring','live_office']),layout=pickSeeded(rng,layouts)||FITOUT_LAYOUT_VARIANTS.central_spine,brief=pickSeeded(rng,briefs)||FITOUT_BRIEFS.startup,condition=pickSeeded(rng,conditions)||FITOUT_SITE_CONDITIONS.narrow_delivery;
  const situations=['demolition','partition','engineering','finish','furniture'].map(phase=>pickSeeded(rng,FITOUT_SITUATIONS.filter(item=>item.phase===phase))).filter(Boolean);
  return{seed:String(seed),layout:{...layout},brief:{...brief,requiredRooms:[...brief.requiredRooms]},condition:{...condition},situations:situations.map(item=>({...item}))};
}
