import {describe,expect,it,vi} from "vitest";
import {respondToMcp} from "./mcp-core";
const data=()=>Promise.resolve({recommendations:[{itemId:"a",title:"BST",score:30,reason:["Review due now"],evidence:{accepted:0,rejected:0,codeFiles:0,latestAt:null}}],due:[{itemId:"a",title:"BST",dueDate:"2026-10-17"}]});
describe("MCP protocol security contract",()=>{
 it("negotiates and exposes one bounded reasoning event writer",async()=>{
  const init=await respondToMcp({jsonrpc:"2.0",id:1,method:"initialize"},data);
  expect(init).toHaveProperty("result.protocolVersion","2025-06-18");
  const result=await respondToMcp({jsonrpc:"2.0",id:2,method:"tools/list"},data);
  const names=(result as {result:{tools:{name:string}[]}}).result.tools.map(t=>t.name);
  expect(names.filter(n=>n.startsWith("record_"))).toEqual(["record_reasoning_event"]);
  expect(names).not.toContain("delete_account");
 });
 it("never loads data for unknown tool names",async()=>{
  const loader=vi.fn(data);
  const r=await respondToMcp({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"delete_account"}},loader);
  expect(r).toHaveProperty("error.code",-32602);
  expect(loader).not.toHaveBeenCalled();
 });
 it("only returns bounded authenticated loader results",async()=>{
  const r=await respondToMcp({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"get_due_reviews",arguments:{}}},data);
  expect(JSON.stringify(r)).toContain("BST");
  expect(JSON.stringify(r)).not.toContain("password");
 });
 it("notification returns no response",async()=>{
  expect(await respondToMcp({jsonrpc:"2.0",method:"notifications/initialized"},data)).toBeNull();
 });
});


