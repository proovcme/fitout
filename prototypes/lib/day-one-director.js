import{createSeededRng}from'./character-generator.js';

export const DIRECTOR_PHASES={
  observation:{id:'observation',label:'Наблюдение'},
  pressure:{id:'pressure',label:'Давление'},
  crisis:{id:'crisis',label:'Кризис'},
  recovery:{id:'recovery',label:'Передышка'}
};

const beat=(id,phase,effect,options={})=>({id,phase,effect,weight:1,minTime:0,cooldown:75,major:false,...options});

export const DAY_ONE_BEATS=[
  beat('vera-third-breaker','observation','vera_warning',{minTime:8,weight:1.4,when:w=>w.wetCableActive}),
  beat('rubbish-has-address','observation','trash_warning',{minTime:12,weight:1.2,when:w=>w.trashActive}),
  beat('pallet-without-label','observation','material_warning',{minTime:15,weight:1.1,when:w=>!w.materialsChecked}),
  beat('foreman-sees-shortcut','observation','foreman_shortcut',{minTime:20,weight:1.1,when:w=>w.demolitionReady}),
  beat('helper-needs-verb','observation','worker_confused',{minTime:18,weight:.9}),
  beat('client-asks-floor','observation','client_eta',{minTime:28,weight:1,when:w=>w.hazardsActive}),
  beat('inspector-opens-notebook','observation','inspection_warning',{minTime:34,weight:1,when:w=>!w.panelAccepted}),
  beat('extension-disappears','observation','missing_extension',{minTime:38,weight:.8}),
  beat('collective-coffee','observation','crew_break',{minTime:44,weight:.8,style:'direct'}),
  beat('breaker-flickers','pressure','power_flicker',{minTime:32,weight:1.5,when:w=>w.wetCableActive}),
  beat('rubbish-blocks-route','pressure','trash_spreads',{minTime:40,weight:1.35,when:w=>w.trashActive}),
  beat('wrong-pallet-opened','pressure','material_mismatch',{minTime:50,weight:1.3,when:w=>!w.materialsChecked}),
  beat('worker-takes-literally','pressure','literal_order',{minTime:58,weight:1.1,style:'shout'}),
  beat('foreman-hides-detail','pressure','hidden_detail',{minTime:62,weight:1.2,style:'shout'}),
  beat('crew-waits-for-boss','pressure','learned_helplessness',{minTime:68,weight:1.2,style:'direct'}),
  beat('delegation-loses-subject','pressure','delegation_gap',{minTime:72,weight:1.15,style:'delegate'}),
  beat('too-many-at-front','pressure','crowding',{minTime:78,weight:1,when:w=>w.workingJobs>1}),
  beat('client-starts-walk','pressure','client_walk',{minTime:86,weight:1.5,major:true,when:w=>w.hazardsActive&&!w.clientMarching}),
  beat('water-meets-copper','crisis','electrified_puddle',{minTime:92,weight:1.7,major:true,when:w=>w.wetCableActive}),
  beat('inspector-sees-hidden-work','crisis','hidden_work',{minTime:105,weight:1.5,major:true,when:w=>w.engineeringRisk&&!w.panelAccepted}),
  beat('client-finds-the-installation','crisis','client_finds_hazard',{minTime:118,weight:1.6,major:true,when:w=>w.hazardsActive&&!w.clientMarching}),
  beat('supplier-finds-certificate','recovery','certificate_found',{weight:1.15,when:w=>!w.materialsChecked}),
  beat('worker-corrects-himself','recovery','self_correction',{weight:1}),
  beat('client-stuck-at-turnstile','recovery','client_delayed',{weight:1.1,when:w=>w.hazardsActive}),
  beat('one-quiet-minute','recovery','quiet_minute',{weight:1.3})
];

const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,value));
const weightedPick=(rng,items)=>{const total=items.reduce((sum,item)=>sum+item.score,0),roll=rng()*total;let cursor=0;for(const item of items){cursor+=item.score;if(roll<cursor)return item.beat}return items.at(-1)?.beat||null};

