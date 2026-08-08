const FIRST_NAMES=['Алексей','Андрей','Антон','Борис','Вадим','Виктор','Георгий','Денис','Дмитрий','Евгений','Иван','Илья','Кирилл','Максим','Михаил','Никита','Олег','Павел','Роман','Руслан','Сергей','Семён','Тимур','Фёдор'];
const LAST_NAMES=['Арматуров','Ветров','Глухов','Допников','Кабелев','Каскин','Кранов','Листов','Маяков','Молотков','Проёмов','Проводов','Рулеткин','Сметин','Согласов','Стяжкин','Трассов','Уклонов','Фасадов','Чертёжев','Штробин','Щитов','Эскизов','Ящиков'];
const FEMALE_FIRST_NAMES=['Алина','Алёна','Анна','Валерия','Вера','Дарья','Евгения','Екатерина','Елена','Ирина','Ксения','Лариса','Маргарита','Мария','Надежда','Наталья','Ольга','Полина','Светлана','Софья','Тамара','Татьяна','Юлия','Яна'];
const FEMALE_LAST_NAMES=['Арматурова','Ветрова','Глухова','Допникова','Кабелева','Каскина','Кранова','Листова','Маякова','Молоткова','Проёмова','Проводова','Рулеткина','Сметина','Согласова','Стяжкина','Трассова','Уклонова','Фасадова','Чертежёва','Штробина','Щитова','Эскизова','Ящикова'];
const TRAITS=['помнит, где лежит рулетка','не верит устным согласованиям','умеет молчать в общем чате','видел проект до изменений','отличает срочно от очень срочно','не боится исполнительной схемы','может найти розетку по переписке','знает короткий путь в курилку','приходит со своим удлинителем','сохраняет спокойствие до третьей переделки'];
export const ROLE_PRESETS={
  project_manager:{label:'Руководитель проекта',accent:'#e8923e',speed:1,discipline:78},
  client:{label:'Заказчик',accent:'#6e536f',speed:.88,discipline:65},
  foreman:{label:'Прораб',accent:'#f28a24',speed:1,discipline:74},
  worker:{label:'Подсобник',accent:'#e4b83f',speed:1.05,discipline:58},
  electrician:{label:'Электрик',accent:'#3f88d4',speed:.98,discipline:68},
  designer:{label:'Проектировщик',accent:'#8e6cc7',speed:.9,discipline:83},
  architect:{label:'Архитектор',accent:'#7b5a78',speed:.92,discipline:80},
  plumber:{label:'Сантехник',accent:'#3da89a',speed:.98,discipline:67},
  inspector:{label:'Технадзор',accent:'#b26155',speed:.9,discipline:86},
  engineer:{label:'Инженер ПТО',accent:'#6c8d9a',speed:.92,discipline:81},
  hvac:{label:'Монтажник ОВиК',accent:'#36a7a0',speed:1,discipline:64},
  finisher:{label:'Отделочник',accent:'#c96c55',speed:1.04,discipline:61}
};
export const DIRECTIONS=['front','back','left','right'];
export const STATES=['idle','walk','run','drill','hammer','sit','smoke','computer','carry'];
export const ATLAS_LAYOUT={front:{row:0,start:0},back:{row:1,start:0},left:{row:2,start:0},right:{row:3,start:0}};

export function generateCharacter(seed='Банкрот-001',overrides={}){const rng=createSeededRng(seed),roleKey=overrides.role&&ROLE_PRESETS[overrides.role]?overrides.role:pickSeeded(rng,Object.keys(ROLE_PRESETS)),preset=ROLE_PRESETS[roleKey],appearance=generateAppearance(`${seed}:appearance`,roleKey,{...overrides.appearance,uniformTone:overrides.accent||overrides.appearance?.uniformTone||preset.accent}),pack=APPEARANCE_PACKS[appearance.packId],feminine=pack.genderPresentation==='feminine',firstNames=feminine?FEMALE_FIRST_NAMES:FIRST_NAMES,lastNames=feminine?FEMALE_LAST_NAMES:LAST_NAMES,name=overrides.name||`${pickSeeded(rng,firstNames)} ${pickSeeded(rng,lastNames)}`,traits=[pickSeeded(rng,TRAITS),pickSeeded(rng,TRAITS.filter(item=>item!==TRAITS[0]))],stats={competence:Math.round(48+rng()*47),discipline:Math.round((preset.discipline+rng()*22-11)),loyalty:Math.round(35+rng()*60),energy:Math.round(62+rng()*35),chaos:Math.round(15+rng()*70)},biography=generateBiography(seed,roleKey,pack.genderPresentation);return{
  id:`unit-${hashSeed(seed).toString(36)}`,seed:String(seed),name,role:roleKey,roleLabel:preset.label,accent:appearance.uniformTone,appearance,traits,stats,biography,reporting:{supervisorRole:REPORTING_CHAIN[roleKey]||null,supervisorId:overrides.supervisorId||null},
  animation:{idleFps:.55,walkFps:7*preset.speed,runFps:10*preset.speed,workFps:4.5,frames:{idle:4,walk:8,run:8,work:4}},atlases:pack.atlases
}}

