import {NON_SPECIFIC_TRANSFER_CONCEPTS,inferCurriculumConcepts,type ConceptKey,type ConceptProblem} from "./concept-graph";
import {deriveLearningSignals,effectiveLearningConcepts,weaknessEvidenceSequence,type LearningEventRecord} from "./learning-events";
import {curatedProblemTransfer} from "./recommendation-relevance";
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
  const explicit=events.filter(e=>e.itemId===p.itemId||p.problemRef&&e.problemRef===p.problemRef).flatMap(e=>effectiveLearningConcepts(e,{[p.itemId]:p.problemRef??''}));
  const candidateConcepts=[...new Set([...inferCurriculumConcepts({...p,problemRef:p.problemRef}),...explicit])];
  const activeRowsFor=(concept:string)=>[...sequence.activeByProblemConcept.entries()].filter(([key,rows])=>{
   if(!rows.length||!key.endsWith('|'+concept))return false;
   if(!NON_SPECIFIC_TRANSFER_CONCEPTS.has(concept as ConceptKey))return true;
   return key===`${p.problemRef??p.itemId}|${concept}`||key===`${p.itemId}|${concept}`;
  }).flatMap(([,rows])=>rows);
  const relevant=candidateConcepts.filter(k=>weaknesses.has(k)&&activeRowsFor(k).length>0);
  const transferred=sequence.activeEvents.filter(e=>curatedProblemTransfer(e.problemRef,p.problemRef));
  if(!relevant.length&&!transferred.length)return rec;
  const points=relevant.reduce((sum,k)=>sum+Math.min(12,(weaknesses.get(k)??0)*6),0);
  const transferPoints=transferred.length&&!relevant.length?12:0;
  const weight=Math.min(35,points+transferPoints);
  const evidenceIds=[...new Set([...relevant.flatMap(k=>activeRowsFor(k).map(e=>e.clientEventId)),...transferred.map(e=>e.clientEventId)])];
  const basis=[...relevant,...(transferred.length?['curated problem transfer']:[])].join(", ");
  return {...rec,score:rec.score+weight,components:[...(rec.components??[]),{factor:'active_weak_concepts',points:weight,evidenceIds}],reason:[...rec.reason,
   "Practice transfer supported by "+basis+" (learner-reported evidence; not verified mastery)"]};
 }).sort((a,b)=>b.score-a.score||a.itemId.localeCompare(b.itemId));
}

