export const HERO_DIRECTIONS=['right','backRight','back','backLeft','left','frontLeft','front','frontRight'];

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function resolveHeroDirection(screenX,screenY,fallback='back'){
  if(Math.hypot(screenX,screenY)<.08)return fallback;
  const sector=Math.round(Math.atan2(screenY,screenX)/(Math.PI/4));
  return HERO_DIRECTIONS[(sector+8)%8];
}

export class HeroLocomotion{
  constructor(){this.state='idle';this.direction='back';this.animationTime=0;this.transitionTime=0;this.lastSpeed=0;this.turnPulse=0;this.sample12=0}
  update(dt,{speed=0,maxSpeed=2.65,running=false,direction=this.direction}={}){
    const safeDt=Math.max(.001,dt),moving=speed>.08,wasMoving=this.lastSpeed>.08;
    if(direction!==this.direction){this.direction=direction;this.turnPulse=1}
    if(moving&&!wasMoving){this.state='start';this.transitionTime=0}
    else if(!moving&&wasMoving){this.state='stop';this.transitionTime=0}
    this.transitionTime+=dt;
    if(this.state==='start'&&this.transitionTime>=.16)this.state=running?'run':'walk';
    else if(moving&&!['start'].includes(this.state))this.state=running?'run':'walk';
    else if(this.state==='stop'&&this.transitionTime>=.2)this.state='idle';
    else if(!moving&&this.state!=='stop')this.state='idle';
    const speedRatio=clamp(speed/Math.max(.01,maxSpeed),0,1),phaseRate=moving?.2+.8*speedRatio:this.state==='stop'?.16:0;
    this.animationTime+=dt*phaseRate;
    this.sample12=Math.floor((this.animationTime*(running?10:7)*1.5)%12);
    const acceleration=(speed-this.lastSpeed)/safeDt,transient=this.state==='start'?1-clamp(this.transitionTime/.16,0,1):this.state==='stop'?1-clamp(this.transitionTime/.2,0,1):0;
    this.turnPulse=Math.max(0,this.turnPulse-dt*8);
    this.lastSpeed=speed;
    return{state:this.state,renderState:this.state==='idle'?'idle':running?'run':'walk',direction:this.direction,animationTime:this.animationTime,speedRatio,sample12:this.sample12,lean:clamp(acceleration/90,-.035,.035)+this.turnPulse*.012,scaleX:1+transient*.018,scaleY:1-transient*.018,step:Math.sin(this.animationTime*(running?10:7)*Math.PI)}
  }
}
