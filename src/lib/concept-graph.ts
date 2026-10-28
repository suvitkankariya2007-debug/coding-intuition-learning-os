/** Educational relationships curated by technique, not inferred proof of mastery. */
export const CONCEPTS={
 "hash-lookup":"Hash lookup","sorting":"Sorting transformations","two-pointers":"Two pointers",
 "frequency-invariant":"Frequency invariant","subarray-enumeration":"Subarray enumeration","incremental-counting":"Incremental counting",
 "sliding-window":"Sliding-window invariant","prefix-sums":"Prefix sums",
 "binary-search":"Binary search boundary","binary-search-answer":"Binary search on feasibility",
 "base-case":"Recursive base cases","dfs":"Depth-first search","bfs":"Breadth-first search",
 "backtracking":"Backtracking/pruning","dynamic-programming":"Dynamic programming state",
 "stack-invariant":"Stack invariant","monotonic-stack":"Monotonic stack",
 "greedy":"Greedy exchange proof","heap":"Priority queue","cycle-detection":"Cycle detection",
 "intervals":"Interval ordering","bitmask":"Bitwise representation","bst-ordering":"BST ancestor bounds"
} as const;
export type ConceptKey=keyof typeof CONCEPTS;
export const CONCEPT_KEYS=Object.keys(CONCEPTS) as ConceptKey[];
export type ConceptRelation="alternative"|"builds-on"|"contrasts-with"|"generalizes";
export const CONCEPT_EDGES:readonly {from:ConceptKey;to:ConceptKey;relation:ConceptRelation;question:string}[]=[
 {from:"hash-lookup",to:"two-pointers",relation:"alternative",question:"Would sorting enable two pointers? Compare time and extra space."},
 {from:"sorting",to:"two-pointers",relation:"builds-on",question:"What invariant becomes possible after sorting the input?"},
 {from:"sliding-window",to:"prefix-sums",relation:"contrasts-with",question:"Would negative values break the monotonicity needed for a window?"},
 {from:"subarray-enumeration",to:"incremental-counting",relation:"builds-on",question:"Which state can be updated as the right endpoint moves, instead of recomputing the whole subarray?"},
 {from:"frequency-invariant",to:"incremental-counting",relation:"builds-on",question:"What frequency state must hold after each new element is added?"},
 {from:"binary-search",to:"binary-search-answer",relation:"generalizes",question:"Prove the feasibility predicate is monotonic before searching the answer."},
 {from:"base-case",to:"dfs",relation:"builds-on",question:"Which smallest state ends the recursion, and what invariant survives every call?"},
 {from:"dfs",to:"backtracking",relation:"generalizes",question:"What state must be undone after exploring each choice?"},
 {from:"backtracking",to:"dynamic-programming",relation:"alternative",question:"Do recursive states repeat, and can they be memoized?"},
 {from:"bfs",to:"dfs",relation:"alternative",question:"Is the objective minimum unweighted distance or just reachability?"},
 {from:"stack-invariant",to:"monotonic-stack",relation:"generalizes",question:"What ordering invariant remains true after every push?"},
 {from:"sorting",to:"intervals",relation:"builds-on",question:"Why does sorted boundary order make overlap decisions easier?"},
 {from:"greedy",to:"dynamic-programming",relation:"contrasts-with",question:"Can you prove the local choice is safe, or must you track multiple states?"},
 {from:"heap",to:"sorting",relation:"alternative",question:"Do you need the whole sorted order or just the next best item?"},
 {from:"cycle-detection",to:"two-pointers",relation:"builds-on",question:"Why do different pointer speeds meet if a cycle exists?"}
];
const RULES:readonly {key:ConceptKey;pattern:RegExp}[]=[
 {key:"frequency-invariant",pattern:/frequency\s*(?:condition|invariant)|required\s+frequenc(?:y|ies)|frequenc(?:y|ies)\s+(?:must|should)\s+(?:be|match|equal)|count\s+frequenc(?:y|ies)/i},
 {key:"subarray-enumeration",pattern:/subarrays?|contiguous\s+(?:subarray|segment)|nested\s+loops?/i},
 {key:"incremental-counting",pattern:/incremental(?:ly)?\s+(?:count|counting|update)|running\s+(?:count|frequency)|maintain(?:ing)?\s+(?:a\s+)?(?:running\s+)?(?:count|frequency)|update\s+(?:the\s+)?(?:count|frequency)\s+as/i},
 {key:"bst-ordering",pattern:/\bbst\b|binary\s*search\s*tree|ancestor\s*(bound|constraint)|inherited\s*bound/i},
 {key:"hash-lookup",pattern:/hash\s*(map|set|table)|frequency\s*(map|count|condition|invariant)|frequencies/i},
 {key:"sorting",pattern:/sort(ing|ed)?|sorted/i},
 {key:"two-pointers",pattern:/two[\s-]?pointer|opposite[\s-]direction pointer/i},
 {key:"sliding-window",pattern:/sliding\s*window|variable\s*window|fixed[\s-]width\s*window|at[\s-]most[\s-]k/i},
 {key:"prefix-sums",pattern:/prefix\s*sum|cumulative\s*sum/i},
 {key:"binary-search-answer",pattern:/binary\s*search\s*(on\s*)?(the\s*)?answer|minimum\s*feasible\s*capacity/i},
 {key:"binary-search",pattern:/binary\s*search|lower\s*bound|upper\s*bound/i},
 {key:"base-case",pattern:/base\s*case|recursion\s*termination|stopping\s*condition/i},
 {key:"dfs",pattern:/\bdfs\b|depth[\s-]first/i},
 {key:"bfs",pattern:/\bbfs\b|breadth[\s-]first/i},
 {key:"backtracking",pattern:/backtrack|prun(e|ing)\s*(partial|state|branch)/i},
 {key:"dynamic-programming",pattern:/\bdp\b|dynamic\s*programming|memoiz|tabulat/i},
 {key:"stack-invariant",pattern:/stack\s*matching|balanced\s*parentheses|stack\s*invariant/i},
 {key:"monotonic-stack",pattern:/monotonic\s*(stack|deque)|next\s*greater\s*element/i},
 {key:"greedy",pattern:/\bgreedy\b|exchange\s*argument/i},
 {key:"heap",pattern:/min[\s-]?heap|max[\s-]?heap|priority\s*queue/i},
 {key:"cycle-detection",pattern:/floyd|fast\s*and\s*slow|slow[\s\/-]fast\s*pointer/i},
 {key:"intervals",pattern:/interval\s*(merge|sort|overlap)|overlapping\s*interval/i},
 {key:"bitmask",pattern:/bitmask|bitwise|xor\s*cancellation/i}
];
export type ConceptProblem={itemId:string;title:string;topic:string;idea?:string|null;conceptKeys?:readonly string[];catalogId?:string;status:string;position:number;problemRef?:string};
const REF_CONCEPTS:Readonly<Record<string,readonly ConceptKey[]>>={
 "manual:count-staircase":["frequency-invariant","subarray-enumeration","incremental-counting"],
 "lc:2444":["subarray-enumeration","sliding-window"]
};
/** Hash lookup is a broad tool label; sharing it alone is not enough to claim a cross-problem fit. */
export const NON_SPECIFIC_TRANSFER_CONCEPTS:ReadonlySet<ConceptKey>=new Set(["hash-lookup","subarray-enumeration","incremental-counting"]);
export function specificConceptOverlap(left:readonly string[],right:readonly string[]):ConceptKey[]{
 const rightSet=new Set(right);return [...new Set(left)].filter((key):key is ConceptKey=>CONCEPT_KEYS.includes(key as ConceptKey)&&!NON_SPECIFIC_TRANSFER_CONCEPTS.has(key as ConceptKey)&&rightSet.has(key));
}
export function inferCurriculumConcepts(p:Pick<ConceptProblem,"title"|"topic"|"idea"|"problemRef"|"conceptKeys">):ConceptKey[]{
 // The general topic is deliberately excluded: Arrays does not imply hashing.
 const description=p.title+" "+(p.idea??"");
 return [...new Set([...(p.conceptKeys??[]).filter((key):key is ConceptKey=>CONCEPT_KEYS.includes(key as ConceptKey)),...RULES.filter(r=>r.pattern.test(description)||new RegExp("(^|[^a-z-])"+r.key+"([^a-z-]|$)","i").test(description)).map(r=>r.key),...(p.problemRef?REF_CONCEPTS[p.problemRef]??[]:[])])];
}
export type ConceptConnection={
 candidate:{itemId:string;title:string;topic:string};sourceConcept:ConceptKey;targetConcept:ConceptKey;
 relation:ConceptRelation|"same-concept";question:string;score:number;basis:"curriculum-heuristic";
};
export function connectUnfamiliarProblems(source:ConceptProblem,candidates:ConceptProblem[],limit=5):ConceptConnection[]{
 const from=inferCurriculumConcepts(source);if(!from.length)return [];
 const output:ConceptConnection[]=[];
 for(const p of candidates){
  if(p.itemId===source.itemId||p.status!=="not_started")continue;
  const target=inferCurriculumConcepts(p);const matches:ConceptConnection[]=[];
  for(const a of from)for(const b of target){
   const edge=CONCEPT_EDGES.find(x=>(x.from===a&&x.to===b)||(x.from===b&&x.to===a));
   if(edge)matches.push({candidate:{itemId:p.itemId,title:p.title,topic:p.topic},sourceConcept:a,targetConcept:b,relation:edge.relation,question:edge.question,score:p.topic!==source.topic?65:45,basis:"curriculum-heuristic"});
   else if(a===b)matches.push({candidate:{itemId:p.itemId,title:p.title,topic:p.topic},sourceConcept:a,targetConcept:b,relation:"same-concept",question:"Identify the shared invariant without being shown the pattern name. What constraint differs?",score:p.topic!==source.topic?52:38,basis:"curriculum-heuristic"});
  }
  matches.sort((x,y)=>y.score-x.score||x.question.localeCompare(y.question));
  if(matches[0])output.push(matches[0]);
 }
 return output.sort((x,y)=>y.score-x.score||x.candidate.itemId.localeCompare(y.candidate.itemId)).slice(0,Math.max(0,Math.min(20,limit)));
}

