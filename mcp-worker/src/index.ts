import { OAuthProvider } from '@cloudflare/workers-oauth-provider';
import { authHandler, refreshProps } from './auth';
import { origin, SCOPES, type Env, type AuthProps } from './config';
import { apiHandler } from './mcp-handler';
export { LearnerStore } from './store';

export function makeProvider(env:Env) {
  const base=origin(env);
  return new OAuthProvider<Env>({apiRoute:'/mcp',apiHandler:{fetch:apiHandler as any},defaultHandler:{fetch:authHandler},authorizeEndpoint:'/authorize',tokenEndpoint:'/oauth/token',clientRegistrationEndpoint:'/oauth/register',scopesSupported:SCOPES,requiredScopes:['learning:read'],clientIdMetadataDocumentEnabled:true,resourceMetadata:{resource:base+'/mcp',authorization_servers:[base]},accessTokenTTL:300,refreshTokenTTL:2592000,
    tokenExchangeCallback:async({props,env})=>{
      const next=await refreshProps(env,props as AuthProps);
      return {newProps:next,accessTokenTTL:Math.max(1,Math.min(300,Math.floor((next.expiresAt-Date.now())/1000)-30)),refreshTokenTTL:next.refreshToken?2592000:0};
    }});
}
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext) {
    const base=origin(env);
    if(new URL(request.url).origin!==base)return new Response('Unexpected host',{status:400});
    const clientOrigin=request.headers.get('Origin');
    if(clientOrigin&&clientOrigin!==base)return new Response('Forbidden origin',{status:403});
    const response=await makeProvider(env).fetch(request,env,ctx);
    const secured=new Response(response.body,response);
    secured.headers.set('X-Content-Type-Options','nosniff');
    secured.headers.set('Referrer-Policy','no-referrer');
    secured.headers.set('X-Frame-Options','DENY');
    secured.headers.set('Cache-Control','no-store');
    return secured;
  }
};
