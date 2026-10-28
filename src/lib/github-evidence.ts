import type { Evidence } from "./evidence-intelligence";
import { indexTitles, normalizedTitle } from "./submission-evidence";

export type GitTreeEntry = {path?:string;type?:string;sha?:string};
const extension=/\.(?:cpp|cc|c|h|hpp|py|java|js|ts|go|rs|kt|cs|rb)$/i;
/** Exact basename matches only. A file is revision evidence, NEVER proof of acceptance. */
export function indexPublicSolutions(
  repo:string, branch:string, entries:GitTreeEntry[],
  items:{id:string;title:string;leetcode_id?:number|null}[],
  now=new Date().toISOString()
):Evidence[] {
 if(!/^[a-zA-Z0-9-]{1,39}\/[-a-zA-Z0-9_.]{1,100}$/.test(repo) || !/^[a-zA-Z0-9._/-]{1,150}$/.test(branch)) throw new Error("Invalid repository");
 const names=indexTitles(items);
 const idIndex=new Map<number,string>();
 const duplicateIds=new Set<number>();
 for(const item of items){
   if(!Number.isSafeInteger(item.leetcode_id) || !item.leetcode_id) continue;
   const n=item.leetcode_id;
   if(idIndex.has(n) && idIndex.get(n)!==item.id) duplicateIds.add(n);
   else idIndex.set(n,item.id);
 }
 for(const n of duplicateIds) idIndex.delete(n);
 const visited=new Set<string>();
 const matched:Evidence[]=[];
 for(const f of entries.slice(0,4000)){
   if(f.type!=="blob" || !f.path || !extension.test(f.path)) continue;
   const base=f.path.split("/").pop()!.replace(extension,"");
   const match=base.match(/^([0-9]{1,6})[-_ ]+/);
   const itemId=(match ? idIndex.get(Number(match[1])) : undefined) ?? names.get(normalizedTitle(base.replace(/^[0-9]{1,6}[-_ ]+/, "")));
   if(!itemId || visited.has(`${itemId}:${f.path}`)) continue;
   visited.add(`${itemId}:${f.path}`);
   const path=f.path.split("/").map(encodeURIComponent).join("/");
   matched.push({itemId,source:"github",accepted:false,observedAt:now,
     provenanceId:`github:${repo}:${f.path}`,
     codeUrl:`https://github.com/${repo}/blob/${encodeURIComponent(branch)}/${path}`});
 }
 return matched;
}
