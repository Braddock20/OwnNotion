import http from 'node:http';
import {URL} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const PORT=Number(process.env.PORT||10000);
const API='/api/v1';
const DATA_FILE=process.env.DATA_FILE||'./data/life-os.json';
function normalizeDbUrl(raw){
  if(!raw)return '';
  let s=String(raw).trim();
  if((s.startsWith('"')&&s.endsWith('"'))||(s.startsWith("'")&&s.endsWith("'"))){s=s.slice(1,-1).trim();}
  try{ if(s.includes('%25')||s.includes('%3A')||s.includes('%2F')) s=decodeURIComponent(s); }catch{}
  return s;
}
const DATABASE_URL=normalizeDbUrl(process.env.DATABASE_URL);
const API_KEY=process.env.API_KEY||'';
const VERSION='1.0.0';
const TYPES=['tasks','projects','goals','milestones','habits','habit_logs','challenges','challenge_items','events','timetable','time','journal','notes','knowledge','ideas','decisions','waiting','transactions','budgets','savings','metrics','metric_entries','life-areas','tags','reminders','daily-plans'];
const id=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const day=()=>new Date().toISOString().slice(0,10);
const clone=x=>JSON.parse(JSON.stringify(x));
const initial=()=>({version:1,created_at:now(),updated_at:now(),collections:Object.fromEntries(TYPES.map(x=>[x,[]])),history:[]});
let db=initial();
let saveTimer=null;
let storageMode=DATABASE_URL?'postgres':'json';
let pgPool=null;
let pgReady=false;
const subscribers=new Set();

