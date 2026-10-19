import {describe,it,expect} from 'vitest';
import {mkdtemp,rm,stat,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-ignore Node-side local runtime is intentionally native JavaScript.
import {CredentialFile,MemoryLogin,MemoryCredentials,endpoints,redirectUri} from '../local/memory-auth.mjs';

const owner='owner-fixture';
function memoryFile(){let value:any={};return {load:async()=>structuredClone(value),save:async(v:any)=>{value=structuredClone(v);}};}
function callback(authorize:string){const url=new URL(redirectUri);url.search=new URLSearchParams({code:'fixture-code',state:new URL(authorize).searchParams.get('state')!,iss:endpoints.issuer}).toString();return url;}
const identity=async()=>({who:{userId:owner},spaces:{spaces:[{namespace:'leetcode_problems'}]}});
const tokens={access_token:'fixture-access',token_type:'Bearer',expires_in:3600,refresh_token:'fixture-refresh'};
function provider(){return async(url:string,init:any)=>{
  if(url===endpoints.register){expect(JSON.parse(init.body).redirect_uris).toEqual([redirectUri]);return Response.json({client_id:'public-fixture',token_endpoint_auth_method:'none'});}
  if(url===endpoints.token){expect(init.body.get('resource')).toBe(endpoints.mcp);expect(init.body.get('code_verifier')).toBeTruthy();return Response.json(tokens);}
  throw Error('Unexpected request');
};}
describe('local Supermemory authorization and credential lifecycle',()=>{
  it('uses PKCE and saves tokens only after owner and space verification',async()=>{
    const file=memoryFile(),login=new MemoryLogin(owner,{file,fetcher:provider(),identity});
    const url=await login.begin();expect(new URL(url).searchParams.get('code_challenge_method')).toBe('S256');
    expect((await file.load()).props).toBeUndefined();
    expect(await login.finish(callback(url))).toEqual({ownerVerified:true,primarySpaceVerified:true});
    expect((await file.load()).props.userId).toBe(owner);
    await expect(login.finish(callback(url))).rejects.toThrow();
  });
  it('rejects wrong state, expired callbacks and the wrong issuer',async()=>{
    let now=0;const login=new MemoryLogin(owner,{file:memoryFile(),fetcher:provider(),identity,now:()=>now});
    let url=await login.begin(),bad=callback(url);bad.searchParams.set('state','attacker');await expect(login.finish(bad)).rejects.toThrow();
    now=600001;await expect(login.finish(callback(url))).rejects.toThrow();
    url=await login.begin();bad=callback(url);bad.searchParams.set('iss','https://untrusted.example');await expect(login.finish(bad)).rejects.toThrow();
  });
  it('never saves another account or an account missing the primary space',async()=>{
    for(const wrong of [{who:{userId:'other'},spaces:{spaces:[{namespace:'leetcode_problems'}]}},{who:{userId:owner},spaces:{spaces:[]}}]){
      const file=memoryFile(),login=new MemoryLogin(owner,{file,fetcher:provider(),identity:async()=>wrong});
      const url=await login.begin();await expect(login.finish(callback(url))).rejects.toThrow();expect((await file.load()).props).toBeUndefined();
    }
  });
  it('serializes refreshes and persists rotated credentials for restart',async()=>{
    const file=memoryFile();await file.save({owner,clientId:'public-fixture',props:{userId:owner,namespace:'leetcode_problems',accessToken:'old',refreshToken:'old-refresh',expiresAt:1}});
    let refreshes=0;
    const fetcher=async(url:string,init:any)=>{expect(url).toBe(endpoints.token);expect(init.body.get('refresh_token')).toBe('old-refresh');refreshes++;return Response.json({...tokens,refresh_token:'rotated'});};
    const manager=new MemoryCredentials(owner,{file,fetcher});
    const [a,b]=await Promise.all([manager.getProps(),manager.getProps()]);expect(refreshes).toBe(1);expect(a).toEqual(b);
    expect((await file.load()).props.refreshToken).toBe('rotated');
    expect((await new MemoryCredentials(owner,{file,fetcher}).getProps()).accessToken).toBe('fixture-access');expect(refreshes).toBe(1);
    await expect(new MemoryCredentials('other-owner',{file,fetcher}).getProps()).rejects.toThrow();
  });
  it('uses private files and rejects permissive credential storage',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'learning-auth-'));
    try {
      const file=new CredentialFile(directory);await file.save({owner});expect((await stat(file.path)).mode&0o777).toBe(0o600);
      expect(await file.load()).toEqual({owner});
      await chmod(file.path,0o644);await expect(file.load()).rejects.toThrow();
    }finally{await rm(directory,{recursive:true,force:true});}
  });
});
