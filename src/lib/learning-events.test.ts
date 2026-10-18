import {describe,it,expect} from "vitest";
import {parseLearningEvent,deriveLearningSignals,type LearningEventRecord} from "./learning-events";
const input={clientEventId:"chatgpt:20261018:bst-1",itemId:null,problemRef:"lc:98",kind:"mistake",summary:"I checked direct children only and did not enforce inherited BST bounds.",conceptKeys:["base-case","dfs"],mistakeClass:"invariant",hintStage:"deeper",confidence:2,independentlyExplained:false,origin:"chatgpt"};
describe("reasoning ETL",()=>{
 it("accepts structured problem-solving evidence with stable provenance",()=>{
  expect(parseLearningEvent(input)).toMatchObject({problemRef:"lc:98",origin:"chatgpt",conceptKeys:["base-case","dfs"]});
 });
 it("rejects arbitrary chat dumps, unknown tags and unlinked events",()=>{
  expect(()=>parseLearningEvent({...input,problemRef:null})).toThrow(/required/);
  expect(()=>parseLearningEvent({...input,password:"not-allowed"})).toThrow(/field/);
  expect(()=>parseLearningEvent({...input,summary:"x".repeat(701)})).toThrow(/summary/);
  expect(()=>parseLearningEvent({...input,conceptKeys:["made-up"]})).toThrow(/tags/);
 });
 it("deduplicates replayed observations, reports weak concepts, not accepted solves",()=>{
  const event={...parseLearningEvent(input),recordedAt:"2026-10-18T05:00:00Z"} as LearningEventRecord;
  const signal=deriveLearningSignals([event,event]);
  expect(signal).toMatchObject({eventCount:1,hintDependent:1,weakConcepts:[{concept:"base-case",count:1},{concept:"dfs",count:1}],mistakeCounts:[{mistakeClass:"invariant",count:1}]});
  expect(signal.selfReportedIndependent).toBe(0);
 });
});
