import {describe,it,expect} from "vitest";
import {indexPublicSolutions} from "./github-evidence";
describe("GitHub code evidence",()=>{
 it("recognizes exact filenames only, never infers acceptance",()=>{
  const result=indexPublicSolutions("test-user/dsa","main",[
   {path:"solutions/two_sum.cpp",type:"blob",sha:"sha"},
   {path:"solutions/sum.cpp",type:"blob",sha:"other"},
   {path:"readme.md",type:"blob",sha:"md"}
  ],[{id:"1",title:"Two Sum"}],"2026-10-17T00:00:00Z");
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({itemId:"1",source:"github",accepted:false});
  expect(result[0].codeUrl).toContain("solutions/two_sum.cpp");
 });
 it("rejects duplicate ambiguous roadmap matches",()=>{
  const r=indexPublicSolutions("test-user/dsa","main",[{path:"two_sum.py",type:"blob"}],
  [{id:"1",title:"Two Sum"},{id:"2",title:"two-sum"}]);
  expect(r).toEqual([]);
 });
});