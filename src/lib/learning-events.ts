import {CONCEPT_KEYS,type ConceptKey} from "./concept-graph";
import {MISTAKE_CLASSES,HINT_STAGES} from "./learning-diagnosis";
/** Explicit, bounded reasoning observations. No raw uploaded problem text or chat logs. */
export const LEARNING_EVENT_KINDS=["problem_attempt","reasoning_insight","mistake","approach_comparison","transfer_attempt","recall_check"] as const;
export type LearningEventKind=typeof LEARNING_EVENT_KINDS[number];
export type DiscussionSource={kind:"saved_discussion"|"current_chat";role:"learner"|"assistant"|"unknown";excerpt:string;documentId?:string;version?:string;start?:number;sessionId?:string;turnId?:string};
export function evidenceIdentity(source:DiscussionSource){return JSON.stringify([source.kind,source.documentId??source.sessionId,source.start??source.turnId,source.excerpt.normalize("NFC").trim()]);}
export type LearningEventInput={
 source?:DiscussionSource;
 clientEventId:string;itemId:string|null;problemRef:string|null;kind:LearningEventKind;summary:string;
 conceptKeys:ConceptKey[];mistakeClass:string|null;hintStage:string|null;confidence:number|null;
 independentlyExplained:boolean|null;origin:"chatgpt"|"app";
};
export type LearningEventRecord=LearningEventInput & {recordedAt:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const eventId=/^[A-Za-z0-9:_-]{8,100}$/;
const reference=/^(lc:[0-9]{1,7}|cf:[0-9]{1,9}[A-Za-z0-9]{1,5}|manual:[a-z0-9][a-z0-9-]{2,95})$/;
const object=(x:unknown):Record<string,unknown>|null=>x!==null&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:null;
export function parseLearningEvent(raw:unknown):LearningEventInput{
 const a=object(raw);if(!a)throw Error("Invalid learning event");
 const allowed=["clientEventId","itemId","problemRef","kind","summary","conceptKeys","mistakeClass","hintStage","confidence","independentlyExplained","origin","source"];
 if(Object.keys(a).some(k=>!allowed.includes(k)))throw Error("Unsupported event field");
 if(typeof a.clientEventId!=="string"||!eventId.test(a.clientEventId))throw Error("Invalid idempotency key");
 const item=a.itemId??null,ref=a.problemRef??null;
 if(item!==null&&(typeof item!=="string"||!uuid.test(item)))throw Error("Invalid roadmap item");
 if(ref!==null&&(typeof ref!=="string"||!reference.test(ref)))throw Error("Invalid external problem reference");
 if(!item&&!ref)throw Error("Problem reference or roadmap item required");
 if(!LEARNING_EVENT_KINDS.includes(a.kind as LearningEventKind))throw Error("Invalid event kind");
 if(typeof a.summary!=="string"||a.summary.trim().length<10||a.summary.trim().length>700||/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(a.summary))throw Error("Invalid summary");
 if(a.origin!=="chatgpt"&&a.origin!=="app")throw Error("Invalid source");
 const keys=a.conceptKeys??[];
 if(!Array.isArray(keys)||keys.length>6||new Set(keys).size!==keys.length||keys.some(k=>typeof k!=="string"||!CONCEPT_KEYS.includes(k as ConceptKey)))throw Error("Invalid concept tags");
 const mistake=a.mistakeClass??null;
 if(mistake!==null&&(typeof mistake!=="string"||!MISTAKE_CLASSES.includes(mistake)))throw Error("Invalid mistake");
 const hint=a.hintStage??null;
 if(hint!==null&&(typeof hint!=="string"||!HINT_STAGES.includes(hint as typeof HINT_STAGES[number])))throw Error("Invalid hint stage");
 const confidence=a.confidence??null;
 if(confidence!==null&&(!Number.isInteger(confidence)||Number(confidence)<1||Number(confidence)>5))throw Error("Invalid confidence");
 const independent=a.independentlyExplained??null;
 if(independent!==null&&typeof independent!=="boolean")throw Error("Invalid self-report");
 let source:DiscussionSource|undefined;
 if(a.source!==undefined){
  const v=object(a.source);if(!v||Object.keys(v).some(k=>!["kind","role","excerpt","documentId","version","start","sessionId","turnId"].includes(k))||!["saved_discussion","current_chat"].includes(String(v.kind))||!["learner","assistant","unknown"].includes(String(v.role))||typeof v.excerpt!=="string"||!v.excerpt.trim()||v.excerpt.length>700)throw Error("Invalid discussion evidence");
  const id=(x:unknown)=>typeof x==="string"&&/^[A-Za-z0-9:_-]{1,200}$/.test(x);
  if(v.kind==="saved_discussion"&&(!id(v.documentId)||!id(v.version)||!Number.isInteger(v.start)||Number(v.start)<0||Number(v.start)>10000000))throw Error("Saved evidence needs version and offset");
  if(v.kind==="current_chat"&&(!id(v.sessionId)||!id(v.turnId)))throw Error("Current evidence needs stable session and turn IDs");
  if(v.role!=="learner")throw Error("Only learner statements can become learning events");
  source=v as unknown as DiscussionSource;
 }
 if(/(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|-----BEGIN .*PRIVATE KEY-----|(?:api[_ -]?key|password|access[_ -]?token)\s*[:=]\s*\S{8,})/i.test(a.summary+" "+(source?.excerpt??"")))throw Error("Remove secrets before saving");
 return {...(source?{source}:{}),clientEventId:a.clientEventId,itemId:item as string|null,problemRef:ref as string|null,kind:a.kind as LearningEventKind,summary:a.summary.trim(),conceptKeys:keys as ConceptKey[],mistakeClass:mistake as string|null,hintStage:hint as string|null,confidence:confidence as number|null,independentlyExplained:independent as boolean|null,origin:a.origin};
}
export function deriveLearningSignals(events:LearningEventRecord[],problemRefs:Record<string,string>={}){
 const evidenceSeen=new Set<string>();
 const seen=new Set<string>(),weak=new Map<ConceptKey,number>(),mistakes=new Map<string,number>();
 const active=new Map<string,{concept:ConceptKey;count:number}>();
 let hintDependent=0,reportedIndependent=0;const observedRefs:string[]=[];
 for(const e of events.slice().sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt))){
  if(!eventId.test(e.clientEventId)||seen.has(e.clientEventId)||!Number.isFinite(Date.parse(e.recordedAt)))continue;
  if(e.source){const identity=evidenceIdentity(e.source);if(evidenceSeen.has(identity))continue;evidenceSeen.add(identity);}
  seen.add(e.clientEventId);
  if(e.problemRef&&!observedRefs.includes(e.problemRef))observedRefs.push(e.problemRef);
  const struggling=e.kind==="mistake"||e.kind==="recall_check"&&e.confidence!==null&&e.confidence<=2||e.kind==="transfer_attempt"&&e.independentlyExplained===false;
  for(const k of new Set(e.conceptKeys))if(CONCEPT_KEYS.includes(k)){
   const key=(e.problemRef??(e.itemId?problemRefs[e.itemId]:null)??e.itemId??'unknown')+'|'+k,row=active.get(key)??{concept:k,count:0};
   if(struggling){weak.set(k,(weak.get(k)??0)+1);row.count++;}
   else if(e.independentlyExplained===true&&['reasoning_insight','recall_check','transfer_attempt'].includes(e.kind)&&(!e.hintStage||e.hintStage==='none'))row.count=Math.max(0,row.count-1);
   active.set(key,row);
  }
  if(e.mistakeClass)mistakes.set(e.mistakeClass,(mistakes.get(e.mistakeClass)??0)+1);
  if(e.hintStage&&e.hintStage!=="none")hintDependent++;
  if(e.independentlyExplained===true)reportedIndependent++;
 }
 const activeCounts=new Map<ConceptKey,number>();for(const row of active.values())if(row.count)activeCounts.set(row.concept,(activeCounts.get(row.concept)??0)+row.count);
 return {eventCount:seen.size,weakConcepts:[...weak].map(([concept,count])=>({concept,count})).sort((a,b)=>b.count-a.count||a.concept.localeCompare(b.concept)),activeWeakConcepts:[...activeCounts].map(([concept,count])=>({concept,count})).sort((a,b)=>b.count-a.count||a.concept.localeCompare(b.concept)),
 mistakeCounts:[...mistakes].map(([mistakeClass,count])=>({mistakeClass,count})).sort((a,b)=>b.count-a.count||a.mistakeClass.localeCompare(b.mistakeClass)),
 hintDependent,selfReportedIndependent:reportedIndependent,problemRefs:observedRefs.slice(0,20)};
}


