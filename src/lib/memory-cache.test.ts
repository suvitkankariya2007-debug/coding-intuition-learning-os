import {describe,it,expect,vi} from "vitest";
import {MemoryCache,validateMemorySearchResponse} from "./memory-cache";
describe("Supermemory caching and response fidelity",()=>{
 const sample=[{id:"m1",content:"Use backward traversal for in-place merge",score:0.8}];
 it("caches only in the exact user's namespace and query scope",async()=>{
  const cache=new MemoryCache(1000);
  const fetcher=vi.fn(async()=>sample);
  expect((await cache.get("u1","merge",fetcher,100)).cache).toBe("miss");
  expect((await cache.get("u1","merge",fetcher,500)).cache).toBe("hit");
  expect((await cache.get("u2","merge",fetcher,500)).cache).toBe("miss");
  expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it("expires and never gives stale evidence on upstream failure",async()=>{
  const cache=new MemoryCache(200);
  await cache.get("u1","merge",async()=>sample,100);
  await expect(cache.get("u1","merge",async()=>{throw Error("upstream offline")},500)).rejects.toThrow("offline");
 });
 it("invalidates only the target user's cached evidence",async()=>{
  const cache=new MemoryCache(1000);
  await cache.get("u1","merge",async()=>sample,100);
  await cache.get("u2","merge",async()=>sample,100);
  cache.invalidate("u1");
  expect((await cache.get("u1","merge",async()=>sample,200)).cache).toBe("miss");
  expect((await cache.get("u2","merge",async()=>sample,200)).cache).toBe("hit");
 });
 it("rejects malformed or unsourced results instead of inventing patterns",()=>{
  expect(validateMemorySearchResponse({results:[{id:"m1",memory:"Hint progressively",similarity:0.7}]}))
    .toEqual([{id:"m1",content:"Hint progressively",score:0.7}]);
  expect(validateMemorySearchResponse({results:[{memory:"missing id",similarity:0.9}]})).toEqual([]);
  expect(()=>validateMemorySearchResponse({error:"rate limit"})).toThrow();
 });
});
