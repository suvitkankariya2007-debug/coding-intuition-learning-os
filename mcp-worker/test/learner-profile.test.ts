import {describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initialProfile,mergeProfile,profileView,updateProfileSchema,learnerSources} from '../src/learner-profile';
import {learningDay,emptySnapshot,buildData} from '../src/learning';
import {sealCredentials,openCredentials} from '../src/credential-crypto';
import {initialMonitor,reconcileMonitorSources} from '../src/monitor-state';
import {assertOwner,namespaceForLearner,readNamespaces} from '../src/config';
// @ts-ignore Native isolated provider fixture.
import {fixtureRuntime} from '../scripts/demo-fixture.mjs';
// @ts-ignore Hosted OAuth fixture uses no real identities or credentials.
import {multiUserFixture,fixtureNamespace} from '../scripts/multi-user-fixture.mjs';
const edit={clientEventId:'profile-change-001',expectedRevision:0,changes:{preferences:{language:'cpp',explanationDepth:'concise',exampleFormats:['dry_run','counterexample'],sessionMinutes:30,practiceGoal:'interviews'},focusConcepts:['bst-ordering']},reason:'Explicit learner preference for concise C++ examples.'};

describe('versioned evolving learner profiles',()=>{
 it('applies explicit preferences to coaching and recommendations without manufacturing learning evidence',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{
   const baseline=await f.rpc('get_learner_profile');expect(baseline).toMatchObject({configured:false,profile:{revision:0,preferences:{language:null}},learningState:{eventCount:0}});
   expect(await f.rpc('update_learner_profile',edit)).toMatchObject({status:'stored',profileRevision:1});
   const profile=await f.rpc('get_learner_profile');expect(profile.coachingPolicy).toMatchObject({language:'cpp',explanationDepth:'concise',exampleFormats:['dry_run','counterexample'],recommendedProblemCount:2});
   const recommendations=await f.rpc('get_recommendations');expect(recommendations.recommendations).toHaveLength(2);expect(recommendations.recommendations.some((r:any)=>r.reason.some((s:string)=>s.includes('Explicit learner focus')))).toBe(true);expect(recommendations.personalization.status).toBe('limited_learning_evidence');
   expect((await f.rpc('get_learning_signals')).eventCount).toBe(0);
   const itemId=(await f.rpc('get_learning_catalog',{limit:1})).items[0].itemId;
   expect((await f.rpc('get_progressive_hint',{itemId,level:1})).learnerContext.profile.revision).toBe(1);
   expect(await f.rpc('update_learner_profile',edit)).toMatchObject({duplicate:true});
  }finally{await f.mf.dispose();}
 });
 it('protects concurrent revisions, preserves preference history and honors later corrections',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{
   await f.rpc('update_learner_profile',edit);
   const outcomes=await Promise.all(['profile-edit-002','profile-edit-003'].map(clientEventId=>f.rpc('update_learner_profile',{clientEventId,expectedRevision:1,changes:{preferences:{explanationDepth:'detailed'}},reason:'The learner explicitly asked for a detailed explanation.'})));
   expect(outcomes.filter(o=>o.status==='stored')).toHaveLength(1);expect(outcomes.filter(o=>o.status==='revision_conflict')).toHaveLength(1);
   const history=await f.rpc('get_learner_profile',{includeHistory:true,limit:1});expect(history.profile.preferences.explanationDepth).toBe('detailed');expect(history.nextBeforeRevision).toBe(2);
   const earlier=await f.rpc('get_learner_profile',{includeHistory:true,beforeRevision:2});expect(earlier.history[0].preferences.explanationDepth).toBe('concise');expect(earlier.profile.preferences.language).toBe('cpp');
   await expect(f.rpc('update_learner_profile',{...edit,reason:'Conflicting reuse of an operation id.'})).rejects.toThrow();
  }finally{await f.mf.dispose();}
 });
 it('evolves evidence after approved events without silently overriding saved preferences or counting hinted explanations as unaided',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{
   await f.rpc('update_learner_profile',edit);const initial=await f.rpc('get_learner_profile');
   for(let i=0;i<3;i++)await f.rpc('record_reasoning_event',{clientEventId:'profile-assisted-'+i,problemRef:'lc:98',kind:'reasoning_insight',summary:'I explained the ancestor bound after receiving an explicit clue.',conceptKeys:['bst-ordering'],hintStage:'gentle',independentlyExplained:true,origin:'chatgpt'});
   const next=await f.rpc('get_learner_profile');expect(next.profile.revision).toBe(1);expect(next.learningState.evidenceVersion).not.toBe(initial.learningState.evidenceVersion);expect(next.learningState.recordedAssistance).toMatchObject({assisted:3,independent:0});expect(next.coachingPolicy.adaptations[0].rule).toBe('recorded_hint_dependence');expect(next.profile.preferences).toEqual(initial.profile.preferences);
   await f.rpc('update_learner_profile',{clientEventId:'profile-disable-adaptation',expectedRevision:1,changes:{adaptationEnabled:false},reason:'The learner asked to disable inferred coaching adaptations.'});
   expect((await f.rpc('get_learner_profile')).coachingPolicy.adaptations).toEqual([]);
  }finally{await f.mf.dispose();}
 });
 it('retains a pending profile across restart, then confirms it and restores its revision from Supermemory',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'learner-profile-'));let f=fixtureRuntime(directory);await f.mf.ready;let docs:any[]=[];
  try{
   f.state.offline=true;expect(await f.rpc('update_learner_profile',edit)).toMatchObject({status:'pending',localDurable:true});expect((await f.rpc('get_learner_profile')).profile.preferences.language).toBe('cpp');
   await f.mf.dispose();f=fixtureRuntime(directory);await f.mf.ready;
   expect((await f.rpc('get_learner_profile')).profile.revision).toBe(1);
   await expect.poll(async()=>{await f.rpc('retry_learning_writes');return (await f.rpc('get_learning_write_status')).pendingCount;},{timeout:10000,interval:500}).toBe(0);
   docs=structuredClone(f.state.documents);
  }finally{await f.mf.dispose();await rm(directory,{recursive:true,force:true});}
  f=fixtureRuntime();await f.mf.ready;
  try{f.state.documents=docs;await f.rpc('refresh_learning_memory');const p=await f.rpc('get_learner_profile');expect(p.profile.preferences.language).toBe('cpp');expect(p.memorySync.status).toBe('stored');expect(await f.rpc('update_learner_profile',edit)).toMatchObject({status:'stored',duplicate:true});}finally{await f.mf.dispose();}
 },20000);
 it('does not regress a newer preference revision when an older pending profile is delivered later',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{
   f.state.offline=true;await f.rpc('update_learner_profile',edit);f.state.offline=false;
   await f.rpc('update_learner_profile',{clientEventId:'newer-profile-before-retry',expectedRevision:1,changes:{preferences:{language:'python'}},reason:'The learner changed the language before an older queued write completed.'});
   await expect.poll(async()=>{await f.rpc('retry_learning_writes');return (await f.rpc('get_learning_write_status')).pendingCount;},{timeout:10000,interval:500}).toBe(0);
   const current=await f.rpc('get_learner_profile');expect(current.profile.revision).toBe(2);expect(current.profile.preferences.language).toBe('python');
   const docs=structuredClone(f.state.documents);const restored=fixtureRuntime();await restored.mf.ready;
   try{restored.state.documents=docs;let page=1;do{const result=await restored.rpc('refresh_learning_memory',{page});page=result.nextPage;}while(page);expect((await restored.rpc('get_learner_profile')).profile.preferences.language).toBe('python');}finally{await restored.mf.dispose();}
  }finally{await f.mf.dispose();}
 },20000);
 it('handles a lost profile-write response without duplicating the saved profile',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{f.state.dropAddResponse=true;expect(await f.rpc('update_learner_profile',edit)).toMatchObject({status:'pending'});const count=f.state.documents.length;await f.rpc('refresh_learning_memory');expect((await f.rpc('get_learning_write_status')).pendingCount).toBe(0);expect((await f.rpc('get_learner_profile')).memorySync.status).toBe('stored');expect(f.state.documents).toHaveLength(count);}finally{await f.mf.dispose();}
 });
 it('does not let an edited saved profile corrupt an existing operation receipt',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{
   const receipt=await f.rpc('update_learner_profile',edit),doc=f.state.documents.find((d:any)=>d.id===receipt.documentId),parsed=JSON.parse(doc.content);parsed.fingerprint='a'.repeat(43);doc.content=JSON.stringify(parsed);doc.updatedAt='2026-10-24T01:00:00Z';
   await f.rpc('refresh_learning_memory');expect(await f.rpc('update_learner_profile',edit)).toMatchObject({status:'stored',duplicate:true});expect((await f.rpc('get_learner_profile')).profile.preferences.language).toBe('cpp');
  }finally{await f.mf.dispose();}
 });
 it('uses each learner time zone for practice dates and rejects unsupported or unbounded settings',()=>{
  const midnight=Date.parse('2026-10-23T20:00:00Z');expect(learningDay(midnight,'Asia/Kolkata')).toBe('2026-10-24');expect(learningDay(midnight,'America/New_York')).toBe('2026-10-23');
  for(const changes of [{preferences:{timeZone:'invalid/timezone'}},{preferences:{sessionMinutes:10000}},{sources:{githubRepo:'https://internal/metadata'}},{sources:{githubPath:'../secret'}},{preferences:{inventedStyle:'photographic'}},{}])expect(()=>updateProfileSchema.parse({...edit,changes})).toThrow();
 });
});

