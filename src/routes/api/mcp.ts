import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { recommendDSA, LEARNING_MODES, type LearningMode, type Evidence, type LearningItem } from "@/lib/evidence-intelligence";
import { respondToMcp, type ToolData } from "@/lib/mcp-core";
import { findLearningMemories } from "@/lib/supermemory-search";
import {rankWithReasoning} from "@/lib/reasoning-ranking";
import {type LearningEventInput,type LearningEventRecord,type LearningEventKind} from "@/lib/learning-events";
import type {ConceptKey,ConceptProblem} from "@/lib/concept-graph";
import type { Database } from "@/integrations/supabase/types";

type AuthHandlers={loadData:(toolName?:string,args?:Record<string,unknown>)=>Promise<ToolData>;recordEvent:(event:LearningEventInput)=>Promise<unknown>};
async function authorizedData(request:Request):Promise<AuthHandlers> {
  const tokenHeader=request.headers.get("Authorization") ?? "";
  if (!tokenHeader.startsWith("Bearer ")) throw new Error("unauthorized");
  const token=tokenHeader.slice(7);
  if (!token || token.length>5000) throw new Error("unauthorized");
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("configuration unavailable");
  const supabase=createClient<Database>(url,key,{
    global:{headers:{Authorization:`Bearer ${token}`}},
    auth:{persistSession:false,autoRefreshToken:false,storage:undefined}
  });
  const {data:auth,error}=await supabase.auth.getUser(token);
  if (error || !auth.user) throw new Error("unauthorized");
  const recordEvent=async (event:LearningEventInput)=>{
    if(event.itemId){
      const {data:item,error}=await supabase.from("curriculum_items").select("id").eq("id",event.itemId).eq("user_id",auth.user.id).eq("is_active",true).maybeSingle();
      if(error||!item)throw Error("Roadmap item unavailable");
    }
    // Ignore repeat event IDs: a timeout/retry must not double-count a reasoning session.
    // PostgreSQL RLS also enforces ownership and append-only updates.
    const {data:inserted,error}=await supabase.from("learning_events").upsert({
      user_id:auth.user.id,client_event_id:event.clientEventId,item_id:event.itemId,
      problem_ref:event.problemRef,kind:event.kind,summary:event.summary,concept_keys:event.conceptKeys,
      mistake_class:event.mistakeClass,hint_stage:event.hintStage,confidence:event.confidence,
      independently_explained:event.independentlyExplained,origin:event.origin
    },{onConflict:"user_id,client_event_id",ignoreDuplicates:true}).select("id").maybeSingle();
    if(error)throw Error("Unable to store learning observation");
    return {stored:true,duplicate:!inserted,clientEventId:event.clientEventId,provenance:"self_report_not_accepted_submission"};
  };
  const loadData=async(toolName?:string,args?:Record<string,unknown>):Promise<ToolData>=>{
    const [catalog,progress,reviews,evidence,preferences,events]=await Promise.all([
      supabase.from("curriculum_items").select("id,title,topic,position,idea").eq("is_active",true).order("position").limit(1000),
      supabase.from("item_progress").select("item_id,status,due_date").limit(1000),
      supabase.from("review_log").select("item_id,grade,reviewed_at,mistake_class,hint_stage,confidence").order("reviewed_at",{ascending:false}).limit(2000),
      supabase.from("platform_evidence").select("item_id,source,observed_at,provenance_id,verdict,accepted").limit(2000),
      supabase.from("coaching_preferences").select("prefs").maybeSingle(),
      supabase.from("learning_events").select("client_event_id,item_id,problem_ref,kind,summary,concept_keys,mistake_class,hint_stage,confidence,independently_explained,origin,recorded_at").order("recorded_at",{ascending:false}).limit(2000)
    ]);
    if(catalog.error||progress.error||reviews.error||evidence.error||preferences.error||events.error) throw new Error("query failure");
    const byProgress=new Map(progress.data.map(p=>[p.item_id,p]));
    const byGrade=new Map<string,number>();
    for (const r of reviews.data) if(!byGrade.has(r.item_id)) byGrade.set(r.item_id,r.grade);
    const items:LearningItem[]=catalog.data.map(i=>{
      const p=byProgress.get(i.id);
      const grade=byGrade.get(i.id);
      const reflection=reviews.data.find(r=>r.item_id===i.id);
      return {id:i.id,title:i.title,topic:i.topic??"Uncategorized",position:i.position,
        dueDate:p?.due_date??null,
        status:(p?.status??"not_started") as LearningItem["status"],
        recallGrade:grade==null?null:grade<=1?0:grade===2?1:grade===3?2:3,
        mistakeClass:reflection?.mistake_class??null,
        hintStage:reflection?.hint_stage as LearningItem["hintStage"] ?? null,
        confidence:reflection?.confidence??null,
      };
    });
    const records:Evidence[]=evidence.data.filter(e=>e.item_id && ["leetcode","codeforces","github"].includes(e.source))
      .map(e=>({itemId:e.item_id!,source:e.source as Evidence["source"],observedAt:e.observed_at,
        provenanceId:e.provenance_id,accepted:e.accepted,verdict:e.verdict}));
    const saved=preferences.data?.prefs && typeof preferences.data.prefs==="object" && !Array.isArray(preferences.data.prefs) ? preferences.data.prefs.learning_mode : null;
    const mode:LearningMode=LEARNING_MODES.includes(saved as LearningMode) ? saved as LearningMode : "interview";
    const memorySearch=toolName==="get_memory_patterns" && typeof args?.query==="string"
      ? await findLearningMemories(auth.user.id,args.query) : undefined;
    const learningEvents:LearningEventRecord[]=events.data.map(e=>({
      clientEventId:e.client_event_id,itemId:e.item_id,problemRef:e.problem_ref,
      kind:e.kind as LearningEventKind,summary:e.summary,conceptKeys:e.concept_keys as ConceptKey[],
      mistakeClass:e.mistake_class,hintStage:e.hint_stage,confidence:e.confidence,
      independentlyExplained:e.independently_explained,origin:e.origin as "chatgpt"|"app",
      recordedAt:e.recorded_at
    }));
    const conceptsRoadmap:ConceptProblem[]=catalog.data.map(i=>({
      itemId:i.id,title:i.title,topic:i.topic??"Uncategorized",idea:i.idea,position:i.position,
      status:byProgress.get(i.id)?.status??"not_started"
    }));
    const day=new Date().toISOString().slice(0,10);
    return {
      recommendations:rankWithReasoning(recommendDSA(items,records,{now:new Date().toISOString(),limit:50,mode}),conceptsRoadmap,learningEvents).slice(0,5),
      memorySearch,
      learningEvents,
      due:catalog.data.flatMap(i=>{
        const dueDate=byProgress.get(i.id)?.due_date;
        return dueDate && dueDate<=day?[{itemId:i.id,title:i.title,dueDate}]:[];
      }).slice(0,20),
      roadmap:catalog.data.map(i=>({
        itemId:i.id,title:i.title,topic:i.topic??"Uncategorized",position:i.position,
        status:byProgress.get(i.id)?.status??"not_started",dueDate:byProgress.get(i.id)?.due_date??null,idea:i.idea
      })),
      reviews:reviews.data.map(r=>({itemId:r.item_id,grade:r.grade,reviewedAt:r.reviewed_at,
        mistakeClass:r.mistake_class,hintStage:r.hint_stage,confidence:r.confidence})),
      evidence:evidence.data.map(e=>({itemId:e.item_id,source:e.source,observedAt:e.observed_at,
        accepted:e.accepted,verdict:e.verdict}))
    };
  };
  return {loadData,recordEvent};
}
export const Route=createFileRoute("/api/mcp")({
  server:{handlers:{
    GET:async()=>new Response("Sessionless MCP supports POST only",{status:405,headers:{"Allow":"POST"}}),
    POST:async({request})=>{
      // MCP HTTP transport validates Origin to prevent browser-origin cross-site requests.
      const origin=request.headers.get("Origin");
      if (origin && origin !== new URL(request.url).origin) return new Response("Forbidden Origin",{status:403});
      const size=Number(request.headers.get("Content-Length")??"0");
      if (size>32768) return new Response("Request too large",{status:413});
      const raw=await request.text();
      if(raw.length>32768) return new Response("Request too large",{status:413});
      let payload:unknown;
      try{payload=JSON.parse(raw);}catch{return Response.json({jsonrpc:"2.0",id:null,error:{code:-32700,message:"Parse error"}},{status:400});}
      let handlers:AuthHandlers;
      try{handlers=await authorizedData(request);}catch{return Response.json({error:"Unauthorized"},{status:401,headers:{"WWW-Authenticate":'Bearer realm="coding-intuition"'}});}
      const result=await respondToMcp(payload,handlers.loadData,handlers.recordEvent);
      if(result===null)return new Response(null,{status:202});
      return Response.json(result,{headers:{"Cache-Control":"no-store","MCP-Protocol-Version":"2025-06-18"}});
    },
  }}
});
