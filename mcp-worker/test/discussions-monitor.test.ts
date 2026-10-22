import {describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {discussionPage,extractQuestions} from '../src/discussions';
import {sealCredentials,openCredentials} from '../src/credential-crypto';
// @ts-ignore Native isolated fixture shared with runnable demo.
import {fixtureRuntime,originalDiscussion} from '../scripts/demo-fixture.mjs';

describe('complete saved discussions and honest question extraction',()=>{
  it('reconstructs exact Unicode text across pages and detects a document changed midway',async()=>{
    const doc={id:'doc-1',updatedAt:'v1',content:originalDiscussion,contentTruncated:false};
    let offset=0,version:string|undefined,full='';let page:any;
    do{page=await discussionPage('leetcode_problems',doc,offset,800,version);version=page.version;full+=page.content;offset=page.nextOffset as number;}while(offset!==null);
    expect(full).toBe(originalDiscussion);expect(page.complete).toBe(true);
    expect((await discussionPage('leetcode_problems',{...doc,content:doc.content+'changed'},0,800,version)).versionChanged).toBe(true);
  });
  it('reports missing provider tails instead of claiming complete retrieval',async()=>{
    const p=await discussionPage('leetcode_problems',{id:'doc-1',content:'partial content',contentTruncated:true});
    expect(p.complete).toBe(false);expect(p.providerTruncated).toBe(true);expect(p.nextOffset).toBeNull();
  });
  it('indexes literal user questions with provenance and excludes assistant instructions and code',async()=>{
    const doc={id:'doc-1',content:originalDiscussion,contentTruncated:false};const rows=await extractQuestions(doc);
    expect(rows).toHaveLength(2);expect(rows.every(r=>r.documentId==='doc-1')).toBe(true);
    expect(rows[0].problemRefs).toEqual(['lc:98']);
    expect(rows.some(r=>r.excerpt.includes('mastered'))).toBe(false);
    expect(await extractQuestions(doc)).toEqual(rows);
  });
});
describe('encrypted offline monitor credentials',()=>{
  it('encrypts credentials and binds decryption to owner and namespace',async()=>{
    const env:any={MONITOR_ENCRYPTION_KEY:'a'.repeat(64),OWNER_SUPERMEMORY_ID:'owner',MEMORY_NAMESPACE:'leetcode_problems'};
    const props={userId:'owner',namespace:'leetcode_problems',accessToken:'fixture-secret',expiresAt:1};
    const sealed=await sealCredentials(env,props);expect(JSON.stringify(sealed)).not.toContain('fixture-secret');expect(await openCredentials(env,sealed)).toEqual(props);
    await expect(openCredentials({...env,OWNER_SUPERMEMORY_ID:'other'},sealed)).rejects.toThrow();
    await expect(openCredentials({...env,MONITOR_ENCRYPTION_KEY:'b'.repeat(64)},sealed)).rejects.toThrow();
  });
});
describe('actual MCP discussion, rolling submissions and persistent alarms',()=>{
  it('retrieves full content, syncs candidates without fake mastery and retains 21 observations across rolling windows',async()=>{
    const f=fixtureRuntime();await f.mf.ready;
    try{
      expect((await f.rpc('list_learning_documents')).documents).toHaveLength(2);
      let offset:any=0,version:any,full='';do{const p=await f.rpc('read_saved_discussion',{documentId:'discussion-1',offset,limit:12000,...(version?{version}:{})});full+=p.content;offset=p.nextOffset;version=p.version;}while(offset!==null);expect(full).toBe(originalDiscussion);
      await expect(f.rpc('read_saved_discussion',{documentId:'discussion-1',offset:1})).rejects.toThrow();
      await expect(f.rpc('read_saved_discussion',{documentId:'discussion-1',namespace:'sm_project_default'})).rejects.toThrow();
      const sync=await f.rpc('refresh_learning_memory');expect(sync.extracted).toBe(2);expect(sync.incompleteDocuments).toContain('truncated-1');expect(sync.historyComplete).toBe(false);
      await f.rpc('refresh_learning_memory');expect((await f.rpc('get_saved_questions')).total).toBe(2);expect((await f.rpc('get_learning_signals')).eventCount).toBe(0);
      f.state.documents[0].content='User: How do corrected bounds work for LeetCode 98?';f.state.documents[0].updatedAt='v2';await f.rpc('refresh_learning_memory');expect((await f.rpc('get_saved_questions')).total).toBe(1);
      const first=await f.rpc('sync_learning_source',{source:'leetcode',force:true});expect(first.observed).toBe(20);expect(first.recentSubmissions[0].title).toBe('Fixture problem 2000');
      f.state.phase=1;await f.rpc('sync_learning_source',{source:'leetcode',force:true});const history=await f.rpc('get_source_submissions',{source:'leetcode',limit:50});expect(history.totalStored).toBe(21);expect(history.items[0].title).toBe('Fixture problem 2001');
      await f.rpc('sync_learning_source',{source:'codeforces',force:true});const cf=await f.rpc('get_source_submissions',{source:'codeforces'});expect(cf.totalStored).toBe(3);expect(cf.uniqueProblems).toBe(2);expect(cf.items.some((r:any)=>r.verdict==='WRONG_ANSWER')).toBe(true);
      f.state.offline=true;expect((await f.rpc('sync_learning_source',{source:'leetcode',force:true})).available).toBe(false);
      expect((await f.rpc('get_source_status')).sources.leetcode.synced).toBe(false);
      expect((await f.rpc('get_source_submissions',{source:'leetcode'})).totalStored).toBe(21);
    }finally{await f.mf.dispose();}
  },30000);
  it('runs real alarms across source tasks, persists enabled state and stops cleanly',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'adaptive-monitor-'));let f=fixtureRuntime(dir);await f.mf.ready;
    try{
      for(const task of ['leetcode','codeforces','github','memory']){
        await f.rpc('configure_background_monitor',{enabled:true,intervalMinutes:30});
        await expect.poll(async()=>((await f.rpc('get_monitor_status')).tasks[task]?.status),{timeout:12000,interval:100}).toMatch(/success|partial_provider_truncation/);
      }
      let m=await f.rpc('get_monitor_status');expect(m.enabled).toBe(true);expect(Object.keys(m.tasks)).toHaveLength(4);expect(JSON.stringify(m)).not.toContain('fixture-access');
      await f.mf.dispose();f=fixtureRuntime(dir);await f.mf.ready;expect((await f.rpc('get_monitor_status')).enabled).toBe(true);
      f.state.offline=true;await f.rpc('configure_background_monitor',{enabled:true});
      await expect.poll(async()=>(await f.rpc('get_monitor_status')).consecutiveFailures,{timeout:12000,interval:100}).toBeGreaterThan(0);
      m=await f.rpc('get_monitor_status');expect(m.nextRunAt-Date.now()).toBeGreaterThan(60000);
      const stopped=await f.rpc('configure_background_monitor',{enabled:false});expect(stopped.enabled).toBe(false);expect(stopped.nextRunAt).toBeNull();
    }finally{await f.mf.dispose();await rm(dir,{recursive:true,force:true});}
  },40000);
});

