/** Transfer checks assess whether a learner can apply a known idea in another problem.
 * All outcomes require an explicit user reflection; submissions alone aren't mastery.
 */
export type TransferCandidate={id:string;title:string;topic:string;position:number;status:string};
export type TransferAssessment={
 sourceProblemId:string;targetProblemId:string;
 recognizedPattern:boolean;explainedInvariant:boolean;independentSolution:boolean;
 hintsUsed:number;reviewedAt:string
};
export function proposeTransferProblem(
 source:TransferCandidate, candidates:TransferCandidate[],
 excludedIds:ReadonlySet<string>=new Set()
):TransferCandidate|null{
 const topic=(value:string)=>value.trim().toLowerCase().replace(/\s+/g,' ');
 if(['external practice','unknown',''].includes(topic(source.topic)))return null;
 const eligible=candidates.filter(x=>x.id!==source.id&&topic(x.topic)===topic(source.topic)&&
   x.status==="not_started"&&!excludedIds.has(x.id));
 eligible.sort((a,b)=>Math.abs(a.position-source.position)-Math.abs(b.position-source.position) || a.position-b.position || a.id.localeCompare(b.id));
 return eligible[0]??null;
}
export function evaluateTransfer(a:TransferAssessment){
 if(a.sourceProblemId===a.targetProblemId)throw Error("Transfer requires a different problem");
 if(!Number.isInteger(a.hintsUsed)||a.hintsUsed<0||a.hintsUsed>20||
    !Number.isFinite(Date.parse(a.reviewedAt)))throw Error("Invalid transfer reflection");
 const independent=a.independentSolution&&a.hintsUsed===0&&a.recognizedPattern&&a.explainedInvariant;
 const score=Number(a.recognizedPattern)+Number(a.explainedInvariant)+Number(a.independentSolution);
 return {
   outcome:independent?"independent_transfer":score>=2?"developing_transfer":"needs_guidance",
   score,independent,
   feedback:!a.recognizedPattern?"Explain what clue identifies the underlying pattern.":
     !a.explainedInvariant?"State the invariant or recurrence before writing the solution.":
     !a.independentSolution?"Re-attempt a related problem without looking at the solution.":
     a.hintsUsed>0?"Repeat with fewer hints to confirm independent transfer.":
     "Independent transfer reported. Recheck with another unfamiliar problem later."
 };
}

