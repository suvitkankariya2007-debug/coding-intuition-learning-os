import {describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-ignore Native JavaScript local entrypoints.
import {startLogin} from '../local/login.mjs';
// @ts-ignore Native JavaScript local entrypoints.
import {startLocal} from '../local/server.mjs';
// @ts-ignore Native JavaScript credential storage.
import {CredentialFile} from '../local/memory-auth.mjs';

describe('actual loopback startup',()=>{
  it('serves the local login page and rejects cross-origin form submission',async()=>{
    let started=0;
    const server=await startLogin('owner-fixture',{login:{begin:async()=>{started++;return 'https://api.supermemory.ai/fixture';},finish:async()=>{}}});
    try{
      expect(server.address().address).toBe('127.0.0.1');
      const response=await fetch('http://127.0.0.1:8788');expect(response.status).toBe(200);
      expect(response.headers.get('Referrer-Policy')).toBe('same-origin');
      const page=await response.text();expect(page).toContain('Continue to Supermemory');
      const csrf=page.match(/name="csrf" value="([^"]+)"/)![1];
      const bad=await fetch('http://127.0.0.1:8788/start',{method:'POST',headers:{Origin:'https://attacker.example'},body:new URLSearchParams({csrf})});expect(bad.status).toBe(403);expect(started).toBe(0);
      const good=await fetch('http://127.0.0.1:8788/start',{method:'POST',redirect:'manual',headers:{Origin:'http://127.0.0.1:8788'},body:new URLSearchParams({csrf})});expect(good.status).toBe(302);expect(started).toBe(1);
      expect((await fetch('http://127.0.0.1:8788/props')).status).toBe(404);
    }finally{await new Promise<void>((resolve,reject)=>server.close((err:any)=>err?reject(err):resolve()));}
  });
  it('starts the persistent MCP on loopback with credentials kept out of HTTP responses',async()=>{
    const directory=await mkdtemp(join(tmpdir(),'learning-startup-')),file=new CredentialFile(directory);
    let mf:any;
    try{
      await expect(startLocal({owner:'owner-fixture',file})).rejects.toThrow();
      await file.save({owner:'owner-fixture',clientId:'fixture-public',props:{userId:'owner-fixture',namespace:'leetcode_problems',accessToken:'private-fixture-token',expiresAt:Date.now()+3600000}});
      mf=await startLocal({owner:'owner-fixture',file});
      const health=await fetch('http://127.0.0.1:8787/health');expect(health.status).toBe(200);expect(await health.text()).not.toContain('private-fixture-token');
      const response=await fetch('http://127.0.0.1:8787/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_roadmap',arguments:{limit:1}}})});
      expect(response.status).toBe(200);const text=await response.text();expect(text).toContain('188');expect(text).not.toContain('private-fixture-token');
      expect((await fetch('http://127.0.0.1:8787/props')).status).toBe(404);
    }finally{await mf?.dispose();await rm(directory,{recursive:true,force:true});}
  });
});

describe('login failure reporting',()=>{
  it('reports a safe callback reason without echoing secrets or callback parameters',async()=>{
    const secret='fixture-provider-secret';
    const server=await startLogin('owner-fixture',{login:{begin:async()=>'',finish:async()=>{throw Error(secret);}}});
    try{
      const response=await fetch('http://127.0.0.1:8788/callback?code='+secret);
      const text=await response.text();expect(response.status).toBe(400);
      expect(text).toContain('LOCAL_STARTUP_UNKNOWN');expect(text).not.toContain(secret);
    }finally{await new Promise<void>((resolve,reject)=>server.close((err:any)=>err?reject(err):resolve()));}
  });
});
