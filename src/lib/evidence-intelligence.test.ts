import { describe, expect, it } from "vitest";
import { recommendDSA, type LearningItem, type Evidence } from "./evidence-intelligence";
const now = "2026-10-17T00:00:00.000Z";
const items: LearningItem[] = [
  { id:"bst", title:"Validate BST", topic:"trees", position: 4, dueDate:"2026-10-10", recallGrade:0, status:"attempted" },
  { id:"array", title:"Two Sum", topic:"arrays", position:1, status:"not_started" },
  { id:"graph", title:"BFS", topic:"graphs", position:3, status:"solved" },
];
describe("provenance-aware recommendations",()=>{
  it("prioritizes overdue weak recall over new work",()=>{
    const x=recommendDSA(items,[],{now});
    expect(x[0].itemId).toBe("bst");
    expect(x[0].reason.join(" ")).toContain("recall");
  });
  it("never treats GitHub file as an accepted submission",()=>{
    const e: Evidence[]=[{itemId:"bst",source:"github",provenanceId:"blob-sha",observedAt:now,codeUrl:"https://github.com/example/file"}];
    const x=recommendDSA(items,e,{now});
    expect(x[0].evidence.accepted).toBe(0);
    expect(x[0].evidence.codeFiles).toBe(1);
  });
  it("deduplicates source records by provenance id",()=>{
    const e:Evidence={itemId:"bst",source:"codeforces",provenanceId:"123",observedAt:now,verdict:"WRONG_ANSWER"};
    expect(recommendDSA(items,[e,e],{now})[0].evidence.rejected).toBe(1);
  });
  it("raises priority for an explicitly recorded reasoning weakness",()=>{
    const baseline:LearningItem[]=[{id:"a",title:"A",topic:"trees",position:1,status:"attempted",recallGrade:1},
      {id:"b",title:"B",topic:"trees",position:2,status:"attempted",recallGrade:1,mistakeClass:"base-case",hintStage:"deeper",confidence:2}];
    const result=recommendDSA(baseline,[],{now});
    expect(result[0].itemId).toBe("b");
    expect(result[0].reason.join(" ")).toContain("base case");
  });
  it("keeps contest queue focused on previous work",()=>{
    const x=recommendDSA(items,[],{now,mode:"contest"});
    expect(x.some(i=>i.itemId==="array")).toBe(false);
    expect(x.some(i=>i.itemId==="bst")).toBe(true);
  });
  it("ignores unknown evidence sources and bounds malformed recommendation limits",()=>{
    const fake={itemId:"bst",source:"untrusted",provenanceId:"fake",observedAt:now,accepted:true} as unknown as Evidence;
    const result=recommendDSA(items,[fake],{now,limit:Number.POSITIVE_INFINITY});
    expect(result[0].evidence.accepted).toBe(0);
    expect(result).toHaveLength(items.length);
  });
  it("keeps revision mode focused on attempted or overdue work",()=>{
    const result=recommendDSA(items,[],{now,mode:"revision"});
    expect(result.map(x=>x.itemId)).not.toContain("array");
    expect(result.map(x=>x.itemId)).toContain("bst");
  });
  it("prioritizes retries in competitive mode",()=>{
    const same=[{id:"a",title:"New",topic:"graphs",position:1,status:"not_started" as const},
      {id:"b",title:"Retry",topic:"graphs",position:2,status:"attempted" as const}];
    const submissions:Evidence[]=[{itemId:"b",source:"codeforces",provenanceId:"cf-1",verdict:"WRONG_ANSWER",observedAt:now}];
    const result=recommendDSA(same,submissions,{now,mode:"competitive"});
    expect(result[0].itemId).toBe("b");
    expect(result[0].reason.join(" ")).toContain("Competitive practice");
  });
  it("never leaks code or arbitrary notes in recommendation result",()=>{
    const x=recommendDSA(items,[],{now});
    expect(JSON.stringify(x)).not.toContain("codeUrl");
  });
});
