import {inferCurriculumConcepts,type ConceptProblem} from "./concept-graph";
import {deriveLearningSignals,weaknessEvidenceSequence,type LearningEventRecord} from "./learning-events";
import type {Recommendation} from "./evidence-intelligence";
/** Ranks SRS work using learner-reported weak techniques, never fabricated accepted verdicts. */
export function rankWithReasoning(base:Recommendation[],roadmap:ConceptProblem[],events:LearningEventRecord[]):Recommendation[]{
 const weaknesses=new Map(deriveLearningSignals(events,Object.fromEntries(roadmap.filter(p=>p.problemRef).map(p=>[p.itemId,p.problemRef!]))).activeWeakConcepts.map(x=>[x.concept,x.count]));
 if(!weaknesses.size)return base;
 const sequence=weaknessEvidenceSequence(events,Object.fromEntries(roadmap.filter(p=>p.problemRef).map(p=>[p.itemId,p.problemRef!])));
 const items=new Map(roadmap.map(p=>[p.itemId,p]));
 return base.map(rec=>{
  const p=items.get(rec.itemId);
  if(!p)return rec;
  const explicit=events.filter(e=>e.itemId===p.itemId||p.problemRef&&e.problemRef===p.problemRef).flatMap(e=>e.conceptKeys);
  const relevant=[...new Set([...inferCurriculumConcepts(p),...explicit])].filter(k=>weaknesses.has(k));
  if(!relevant.length)return rec;
  const weight=Math.min(35,relevant.reduce((sum,k)=>sum+Math.min(12,(weaknesses.get(k)??0)*6),0));
  return {...rec,score:rec.score+weight,components:[...(rec.components??[]),{factor:'active_weak_concepts',points:weight,evidenceIds:[...new Set(relevant.flatMap(k=>[...sequence.activeByProblemConcept.entries()].filter(([key])=>key.endsWith('|'+k)).flatMap(([,rows])=>rows.map(e=>e.clientEventId))))]}],reason:[...rec.reason,
   "Practice transfer of learner-reported weak technique(s): "+relevant.join(", ")+" (self-report, not verified mastery)"]};
 }).sort((a,b)=>b.score-a.score||a.itemId.localeCompare(b.itemId));
}

