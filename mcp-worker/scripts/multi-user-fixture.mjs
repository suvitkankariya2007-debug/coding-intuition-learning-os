// Hosted OAuth fixture: two accounts can see the same organization spaces upstream.
// The learning Worker must nevertheless use only each account's server-derived space.
import {Miniflare} from 'miniflare';
import {createHash} from 'node:crypto';
export const fixtureNamespace=user=>'dsa_'+createHash('sha256').update(user).digest('hex').slice(0,40);
export function multiUserFixture(directory,state={documents:{},requests:[],spacesReady:true}){
 const base='https://multi.learning.example',redirect='https://chatgpt.com/connector_platform_oauth_redirect',verifier='x'.repeat(64);
 const mf=new Miniflare({modules:true,scriptPath:'dist/index.js',compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],kvNamespaces:['OAUTH_KV'],durableObjects:{LEARNERS:{className:'LearnerStore',useSQLite:true}},...(directory?{durableObjectsPersist:directory}:{}),bindings:{PUBLIC_ORIGIN:base,MULTI_USER_ENABLED:'true',OWNER_SUPERMEMORY_ID:'legacy-owner',MEMORY_NAMESPACE:'leetcode_problems',MEMORY_READ_NAMESPACES:'leetcode_problems,leetcode',SUPERMEMORY_CLIENT_ID:'fixture-app',MONITOR_ENCRYPTION_KEY:'a'.repeat(64),LEETCODE_USERNAME:'legacy-handle',CODEFORCES_HANDLE:'legacy-cf',GITHUB_SOLUTIONS_REPO:'legacy/solutions'},outboundService:async request=>{
  const url=new URL(request.url);
  if(url.pathname==='/api/auth/oauth2/token'){
   const p=new URLSearchParams(await request.text()),user=(p.get('code')??p.get('refresh_token')??'').replace(/^fixture-/,'');
   return Response.json({access_token:'access-'+user,refresh_token:'fixture-'+user,token_type:'Bearer',expires_in:3600});
  }
  if(url.hostname==='leetcode.com'){
   const body=await request.json();state.requests.push({host:url.hostname,username:body.variables?.username??null});
   if(body.query.includes('recentAcSubmissionList'))return Response.json({data:{matchedUser:{username:body.variables.username,submitStatsGlobal:{acSubmissionNum:[]}},recentAcSubmissionList:[{id:'101',titleSlug:'validate-binary-search-tree',timestamp:'1792800000'}]}});
   return Response.json({data:{q0:{questionFrontendId:'98',titleSlug:'validate-binary-search-tree',title:'Validate Binary Search Tree',topicTags:[{name:'Trees'}]}}});
  }
  if(url.hostname==='codeforces.com'){state.requests.push({host:url.hostname,handle:url.searchParams.get('handle')});return Response.json({status:'OK',result:[{id:202,creationTimeSeconds:1792800000,verdict:'WRONG_ANSWER',problem:{contestId:9999,index:'A',name:'Fixture binary search',tags:['binary search']}}]});}
  if(url.hostname!=='mcp.supermemory.ai')throw Error('Unexpected fixture request');
  const user=(request.headers.get('Authorization')??'').replace(/^Bearer access-/,''),msg=await request.json();
  if(msg.method==='notifications/initialized')return new Response(null,{status:202});
  if(msg.method==='initialize')return Response.json({jsonrpc:'2.0',id:msg.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'fixture-memory',version:'1'}}});
  const {name,arguments:args}=msg.params;let data;
  if(name==='who_am_i')data={userId:user};
  else if(name==='list_spaces')data={spaces:state.spacesReady?[{namespace:'leetcode_problems'},...['learner-a','learner-b'].map(u=>({namespace:fixtureNamespace(u)}))]:[{namespace:'leetcode_problems'}]};
  else{
   state.requests.push({host:url.hostname,user,tool:name,namespace:args.namespace});
   // Deliberately do not enforce tenant ownership here: the Worker must enforce it.
   const docs=state.documents[args.namespace]??=[];
   if(name==='search_memory')data={namespace:args.namespace,results:[{id:'memory-'+user,text:'Private preferences for '+args.namespace,similarity:0.9}]};
   else if(name==='add_memory'){const id='doc-'+args.namespace+'-'+docs.length;docs.push({id,content:args.content,updatedAt:new Date().toISOString(),contentTruncated:false});data={success:true,namespace:args.namespace,id};}
   else if(name==='list_documents'){const limit=args.limit??10;data={documents:docs.slice((args.page-1)*limit,args.page*limit).map(({content,...d})=>d),pagination:{totalPages:Math.ceil(docs.length/limit),totalItems:docs.length}};}
   else if(name==='get_document')data={namespace:args.namespace,document:docs.find(d=>d.id===args.documentId)};
   else throw Error('Unsupported fixture operation');
  }
  return Response.json({jsonrpc:'2.0',id:msg.id,result:{content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data}});
 }});
 let clientId;
 const req=(path,init={})=>mf.dispatchFetch(base+path,{...init,redirect:'manual'});
 const cookies=r=>r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
 const login=async(user,scope='learning:read learning:write offline_access')=>{
  if(!clientId){const r=await req('/oauth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'multi-user-fixture',redirect_uris:[redirect],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']})});if(r.status!==201)throw Error('Fixture client registration failed');clientId=(await r.json()).client_id;}
  const q=new URLSearchParams({client_id:clientId,redirect_uri:redirect,response_type:'code',resource:base+'/mcp',scope,state:'state-'+user,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
  const start=await req('/authorize?'+q),html=await start.text(),handle=html.match(/name="handle" value="([^"]+)"/)?.[1];if(!handle)throw Error('Fixture consent unavailable');
  const form=new URLSearchParams({handle,decision:'approve'});for(const s of scope.split(' '))form.append('scope',s);
  const approve=await req('/authorize',{method:'POST',headers:{Cookie:cookies(start),'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
  const upstream=new URL(approve.headers.get('Location')),done=await req('/callback?'+new URLSearchParams({state:upstream.searchParams.get('state'),code:'fixture-'+user,iss:'https://api.supermemory.ai/api/auth'}),{headers:{Cookie:cookies(approve)}});
  if(done.status!==302)return {status:done.status,body:await done.text()};
  const code=new URL(done.headers.get('Location')).searchParams.get('code');
  const token=await req('/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:clientId,code,redirect_uri:redirect,code_verifier:verifier,resource:base+'/mcp'}).toString()});
  if(token.status!==200)throw Error('Fixture code exchange failed');return {status:200,...await token.json()};
 };
 const rpc=async(token,name,args={})=>{
  const r=await req('/mcp',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});
  const result=await r.json();if(!r.ok||result.error||result.result?.isError)throw Error('Fixture MCP call failed: '+name);return result.result.structuredContent??JSON.parse(result.result.content[0].text);
 };
 return {mf,state,login,rpc,req};
}
