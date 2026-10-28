import slugAliases from "../../data/leetcode-slug-aliases.json";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { indexTitles, cleanCurriculumTitle, normalizeCodeforces, normalizeLeetCode, type CodeforcesSubmission, type LeetCodeSubmission } from "@/lib/submission-evidence";
import type { Evidence } from "@/lib/evidence-intelligence";

const userNamePattern = /^[a-zA-Z0-9_.-]{1,40}$/;
const query = `query recentAcSubmissions($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    id titleSlug timestamp
  }
}`;

async function jsonWithTimeout(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return response.json();
}
function slugIndex(rows: { id:string; title:string; url:string|null; leetcode_id:number|null }[]) {
  const names = new Map<string,string>();
  const conflicted = new Set<string>();
  for (const row of rows) {
    let slug: string | undefined;
    try {
      const u = new URL(row.url ?? "");
      if (u.hostname === "leetcode.com" || u.hostname === "www.leetcode.com") {
        slug = u.pathname.match(/^\/problems\/([a-z0-9-]+)/)?.[1];
      }
    } catch { /* URL missing: use normalized title below */ }
    const key = slug ?? cleanCurriculumTitle(row.title).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const aliases = [key, row.leetcode_id ? slugAliases[String(row.leetcode_id) as keyof typeof slugAliases] : undefined].filter((x):x is string=>!!x);
    for(const alias of aliases) {
      if(names.has(alias) && names.get(alias) !== row.id) conflicted.add(alias);
      else names.set(alias,row.id);
    }
  }
  for (const key of conflicted) names.delete(key);
  return names;
}
export const syncPublicPlatforms = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {leetcode:string;codeforces:string}) => {
    if (!userNamePattern.test(data.leetcode) || !userNamePattern.test(data.codeforces)) throw new Error("Invalid public profile handle");
    return data;
  })
  .handler(async ({data,context}) => {
    const {supabase,userId} = context;
    const {data:rows,error:catalogError} = await supabase.from("curriculum_items").select("id,title,url,leetcode_id").eq("is_active",true);
    if (catalogError) throw new Error("Unable to load your curriculum");
    const titles = indexTitles(rows);
    const slugs = slugIndex(rows);
    const evidence:Evidence[] = [];
    const errors:string[] = [];
    try {
      const url = new URL("https://codeforces.com/api/user.status");
      url.searchParams.set("handle",data.codeforces);
      url.searchParams.set("from","1");
      url.searchParams.set("count","100");
      const response = await jsonWithTimeout(url.href) as {status:string;result?:CodeforcesSubmission[]};
      if (response.status !== "OK" || !Array.isArray(response.result)) throw new Error("Invalid API response");
      evidence.push(...normalizeCodeforces(response.result,titles));
    } catch (e) { errors.push(`Codeforces: ${e instanceof Error ? e.message : "Unavailable"}`); }
    try {
      const response = await jsonWithTimeout("https://leetcode.com/graphql/", {
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({query,variables:{username:data.leetcode,limit:30}})
      }) as {data?:{recentAcSubmissionList?:LeetCodeSubmission[]}; errors?:unknown};
      if (response.errors || !Array.isArray(response.data?.recentAcSubmissionList)) throw new Error("Public accepted submission query unavailable");
      evidence.push(...normalizeLeetCode(response.data.recentAcSubmissionList.map(s=>({...s,statusDisplay:"Accepted"})),slugs));
    } catch (e) { errors.push(`LeetCode: ${e instanceof Error ? e.message : "Unavailable"}`); }
    if (evidence.length) {
      const {error} = await supabase.from("platform_evidence").upsert(
        evidence.map(e=>({user_id:userId,item_id:e.itemId,source:e.source,provenance_id:e.provenanceId,
          verdict:e.verdict ?? null,accepted:e.accepted===true,observed_at:e.observedAt,
          synced_at:new Date().toISOString()})),
        {onConflict:"user_id,source,provenance_id"});
      if (error) throw new Error("Failed to save verified platform observations");
    }
    return {matched:evidence.length, errors, limitedTo:"Codeforces last 100; LeetCode last 30 public accepted"};
  });
