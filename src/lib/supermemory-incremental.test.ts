import {describe,it,expect} from "vitest";
import {reconcileMemoryBatch,memoryRefreshNeeded} from "./supermemory-incremental";
const memory={id:"mem-1",version:1,content:"Check the invariant before coding.",updatedAt:"2026-10-18T06:00:00Z",isLatest:true};
describe("incremental memory index",()=>{
 it("processes only new versions, not every repeated memory",()=>{
  const first=reconcileMemoryBatch({versions:{},lastCheckedAt:null},[memory],true,"2026-10-18T07:00:00Z");
  expect(first.changes).toHaveLength(1);
  expect(first.complete).toBe(true);
  const replay=reconcileMemoryBatch(first.cursor,[memory],true,"2026-10-18T08:00:00Z");
  expect(replay.changes).toEqual([]);
  expect(replay.cursor.versions["mem-1"]).toBe(1);
 });
 it("does not treat partial pagination as a complete sync",()=>{
  const result=reconcileMemoryBatch({versions:{},lastCheckedAt:null},[memory],false);
  expect(result.cursor.lastCheckedAt).toBeNull();
  expect(result.complete).toBe(false);
 });
 it("propagates forgotten versions as tombstones",()=>{
  const result=reconcileMemoryBatch({versions:{"mem-1":1},lastCheckedAt:null},[{...memory,version:2,isForgotten:true}],true);
  expect(result.changes).toEqual([{id:"mem-1",version:2,content:null,updatedAt:memory.updatedAt,action:"forget"}]);
 });
 it("limits refresh frequency without claiming background sync",()=>{
  expect(memoryRefreshNeeded("2026-10-18T06:00:00Z",Date.parse("2026-10-18T07:00:00Z"))).toBe(false);
  expect(memoryRefreshNeeded(null)).toBe(true);
 });
});
