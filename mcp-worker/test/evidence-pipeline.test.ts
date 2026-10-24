import {it,expect} from 'vitest';
import {parseLearningEvent,deriveLearningSignals} from '../../src/lib/learning-events';
import {evaluateLearning} from '../src/learning-evaluation';
import {emptySnapshot} from '../src/learning';
// @ts-ignore Native fixture; no real memory or credentials.
import {fixtureRuntime} from '../scripts/demo-fixture.mjs';
const event={clientEventId:'evidence-event-001',problemRef:'lc:98',kind:'mistake',summary:'I compared only the immediate child rather than inherited bounds.',conceptKeys:['bst-ordering'],hintStage:'none',origin:'chatgpt'};
it('validates learner roles, stable current-chat identifiers and secrets',()=>{
 const source={kind:'current_chat',role:'learner',sessionId:'session-one',turnId:'turn-one',excerpt:'I checked only the child node.'};
 expect(parseLearningEvent({...event,source}).source).toEqual(source);
 for(const role of ['assistant','unknown'])expect(()=>parseLearningEvent({...event,source:{...source,role}})).toThrow();
 expect(()=>parseLearningEvent({...event,source:{...source,turnId:undefined}})).toThrow();
 expect(()=>parseLearningEvent({...event,summary:'api_key=secretvalue123456789'})).toThrow();
 const e={...parseLearningEvent({...event,source}),recordedAt:'2026-10-22T00:00:00Z'};
 expect(deriveLearningSignals([e,{...e,clientEventId:'evidence-event-002'}]).eventCount).toBe(1);
});
it('retrieves upstream profile/summaries, preserves verified sources and suppresses repeated evidence under new IDs',async()=>{
 const f=fixtureRuntime();await f.mf.ready;
 try{
 const context=await f.rpc('get_memory_patterns',{query:'ancestor bounds'});
 expect(JSON.stringify(context)).toContain('C++ and progressive hints');expect(JSON.stringify(context)).toContain('Fixture BST discussion');
 const page=await f.rpc('read_saved_discussion',{documentId:'discussion-1',limit:1000});
 const source={kind:'saved_discussion',role:'learner',documentId:'discussion-1',version:page.version,start:0,excerpt:page.content.split('\n')[0]};
 expect(await f.rpc('record_reasoning_event',{...event,source})).toMatchObject({status:'stored'});
 expect(await f.rpc('record_reasoning_event',{...event,clientEventId:'evidence-event-002',source})).toMatchObject({status:'duplicate_evidence',writePerformed:false});
 const saved=JSON.parse(f.state.documents.at(-1).content);expect(saved.event.source).toEqual(source);
 const bad={...source,start:Array.from(page.content.split('\n')[0]+'\n').length,excerpt:page.content.split('\n')[1]};
 await expect(f.rpc('record_reasoning_event',{...event,clientEventId:'evidence-event-003',source:bad})).rejects.toThrow();
 await expect(f.rpc('record_reasoning_event',{...event,clientEventId:'evidence-event-004',source:{...source,excerpt:'User: Why',version:'stale'}})).rejects.toThrow();
 expect(await f.rpc('get_learning_evaluation')).toMatchObject({status:'insufficient_evidence'});
 }finally{await f.mf.dispose();}
});
it('requires delayed, source-linked, unhinted attempts and reports coverage without inventing improvement',()=>{
 const s=emptySnapshot();const parsed=parseLearningEvent(event);s.events=[{...parsed,recordedAt:'2026-10-21T00:00:00Z'}];
 const source={kind:'current_chat' as const,role:'learner' as const,sessionId:'session-2',turnId:'turn-2',excerpt:'I reconstructed the bounds without a hint.'};
 s.events.push({...parsed,source,clientEventId:'recall-event-001',kind:'recall_check',hintStage:'none',independentlyExplained:true,recordedAt:'2026-10-23T00:00:00Z'});
 s.events.push({...s.events[1],clientEventId:'hinted-event-001',hintStage:'gentle'});
 expect(evaluateLearning(s).delayedRecall.later).toEqual({attempts:1,reportedIndependent:1});
 expect(evaluateLearning(s).status).toBe('insufficient_evidence');
});
