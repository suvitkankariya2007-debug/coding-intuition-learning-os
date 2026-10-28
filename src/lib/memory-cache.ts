/** Isolated short-lived Supermemory retrieval cache. Never infer learner mastery from memories. */
export type MemoryMatch={id:string;content:string;score:number};
type Entry={expires:number;items:MemoryMatch[]};
export class MemoryCache {
 private entries=new Map<string,Entry>();
 private pending=new Map<string,Promise<MemoryMatch[]>>();
 constructor(private ttlMs=60_000, private maxEntries=100){}
 async get(userId:string,query:string,fetcher:()=>Promise<MemoryMatch[]>,now=Date.now()){
   if(!userId||!query.trim())throw new Error("Missing user or query");
   const key=JSON.stringify([userId,query.trim().toLowerCase()]);
   const cached=this.entries.get(key);
   if(cached&&cached.expires>now)return {items:cached.items,cache:"hit" as const};
   // Coalesce concurrent requests for the same learner/query; one upstream call per key.
   let promise=this.pending.get(key);
   if(!promise){
     promise=fetcher();
     this.pending.set(key,promise);
   }
   let items:MemoryMatch[];
   try{items=await promise;}finally{if(this.pending.get(key)===promise)this.pending.delete(key);}
   // Do not silently serve stale evidence on upstream failures.
   if(!Array.isArray(items)||items.some(x=>!x.id||!x.content||!Number.isFinite(x.score)))
     throw new Error("Invalid memory search response");
   this.entries.delete(key);
   this.entries.set(key,{items:items.slice(0,5),expires:now+this.ttlMs});
   if(this.entries.size>this.maxEntries)this.entries.delete(this.entries.keys().next().value!);
   return {items:items.slice(0,5),cache:"miss" as const};
 }
 invalidate(userId:string){
   for(const key of this.entries.keys())if(key.startsWith(JSON.stringify([userId]).slice(0,-1)+","))this.entries.delete(key);
 }
}
export const memoryCache=new MemoryCache();
export function validateMemorySearchResponse(input:unknown):MemoryMatch[]{
 if(!input||typeof input!=="object")throw Error("Invalid Supermemory response");
 const result=input as {results?:unknown};
 if(!Array.isArray(result.results))throw Error("Missing memory search results");
 return result.results.slice(0,5).flatMap((r:unknown)=>{
   if(!r||typeof r!=="object")return [];
   const entry=r as Record<string,unknown>;
   const content=typeof entry.memory==="string"?entry.memory:typeof entry.text==="string"?entry.text:null;
   const score=typeof entry.similarity==="number"?entry.similarity:typeof entry.score==="number"?entry.score:NaN;
   const id=typeof entry.id==="string"?entry.id:typeof entry.memoryId==="string"?entry.memoryId:"";
   return content&&id&&Number.isFinite(score)&&score>=0&&score<=1?[{id,content:content.slice(0,1400),score}]:[];
 });
}
