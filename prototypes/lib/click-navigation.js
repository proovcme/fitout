const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

const approachCandidates=(target,radius)=>{
  const candidates=[{x:target.x,z:target.z}];
  if(radius<=0)return candidates;
  for(let index=0;index<12;index++){
    const angle=index/12*Math.PI*2;
    candidates.push({x:target.x+Math.cos(angle)*radius,z:target.z+Math.sin(angle)*radius});
  }
  return candidates;
};

export function planClickRoute(navigation,from,target,{approachRadius=0}={}){
  const routes=approachCandidates(target,approachRadius).map(candidate=>navigation.findPath(from,candidate)).filter(route=>route.length);
  if(!routes.length)return{ok:false,waypoints:[],endpoint:null};
  routes.sort((a,b)=>a.length-b.length||distance(a.at(-1),target)-distance(b.at(-1),target));
  const route=routes[0].map(point=>({x:point.x,z:point.z}));
  while(route.length>1&&distance(route[0],from)<navigation.cellSize*.8)route.shift();
  return{ok:true,waypoints:route,endpoint:route.at(-1)};
}

export function consumeReachedWaypoints(waypoints,position,tolerance=.2){
  while(waypoints.length&&distance(waypoints[0],position)<=tolerance)waypoints.shift();
  return waypoints[0]||null;
}
