/** Progressive guided reasoning built from user-owned curriculum learning objectives.
 * Hints are deterministic; no generative model is required to remain functional.
 */
export type HintLevel=1|2|3;
export type HintInput={title:string;topic:string;idea:string|null;level:HintLevel};
export function progressiveHint(input:HintInput):{level:HintLevel;prompt:string;revealsConcept:boolean}{
 const {title,topic,idea,level}=input;
 if(!title.trim()||!topic.trim()||![1,2,3].includes(level))throw Error("Invalid hint request");
 if(level===1)return {level,prompt:`For "${title}", identify input constraints, expected output, and the smallest test case. Which ${topic} property might help? Don't code yet.`,revealsConcept:false};
 if(level===2)return {level,prompt:`State the invariant, recurrence or data structure property that remains true for "${title}". Trace a counterexample and compare brute force with your candidate approach.`,revealsConcept:false};
 const detail=typeof idea==="string"&&idea.trim()?idea.trim():"No verified learning objective is recorded for this problem.";
 return {level,prompt:`Curriculum concept: ${detail}. Explain when this approach applies, then implement it independently and test its boundary cases.`,revealsConcept:true};
}
