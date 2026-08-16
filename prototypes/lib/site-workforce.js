const distance=(a,b)=>Math.hypot((a?.x||0)-(b?.x||0),(a?.z||0)-(b?.z||0));
const copyPoint=point=>({x:Number(point?.x)||0,z:Number(point?.z)||0});

export class SiteWorkBoard{
  constructor({orders=[]}={}){this.orders=new Map();this.enabledPhases=new Set();this.facts=new Set();this.focus=null;this.revision=0;for(const order of orders)this.add(order)}
  add(order){if(!order?.id)throw new Error('Work order requires an id');if(this.orders.has(order.id))throw new Error(`Duplicate work order: ${order.id}`);const next={phase:'site',kind:'work',label:'Работа',roles:[],duration:1,required:true,priority:0,requiresFacts:[],pickup:null,target:{x:0,z:0},...order};next.target=copyPoint(next.target);next.pickup=copyPoint(next.pickup||next.target);next.roles=[...next.roles];next.requiresFacts=[...next.requiresFacts];next.duration=Math.max(.05,Number(next.duration)||1);next.progress=0;next.status='queued';next.claimedBy=null;this.orders.set(next.id,next);this.revision++;return next}
  addMany(orders=[]){return orders.map(order=>this.add(order))}
  addFact(id){if(!id||this.facts.has(id))return false;this.facts.add(id);this.revision++;return true}
  enablePhase(id){if(!id||this.enabledPhases.has(id))return false;this.enabledPhases.add(id);this.revision++;return true}
  pausePhase(id){if(!this.enabledPhases.delete(id))return false;for(const order of this.orders.values())if(order.phase===id&&order.status!=='done'){order.status='queued';order.claimedBy=null}this.revision++;return true}
  phaseEnabled(id){return this.enabledPhases.has(id)}
  setFocus(point){this.focus=point?copyPoint(point):null}
  prioritizeNear(point,{radius=2.2,boost=8}={}){const center=copyPoint(point);let changed=0;for(const order of this.orders.values())if(order.status!=='done'&&distance(order.target,center)<=radius){order.priority=Math.min(30,order.priority+boost);changed++}if(changed)this.revision++;return changed}
  isReady(order){return Boolean(order&&order.status==='queued'&&this.enabledPhases.has(order.phase)&&order.requiresFacts.every(fact=>this.facts.has(fact)))}
  claim(workerId,roles=[]){const capabilities=new Set(Array.isArray(roles)?roles:[roles]),candidates=[...this.orders.values()].filter(order=>this.isReady(order)&&order.roles.some(role=>capabilities.has(role)));if(!candidates.length)return null;candidates.sort((a,b)=>{const requiredDelta=Number(b.required)-Number(a.required);if(requiredDelta)return requiredDelta;const focusA=this.focus?Math.max(0,6-distance(a.target,this.focus)):0,focusB=this.focus?Math.max(0,6-distance(b.target,this.focus)):0;return(b.priority+focusB)-(a.priority+focusA)||a.id.localeCompare(b.id)});const order=candidates[0];order.status='claimed';order.claimedBy=workerId;this.revision++;return order}
  release(workerId){let released=false;for(const order of this.orders.values())if(order.claimedBy===workerId&&order.status!=='done'){order.status='queued';order.claimedBy=null;released=true}if(released)this.revision++;return released}
  begin(workerId,orderId){const order=this.orders.get(orderId);if(!order||order.claimedBy!==workerId||!this.enabledPhases.has(order.phase))return false;order.status='working';this.revision++;return true}
  work(workerId,orderId,dt,{rate=1}={}){const order=this.orders.get(orderId);if(!order||order.status!=='working'||order.claimedBy!==workerId||!this.enabledPhases.has(order.phase))return{ok:false,done:false,progress:order?.progress||0};order.progress=Math.min(1,order.progress+Math.max(0,Number(dt)||0)*Math.max(.05,Number(rate)||1)/order.duration);if(order.progress>=1){order.progress=1;order.status='done';order.claimedBy=null;this.revision++;return{ok:true,done:true,progress:1,order}}return{ok:true,done:false,progress:order.progress,order}}
  phaseProgress(phase){const orders=[...this.orders.values()].filter(order=>order.phase===phase&&order.required);if(!orders.length)return 0;const total=orders.reduce((sum,order)=>sum+order.duration,0);return total?orders.reduce((sum,order)=>sum+order.progress*order.duration,0)/total:0}
  phaseComplete(phase){const orders=[...this.orders.values()].filter(order=>order.phase===phase&&order.required);return orders.length>0&&orders.every(order=>order.status==='done')}
  order(id){return this.orders.get(id)||null}
  activeFor(workerId){return[...this.orders.values()].find(order=>order.claimedBy===workerId)||null}
  snapshot(){return{revision:this.revision,focus:this.focus?{...this.focus}:null,facts:[...this.facts],enabledPhases:[...this.enabledPhases],orders:[...this.orders.values()].map(order=>({...order,target:{...order.target},pickup:{...order.pickup},roles:[...order.roles],requiresFacts:[...order.requiresFacts]}))}}
}

