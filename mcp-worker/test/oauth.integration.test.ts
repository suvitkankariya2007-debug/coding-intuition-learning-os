import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {Miniflare} from 'miniflare';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
// @ts-ignore Shared read-contract diagnostic for local and hosted entrypoints.
import {inspectLearningClient} from '../local/doctor.mjs';

const base='https://learning.example',redirect='https://chatgpt.com/connector_platform_oauth_redirect';
const verifier='v'.repeat(64),challenge=createHash('sha256').update(verifier).digest('base64url');
let mf:Miniflare,clientId:string,token:string,refreshToken:string;
let owner='owner-fixture',writes=0,searches=0,refreshes=0,failNextWrite=false;
const documents:any[]=[];
const cookies=(r:Response)=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
async function req(path:string,init:RequestInit={}){return mf.dispatchFetch(base+path,{...init,redirect:'manual'} as any);}
async function rpc(name:string,args:Record<string,unknown>={},bearer=token){const r=await req('/mcp',{method:'POST',headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-06-18'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});return {response:r,body:await r.json() as any};}
async function begin(scopes='learning:read learning:write offline_access'){
 const q=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',resource:base+'/mcp',scope:scopes,state:'downstream-state',code_challenge:challenge,code_challenge_method:'S256'});
 const consent=await req('/authorize?'+q);
 const html=await consent.text();const handle=html.match(/name="handle" value="([^"]+)"/)?.[1];
 expect(consent.status).toBe(200);expect(handle).toBeTruthy();
 return {handle:handle!,cookie:cookies(consent)};
}
async function authorize(scopes?:string){
 const start=await begin(scopes);
 const form=new URLSearchParams({handle:start.handle,decision:'approve'});
 for(const s of (scopes??'learning:read learning:write offline_access').split(' '))form.append('scope',s);
 const consent=await req('/authorize',{method:'POST',headers:{Cookie:start.cookie,'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
 expect(consent.status).toBe(302);
 const next=new URL(consent.headers.get('Location')!);
 const callback='/callback?'+new URLSearchParams({state:next.searchParams.get('state')!,code:'upstream-code',iss:'https://api.supermemory.ai/api/auth'});
 const done=await req(callback,{headers:{Cookie:cookies(consent)}});
 if(done.status!==302)console.error('Fixture callback:',await done.clone().text());
 return {done,callback,cookie:cookies(consent)};
}
async function exchange(code:string,pkce=verifier,resource=base+'/mcp'){
 return req('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code,redirect_uri:redirect,code_verifier:pkce,resource}).toString()});
}
beforeAll(async()=>{
 mf=new Miniflare({modules:true,scriptPath:'dist/index.js',compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],kvNamespaces:['OAUTH_KV'],durableObjects:{LEARNERS:{className:'LearnerStore',useSQLite:true}},bindings:{PUBLIC_ORIGIN:base,MEMORY_NAMESPACE:'leetcode_problems',OWNER_SUPERMEMORY_ID:'owner-fixture',SUPERMEMORY_CLIENT_ID:'upstream-fixture',LEETCODE_USERNAME:'suvitk',CODEFORCES_HANDLE:'suvitkankariya2007'},outboundService:async(request:any)=>{
   const url=new URL(request.url);
   if(url.pathname==='/api/auth/oauth2/token'){
    const p=new URLSearchParams(await request.text());if(p.get('grant_type')==='refresh_token')refreshes++;
    // Keep enough lifetime after the provider callback's safety buffer to satisfy
    // the OAuth provider's 60-second minimum token TTL under test-runner jitter.
    return Response.json({access_token:'upstream-access',token_type:'Bearer',expires_in:120,refresh_token:'upstream-refresh'});
   }
   if(url.href==='https://mcp.supermemory.ai/mcp'){
    if(request.headers.get('Authorization')!=='Bearer upstream-access')return new Response('Wrong upstream token',{status:401});
    const msg=await request.json();
    if(msg.method==='notifications/initialized')return new Response(null,{status:202});
    if(msg.method==='initialize')return Response.json({jsonrpc:'2.0',id:msg.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'supermemory-fixture',version:'1'}}});
    const name=msg.params?.name,args=msg.params?.arguments;
    let data:any;
    if(name==='who_am_i')data={userId:owner};
    else if(name==='list_spaces')data={spaces:[{namespace:'leetcode_problems'}]};
    else {
      if(args.namespace!=='leetcode_problems')throw Error('Cross-space request');
      if(name==='search_memory'){searches++;data={namespace:'leetcode_problems',results:[{id:'memory-1',text:'Start with gentle hints.',similarity:0.9}]};}
      else if(name==='add_memory'){writes++;const id='doc-'+writes;documents.push({id,content:args.content,updatedAt:new Date().toISOString()});if(failNextWrite){failNextWrite=false;return new Response('Response lost after storage',{status:503});}data={success:true,namespace:'leetcode_problems',id};}
      else if(name==='list_documents')data={documents:documents.slice((args.page-1)*3,args.page*3),pagination:{totalPages:Math.ceil(documents.length/3)}};
      else if(name==='get_document')data={namespace:'leetcode_problems',document:{...documents.find(x=>x.id===args.documentId),contentTruncated:false}};
      else throw Error('Unexpected upstream tool '+name);
    }
    return Response.json({jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data,isError:false}});
   }
   throw Error('Unexpected external call '+url.origin+url.pathname);
 }});
 await mf.ready;
 const registration=await req('/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'ChatGPT test client',redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']})});
 expect(registration.status).toBe(201);clientId=(await registration.json() as any).client_id;
},30000);
afterAll(async()=>{await mf?.dispose();});

