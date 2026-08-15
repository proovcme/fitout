export const FLOOR_ROOM_TYPES={
  corridor:{id:'corridor',label:'Коридор',short:'ПРОХОД',color:'#d5bf78'},
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

const cleanCell=()=>({room:null,item:null,light:false,socket:false,door:false,entrance:false});

export class OfficeFloorPlanner{
  constructor({cols=12,rows=8,entranceIndex=cols*(rows-1)+Math.floor(cols/2)}={}){this.cols=cols;this.rows=rows;this.cells=Array.from({length:cols*rows},cleanCell);this.entranceIndex=Math.max(0,Math.min(this.cells.length-1,entranceIndex));this.cells[this.entranceIndex]={...cleanCell(),room:'corridor',entrance:true,door:true}}
  valid(index){return Number.isInteger(index)&&index>=0&&index<this.cells.length}
  coordinates(index){return{col:index%this.cols,row:Math.floor(index/this.cols)}}
  neighbors(index){const{col,row}=this.coordinates(index),result=[];if(col>0)result.push(index-1);if(col<this.cols-1)result.push(index+1);if(row>0)result.push(index-this.cols);if(row<this.rows-1)result.push(index+this.cols);return result}
  rectangle(start,end){if(!this.valid(start)||!this.valid(end))return[];const a=this.coordinates(start),b=this.coordinates(end),left=Math.min(a.col,b.col),right=Math.max(a.col,b.col),top=Math.min(a.row,b.row),bottom=Math.max(a.row,b.row),indices=[];for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++)indices.push(row*this.cols+col);return indices}
  paintRect(start,end,room){if(!FLOOR_ROOM_TYPES[room])return false;const indices=this.rectangle(start,end);if(!indices.length)return false;for(const index of indices){const cell=this.cells[index];if(cell.entrance)continue;if(cell.room!==room)Object.assign(cell,cleanCell(),{room})}return true}
  placeItem(index,item){if(!this.valid(index)||!FLOOR_ITEM_TYPES[item])return false;const cell=this.cells[index],type=FLOOR_ITEM_TYPES[item];if(!type.rooms.includes(cell.room))return false;cell.item=cell.item===item?null:item;return true}
  toggleNetwork(index,network){if(!this.valid(index)||!FLOOR_NETWORK_TYPES[network]||!this.cells[index].room)return false;const cell=this.cells[index];cell[network]=!cell[network];return true}
  erase(index){if(!this.valid(index)||this.cells[index].entrance)return false;this.cells[index]=cleanCell();return true}
  autoPlan(){
    this.cells=Array.from({length:this.cols*this.rows},cleanCell);this.cells[this.entranceIndex]={...cleanCell(),room:'corridor',entrance:true,door:true};
    const paint=(left,top,right,bottom,room)=>this.paintRect(top*this.cols+left,bottom*this.cols+right,room),at=(col,row)=>row*this.cols+col;
    paint(6,0,6,7,'corridor');
    paint(2,0,5,2,'work');
    paint(7,0,9,1,'meeting');
    paint(4,4,5,5,'restroom');
    paint(7,3,8,4,'server');
    paint(7,6,10,7,'lounge');
    for(const index of[at(2,0),at(3,1),at(4,2)])this.placeItem(index,'desk');
    this.placeItem(at(8,0),'meetingTable');this.placeItem(at(4,4),'toilet');this.placeItem(at(7,3),'rack');this.placeItem(at(8,6),'sofa');
    for(const index of[at(2,0),at(4,1),at(5,2),at(8,0),at(4,4),at(7,3),at(8,6)]){this.toggleNetwork(index,'light');this.toggleNetwork(index,'socket')}
    return this.snapshot()
  }
  connectivity(){const entrance=this.cells.findIndex(cell=>cell.entrance&&cell.room==='corridor'),corridor=new Set(),queue=entrance>=0?[entrance]:[];while(queue.length){const index=queue.shift();if(corridor.has(index)||this.cells[index].room!=='corridor')continue;corridor.add(index);for(const next of this.neighbors(index))if(!corridor.has(next)&&this.cells[next].room==='corridor')queue.push(next)}const visited=new Set(),components=[];for(let index=0;index<this.cells.length;index++){const room=this.cells[index].room;if(!room||room==='corridor'||visited.has(index))continue;const cells=[],pending=[index];visited.add(index);while(pending.length){const current=pending.shift();cells.push(current);for(const next of this.neighbors(current))if(!visited.has(next)&&this.cells[next].room===room){visited.add(next);pending.push(next)}}components.push({room,cells,connected:cells.some(cellIndex=>this.neighbors(cellIndex).some(next=>corridor.has(next)))})}return{entrance,corridor:[...corridor],components,connected:components.filter(component=>component.connected).length,total:components.length,complete:entrance>=0&&corridor.size>=2&&components.length>0&&components.every(component=>component.connected)}}
  metrics(){const roomArea={},items={},networks={light:0,socket:0,door:0};for(const cell of this.cells){if(cell.room)roomArea[cell.room]=(roomArea[cell.room]||0)+1;if(cell.item)items[cell.item]=(items[cell.item]||0)+1;for(const id of Object.keys(networks))if(cell[id])networks[id]++}return{roomArea,items,networks,seats:(items.desk||0)*4,meetingSeats:(items.meetingTable||0)*8,connectivity:this.connectivity()}}
  requirements(){const m=this.metrics(),area=id=>m.roomArea[id]||0,count=id=>m.items[id]||0,requirements=[
    {id:'work-room',label:'Рабочая зона',value:`${area('work')} / 12 клеток`,complete:area('work')>=12,nextTool:'room-work'},
    {id:'meeting-room',label:'Переговорная',value:`${area('meeting')} / 6 клеток`,complete:area('meeting')>=6,nextTool:'room-meeting'},
    {id:'restroom-room',label:'Санузел',value:`${area('restroom')} / 4 клетки`,complete:area('restroom')>=4,nextTool:'room-restroom'},
    {id:'server-room',label:'Серверная',value:`${area('server')} / 4 клетки`,complete:area('server')>=4,nextTool:'room-server'},
    {id:'circulation',label:'Вход и коридор',value:`соединено ${m.connectivity.connected} / ${m.connectivity.total} помещений`,complete:m.connectivity.complete,nextTool:'room-corridor'},
    {id:'desks',label:'Рабочие места',value:`${count('desk')} / 3 стола`,complete:count('desk')>=3,nextTool:'desk'},
    {id:'meeting-table',label:'Стол переговорной',value:count('meetingTable')?'установлен':'не установлен',complete:count('meetingTable')>=1,nextTool:'meetingTable'},
    {id:'plumbing',label:'Сантехника',value:count('toilet')?'установлена':'не установлена',complete:count('toilet')>=1,nextTool:'toilet'},
    {id:'server-rack',label:'Серверная стойка',value:count('rack')?'установлена':'не установлена',complete:count('rack')>=1,nextTool:'rack'},
    {id:'light',label:'Свет',value:`${m.networks.light} / 6`,complete:m.networks.light>=6,nextTool:'light'},
    {id:'socket',label:'Розетки',value:`${m.networks.socket} / 6`,complete:m.networks.socket>=6,nextTool:'socket'},
  ];return requirements
  }
  complete(){return this.requirements().every(item=>item.complete)}
  snapshot(){return{cols:this.cols,rows:this.rows,entranceIndex:this.entranceIndex,cells:this.cells.map(cell=>({...cell})),metrics:this.metrics(),requirements:this.requirements(),complete:this.complete()}}
}
