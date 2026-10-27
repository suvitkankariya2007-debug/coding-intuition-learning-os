import {inferCurriculumConcepts} from '../../src/lib/concept-graph';
import {weaknessEvidenceSequence} from '../../src/lib/learning-events';
import type {Snapshot} from './learning';
import type {ToolData} from '../../src/lib/mcp-core';
export function recommendationHistory(snapshot:Snapshot,data:ToolData,questions:{problemRef:string;conceptKeys:string[];evidenceId:string}[]=[]){
 const roadmap=data.roadmap??[],refs=Object.fromEntries(roadmap.filter(p=>p.problemRef).map(p=>[p.itemId,p.problemRef!]));
 const sequence=weaknessEvidenceSequence(snapshot.events,refs);
 return data.recommendations.map(r=>{
  const p=roadmap.find(p=>p.itemId===r.itemId)!;
  const concepts=inferCurriculumConcepts(p);
  const relevant=sequence.timeline.filter(e=>e.itemId===r.itemId||e.problemRef===p.problemRef||e.conceptKeys.some(k=>concepts.includes(k)));
  const scoringIds=new Set((r.components??[]).flatMap(c=>c.evidenceIds));
  const relatedQuestions=questions.filter(q=>q.problemRef===p.problemRef||q.conceptKeys.some(k=>concepts.some(c=>c===k)));
  const activeIds=new Set([...sequence.activeByProblemConcept.entries()].filter(([key])=>concepts.some(k=>key.endsWith('|'+k))).flatMap(([,rows])=>rows.map(e=>e.clientEventId)));
  return {itemId:r.itemId,problemRef:p.problemRef,matchedConcepts:concepts,currentDiscussion:relatedQuestions,
   historyCount:relevant.length,historyTruncated:relevant.length>12,
   history:relevant.slice(-12).map(e=>({eventId:e.clientEventId,recordedAt:e.recordedAt,problemRef:e.problemRef??(e.itemId?refs[e.itemId]:null),kind:e.kind,summary:e.summary,conceptKeys:e.conceptKeys,activeDifficulty:activeIds.has(e.clientEventId),usedInScore:scoringIds.has(e.clientEventId),source:e.source?{kind:e.source.kind,documentId:e.source.documentId,sessionId:e.source.sessionId,turnId:e.source.turnId}:null})),
   activeDifficultyEvidenceIds:[...activeIds],scoreEvidenceIds:[...scoringIds],basis:relevant.length?'confirmed_learning_history':relatedQuestions.length?'temporary_discussion_only':'curriculum_or_other_evidence',interpretation:'Chronological learner records; questions alone are not weaknesses. Later independent reasoning can reduce earlier difficulty on the same problem and concept. This is not proof of mastery.'};
 });
}
