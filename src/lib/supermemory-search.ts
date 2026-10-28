import {memoryCache,validateMemorySearchResponse,type MemoryMatch} from "./memory-cache";
const EXACT_NAMESPACE="leetcode_problems";
const SEARCH_LIMIT=5;
/** Targeted retrieval only. Full-space scans are never triggered by recommendation requests. */
export function normalizeLearningQuery(raw:string):string{
 const query=raw.trim().replace(/\s+/g," ");
 if(query.length<3||query.length>250)throw Error("Invalid memory search query");
 return query;
}
export type MemoryPatternResult={
 namespace:typeof EXACT_NAMESPACE;
 query:string; items:MemoryMatch[];cache:"hit"|"miss";
 interpretation:"context_only_not_mastery";
};
/** Query only the approved learning namespace; never merge personal profile or other projects. */
export async function findLearningMemories(userId:string,query:string):Promise<MemoryPatternResult>{
 const key=process.env.SUPERMEMORY_API_KEY;
 if(!key)throw Error("Supermemory search unavailable: missing API key");
 if(process.env.SUPERMEMORY_NAMESPACE!==EXACT_NAMESPACE)throw Error("Supermemory namespace mismatch");
 const trimmed=normalizeLearningQuery(query);
 const value=await memoryCache.get(userId,trimmed,async()=>{
   const response=await fetch("https://api.supermemory.ai/ns/leetcode_problems/search",{
     method:"POST",
     headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},
     body:JSON.stringify({query:trimmed,searchMode:"memories",limit:SEARCH_LIMIT,threshold:0.3,
       filter:{field:"userId",operator:"eq",value:userId}}),
     signal:AbortSignal.timeout(12000)
   });
   if(!response.ok)throw Error(`Supermemory search returned HTTP ${response.status}`);
   return validateMemorySearchResponse(await response.json());
 });
 return {namespace:EXACT_NAMESPACE,query:trimmed,items:value.items,cache:value.cache,
   interpretation:"context_only_not_mastery"};
}
