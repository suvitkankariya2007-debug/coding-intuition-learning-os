import {it,expect} from 'vitest';
import {parseLearningEvent,weaknessEvidenceSequence} from '../../src/lib/learning-events';
import {buildData,emptySnapshot} from '../src/learning';
import {recommendationHistory} from '../src/recommendation-history';
import {matchQuestionToProblem} from '../../src/lib/recommendation-relevance';
import {rankWithReasoning} from '../../src/lib/reasoning-ranking';
const event=(id:string,ref:string,kind:string,day:number,extra:Record<string,unknown>={})=>({...parseLearningEvent({clientEventId:id,problemRef:ref,kind,summary:kind==='mistake'?'I checked only the immediate children.':'I explained the inherited ancestor bounds.',conceptKeys:['bst-ordering'],origin:'chatgpt',...extra}),recordedAt:`2026-10-${String(day).padStart(2,'0')}T00:00:00Z`});
it('chains past difficulty to related recommendations and removes resolved evidence from the weakness component',()=>{
 const s=emptySnapshot();s.events=[event('past-mistake-001','lc:98','mistake',20),event('other-mistake-001','manual:other-bst','mistake',21)];
 const first=buildData(s);const before=first.recommendations.find(r=>r.components?.some(c=>c.factor==='active_weak_concepts'))!;expect(before).toBeDefined();
 expect(before.components?.find(c=>c.factor==='active_weak_concepts')?.evidenceIds).toEqual(expect.arrayContaining(['past-mistake-001','other-mistake-001']));
 s.events.push(event('later-insight-001','lc:98','reasoning_insight',22,{independentlyExplained:true,hintStage:'none'}));
 const after=buildData(s),history=recommendationHistory(s,after,[{problemRef:'lc:98',conceptKeys:['bst-ordering'],evidenceId:'current-chat:bst-turn'}]);
 const chain=history.find(r=>r.history.some(e=>e.eventId==='past-mistake-001'))!;
 expect(chain.history.map(e=>e.eventId)).toEqual(['past-mistake-001','other-mistake-001','later-insight-001']);
 expect(chain.activeDifficultyEvidenceIds).toEqual(['other-mistake-001']);expect(chain.currentDiscussion).toHaveLength(1);
 for(const r of after.recommendations){const component=r.components?.find(c=>c.factor==='active_weak_concepts');if(component)expect(component.evidenceIds).toEqual(['other-mistake-001']);expect(r.score).toBe(r.components!.reduce((sum,c)=>sum+c.points,0));}
});
it('does not erase another problem difficulty or inflate history on duplicate events',()=>{
 const old=event('problem-mistake-001','lc:98','mistake',20),other=event('problem-insight-001','manual:other-bst','reasoning_insight',21,{independentlyExplained:true,hintStage:'none'});
 const chain=weaknessEvidenceSequence([other,old,old]);expect(chain.timeline).toHaveLength(2);expect(chain.activeEvents.map(e=>e.clientEventId)).toEqual(['problem-mistake-001']);
});
it('treats a learner question as history relevance without claiming a demonstrated weakness',()=>{
 const s=emptySnapshot();s.events=[event('question-only-001','lc:98','problem_attempt',20,{summary:'Explicit learner question: Why are ancestor bounds necessary?',source:{kind:'current_chat',role:'learner',sessionId:'history-session-001',turnId:'history-turn-001',excerpt:'Why are ancestor bounds necessary?'}})];
 const data=buildData(s),chains=recommendationHistory(s,data);
 expect(chains.some(c=>c.history.length>0)).toBe(true);expect(chains.every(c=>c.activeDifficultyEvidenceIds.length===0)).toBe(true);
});

it('keeps staircase relevance specific and chains only matching historical weakness to practice',()=>{
 const question={problemRef:'manual:count-staircase',conceptKeys:['hash-lookup','subarray-enumeration','frequency-invariant','incremental-counting'],evidenceId:'current-chat:staircase-turn-001'};
 const staircase={itemId:'staircase-item',problemRef:'manual:count-staircase',title:'Count Staircase',topic:'Arrays',idea:'hash-lookup',status:'not_started',position:1};
 const fixedBounds={itemId:'fixed-bounds-item',problemRef:'lc:2444',title:'Count Subarrays With Fixed Bounds',topic:'Arrays',idea:'subarray-enumeration sliding-window',status:'not_started',position:2};
 const twoSum={itemId:'two-sum-item',problemRef:'lc:1',title:'Two Sum',topic:'Arrays',idea:'hash-lookup',status:'not_started',position:3};
 const lru={itemId:'lru-item',problemRef:'lc:146',title:'LRU Cache',topic:'Design',idea:'hash-lookup',status:'not_started',position:4};
 expect(matchQuestionToProblem(staircase,question)?.matchType).toBe('same_problem');
 expect(matchQuestionToProblem(fixedBounds,question)).toMatchObject({matchType:'curated_transfer',matchedConcepts:['subarray-enumeration','incremental-counting']});
 expect(matchQuestionToProblem(twoSum,question)).toBeNull();
 expect(matchQuestionToProblem(lru,question)).toBeNull();

 const mistake=event('staircase-frequency-mistake','manual:count-staircase','mistake',20,{summary:'I accepted an invalid frequency pattern before checking every subarray.',conceptKeys:['hash-lookup']});
 const rec=(p:typeof staircase)=>({itemId:p.itemId,title:p.title,score:10,components:[{factor:'new_problem_or_code_only',points:10,evidenceIds:[]}],reason:[],evidence:{accepted:0,rejected:0,codeFiles:0,latestAt:null}});
 const ranked=rankWithReasoning([rec(staircase),rec(fixedBounds),rec(twoSum),rec(lru)],[staircase,fixedBounds,twoSum,lru],[mistake]);
 expect(ranked.find(r=>r.itemId==='staircase-item')?.components?.some(c=>c.factor==='active_weak_concepts')).toBe(true);
 expect(ranked.find(r=>r.itemId==='fixed-bounds-item')?.components?.some(c=>c.factor==='active_weak_concepts')).toBe(true);
 expect(ranked.find(r=>r.itemId==='two-sum-item')?.components?.some(c=>c.factor==='active_weak_concepts')).toBe(false);
 expect(ranked.find(r=>r.itemId==='lru-item')?.components?.some(c=>c.factor==='active_weak_concepts')).toBe(false);
 for(const r of ranked)expect(r.score).toBe(r.components!.reduce((sum,c)=>sum+c.points,0));
 const chains=recommendationHistory({events:[mistake]} as any,{roadmap:[staircase,fixedBounds,twoSum,lru],recommendations:ranked} as any,[question]);
 expect(chains.find(c=>c.problemRef==='lc:2444')?.history.map(e=>e.eventId)).toContain('staircase-frequency-mistake');
 expect(chains.find(c=>c.problemRef==='lc:2444')?.currentDiscussion[0]).toMatchObject({matchType:'curated_transfer',evidenceId:question.evidenceId});
 expect(chains.find(c=>c.problemRef==='lc:1')?.history).toHaveLength(0);
 expect(chains.find(c=>c.problemRef==='lc:1')?.currentDiscussion).toHaveLength(0);
});