export class SiteWorkerBrain{
  constructor({workerId,roles,actor,board,navigation,move,speed=1.7,workRate=1,directionResolver=directionFromDelta,onStateChange=()=>{},onOrderComplete=()=>{}}){this.workerId=workerId;this.roles=Array.isArray(roles)?roles:[roles];this.actor=actor;this.board=board;this.navigation=navigation;this.move=move;this.speed=speed;this.workRate=workRate;this.directionResolver=directionResolver;this.onStateChange=onStateChange;this.onOrderComplete=onOrderComplete;this.state='idle';this.order=null;this.path=[];this.pathIndex=0;this.pathKey='';this.repath=0;this.stalled=0;this.cooldown=0}
  setState(state){if(this.state===state)return;this.state=state;this.onStateChange(state,this.order)}
  clearOrder(){this.order=null;this.path=[];this.pathIndex=0;this.pathKey='';this.repath=0;this.stalled=0}
  targetForState(){return this.state==='to_supply'?this.order?.pickup:this.order?.target}
  plan(target){this.path=this.navigation.findPath(this.actor.position,target);this.pathIndex=Math.min(1,Math.max(0,this.path.length-1));this.pathKey=`${target.x.toFixed(2)}:${target.z.toFixed(2)}`;this.repath=.65}
  walk(target,dt){const targetKey=`${target.x.toFixed(2)}:${target.z.toFixed(2)}`;this.repath-=dt;if(this.repath<=0||this.pathKey!==targetKey)this.plan(target);while(this.pathIndex<this.path.length-1&&distance(this.actor.position,this.path[this.pathIndex])<.16)this.pathIndex++;const waypoint=this.path[this.pathIndex]||target,dx=waypoint.x-this.actor.position.x,dz=waypoint.z-this.actor.position.z,remaining=Math.hypot(dx,dz);if(remaining<=.18)return true;if(!this.path.length)return false;const step=Math.min(remaining,dt*this.speed),result=this.move(this.actor,{x:dx/remaining*step,z:dz/remaining*step});if((result?.moved||step)<.002){this.stalled+=dt;if(this.stalled>.35){this.repath=0;this.stalled=0}}else this.stalled=0;this.actor.direction=this.directionResolver(dx,dz);return false}
  tick(dt){dt=Math.max(0,Math.min(.1,Number(dt)||0));if(this.cooldown>0){this.cooldown-=dt;this.setState('idle');return}if(this.order&&!this.board.phaseEnabled(this.order.phase)&&this.order.status!=='done'){this.board.release(this.workerId);this.clearOrder();this.setState('idle')}if(!this.order){this.order=this.board.claim(this.workerId,this.roles);if(!this.order){this.setState('idle');return}this.setState('to_supply')}
    if(this.state==='to_supply'){if(this.walk(this.order.pickup,dt)){this.path=[];this.pathKey='';this.setState('carrying')}return}
    if(this.state==='carrying'){this.setState('to_work');return}
    if(this.state==='to_work'){if(this.walk(this.order.target,dt)){this.path=[];this.pathKey='';if(this.board.begin(this.workerId,this.order.id))this.setState('working');else{this.board.release(this.workerId);this.clearOrder();this.setState('idle')}}return}
    if(this.state==='working'){const result=this.board.work(this.workerId,this.order.id,dt,{rate:this.workRate});if(result.done){const completed=this.order;this.onOrderComplete(completed);this.clearOrder();this.cooldown=.12;this.setState('idle')}else if(!result.ok){this.clearOrder();this.setState('idle')}}
  }
}

export function directionFromDelta(dx,dz){return Math.abs(dx)>Math.abs(dz)?(dx>0?'right':'left'):(dz>0?'front':'back')}