// ====== PostgreSQL adapter (using `pg`) ======
async function pgInit(){
  if(!DATABASE_URL)return false;
  try{
    pgPool=new pg.Pool({connectionString:DATABASE_URL, ssl:{rejectUnauthorized:false}, max:5, idleTimeoutMillis:30000});
    pgPool.on('error',(e)=>{console.error('[pg] pool error:',e.message);pgReady=false;});
    const c=await pgPool.connect();
    try{
      await c.query(`CREATE TABLE IF NOT EXISTS life_records (
        id UUID PRIMARY KEY,
        entity_type TEXT NOT NULL,
        data JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ
      )`);
      await c.query(`CREATE INDEX IF NOT EXISTS life_records_type_idx ON life_records(entity_type)`);
      await c.query(`CREATE TABLE IF NOT EXISTS life_history (
        id UUID PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id UUID,
        action TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
      await c.query(`CREATE INDEX IF NOT EXISTS life_history_created_idx ON life_history(created_at DESC)`);
      console.log('[pg] connected, schema ready');
      pgReady=true;
    }finally{ c.release(); }
    return true;
  }catch(e){
    console.error('[pg] init failed:',e.message);
    return false;
  }
}

async function pgLoadAll(){
  const recs=await pgPool.query('SELECT id, entity_type, data, created_at, updated_at, deleted_at FROM life_records');
  const his=await pgPool.query('SELECT id, entity_type, entity_id, action, metadata, created_at FROM life_history ORDER BY created_at DESC LIMIT 100000');
  const out=initial();
  for(const r of recs.rows){
    const t=r.entity_type;if(!TYPES.includes(t))continue;
    const obj=typeof r.data==='string'?JSON.parse(r.data):r.data;
    obj.id=r.id;obj.created_at=new Date(r.created_at).toISOString();obj.updated_at=new Date(r.updated_at).toISOString();
    if(r.deleted_at)obj.deleted_at=new Date(r.deleted_at).toISOString();
    out.collections[t].push(obj);
  }
  out.history=his.rows.map(r=>({
    id:r.id,entity_type:r.entity_type,entity_id:r.entity_id,action:r.action,
    metadata:typeof r.metadata==='string'?JSON.parse(r.metadata):(r.metadata||{}),
    created_at:new Date(r.created_at).toISOString()
  }));
  return out;
}
async function pgInsertRecord(type,obj){
  await pgPool.query(
    'INSERT INTO life_records (id, entity_type, data, created_at, updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data, updated_at=EXCLUDED.updated_at, deleted_at=EXCLUDED.deleted_at',
    [obj.id, type, JSON.stringify(obj), obj.created_at, obj.updated_at]
  );
}
async function pgInsertHistory(h){
  await pgPool.query(
    'INSERT INTO life_history (id, entity_type, entity_id, action, metadata, created_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT (id) DO NOTHING',
    [h.id, h.entity_type, h.entity_id, h.action, JSON.stringify(h.metadata), h.created_at]
  );
}

// ====== Persistence layer ======
async function load(){
  if(storageMode==='postgres'){
    const ok=await pgInit();
    if(!ok){console.warn('[pg] unavailable, falling back to JSON store');storageMode='json';pgPool=null;}
    else{db=await pgLoadAll();return;}
  }
  try{const raw=await fs.readFile(DATA_FILE,'utf8');db=JSON.parse(raw);for(const t of TYPES)db.collections[t]??=[];db.history??=[];}catch(e){if(e.code!=='ENOENT')throw e;await persist(true);}
}
async function persist(immediate=false){
  if(storageMode==='postgres'&&pgReady)return; // writes are per-mutation
  db.updated_at=now();
  if(immediate){await fs.mkdir(path.dirname(path.resolve(DATA_FILE)),{recursive:true});await fs.writeFile(DATA_FILE,JSON.stringify(db,null,2));return;}
  if(saveTimer)return;saveTimer=setTimeout(async()=>{saveTimer=null;await fs.mkdir(path.dirname(path.resolve(DATA_FILE)),{recursive:true});await fs.writeFile(DATA_FILE,JSON.stringify(db,null,2));},40);
}
function emit(type,data){const packet=`event: ${type}\ndata: ${JSON.stringify({data,at:now()})}\n\n`;for(const res of subscribers){try{res.write(packet)}catch{}}}
function history(entity_type,entity_id,action,metadata={}){
  const h={id:id(),entity_type,entity_id:entity_id||null,action,metadata,created_at:now()};
  db.history.unshift(h);db.history=db.history.slice(0,100000);
  emit('history.created',h);
  if(storageMode==='postgres'&&pgReady){
    pgInsertHistory(h).catch(e=>console.error('[pg] history err',e.message));
  }
  return h;
}
function collection(type){if(!TYPES.includes(type))throw Object.assign(new Error('Unknown collection'),{status:404});return db.collections[type];}
function active(rows){return rows.filter(x=>!x.deleted_at&&!x.archived_at);}
function find(type,itemId){return collection(type).find(x=>x.id===itemId)||null;}
async function create(type,input){
  const t=now();const x={id:id(),...input,created_at:t,updated_at:t};
  collection(type).unshift(x);
  history(type,x.id,'created',{fields:Object.keys(input)});
  emit(`${type}.created`,x);
  if(storageMode==='postgres'&&pgReady){
    pgInsertRecord(type,x).catch(e=>console.error('[pg] insert err',e.message));
  } else { persist(); }
  return x;
}
async function update(type,itemId,input){
  const rows=collection(type),i=rows.findIndex(x=>x.id===itemId);if(i<0)return null;
  const before=clone(rows[i]);
  rows[i]={...rows[i],...input,updated_at:now()};
  history(type,itemId,'updated',{fields:Object.keys(input),before});
  emit(`${type}.updated`,rows[i]);
  if(storageMode==='postgres'&&pgReady){
    pgInsertRecord(type,rows[i]).catch(e=>console.error('[pg] update err',e.message));
  } else { persist(); }
  return rows[i];
}
function remove(type,itemId){return update(type,itemId,{deleted_at:now()});}
function queryRows(type,query){let rows=active(collection(type));for(const [k,v] of query){if(['limit','page','q','from','to'].includes(k))continue;if(v==='')continue;rows=rows.filter(x=>String(x[k])===String(v));}const q=query.get('q');if(q)rows=rows.filter(x=>JSON.stringify(x).toLowerCase().includes(q.toLowerCase()));const from=query.get('from'),to=query.get('to');if(from)rows=rows.filter(x=>String(x.date||x.entry_date||x.transaction_date||x.created_at).slice(0,10)>=from);if(to)rows=rows.filter(x=>String(x.date||x.entry_date||x.transaction_date||x.created_at).slice(0,10)<=to);return rows.slice(0,Math.min(Number(query.get('limit')||100),1000));}
function json(res,status,data){const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':process.env.CORS_ORIGIN||'*','cache-control':'no-store'});res.end(body);}
async function body(req){let s='';for await(const c of req)s+=c;if(!s)return {};try{return JSON.parse(s)}catch{throw Object.assign(new Error('Invalid JSON'),{status:400})}}
function check(req,res){if(!API_KEY)return true;if(req.method==='OPTIONS')return true;if(req.headers['x-api-key']!==API_KEY){json(res,401,{ok:false,error:{code:'UNAUTHORIZED',message:'API key required'}});return false}return true;}
function validate(type,b){if(!b||typeof b!=='object')throw Object.assign(new Error('Body must be an object'),{status:400});const required={tasks:['title'],projects:['name'],goals:['title'],habits:['name'],challenges:['title','start_date'],events:['title','start_at'],timetable:['title','weekday','start_time','end_time'],time:['title','start_at'],journal:['content','entry_date'],notes:['title'],knowledge:['title'],ideas:['title'],decisions:['decision'],waiting:['item'],transactions:['kind','amount_minor','category','transaction_date'],budgets:['name','category','amount_minor','start_date'],savings:['name','target_minor'],metrics:['name'],life_areas:['name'],tags:['name'],reminders:['title','remind_at'],['daily-plans']:['date']}[type]||[];for(const k of required)if(b[k]===undefined||b[k]===null||b[k]==='')throw Object.assign(new Error(`Missing field: ${k}`),{status:400});if(type==='transactions'&& !['expense','income','transfer'].includes(b.kind))throw Object.assign(new Error('Invalid transaction kind'),{status:400});return b;}

async function handle(req,res){
  res.setHeader('access-control-allow-origin',process.env.CORS_ORIGIN||'*');res.setHeader('access-control-allow-headers','content-type,x-api-key');res.setHeader('access-control-allow-methods','GET,POST,PATCH,DELETE,OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}if(!check(req,res))return;
  const u=new URL(req.url,`http://${req.headers.host}`),p=u.pathname.replace(/\/+$/,'')||'/';
  if(p===`${API}/health`){return json(res,200,{ok:true,status:'healthy',version:VERSION,storage:storageMode,db_ready:pgReady,time:now()});}
  if(p===API||p===`${API}/`){return json(res,200,{ok:true,name:'Life OS Backend',version:VERSION,realtime:'/api/v1/realtime/stream'});}
  if(p===`${API}/realtime/stream`){res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive','access-control-allow-origin':process.env.CORS_ORIGIN||'*'});res.write(`event: connected\ndata: ${JSON.stringify({version:VERSION,at:now()})}\n\n`);subscribers.add(res);req.on('close',()=>subscribers.delete(res));return;}
  if(p===`${API}/history`&&req.method==='GET'){let hs=[...db.history];const et=u.searchParams.get('entity_type'),eid=u.searchParams.get('entity_id');if(et)hs=hs.filter(x=>x.entity_type===et);if(eid)hs=hs.filter(x=>x.entity_id===eid);return json(res,200,{ok:true,data:hs.slice(0,Number(u.searchParams.get('limit')||100))});}
  const hm=p.match(new RegExp(`^${API}/history/([^/]+)/([^/]+)$`));if(hm&&req.method==='GET')return json(res,200,{ok:true,data:db.history.filter(x=>x.entity_type===hm[1]&&x.entity_id===hm[2])});
  if(p===`${API}/dashboard/today`){const d=day();const tasks=queryRows('tasks',new URLSearchParams({due_date:d}));const tx=queryRows('transactions',new URLSearchParams({transaction_date:d}));const completed=tasks.filter(x=>x.status==='completed').length;const expenses=tx.filter(x=>x.kind==='expense').reduce((a,x)=>a+Number(x.amount_minor||0),0);return json(res,200,{ok:true,data:{date:d,progress:tasks.length?completed/tasks.length:0,tasks,habits:active(collection('habits')),goals:active(collection('goals')).filter(x=>x.status!=='completed'),events:active(collection('events')).slice(0,50),spending_today_minor:expenses,recent_history:db.history.slice(0,20)}});}
  if(p===`${API}/finance/today`){const d=u.searchParams.get('date')||day();const tx=queryRows('transactions',new URLSearchParams({transaction_date:d}));const expenses=tx.filter(x=>x.kind==='expense').reduce((a,x)=>a+Number(x.amount_minor||0),0);const income=tx.filter(x=>x.kind==='income').reduce((a,x)=>a+Number(x.amount_minor||0),0);return json(res,200,{ok:true,data:{date:d,expenses_minor:expenses,income_minor:income,net_minor:income-expenses,transactions:tx}});}
  if(p===`${API}/search`){const q=u.searchParams.get('q')||'';const out=[];for(const type of TYPES){if(['habit_logs','challenge_items','metric_entries'].includes(type))continue;for(const x of queryRows(type,new URLSearchParams({q})))out.push({type,...x});}return json(res,200,{ok:true,data:out.slice(0,200)});}
  if(p===`${API}/export`){return json(res,200,{ok:true,data:clone(db)});}
  if(p===`${API}/import`&&req.method==='POST'){const b=await body(req);if(!b.collections||!b.history)throw Object.assign(new Error('Invalid export'),{status:400});db=b;await persist(true);emit('system.imported',{at:now()});return json(res,200,{ok:true,data:{imported:true}});}
  if(p.startsWith(`${API}/analytics/`)){return analytics(p.slice(`${API}/analytics/`.length),u,res);}

  const action=p.match(new RegExp(`^${API}/(tasks|habits|goals|challenges|metrics)/([^/]+)/([^/]+)(?:/([^/]+))?$`));
  if(action&&req.method==='POST'){
    const [,type,id1,actionName,id2]=action;const typeMap={tasks:'tasks',habits:'habits',goals:'goals',challenges:'challenges',metrics:'metrics'};const t=typeMap[type];
    if(actionName==='complete'&&t==='tasks'){const x=await update(t,id1,{status:'completed',completed_at:now()});if(!x)return json(res,404,{ok:false,error:{code:'NOT_FOUND'}});history(t,id1,'completed');return json(res,200,{ok:true,data:x});}
    if(actionName==='reopen'&&t==='tasks'){const x=await update(t,id1,{status:'planned',completed_at:null});if(!x)return json(res,404,{ok:false,error:{code:'NOT_FOUND'}});history(t,id1,'reopened');return json(res,200,{ok:true,data:x});}
    if(actionName==='check'&&t==='habits'){const h=find(t,id1);if(!h)return json(res,404,{ok:false,error:{code:'NOT_FOUND'}});const b=await body(req);const log=await create('habit_logs',{habit_id:id1,log_date:b.date||day(),completed:b.completed!==false,value:b.value??null,note:b.note||''});history('habits',id1,'checked',{date:log.log_date});return json(res,201,{ok:true,data:log});}
    if(actionName==='progress'&&t==='goals'){const b=await body(req);const x=find(t,id1);if(!x)return json(res,404,{ok:false,error:{code:'NOT_FOUND'}});const next=Number(b.current_value??x.current_value??0);const updated=await update(t,id1,{current_value:next});history(t,id1,'progressed',{value:next});return json(res,200,{ok:true,data:updated});}
    if(actionName==='items'&&t==='challenges'&&id2){const item=find('challenge_items',id2);if(!item)return json(res,404,{ok:false,error:{code:'NOT_FOUND'}});const x=await update('challenge_items',id2,{completed:true,completed_at:now()});history('challenges',id1,'item_completed',{item_id:id2});return json(res,200,{ok:true,data:x});}
    if(actionName==='items'&&t==='challenges'){const b=await body(req);validate('challenge_items',b);const x=await create('challenge_items',{challenge_id:id1,day_number:b.day_number,title:b.title,description:b.description||'',completed:false});return json(res,201,{ok:true,data:x});}
    if(actionName==='entries'&&t==='metrics'){const b=await body(req);if(b.value===undefined)throw Object.assign(new Error('value required'),{status:400});const x=await create('metric_entries',{metric_id:id1,value:Number(b.value),recorded_at:b.recorded_at||now(),note:b.note||''});return json(res,201,{ok:true,data:x});}
  }

  const rel=p.slice((API+'/').length);const aliases={'finance/transactions':'transactions','finance/budgets':'budgets','finance/savings':'savings'};let raw=rel,itemId;const nested=Object.keys(aliases).find(k=>rel===k||rel.startsWith(k+'/'));if(nested){raw=nested;const rest=rel.slice(nested.length);itemId=rest.startsWith('/')?rest.slice(1):undefined;}else{const parts=rel.split('/').filter(Boolean);itemId=parts.length>1?parts.pop():undefined;raw=parts.join('/');}const type=aliases[raw]||raw;
  if(!TYPES.includes(type))return json(res,404,{ok:false,error:{code:'NOT_FOUND',message:'Unknown resource'}});
  if(req.method==='GET'){if(itemId){const x=find(type,itemId);return x?json(res,200,{ok:true,data:x}):json(res,404,{ok:false,error:{code:'NOT_FOUND',message:'Not found'}});}return json(res,200,{ok:true,data:queryRows(type,u.searchParams)});}
  if(req.method==='POST'&&!itemId){const b=validate(type,await body(req));const x=await create(type,b);return json(res,201,{ok:true,data:x});}
  if(req.method==='PATCH'&&itemId){const x=await update(type,itemId,await body(req));return x?json(res,200,{ok:true,data:x}):json(res,404,{ok:false,error:{code:'NOT_FOUND',message:'Not found'}});}
  if(req.method==='DELETE'&&itemId){const x=await remove(type,itemId);return x?json(res,200,{ok:true,data:x}):json(res,404,{ok:false,error:{code:'NOT_FOUND',message:'Not found'}});}
  return json(res,405,{ok:false,error:{code:'METHOD_NOT_ALLOWED'}});
}

async function analytics(name,u,res){
 if(name==='overview'){const t=active(collection('tasks')),g=active(collection('goals')),tx=active(collection('transactions'));return json(res,200,{ok:true,data:{tasks:{total:t.length,completed:t.filter(x=>x.status==='completed').length},projects:active(collection('projects')).length,goals:{total:g.length,completed:g.filter(x=>x.status==='completed').length},habits:active(collection('habits')).length,transactions:tx.length,history_events:db.history.length}});}
 if(name==='tasks'){const days=Number(u.searchParams.get('days')||30),labels=[],values=[];for(let i=days-1;i>=0;i--){const d=new Date(Date.now()-i*86400000).toISOString().slice(0,10);labels.push(d);values.push(db.collections.tasks.filter(x=>x.status==='completed'&&String(x.completed_at||'').slice(0,10)===d).length);}return json(res,200,{ok:true,data:{labels,datasets:[{name:'Completed',values}]}});}
 if(name==='finance'){const by={};for(const x of active(collection('transactions')).filter(x=>x.kind==='expense'))by[x.category]=(by[x.category]||0)+Number(x.amount_minor||0);return json(res,200,{ok:true,data:{categories:by,total_minor:Object.values(by).reduce((a,b)=>a+b,0)}});}
 if(name==='habits'){const out=active(collection('habits')).map(h=>{const dates=[...new Set(db.collections.habit_logs.filter(x=>x.habit_id===h.id&&x.completed).map(x=>x.log_date))].sort();let best=0,run=0;for(let i=0;i<dates.length;i++){if(i&&Date.parse(dates[i])-Date.parse(dates[i-1])===86400000)run++;else run=1;best=Math.max(best,run);}return{id:h.id,name:h.name,total_checks:dates.length,current_streak:run,best_streak:best};});return json(res,200,{ok:true,data:out});}
 if(name==='life-areas'){const tasks=active(collection('tasks'));return json(res,200,{ok:true,data:active(collection('life-areas')).map(a=>({id:a.id,name:a.name,total_tasks:tasks.filter(t=>t.life_area_id===a.id).length,completed:tasks.filter(t=>t.life_area_id===a.id&&t.status==='completed').length}))});}
 if(name==='heatmap'){const map={};for(const h of db.history){const d=h.created_at.slice(0,10);map[d]=(map[d]||0)+1;}return json(res,200,{ok:true,data:map});}
 if(name==='timeline')return json(res,200,{ok:true,data:db.history.slice(0,Number(u.searchParams.get('limit')||200))});
 return json(res,404,{ok:false,error:{code:'NOT_FOUND',message:'Analytics endpoint not found'}});
}

const server=http.createServer((req,res)=>handle(req,res).catch(e=>{console.error(e);json(res,e.status||500,{ok:false,error:{code:e.status===400?'BAD_REQUEST':'INTERNAL_ERROR',message:e.message||'Internal server error'}})}));
await load();server.listen(PORT,()=>console.log(`Life OS backend v${VERSION} listening on :${PORT} (storage=${storageMode})`));
process.on('SIGTERM',async()=>{await persist(true);if(pgPool)await pgPool.end();server.close(()=>process.exit(0));});
process.on('SIGINT',async()=>{await persist(true);if(pgPool)await pgPool.end();server.close(()=>process.exit(0));});
