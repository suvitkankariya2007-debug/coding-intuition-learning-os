import { readFile, writeFile } from 'node:fs/promises';
// Run only after a Workers hostname and KV namespace exist. Public OAuth registration, no API key.
const [base, owner, kvId] = process.argv.slice(2);
if(!base||!owner||!kvId)throw Error('Usage: node scripts/prepare-deployment.mjs HTTPS_ORIGIN OWNER_SUPERMEMORY_ID OAUTH_KV_ID');
const url=new URL(base);
if(url.protocol!=='https:'||url.origin!==base||url.username||url.password)throw Error('Use the exact HTTPS origin, without a trailing slash');
if(!/^[A-Za-z0-9_-]{5,150}$/.test(owner)||!/^[a-f0-9]{32}$/.test(kvId))throw Error('Invalid owner or KV namespace ID');
const config=JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
let clientId;
try{
 const previous=JSON.parse(await readFile(new URL('../wrangler.local.jsonc',import.meta.url),'utf8'));
 if(previous.vars?.PUBLIC_ORIGIN===base&&previous.vars?.OWNER_SUPERMEMORY_ID===owner)clientId=previous.vars.SUPERMEMORY_CLIENT_ID;
}catch{}
if(!clientId){
 const response=await fetch('https://api.supermemory.ai/api/auth/oauth2/register',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json'},body:JSON.stringify({client_name:'Coding Intuition Learning',redirect_uris:[base+'/callback'],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:'openid profile email offline_access'})});
 if(!response.ok)throw Error('Supermemory client registration failed: HTTP '+response.status);
 const registered=await response.json();
 if(typeof registered.client_id!=='string'||registered.client_secret||registered.token_endpoint_auth_method!=='none')throw Error('Unexpected Supermemory client registration; no credentials saved');
 clientId=registered.client_id;
}
config.vars={...config.vars,PUBLIC_ORIGIN:base,OWNER_SUPERMEMORY_ID:owner,SUPERMEMORY_CLIENT_ID:clientId};
config.kv_namespaces=[{binding:'OAUTH_KV',id:kvId}];
await writeFile(new URL('../wrangler.local.jsonc',import.meta.url),JSON.stringify(config,null,2)+'\n',{mode:0o600});
console.log('Deployment configuration prepared. No deployment was made. Use npm run deploy -- --config wrangler.local.jsonc');
