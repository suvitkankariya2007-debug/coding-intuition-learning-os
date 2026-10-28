import {describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MEMORY_CACHE_TTL_MS,memoryCacheIsFresh,saveQuestionSchema} from '../src/continuity';
// @ts-ignore Native isolated fixtures; no real account or credentials.
import {fixtureRuntime} from '../scripts/demo-fixture.mjs';
const first={questionId:'question-bst-98',clientEventId:'thread-create-98',expectedRevision:0,question:'Why do BST nodes need ancestor bounds?',problemRef:'lc:98',status:'open',approaches:['Compared the immediate children.'],mistakes:['Missed ancestor constraints.'],conceptKeys:['bst-ordering'],nextStep:'Dry-run a node that satisfies its parent but violates an ancestor.'};
const retryUntilStored=async(f:any,id:string)=>{
 await expect.poll(async()=>{await f.rpc('retry_learning_writes',{limit:3});const status=await f.rpc('get_learning_write_status',{clientEventId:id});return status.receipts.some((r:any)=>r.status==='stored');},{timeout:15000,interval:500}).toBe(true);
};
describe('persistent cross-chat questions and memory outbox',()=>{
 it('keeps independent unfinished questions, protects revisions and retains history after resolving only one',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{
   expect(await f.rpc('save_learning_question',first)).toMatchObject({status:'stored',revision:1});
   expect(await f.rpc('save_learning_question',first)).toMatchObject({status:'stored',duplicate:true});
   await f.rpc('save_learning_question',{...first,questionId:'question-window',clientEventId:'thread-create-window',question:'When should I shrink a sliding window?',problemRef:'lc:3',conceptKeys:['sliding-window']});
   expect((await f.rpc('get_learning_questions')).total).toBe(2);
   const attempts=await Promise.all(['thread-revision-a','thread-revision-b'].map(clientEventId=>f.rpc('save_learning_question',{...first,expectedRevision:1,clientEventId,status:'paused'})));
   expect(attempts.filter(x=>x.status==='stored')).toHaveLength(1);expect(attempts.filter(x=>x.status==='revision_conflict')).toHaveLength(1);
   await f.rpc('save_learning_question',{...first,expectedRevision:2,clientEventId:'thread-resolve-98',status:'resolved',nextStep:'Explain ancestor bounds unaided on a future recall attempt.'});
   const active=await f.rpc('get_learning_questions');expect(active.total).toBe(1);expect(active.items[0].questionId).toBe('question-window');
   const history=await f.rpc('get_learning_questions',{questionId:first.questionId,status:'all'});expect(history.revisions).toHaveLength(3);expect(history.revisions[0].mistakes).toEqual(first.mistakes);
   const latest=await f.rpc('get_learning_questions',{questionId:first.questionId,status:'all',limit:1});expect(latest.revisions[0].revision).toBe(3);expect(latest.nextBeforeRevision).toBe(3);
   expect((await f.rpc('get_learning_questions',{questionId:first.questionId,status:'all',limit:1,beforeRevision:latest.nextBeforeRevision})).revisions[0].revision).toBe(2);
   expect((await f.rpc('get_recommendations')).unfinishedQuestionContext.items[0].questionId).toBe('question-window');
   await expect(f.rpc('save_learning_question',{...first,question:'Conflicting same operation id'})).rejects.toThrow();
   expect((await f.rpc('get_learning_signals')).eventCount).toBe(0);
  }finally{await f.mf.dispose();}
 });
 it('retains the full question and queued payload through an upstream outage and local runtime restart',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'question-outbox-'));let f=fixtureRuntime(directory);await f.mf.ready;
  try{
   f.state.offline=true;expect(await f.rpc('save_learning_question',first)).toMatchObject({status:'pending',localDurable:true});
   const before=await f.rpc('get_learning_questions');expect(before.items[0]).toMatchObject({questionId:first.questionId,nextStep:first.nextStep,memorySync:{status:'pending'}});
   expect((await f.rpc('get_learning_write_status')).pendingCount).toBe(1);
   await f.mf.dispose();f=fixtureRuntime(directory);await f.mf.ready;
   expect((await f.rpc('get_learning_questions')).items[0].approaches).toEqual(first.approaches);
   await retryUntilStored(f,first.clientEventId);
   expect((await f.rpc('get_learning_questions')).items[0].memorySync.status).toBe('stored');
   expect((await f.rpc('get_learning_write_status')).pendingCount).toBe(0);expect(f.state.documents.filter((d:any)=>d.content.includes('coding-intuition-question-v1'))).toHaveLength(1);
  }finally{await f.mf.dispose();await rm(directory,{recursive:true,force:true});}
 },20000);
 it('reconciles a provider commit whose response was lost without writing a duplicate, even past a truncated document',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{
   f.state.dropAddResponse=true;expect(await f.rpc('save_learning_question',first)).toMatchObject({status:'pending'});
   const count=f.state.documents.length;await retryUntilStored(f,first.clientEventId);expect(f.state.documents).toHaveLength(count);
   expect((await f.rpc('get_learning_questions')).items[0].memorySync.status).toBe('stored');
  }finally{await f.mf.dispose();}
 },20000);
 it('retains ambiguous absent writes and never claims storage or blindly duplicates them',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{
   f.state.failAddBeforeSave=true;await f.rpc('save_learning_question',first);f.state.failAddBeforeSave=false;
   await expect.poll(async()=>{await f.rpc('retry_learning_writes');return (await f.rpc('get_learning_write_status')).items[0]?.lastError;},{timeout:10000,interval:500}).toMatch(/retained_for_reconciliation/);
   expect(f.state.documents).toHaveLength(2);expect((await f.rpc('get_learning_questions')).items[0].question).toBe(first.question);
   expect((await f.rpc('get_learning_questions')).items[0].memorySync.status).toBe('pending');
  }finally{await f.mf.dispose();}
 },15000);
 it('allows an explicitly acknowledged targeted resend only after a complete absence scan',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{
   f.state.documents=[];f.state.failAddBeforeSave=true;await f.rpc('save_learning_question',first);f.state.failAddBeforeSave=false;
   await expect(f.rpc('retry_learning_writes',{resendUnconfirmed:true,clientEventId:first.clientEventId})).rejects.toThrow();
   await expect.poll(async()=>{await f.rpc('retry_learning_writes');return (await f.rpc('get_learning_write_status')).items[0]?.reconciledAbsentAt;},{timeout:10000,interval:500}).toBeGreaterThan(0);
   // An explicitly acknowledged recovery bypasses the reconciliation polling delay.
   await expect.poll(async()=>{await f.rpc('retry_learning_writes',{clientEventId:first.clientEventId,resendUnconfirmed:true,acknowledgeDuplicateRisk:true});return (await f.rpc('get_learning_write_status')).pendingCount;},{timeout:10000,interval:500}).toBe(0);
   expect(f.state.documents).toHaveLength(1);
  }finally{await f.mf.dispose();}
 },15000);
 it('queues approved events and actual review grades, restoring each once without inventing another grade',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{
   const itemId=(await f.rpc('get_learning_catalog',{limit:1})).items[0].itemId;
   f.state.offline=true;
   const event={clientEventId:'queued-event-001',itemId,kind:'mistake',summary:'I missed the ancestor bound in my reported attempt.',conceptKeys:['bst-ordering'],origin:'chatgpt'};
   expect(await f.rpc('record_reasoning_event',event)).toMatchObject({status:'pending'});
   expect(await f.rpc('record_review',{clientEventId:'queued-review-001',itemId,grade:2})).toMatchObject({status:'pending'});
   expect((await f.rpc('get_learning_signals')).eventCount).toBe(0);
   f.state.offline=false;await retryUntilStored(f,event.clientEventId);await retryUntilStored(f,'queued-review-001');
   const history=await f.rpc('get_problem_history',{itemId});expect(history.learningEvents).toHaveLength(1);expect(history.reviews).toHaveLength(1);expect(history.reviews[0].grade).toBe(2);
   expect((await f.rpc('get_learning_write_status')).pendingCount).toBe(0);
  }finally{await f.mf.dispose();}
 },20000);
 it('rehydrates thread revisions from Supermemory and does not let document deletion erase unfinished work',async()=>{
  let f=fixtureRuntime();await f.mf.ready;let docs:any[]=[];
  try{await f.rpc('save_learning_question',first);docs=structuredClone(f.state.documents);}finally{await f.mf.dispose();}
  f=fixtureRuntime();await f.mf.ready;
  try{
   f.state.documents=docs;await f.rpc('refresh_learning_memory');expect((await f.rpc('get_learning_questions')).items[0].questionId).toBe(first.questionId);
   expect(await f.rpc('save_learning_question',first)).toMatchObject({status:'stored',duplicate:true});
   f.state.documents=[];await f.rpc('refresh_learning_memory');await f.rpc('refresh_learning_memory');expect((await f.rpc('get_learning_questions')).total).toBe(1);
  }finally{await f.mf.dispose();}
 });
 it('caches searches for one hour, retains cache on restart and bypasses/invalidates it when explicitly refreshed or memory is saved',async()=>{
  expect(MEMORY_CACHE_TTL_MS).toBe(3600000);expect(memoryCacheIsFresh(0,3599999)).toBe(true);expect(memoryCacheIsFresh(0,3600000)).toBe(false);expect(memoryCacheIsFresh(3600000,0)).toBe(false);
  const directory=await mkdtemp(join(tmpdir(),'question-cache-'));let f=fixtureRuntime(directory);await f.mf.ready;
  const query='My BST reasoning and learning preferences';
  try{
   const firstSearch=await f.rpc('get_memory_patterns',{query});expect(firstSearch).toMatchObject({cache:'miss',cacheTtlSeconds:3600});expect(Date.parse(firstSearch.expiresAt)-Date.parse(firstSearch.cachedAt)).toBe(3600000);
   f.state.offline=true;expect((await f.rpc('get_memory_patterns',{query})).cache).toBe('hit');
   await f.mf.dispose();f=fixtureRuntime(directory);await f.mf.ready;f.state.offline=true;expect((await f.rpc('get_memory_patterns',{query})).cache).toBe('hit');
   await expect(f.rpc('get_memory_patterns',{query,refresh:true})).rejects.toThrow();
   f.state.offline=false;await f.rpc('get_memory_patterns',{query});await f.rpc('save_learning_question',first);expect((await f.rpc('get_memory_patterns',{query})).cache).toBe('miss');
  }finally{await f.mf.dispose();await rm(directory,{recursive:true,force:true});}
 },20000);
 it('rejects unbounded context and unintended arguments instead of silently saving them',()=>{
  expect(()=>saveQuestionSchema.parse({...first,question:'x'.repeat(1001)})).toThrow();expect(()=>saveQuestionSchema.parse({...first,expectedRevision:-1})).toThrow();expect(()=>saveQuestionSchema.parse({...first,namespace:'other-space'})).toThrow();
 });
});
