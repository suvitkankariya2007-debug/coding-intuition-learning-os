import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {Miniflare} from 'miniflare';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-ignore Native local diagnostic, also exercised against the hosted runtime.
import {diagnoseLocal,inspectLearningClient} from '../local/doctor.mjs';

const base='http://127.0.0.1:8787',owner='owner-fixture';
const commit='a'.repeat(40),treeSha='b'.repeat(40),blobSha='c'.repeat(40);
let mf:Miniflare,directory:string,writesEnabled=false,loggedIn=true,searches=0,memoryDown=false;
const touched:string[]=[],documents:any[]=[];
function runtime(){return new Miniflare({modules:true,scriptPath:'dist-tunnel/tunnel.js',compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],durableObjects:{LEARNERS:{className:'LearnerStore',useSQLite:true}},durableObjectsPersist:directory,
  bindings:{PUBLIC_ORIGIN:base,OWNER_SUPERMEMORY_ID:owner,MEMORY_NAMESPACE:'leetcode_problems',MEMORY_READ_NAMESPACES:'leetcode_problems,leetcode',LOCAL_WRITE_ENABLED:String(writesEnabled),LEETCODE_USERNAME:'suvitk',CODEFORCES_HANDLE:'suvitkankariya2007',GITHUB_SOLUTIONS_REPO:'owner/solutions'},
  serviceBindings:{LOCAL_CREDENTIALS:async()=>loggedIn?Response.json({userId:owner,namespace:'leetcode_problems',accessToken:'upstream-fixture',expiresAt:Date.now()+3600000}):new Response('Reconnect',{status:503})},
  outboundService:async(request:any)=>{
    const url=new URL(request.url);
    if(url.hostname==='api.github.com'){
      if(url.pathname==='/repos/owner/solutions')return Response.json({default_branch:'main'});
      if(url.pathname.endsWith('/commits/main'))return Response.json({sha:commit,commit:{tree:{sha:treeSha}}});
      if(url.pathname.includes('/git/trees/'))return Response.json({sha:treeSha,truncated:false,tree:[{type:'blob',path:'9000-new-boundary-problem/solution.cpp',sha:blobSha}]});
      if(url.pathname.includes('/git/blobs/'))return Response.json({encoding:'base64',size:26,content:btoa('int boundary = left + 1;')});
      throw Error('Unexpected GitHub request');
    }
    if(url.hostname==='leetcode.com'){
      const body=await request.json();
      return Response.json(body.query.includes('recentAcSubmissionList')?{data:{matchedUser:{submitStatsGlobal:{acSubmissionNum:[]}},recentAcSubmissionList:[{id:'90001',titleSlug:'new-leetcode-question',timestamp:'1790000000'}]}}:{data:{q0:{questionFrontendId:'999999',titleSlug:'new-leetcode-question',title:'New LeetCode question',topicTags:[{name:'Binary Search'}]}}});
    }
    if(url.hostname==='codeforces.com')return Response.json({status:'OK',result:[{id:90002,creationTimeSeconds:1790000001,verdict:'WRONG_ANSWER',problem:{contestId:9999,index:'A',name:'New CF binary search',tags:['binary search']}}]});
    expect(url.href).toBe('https://mcp.supermemory.ai/mcp');expect(request.headers.get('Authorization')).toBe('Bearer upstream-fixture');
    const msg=await request.json();if(msg.method==='notifications/initialized')return new Response(null,{status:202});
    if(msg.method==='initialize')return Response.json({jsonrpc:'2.0',id:msg.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'memory-fixture',version:'1'}}});
    const {name,arguments:args}=msg.params;let data:any;touched.push(args.namespace);
    expect(['leetcode_problems','leetcode']).toContain(args.namespace);
    if(name==='search_memory'){if(memoryDown)return new Response('Unavailable',{status:503});searches++;data={namespace:args.namespace,results:[{id:'context-'+args.namespace,text:args.namespace==='leetcode'?'Use gentle progressive hints from previous DSA sessions.':'Recent reasoning context.',similarity:0.9}]};}
    else if(name==='add_memory'){expect(args.namespace).toBe('leetcode_problems');documents.push(args.content);data={success:true,namespace:args.namespace,id:'saved-'+documents.length};}
    else if(name==='list_documents')data={documents:documents.slice((args.page-1)*3,args.page*3).map((content,i)=>({id:'saved-'+((args.page-1)*3+i+1),updatedAt:'2026-10-20T00:00:00Z'})),pagination:{totalPages:Math.ceil(documents.length/3)}};
    else if(name==='get_document')data={namespace:args.namespace,document:{id:args.documentId,content:documents[Number(args.documentId.split('-')[1])-1],contentTruncated:false}};
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
    const tools=(await r.json() as any).result.tools;expect(tools).toHaveLength(38);expect(tools.every((t:any)=>t.securitySchemes[0].type==='noauth')).toBe(true);expect(tools.find((t:any)=>t.name==='import_problem_catalog').annotations.readOnlyHint).toBe(false);
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
    expect(report.status).toBe('PASS');expect(report.tools).toHaveLength(38);
    expect(report.checks.filter((c:any)=>c.status==='PASS')).toHaveLength(23);
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
    for(const name of ['save_learning_question','retry_learning_writes','update_learner_profile','import_problem_catalog'])expect((await rpc(name,{})).body.result.isError).toBe(true);
    expect((await rpc('configure_background_monitor',{enabled:true})).body.result.isError).toBe(true);
    expect((await rpc('record_reasoning_event',event)).body.result.isError).toBe(true);expect(documents).toHaveLength(0);
    await mf.dispose();writesEnabled=true;mf=runtime();await mf.ready;
    const catalogInput={catalogId:'interview-set',catalogName:'Interview Set',items:[
      {externalId:'capacity-1',title:'Capacity threshold exercise',topic:'Search on answer',conceptKeys:['binary-search-answer'],idea:'Find the minimum feasible capacity.'},
      {externalId:'capacity-2',title:'Schedule feasibility exercise',topic:'Scheduling',conceptKeys:['binary-search-answer'],idea:'Search a monotonic feasibility condition.'}
    ]};
    const imported=(await rpc('import_problem_catalog',catalogInput)).body.result.content[0].text;
    expect(JSON.parse(imported).importedCount).toBe(2);
    const read=async(name:string,args:any={})=>JSON.parse((await rpc(name,args)).body.result.content[0].text);
    const catalog=await read('get_learning_catalog',{offset:188,limit:50});
    expect(catalog.catalogs).toContainEqual({catalogId:'interview-set',catalogName:'Interview Set',problemCount:2});
    const importedItems=catalog.items.filter((p:any)=>p.catalogId==='interview-set');
    expect(importedItems).toHaveLength(2);
    const [source,target]=importedItems;
    expect(source.conceptKeys).toContain('binary-search-answer');
    const scoped=await read('get_recommendations',{catalogId:'interview-set'});
    expect(scoped.catalogScope.catalogId).toBe('interview-set');
    expect(scoped.recommendations.map((p:any)=>p.itemId).sort()).toEqual(importedItems.map((p:any)=>p.itemId).sort());
    expect((await rpc('get_recommendations',{catalogId:'missing-set'})).body.result.isError).toBe(true);
    const connections=await read('get_concept_connections',{itemId:source.itemId});
    expect(connections.connections.some((c:any)=>c.candidate.itemId===target.itemId&&c.sourceConcept==='binary-search-answer'),JSON.stringify(connections.connections)).toBe(true);
    const customEvent={clientEventId:'custom-catalog-event-0001',itemId:source.itemId,kind:'mistake',summary:'I could not prove the feasibility condition is monotonic.',conceptKeys:['binary-search-answer'],origin:'chatgpt'};
    expect((await rpc('record_reasoning_event',customEvent)).body.result.isError).toBe(false);
    expect((await read('get_problem_history',{itemId:source.itemId})).learningEvents[0].problemRef).toBe(source.problemRef);
    expect((await read('get_recommendations',{catalogId:'interview-set'})).recommendations.some((p:any)=>p.itemId===target.itemId&&p.components.some((c:any)=>c.factor==='active_weak_concepts'))).toBe(true);
    const updated=await read('import_problem_catalog',{...catalogInput,catalogName:'Interview Set Revised',items:[{...catalogInput.items[0],title:'Capacity threshold exercise revised'}]});
    expect(updated.importedCount).toBe(0);expect(updated.updatedCount).toBe(1);expect(updated.items[0].itemId).toBe(source.itemId);
    const afterUpdate=await read('get_learning_catalog',{offset:188,limit:50});
    expect(afterUpdate.items.find((p:any)=>p.itemId===source.itemId).title).toBe('Capacity threshold exercise revised');
    expect(afterUpdate.items.some((p:any)=>p.itemId===target.itemId)).toBe(true);
    expect(afterUpdate.items.filter((p:any)=>p.catalogId==='interview-set').every((p:any)=>p.catalogName==='Interview Set Revised')).toBe(true);
    expect((await rpc('record_review',{itemId:source.itemId,grade:2,clientEventId:'custom-catalog-review-0001'})).body.result.isError).toBe(false);
    expect((await read('get_problem_history',{itemId:source.itemId})).reviews).toHaveLength(1);
    const beforeLegacyWrite=documents.length;
    expect((await rpc('record_reasoning_event',event)).body.result.isError).toBe(false);expect(documents).toHaveLength(beforeLegacyWrite+1);
    await mf.dispose();mf=runtime();await mf.ready;
    expect(JSON.parse((await rpc('get_learning_signals')).body.result.content[0].text).eventCount).toBe(2);
    const recoveredCatalog=JSON.parse((await rpc('get_learning_catalog',{offset:188,limit:50})).body.result.content[0].text);
    expect(recoveredCatalog.items.some((p:any)=>p.itemId===source.itemId&&p.title==='Capacity threshold exercise revised')).toBe(true);
    expect(JSON.parse((await rpc('get_problem_history',{itemId:source.itemId})).body.result.content[0].text).reviews).toHaveLength(1);
    await rpc('record_reasoning_event',event);expect(documents).toHaveLength(beforeLegacyWrite+1);
  });
  it('imports new GitHub, LC and CF problems and reads actual pinned code without claiming acceptance',async()=>{
    const read=async(name:string,args:any={})=>JSON.parse((await rpc(name,args)).body.result.content[0].text);
    expect((await read('get_learning_signals')).eventCount).toBe(2);
    for(const source of ['github','leetcode','codeforces'])expect((await rpc('sync_learning_source',{source,force:true})).body.result.isError).toBe(false);
    expect((await read('get_learning_signals')).eventCount).toBe(2);
    const catalog=await read('get_learning_catalog',{offset:188,limit:50});
    expect(catalog.total).toBe(193);expect(catalog.externalCount).toBe(5);
    expect((await read('get_roadmap',{limit:1})).total).toBe(188);
    const github=catalog.items.find((p:any)=>p.origin==='github'),lc=catalog.items.find((p:any)=>p.problemRef==='lc:999999'),cf=catalog.items.find((p:any)=>p.problemRef==='cf:9999A');
    expect(github.status).toBe('not_started');expect(lc.status).toBe('solved');expect(cf.status).toBe('attempted');
    const code=await read('get_problem_code',{itemId:github.itemId});
    expect(code.content).toContain('boundary');expect(code.commit).toBe(commit);expect(code.commit).not.toBe(treeSha);expect(code.acceptanceVerified).toBe(false);
    const recommendations=await read('get_recommendations');expect(recommendations.trackedProblemCount).toBe(193);
    expect(recommendations.personalization.status,JSON.stringify({status:recommendations.personalization.status,eventCount:recommendations.personalization.eventCount,reviewCount:recommendations.personalization.reviewCount})).toBe('learner_records_available');expect(recommendations.recommendations.some((r:any)=>r.itemId===cf.itemId)).toBe(false);
    for(const source of ['github','leetcode','codeforces'])await rpc('sync_learning_source',{source,force:true});
    expect((await read('get_learning_catalog')).total).toBe(193);
  });
  it('refreshes newly added external memories before cache expiry when requested',async()=>{
    const args={query:'fresh external learning note'};
    await rpc('get_memory_patterns',args);const before=searches;
    await rpc('get_memory_patterns',args);expect(searches).toBe(before);
    await rpc('get_memory_patterns',{...args,refresh:true});expect(searches).toBe(before+2);
  });
  it('records doubts and recall for new problems and restores them into a fresh hosted-style ledger',async()=>{
    const read=async(name:string,args:any={})=>JSON.parse((await rpc(name,args)).body.result.content[0].text);
    const external=(await read('get_learning_catalog',{offset:188,limit:50})).items.find((p:any)=>p.problemRef==='lc:999999');
    expect(external).toBeTruthy();
    const event={clientEventId:'external-question-0001',itemId:external.itemId,kind:'mistake',summary:'I need help deriving the binary search boundary invariant.',conceptKeys:['binary-search'],origin:'chatgpt'};
    const before=documents.length;
    expect((await rpc('record_reasoning_event',event)).body.result.isError).toBe(false);
    await rpc('record_reasoning_event',event);expect(documents.length).toBe(before+1);
    expect((await read('get_problem_history',{itemId:external.itemId})).learningEvents[0].summary).toContain('boundary');
    expect((await rpc('record_review',{itemId:external.itemId,grade:2,clientEventId:'external-review-0001'})).body.result.isError).toBe(false);
    const oldDirectory=directory;
    await mf.dispose();directory=await mkdtemp(join(tmpdir(),'learning-recovery-'));mf=runtime();await mf.ready;
    try{
      let page=1,next:any;do{next=await read('refresh_learning_memory',{page});page=next.nextPage;}while(page);
      const catalog=await read('get_learning_catalog',{offset:188,limit:50});
      expect(catalog.items.some((p:any)=>p.itemId===external.itemId)).toBe(true);
      const history=await read('get_problem_history',{itemId:external.itemId});expect(history.reviews).toHaveLength(1);expect(history.learningEvents).toHaveLength(1);
      expect((await read('get_learning_signals')).weakConcepts.some((c:any)=>c.concept==='binary-search')).toBe(true);
    }finally{await mf.dispose();await rm(directory,{recursive:true,force:true});directory=oldDirectory;mf=runtime();await mf.ready;}
  });
  it('imports a full 50-row catalog batch within the bounded MCP request and keeps it private',async()=>{
    const before=documents.length;
    const rows=Array.from({length:50},(_,i)=>({externalId:`batch-${String(i+1).padStart(3,'0')}`,title:`Practice problem ${i+1} `+'T'.repeat(180),topic:'Imported exercises '+String(i%5),conceptKeys:['binary-search-answer'],idea:'I'.repeat(500),url:'https://example.com/problems/'+String(i+1)+'?reference='+('u'.repeat(400))}));
    const payloadSize=JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'import_problem_catalog',arguments:{catalogId:'batch-catalog',catalogName:'Large but bounded learner catalog',items:rows}}}).length;
    expect(payloadSize).toBeGreaterThan(32768);expect(payloadSize).toBeLessThan(131072);
    const result=(await rpc('import_problem_catalog',{catalogId:'batch-catalog',catalogName:'Large but bounded learner catalog',items:rows}));
    expect(result.body.result.isError).toBe(false);
    const receipt=JSON.parse(result.body.result.content[0].text);
    expect(receipt.importedCount).toBe(50);expect(receipt.writePerformed).toBe(true);expect(receipt.upstreamMemoryWritePerformed).toBe(false);
    expect(documents).toHaveLength(before);
    const catalog=JSON.parse((await rpc('get_learning_catalog',{offset:0,limit:1})).body.result.content[0].text);
    expect(catalog.catalogs.find((c:any)=>c.catalogId==='batch-catalog').problemCount).toBe(50);
  });

});
