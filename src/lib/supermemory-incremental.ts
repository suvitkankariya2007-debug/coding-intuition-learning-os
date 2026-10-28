/** Incremental Supermemory observation index, independent of any paid model or database.
 * The caller supplies provider memory IDs and versions; it must not claim completeness
 * unless the provider has returned all pages or a documented cursor.
 */
export type MemoryRevision={id:string;version:number;content:string;updatedAt:string;isForgotten?:boolean;isLatest?:boolean};
export type MemoryDelta={id:string;version:number;content:string|null;updatedAt:string;action:"upsert"|"forget"};
export type MemoryCursor={versions:Record<string,number>;lastCheckedAt:string|null};
export type DeltaBatch={cursor:MemoryCursor;changes:MemoryDelta[];seen:number;complete:boolean};
export function reconcileMemoryBatch(cursor:MemoryCursor,observations:MemoryRevision[],complete=false,now=new Date().toISOString()):DeltaBatch{
 if(observations.length>500)throw Error("Batch too large");
 const versions={...cursor.versions};const changes:MemoryDelta[]=[];
 const seen=new Set<string>();
 for(const memory of observations){
  if(!memory.id||memory.id.length>150||!Number.isSafeInteger(memory.version)||memory.version<1||!Number.isFinite(Date.parse(memory.updatedAt)))throw Error("Invalid memory revision");
  if(seen.has(memory.id))continue;seen.add(memory.id);
  if(memory.isLatest===false)continue;
  if(memory.version<=(versions[memory.id]??0))continue;
  if(typeof memory.content!=="string"||memory.content.length>5000)throw Error("Invalid memory content");
  versions[memory.id]=memory.version;
  changes.push({id:memory.id,version:memory.version,content:memory.isForgotten?null:memory.content,updatedAt:memory.updatedAt,action:memory.isForgotten?"forget":"upsert"});
 }
 return {cursor:{versions,lastCheckedAt:complete?now:cursor.lastCheckedAt},changes,seen:seen.size,complete};
}
export function memoryRefreshNeeded(lastCheckedAt:string|null,now=Date.now(),intervalMs=6*60*60*1000):boolean{
 return !lastCheckedAt||!Number.isFinite(Date.parse(lastCheckedAt))||now-Date.parse(lastCheckedAt)>=intervalMs;
}
