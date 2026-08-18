import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const port=19111;const file=path.join(os.tmpdir(),`life-os-smoke-${Date.now()}.json`);
const child=spawn(process.execPath,['src/server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),DATA_FILE:file,API_KEY:''},stdio:['ignore','pipe','pipe']});
let logs='';child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let up=false;for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/v1/health`);if(r.ok){up=true;break}}catch{}await sleep(100);}assert.equal(up,true,logs);
 const api=async(path,opts={})=>{const r=await fetch(`http://127.0.0.1:${port}${path}`,{...opts,headers:{'content-type':'application/json',...(opts.headers||{})}});const j=await r.json();assert.equal(r.ok,true,`${path}: ${JSON.stringify(j)}`);return j;};
 const task=(await api('/api/v1/tasks',{method:'POST',body:JSON.stringify({title:'Smoke task',priority:'high',due_date:new Date().toISOString().slice(0,10)})})).data;
 assert.ok(task.id);
 const done=(await api(`/api/v1/tasks/${task.id}/complete`,{method:'POST',body:'{}'})).data;assert.equal(done.status,'completed');
 const hist=(await api(`/api/v1/history/tasks/${task.id}`)).data;assert.ok(hist.some(x=>x.action==='created'));assert.ok(hist.some(x=>x.action==='completed'));
 const habit=(await api('/api/v1/habits',{method:'POST',body:JSON.stringify({name:'Smoke Habit',frequency:'daily'})})).data;
 await api(`/api/v1/habits/${habit.id}/check`,{method:'POST',body:JSON.stringify({date:new Date().toISOString().slice(0,10)})});
 const ha=(await api('/api/v1/analytics/habits')).data.find(x=>x.id===habit.id);assert.equal(ha.current_streak,1);
 await api('/api/v1/finance/transactions',{method:'POST',body:JSON.stringify({kind:'expense',amount_minor:42000,currency:'KES',category:'food',transaction_date:new Date().toISOString().slice(0,10)})});
 const finance=(await api('/api/v1/finance/today')).data;assert.equal(finance.expenses_minor,42000);
 const overview=(await api('/api/v1/analytics/overview')).data;assert.equal(overview.tasks.completed,1);
 const search=(await api('/api/v1/search?q=Smoke')).data;assert.ok(search.length>=2);
 const exp=(await api('/api/v1/export')).data;assert.ok(exp.collections.tasks.length>=1);assert.ok(exp.history.length>=1);
 console.log('SMOKE TESTS PASSED');
}finally{child.kill('SIGTERM');await sleep(150);await fs.rm(file,{force:true});}
