const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

const approachCandidates=(target,radius)=>{
  if(radius<=0)return[{x:target.x,z:target.z}];
  const candidates=[];
  for(const ring of[radius*.72,radius])for(let index=0;index<16;index++){
    const angle=index/16*Math.PI*2;
    candidates.push({x:target.x+Math.cos(angle)*ring,z:target.z+Math.sin(angle)*ring});
  }
  return candidates;
};

export function planClickRoute(navigation,from,target,{approachRadius=0,maxApproachDistance=Infinity}={}){
  const routes=approachCandidates(target,approachRadius).map(candidate=>navigation.findPath(from,candidate)).filter(route=>route.length&&distance(route.at(-1),target)<=maxApproachDistance);
  if(!routes.length)return{ok:false,waypoints:[],endpoint:null};
  routes.sort((a,b)=>a.length-b.length||distance(a.at(-1),target)-distance(b.at(-1),target));
  const route=routes[0].map(point=>({x:point.x,z:point.z}));
  while(route.length>1&&distance(route[0],from)<navigation.cellSize*.8)route.shift();
  return{ok:true,waypoints:route,endpoint:route.at(-1)};
}

export function shouldReplanChase({elapsed=0,stalledFor=0,target,destination,interval=.45,moveThreshold=.3,stallThreshold=.28}={}){
  if(!target||!destination)return false;
  return stalledFor>=stallThreshold||(elapsed>=interval&&distance(target,destination)>=moveThreshold);
}

export function consumeReachedWaypoints(waypoints,position,tolerance=.2){
  while(waypoints.length&&distance(waypoints[0],position)<=tolerance)waypoints.shift();
  return waypoints[0]||null;
}
