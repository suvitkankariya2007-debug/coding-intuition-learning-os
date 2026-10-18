import { AuthorizationError, CimdFetchError, OAuthError, authorizationErrorRedirect, type ConsentDescription } from '@cloudflare/workers-oauth-provider';
import { type Env, type AuthProps, UPSTREAM, origin, escapeHtml, sha256, fetchTimed, assertOwner } from './config';
import { withMemory } from './upstream';

export function page(title: string, body: string) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{background:#0c1420;color:#eaf0fa;font:17px/1.6 system-ui;margin:0;padding:6vh 6vw}main{max-width:640px;margin:auto;background:#142236;border:1px solid #2b405b;border-radius:20px;padding:32px}h1{line-height:1.2}small{color:#b0c4da}button,a.button{display:inline-block;background:#a8e6cf;color:#10251e;border:0;padding:12px 20px;border-radius:10px;font:inherit;text-decoration:none;margin:8px 8px 0 0}button[value=deny]{background:#30435b;color:white}code{overflow-wrap:anywhere}label{display:block;margin:12px 0}a{color:#b6e6ff}</style><main><small>CODING INTUITION · PRIVATE LEARNING</small><h1>${escapeHtml(title)}</h1>${body}</main></html>`;
}
export function consentPage(d: ConsentDescription, handle: string, namespace: string) {
  const labels: Record<string,string> = {'learning:read':'Read learning memories and practice recommendations','learning:write':'Save brief learning observations you approve','offline_access':'Keep this connection available between sessions'};
  return page('Connect your learning memory', `<p><strong>${escapeHtml(d.clientName)}</strong> requests access to <code>${escapeHtml(namespace)}</code>.</p><p>Return destination: <strong>${escapeHtml(d.redirectHost)}</strong>.</p><p>${d.clientDomain ? `Client metadata published by ${escapeHtml(d.clientDomain)}.` : 'The client name is self-declared.'}</p>${d.redirectIsLoopback?'<p>This sends access to an application on your computer.</p>':''}<p>Next, sign in on Supermemory. Your password stays with Supermemory. Memory content is treated as learning context, never as proof that you solved a problem.</p><form method="post" action="/authorize"><input type="hidden" name="handle" value="${escapeHtml(handle)}">${d.scope.map(s=>`<label><input type="checkbox" name="scope" value="${escapeHtml(s)}" checked> ${escapeHtml(labels[s]??s)}</label>`).join('')}<button name="decision" value="approve">Continue to Supermemory</button><button name="decision" value="deny">Cancel</button></form>`);
}
export async function exchangeUpstream(env: Env, params: Record<string,string>): Promise<Omit<AuthProps,'userId'|'namespace'>> {
  let response: Response;
  try { response = await fetchTimed(UPSTREAM.token, { method: 'POST', headers: {'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ client_id: env.SUPERMEMORY_CLIENT_ID, ...params }) }); }
  catch { throw new OAuthError('temporarily_unavailable', { description: 'Supermemory is temporarily unreachable', statusCode: 503 }); }
  const data = await response.json() as Record<string,unknown>;
  if (!response.ok) {
    const terminal = data.error === 'invalid_grant';
    throw new OAuthError(terminal?'invalid_grant':'temporarily_unavailable', { description: terminal?'Please reconnect your Supermemory account':'Supermemory could not complete authentication', statusCode:terminal?400:503 });
  }
  if (typeof data.access_token !== 'string' || String(data.token_type).toLowerCase() !== 'bearer' || !Number.isFinite(data.expires_in) || Number(data.expires_in)<60) throw new OAuthError('temporarily_unavailable',{description:'Unexpected Supermemory token response',statusCode:503});
  return { accessToken:data.access_token, refreshToken:typeof data.refresh_token==='string'?data.refresh_token:undefined, expiresAt:Date.now()+Number(data.expires_in)*1000 };
}
export async function refreshProps(env: Env, props: AuthProps) {
  assertOwner(env, props);
  if (props.expiresAt > Date.now()+120000) return props;
  if (!props.refreshToken) throw new OAuthError('invalid_grant',{description:'Reconnect Supermemory to continue'});
  const next = await exchangeUpstream(env,{grant_type:'refresh_token',refresh_token:props.refreshToken,resource:UPSTREAM.mcp});
  return {...props,...next,refreshToken:next.refreshToken??props.refreshToken};
}
export async function authHandler(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url), base = origin(env), oauth = env.OAUTH_PROVIDER;
  if(url.pathname==='/' || url.pathname==='/health') {
    const ready=!!env.SUPERMEMORY_CLIENT_ID && !!env.OWNER_SUPERMEMORY_ID && env.MEMORY_NAMESPACE==='leetcode_problems';
    if(url.pathname==='/health')return Response.json({service:'coding-intuition-mcp',configured:ready,liveAccountVerified:false},{headers:{'Cache-Control':'no-store'}});
    return new Response(page('Your intuition, connected',`<p>Private DSA coaching with your 188-problem roadmap and Supermemory.</p><p>${ready?'Start the connection from ChatGPT’s custom MCP form.':'Deployment configuration is incomplete. No learning account is connected yet.'}</p><p>MCP endpoint: <code>${escapeHtml(base)}/mcp</code></p><p>Authentication: OAuth. Only the configured owner and learning space are allowed.</p>`),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }
  if(!env.SUPERMEMORY_CLIENT_ID || !env.OWNER_SUPERMEMORY_ID)return new Response('Authentication setup is incomplete',{status:503});
  try {
    if(url.pathname==='/authorize' && request.method==='GET') {
      const auth=await oauth.parseAuthRequest(request);
      const details=await oauth.describeConsent(auth);
      const consent=await oauth.beginConsent(auth);
      consent.headers.set('Content-Type','text/html; charset=utf-8');
      return new Response(consentPage(details,consent.handle,env.MEMORY_NAMESPACE),{headers:consent.headers});
    }
    if(url.pathname==='/authorize' && request.method==='POST') {
      const form=await request.formData();
      const handle=String(form.get('handle')??'');
      if(form.get('decision')!=='approve') {
        const denied=await oauth.denyConsent(request,handle);
        return new Response(null,{status:302,headers:denied.headers});
      }
      const approved=await oauth.approveConsent(request,handle,{scope:form.getAll('scope').map(String)});
      if(!approved.request.scope.includes('learning:read'))return new Response('Read access is required to connect',{status:400});
      const verifier=crypto.randomUUID()+crypto.randomUUID();
      const upstream=await oauth.beginUpstream(approved.request,{data:{verifier},headers:approved.headers});
      const next=new URL(UPSTREAM.authorize);
      next.search=new URLSearchParams({client_id:env.SUPERMEMORY_CLIENT_ID,redirect_uri:base+'/callback',response_type:'code',scope:'openid profile email offline_access',state:upstream.state,code_challenge:await sha256(verifier),code_challenge_method:'S256',resource:UPSTREAM.mcp}).toString();
      upstream.headers.set('Location',next.href);
      return new Response(null,{status:302,headers:upstream.headers});
    }
    if(url.pathname==='/callback' && request.method==='GET') {
      const saved=await oauth.finishUpstream<{verifier:string}>(request);
      if(url.searchParams.has('error')) {saved.headers.set('Location',authorizationErrorRedirect(saved.request,'access_denied'));return new Response(null,{status:302,headers:saved.headers});}
      if(url.searchParams.get('iss')!==UPSTREAM.issuer || !url.searchParams.get('code'))return new Response('Invalid Supermemory authorization response',{status:400,headers:saved.headers});
      const tokens=await exchangeUpstream(env,{grant_type:'authorization_code',code:url.searchParams.get('code')!,redirect_uri:base+'/callback',code_verifier:saved.data.verifier,resource:UPSTREAM.mcp});
      const identity=await withMemory(tokens.accessToken,async call=>{
        const who=await call('who_am_i');
        const spaces=await call('list_spaces');
        return {who,spaces};
      });
      const props:AuthProps={...tokens,userId:identity.who.userId,namespace:env.MEMORY_NAMESPACE};
      try {assertOwner(env,props);} catch {return new Response('This Supermemory account is not the configured learning owner. Sign in with the intended account.',{status:403,headers:saved.headers});}
      if(!identity.spaces.spaces?.some((s:any)=>s.namespace===props.namespace))return new Response('The approved learning space is unavailable',{status:403,headers:saved.headers});
      const done=await oauth.completeAuthorization({request:saved.request,userId:props.userId,metadata:{namespace:props.namespace},scope:saved.request.scope,props});
      saved.headers.set('Location',done.redirectTo);
      return new Response(null,{status:302,headers:saved.headers});
    }
    return new Response('Not found',{status:404});
  } catch(error) {
    if(error instanceof AuthorizationError || error instanceof CimdFetchError)return new Response('This connection request is invalid or expired. Start again from ChatGPT.',{status:400});
    if(error instanceof OAuthError)return Response.json({error:error.code,error_description:error.options.description},{status:error.options.statusCode??400});
    return new Response('Authentication could not be completed. Please retry.',{status:502});
  }
}
