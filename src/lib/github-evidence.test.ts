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
 it("matches numbered LeetCode-Challenge file paths",()=>{
  const r=indexPublicSolutions("test-user/LeetCode-Challenge","main",[{path:"0098-validate-binary-search-tree/0098-validate-binary-search-tree.cpp",type:"blob"}],[{id:"98",title:"Validate Binary Search Tree"}]);
  expect(r).toHaveLength(1);
  expect(r[0]).toMatchObject({itemId:"98",accepted:false});
 });
 it("matches numbered and marked imported curriculum titles",()=>{
  const r=indexPublicSolutions("test-user/LeetCode-Challenge","main",[{path:"0098-validate-binary-search-tree/0098-validate-binary-search-tree.cpp",type:"blob"}],[{id:"bst",title:"98. Validate Binary Search Tree  ⭐"}]);
  expect(r).toHaveLength(1);
  expect(r[0].itemId).toBe("bst");
 });
 it("matches title aliases through canonical LeetCode ID without inferring acceptance",()=>{
  const r=indexPublicSolutions("test-user/LeetCode-Challenge","main",[{path:"0098-validate-binary-search-tree/0098-validate-binary-search-tree.cpp",type:"blob"}],[{id:"98",title:"Validate BST",leetcode_id:98}]);
  expect(r).toHaveLength(1);
  expect(r[0].accepted).toBe(false);
 });
 it("rejects duplicate ambiguous roadmap matches",()=>{
  const r=indexPublicSolutions("test-user/dsa","main",[{path:"two_sum.py",type:"blob"}],
  [{id:"1",title:"Two Sum"},{id:"2",title:"two-sum"}]);
  expect(r).toEqual([]);
 });
});