describe('OAuth and authenticated MCP in the Workers runtime',()=>{
 it('publishes discovery and rejects anonymous learning access',async()=>{const m=await req('/.well-known/oauth-protected-resource/mcp');expect(m.status).toBe(200);expect((await m.json() as any).resource).toBe(base+'/mcp');const r=await req('/mcp',{method:'POST'});expect(r.status).toBe(401);expect(r.headers.get('WWW-Authenticate')).toContain('resource_metadata');});
 it('rejects an arbitrary redirect and missing PKCE',async()=>{const r=await req('/authorize?'+new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:'https://evil.example/callback'}));expect(r.status).toBe(400);expect(r.headers.get('Location')).toBeNull();});
 it('binds consent to the browser cookie',async()=>{const b=await begin();const r=await req('/authorize',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({handle:b.handle,decision:'approve',scope:'learning:read'}).toString()});expect(r.status).toBe(400);});
 it('rejects the wrong Supermemory account',async()=>{owner='another-owner';const a=await authorize();expect(a.done.status).toBe(403);owner='owner-fixture';});
 it('rejects a stolen code without the PKCE verifier',async()=>{const a=await authorize();expect(a.done.status).toBe(302);const u=new URL(a.done.headers.get('Location')!);const bad=await exchange(u.searchParams.get('code')!,'x'.repeat(64));expect(bad.status).toBe(400);});
 it('completes consent, upstream OAuth and downstream code exchange',async()=>{const a=await authorize();expect(a.done.status).toBe(302);const u=new URL(a.done.headers.get('Location')!);expect(u.searchParams.get('state')).toBe('downstream-state');expect(u.searchParams.get('iss')).toBe(base);const r=await exchange(u.searchParams.get('code')!);expect(r.status).toBe(200);const t=await r.json() as any;token=t.access_token;refreshToken=t.refresh_token;expect(token).toBeTruthy();expect(token).not.toBe('upstream-access');});
 it('rejects cross-origin requests and oversized bodies',async()=>{expect((await req('/mcp',{method:'POST',headers:{Origin:'https://evil.example',Authorization:`Bearer ${token}`}})).status).toBe(403);expect((await req('/mcp',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:'x'.repeat(33000)})).status).toBe(413);});
 it('lists tools with explicit write annotations',async()=>{const r=await req('/mcp',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});expect(r.status).toBe(200);const body=await r.json() as any;expect(body.result.tools).toHaveLength(37);expect(body.result.tools.find((x:any)=>x.name==='record_review').annotations.readOnlyHint).toBe(false);});
 it('returns the real canonical roadmap and targeted cached memory',async()=>{const roadmap=await rpc('get_roadmap',{limit:5});expect(JSON.parse(roadmap.body.result.content[0].text).total).toBe(188);const n=searches;await rpc('get_memory_patterns',{query:'hint preference'});const second=await rpc('get_memory_patterns',{query:'hint preference'});expect(JSON.parse(second.body.result.content[0].text).cache).toBe('hit');expect(searches-n).toBe(1);});
 it('passes the same initialized SDK read contract through hosted OAuth as the local tunnel',async()=>{
   const client=new Client({name:'hosted-contract-test',version:'1'});
   try{
     await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}},fetch:((url:any,init:any)=>mf.dispatchFetch(String(url),init)) as any}));
     const before=writes,report=await inspectLearningClient(client);
     expect(report.status).toBe('PASS');expect(report.tools).toHaveLength(37);expect(writes).toBe(before);
   }finally{await client.close();}
 });
 it('records one observation across concurrent retries',async()=>{const args={clientEventId:'observed-0001',problemRef:'lc:98',kind:'mistake',summary:'I compared immediate children instead of carrying inherited bounds.',conceptKeys:['dfs'],origin:'chatgpt'};const before=writes;const [a,b]=await Promise.all([rpc('record_reasoning_event',args),rpc('record_reasoning_event',args)]);expect(a.body.result.isError).toBe(false);expect(b.body.result.isError).toBe(false);expect(writes-before).toBe(1);const signal=await rpc('get_learning_signals');expect(JSON.parse(signal.body.result.content[0].text).eventCount).toBe(1);});
 it('uses the recorded weakness and memory context in recommendations',async()=>{const r=await rpc('get_recommendations');const data=JSON.parse(r.body.result.content[0].text);expect(data.memoryContext.items[0].content).toContain('gentle');expect(data.recommendations.some((x:any)=>x.reason.some((s:string)=>s.includes('weak technique')))).toBe(true);});
 it('saves a recall grade and refreshes memory cache without marking the problem accepted',async()=>{
   const query='review cache freshness';
   await rpc('get_memory_patterns',{query});
   await rpc('get_memory_patterns',{query});
   const searchesBeforeReview=searches;
   const r=await rpc('record_review',{itemId:'18800000-0000-5000-8000-000000000001',grade:2,clientEventId:'review-0001'});
   expect(r.body.result.isError).toBe(false);
   expect(JSON.parse(r.body.result.content[0].text).nextDue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
   const refreshed=await rpc('get_memory_patterns',{query});
   expect(JSON.parse(refreshed.body.result.content[0].text).cache).toBe('miss');
   expect(searches).toBe(searchesBeforeReview+1);
   const report=await rpc('get_progress_report');
   expect(JSON.parse(report.body.result.content[0].text).byStatus.solved).toBe(0);
 });
 it('reconciles memory without duplicating events or grades',async()=>{const r=await rpc('refresh_learning_memory',{});expect(r.body.result.isError).toBe(false);const signals=await rpc('get_learning_signals');expect(JSON.parse(signals.body.result.content[0].text).eventCount).toBe(1);});
 it('reconciles an ambiguous write before retrying without creating another memory',async()=>{
   const args={clientEventId:'ambiguous-0001',problemRef:'lc:98',kind:'mistake',summary:'I forgot to carry ancestor bounds when validating this subtree.',conceptKeys:['dfs'],origin:'chatgpt'};
   failNextWrite=true;const before=writes;
   expect(JSON.parse((await rpc('record_reasoning_event',args)).body.result.content[0].text).status).toBe('pending');
   const pending=await rpc('record_reasoning_event',args);
   expect(JSON.parse(pending.body.result.content[0].text).status).toBe('pending');
   expect(writes-before).toBe(1);
   expect((await rpc('refresh_learning_memory',{page:1})).body.result.isError).toBe(false);
   const recovered=await rpc('record_reasoning_event',args);
   expect(JSON.parse(recovered.body.result.content[0].text).status).toBe('stored');
   expect(writes-before).toBe(1);
   expect((await rpc('record_reasoning_event',{...args,summary:'A different observation with the same event identifier.'})).body.result.isError).toBe(true);
 });
 it('restores a duplicated review only once within the same memory page',async()=>{
   while(documents.length%3)documents.push({id:'padding-'+documents.length,content:'Unstructured context',updatedAt:new Date().toISOString()});
   const page=documents.length/3+1;
   const content=JSON.stringify({format:'coding-intuition-review-v1',clientEventId:'restored-review-0001',record:{itemId:'18800000-0000-5000-8000-000000000001',grade:4,reviewedAt:'2026-10-18T12:00:00Z'}});
   for(let i=0;i<2;i++)documents.push({id:'duplicated-review-'+i,content,updatedAt:new Date().toISOString()});
   const restored=await rpc('refresh_learning_memory',{page});
   expect(restored.body.result.isError).toBe(false);
   expect(JSON.parse(restored.body.result.content[0].text).restored).toBe(1);
   const repeated=await rpc('refresh_learning_memory',{page});
   expect(JSON.parse(repeated.body.result.content[0].text).restored).toBe(0);
 });
 it('refreshes upstream tokens and rotates downstream refresh tokens',async()=>{const before=refreshes;const r=await req('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:clientId,refresh_token:refreshToken,resource:base+'/mcp'}).toString()});expect(r.status).toBe(200);const next=await r.json() as any;expect(next.refresh_token).not.toBe(refreshToken);expect(refreshes).toBeGreaterThan(before);token=next.access_token;});
 it('reports hosted monitoring setup requirements instead of starting without a secret',async()=>{const r=await rpc('configure_background_monitor',{enabled:true});const data=JSON.parse(r.body.result.content[0].text);expect(data.enabled).toBe(false);expect(data.setupRequired).toContain('MONITOR_ENCRYPTION_KEY');});
 it('enforces read-only scope on writes',async()=>{const a=await authorize('learning:read');const u=new URL(a.done.headers.get('Location')!);const r=await exchange(u.searchParams.get('code')!);const read=(await r.json() as any).access_token;const call=await rpc('record_review',{itemId:'18800000-0000-5000-8000-000000000001',grade:5,clientEventId:'review-0002'},read);expect((await rpc('configure_background_monitor',{enabled:true},read)).body.result.isError).toBe(true);for(const name of ['save_learning_question','retry_learning_writes','update_learner_profile'])expect((await rpc(name,{},read)).body.result.isError).toBe(true);expect(call.body.result.isError).toBe(true);expect(call.body.result._meta['mcp/www_authenticate'][0]).toContain('insufficient_scope');});
 it('rejects authorization-code replay and revokes the compromised grant',async()=>{const a=await authorize();const code=new URL(a.done.headers.get('Location')!).searchParams.get('code')!;const first=await exchange(code);expect(first.status).toBe(200);const compromised=(await first.json() as any).access_token;expect((await exchange(code)).status).toBe(400);expect((await rpc('get_roadmap',{},compromised)).response.status).toBe(401);});
 it('supports a new conversation problem and its review through hosted OAuth',async()=>{
   const a=await authorize(),code=new URL(a.done.headers.get('Location')!).searchParams.get('code')!;
   const bearer=(await (await exchange(code)).json() as any).access_token;
   const event={clientEventId:'hosted-new-question-0001',problemRef:'manual:new-invariant-question',kind:'mistake',summary:'I need to understand why this loop invariant is preserved.',conceptKeys:['binary-search'],origin:'chatgpt'};
   expect((await rpc('record_reasoning_event',event,bearer)).body.result.isError).toBe(false);
   const catalog=JSON.parse((await rpc('get_learning_catalog',{offset:188,limit:50},bearer)).body.result.content[0].text);
   const external=catalog.items.find((p:any)=>p.problemRef===event.problemRef);expect(external).toBeDefined();
   expect((await rpc('record_review',{itemId:external.itemId,grade:2,clientEventId:'hosted-new-review-0001'},bearer)).body.result.isError).toBe(false);
   const history=JSON.parse((await rpc('get_problem_history',{itemId:external.itemId},bearer)).body.result.content[0].text);
   expect(history.learningEvents).toHaveLength(1);expect(history.reviews).toHaveLength(1);expect(history.problem.status).toBe('attempted');
 });

});
