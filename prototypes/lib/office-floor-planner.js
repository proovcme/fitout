export const FLOOR_ROOM_TYPES={
  corridor:{id:'corridor',label:'Коридор',short:'ПРОХОД',color:'#d5bf78'},
  work:{id:'work',label:'Рабочая зона',short:'РАБОТА',color:'#4f88b8'},
  meeting:{id:'meeting',label:'Переговорная',short:'ВСТРЕЧИ',color:'#8e6cc7'},
  restroom:{id:'restroom',label:'Санузел',short:'С/У',color:'#4f9eb8'},
  server:{id:'server',label:'Серверная',short:'СЕРВЕР',color:'#59637e'},
  lounge:{id:'lounge',label:'Кухня и отдых',short:'ПАУЗА',color:'#d08a39'},
  focus:{id:'focus',label:'Тихая комната',short:'ТИШИНА',color:'#4f9b83'},
  storage:{id:'storage',label:'Склад и печать',short:'СКЛАД',color:'#8b735e'},
  reception:{id:'reception',label:'Ресепшен',short:'ВХОД',color:'#ba6f55'},
};

export const FLOOR_ITEM_TYPES={
  desk:{id:'desk',label:'Рабочий стол',icon:'▤',rooms:['work']},
  meetingTable:{id:'meetingTable',label:'Стол переговорной',icon:'▬',rooms:['meeting']},
  toilet:{id:'toilet',label:'Сантехника',icon:'◉',rooms:['restroom']},
  rack:{id:'rack',label:'Серверная стойка',icon:'▥',rooms:['server']},
  sofa:{id:'sofa',label:'Диван',icon:'▰',rooms:['lounge']},
  whiteboard:{id:'whiteboard',label:'Маркерная доска',icon:'□',rooms:['meeting','work']},
  printer:{id:'printer',label:'Принтер',icon:'▣',rooms:['work','storage']},
  phoneBooth:{id:'phoneBooth',label:'Телефонная кабина',icon:'▯',rooms:['focus']},
  lockers:{id:'lockers',label:'Шкафчики',icon:'▥',rooms:['storage','work']},
  kitchenette:{id:'kitchenette',label:'Кухонный модуль',icon:'▦',rooms:['lounge']},
  plant:{id:'plant',label:'Растение',icon:'♣',rooms:['work','lounge','reception']},
  receptionDesk:{id:'receptionDesk',label:'Стойка ресепшен',icon:'⌐',rooms:['reception']},
};

export const FLOOR_NETWORK_TYPES={
  light:{id:'light',label:'Свет',icon:'✦'},
  socket:{id:'socket',label:'Розетка',icon:'⌁'},
  door:{id:'door',label:'Дверь',icon:'↪'},
};

const cleanCell=()=>({room:null,item:null,light:false,socket:false,door:false,entrance:false});

