import {it,expect} from 'vitest';
import {parseLearningEvent,weaknessEvidenceSequence} from '../../src/lib/learning-events';
import {buildData,emptySnapshot} from '../src/learning';
import {recommendationHistory} from '../src/recommendation-history';
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
