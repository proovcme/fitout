import http from 'node:http';
import crypto from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const port=Number(process.env.FITOUT_PORT??4188);
const dataDir=process.env.FITOUT_DATA_DIR??path.resolve('data');
const dbPath=path.join(dataDir,'players.json');
const secretPath=path.join(dataDir,'session-secret');
const maxBody=5_000_000;
const attempts=new Map();
await mkdir(dataDir,{recursive:true});

async function readOrCreateSecret(){try{return await readFile(secretPath,'utf8');}catch{const value=crypto.randomBytes(48).toString('base64url');await writeFile(secretPath,value,{mode:0o600});return value;}}
const sessionSecret=await readOrCreateSecret();
async function readDb(){try{return JSON.parse(await readFile(dbPath,'utf8'));}catch{return {users:{}};}}
let writeChain=Promise.resolve();
function writeDb(db){writeChain=writeChain.then(async()=>{const temp=`${dbPath}.${process.pid}.tmp`;await writeFile(temp,JSON.stringify(db,null,2),{mode:0o600});await rename(temp,dbPath);});return writeChain;}

const json=(res,status,payload,headers={})=>{const body=JSON.stringify(payload);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','content-length':Buffer.byteLength(body),...headers});res.end(body);};
const normalizeName=(value)=>String(value??'').trim().replace(/\s+/g,' ').slice(0,28);
const keyFor=(name)=>name.toLocaleLowerCase('ru-RU');
const passwordHash=(password,salt)=>new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,{N:16384,r:8,p:1},(error,value)=>error?reject(error):resolve(value.toString('base64url'))));
const safeEqual=(left,right)=>{try{const a=Buffer.from(left);const b=Buffer.from(right);return a.length===b.length&&crypto.timingSafeEqual(a,b);}catch{return false;}};
function tokenFor(name){const payload=Buffer.from(JSON.stringify({name,exp:Date.now()+1000*60*60*24*30})).toString('base64url');const sig=crypto.createHmac('sha256',sessionSecret).update(payload).digest('base64url');return `${payload}.${sig}`;}
function sessionName(req){const cookie=String(req.headers.cookie??'').split(';').map(part=>part.trim()).find(part=>part.startsWith('fitout_session='));const token=cookie?.slice('fitout_session='.length);if(!token)return null;const [payload,sig]=token.split('.');if(!payload||!sig)return null;const expected=crypto.createHmac('sha256',sessionSecret).update(payload).digest('base64url');if(!safeEqual(sig,expected))return null;try{const parsed=JSON.parse(Buffer.from(payload,'base64url').toString());return parsed.exp>Date.now()?parsed.name:null;}catch{return null;}}
const sessionCookie=(name)=>`fitout_session=${tokenFor(name)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;
async function bodyOf(req){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>maxBody)throw new Error('body-too-large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
function rateLimited(req){const key=req.socket.remoteAddress??'unknown';const now=Date.now();const recent=(attempts.get(key)??[]).filter(time=>now-time<60_000);recent.push(now);attempts.set(key,recent);return recent.length>18;}

const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(req.method==='GET'&&url.pathname==='/health')return json(res,200,{ok:true});
    if(req.method==='POST'&&['/register','/login'].includes(url.pathname)){
      if(rateLimited(req))return json(res,429,{error:'Слишком много попыток. Объект поставлен на технологический перерыв.'});
      const {username,password}=await bodyOf(req);const name=normalizeName(username);
      if(name.length<2||String(password??'').length<4||String(password??'').length>72)return json(res,400,{error:'Имя: 2–28 символов. Пароль: 4–72 символа.'});
      const db=await readDb();const key=keyFor(name);let user=db.users[key];
      if(url.pathname==='/register'){
        if(user)return json(res,409,{error:'Такой игрок уже зарегистрирован.'});
        const salt=crypto.randomBytes(18).toString('base64url');user={name,salt,passwordHash:await passwordHash(password,salt),createdAt:new Date().toISOString(),save:null,history:[]};db.users[key]=user;await writeDb(db);
      }else if(!user||!safeEqual(await passwordHash(password,user.salt),user.passwordHash))return json(res,401,{error:'Имя или пароль не подошли.'});
      return json(res,200,{ok:true,user:user.name,state:user.save,historyCount:user.history?.length??0},{'set-cookie':sessionCookie(user.name)});
    }
    if(req.method==='POST'&&url.pathname==='/save'){
      const name=sessionName(req);if(!name)return json(res,401,{error:'Нужно войти заново.'});
      const {state}=await bodyOf(req);const legacyValid=state&&Array.isArray(state.tasks);const v2Valid=state?.schemaVersion===2&&state.company&&Array.isArray(state.portfolio?.projects)&&state.portfolio.projects.length<=3&&Array.isArray(state.staff?.employees);if(!legacyValid&&!v2Valid)return json(res,400,{error:'Сохранение повреждено.'});
      const db=await readDb();const user=db.users[keyFor(name)];if(!user)return json(res,401,{error:'Игрок не найден.'});
      const wasCompleted=Boolean(user.save?.completed);user.save=state;user.updatedAt=new Date().toISOString();
      if(state.completed&&!wasCompleted){user.history??=[];user.history.unshift({at:user.updatedAt,order:state.selectedOrder?.title??'Безымянный объект',quality:Math.round(state.quality??0),budget:Math.round(state.budget??0)});user.history=user.history.slice(0,40);}
      await writeDb(db);return json(res,200,{ok:true});
    }
    if(req.method==='POST'&&url.pathname==='/logout')return json(res,200,{ok:true},{'set-cookie':'fitout_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
    json(res,404,{error:'not-found'});
  }catch(error){json(res,error.message==='body-too-large'?413:500,{error:'Серверный прораб уронил журнал. Попробуйте ещё раз.'});}
});
server.listen(port,'127.0.0.1',()=>process.stdout.write(`fitout save server on 127.0.0.1:${port}\n`));
