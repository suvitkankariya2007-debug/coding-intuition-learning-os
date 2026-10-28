/** Pure fault-isolating adapter runner shared by the unified sync UI. */
export type SyncSource="leetcode_codeforces"|"github";
export type SyncResult={
  source:SyncSource;
  status:"success"|"partial"|"failed";
  matched:number;
  warnings:string[];
};
const errorMessage=(e:unknown)=>e instanceof Error?e.message:"Unexpected source error";
export async function runUnifiedSync(
  adapters:ReadonlyArray<{source:SyncSource; run:()=>Promise<{matched:number;errors?:string[]}>}>
):Promise<{status:"success"|"partial"|"failed";matched:number;results:SyncResult[]}>{
  const seen=new Set<string>();
  for(const a of adapters){
    if(seen.has(a.source))throw Error("Duplicate integration source");
    seen.add(a.source);
  }
  const settled=await Promise.allSettled(adapters.map(a=>a.run()));
  const results:SyncResult[]=settled.map((r,i)=>{
    const source=adapters[i].source;
    if(r.status==="rejected")return {source,status:"failed",matched:0,warnings:[errorMessage(r.reason)]};
    const matched=r.value.matched;
    const errors=r.value.errors??[];
    if(!Number.isSafeInteger(matched)||matched<0||!Array.isArray(errors))
      return {source,status:"failed",matched:0,warnings:["Invalid integration response"]};
    return {source,status:errors.length?"partial":"success",matched,
      warnings:errors.filter((e):e is string=>typeof e==="string").slice(0,5).map(e=>e.slice(0,250))};
  });
  const success=results.filter(r=>r.status==="success").length;
  const failure=results.filter(r=>r.status==="failed").length;
  const status=results.length===0||failure===results.length?"failed":
    failure>0||results.some(r=>r.status==="partial")?"partial":"success";
  return {status,matched:results.reduce((n,r)=>n+r.matched,0),results};
}
