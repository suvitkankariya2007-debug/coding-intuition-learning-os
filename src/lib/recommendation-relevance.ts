import {inferCurriculumConcepts,specificConceptOverlap,type ConceptKey} from "./concept-graph";
import {effectiveLearningConcepts,type LearningEventRecord} from "./learning-events";

export type QuestionSignal={problemRef:string;conceptKeys:string[];evidenceId:string};
export type QuestionMatch={evidenceId:string;matchType:"same_problem"|"curated_transfer"|"specific_concept";matchedConcepts:ConceptKey[]};
export type RelevanceProblem={itemId?:string;problemRef?:string;title:string;topic:string;idea?:string|null};

const PROBLEM_TRANSFERS=[
 {from:"manual:count-staircase",to:"lc:2444",concepts:["subarray-enumeration","incremental-counting"] as ConceptKey[],reason:"related contiguous-subarray counting with incrementally maintained state"}
] as const;
export function curatedProblemTransfer(sourceRef:string|null|undefined,targetRef:string|null|undefined){
 if(!sourceRef||!targetRef)return null;
 return PROBLEM_TRANSFERS.find(x=>x.from===sourceRef&&x.to===targetRef||x.to===sourceRef&&x.from===targetRef)??null;
}

/** Exact problem references win; cross-problem boosts require a specific shared concept. */
export function matchQuestionToProblem(problem:RelevanceProblem,question:QuestionSignal):QuestionMatch|null{
 if(!!problem.problemRef&&question.problemRef===problem.problemRef)return {evidenceId:question.evidenceId,matchType:"same_problem",matchedConcepts:[]};
 const transfer=curatedProblemTransfer(question.problemRef,problem.problemRef);
 if(transfer)return {evidenceId:question.evidenceId,matchType:"curated_transfer",matchedConcepts:[...transfer.concepts]};
 const overlap=specificConceptOverlap(question.conceptKeys,inferCurriculumConcepts(problem));
 return overlap.length?{evidenceId:question.evidenceId,matchType:"specific_concept",matchedConcepts:overlap}:null;
}

/** Reuse the same strict relationship rule for chronology and evidence attribution. */
export function learningEventMatchesProblem(problem:RelevanceProblem,event:LearningEventRecord,problemRefs:Record<string,string>={}):boolean{
 if(!!problem.itemId&&event.itemId===problem.itemId||!!problem.problemRef&&!!event.problemRef&&event.problemRef===problem.problemRef)return true;
 if(curatedProblemTransfer(event.problemRef,problem.problemRef))return true;
 return specificConceptOverlap(effectiveLearningConcepts(event,problemRefs),inferCurriculumConcepts(problem)).length>0;
}
