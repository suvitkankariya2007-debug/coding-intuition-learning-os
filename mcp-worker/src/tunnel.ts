import { apiHandler } from './mcp-handler';
import { assertOwner, origin, type Env, type AuthProps } from './config';
export { LearnerStore } from './store';

type TunnelEnv=Env & { LOCAL_CREDENTIALS:Fetcher; LOCAL_WRITE_ENABLED:string };
/** Separate local-only entry. Never used by the public OAuth Worker configuration. */
export default {
  async fetch(request:Request,env:TunnelEnv,ctx:ExecutionContext) {
    const base=origin(env),url=new URL(request.url);
    if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)||url.origin!==base)return new Response('Loopback only',{status:403});
    if(request.headers.has('Origin'))return new Response('Browser requests are not allowed on the tunnel transport',{status:403});
    if(url.pathname==='/health'&&request.method==='GET')return Response.json({service:'coding-intuition-local-mcp',transport:'private_tunnel',downstreamOAuth:false,supermemoryOAuth:'separate_local_login',writesEnabled:env.LOCAL_WRITE_ENABLED==='true',liveChatGPTCallVerified:false},{headers:{'Cache-Control':'no-store'}});
    if(url.pathname!=='/mcp')return new Response('Not found',{status:404});
    if(request.method!=='POST')return new Response('Use POST',{status:405,headers:{Allow:'POST'}});
    let props:AuthProps;
    try {
      const credentials=await env.LOCAL_CREDENTIALS.fetch('https://credentials.internal/props');
      if(!credentials.ok)throw Error('Reconnect');
      props=await credentials.json();assertOwner(env,props);
      if(!Number.isFinite(props.expiresAt)||props.expiresAt<=Date.now())throw Error('Expired');
    }catch{return Response.json({error:'supermemory_login_required',nextAction:'Run npm run memory:login on the laptop. No successful learning write is claimed.'},{status:503,headers:{'Cache-Control':'no-store'}});}
    const scope=['learning:read',...(env.LOCAL_WRITE_ENABLED==='true'?['learning:write']:[])];
    const response=await apiHandler(request,env,{auth:{scope},props,mode:'tunnel',waitUntil:p=>ctx.waitUntil(p)});
    const secured=new Response(response.body,response);
    secured.headers.set('Cache-Control','no-store');secured.headers.set('X-Content-Type-Options','nosniff');
    return secured;
  }
};
