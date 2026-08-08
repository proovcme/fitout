import{createSeededRng}from'./character-generator.js';

const TEMPLATES=[
  {id:'bankrot-basement',label:'Цоколь БЦ «Банкрот»',zones:{entrance:{x:[-7.4,-4.6],z:[-5.7,-3]},coordination:{x:[-2.1,.7],z:[-2.1,.6]},workfront:{x:[-.2,3.3],z:[2.7,5]},engineering:{x:[4.55,6.5],z:[2.6,5]},logistics:{x:[3.15,5.15],z:[-4.3,-2.65]},welfare:{x:[-5.1,-4.15],z:[2.1,3.25]}},roomOrder:['entrance','coordination','workfront','engineering','logistics','welfare']},
  {id:'occupied-office',label:'Офис, который забыл выселиться',zones:{entrance:{x:[-7.3,-5],z:[-5.6,-3.3]},coordination:{x:[-2.2,.5],z:[-1.9,.4]},workfront:{x:[-.1,2.9],z:[2.9,5.2]},engineering:{x:[4.7,6.7],z:[2.8,5.1]},logistics:{x:[3.3,5.25],z:[-4.4,-2.7]},welfare:{x:[-5.2,-4.2],z:[2.05,3.2]}},roomOrder:['entrance','coordination','workfront','engineering','logistics','welfare']},
  {id:'fast-fitout',label:'Быстрый ремонт, медленное согласование',zones:{entrance:{x:[-7.2,-4.9],z:[-5.5,-3.2]},coordination:{x:[-2,.6],z:[-2,.5]},workfront:{x:[-.15,3.1],z:[2.8,5.15]},engineering:{x:[4.65,6.6],z:[2.7,5]},logistics:{x:[3.2,5.1],z:[-4.25,-2.7]},welfare:{x:[-5.15,-4.1],z:[2.1,3.3]}},roomOrder:['entrance','coordination','workfront','engineering','logistics','welfare']}
];
const CONTENT_RULES={supply:{zone:'entrance'},crate:{zone:'coordination'},trash:{zone:'workfront'},wetCable:{zone:'engineering'},materials:{zone:'logistics'},chair:{zone:'welfare'}};
const pick=(rng,list)=>list[Math.floor(rng()*list.length)%list.length];
const pointIn=(rng,bounds)=>({x:Number((bounds.x[0]+rng()*(bounds.x[1]-bounds.x[0])).toFixed(2)),z:Number((bounds.z[0]+rng()*(bounds.z[1]-bounds.z[0])).toFixed(2))});

export function generateAdventureSite(seed='fitout-site'){
  const rng=createSeededRng(seed),template=pick(rng,TEMPLATES),interactables={};
  for(const[id,rule]of Object.entries(CONTENT_RULES))interactables[id]={id,zone:rule.zone,position:pointIn(rng,template.zones[rule.zone])};
  return{seed,templateId:template.id,label:template.label,zones:structuredClone(template.zones),roomOrder:[...template.roomOrder],interactables};
}

export function validateAdventureSite(site){
  const errors=[];
  if(!site?.templateId)errors.push('template_missing');
  for(const[id,rule]of Object.entries(CONTENT_RULES)){
    const item=site?.interactables?.[id],zone=site?.zones?.[rule.zone];
    if(!item||!zone){errors.push(`${id}_missing`);continue}
    if(item.zone!==rule.zone||item.position.x<zone.x[0]||item.position.x>zone.x[1]||item.position.z<zone.z[0]||item.position.z>zone.z[1])errors.push(`${id}_outside_${rule.zone}`);
  }
  return{ok:errors.length===0,errors};
}

export const ADVENTURE_SITE_TEMPLATES=TEMPLATES.map(({id,label,roomOrder})=>({id,label,roomOrder:[...roomOrder]}));
