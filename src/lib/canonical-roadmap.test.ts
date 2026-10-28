import {describe,expect,it} from "vitest";
import canonical from "../../data/canonical-roadmap-188.json";

describe("canonical curriculum contract",()=>{
 it("contains exactly 188 ordered and uniquely positioned problems",()=>{
   expect(canonical).toHaveLength(188);
   expect(canonical.map(x=>x.position)).toEqual(Array.from({length:188},(_,i)=>i+1));
   expect(new Set(canonical.map(x=>x.position)).size).toBe(188);
 });
 it("never loses learning objectives or priority information",()=>{
   for(const row of canonical){
     expect(row.title.trim().length).toBeGreaterThan(0);
     expect(row.topic.trim().length).toBeGreaterThan(0);
     expect(row.idea.trim().length).toBeGreaterThan(0);
     expect(row.priority_marker.trim().length).toBeGreaterThan(0);
     if(!row.concept_only)expect(row.leetcode_id).toBeTypeOf("number");
   }
 });
 it("preserves source identifiers for LeetCode solution matching",()=>{
   const bst=canonical.find(x=>x.title==="Validate BST");
   expect(bst).toMatchObject({leetcode_id:98,concept_only:false});
 });
});
