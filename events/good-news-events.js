export const goodNewsEvents = [
  {
    id:'client-approved-extras',beneficial:true,kicker:'Редкий входящий платёж',title:'Заказчик сам согласовал допработы',
    text:'Финансовый директор заказчика нашёл в переписке слово «дополнительно» и, вопреки жанру, приложил подписанный бюджет.',minHour:3,weight:10,
    options:[
      {id:'take-and-document',title:'Принять и оформить допсоглашение',effect:'На объект приходит дополнительный резерв.',note:'Деньги настоящие, объём тоже.',financial:'client-extra',deltas:{budget:120,quality:0,trust:4,time:1},scene:{actor:'client',actorCount:1}},
      {id:'trade-for-time',title:'Обменять часть суммы на срок',effect:'Резерв меньше, зато дедлайн отодвинут.',note:'Заказчик впервые сам произносит слово «реалистично».',financial:'client-extra',deltas:{budget:55,deadline:9,quality:0,trust:6,time:1},scene:{actor:'client',actorCount:2}},
    ],
  },
  {
    id:'client-extends-deadline',beneficial:true,kicker:'Календарное чудо',title:'Заказчик сам перенёс открытие',
    text:'HR не успел нанять сотрудников и попросил добавить времени. Стройка впервые спасена другим департаментом.',minHour:4,weight:9,
    options:[
      {id:'accept-extension',title:'Зафиксировать новый срок',effect:'Дедлайн становится дальше.',note:'Без героизма, зато официально.',deltas:{budget:0,deadline:12,quality:2,trust:3,time:0},scene:{actor:'client',actorCount:1}},
      {id:'promise-early',title:'Оставить срок и обещать раньше',effect:'Доверие растёт, запас остаётся внутренним.',note:'Опасная роскошь: настоящий резерв времени.',deltas:{budget:25,deadline:7,quality:0,trust:7,time:0},scene:{actor:'client',actorCount:1}},
    ],
  },
  {
    id:'supplier-found-surplus',beneficial:true,kicker:'Складская удача',title:'Поставщик нашёл оплаченный остаток',
    text:'На складе обнаружилась ваша партия материалов. Её не потеряли — просто очень тщательно не находили.',minHour:2,weight:8,
    options:[
      {id:'deliver-now',title:'Везти на объект сейчас',effect:'Материалы возвращаются в бюджет и на площадку.',note:'Машина даже знает адрес.',deltas:{budget:65,quality:1,trust:1,time:0},scene:{actor:'delivery',actorCount:2}},
      {id:'upgrade-spec',title:'Заменить дешёвую позицию',effect:'Экономия превращается в качество.',note:'Редкий случай, когда аналог лучше оригинала.',deltas:{budget:20,quality:6,trust:3,time:1},scene:{actor:'delivery',actorCount:2}},
    ],
  },
  {
    id:'crew-beats-plan',beneficial:true,kicker:'Подозрительно хорошая смена',title:'Бригада закончила фронт раньше обещанного',
    text:'Никто не опоздал, инструмент был заряжен, чертёж совпал с реальностью. Прораб просит не сглазить.',minHour:5,weight:7,
    options:[
      {id:'pay-bonus',title:'Выплатить премию и держать темп',effect:'Качество и доверие растут.',note:'Люди запомнят, что хорошую работу тоже замечают.',deltas:{budget:-25,quality:5,trust:5,time:-1},scene:{actor:'worker',actorCount:3}},
      {id:'bank-saving',title:'Зафиксировать экономию',effect:'Часть резерва возвращается на счёт.',note:'Бухгалтерия ненадолго поверила в производство.',deltas:{budget:45,quality:1,trust:0,time:-1},scene:{actor:'worker',actorCount:2}},
    ],
  },
];
