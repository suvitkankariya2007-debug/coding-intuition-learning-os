import {describe,it,expect,vi} from "vitest";
import {MemoryCache} from "./memory-cache";
import {reconcileMemoryBatch} from "./supermemory-incremental";
import {rankWithReasoning} from "./reasoning-ranking";
import {parseLearningEvent,type LearningEventRecord} from "./learning-events";
import {respondToMcp} from "./mcp-core";
import {connectUnfamiliarProblems,type ConceptProblem} from "./concept-graph";

const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222";
const roadmap:ConceptProblem[]=[
 {itemId:a,title:"Validate BST",topic:"Trees",idea:"Recursive DFS with base case",position:1,status:"attempted"},
 {itemId:b,title:"Binary Tree Paths",topic:"Trees",idea:"Recursive DFS base case",position:2,status:"not_started"}
];
const evidence={accepted:0,rejected:0,codeFiles:0,latestAt:null};
describe("end-to-end learning fabric contract (mocked external systems)",()=>{
 it("incrementally imports once, caches lookup, boosts weak concepts, and exposes MCP transfer",async()=>{
  const imported=reconcileMemoryBatch({versions:{},lastCheckedAt:null},[
   {id:"sm-1",version:1,content:"Base cases are difficult in recursive tree problems",updatedAt:"2026-10-18T08:00:00Z"}
  ],true);
  expect(imported.changes).toHaveLength(1);
  expect(reconcileMemoryBatch(imported.cursor,[
   {id:"sm-1",version:1,content:"Base cases are difficult in recursive tree problems",updatedAt:"2026-10-18T08:00:00Z"}
  ],true).changes).toHaveLength(0);
  const fetcher=vi.fn(async()=>[{id:"sm-1",content:imported.changes[0].content!,score:0.9}]);
  const cache=new MemoryCache(60_000);
  await cache.get("learner","recursive base cases",fetcher,100);
  await cache.get("learner","recursive base cases",fetcher,200);
  expect(fetcher).toHaveBeenCalledOnce();
  const event={...parseLearningEvent({clientEventId:"chatgpt:bst:001",itemId:a,problemRef:"lc:98",kind:"mistake",
   summary:"I compared only direct children, forgetting ancestor bounds and recursive base cases.",conceptKeys:["base-case"],origin:"chatgpt"}),recordedAt:"2026-10-18T08:00:00Z"} as LearningEventRecord;
  const ranked=rankWithReasoning([
   {itemId:a,title:"Validate BST",score:10,reason:[],evidence},
   {itemId:b,title:"Binary Tree Paths",score:9,reason:[],evidence}
  ],roadmap,[event]);
  expect(ranked[0].score).toBeGreaterThan(10);
  expect(ranked.every(r=>r.evidence.accepted===0)).toBe(true);
  const loader=vi.fn(async()=>({recommendations:ranked,due:[],roadmap:roadmap.map(p=>({...p,dueDate:null})),
   reviews:[],evidence:[],learningEvents:[event]}));
  const tool=await respondToMcp({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"get_learning_signals",arguments:{}}},loader) as {result:{content:{text:string}[]}};
  expect(JSON.parse(tool.result.content[0].text).weakConcepts).toEqual(expect.arrayContaining([expect.objectContaining({concept:"base-case"})]));
  const graph=await respondToMcp({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"get_concept_connections",arguments:{itemId:a}}},loader);
  expect(graph).toHaveProperty("result.isError",false);
  expect(connectUnfamiliarProblems(roadmap[0],roadmap).every(x=>x.itemId!==a)).toBe(true);
 });
 it("never records an observation as an accepted platform submission",async()=>{
  const save=vi.fn(async()=>({stored:true,provenance:"self_report_not_accepted_submission"}));
  const loader=vi.fn(async()=>({recommendations:[],due:[]}));
  const result=await respondToMcp({jsonrpc:"2.0",id:3,method:"tools/call",params:{name:"record_reasoning_event",
   arguments:{clientEventId:"chatgpt:bst:002",problemRef:"lc:98",kind:"reasoning_insight",summary:"Ancestor bounds matter more than immediate child comparisons.",origin:"chatgpt"}}},loader,save);
  expect(result).toHaveProperty("result.isError",false);
  expect(save).toHaveBeenCalledOnce();
  expect(loader).not.toHaveBeenCalled();
 });
});
