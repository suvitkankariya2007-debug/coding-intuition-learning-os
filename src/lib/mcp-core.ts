import { progressiveHint } from "./progressive-coaching";
import { proposeTransferProblem } from "./transfer-intelligence";
import { diagnoseWeaknesses,MISTAKE_CLASSES,HINT_STAGES } from "./learning-diagnosis";
import type { Recommendation } from "./evidence-intelligence";
import {connectUnfamiliarProblems,CONCEPT_KEYS,type ConceptProblem} from "./concept-graph";
import {parseLearningEvent,deriveLearningSignals,type LearningEventInput,type LearningEventRecord} from "./learning-events";

type JsonId = string | number | null;
export type McpRequest = { jsonrpc:"2.0"; id?:JsonId; method:string; params?:unknown };
export type RoadmapProblem = {
  itemId:string; title:string; topic:string; position:number; status:string; dueDate:string|null; idea?:string|null;problemRef?:string;origin?:string;catalogId?:string;conceptKeys?:string[]
};
export type ReviewRecord = {
  itemId:string; grade:number; reviewedAt:string; clientEventId?:string; mistakeClass?:string|null; hintStage?:string|null; confidence?:number|null
};
export type EvidenceRecord = {
  itemId:string|null; source:string; observedAt:string; accepted:boolean; verdict?:string|null
};
export type ToolData = {
  recommendations:Recommendation[];
  due:{itemId:string;title:string;dueDate:string}[];
  roadmap?:RoadmapProblem[];
  reviews?:ReviewRecord[];
  evidence?:EvidenceRecord[];
  memorySearch?: { namespace:string; query:string; items:{id:string;content:string;score:number}[];cache:"hit"|"miss";interpretation:"context_only_not_mastery" };
  learningEvents?:LearningEventRecord[];
};

