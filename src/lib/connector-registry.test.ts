import {describe,it,expect} from "vitest";
import {ConnectorRegistry,type ConnectorBatch} from "./connector-registry";
const ctx={userId:"local-test",now:"2026-10-17T00:00:00Z"};
const valid:ConnectorBatch={records:[{source:"atcoder",externalId:"abc-1",problemKey:"abc001_a",observedAt:ctx.now,verdict:"AC",accepted:true}],nextCursor:null,complete:true,warnings:[]};
describe("versioned source registry contract",()=>{
 it("adds a new site without changing intelligence code",async()=>{
  const r=new ConnectorRegistry();r.register({id:"atcoder",version:1,pull:async()=>valid});
  expect(r.list()).toEqual(["atcoder"]);
  expect((await r.sync("atcoder",ctx)).records[0]).toMatchObject({source:"atcoder",accepted:true});
 });
 it("rejects duplicate adapter registrations",()=>{
  const r=new ConnectorRegistry();const a={id:"atcoder",version:1 as const,pull:async()=>valid};
  r.register(a);expect(()=>r.register(a)).toThrow(/already/);
 });
 it("rejects source spoofing and duplicate records",async()=>{
  const r=new ConnectorRegistry();r.register({id:"atcoder",version:1,pull:async()=>({...valid,records:[{...valid.records[0],source:"leetcode"}]})});
  await expect(r.sync("atcoder",ctx)).rejects.toThrow(/Invalid/);
 });
 it("requires forward-moving cursor for multi-page sync",async()=>{
  const r=new ConnectorRegistry();r.register({id:"atcoder",version:1,pull:async()=>({...valid,complete:false,nextCursor:"same"})});
  await expect(r.sync("atcoder",ctx,"same")).rejects.toThrow(/advance/);
 });
 it("prevents oversized and malformed batches",async()=>{
  const r=new ConnectorRegistry();r.register({id:"atcoder",version:1,pull:async()=>({...valid,records:Array(1001).fill(valid.records[0])})});
  await expect(r.sync("atcoder",ctx)).rejects.toThrow(/Oversized/);
 });
});