export function frameRect(state,direction,time,width,height,profile){const workRows={drill:0,hammer:1,sit:2,smoke:3,computer:4,carry:5},isWork=state in workRows,layout=ATLAS_LAYOUT[direction]||ATLAS_LAYOUT.back,fps=isWork?profile.animation.workFps:state==='idle'?profile.animation.idleFps:state==='run'?profile.animation.runFps:profile.animation.walkFps,frames=isWork?4:(profile.animation.frames?.[state]||4),cols=isWork?4:frames,rows=isWork?6:4,row=isWork?workRows[state]:layout.row,frame=Math.floor(time*fps)%frames;return{x:frame*width/cols,y:row*height/rows,width:width/cols,height:height/rows,frame}}

const parseHex=hex=>{const value=parseInt(hex.replace('#',''),16);return[(value>>16)&255,(value>>8)&255,value&255]};
export function tintUniform(source,accent){const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);const image=ctx.getImageData(0,0,canvas.width,canvas.height),data=image.data,[tr,tg,tb]=parseHex(accent);for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];if(data[i+3]&&r>165&&g>45&&g<205&&b<72&&r>g*1.18){const light=Math.max(.34,Math.min(1.18,(r+g*.35)/250));data[i]=Math.min(255,tr*light);data[i+1]=Math.min(255,tg*light);data[i+2]=Math.min(255,tb*light)}}ctx.putImageData(image,0,0);return canvas}
export function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=url})}
export async function loadCharacterAtlases(profile){const idle=await loadImage(profile.atlases.idle),[walk,work]=await Promise.all([profile.atlases.walk?loadImage(profile.atlases.walk):idle,profile.atlases.work?loadImage(profile.atlases.work):idle]);return{idle:tintUniform(idle,profile.accent),walk:tintUniform(walk,profile.accent),work:tintUniform(work,profile.accent)}}
const anchorCache=new WeakMap();
export function alphaBounds(source,rect,threshold=18){let sourceCache=anchorCache.get(source);if(!sourceCache){sourceCache=new Map();anchorCache.set(source,sourceCache)}const key=`${rect.x}:${rect.y}:${rect.width}:${rect.height}:${threshold}`;if(sourceCache.has(key))return sourceCache.get(key);const ctx=source.getContext?.('2d',{willReadFrequently:true});if(!ctx){const fallback={centerX:rect.width/2,bottom:rect.height};sourceCache.set(key,fallback);return fallback}const data=ctx.getImageData(rect.x,rect.y,rect.width,rect.height).data;let minX=rect.width,maxX=0,maxY=0,found=false;for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++)if(data[(y*rect.width+x)*4+3]>threshold){minX=Math.min(minX,x);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);found=true}const result=found?{centerX:(minX+maxX+1)/2,bottom:maxY+1}:{centerX:rect.width/2,bottom:rect.height};sourceCache.set(key,result);return result}
export function anchoredFrameDestination(rect,bounds,target){const scaleX=target.width/rect.width,scaleY=target.height/rect.height;return{x:target.x+(rect.width/2-bounds.centerX)*scaleX,y:target.y+(rect.height-bounds.bottom)*scaleY,width:target.width,height:target.height}}
export function drawCharacter(ctx,atlases,profile,state,direction,time,target){const pack=APPEARANCE_PACKS[profile.appearance?.packId],effectiveState=pack?.supports.includes(state)?state:'idle',source=effectiveState==='idle'?atlases.idle:['walk','run'].includes(effectiveState)?atlases.walk:atlases.work,rect=frameRect(effectiveState,direction,time,source.width,source.height,profile),base={x:0,y:0,width:ctx.canvas.width,height:ctx.canvas.height,...target},scale=profile.appearance?.renderScale||[1,1],scaled={x:base.x+base.width*(1-scale[0])/2,y:base.y+base.height*(1-scale[1]),width:base.width*scale[0],height:base.height*scale[1]},destination=anchoredFrameDestination(rect,alphaBounds(source,rect),scaled);ctx.clearRect(base.x,base.y,base.width,base.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,rect.x,rect.y,rect.width,rect.height,destination.x,destination.y,destination.width,destination.height);return{...rect,state:effectiveState,destination}}
import{hashSeed,createSeededRng,pickSeeded}from'./seed-utils.js';
import{generateAppearance,APPEARANCE_PACKS}from'./character-appearance.js';
import{generateBiography}from'./character-biographies.js';
import{REPORTING_CHAIN}from'./character-classes.js';
export{createSeededRng}from'./seed-utils.js';
