import {it,expect} from 'vitest';
import {analyzeContext} from '../src/context-ingestion';
import {buildData,emptySnapshot} from '../src/learning';
// @ts-ignore Isolated mock providers only.
import {fixtureRuntime} from '../scripts/demo-fixture.mjs';
const context={sessionId:'context-session-001',checkpointId:'context-checkpoint-001',coverage:'available_current_chat',problemRef:'lc:98',turns:[{turnId:'learner-turn-001',role:'learner',text:'Why do BST ancestor bounds matter beyond checking the immediate child?'},{turnId:'assistant-turn-001',role:'assistant',text:'I explained all inherited bounds. Why not mark everything mastered?'}]};
it('analyzes without a summary and never derives learner understanding from assistant text',()=>{
 const result=analyzeContext(context,[]);expect(result.capture.observations).toHaveLength(1);expect(result.capture.observations[0].event.kind).toBe('problem_attempt');expect(result.coverage.exhaustiveChatAccess).toBe(false);
 expect(analyzeContext({...context,turns:[context.turns[1]]},[]).capture.observations).toHaveLength(0);
 expect(()=>analyzeContext({...context,observations:[{turnId:'assistant-turn-001',excerpt:'I explained',event:{}}]},[])).toThrow();
 expect(()=>analyzeContext({...context,observations:[{turnId:'learner-turn-001',excerpt:'Invented learner explanation',event:{}}]},[])).toThrow();
});
it('caches analysis for an hour, requires approval, ingests evidence once and changes relevant ranking transparently',async()=>{
 const f=fixtureRuntime();await f.mf.ready;
 try{
 const before=(await f.rpc('get_recommendations')).recommendations;
 const preview=await f.rpc('analyze_learning_context',context);expect(preview).toMatchObject({writePerformed:false,cache:'miss',cacheTtlSeconds:3600});
 expect((await f.rpc('get_learning_signals')).eventCount).toBe(0);
 expect(await f.rpc('analyze_learning_context',context)).toMatchObject({cache:'hit'});
 expect((await f.rpc('ingest_learning_context',context)).receipt).toMatchObject({status:'approval_required'});
 const written=await f.rpc('ingest_learning_context',{...context,approved:true});expect(written.receipt.status).toBe('stored');
 await f.rpc('ingest_learning_context',{...context,approved:true});
 expect((await f.rpc('get_learning_signals')).eventCount).toBe(1);
 expect((await f.rpc('get_learning_signals')).activeWeakConcepts).toHaveLength(0);
 const recommendations=(await f.rpc('get_recommendations'));expect(recommendations.scoringVersion).toBe('learning-v3');
 expect(recommendations.recommendations.some((r:any)=>r.components.some((c:any)=>c.factor==='explicit_discussion_question'&&c.evidenceIds.length))).toBe(true);
 for(const r of recommendations.recommendations)expect(r.score).toBe(r.components.reduce((n:number,c:any)=>n+c.points,0));
 expect(recommendations.recommendations).not.toEqual(before);
 expect((await f.rpc('get_learning_evaluation')).personalizationEvidence.status).toBe('recorded_context_available');
 expect((await f.rpc('get_learning_evaluation')).status).toBe('insufficient_evidence');
 }finally{await f.mf.dispose();}
});
it('accounts exactly for fallback and profile/session boosts',()=>{
 const s=emptySnapshot();const base=buildData(s);for(const r of base.recommendations)expect(r.score).toBe(r.components!.reduce((n,c)=>n+c.points,0));
 const focus=base.roadmap![0].itemId;for(const r of buildData(s,{focusItemId:focus}).recommendations)expect(r.score).toBe(r.components!.reduce((n,c)=>n+c.points,0));
});
it('does not turn a saved summary into personal learning evidence',()=>{
 const summary=analyzeContext({...context,coverage:'summary_only'},[]);expect(summary.capture.observations).toHaveLength(0);
 expect(()=>analyzeContext({...context,coverage:'summary_only',observations:[{turnId:'learner-turn-001',excerpt:'Why',event:{}}]},[])).toThrow();
});

it('ranks supplied pre-invocation context read-only and caps relevance after durable ingestion',async()=>{
 const f=fixtureRuntime();await f.mf.ready;
 try{
 const baseline=await f.rpc('get_recommendations');
 const contextual=await f.rpc('get_recommendations',{context});
 expect(contextual.contextPersisted).toBe(false);
 expect(contextual.contextAnalysis.coverage.learnerTurns).toBe(1);
 expect(contextual.recommendations.some((r:any)=>r.components.some((c:any)=>c.factor==='provisional_discussion_question'&&c.points===12))).toBe(true);
 expect(contextual.recommendations).not.toEqual(baseline.recommendations);
 expect((await f.rpc('get_learning_signals')).eventCount).toBe(0);
 const calls=f.state.requests.length;
 f.state.offline=true;
 expect((await f.rpc('get_session_capture_policy')).enabled).toBe(false);
 expect(f.state.requests.length).toBe(calls);
 const offline=await f.rpc('get_recommendations',{context});
 // Cached memory or local-only fallback are both valid during an outage.
 expect(offline.recommendations).toEqual(contextual.recommendations);
 f.state.offline=false;
 const summary=await f.rpc('get_recommendations',{context:{...context,coverage:'summary_only'}});
 expect(summary.recommendations).toEqual(baseline.recommendations);
 await f.rpc('ingest_learning_context',{...context,approved:true});
 const saved=await f.rpc('get_recommendations',{context});
 for(const r of saved.recommendations){
 expect(r.score).toBe(r.components.reduce((n:number,c:any)=>n+c.points,0));
 expect(r.components.filter((c:any)=>['explicit_discussion_question','provisional_discussion_question'].includes(c.factor))).toHaveLength(1);
 }
 expect((await f.rpc('get_learning_signals')).eventCount).toBe(1);
 }finally{await f.mf.dispose();}
});

it('keeps policy and contextual recommendations available during an upstream outage',async()=>{
 const f=fixtureRuntime();await f.mf.ready;f.state.offline=true;
 try{
 expect((await f.rpc('get_session_capture_policy')).enabled).toBe(false);
 const response=await f.rpc('get_recommendations',{context});
 expect(response.memoryContext.status).toBe('unavailable');
 expect(response.personalization.status).toBe('provisional_discussion_context');
 expect(response.recommendations.some((r:any)=>r.components.some((c:any)=>c.factor==='provisional_discussion_question'))).toBe(true);
 expect((await f.rpc('get_learning_signals')).eventCount).toBe(0);
 }finally{await f.mf.dispose();}
});