export class DayOneDirector{
  constructor(seed='day-one'){this.seed=String(seed);this.rng=createSeededRng(`${seed}:director`);this.time=0;this.tension=18;this.phase='observation';this.nextBeatAt=8;this.recoveryUntil=0;this.history=[];this.lastFired=new Map();this.pendingMajor=null;this.style={direct:0,delegate:0,shout:0,diplomacy:0,magic:0};this.authority=72;this.trust=52;this.listeners=new Set();this.magicReadyAt=0}
  subscribe(listener){this.listeners.add(listener);listener(this.snapshot());return()=>this.listeners.delete(listener)}
  notify(){const state=this.snapshot();for(const listener of this.listeners)listener(state)}
  dominantStyle(){return Object.entries(this.style).sort((a,b)=>b[1]-a[1])[0]?.[0]||'direct'}
  record(mode,{success=true,severity=1}={}){if(mode in this.style)this.style[mode]+=severity;if(mode==='shout'){this.authority=clamp(this.authority-(success?2:5)*severity);this.trust=clamp(this.trust-3*severity)}if(mode==='delegate')this.trust=clamp(this.trust+(success?2:-3)*severity);if(mode==='diplomacy')this.authority=clamp(this.authority+(success?1:-1)*severity);if(mode==='direct')this.authority=clamp(this.authority+Math.min(2,severity));this.notify()}
  desiredTension(world){const hazards=(world.hazardsActiveCount||0)*12,risks=(world.riskyJobs||0)*9,unattended=(world.attention||0)*.22,timePressure=(1-(world.remaining||300)/300)*22,overload=Math.max(0,(world.workingJobs||0)-1)*6,pending=this.pendingMajor?8:0;return clamp(10+hazards+risks+unattended+timePressure+overload+pending)}
  choosePhase(){if(this.time<28)return'observation';if(this.time<this.recoveryUntil)return'recovery';if(this.tension>=66)return'crisis';if(this.tension>=34)return'pressure';return'observation'}
  candidates(world){const dominant=this.dominantStyle(),recent=new Set(this.history.slice(-5).map(item=>item.id));return DAY_ONE_BEATS.filter(item=>item.phase===this.phase&&this.time>=item.minTime&&(!item.when||item.when(world))&&!recent.has(item.id)&&(!this.lastFired.has(item.id)||this.time-this.lastFired.get(item.id)>=item.cooldown)&&(!item.major||!this.pendingMajor)).map(item=>({beat:item,score:item.weight*(item.style===dominant?1.75:1)}))}
  scheduleNext(){const pace={observation:22,pressure:16,crisis:11,recovery:25}[this.phase],jitter=4+this.rng()*7;this.nextBeatAt=this.time+pace+jitter}
  tick(dt,world={}){if(dt<=0)return[];this.time+=dt;const target=this.desiredTension(world);this.tension+=((target-this.tension)*(1-Math.exp(-dt*.55)));this.phase=this.choosePhase();if(this.time<this.nextBeatAt)return[];const selected=weightedPick(this.rng,this.candidates(world));this.scheduleNext();if(!selected)return[];const event={...selected,at:this.time,tension:Math.round(this.tension),style:this.dominantStyle()};this.history.push(event);this.lastFired.set(selected.id,this.time);if(selected.major)this.pendingMajor=selected.id;this.notify();return[event]}
  resolveMajor(id,{success=true}={}){if(this.pendingMajor!==id)return false;this.pendingMajor=null;this.recoveryUntil=this.time+(success?28:18);this.tension=clamp(this.tension+(success?-22:9));this.notify();return true}
  attemptMagic(world={}){if(this.time<this.magicReadyAt)return{ok:false,reason:'cooldown',remaining:this.magicReadyAt-this.time};this.magicReadyAt=this.time+70;this.record('magic',{success:true});const roll=this.rng();if(this.pendingMajor&&roll<.38){const id=this.pendingMajor;this.resolveMajor(id,{success:true});return{ok:true,outcome:'solved',target:id}}if(world.hazardsActive&&roll<.66){this.recoveryUntil=this.time+20;this.tension=clamp(this.tension-16);return{ok:true,outcome:'bought_time'}}this.tension=clamp(this.tension+14);this.nextBeatAt=Math.min(this.nextBeatAt,this.time+4);return{ok:true,outcome:'backfire'}}
  snapshot(){return{time:this.time,tension:Math.round(this.tension),phase:this.phase,pendingMajor:this.pendingMajor,authority:Math.round(this.authority),trust:Math.round(this.trust),dominantStyle:this.dominantStyle(),style:{...this.style},history:this.history.map(item=>({...item})),magicReadyAt:this.magicReadyAt}}
}
