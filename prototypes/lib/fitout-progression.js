export const FITOUT_PROFILE_KEY='fitout-profile-v2';
export const FITOUT_PROFILE_VERSION=2;

export const DEFAULT_FITOUT_PROFILE={version:FITOUT_PROFILE_VERSION,runs:0,wins:0,bestSeconds:null,highestQuality:0,highestScore:0,relationships:{},lessons:[],discoveredSituations:[],unlockedLayouts:['central_spine'],unlockedFurniture:['desk','meetingTable','toilet','rack','sofa'],unlockedBriefs:['startup'],unlockedConditions:['narrow_delivery','legacy_wiring','live_office'],lastSeed:null,lastOutcome:null};

const unique=list=>[...new Set((Array.isArray(list)?list:[]).map(String))];
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));

export function migrateFitoutProfile(raw={},legacy={}){
  const source=raw&&typeof raw==='object'?raw:{},old=legacy&&typeof legacy==='object'?legacy:{},profile={...DEFAULT_FITOUT_PROFILE,...source};
  profile.version=FITOUT_PROFILE_VERSION;profile.runs=Math.max(Number(source.runs??old.runs)||0,0);profile.wins=Math.max(Number(source.wins??old.wins)||0,0);profile.bestSeconds=source.bestSeconds==null?null:Math.max(1,Number(source.bestSeconds)||1);profile.highestQuality=clamp(source.highestQuality,0,100);profile.highestScore=Math.max(0,Math.round(Number(source.highestScore)||0));profile.relationships={...(old.relationships||{}),...(source.relationships||{})};profile.lessons=unique([...(old.lessons||[]),...(source.lessons||[])]);profile.discoveredSituations=unique(source.discoveredSituations);for(const key of['unlockedLayouts','unlockedFurniture','unlockedBriefs','unlockedConditions'])profile[key]=unique([...DEFAULT_FITOUT_PROFILE[key],...(source[key]||[])]);return profile
}

export function fitoutUnlocksForRuns(runs){
  const result={layouts:[],furniture:[],briefs:[],conditions:[]};
  if(runs>=1){result.layouts.push('side_spine');result.furniture.push('whiteboard','printer');result.briefs.push('agency');result.conditions.push('missing_lift')}
  if(runs>=2){result.layouts.push('cross');result.furniture.push('phoneBooth','lockers');result.briefs.push('legal');result.conditions.push('crooked_slab')}
  if(runs>=3){result.layouts.push('bent');result.furniture.push('kitchenette','plant');result.briefs.push('support');result.conditions.push('cost_pressure')}
  if(runs>=5){result.furniture.push('receptionDesk');result.briefs.push('hybrid');result.conditions.push('late_change')}
  return result
}

export function completeFitoutRun(profile,outcome={}){
  const next=migrateFitoutProfile(profile),before={layouts:new Set(next.unlockedLayouts),furniture:new Set(next.unlockedFurniture),briefs:new Set(next.unlockedBriefs),conditions:new Set(next.unlockedConditions)};next.runs+=1;if(outcome.won)next.wins+=1;const seconds=Math.max(1,Math.round(Number(outcome.seconds)||180)),score=Math.max(0,Math.round(Number(outcome.score)||0));if(outcome.won&&(next.bestSeconds==null||seconds<next.bestSeconds))next.bestSeconds=seconds;next.highestQuality=Math.max(next.highestQuality,clamp(outcome.quality,0,100));next.highestScore=Math.max(next.highestScore,score);next.lastSeed=outcome.seed?String(outcome.seed):next.lastSeed;next.lastOutcome={won:Boolean(outcome.won),seconds,score,quality:clamp(outcome.quality,0,100),budget:clamp(outcome.budget,0,100),commissionScore:clamp(outcome.commissionScore,0,100),commissionMoment:outcome.commissionMoment||null,whatIf:outcome.whatIf||null,condition:outcome.condition||null,layout:outcome.layout||null};next.discoveredSituations=unique([...next.discoveredSituations,...(outcome.situations||[])]);next.relationships={...next.relationships,...(outcome.relationships||{})};next.lessons=unique([...next.lessons,...(outcome.lessons||[])]);const unlocks=fitoutUnlocksForRuns(next.runs);for(const id of unlocks.layouts)if(!next.unlockedLayouts.includes(id))next.unlockedLayouts.push(id);for(const id of unlocks.furniture)if(!next.unlockedFurniture.includes(id))next.unlockedFurniture.push(id);for(const id of unlocks.briefs)if(!next.unlockedBriefs.includes(id))next.unlockedBriefs.push(id);for(const id of unlocks.conditions)if(!next.unlockedConditions.includes(id))next.unlockedConditions.push(id);const newlyUnlocked={layouts:next.unlockedLayouts.filter(id=>!before.layouts.has(id)),furniture:next.unlockedFurniture.filter(id=>!before.furniture.has(id)),briefs:next.unlockedBriefs.filter(id=>!before.briefs.has(id)),conditions:next.unlockedConditions.filter(id=>!before.conditions.has(id))};return{profile:next,newlyUnlocked}
}

export function loadFitoutProfile(storage){
  if(!storage)return migrateFitoutProfile();try{return migrateFitoutProfile(JSON.parse(storage.getItem(FITOUT_PROFILE_KEY)||'{}'),JSON.parse(storage.getItem('fitout-run-meta-v1')||'{}'))}catch{return migrateFitoutProfile()}
}

export function saveFitoutProfile(storage,profile){
  if(!storage)return false;try{storage.setItem(FITOUT_PROFILE_KEY,JSON.stringify(migrateFitoutProfile(profile)));return true}catch{return false}
}
