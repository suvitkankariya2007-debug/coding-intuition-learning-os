import {createServerFn} from "@tanstack/react-start";
import {requireSupabaseAuth} from "@/integrations/supabase/auth-middleware";
import {indexPublicSolutions,type GitTreeEntry} from "@/lib/github-evidence";

type RepoResponse={default_branch?:string;private?:boolean};
type TreeResponse={tree?:GitTreeEntry[];truncated?:boolean};
async function readGitHub(path:string) {
 const response=await fetch("https://api.github.com"+path,{
  headers:{"Accept":"application/vnd.github+json","User-Agent":"Coding-Intuition-Learning-OS"},
  signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw new Error(`GitHub public API returned HTTP ${response.status}`);
 return response.json() as Promise<unknown>;
}
export const syncPublicGitHubSolutions=createServerFn({method:"POST"})
 .middleware([requireSupabaseAuth])
 .inputValidator((data:{repository:string})=>{
   if(!/^[a-zA-Z0-9-]{1,39}\/[-a-zA-Z0-9_.]{1,100}$/.test(data.repository) || data.repository.includes(".."))
     throw new Error("Enter a valid public owner/repository");
   return data;
 })
 .handler(async({data,context})=>{
   const {supabase,userId}=context;
   const {data:catalog,error}=await supabase.from("curriculum_items").select("id,title");
   if(error)throw new Error("Cannot read curriculum");
   const details=await readGitHub(`/repos/${data.repository}`) as RepoResponse;
   if(details.private)throw new Error("Private repository requires separate GitHub authorization");
   const branch=details.default_branch;
   if(!branch || !/^[\w./-]{1,150}$/.test(branch))throw new Error("Unknown GitHub default branch");
   const tree=await readGitHub(`/repos/${data.repository}/git/trees/${encodeURIComponent(branch)}?recursive=1`) as TreeResponse;
   if(!Array.isArray(tree.tree))throw new Error("GitHub tree response unavailable");
   if(tree.truncated)throw new Error("GitHub returned a truncated tree; refusing an incomplete index");
   const evidence=indexPublicSolutions(data.repository,branch,tree.tree,catalog);
   if(evidence.length){
     const {error:saveError}=await supabase.from("platform_evidence").upsert(evidence.map(e=>({
       user_id:userId,item_id:e.itemId,source:"github",provenance_id:e.provenanceId,
       accepted:false,verdict:null,code_url:e.codeUrl,observed_at:e.observedAt,synced_at:new Date().toISOString()
     })),{onConflict:"user_id,source,provenance_id"});
     if(saveError)throw new Error("Unable to save public GitHub file matches");
   }
   return {matched:evidence.length,scanned:tree.tree.length,
     note:"Code files are revision references only; none are marked accepted."};
 });
