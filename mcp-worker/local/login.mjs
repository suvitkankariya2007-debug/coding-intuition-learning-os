import { safeDiagnostic } from './diagnostics.mjs';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { MemoryLogin, redirectUri } from './memory-auth.mjs';

export async function startLogin(owner,{port=8788,login=new MemoryLogin(owner)}={}){
  if(port!==8788)throw Error('The registered local callback uses port 8788.');
  const csrf=randomBytes(32).toString('hex'),base=new URL(redirectUri).origin;
  // no-referrer makes browser form POSTs send Origin: null, failing our strict check.
  // same-origin preserves local form origins without leaking referrers to Supermemory.
  const send=(response,status,body,headers={})=>{response.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",...headers});response.end(body);};
  const server=createServer(async(request,response)=>{
    if(request.headers.host!=='127.0.0.1:8788'){send(response,403,'Unexpected host');return;}
    const url=new URL(request.url,base);
    try {
      if(url.pathname==='/'&&request.method==='GET')return send(response,200,`<!doctype html><title>Connect Supermemory</title><h1>Connect your DSA learning memory</h1><p>Sign in on Supermemory to verify the configured owner and leetcode_problems space. Tokens stay in a private file on this laptop. No deployment is performed.</p><form method="post" action="/start"><input type="hidden" name="csrf" value="${csrf}"><button>Continue to Supermemory</button></form>`);
      if(url.pathname==='/start'&&request.method==='POST'){
        if(request.headers.origin!==base)return send(response,403,'Unexpected origin');
        let body='';for await(const chunk of request){body+=chunk;if(Buffer.byteLength(body)>2048)return send(response,413,'Request too large');}
        const value=new URLSearchParams(body).get('csrf')??'';
        if(value.length!==csrf.length||!timingSafeEqual(Buffer.from(value),Buffer.from(csrf)))return send(response,403,'Invalid login form');
        return send(response,302,'Continue on Supermemory',{Location:await login.begin()});
      }
      if(url.pathname==='/callback'&&request.method==='GET'){
        await login.finish(url);
        send(response,200,'<!doctype html><title>Memory connected</title><h1>Supermemory connected</h1><p>The intended owner and learning space were verified. You can close this page and return to ChatGPT.</p>');
        server.close();return;
      }
      send(response,404,'Not found');
    }catch(error){const diagnostic=safeDiagnostic(error);console.error('Local Supermemory sign-in: '+diagnostic);send(response,400,'Sign-in could not complete. '+diagnostic+' No tokens are displayed. Retry from the local start page.');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const timeout=setTimeout(()=>server.close(),15*60000);timeout.unref();server.on('close',()=>clearTimeout(timeout));
  return server;
}
if(import.meta.url===new URL(process.argv[1],'file:').href){
  try{await startLogin(process.argv[2]);console.log('Open http://127.0.0.1:8788 on this laptop to sign in to Supermemory. No deployment was made.');}
  catch(error){console.error('Local sign-in could not start. '+safeDiagnostic(error));process.exitCode=1;}
}
