// Real local Durable Object alarms; isolated provider responses; no user's account data.
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {fixtureRuntime} from './demo-fixture.mjs';
import {verifyLiveClient} from '../local/verify-live.mjs';
const directory=await mkdtemp(join(tmpdir(),'background-simulation-'));
let f=fixtureRuntime(directory),client;
const stages=[];
async function connect(){await f.mf.ready;client=new Client({name:'background-simulation',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp'),{fetch:(url,init)=>f.mf.dispatchFetch(String(url),init)}));}
async function tick(){
  const before=await f.rpc('get_monitor_status'),index=before.taskIndex,task=['leetcode','codeforces','github','memory'][index],previous=before.tasks[task]?.checkedAt;
  // Accelerate only this fixture's next wake-up. The production interval stays 30 minutes.
  await f.rpc('configure_background_monitor',{enabled:true,intervalMinutes:30});
  const deadline=Date.now()+12000;
  while(Date.now()<deadline){const current=await f.rpc('get_monitor_status');if(current.tasks[task]?.checkedAt&&current.tasks[task].checkedAt!==previous)return current;await new Promise(r=>setTimeout(r,150));}
  throw Error('Alarm did not finish');
}
function requireResult(condition,message){if(!condition)throw Error(message);}
try{
  await connect();
  for(let i=0;i<4;i++)await tick();
  const partial=await verifyLiveClient(client);requireResult(partial.status==='PARTIAL','Provider truncation was not detected');stages.push({check:'provider_truncation_detected',status:'PASS',observedStatus:partial.status,tasks:partial.monitor.tasks});
  f.state.documents[1].contentTruncated=false;f.state.documents[1].updatedAt='2026-10-23T01:00:00Z';f.state.documents[1].content+=' Here is the complete simulated saved discussion.';
  for(let i=0;i<4;i++)await tick();
  const recovered=await verifyLiveClient(client);requireResult(recovered.status==='PASS','Complete provider content did not recover');stages.push({check:'complete_content_recovery',status:'PASS',observedStatus:recovered.status,tasks:recovered.monitor.tasks});
  f.state.offlineHosts=['leetcode.com'];const failed=await tick();requireResult(failed.tasks.leetcode.status==='failed_reconnect_or_retry','Outage was hidden');requireResult(failed.nextRunAt-Date.now()>60000,'Failure backoff missing');
  const outage=await verifyLiveClient(client);requireResult(outage.status==='PARTIAL','Failed source passed live verification');stages.push({check:'source_outage_and_backoff',status:'PASS',observedStatus:outage.status,task:failed.tasks.leetcode});
  f.state.offlineHosts=[];for(let i=0;i<4;i++)await tick();
  requireResult((await verifyLiveClient(client)).status==='PASS','Source did not recover');stages.push({check:'source_recovery',status:'PASS'});
  const beforeRestart=await f.rpc('get_monitor_status'),resumedTask=['leetcode','codeforces','github','memory'][beforeRestart.taskIndex],oldChecked=beforeRestart.tasks[resumedTask]?.checkedAt;
  await f.rpc('configure_background_monitor',{enabled:true});
  await client.close();await f.mf.dispose();f=fixtureRuntime(directory);await connect();
  const restartDeadline=Date.now()+12000;let restarted;
  do{restarted=await f.rpc('get_monitor_status');if(restarted.tasks[resumedTask]?.checkedAt!==oldChecked)break;await new Promise(r=>setTimeout(r,150));}while(Date.now()<restartDeadline);
  requireResult(restarted.enabled&&Object.keys(restarted.tasks).length===4&&restarted.tasks[resumedTask]?.checkedAt!==oldChecked,'Persisted alarm did not resume after restart');stages.push({check:'restart_persistence_and_alarm_resume',status:'PASS'});
  const stopped=await f.rpc('configure_background_monitor',{enabled:false});requireResult(stopped.enabled===false&&stopped.nextRunAt===null,'Stop did not clear schedule');stages.push({check:'stop_control',status:'PASS'});
  const report={status:'PASS',mode:'simulated_providers_real_local_alarms',timing:'fixture wake-ups accelerated; production interval unchanged',productionIntervalMinutes:30,liveChatGPTGoVerified:false,realUserRecordsWritten:false,deployed:false,stages};
  await mkdir('demo',{recursive:true});await writeFile('demo/background-simulation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch{console.error(JSON.stringify({status:'FAIL',mode:'isolated_background_simulation',completedStages:stages.map(s=>s.check),liveChatGPTGoVerified:false}));process.exitCode=1;}
finally{await client?.close().catch(()=>{});await f.mf.dispose();await rm(directory,{recursive:true,force:true});}
