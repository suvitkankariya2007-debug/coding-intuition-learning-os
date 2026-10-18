import {describe,it,expect} from "vitest";
import {inferCurriculumConcepts,connectUnfamiliarProblems,CONCEPT_EDGES} from "./concept-graph";
describe("curriculum relationship graph",()=>{
 it("does not assume all array problems use the same technique",()=>{
  expect(inferCurriculumConcepts({title:"Two Sum",topic:"Arrays and Hashing",idea:"Hash map lookup"})).toEqual(["hash-lookup"]);
  expect(inferCurriculumConcepts({title:"Unknown",topic:"Arrays and Hashing",idea:null})).toEqual([]);
 });
 it("compares unfamiliar problems across topics",()=>{
  const original={itemId:"a",title:"Two Sum",topic:"Arrays",idea:"Hash map lookup",status:"solved",position:1};
  const connected=connectUnfamiliarProblems(original,[original,
   {itemId:"b",title:"Sorted pair",topic:"Two Pointers",idea:"Two-pointer search",status:"not_started",position:5},
   {itemId:"c",title:"Another hash",topic:"Arrays",idea:"Hash map lookup",status:"not_started",position:8},
   {itemId:"d",title:"Already done",topic:"Two Pointers",idea:"Two-pointer search",status:"solved",position:9}]);
  expect(connected[0]).toMatchObject({candidate:{itemId:"b"},relation:"alternative",basis:"curriculum-heuristic"});
  expect(connected[0].question).toContain("time and extra space");
  expect(connected.some(x=>x.candidate.itemId==="d")).toBe(false);
 });
 it("does not invent relationships with no technique evidence",()=>{
  expect(connectUnfamiliarProblems({itemId:"a",title:"Unknown",topic:"Arrays",idea:null,status:"solved",position:1},[])).toEqual([]);
  expect(CONCEPT_EDGES.length).toBeGreaterThan(10);
 });
});