type ToolSpec={name:string;description:string;inputSchema:{type:"object";properties:Record<string,unknown>;additionalProperties:false;required?:string[]}};
const tools:ToolSpec[] = [
  {name:"get_recommendations",description:"Get the authenticated learner's next five evidence-ranked DSA problems. Read-only.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
  {name:"get_due_reviews",description:"List up to 20 reviews due today for the authenticated learner. Read-only.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
  {name:"get_roadmap",description:"List canonical curriculum problems in order, optionally filtered by topic; up to 50 per page.",inputSchema:{type:"object",properties:{offset:{type:"integer",minimum:0,maximum:1000},limit:{type:"integer",minimum:1,maximum:50},topic:{type:"string",maxLength:80}},additionalProperties:false}},
  {name:"get_progress_report",description:"Return aggregate progress, review and verified evidence counts for this learner.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
  {name:"get_problem_history",description:"Retrieve recent review and evidence history for one curriculum item.",inputSchema:{type:"object",properties:{itemId:{type:"string",format:"uuid"}},required:["itemId"],additionalProperties:false}},
  {name:"diagnose_weaknesses",description:"Identify recurring learner-reported reasoning difficulties and provide specific corrective exercises.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
  {name:"get_transfer_problem",description:"Suggest an unfamiliar problem in the same topic, excluding solved problems.",inputSchema:{type:"object",properties:{itemId:{type:"string",format:"uuid"}},required:["itemId"],additionalProperties:false}},
  {name:"get_progressive_hint",description:"Return one grounded level of guided reasoning for a curriculum problem, without exposing code.",inputSchema:{type:"object",properties:{itemId:{type:"string",format:"uuid"},level:{type:"integer",minimum:1,maximum:3}},required:["itemId","level"],additionalProperties:false}},
  {name:"get_memory_patterns",description:"Search fresh learning preferences and notes in explicitly configured DSA Supermemory spaces. Use refresh after externally added notes; memories are context, never proof of mastery.",inputSchema:{type:"object",properties:{query:{type:"string",minLength:3,maxLength:250},refresh:{type:"boolean",description:"Bypass the one-hour cache to retrieve newly added memory now."}},required:["query"],additionalProperties:false}},
  {name:"get_concept_connections",description:"Recommend unfamiliar linked curriculum problems with a contrast question; metadata is heuristic, not proof of mastery.",inputSchema:{type:"object",properties:{itemId:{type:"string",format:"uuid"}},required:["itemId"],additionalProperties:false}},
  {name:"get_learning_signals",description:"Show the authenticated user's explicit recorded reasoning weaknesses, hint usage and self-reported insights.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
  {name:"record_reasoning_event",description:"Save a brief user-approved structured reasoning observation during tutoring. Do not record full chat transcripts, raw copyrighted problems, code, passwords or secrets. Never claims acceptance or mastery.",inputSchema:{type:"object",properties:{source:{type:"object",description:"Evidence for this learner observation. Use role learner only for an actual learner statement, not an assistant explanation. Saved sources require documentId, version and Unicode start; current-chat sources require stable sessionId and turnId. Reuse the same source for retries; it is counted only once.",properties:{kind:{type:"string",enum:["saved_discussion","current_chat"]},role:{type:"string",enum:["learner","assistant","unknown"]},excerpt:{type:"string",minLength:1,maxLength:700},documentId:{type:"string"},version:{type:"string"},start:{type:"integer",minimum:0},sessionId:{type:"string"},turnId:{type:"string"}},required:["kind","role","excerpt"],additionalProperties:false},clientEventId:{type:"string",minLength:8,maxLength:100},itemId:{type:"string",format:"uuid"},problemRef:{type:"string"},kind:{type:"string",enum:["problem_attempt","reasoning_insight","mistake","approach_comparison","transfer_attempt","recall_check"]},summary:{type:"string",minLength:10,maxLength:700},conceptKeys:{type:"array",items:{type:"string",enum:CONCEPT_KEYS},maxItems:6},mistakeClass:{type:"string",enum:MISTAKE_CLASSES},hintStage:{type:"string",enum:HINT_STAGES},confidence:{type:"integer",minimum:1,maximum:5},independentlyExplained:{type:"boolean"},origin:{type:"string",enum:["chatgpt","app"]}},required:["clientEventId","kind","summary","origin"],additionalProperties:false}},
  {name:"get_source_status",description:"Count stored evidence per coding source and report the latest observed timestamp; does not claim a live connection.",inputSchema:{type:"object",properties:{},additionalProperties:false}}
];
const success=(id:JsonId,result:unknown)=>({jsonrpc:"2.0" as const,id,result});
const failure=(id:JsonId,code:number,message:string)=>({jsonrpc:"2.0" as const,id,error:{code,message}});
const asObject=(x:unknown):Record<string,unknown>|null=>x!==null&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:null;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validateArgs(name:string,raw:unknown):Record<string,unknown>|null{
 const a=raw===undefined?{}:asObject(raw);
 if(!a)return null;
 if(name==="record_reasoning_event"){try{return parseLearningEvent(a) as unknown as Record<string,unknown>;}catch{return null;}}
 const allowed=name==="get_roadmap"?["offset","limit","topic"]:["get_problem_history","get_transfer_problem","get_concept_connections"].includes(name)?["itemId"]:name==="get_progressive_hint"?["itemId","level"]:name==="get_memory_patterns"?["query","refresh"]:[];
 if(Object.keys(a).some(k=>!allowed.includes(k)))return null;
 if(["get_problem_history","get_transfer_problem","get_concept_connections","get_progressive_hint"].includes(name) && (typeof a.itemId!=="string" || !uuid.test(a.itemId)))return null;
 if(name==="get_progressive_hint" && (![1,2,3].includes(Number(a.level)) || !Number.isInteger(a.level)))return null;
 if(name==="get_memory_patterns" && (typeof a.query!=="string" || a.query.trim().length<3 || a.query.length>250))return null;
 if(name==="get_memory_patterns" && a.refresh!==undefined && typeof a.refresh!=="boolean")return null;
 if(name==="get_roadmap"){
   if(a.offset!==undefined && (!Number.isInteger(a.offset)||Number(a.offset)<0||Number(a.offset)>1000))return null;
   if(a.limit!==undefined && (!Number.isInteger(a.limit)||Number(a.limit)<1||Number(a.limit)>50))return null;
   if(a.topic!==undefined && (typeof a.topic!=="string"||a.topic.length>80))return null;
 }
 return a;
}
function invoke(name:string,a:Record<string,unknown>,data:ToolData):unknown{
 const roadmap=data.roadmap??[];
 const reviews=data.reviews??[];
 const evidence=data.evidence??[];
 if(name==="get_recommendations")return data.recommendations.slice(0,5);
 if(name==="get_due_reviews")return data.due.slice(0,20);
 if(name==="get_roadmap"){
   const canonical=roadmap.filter(x=>!x.origin||x.origin==='curriculum');
   const subset=(typeof a.topic==="string"&&a.topic.trim()?canonical.filter(x=>x.topic.toLowerCase()===String(a.topic).trim().toLowerCase()):canonical);
   const offset=Number(a.offset??0),limit=Number(a.limit??25);
   return {total:subset.length,offset,limit,items:subset.slice(offset,offset+limit)};
 }
 if(name==="get_progress_report"){
   const byStatus:Record<string,number>={not_started:0,attempted:0,solved:0,mastered:0};
   for(const row of roadmap)byStatus[row.status]=(byStatus[row.status]??0)+1;
   return {curriculumCount:roadmap.filter(x=>!x.origin||x.origin==='curriculum').length,trackedProblemCount:roadmap.length,byStatus,reviewCount:reviews.length, evidenceCount:evidence.length,dueCount:data.due.length};
 }
 if(name==="get_problem_history"){
   const itemId=String(a.itemId);
   const problem=roadmap.find(x=>x.itemId===itemId);
   if(!problem)return {found:false,itemId};
   return {found:true,problem,reviews:reviews.filter(x=>x.itemId===itemId).slice(0,25),
     evidence:evidence.filter(x=>x.itemId===itemId).slice(0,50),learningEvents:(data.learningEvents??[]).filter(e=>e.itemId===itemId||problem.problemRef&&e.problemRef===problem.problemRef).slice(-25)};
 }
 if(name==="diagnose_weaknesses")return diagnoseWeaknesses(reviews.map(r=>({itemId:r.itemId,reviewedAt:r.reviewedAt,grade:r.grade,mistakeClass:r.mistakeClass??null,hintStage:r.hintStage??null,confidence:r.confidence??null})),5,data.learningEvents??[]);
 if(name==="get_transfer_problem"){
   const source=roadmap.find(x=>x.itemId===a.itemId);
   if(!source)return {found:false,reason:"Unknown curriculum item"};
   const ownCatalog=source.catalogId?roadmap.filter(p=>p.catalogId===source.catalogId):[];
   const pools=ownCatalog.length?[ownCatalog,roadmap]:[roadmap];
   for(const pool of pools){
    const next=proposeTransferProblem({id:source.itemId,title:source.title,topic:source.topic,position:source.position,status:source.status},pool.map(x=>({id:x.itemId,title:x.title,topic:x.topic,position:x.position,status:x.status})));
    if(next)return {found:true,sourceItemId:source.itemId,candidate:{itemId:next.id,title:next.title,topic:next.topic},basis:'same_topic_heuristic',verificationRequired:true};
    const converted:ConceptProblem[]=pool.map(p=>({itemId:p.itemId,title:p.title,topic:p.topic,position:p.position,status:p.status,idea:p.idea,conceptKeys:p.conceptKeys,catalogId:p.catalogId}));
    const linked=connectUnfamiliarProblems(converted.find(p=>p.itemId===source.itemId)!,converted,20).find(p=>p.relation==='same-concept');
    if(linked)return {found:true,sourceItemId:source.itemId,candidate:linked.candidate,basis:'shared_concept_heuristic',concept:linked.sourceConcept,question:linked.question,verificationRequired:true};
   }
   return {found:false,reason:"No grounded unattempted transfer candidate; verify source metadata or add a suitable problem."};
 }
 if(name==="get_progressive_hint"){
   const row=roadmap.find(x=>x.itemId===a.itemId);
   if(!row)return {found:false,reason:"Unknown curriculum item"};
   return {found:true,itemId:row.itemId,grounding:row.origin&&row.origin!=='curriculum'?'external_metadata_only_verify_against_problem_and_code':'curriculum_metadata',...progressiveHint({title:row.title,topic:row.topic,idea:row.idea??null,level:a.level as 1|2|3})};
 }
 if(name==="get_memory_patterns"){
   if(!data.memorySearch||data.memorySearch.query!==String(a.query).trim())throw Error("Memory search unavailable");
   return data.memorySearch;
 }
 if(name==="get_learning_signals")return deriveLearningSignals(data.learningEvents??[],Object.fromEntries(roadmap.filter(p=>p.problemRef).map(p=>[p.itemId,p.problemRef!])));
 if(name==="get_concept_connections"){
  const source=roadmap.find(x=>x.itemId===a.itemId);
  if(!source)return {found:false,reason:"Unknown curriculum problem"};
  const ownCatalog=source.catalogId?roadmap.filter(p=>p.catalogId===source.catalogId):[];
  const pools=ownCatalog.length?[ownCatalog,roadmap]:[roadmap];
  for(const pool of pools){
   const converted:ConceptProblem[]=pool.map(p=>({itemId:p.itemId,title:p.title,topic:p.topic,position:p.position,status:p.status,idea:p.idea,conceptKeys:p.conceptKeys,catalogId:p.catalogId}));
   const connections=connectUnfamiliarProblems(converted.find(x=>x.itemId===source.itemId)!,converted,5);
   if(connections.length)return {found:true,itemId:source.itemId,connections};
  }
  return {found:true,itemId:source.itemId,connections:[]};
 }
 if(name==="get_source_status"){
   const sources=["leetcode","codeforces","github"];
   return sources.map(source=>{
     const rows=evidence.filter(e=>e.source===source);
     const timestamps=rows.map(e=>Date.parse(e.observedAt)).filter(Number.isFinite);
     return {source,storedRecords:rows.length,lastObservedAt:timestamps.length?new Date(Math.max(...timestamps)).toISOString():null,liveConnectivityVerified:false};
   });
 }
 throw new Error("Unsupported tool");
}
export async function respondToMcp(input:unknown,loadData:(toolName?:string,args?:Record<string,unknown>)=>Promise<ToolData>,recordEvent?:(event:LearningEventInput)=>Promise<unknown>){
 const m=asObject(input);
 if(!m)return failure(null,-32600,"Invalid Request");
 const id:JsonId=(typeof m.id==="string"||typeof m.id==="number"||m.id===null)?m.id as JsonId:null;
 if(m.jsonrpc!=="2.0"||typeof m.method!=="string")return failure(id,-32600,"Invalid Request");
 if(m.method==="notifications/initialized" && !("id" in m))return null;
 if(!("id" in m))return null;
 if(m.method==="initialize")return success(id,{protocolVersion:"2025-06-18",capabilities:{tools:{listChanged:false}},serverInfo:{name:"coding-intuition-mcp",version:"0.2.0"}});
 if(m.method==="ping")return success(id,{});
 if(m.method==="tools/list")return success(id,{tools});
 if(m.method!=="tools/call")return failure(id,-32601,"Method not found");
 const p=asObject(m.params);
 if(!p||typeof p.name!=="string"||!tools.some(t=>t.name===p.name))return failure(id,-32602,"Unknown tool");
 const args=validateArgs(p.name,p.arguments);
 if(!args)return failure(id,-32602,"Invalid tool arguments");
 try{
   if(p.name==="record_reasoning_event"){
    if(!recordEvent)throw Error("Learning event storage unavailable");
    const receipt=await recordEvent(parseLearningEvent(args));
    return success(id,{content:[{type:"text",text:JSON.stringify(receipt)}],isError:false});
   }
   const data=await loadData(p.name,args);
   return success(id,{content:[{type:"text",text:JSON.stringify(invoke(p.name,args,data))}],isError:false});
 }catch{
   return failure(id,-32603,"Learning data temporarily unavailable");
 }
}