describe('tenant identity and source boundaries',()=>{
 const env:any={MULTI_USER_ENABLED:'true',OWNER_SUPERMEMORY_ID:'legacy-owner',MEMORY_NAMESPACE:'leetcode_problems',MEMORY_READ_NAMESPACES:'leetcode_problems,leetcode',LEETCODE_USERNAME:'legacy-handle',CODEFORCES_HANDLE:'legacy-cf',GITHUB_SOLUTIONS_REPO:'legacy/solutions',MONITOR_ENCRYPTION_KEY:'a'.repeat(64)};
 const a={userId:'learner-a',namespace:namespaceForLearner(env,'learner-a'),accessToken:'fixture-a',expiresAt:1},b={userId:'learner-b',namespace:namespaceForLearner(env,'learner-b'),accessToken:'fixture-b',expiresAt:1};
 it('isolates namespaces and never gives a new learner the configured owner coding accounts',()=>{
  expect(a.namespace).not.toBe(b.namespace);expect(()=>assertOwner(env,a)).not.toThrow();expect(()=>assertOwner(env,{...a,namespace:b.namespace})).toThrow();expect(readNamespaces(env,a)).toEqual([a.namespace]);expect(()=>readNamespaces(env)).toThrow();
  const sources=learnerSources(env,a,initialProfile(env,a));expect(sources.LEETCODE_USERNAME).toBe('');expect(sources.CODEFORCES_HANDLE).toBe('');expect(sources.GITHUB_SOLUTIONS_REPO).toBeUndefined();
  expect(()=>assertOwner({...env,MULTI_USER_ENABLED:'false'},a)).toThrow();
  expect(()=>assertOwner({...env,LOCAL_CREDENTIALS:{}},a)).toThrow();
 });
 it('resets a stored account cursor when a newer profile is restored through memory synchronization',()=>{
  const monitor=initialMonitor();monitor.cfCursor=1001;monitor.taskIndex=1;monitor.sourceConfiguration={codeforces:'old-account',leetcode:'same-account'};monitor.tasks.codeforces={status:'success',checkedAt:new Date().toISOString()};monitor.tasks.leetcode={status:'success',checkedAt:new Date().toISOString()};
  reconcileMonitorSources(monitor,{codeforces:'new-account',leetcode:'same-account'});expect(monitor.cfCursor).toBe(1);expect(monitor.taskIndex).toBe(0);expect(monitor.tasks.codeforces).toBeUndefined();expect(monitor.tasks.leetcode.status).toBe('success');
 });
 it('binds encrypted monitor credentials to the expected user and namespace',async()=>{
  const sealed=await sealCredentials(env,a);expect(await openCredentials(env,sealed,a)).toEqual(a);await expect(openCredentials(env,sealed,b)).rejects.toThrow();await expect(openCredentials(env,sealed)).rejects.toThrow();await expect(openCredentials(env,{...sealed,userId:b.userId,namespace:b.namespace},b)).rejects.toThrow();
  const legacyEnv:any={MONITOR_ENCRYPTION_KEY:'a'.repeat(64),OWNER_SUPERMEMORY_ID:'owner',MEMORY_NAMESPACE:'leetcode_problems'},owner={userId:'owner',namespace:'leetcode_problems',accessToken:'legacy-fixture',expiresAt:1};
  const legacy=await sealCredentials(legacyEnv,owner);expect(await openCredentials(legacyEnv,{iv:legacy.iv,data:legacy.data})).toEqual(owner);
 });
});

