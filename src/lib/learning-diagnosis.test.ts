import {describe,it,expect} from "vitest";
import {diagnoseWeaknesses} from "./learning-diagnosis";
describe("learning diagnosis",()=>{
 const rows=[
  {itemId:"a",reviewedAt:"2026-10-17T01:00:00Z",grade:1,mistakeClass:"base-case",hintStage:"deeper",confidence:2},
  {itemId:"b",reviewedAt:"2026-10-17T02:00:00Z",grade:2,mistakeClass:"base-case",hintStage:"none",confidence:2},
  {itemId:"c",reviewedAt:"2026-10-17T03:00:00Z",grade:4,mistakeClass:"boundary",hintStage:"none",confidence:4}
 ];
 it("prioritizes repeated low-recall concepts",()=>{
   const x=diagnoseWeaknesses(rows);
   expect(x[0]).toMatchObject({pattern:"base-case",occurrences:2,lowRecall:2,hintDependent:1,affectedProblems:2});
   expect(x[0].recommendation).toContain("stopping condition");
 });
 it("does not infer mastery or hallucinate from unknown labels",()=>{
   expect(diagnoseWeaknesses([{...rows[0],mistakeClass:"accepted"}])).toEqual([]);
 });
 it("deduplicates replayed review events",()=>{
   expect(diagnoseWeaknesses([rows[0],rows[0]])[0].occurrences).toBe(1);
 });
 it("bounds result lengths and rejects invalid grades",()=>{
   expect(diagnoseWeaknesses([...rows,{...rows[0],grade:9,reviewedAt:"2026-10-18"}],1)).toHaveLength(1);
 });
});
