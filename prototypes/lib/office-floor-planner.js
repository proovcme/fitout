export const FLOOR_ROOM_TYPES={
  work:{id:'work',label:'Рабочая зона',short:'РАБОТА',color:'#4f88b8'},
  meeting:{id:'meeting',label:'Переговорная',short:'ВСТРЕЧИ',color:'#8e6cc7'},
  restroom:{id:'restroom',label:'Санузел',short:'С/У',color:'#4f9eb8'},
  server:{id:'server',label:'Серверная',short:'СЕРВЕР',color:'#59637e'},
  lounge:{id:'lounge',label:'Кухня и отдых',short:'ПАУЗА',color:'#d08a39'},
};

export const FLOOR_ITEM_TYPES={
  desk:{id:'desk',label:'Рабочий стол',icon:'▤',rooms:['work']},
  meetingTable:{id:'meetingTable',label:'Стол переговорной',icon:'▬',rooms:['meeting']},
  toilet:{id:'toilet',label:'Сантехника',icon:'◉',rooms:['restroom']},
  rack:{id:'rack',label:'Серверная стойка',icon:'▥',rooms:['server']},
  sofa:{id:'sofa',label:'Диван',icon:'▰',rooms:['lounge']},
};

export const FLOOR_NETWORK_TYPES={
  light:{id:'light',label:'Свет',icon:'✦'},
  socket:{id:'socket',label:'Розетка',icon:'⌁'},
  door:{id:'door',label:'Дверь',icon:'↪'},
};

const cleanCell=()=>({room:null,item:null,light:false,socket:false,door:false});

export class OfficeFloorPlanner{
  constructor({cols=12,rows=8}={}){this.cols=cols;this.rows=rows;this.cells=Array.from({length:cols*rows},cleanCell)}
  valid(index){return Number.isInteger(index)&&index>=0&&index<this.cells.length}
  coordinates(index){return{col:index%this.cols,row:Math.floor(index/this.cols)}}
  rectangle(start,end){if(!this.valid(start)||!this.valid(end))return[];const a=this.coordinates(start),b=this.coordinates(end),left=Math.min(a.col,b.col),right=Math.max(a.col,b.col),top=Math.min(a.row,b.row),bottom=Math.max(a.row,b.row),indices=[];for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++)indices.push(row*this.cols+col);return indices}
  paintRect(start,end,room){if(!FLOOR_ROOM_TYPES[room])return false;const indices=this.rectangle(start,end);if(!indices.length)return false;for(const index of indices){const cell=this.cells[index];if(cell.room!==room)Object.assign(cell,cleanCell(),{room})}return true}
  placeItem(index,item){if(!this.valid(index)||!FLOOR_ITEM_TYPES[item])return false;const cell=this.cells[index],type=FLOOR_ITEM_TYPES[item];if(!type.rooms.includes(cell.room))return false;cell.item=cell.item===item?null:item;return true}
  toggleNetwork(index,network){if(!this.valid(index)||!FLOOR_NETWORK_TYPES[network]||!this.cells[index].room)return false;const cell=this.cells[index];cell[network]=!cell[network];return true}
  erase(index){if(!this.valid(index))return false;this.cells[index]=cleanCell();return true}
  metrics(){const roomArea={},items={},networks={light:0,socket:0,door:0};for(const cell of this.cells){if(cell.room)roomArea[cell.room]=(roomArea[cell.room]||0)+1;if(cell.item)items[cell.item]=(items[cell.item]||0)+1;for(const id of Object.keys(networks))if(cell[id])networks[id]++}return{roomArea,items,networks,seats:(items.desk||0)*4,meetingSeats:(items.meetingTable||0)*8}}
  requirements(){const m=this.metrics(),area=id=>m.roomArea[id]||0,count=id=>m.items[id]||0,requirements=[
    {id:'work',label:'Рабочая зона',value:`${area('work')} клеток · ${count('desk')} стол.`,complete:area('work')>=12&&count('desk')>=3,nextTool:area('work')<12?'room-work':'desk'},
    {id:'meeting',label:'Переговорная',value:`${area('meeting')} клеток · стол ${count('meetingTable')?'есть':'нет'}`,complete:area('meeting')>=6&&count('meetingTable')>=1,nextTool:area('meeting')<6?'room-meeting':'meetingTable'},
    {id:'restroom',label:'Санузел',value:`${area('restroom')} клетки · узел ${count('toilet')?'есть':'нет'}`,complete:area('restroom')>=4&&count('toilet')>=1,nextTool:area('restroom')<4?'room-restroom':'toilet'},
    {id:'server',label:'Серверная',value:`${area('server')} клетки · стойка ${count('rack')?'есть':'нет'}`,complete:area('server')>=4&&count('rack')>=1,nextTool:area('server')<4?'room-server':'rack'},
    {id:'light',label:'Свет',value:`${m.networks.light} / 6`,complete:m.networks.light>=6,nextTool:'light'},
    {id:'socket',label:'Розетки',value:`${m.networks.socket} / 6`,complete:m.networks.socket>=6,nextTool:'socket'},
  ];return requirements
  }
  complete(){return this.requirements().every(item=>item.complete)}
  snapshot(){return{cols:this.cols,rows:this.rows,cells:this.cells.map(cell=>({...cell})),metrics:this.metrics(),requirements:this.requirements(),complete:this.complete()}}
}