describe('real hosted OAuth with independent learning policies',()=>{
 it('completes two account connections, separates profiles/questions/cache and scopes actual source requests',async()=>{
  const f=multiUserFixture();await f.mf.ready;
  try{
   const a=await f.login('learner-a'),b=await f.login('learner-b');expect(a.status).toBe(200);expect(b.status).toBe(200);
   const callA=(name:string,args:any={})=>f.rpc(a.access_token,name,args),callB=(name:string,args:any={})=>f.rpc(b.access_token,name,args);
   expect(await callA('sync_learning_source',{source:'leetcode',force:true})).toMatchObject({configured:false,available:false});expect(f.state.requests.some((r:any)=>r.username==='legacy-handle')).toBe(false);
   await callA('update_learner_profile',{...edit,changes:{...edit.changes,sources:{leetcodeUsername:'learner-a-lc'}}});
   await callB('update_learner_profile',{...edit,changes:{preferences:{language:'python',explanationDepth:'detailed',exampleFormats:['diagram'],practiceGoal:'competitive_programming',sessionMinutes:45},sources:{codeforcesHandle:'learner-b-cf'}}});
   expect((await callA('get_learner_profile')).coachingPolicy.language).toBe('cpp');expect((await callB('get_learner_profile')).coachingPolicy.language).toBe('python');
   const question={questionId:'same-question-id',clientEventId:'same-question-operation',expectedRevision:0,status:'open',approaches:[],mistakes:[],conceptKeys:['bst-ordering'],nextStep:'Trace the inherited bounds.'};
   await callA('save_learning_question',{...question,question:'How do ancestor bounds constrain this BST?'});await callB('save_learning_question',{...question,question:'How do I explain a different learner question?'});
   expect((await callA('get_learning_questions')).items[0].question).not.toBe((await callB('get_learning_questions')).items[0].question);
   const query='Private multi-user cache scope check';const memoryA=await callA('get_memory_patterns',{query}),memoryB=await callB('get_memory_patterns',{query});expect(memoryA.items[0].content).not.toBe(memoryB.items[0].content);expect((await callA('get_memory_patterns',{query})).cache).toBe('hit');expect((await callB('get_memory_patterns',{query})).cache).toBe('hit');
   await callA('sync_learning_source',{source:'leetcode',force:true});await callB('sync_learning_source',{source:'codeforces',force:true});
   const recA=await callA('get_recommendations'),recB=await callB('get_recommendations');expect(recA.recommendations).toHaveLength(2);expect(recB.recommendations).toHaveLength(3);expect(recB.recommendations.some((r:any)=>r.problemRef==='cf:9999A')).toBe(true);
   expect(f.state.requests.some((r:any)=>r.username==='learner-a-lc')).toBe(true);expect(f.state.requests.some((r:any)=>r.handle==='learner-b-cf')).toBe(true);
   const memoryCalls=f.state.requests.filter((r:any)=>r.host==='mcp.supermemory.ai');expect(memoryCalls.every((r:any)=>r.namespace===fixtureNamespace(r.user))).toBe(true);
   await expect(callA('get_learner_profile',{userId:'learner-b'})).rejects.toThrow();
   const otherDoc=f.state.documents[fixtureNamespace('learner-b')][0].id;await expect(callA('read_saved_discussion',{documentId:otherDoc})).rejects.toThrow();
   await callA('update_learner_profile',{clientEventId:'change-source-account',expectedRevision:1,changes:{sources:{leetcodeUsername:'different-account'}},reason:'The learner explicitly changed their public coding account.'});expect((await callA('get_source_submissions',{source:'leetcode'})).totalStored).toBe(0);expect((await callB('get_source_submissions',{source:'codeforces'})).totalStored).toBe(1);
   const readOnly=await f.login('learner-a','learning:read');await expect(f.rpc(readOnly.access_token,'update_learner_profile',edit)).rejects.toThrow();
   const ns=await f.mf.getDurableObjectNamespace('LEARNERS'),actor=ns.get(ns.idFromName('learner-a:'+fixtureNamespace('learner-a')));
   const wrong=await actor.fetch('https://internal/',{method:'POST',body:JSON.stringify({action:'get_profile',props:{userId:'learner-b',namespace:fixtureNamespace('learner-b'),accessToken:'fixture',expiresAt:Date.now()+10000},args:{}})});expect(wrong.status).toBe(403);
  }finally{await f.mf.dispose();}
 },30000);
 it('blocks onboarding until the derived private space exists instead of falling back to a shared space',async()=>{
  const f=multiUserFixture();await f.mf.ready;
  try{f.state.spacesReady=false;const login=await f.login('learner-a');expect(login.status).toBe(403);expect(login.body).toContain(fixtureNamespace('learner-a'));expect(login.body).toContain('No learner records have been written');expect(Object.values(f.state.documents)).toHaveLength(0);}finally{await f.mf.dispose();}
 });
 it('runs each learner monitor using that learner credentials and configured coding account',async()=>{
  const f=multiUserFixture();await f.mf.ready;
  try{
   const a=await f.login('learner-a'),b=await f.login('learner-b');
   await f.rpc(a.access_token,'update_learner_profile',{...edit,changes:{sources:{leetcodeUsername:'monitor-a'}}});await f.rpc(b.access_token,'update_learner_profile',{...edit,changes:{sources:{codeforcesHandle:'monitor-b'}}});
   await f.rpc(a.access_token,'configure_background_monitor',{enabled:true});await f.rpc(b.access_token,'configure_background_monitor',{enabled:true});
   await expect.poll(async()=>(await f.rpc(a.access_token,'get_monitor_status')).tasks.leetcode?.status,{timeout:12000,interval:150}).toBe('success');await expect.poll(async()=>(await f.rpc(b.access_token,'get_monitor_status')).tasks.codeforces?.status,{timeout:12000,interval:150}).toBe('success');
   await f.rpc(a.access_token,'configure_background_monitor',{enabled:false});await f.rpc(b.access_token,'configure_background_monitor',{enabled:false});
   expect(f.state.requests.some((r:any)=>r.username==='monitor-a')).toBe(true);expect(f.state.requests.some((r:any)=>r.handle==='monitor-b')).toBe(true);expect(f.state.requests.some((r:any)=>r.username==='legacy-handle'||r.handle==='legacy-cf')).toBe(false);
  }finally{await f.mf.dispose();}
 },20000);
});
