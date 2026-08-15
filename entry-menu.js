import './entry-menu.css';

const roomTypes=[
  {kind:'work',label:'РАБОТА',detail:'8 мест',reaction:'Рабочие места уже собирают. Розетки пока ищут их на старом плане.'},
  {kind:'meeting',label:'ВСТРЕЧИ',detail:'8 мест',reaction:'Переговорная появилась. Заказчик сразу вспомнил, что обещал две.'},
  {kind:'focus',label:'ТИШИНА',detail:'4 места',reaction:'Тихая комната ушла в работу. Прораб назначил там планёрку.'},
  {kind:'lounge',label:'ПАУЗА',detail:'чайник',reaction:'Кухня строится первой. У бригады наконец появился личный интерес.'},
  {kind:'restroom',label:'С/У',detail:'1 узел',reaction:'Санузел сдвинулся. Серверная делает вид, что между ними достаточно стены.'},
  {kind:'server',label:'СЕРВЕР',detail:'стойка',reaction:'Серверная попала на стройку. Электрик уже просит ещё четыре розетки.'},
];
const feedback=document.querySelector('#entryFeedback');
const planRooms=[...document.querySelectorAll('[data-entry-room]')];
const builtRooms=[...document.querySelectorAll('[data-built-room]')];
let decisions=0;

function changeRoom(room,index){
  const current=roomTypes.findIndex(type=>type.kind===room.dataset.kind),next=roomTypes[(current+1)%roomTypes.length],built=builtRooms[index];
  room.dataset.kind=next.kind;room.querySelector('b').textContent=next.label;room.querySelector('small').textContent=next.detail;
  room.classList.remove('entry-pop');void room.offsetWidth;room.classList.add('entry-pop');
  feedback.textContent='REV 07 печатается…';
  setTimeout(()=>{built.dataset.kind=next.kind;built.classList.remove('entry-build-pop');void built.offsetWidth;built.classList.add('entry-build-pop');feedback.textContent=`+${++decisions} решение · ${next.reaction}`},180);
}

planRooms.forEach((room,index)=>{
  room.addEventListener('click',()=>changeRoom(room,index));
  room.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();changeRoom(room,index)}});
});
