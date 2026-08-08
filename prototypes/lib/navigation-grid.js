const key=(x,z)=>`${x}:${z}`;
const heuristic=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.z-b.z);

export class NavigationGrid{
  constructor({minX=-8,maxX=8,minZ=-6.5,maxZ=6.5,cellSize=.5,blocked=[]}={}){this.minX=minX;this.maxX=maxX;this.minZ=minZ;this.maxZ=maxZ;this.cellSize=cellSize;this.cols=Math.floor((maxX-minX)/cellSize)+1;this.rows=Math.floor((maxZ-minZ)/cellSize)+1;this.blocked=new Set();for(const rect of blocked)this.blockRect(rect)}
  toCell(position){return{x:Math.max(0,Math.min(this.cols-1,Math.round((position.x-this.minX)/this.cellSize))),z:Math.max(0,Math.min(this.rows-1,Math.round((position.z-this.minZ)/this.cellSize)))}}
  toWorld(cell,y=0){return{x:this.minX+cell.x*this.cellSize,y,z:this.minZ+cell.z*this.cellSize}}
  inside(cell){return cell.x>=0&&cell.z>=0&&cell.x<this.cols&&cell.z<this.rows}
  isBlocked(cell){return this.blocked.has(key(cell.x,cell.z))}
  blockRect({x,z,width,depth,padding=.25}){const min=this.toCell({x:x-width/2-padding,z:z-depth/2-padding}),max=this.toCell({x:x+width/2+padding,z:z+depth/2+padding});for(let cz=min.z;cz<=max.z;cz++)for(let cx=min.x;cx<=max.x;cx++)this.blocked.add(key(cx,cz))}
  neighbors(cell){return[{x:cell.x+1,z:cell.z},{x:cell.x-1,z:cell.z},{x:cell.x,z:cell.z+1},{x:cell.x,z:cell.z-1}].filter(next=>this.inside(next)&&!this.isBlocked(next))}
  nearestWalkable(cell){if(!this.isBlocked(cell))return cell;for(let radius=1;radius<Math.max(this.cols,this.rows);radius++)for(let z=cell.z-radius;z<=cell.z+radius;z++)for(let x=cell.x-radius;x<=cell.x+radius;x++){const next={x,z};if(this.inside(next)&&!this.isBlocked(next))return next}return null}
  findPath(fromPosition,toPosition){const start=this.nearestWalkable(this.toCell(fromPosition)),goal=this.nearestWalkable(this.toCell(toPosition));if(!start||!goal)return[];const open=[start],came=new Map(),g=new Map([[key(start.x,start.z),0]]),seen=new Set();while(open.length){open.sort((a,b)=>(g.get(key(a.x,a.z))+heuristic(a,goal))-(g.get(key(b.x,b.z))+heuristic(b,goal)));const current=open.shift(),currentKey=key(current.x,current.z);if(current.x===goal.x&&current.z===goal.z){const cells=[current];let cursor=currentKey;while(came.has(cursor)){const previous=came.get(cursor);cells.push(previous);cursor=key(previous.x,previous.z)}return cells.reverse().map(cell=>this.toWorld(cell))}if(seen.has(currentKey))continue;seen.add(currentKey);for(const next of this.neighbors(current)){const nextKey=key(next.x,next.z),score=(g.get(currentKey)||0)+1;if(score<(g.get(nextKey)??Infinity)){came.set(nextKey,current);g.set(nextKey,score);if(!seen.has(nextKey))open.push(next)}}}return[]}
  reachable(from,targets){return targets.filter(target=>this.findPath(from,target).length>0)}
}
