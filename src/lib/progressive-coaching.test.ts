import {describe,it,expect} from "vitest";
import {progressiveHint} from "./progressive-coaching";
const base={title:"Two Sum",topic:"Arrays and Hashing",idea:"Hash map lookup"};
describe("progressive coaching",()=>{
 it("does not reveal stored curriculum concept before requested",()=>{
  const h1=progressiveHint({...base,level:1});
  const h2=progressiveHint({...base,level:2});
  expect(h1.revealsConcept).toBe(false);
  expect(h2.revealsConcept).toBe(false);
  expect(h1.prompt).not.toContain(base.idea);
 });
 it("reveals only grounded curriculum idea at final tier",()=>{
  const x=progressiveHint({...base,level:3});
  expect(x).toMatchObject({revealsConcept:true});
  expect(x.prompt).toContain("Hash map lookup");
 });
 it("does not hallucinate missing objectives",()=>{
  expect(progressiveHint({...base,idea:null,level:3}).prompt).toContain("No verified");
 });
 it("rejects invalid requests",()=>{
  expect(()=>progressiveHint({...base,level:0 as 1})).toThrow();
 });
});
