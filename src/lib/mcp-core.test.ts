import {describe,expect,it,vi} from "vitest";
import {respondToMcp} from "./mcp-core";
const data=()=>Promise.resolve({recommendations:[{itemId:"a",title:"BST",score:30,reason:["Review due now"],evidence:{accepted:0,rejected:0,codeFiles:0,latestAt:null}}],due:[{itemId:"a",title:"BST",dueDate:"2026-10-17"}]});
describe("MCP protocol security contract",()=>{
 it("negotiates and exposes only read-only tools",async()=>{
  const init=await respondToMcp({jsonrpc:"2.0",id:1,method:"initialize"},data);
  expect(init).toHaveProperty("result.protocolVersion","2025-06-18");
  const result=await respondToMcp({jsonrpc:"2.0",id:2,method:"tools/list"},data);
  expect(JSON.stringify(result)).not.toMatch(/write|delete|execute_sql|sync_/);
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
     "get_recommendations","get_due_reviews","get_roadmap","get_progress_report","get_problem_history","diagnose_weaknesses","get_source_status"
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
   expect(rows).toEqual([]);
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
