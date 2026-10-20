import { mkdir, readFile, writeFile, rename, lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

export const endpoints={issuer:'https://api.supermemory.ai/api/auth',authorize:'https://api.supermemory.ai/api/auth/oauth2/authorize',token:'https://api.supermemory.ai/api/auth/oauth2/token',register:'https://api.supermemory.ai/api/auth/oauth2/register',mcp:'https://mcp.supermemory.ai/mcp'};
export const redirectUri='http://127.0.0.1:8788/callback';
export const stateDirectory=()=>join(process.env.XDG_STATE_HOME||join(homedir(),'.local','state'),'coding-intuition-mcp');
export function validOwner(owner){if(typeof owner!=='string'||!/^[A-Za-z0-9_-]{5,150}$/.test(owner))throw Error('Supply the intended Supermemory owner ID, not an email or password.');return owner;}
export class CredentialFile {
  constructor(directory=stateDirectory()){this.directory=directory;this.path=join(directory,'supermemory.json');}
  async prepare(){
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const info=await lstat(this.directory);
    if(!info.isDirectory()||info.isSymbolicLink()||(info.mode&0o077))throw Error('Credential directory must be private with mode 0700.');
  }
  async load(){
    await this.prepare();
    try {
      const info=await lstat(this.path);
      if(!info.isFile()||info.isSymbolicLink()||(info.mode&0o077))throw Error('Credential file must be private with mode 0600.');
      return JSON.parse(await readFile(this.path,'utf8'));
    }catch(e){if(e.code==='ENOENT')return {};throw e;}
  }
  async save(data){
    await this.prepare();
    const temporary=this.path+'.'+randomBytes(8).toString('hex')+'.tmp';
    await writeFile(temporary,JSON.stringify(data)+'\n',{mode:0o600,flag:'wx'});
    await rename(temporary,this.path);
  }
}
export async function requestJson(url,init={},fetcher=fetch){
  let response;
  try{response=await fetcher(url,{...init,redirect:'manual',signal:AbortSignal.timeout(15000)});}
  catch{throw Object.assign(Error('Supermemory OAuth network request failed.'),{diagnosticCode:'SUPERMEMORY_NETWORK'});}
  if(!response.ok){const stage=url===endpoints.register?'REGISTER':'TOKEN';throw Object.assign(Error('Supermemory OAuth request rejected.'),{diagnosticCode:`SUPERMEMORY_${stage}_HTTP_${response.status}`});}
  return response.json();
}
export async function memoryIdentity(accessToken){
  const client=new Client({name:'coding-intuition-local-login',version:'0.1.0'});
  const transport=new StreamableHTTPClientTransport(new URL(endpoints.mcp),{requestInit:{headers:{Authorization:'Bearer '+accessToken}},fetch:(url,init)=>fetch(url,{...init,redirect:'manual',signal:AbortSignal.timeout(12000)})});
  let conversationId;
  try {
    await client.connect(transport);
    const call=async name=>{
      const result=await client.callTool({name,arguments:conversationId?{conversation_id:conversationId}:{}});
      let fallback;
      for(const block of result.content??[]){if(block.type!=='text')continue;try{const parsed=JSON.parse(block.text);if(parsed.conversation_id)conversationId=parsed.conversation_id;else fallback=parsed;}catch{}}
      if(result.isError)throw Error('Unable to verify Supermemory identity.');
      return result.structuredContent??fallback;
    };
    return {who:await call('who_am_i'),spaces:await call('list_spaces')};
  }catch{throw Error('Supermemory identity check failed.');}
  finally{await client.close().catch(()=>{});}
}
export function tokenProps(data,previous={}){
  if(typeof data.access_token!=='string'||data.access_token.length<1||String(data.token_type).toLowerCase()!=='bearer'||!Number.isFinite(data.expires_in)||data.expires_in<60)throw Error('Invalid Supermemory token response.');
  return {accessToken:data.access_token,refreshToken:typeof data.refresh_token==='string'?data.refresh_token:previous.refreshToken,expiresAt:Date.now()+data.expires_in*1000};
}
export class MemoryLogin {
  constructor(owner,{file=new CredentialFile(),fetcher=fetch,identity=memoryIdentity,now=()=>Date.now()}={}){
    this.owner=validOwner(owner);this.file=file;this.fetcher=fetcher;this.identity=identity;this.now=now;this.pending=null;
  }
  async begin(){
    const saved=await this.file.load();let clientId=saved.clientId;
    if(saved.owner&&saved.owner!==this.owner)throw Error('Saved credentials belong to a different owner. Use the intended owner.');
    if(!clientId){
      const data=await requestJson(endpoints.register,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Coding Intuition Local Learning',redirect_uris:[redirectUri],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:'openid profile email offline_access'})},this.fetcher);
      if(typeof data.client_id!=='string'||data.client_secret||data.token_endpoint_auth_method!=='none')throw Error('Provider did not issue a public PKCE registration.');
      clientId=data.client_id;await this.file.save({...saved,owner:this.owner,clientId});
    }
    const verifier=randomBytes(48).toString('base64url'),state=randomBytes(32).toString('base64url');
    this.pending={verifier,state,clientId,expires:this.now()+600000};
    const url=new URL(endpoints.authorize);
    url.search=new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,response_type:'code',scope:'openid profile email offline_access',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',resource:endpoints.mcp}).toString();
    return url.href;
  }
  async finish(url){
    const pending=this.pending,received=url.searchParams.get('state')??'';
    if(!pending||pending.expires<this.now()||received.length!==pending.state.length||!timingSafeEqual(Buffer.from(received),Buffer.from(pending.state)))throw Error('Invalid or expired login state. Start again.');
    this.pending=null;
    if(url.searchParams.has('error')||!url.searchParams.get('code'))throw Error('Supermemory authorization was cancelled or invalid.');
    if(url.searchParams.get('iss')!==endpoints.issuer)throw Error('Supermemory callback issuer is missing or unexpected.');
    const data=await requestJson(endpoints.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:pending.clientId,code:url.searchParams.get('code'),redirect_uri:redirectUri,code_verifier:pending.verifier,resource:endpoints.mcp})},this.fetcher);
    const tokens=tokenProps(data),identity=await this.identity(tokens.accessToken);
    if(identity.who?.userId!==this.owner)throw Error('Wrong Supermemory account. No tokens saved.');
    if(!identity.spaces?.spaces?.some(s=>s.namespace==='leetcode_problems'))throw Error('Missing leetcode_problems space. No tokens saved.');
    await this.file.save({owner:this.owner,clientId:pending.clientId,props:{...tokens,userId:this.owner,namespace:'leetcode_problems'}});
    return {ownerVerified:true,primarySpaceVerified:true};
  }
}
export class MemoryCredentials {
  constructor(owner,{file=new CredentialFile(),fetcher=fetch}={}){this.owner=validOwner(owner);this.file=file;this.fetcher=fetcher;this.tail=Promise.resolve();}
  getProps(){
    const operation=this.tail.then(async()=>{
      const saved=await this.file.load(),props=saved.props;
      if(saved.owner!==this.owner||props?.userId!==this.owner||props?.namespace!=='leetcode_problems'||!Number.isFinite(props?.expiresAt)||!props.accessToken)throw Error('Run npm run memory:login with the intended owner.');
      if(props.expiresAt>Date.now()+120000)return props;
      if(!props.refreshToken||!saved.clientId)throw Error('Supermemory sign-in required.');
      const data=await requestJson(endpoints.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:saved.clientId,refresh_token:props.refreshToken,resource:endpoints.mcp})},this.fetcher);
      const next={...props,...tokenProps(data,props)};
      await this.file.save({...saved,props:next});return next;
    });
    this.tail=operation.catch(()=>{});return operation;
  }
}
