import {describe,it,expect} from "vitest";
import {ARCHIVE_TABLES,makeRestorePlan,validateLearningArchive} from "./learning-restore";
const archive=()=>{
 const records=Object.fromEntries(ARCHIVE_TABLES.map(t=>[t,[]])) as Record<string,Record<string,unknown>[]>;
 records.curriculum_items=[{id:"p1",title:"Two Sum"}];
 records.item_progress=[{id:"state1",item_id:"p1"}];
 return {schema:"coding-intuition-learning-archive",version:1,exported_at:"2026-10-17T00:00:00Z",records};
};
describe("portable archive round-trip readiness",()=>{
 it("accepts a versioned archive and provides a no-write plan",()=>{
  const plan=makeRestorePlan(archive());
  expect(plan).toMatchObject({ok:true,mode:"dry_run_only",counts:{curriculum_items:1,item_progress:1}});
 });
 it("rejects changed archive versions",()=>{expect(validateLearningArchive({...archive(),version:2}).ok).toBe(false)});
 it("rejects missing table exports",()=>{
  const a=archive();delete a.records.review_log;
  expect(validateLearningArchive(a).ok).toBe(false);
 });
 it("rejects broken references and duplicate IDs",()=>{
  const a=archive();a.records.item_progress[0].item_id="missing";
  expect(validateLearningArchive(a)).toMatchObject({ok:false});
  const b=archive();b.records.curriculum_items.push({...b.records.curriculum_items[0]});
  expect(validateLearningArchive(b).ok).toBe(false);
 });
 it("rejects duplicate evidence provenance",()=>{
  const a=archive();a.records.platform_evidence=[{item_id:"p1",user_id:"u1",source:"github",provenance_id:"one"},{item_id:"p1",user_id:"u1",source:"github",provenance_id:"one"}];
  expect(validateLearningArchive(a).ok).toBe(false);
 });
});
