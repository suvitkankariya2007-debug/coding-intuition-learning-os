import {describe,it,expect} from "vitest";
import {rankWithReasoning} from "./reasoning-ranking";
import {parseLearningEvent,type LearningEventRecord} from "./learning-events";
const roadmap=[
 {itemId:"two",title:"Two Sum",topic:"Arrays",idea:"Hash map lookup",status:"not_started",position:1},
 {itemId:"bst",title:"Validate BST",topic:"Trees",idea:"Depth-first search and recursive base case",status:"not_started",position:2}
];
const base=[
 {itemId:"two",title:"Two Sum",score:20,reason:["new"],evidence:{accepted:0,rejected:0,codeFiles:0,latestAt:null}},
 {itemId:"bst",title:"Validate BST",score:16,reason:["new"],evidence:{accepted:0,rejected:0,codeFiles:0,latestAt:null}}
];
describe("explicit reasoning personalization",()=>{
 it("boosts another topic sharing a recorded weak concept without fabricating a solve",()=>{
  const event={...parseLearningEvent({clientEventId:"chatgpt:learning:b01",itemId:null,problemRef:"lc:98",kind:"mistake",summary:"I forgot the recursive stopping condition and got stuck.",conceptKeys:["base-case"],origin:"chatgpt"}),recordedAt:"2026-10-18T12:00:00Z"} as LearningEventRecord;
  const result=rankWithReasoning(base,roadmap,[event]);
  expect(result[0]).toMatchObject({itemId:"bst"});
  expect(result[0].reason.join(" ")).toMatch(/self-report/);
  expect(result[0].evidence.accepted).toBe(0);
 });
 it("preserves the baseline when no observations exist",()=>{
  expect(rankWithReasoning(base,roadmap,[])).toEqual(base);
 });
});
