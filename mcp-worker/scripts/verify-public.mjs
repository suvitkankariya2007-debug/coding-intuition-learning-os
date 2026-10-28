const base=process.argv[2];
if(!base||new URL(base).origin!==base||!base.startsWith('https://'))throw Error('Provide the deployed HTTPS origin');
async function get(path){const r=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(path+': HTTP '+r.status);return r.json();}
const health=await get('/health');if(!health.configured)throw Error('Deployment reports incomplete account configuration');
const resource=await get('/.well-known/oauth-protected-resource/mcp');
if(resource.resource!==base+'/mcp'||!resource.authorization_servers?.includes(base))throw Error('Incorrect resource metadata');
const auth=await get('/.well-known/oauth-authorization-server');
if(auth.issuer!==base||!auth.code_challenge_methods_supported?.includes('S256')||!auth.authorization_endpoint?.startsWith(base+'/')||!auth.token_endpoint?.startsWith(base+'/'))throw Error('OAuth discovery is incomplete');
const anonymous=await fetch(base+'/mcp',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});
if(anonymous.status!==401||!anonymous.headers.get('WWW-Authenticate')?.includes('resource_metadata'))throw Error('Anonymous requests were not correctly challenged');
console.log(JSON.stringify({deploymentReachable:true,configurationPresent:true,oauthDiscoveryVerified:true,anonymousAccessDenied:true,authenticatedChatGPTCallVerified:false},null,2));