export class OfficeFloorPlanner{
  constructor({cols=12,rows=8,entranceIndex=cols*(rows-1)+Math.floor(cols/2),variant='central_spine',brief={}}={}){this.cols=cols;this.rows=rows;this.variant=variant;this.brief={id:'startup',workCells:12,desks:3,lights:6,sockets:6,requiredRooms:['work','meeting','restroom','server'],...brief};this.cells=Array.from({length:cols*rows},cleanCell);this.entranceIndex=Math.max(0,Math.min(this.cells.length-1,entranceIndex));this.cells[this.entranceIndex]={...cleanCell(),room:'corridor',entrance:true,door:true}}
  valid(index){return Number.isInteger(index)&&index>=0&&index<this.cells.length}
  coordinates(index){return{col:index%this.cols,row:Math.floor(index/this.cols)}}
  neighbors(index){const{col,row}=this.coordinates(index),result=[];if(col>0)result.push(index-1);if(col<this.cols-1)result.push(index+1);if(row>0)result.push(index-this.cols);if(row<this.rows-1)result.push(index+this.cols);return result}
  rectangle(start,end){if(!this.valid(start)||!this.valid(end))return[];const a=this.coordinates(start),b=this.coordinates(end),left=Math.min(a.col,b.col),right=Math.max(a.col,b.col),top=Math.min(a.row,b.row),bottom=Math.max(a.row,b.row),indices=[];for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++)indices.push(row*this.cols+col);return indices}
  paintRect(start,end,room){if(!FLOOR_ROOM_TYPES[room])return false;const indices=this.rectangle(start,end);if(!indices.length)return false;for(const index of indices){const cell=this.cells[index];if(cell.entrance)continue;if(cell.room!==room)Object.assign(cell,cleanCell(),{room})}return true}
  placeItem(index,item){if(!this.valid(index)||!FLOOR_ITEM_TYPES[item])return false;const cell=this.cells[index],type=FLOOR_ITEM_TYPES[item];if(!type.rooms.includes(cell.room))return false;cell.item=cell.item===item?null:item;return true}
  toggleNetwork(index,network){if(!this.valid(index)||!FLOOR_NETWORK_TYPES[network]||!this.cells[index].room)return false;const cell=this.cells[index];cell[network]=!cell[network];return true}
  erase(index){if(!this.valid(index)||this.cells[index].entrance)return false;this.cells[index]=cleanCell();return true}
  addConnectionDoors(){
    const connected=this.connectivity().components.filter(component=>component.connected);for(const component of connected){const doorway=component.cells.find(index=>this.neighbors(index).some(next=>this.cells[next].room==='corridor'));if(doorway!==undefined)this.cells[doorway].door=true}return connected.length
  }
  autoPlan({variant=this.variant}={}){
    this.variant=variant;
    this.cells=Array.from({length:this.cols*this.rows},cleanCell);this.cells[this.entranceIndex]={...cleanCell(),room:'corridor',entrance:true,door:true};
    const paint=(left,top,right,bottom,room)=>this.paintRect(top*this.cols+left,bottom*this.cols+right,room),at=(col,row)=>row*this.cols+col;
    const roomSequence=[...new Set(['work','meeting',...this.brief.requiredRooms])],templates={
      central_spine:{corridors:[[6,0,6,7]],slots:[[2,0,5,2],[7,0,10,2],[2,4,5,5],[7,3,8,4],[2,6,5,7],[7,6,10,7]]},
      side_spine:{corridors:[[9,0,9,7],[6,7,9,7],[5,1,9,1],[5,5,9,5]],slots:[[2,0,5,2],[6,0,8,2],[2,3,5,5],[6,3,8,4],[2,6,5,7],[7,5,8,6]]},
      cross:{corridors:[[6,0,6,7],[2,3,10,3]],slots:[[2,0,5,2],[7,0,10,2],[2,4,5,5],[7,4,8,5],[2,6,5,7],[9,4,10,7]]},
      bent:{corridors:[[6,3,6,7],[2,3,6,3]],slots:[[2,0,4,2],[5,0,6,2],[7,2,10,3],[2,4,5,5],[7,4,8,5],[2,6,5,7],[7,6,10,7]]},
    },template=templates[variant]||templates.central_spine;
    for(let index=0;index<template.slots.length;index++)paint(...template.slots[index],roomSequence[index%roomSequence.length]);
    for(const rect of template.corridors)paint(...rect,'corridor');
    const roomCells=room=>this.cells.map((cell,index)=>cell.room===room?index:-1).filter(index=>index>=0),placeFirst=(room,item,offset=0)=>{const cells=roomCells(room);if(cells.length)this.placeItem(cells[Math.min(cells.length-1,offset)],item)};
    const work=roomCells('work');for(let index=0;index<Math.min(this.brief.desks,work.length);index++)this.placeItem(work[Math.floor(index*work.length/Math.max(1,this.brief.desks))],'desk');
    placeFirst('meeting','meetingTable');placeFirst('restroom','toilet');placeFirst('server','rack');placeFirst('lounge','sofa');placeFirst('focus','phoneBooth');placeFirst('storage','printer');placeFirst('reception','receptionDesk');
    const occupied=this.cells.map((cell,index)=>cell.room&&cell.room!=='corridor'?index:-1).filter(index=>index>=0);for(let index=0;index<Math.max(this.brief.lights,this.brief.sockets);index++){const cell=occupied[Math.floor(index*occupied.length/Math.max(1,Math.max(this.brief.lights,this.brief.sockets)))];if(index<this.brief.lights&&!this.cells[cell].light)this.toggleNetwork(cell,'light');if(index<this.brief.sockets&&!this.cells[cell].socket)this.toggleNetwork(cell,'socket')}
    this.cells[this.entranceIndex].entrance=true;this.cells[this.entranceIndex].door=true;this.addConnectionDoors();
    return this.snapshot()
  }
  connectivity(){const entrance=this.cells.findIndex(cell=>cell.entrance&&cell.room==='corridor'),corridor=new Set(),queue=entrance>=0?[entrance]:[];while(queue.length){const index=queue.shift();if(corridor.has(index)||this.cells[index].room!=='corridor')continue;corridor.add(index);for(const next of this.neighbors(index))if(!corridor.has(next)&&this.cells[next].room==='corridor')queue.push(next)}const visited=new Set(),components=[];for(let index=0;index<this.cells.length;index++){const room=this.cells[index].room;if(!room||room==='corridor'||visited.has(index))continue;const cells=[],pending=[index];visited.add(index);while(pending.length){const current=pending.shift();cells.push(current);for(const next of this.neighbors(current))if(!visited.has(next)&&this.cells[next].room===room){visited.add(next);pending.push(next)}}components.push({room,cells,connected:cells.some(cellIndex=>this.neighbors(cellIndex).some(next=>corridor.has(next)))})}return{entrance,corridor:[...corridor],components,connected:components.filter(component=>component.connected).length,total:components.length,complete:entrance>=0&&corridor.size>=2&&components.length>0&&components.every(component=>component.connected)}}
  metrics(){const roomArea={},items={},networks={light:0,socket:0,door:0};for(const cell of this.cells){if(cell.room)roomArea[cell.room]=(roomArea[cell.room]||0)+1;if(cell.item)items[cell.item]=(items[cell.item]||0)+1;for(const id of Object.keys(networks))if(cell[id])networks[id]++}return{roomArea,items,networks,seats:(items.desk||0)*4,meetingSeats:(items.meetingTable||0)*8,connectivity:this.connectivity()}}
  requirements(){const m=this.metrics(),area=id=>m.roomArea[id]||0,count=id=>m.items[id]||0,minimumArea={work:this.brief.workCells||12,meeting:6,restroom:4,server:4,lounge:4,focus:3,storage:3,reception:3},itemFor={meeting:['meetingTable','Стол переговорной'],restroom:['toilet','Сантехника'],server:['rack','Серверная стойка']},requirements=this.brief.requiredRooms.map(id=>({id:`${id}-room`,kind:'room',label:FLOOR_ROOM_TYPES[id]?.label||id,value:`${area(id)} / ${minimumArea[id]||3} клеток`,complete:area(id)>=(minimumArea[id]||3),nextTool:`room-${id}`}));requirements.push({id:'circulation',kind:'room',label:'Вход и коридор',value:`соединено ${m.connectivity.connected} / ${m.connectivity.total} помещений`,complete:m.connectivity.complete,nextTool:'room-corridor'},{id:'desks',kind:'item',label:'Рабочие места',value:`${count('desk')} / ${this.brief.desks} стола`,complete:count('desk')>=this.brief.desks,nextTool:'desk'});for(const room of this.brief.requiredRooms){const item=itemFor[room];if(item)requirements.push({id:`${room}-item`,kind:'item',label:item[1],value:count(item[0])?'установлено':'не установлено',complete:count(item[0])>=1,nextTool:item[0]})}requirements.push({id:'light',kind:'network',label:'Свет',value:`${m.networks.light} / ${this.brief.lights}`,complete:m.networks.light>=this.brief.lights,nextTool:'light'},{id:'socket',kind:'network',label:'Розетки',value:`${m.networks.socket} / ${this.brief.sockets}`,complete:m.networks.socket>=this.brief.sockets,nextTool:'socket'});return requirements
  }
  complete(){return this.requirements().every(item=>item.complete)}
  snapshot(){return{cols:this.cols,rows:this.rows,entranceIndex:this.entranceIndex,variant:this.variant,brief:{...this.brief,requiredRooms:[...this.brief.requiredRooms]},cells:this.cells.map(cell=>({...cell})),metrics:this.metrics(),requirements:this.requirements(),complete:this.complete()}}
}
