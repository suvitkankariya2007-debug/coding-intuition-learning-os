import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {Miniflare} from 'miniflare';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-ignore Native local diagnostic, also exercised against the hosted runtime.
import {diagnoseLocal,inspectLearningClient} from '../local/doctor.mjs';

const base='http://127.0.0.1:8787',owner='owner-fixture';
let mf:Miniflare,directory:string,writesEnabled=false,loggedIn=true,searches=0,memoryDown=false;
const touched:string[]=[],documents:any[]=[];
function runtime(){return new Miniflare({modules:true,scriptPath:'dist-tunnel/tunnel.js',compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],durableObjects:{LEARNERS:{className:'LearnerStore',useSQLite:true}},durableObjectsPersist:directory,
  bindings:{PUBLIC_ORIGIN:base,OWNER_SUPERMEMORY_ID:owner,MEMORY_NAMESPACE:'leetcode_problems',MEMORY_READ_NAMESPACES:'leetcode_problems,leetcode',LOCAL_WRITE_ENABLED:String(writesEnabled),LEETCODE_USERNAME:'suvitk',CODEFORCES_HANDLE:'suvitkankariya2007'},
  serviceBindings:{LOCAL_CREDENTIALS:async()=>loggedIn?Response.json({userId:owner,namespace:'leetcode_problems',accessToken:'upstream-fixture',expiresAt:Date.now()+3600000}):new Response('Reconnect',{status:503})},
  outboundService:async(request:any)=>{
    expect(new URL(request.url).href).toBe('https://mcp.supermemory.ai/mcp');expect(request.headers.get('Authorization')).toBe('Bearer upstream-fixture');
    const msg=await request.json();if(msg.method==='notifications/initialized')return new Response(null,{status:202});
    if(msg.method==='initialize')return Response.json({jsonrpc:'2.0',id:msg.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'memory-fixture',version:'1'}}});
    const {name,arguments:args}=msg.params;let data:any;touched.push(args.namespace);
    expect(['leetcode_problems','leetcode']).toContain(args.namespace);
    if(name==='search_memory'){if(memoryDown)return new Response('Unavailable',{status:503});searches++;data={namespace:args.namespace,results:[{id:'context-'+args.namespace,text:args.namespace==='leetcode'?'Use gentle progressive hints from previous DSA sessions.':'Recent reasoning context.',similarity:0.9}]};}
    else if(name==='add_memory'){expect(args.namespace).toBe('leetcode_problems');documents.push(args.content);data={success:true,namespace:args.namespace,id:'saved-'+documents.length};}
    else throw Error('Unexpected tool');
    return Response.json({jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data}});
  }});}
