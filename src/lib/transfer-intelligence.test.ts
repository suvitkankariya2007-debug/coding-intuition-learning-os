import {describe,it,expect} from "vitest";
import {evaluateTransfer,proposeTransferProblem} from "./transfer-intelligence";
const a={id:"a",title:"A",topic:"trees",position:12,status:"solved"};
const candidates=[a,{id:"b",title:"B",topic:"trees",position:13,status:"not_started"},{id:"c",title:"C",topic:"arrays",position:14,status:"not_started"}];
const answer={sourceProblemId:"a",targetProblemId:"b",recognizedPattern:true,explainedInvariant:true,independentSolution:true,hintsUsed:0,reviewedAt:"2026-10-17T10:00:00Z"};
describe("unfamiliar problem transfer",()=>{
 it("avoids practiced source and unrelated topics",()=>{expect(proposeTransferProblem(a,candidates)?.id).toBe("b")});
 it("does not conflate hinted solves with independent mastery",()=>{
   expect(evaluateTransfer({...answer,hintsUsed:2})).toMatchObject({independent:false,outcome:"developing_transfer"});
 });
 it("reports independent transfer only when all reasoning evidence exists",()=>{
   expect(evaluateTransfer(answer)).toMatchObject({independent:true,outcome:"independent_transfer"});
   expect(evaluateTransfer({...answer,explainedInvariant:false}).independent).toBe(false);
 });
 it("rejects self-transfer and invalid reflection",()=>{
   expect(()=>evaluateTransfer({...answer,targetProblemId:"a"})).toThrow(/different/);
   expect(()=>evaluateTransfer({...answer,hintsUsed:-1})).toThrow(/Invalid/);
 });
});
