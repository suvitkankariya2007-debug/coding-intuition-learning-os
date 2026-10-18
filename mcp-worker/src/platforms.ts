import { curriculum } from './learning';
import { fetchTimed, type Env } from './config';
import { normalizedTitle } from '../../src/lib/submission-evidence';
import type { Evidence } from '../../src/lib/evidence-intelligence';

const headers={'User-Agent':'Coding-Intuition-Learning/0.1','Accept':'application/json'};
export async function publicJson(url:string,init:RequestInit={}) {
  const response=await fetchTimed(url,{...init,headers:{...headers,...init.headers}});
  if(!response.ok)throw Error(`Public source returned HTTP ${response.status}`);
  return response.json() as Promise<any>;
}
export function mapGithub(tree:any[],repo:string,sha:string):Evidence[] {
  // Exporter folder numbers are NOT LeetCode frontend IDs. Match normalized names only.
  const byName=new Map<string,string>();const duplicates=new Set<string>();
  for(const p of curriculum){const key=normalizedTitle(p.title);if(byName.has(key))duplicates.add(key);else byName.set(key,p.id);}
  for(const k of duplicates)byName.delete(k);
  return tree.flatMap(f=>{
    if(f.type!=='blob'||typeof f.path!=='string'||!(/\.(cpp|cc|c|py|java|js|ts|go|rs|kt|cs)$/i.test(f.path)))return [];
    const filename=f.path.split('/').pop()!.replace(/\.[^.]+$/,'');
    const stem=filename.replace(/^\d+[-_ ]+/, '');
    const itemId=byName.get(normalizedTitle(stem));
    if(!itemId)return [];
    return [{itemId,source:'github' as const,accepted:false,observedAt:new Date().toISOString(),provenanceId:`github:${repo}:${f.path}`,codeUrl:`https://github.com/${repo}/blob/${sha}/${f.path.split('/').map(encodeURIComponent).join('/')}`}];
  });
}
export async function fetchSource(source:string,env:Env,cursor=1) {
  const checkedAt=new Date().toISOString();
  if(source==='leetcode') {
    if(!/^[A-Za-z0-9_-]{1,40}$/.test(env.LEETCODE_USERNAME))throw Error('Invalid LeetCode username');
    const body=await publicJson('https://leetcode.com/graphql/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'query($username:String!){ matchedUser(username:$username){username submitStatsGlobal{acSubmissionNum{difficulty count}}} recentAcSubmissionList(username:$username,limit:20){id titleSlug timestamp} }',variables:{username:env.LEETCODE_USERNAME}})});
    if(body.errors||!body.data?.matchedUser||!Array.isArray(body.data?.recentAcSubmissionList))throw Error('LeetCode public profile unavailable');
    const rows=body.data.recentAcSubmissionList.slice(0,20);
    const slugs=[...new Set(rows.map((r:any)=>r.titleSlug).filter((s:unknown)=>typeof s==='string'&&/^[a-z0-9-]{1,150}$/.test(s)))] as string[];
    const ids:Record<string,number>={};
    if(slugs.length) {
      const query='{'+slugs.map((slug,i)=>`q${i}:question(titleSlug:${JSON.stringify(slug)}){questionFrontendId titleSlug}`).join(' ')+'}';
      const resolved=await publicJson('https://leetcode.com/graphql/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});
      if(resolved.errors)throw Error('Unable to verify LeetCode problem IDs');
      for(const value of Object.values(resolved.data??{}) as any[])if(value&&Number.isSafeInteger(Number(value.questionFrontendId)))ids[value.titleSlug]=Number(value.questionFrontendId);
    }
    const evidence:Evidence[]=rows.flatMap((r:any)=>{
      const candidates=curriculum.filter(p=>p.leetcode_id===ids[r.titleSlug]&&!p.concept_only);
      if(candidates.length!==1||!Number.isFinite(Number(r.timestamp))||!/^[0-9]+$/.test(String(r.id)))return [];
      return [{itemId:candidates[0].id,source:'leetcode' as const,accepted:true,verdict:'Accepted',observedAt:new Date(Number(r.timestamp)*1000).toISOString(),provenanceId:`lc:${r.id}`}];
    });
    return {evidence,status:{checkedAt,available:true,username:env.LEETCODE_USERNAME,coverage:'recent_accepted_only',historyComplete:false,publicAcceptedTotals:body.data.matchedUser.submitStatsGlobal?.acSubmissionNum??[],observed:rows.length}};
  }
  if(source==='codeforces') {
    if(!/^[A-Za-z0-9_.-]{1,40}$/.test(env.CODEFORCES_HANDLE)||!Number.isSafeInteger(cursor)||cursor<1||cursor>100001)throw Error('Invalid Codeforces cursor');
    const data=await publicJson(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(env.CODEFORCES_HANDLE)}&from=${cursor}&count=1000`);
    if(data.status!=='OK'||!Array.isArray(data.result))throw Error('Codeforces profile unavailable');
    const observations=data.result.filter((r:any)=>Number.isSafeInteger(r.id)&&r.problem?.contestId&&r.problem?.index).map((r:any)=>({id:r.id,problemRef:`cf:${r.problem.contestId}${r.problem.index}`,accepted:r.verdict==='OK',verdict:r.verdict??null,tags:r.problem.tags??[],timestamp:r.creationTimeSeconds}));
    return {evidence:[],observations,status:{checkedAt,available:true,handle:env.CODEFORCES_HANDLE,coverage:'page',pageFrom:cursor,observed:observations.length,nextCursor:data.result.length===1000?cursor+1000:null,historyComplete:cursor===1&&data.result.length<1000,note:'Codeforces IDs remain distinct from LeetCode curriculum items.'}};
  }
  if(source==='github') {
    const repo=env.GITHUB_SOLUTIONS_REPO;
    if(!repo||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw Error('GitHub solutions repository is not configured');
    const metadata=await publicJson(`https://api.github.com/repos/${repo}`);
    const tree=await publicJson(`https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(metadata.default_branch)}?recursive=1`);
    if(!Array.isArray(tree.tree)||typeof tree.sha!=='string')throw Error('GitHub tree unavailable');
    const entries=tree.tree.filter((f:any)=>!env.GITHUB_SOLUTIONS_PATH||f.path?.startsWith(env.GITHUB_SOLUTIONS_PATH+'/'));
    const evidence=mapGithub(entries,repo,tree.sha);
    return {evidence,status:{checkedAt,available:true,repo,commit:tree.sha,historyComplete:!tree.truncated,coverage:'current_public_tree',matched: evidence.length,note:'Code locations are not accepted verdicts.'}};
  }
  throw Error('Unknown source');
}
