import {describe,it,expect} from "vitest";
import {runUnifiedSync} from "./sync-orchestrator";
describe("fault-isolated unified sync",()=>{
 it("keeps successful source results when another source fails",async()=>{
   const result=await runUnifiedSync([
     {source:"leetcode_codeforces",run:async()=>({matched:4,errors:["LeetCode: HTTP 429"]})},
     {source:"github",run:async()=>{throw new Error("GitHub offline");}}
   ]);
   expect(result).toMatchObject({status:"partial",matched:4,results:[
     {source:"leetcode_codeforces",status:"partial",matched:4},
     {source:"github",status:"failed",matched:0}
   ]});
 });
 it("reports independent clean successes",async()=>{
   expect(await runUnifiedSync([{source:"github",run:async()=>({matched:3})}]))
     .toMatchObject({status:"success",matched:3});
 });
 it("fails visibly when all sources fail",async()=>{
   expect((await runUnifiedSync([{source:"github",run:async()=>{throw Error("offline")}}])).status).toBe("failed");
 });
 it("rejects duplicate connectors before running any",async()=>{
   let calls=0;
   await expect(runUnifiedSync([
     {source:"github",run:async()=>{calls++;return {matched:1}}},
     {source:"github",run:async()=>{calls++;return {matched:1}}}
   ])).rejects.toThrow("Duplicate");
   expect(calls).toBe(0);
 });
 it("rejects malformed success counts",async()=>{
   const result=await runUnifiedSync([{source:"github",run:async()=>({matched:Number.NaN})}]);
   expect(result).toMatchObject({status:"failed",matched:0});
 });
});
