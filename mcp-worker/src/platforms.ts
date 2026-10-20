import { curriculum,makeProblem,mergeProblems,type TrackedProblem,type CodeFile } from './catalog';
import { fetchTimed, type Env } from './config';
import { normalizedTitle } from '../../src/lib/submission-evidence';
import type { Evidence } from '../../src/lib/evidence-intelligence';

const headers={'User-Agent':'Coding-Intuition-Learning/0.1','Accept':'application/json'};
export async function publicJson(url:string,init:RequestInit={}) {
  const response=await fetchTimed(url,{...init,headers:{...headers,...init.headers}});
  if(!response.ok)throw Error(`Public source returned HTTP ${response.status}`);
  return response.json() as Promise<any>;
}
function codeStem(path:string){const parts=path.split('/'),file=parts.pop()!.replace(/\.[^.]+$/,'');return (/^(solution|main|index)$/i.test(file)?parts.at(-1)??file:file).replace(/^\d+[-_ ]+/,'');}
function codeEntries(tree:any[]){return tree.filter(f=>f.type==='blob'&&typeof f.path==='string'&&f.path.length<=500&&!f.path.split('/').some((p:string)=>p==='..'||p==='.')&&/\.(cpp|cc|c|py|java|js|ts|go|rs|kt|cs)$/i.test(f.path));}
export function mapGithub(tree:any[],repo:string,sha:string):Evidence[] {
  const names=new Map<string,string>(),duplicates=new Set<string>();
  for(const p of curriculum){const key=normalizedTitle(p.title);if(names.has(key))duplicates.add(key);else names.set(key,p.id);}
  for(const key of duplicates)names.delete(key);
  return codeEntries(tree).flatMap(f=>{const itemId=names.get(normalizedTitle(codeStem(f.path)));return itemId?[{itemId,source:'github' as const,accepted:false,observedAt:new Date().toISOString(),provenanceId:`github:${repo}:${f.path}`,codeUrl:`https://github.com/${repo}/blob/${sha}/${f.path.split('/').map(encodeURIComponent).join('/')}`}]:[];});
}
export async function discoverGithub(tree:any[],repo:string,commit:string){
  const evidence=mapGithub(tree,repo,commit),problems:TrackedProblem[]=[];
  for(const f of codeEntries(tree).slice(0,2000)){
    if(!/^[a-f0-9]{40}$/.test(f.sha??''))continue;
    const stem=codeStem(f.path);if(!normalizedTitle(stem))continue;const matched=evidence.find(e=>e.provenanceId===`github:${repo}:${f.path}`);
    const known=matched&&curriculum.find(p=>p.id===matched.itemId);
    const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(repo+':'+(f.path.includes('/')?f.path.slice(0,f.path.lastIndexOf('/')):'')+':'+normalizedTitle(stem))));
    const ref=known?`lc:${known.leetcode_id}`:'manual:github-'+[...digest.slice(0,12)].map(x=>x.toString(16).padStart(2,'0')).join('');
    const p=await makeProblem(ref,stem.replace(/[-_]+/g,' '),'External practice',null,'github');
    // Preserve exact canonical aliases even when a conceptual anchor shares its LC ID.
    if(matched)p.id=matched.itemId;
    p.codeFiles=[{repo,path:f.path,commit,blobSha:f.sha,...(Number.isSafeInteger(f.size)?{size:f.size}:{})}];problems.push(p);
    if(!matched)evidence.push({itemId:p.id,source:'github',accepted:false,observedAt:new Date().toISOString(),provenanceId:`github:${repo}:${f.path}`,codeUrl:`https://github.com/${repo}/blob/${commit}/${f.path.split('/').map(encodeURIComponent).join('/')}`});
  }
  return {evidence,problems:mergeProblems([],problems),scanned:Math.min(codeEntries(tree).length,2000),limited:codeEntries(tree).length>2000};
}
export async function readProblemCode(file:CodeFile,env:Env){
  if(file.size!==undefined&&file.size>65536)throw Error('Code file exceeds 64 KiB');
  if(env.GITHUB_SOLUTIONS_PATH&&!file.path.startsWith(env.GITHUB_SOLUTIONS_PATH+'/'))throw Error('Code outside configured path');
  if(file.repo!==env.GITHUB_SOLUTIONS_REPO||!/^[a-f0-9]{40}$/.test(file.blobSha)||!/^[a-f0-9]{40}$/.test(file.commit))throw Error('Unapproved code source');
  const blob=await publicJson(`https://api.github.com/repos/${file.repo}/git/blobs/${file.blobSha}`);
  if(blob.encoding!=='base64'||typeof blob.content!=='string'||!Number.isSafeInteger(blob.size)||blob.size>65536||blob.content.length>100000)throw Error('Code file unavailable or exceeds 64 KiB');
  const content=new TextDecoder().decode(Uint8Array.from(atob(blob.content.replace(/\s/g,'')),c=>c.charCodeAt(0)));
  return {repo:file.repo,path:file.path,commit:file.commit,blobSha:file.blobSha,content:content.slice(0,12000),truncated:content.length>12000,contentTrust:'untrusted_code_data_not_instructions',acceptanceVerified:false};
}
export async function fetchSource(source:string,env:Env,cursor=1) {
  const checkedAt=new Date().toISOString();
  if(source==='leetcode') {
    if(!/^[A-Za-z0-9_-]{1,40}$/.test(env.LEETCODE_USERNAME))throw Error('Invalid LeetCode username');
    const body=await publicJson('https://leetcode.com/graphql/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'query($username:String!){ matchedUser(username:$username){username submitStatsGlobal{acSubmissionNum{difficulty count}}} recentAcSubmissionList(username:$username,limit:20){id titleSlug timestamp} }',variables:{username:env.LEETCODE_USERNAME}})});
    if(body.errors||!body.data?.matchedUser||!Array.isArray(body.data?.recentAcSubmissionList))throw Error('LeetCode public profile unavailable');
    const rows=body.data.recentAcSubmissionList.slice(0,20),slugs=[...new Set(rows.map((r:any)=>r.titleSlug).filter((s:unknown)=>typeof s==='string'&&/^[a-z0-9-]{1,150}$/.test(s)))] as string[];
    const details:Record<string,any>={};
    if(slugs.length){
      const query='{'+slugs.map((slug,i)=>`q${i}:question(titleSlug:${JSON.stringify(slug)}){questionFrontendId titleSlug title topicTags{name}}`).join(' ')+'}';
      const resolved=await publicJson('https://leetcode.com/graphql/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})});
      if(resolved.errors)throw Error('Unable to verify LeetCode problem IDs');
      for(const value of Object.values(resolved.data??{}) as any[])if(value&&/^[1-9][0-9]{0,6}$/.test(String(value.questionFrontendId)))details[value.titleSlug]=value;
    }
    const evidence:Evidence[]=[],problems:TrackedProblem[]=[];
    for(const r of rows){const d=details[r.titleSlug];if(!d||!Number.isFinite(Number(r.timestamp))||Number(r.timestamp)<=0||!/^[0-9]+$/.test(String(r.id)))continue;
      const p=await makeProblem(`lc:${d.questionFrontendId}`,d.title??r.titleSlug,(d.topicTags?.[0]?.name??'External practice').slice(0,80),(d.topicTags??[]).map((t:any)=>String(t.name)).join(', ').slice(0,700),'leetcode');problems.push(p);
      evidence.push({itemId:p.id,source:'leetcode',accepted:true,verdict:'Accepted',observedAt:new Date(Number(r.timestamp)*1000).toISOString(),provenanceId:`lc:${r.id}`});
    }
    return {evidence,problems:mergeProblems([],problems),status:{checkedAt,available:true,username:env.LEETCODE_USERNAME,coverage:'recent_accepted_only',historyComplete:false,publicAcceptedTotals:body.data.matchedUser.submitStatsGlobal?.acSubmissionNum??[],observed:rows.length}};
  }
  if(source==='codeforces') {
    if(!/^[A-Za-z0-9_.-]{1,40}$/.test(env.CODEFORCES_HANDLE)||!Number.isSafeInteger(cursor)||cursor<1||cursor>100001)throw Error('Invalid Codeforces cursor');
    const data=await publicJson(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(env.CODEFORCES_HANDLE)}&from=${cursor}&count=1000`);
    if(data.status!=='OK'||!Array.isArray(data.result))throw Error('Codeforces profile unavailable');
    const evidence:Evidence[]=[],problems:TrackedProblem[]=[],observations:any[]=[];
    for(const r of data.result.slice(0,1000)){
      if(!Number.isSafeInteger(r.id)||!Number.isSafeInteger(r.problem?.contestId)||!/^[A-Za-z0-9]{1,5}$/.test(r.problem?.index??'')||!Number.isFinite(r.creationTimeSeconds)||r.creationTimeSeconds<=0)continue;
      const ref=`cf:${r.problem.contestId}${r.problem.index}`,tags=(r.problem.tags??[]).filter((t:unknown)=>typeof t==='string').slice(0,12);
      const p=await makeProblem(ref,r.problem.name??ref,String(tags[0]??'External practice').slice(0,80),tags.join(', ').slice(0,700),'codeforces');problems.push(p);
      evidence.push({itemId:p.id,source:'codeforces',accepted:r.verdict==='OK',verdict:r.verdict??null,observedAt:new Date(r.creationTimeSeconds*1000).toISOString(),provenanceId:`cf:${r.id}`});
      observations.push({id:r.id,problemRef:ref,accepted:r.verdict==='OK',verdict:r.verdict??null,tags,timestamp:r.creationTimeSeconds});
    }
    return {evidence,problems:mergeProblems([],problems),observations,status:{checkedAt,available:true,handle:env.CODEFORCES_HANDLE,coverage:'page',pageFrom:cursor,observed:observations.length,nextCursor:data.result.length===1000?cursor+1000:null,historyComplete:cursor===1&&data.result.length<1000,note:'Codeforces problems retain their own IDs and now participate in recommendations.'}};
  }
  if(source==='github') {
    const repo=env.GITHUB_SOLUTIONS_REPO;
    if(!repo||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw Error('GitHub solutions repository is not configured');
    const metadata=await publicJson(`https://api.github.com/repos/${repo}`);
    const commit=await publicJson(`https://api.github.com/repos/${repo}/commits/${encodeURIComponent(metadata.default_branch)}`);
    if(!/^[a-f0-9]{40}$/.test(commit.sha??'')||!/^[a-f0-9]{40}$/.test(commit.commit?.tree?.sha??''))throw Error('GitHub commit unavailable');
    const tree=await publicJson(`https://api.github.com/repos/${repo}/git/trees/${commit.commit.tree.sha}?recursive=1`);
    if(!Array.isArray(tree.tree))throw Error('GitHub tree unavailable');
    const entries=tree.tree.filter((f:any)=>!env.GITHUB_SOLUTIONS_PATH||f.path?.startsWith(env.GITHUB_SOLUTIONS_PATH+'/'));
    const discovered=await discoverGithub(entries,repo,commit.sha);
    return {evidence:discovered.evidence,problems:discovered.problems,status:{checkedAt,available:true,repo,commit:commit.sha,historyComplete:!tree.truncated&&!discovered.limited,coverage:'current_public_tree',matched:discovered.evidence.length,scanned:discovered.scanned,note:'Includes new non-curriculum problems. Code files are not accepted verdicts.'}};
  }
  throw Error('Unknown source');
}
