import type {LearningEventRecord} from './learning-events';
/** Explicit, explainable learning diagnosis. It never guesses a mistake from an AC verdict. */
export type Reflection={
  itemId:string; reviewedAt:string; grade:number;
  mistakeClass:string|null; hintStage:string|null; confidence:number|null
};
export type Weakness={
  pattern:string; occurrences:number; lowRecall:number; hintDependent:number;
  affectedProblems:number; lastObservedAt:string|null; recommendation:string
};
const advice:Record<string,string>={
 "conceptual-understanding":"Distinguish the structure's definition from the property required by the problem; test one counterexample before coding.",
 "base-case":"Write the stopping condition before recursive steps and test the smallest input.",
 "boundary":"Trace first, last, empty and single-item cases before coding.",
 "invariant":"State what remains true after every iteration or recursive call.",
 "complexity":"Compare brute force and optimized constraints before selecting a data structure.",
 "data-structure":"Explain why the chosen structure supports the required operations.",
 "implementation":"Dry-run your code with a minimal counterexample before submitting.",
 "pattern-selection":"Compare two candidate techniques and identify the deciding property.",
 "other":"Review the original reasoning, then solve a related transfer problem."
};
export const MISTAKE_CLASSES=Object.keys(advice);
export const HINT_STAGES=["none","gentle","deeper","solution"] as const;
export function diagnoseWeaknesses(rows:Reflection[],limit=5,events:LearningEventRecord[]=[]):Weakness[]{
 const groups=new Map<string,{occurrences:number;lowRecall:number;hintDependent:number;ids:Set<string>;lastObservedAt:string|null}>();
 const seen=new Set<string>();
 for(const r of rows){
   if(!r.itemId || !Number.isInteger(r.grade) || r.grade<0 || r.grade>5)continue;
   if(!r.mistakeClass || !(r.mistakeClass in advice))continue;
   const key=`${r.itemId}|${r.reviewedAt}|${r.mistakeClass}`;
   if(seen.has(key))continue;
   seen.add(key);
   const g=groups.get(r.mistakeClass)??{occurrences:0,lowRecall:0,hintDependent:0,ids:new Set<string>(),lastObservedAt:null};
   g.occurrences++;
   if(r.grade<=2)g.lowRecall++;
   if(r.hintStage && r.hintStage!=="none")g.hintDependent++;
   g.ids.add(r.itemId);
   if(Number.isFinite(Date.parse(r.reviewedAt)) && (!g.lastObservedAt || r.reviewedAt>g.lastObservedAt))g.lastObservedAt=r.reviewedAt;
   groups.set(r.mistakeClass,g);
 }
 // Approved reasoning observations have no recall grade. Count their explicit
 // difficulty without inventing one or treating later insights as mistakes.
 for(const e of events){
   if(!e.mistakeClass||!(e.mistakeClass in advice)||!Number.isFinite(Date.parse(e.recordedAt)))continue;
   const struggling=e.kind==='mistake'||e.kind==='recall_check'&&e.confidence!==null&&e.confidence<=2||e.kind==='transfer_attempt'&&e.independentlyExplained===false;
   const problem=e.itemId??e.problemRef;
   if(!struggling||!problem||seen.has('event:'+e.clientEventId))continue;
   seen.add('event:'+e.clientEventId);
   const g=groups.get(e.mistakeClass)??{occurrences:0,lowRecall:0,hintDependent:0,ids:new Set<string>(),lastObservedAt:null};
   g.occurrences++;
   if(e.hintStage&&e.hintStage!=='none')g.hintDependent++;
   g.ids.add(problem);
   if(!g.lastObservedAt||e.recordedAt>g.lastObservedAt)g.lastObservedAt=e.recordedAt;
   groups.set(e.mistakeClass,g);
 }
 const bound=Number.isInteger(limit)?Math.max(0,Math.min(limit,20)):5;
 return [...groups.entries()].map(([pattern,g])=>({
   pattern,occurrences:g.occurrences,lowRecall:g.lowRecall,hintDependent:g.hintDependent,
   affectedProblems:g.ids.size,lastObservedAt:g.lastObservedAt,recommendation:advice[pattern]
 })).sort((a,b)=>(b.lowRecall*3+b.hintDependent+b.occurrences)-(a.lowRecall*3+a.hintDependent+a.occurrences)
   || a.pattern.localeCompare(b.pattern)).slice(0,bound);
}