describe("Unified MCP tool contracts",()=>{
 const itemId="11111111-1111-4111-8111-111111111111";
 const supplied=()=>Promise.resolve({
   recommendations:[],due:[{itemId,title:"BST",dueDate:"2026-10-17"}],
   roadmap:[{itemId,title:"BST",topic:"Trees",position:1,status:"attempted",dueDate:"2026-10-17"}],
   reviews:[{itemId,grade:1,reviewedAt:"2026-10-16T00:00:00Z",mistakeClass:"base-case"}],
   evidence:[{itemId,source:"github",observedAt:"2026-10-16T00:00:00Z",accepted:false}]
 });
 const call=(name:string,args:Record<string,unknown>={})=>respondToMcp({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args}},supplied);
 const value=async(name:string,args:Record<string,unknown>={})=>{
   const r=await call(name,args) as {result:{content:{text:string}[]}};
   return JSON.parse(r.result.content[0].text);
 };
 it("lists every unified read tool",async()=>{
   const r=await respondToMcp({jsonrpc:"2.0",id:2,method:"tools/list"},supplied) as {result:{tools:{name:string}[]}};
   expect(r.result.tools.map(t=>t.name)).toEqual([
     "get_recommendations","get_due_reviews","get_roadmap","get_progress_report","get_problem_history","diagnose_weaknesses","get_transfer_problem","get_progressive_hint","get_memory_patterns","get_concept_connections","get_learning_signals","record_reasoning_event","get_source_status"
   ]);
 });
 it("returns canonical roadmap and stable pagination",async()=>{
   expect(await value("get_roadmap",{limit:1})).toMatchObject({total:1,items:[{title:"BST"}]});
   expect(await value("get_roadmap",{offset:1})).toMatchObject({total:1,items:[]});
 });
 it("reports real persisted data, never synthetic mastery",async()=>{
   expect(await value("get_progress_report")).toMatchObject({curriculumCount:1,byStatus:{attempted:1},reviewCount:1,evidenceCount:1});
   expect(await value("get_source_status")).toEqual(expect.arrayContaining([
     expect.objectContaining({source:"github",storedRecords:1,liveConnectivityVerified:false})
   ]));
 });
 it("returns diagnostic explanations only for recorded reflections",async()=>{
   const rows=await value("diagnose_weaknesses");
   expect(rows).toMatchObject([{pattern:"base-case",lowRecall:1,affectedProblems:1}]);
 });
 it("provides grounded hints and does not invent unrelated transfer candidates",async()=>{
   const hint=await value("get_progressive_hint",{itemId,level:1});
   expect(hint).toMatchObject({found:true,revealsConcept:false});
   const transfer=await value("get_transfer_problem",{itemId});
   expect(transfer).toMatchObject({found:false});
   const invalid=await call("get_progressive_hint",{itemId,level:4});
   expect(invalid).toHaveProperty("error.code",-32602);
 });
 it("queries Supermemory lazily and labels returned hints as non-mastery evidence",async()=>{
    const loader=vi.fn(async (toolName?:string,args?:Record<string,unknown>)=>({
      ...(await supplied()),
      memorySearch:toolName==="get_memory_patterns"?{
        namespace:"leetcode_problems",query:String(args?.query),
        items:[{id:"m1",content:"Use backward traversal for in-place merge",score:0.81}],
        cache:"miss" as const,interpretation:"context_only_not_mastery" as const
      }:undefined
    }));
    const reply=await respondToMcp({jsonrpc:"2.0",id:5,method:"tools/call",params:{name:"get_memory_patterns",arguments:{query:"merge arrays"}}},loader) as {result:{content:{text:string}[]}};
    expect(JSON.parse(reply.result.content[0].text)).toMatchObject({namespace:"leetcode_problems",interpretation:"context_only_not_mastery",items:[{id:"m1",score:0.81}]});
    expect(loader).toHaveBeenCalledWith("get_memory_patterns",{query:"merge arrays"});
    const invalid=await respondToMcp({jsonrpc:"2.0",id:6,method:"tools/call",params:{name:"get_memory_patterns",arguments:{query:"a"}}},loader);
    expect(invalid).toHaveProperty("error.code",-32602);
  });
 it("isolates problem history to a valid item id",async()=>{
   expect(await value("get_problem_history",{itemId})).toMatchObject({found:true,reviews:[{grade:1}],evidence:[{accepted:false}]});
   expect(await value("get_problem_history",{itemId:"22222222-2222-4222-8222-222222222222"})).toMatchObject({found:false});
 });
 it("rejects malformed limits and injection-like arguments without reading data",async()=>{
   const loader=vi.fn(supplied);
   const r=await respondToMcp({jsonrpc:"2.0",id:8,method:"tools/call",params:{name:"get_roadmap",arguments:{limit:10000,sql:"DROP TABLE"}}},loader);
   expect(r).toHaveProperty("error.code",-32602);
   expect(loader).not.toHaveBeenCalled();
 });
});

describe("bounded MCP learning event writes",()=>{
 const event={clientEventId:"chatgpt:20261018:bst-1",problemRef:"lc:98",kind:"mistake",summary:"I forgot ancestor bounds and compared only immediate BST children.",conceptKeys:["dfs"],mistakeClass:"invariant",hintStage:"deeper",confidence:2,independentlyExplained:false,origin:"chatgpt"};
 it("only calls the authenticated event hook with normalized reasoning",async()=>{
  const save=vi.fn(async(_x:unknown)=>({stored:true,duplicate:false}));
  const load=vi.fn(data);
  const response=await respondToMcp({jsonrpc:"2.0",id:19,method:"tools/call",params:{name:"record_reasoning_event",arguments:event}},load,save);
  expect(response).toHaveProperty("result.isError",false);
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][0]).toMatchObject({problemRef:"lc:98",kind:"mistake",origin:"chatgpt"});
  expect(load).not.toHaveBeenCalled();
 });
 it("refuses secrets, malformed events and missing persistence",async()=>{
  const save=vi.fn(async(_x:unknown)=>({stored:true})),load=vi.fn(data);
  const invalid=await respondToMcp({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"record_reasoning_event",arguments:{...event,password:"secret"}}},load,save);
  expect(invalid).toHaveProperty("error.code",-32602);
  expect(save).not.toHaveBeenCalled();
  const unsupported=await respondToMcp({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"record_reasoning_event",arguments:event}},load);
  expect(unsupported).toHaveProperty("error.code",-32603);
 });
});
