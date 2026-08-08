const EPSILON=.001;

const bounds=(rect,radius)=>({
  minX:rect.x-rect.width/2-radius,
  maxX:rect.x+rect.width/2+radius,
  minZ:rect.z-rect.depth/2-radius,
  maxZ:rect.z+rect.depth/2+radius
});

export function overlapsObstacle(position,obstacles,radius=.28){
  return obstacles.some(rect=>{
    const box=bounds(rect,radius);
    return position.x>box.minX&&position.x<box.maxX&&position.z>box.minZ&&position.z<box.maxZ;
  });
}

export function depenetrate(position,obstacles,radius=.28){
  const resolved={x:position.x,z:position.z};
  for(let pass=0;pass<Math.max(2,obstacles.length);pass++){
    let changed=false;
    for(const rect of obstacles){
      const box=bounds(rect,radius);
      if(!(resolved.x>box.minX&&resolved.x<box.maxX&&resolved.z>box.minZ&&resolved.z<box.maxZ))continue;
      const exits=[
        {axis:'x',value:box.minX-EPSILON,distance:resolved.x-box.minX},
        {axis:'x',value:box.maxX+EPSILON,distance:box.maxX-resolved.x},
        {axis:'z',value:box.minZ-EPSILON,distance:resolved.z-box.minZ},
        {axis:'z',value:box.maxZ+EPSILON,distance:box.maxZ-resolved.z}
      ].sort((a,b)=>a.distance-b.distance);
      resolved[exits[0].axis]=exits[0].value;
      changed=true;
    }
    if(!changed)break;
  }
  return resolved;
}

export function moveWithCollisions(position,delta,obstacles,{radius=.28,maxStep=.12}={}){
  let resolved=depenetrate(position,obstacles,radius),blockedX=false,blockedZ=false;
  const distance=Math.hypot(delta.x,delta.z),steps=Math.max(1,Math.ceil(distance/maxStep)),stepX=delta.x/steps,stepZ=delta.z/steps;
  for(let step=0;step<steps;step++){
    const nextX={x:resolved.x+stepX,z:resolved.z};
    if(!overlapsObstacle(nextX,obstacles,radius))resolved.x=nextX.x;
    else blockedX=true;
    const nextZ={x:resolved.x,z:resolved.z+stepZ};
    if(!overlapsObstacle(nextZ,obstacles,radius))resolved.z=nextZ.z;
    else blockedZ=true;
  }
  return{x:resolved.x,z:resolved.z,blockedX,blockedZ,moved:Math.hypot(resolved.x-position.x,resolved.z-position.z)};
}