/** Reconstruct the same per-problem chronology as activeWeakConcepts, retaining its evidence. */
export function weaknessEvidenceSequence(events:LearningEventRecord[],problemRefs:Record<string,string>={}){
 const ids=new Set<string>(),sources=new Set<string>();
 const active=new Map<string,LearningEventRecord[]>(),timeline:LearningEventRecord[]=[];
 for(const e of events.slice().sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt))){
  if(!eventId.test(e.clientEventId)||ids.has(e.clientEventId)||!Number.isFinite(Date.parse(e.recordedAt))||e.source&&e.source.role!=='learner')continue;
  if(e.source){const key=evidenceIdentity(e.source);if(sources.has(key))continue;sources.add(key);}ids.add(e.clientEventId);timeline.push(e);
  const struggling=e.kind==='mistake'||e.kind==='recall_check'&&e.confidence!==null&&e.confidence<=2||e.kind==='transfer_attempt'&&e.independentlyExplained===false;
  const improvement=e.independentlyExplained===true&&['reasoning_insight','recall_check','transfer_attempt'].includes(e.kind)&&(!e.hintStage||e.hintStage==='none');
  for(const concept of new Set(e.conceptKeys)){
   const key=(e.problemRef??(e.itemId?problemRefs[e.itemId]:null)??e.itemId??'unknown')+'|'+concept,rows=active.get(key)??[];
   if(struggling)rows.push(e);else if(improvement)rows.pop();active.set(key,rows);
  }
 }
 return {timeline,activeEvents:[...new Map([...active.values()].flat().map(e=>[e.clientEventId,e])).values()],activeByProblemConcept:active};
}
