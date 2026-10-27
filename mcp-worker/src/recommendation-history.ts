import {inferCurriculumConcepts} from '../../src/lib/concept-graph';
import {effectiveLearningConcepts,weaknessEvidenceSequence} from '../../src/lib/learning-events';
import {learningEventMatchesProblem,matchQuestionToProblem} from '../../src/lib/recommendation-relevance';
import type {Snapshot} from './learning';
import type {ToolData} from '../../src/lib/mcp-core';
export function recommendationHistory(snapshot:Snapshot,data:ToolData,questions:{problemRef:string;conceptKeys:string[];evidenceId:string}[]=[]){
 const roadmap=data.roadmap??[],refs=Object.fromEntries(roadmap.filter(p=>p.problemRef).map(p=>[p.itemId,p.problemRef!]));
 const sequence=weaknessEvidenceSequence(snapshot.events,refs);
 return data.recommendations.map(r=>{
  const p=roadmap.find(p=>p.itemId===r.itemId)!;
  const concepts=inferCurriculumConcepts({...p,problemRef:p.problemRef});
  const relevant=sequence.timeline.filter(e=>learningEventMatchesProblem(p,e,refs));
  const scoringIds=new Set((r.components??[]).flatMap(c=>c.evidenceIds));
  const relatedQuestions=questions.flatMap(q=>{const match=matchQuestionToProblem(p,q);return match?[{...q,matchType:match.matchType,matchedConcepts:match.matchedConcepts}]:[];});
  const activeIds=new Set(sequence.activeEvents.filter(e=>learningEventMatchesProblem(p,e,refs)).map(e=>e.clientEventId));
  return {itemId:r.itemId,problemRef:p.problemRef,matchedConcepts:concepts,currentDiscussion:relatedQuestions,
   historyCount:relevant.length,historyTruncated:relevant.length>12,
   history:relevant.slice(-12).map(e=>({eventId:e.clientEventId,recordedAt:e.recordedAt,problemRef:e.problemRef??(e.itemId?refs[e.itemId]:null),kind:e.kind,summary:e.summary,conceptKeys:e.conceptKeys,derivedConceptKeys:effectiveLearningConcepts(e,refs),activeDifficulty:activeIds.has(e.clientEventId),usedInScore:scoringIds.has(e.clientEventId),source:e.source?{kind:e.source.kind,documentId:e.source.documentId,sessionId:e.source.sessionId,turnId:e.source.turnId}:null})),
   activeDifficultyEvidenceIds:[...activeIds],scoreEvidenceIds:[...scoringIds],basis:relevant.length?'confirmed_learning_history':relatedQuestions.length?'temporary_discussion_only':'curriculum_or_other_evidence',interpretation:'Chronological learner records; questions alone are not weaknesses. Later independent reasoning can reduce earlier difficulty on the same problem and concept. This is not proof of mastery.'};
 });
}