describe('hosted background credential rotation',()=>{
  it('serializes foreground refreshes with the encrypted monitor vault',async()=>{
    const {Miniflare}=await import('miniflare');let refreshes=0;
    const mf=new Miniflare({modules:true,scriptPath:'dist/index.js',compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat','global_fetch_strictly_public'],kvNamespaces:['OAUTH_KV'],durableObjects:{LEARNERS:{className:'LearnerStore',useSQLite:true}},bindings:{PUBLIC_ORIGIN:'https://fixture.example',OWNER_SUPERMEMORY_ID:'owner',MEMORY_NAMESPACE:'leetcode_problems',SUPERMEMORY_CLIENT_ID:'fixture-client',MONITOR_ENCRYPTION_KEY:'a'.repeat(64)},outboundService:async(request:any)=>{
      expect(new URL(request.url).pathname).toBe('/api/auth/oauth2/token');refreshes++;return Response.json({access_token:'rotated-fixture',refresh_token:'new-refresh',token_type:'Bearer',expires_in:3600});
    }});
    await mf.ready;
    try{
      const ns=await mf.getDurableObjectNamespace('LEARNERS'),actor=ns.get(ns.idFromName('owner:leetcode_problems'));
      const props={userId:'owner',namespace:'leetcode_problems',accessToken:'expired-fixture',refreshToken:'old-refresh',expiresAt:1};
      const call=async(action:string,args:any={})=>{const r=await actor.fetch('https://internal/',{method:'POST',body:JSON.stringify({action,props,args})});expect(r.status).toBe(200);return r.json() as any;};
      const [a,b]=await Promise.all([call('refresh_credentials'),call('refresh_credentials')]);expect(a.accessToken).toBe('rotated-fixture');expect(a).toEqual(b);expect(refreshes).toBe(1);
      expect((await call('configure_monitor',{enabled:true})).enabled).toBe(true);expect(refreshes).toBe(1);
      expect(JSON.stringify(await call('monitor_status'))).not.toContain('refresh');
      await call('configure_monitor',{enabled:false});
      // Stopping polling must not discard the latest rotated connection token.
      expect((await call('refresh_credentials')).accessToken).toBe('rotated-fixture');expect(refreshes).toBe(1);
    }finally{await mf.dispose();}
  });
});