async function request(path:string,init:RequestInit={}){return mf.dispatchFetch(base+path,init as any);}
async function rpc(name:string,args:Record<string,unknown>={}){const response=await request('/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});return {response,body:await response.json() as any};}
beforeAll(async()=>{directory=await mkdtemp(join(tmpdir(),'learning-tunnel-'));mf=runtime();await mf.ready;});
afterAll(async()=>{await mf?.dispose();await rm(directory,{recursive:true,force:true});});
describe('private local tunnel learning runtime',()=>{
  it('reports separate upstream authentication without claiming live verification',async()=>{const data=await (await request('/health')).json() as any;expect(data.downstreamOAuth).toBe(false);expect(data.writesEnabled).toBe(false);expect(data.liveChatGPTCallVerified).toBe(false);});
  it('rejects public hosts, cross-site browsers and management paths',async()=>{
    expect((await mf.dispatchFetch('https://public.example/mcp',{method:'POST'})).status).toBe(403);
    expect((await request('/mcp',{method:'POST',headers:{Origin:'https://attacker.example'}})).status).toBe(403);
    expect((await request('/callback')).status).toBe(404);
    expect((await request('/.well-known/oauth-authorization-server')).status).toBe(404);
  });
  it('fails closed when Supermemory is not linked',async()=>{loggedIn=false;expect((await rpc('get_roadmap')).response.status).toBe(503);loggedIn=true;});
  it('advertises tunnel authentication accurately and retains the canonical roadmap',async()=>{
    const r=await request('/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/list'})});
    const tools=(await r.json() as any).result.tools;expect(tools).toHaveLength(16);expect(tools.every((t:any)=>t.securitySchemes[0].type==='noauth')).toBe(true);
    expect(JSON.parse((await rpc('get_roadmap',{limit:1})).body.result.content[0].text).total).toBe(188);
  });
  it('searches both DSA spaces with provenance and bounded cached requests',async()=>{
    const first=await rpc('get_memory_patterns',{query:'previous hint preferences'});expect(first.body.result.isError).toBe(false);
    const data=JSON.parse(first.body.result.content[0].text);expect(data.items.map((x:any)=>x.namespace)).toEqual(['leetcode_problems','leetcode']);expect(searches).toBe(2);
    await rpc('get_memory_patterns',{query:'previous hint preferences'});expect(searches).toBe(2);expect(touched).not.toContain('sm_project_default');
  });
  it('keeps local recommendations available during a memory outage',async()=>{memoryDown=true;const r=await rpc('get_recommendations');expect(r.body.result.isError).toBe(false);const data=JSON.parse(r.body.result.content[0].text);expect(data.memoryContext.status).toBe('unavailable');expect(data.recommendations.length).toBeGreaterThan(0);memoryDown=false;});
  it('reports an upstream outage separately from a working local MCP connection',async()=>{
    memoryDown=true;
    try{
      const report=await diagnoseLocal({fetcher:(url:any,init:any)=>mf.dispatchFetch(String(url),init)});
      expect(report.status).toBe('PARTIAL');
      expect(report.checks.find((c:any)=>c.check==='learning_server_identity').status).toBe('PASS');
      expect(report.checks.find((c:any)=>c.check==='get_memory_patterns').status).toBe('FAIL');
      expect(report.checks.find((c:any)=>c.check==='get_recommendations').status).toBe('FAIL');
    }finally{memoryDown=false;}
  });
  it('initializes a real SDK client and validates all read tools without writing learning records',async()=>{
    const report=await diagnoseLocal({fetcher:(url:any,init:any)=>mf.dispatchFetch(String(url),init)});
    expect(report.status).toBe('PASS');expect(report.tools).toHaveLength(16);
    expect(report.checks.filter((c:any)=>c.status==='PASS')).toHaveLength(13);
    expect(report.learningWritesPerformed).toBe(false);expect(documents).toHaveLength(0);
    expect(JSON.stringify(report)).not.toContain('upstream-fixture');
    expect(JSON.stringify(report)).not.toContain('Recent reasoning context.');
  });
  it('does not mistake a mock tool inventory or a dead listener for a working learning MCP',async()=>{
    let called=false;
    const report=await inspectLearningClient({getServerVersion:()=>({name:'Mock_MCP_E2E'}),listTools:async()=>({tools:[{name:'get_status'}]}),callTool:async()=>{called=true;}});
    expect(report.status).toBe('FAIL');expect(called).toBe(false);
    const offline=await diagnoseLocal({fetcher:async()=>{throw Error('fixture unavailable');}});
    expect(offline.status).toBe('FAIL');expect(offline.stage).toBe('local_listener');
  });
  it('requires local write opt-in, then persists one event across process restart',async()=>{
    const event={clientEventId:'tunnel-event-0001',problemRef:'lc:98',kind:'mistake',summary:'I checked immediate children instead of inherited ancestor bounds.',conceptKeys:['dfs'],origin:'chatgpt'};
    expect((await rpc('record_reasoning_event',event)).body.result.isError).toBe(true);expect(documents).toHaveLength(0);
    await mf.dispose();writesEnabled=true;mf=runtime();await mf.ready;
    expect((await rpc('record_reasoning_event',event)).body.result.isError).toBe(false);expect(documents).toHaveLength(1);
    await mf.dispose();mf=runtime();await mf.ready;
    expect(JSON.parse((await rpc('get_learning_signals')).body.result.content[0].text).eventCount).toBe(1);
    await rpc('record_reasoning_event',event);expect(documents).toHaveLength(1);
  });
});
