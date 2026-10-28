import canonical from '../../data/canonical-roadmap-188.json';
import { parseLearningEvent } from '../../src/lib/learning-events';

export const curriculum = canonical.map(row=>({...row,id:`18800000-0000-5000-8000-${String(row.position).padStart(12,'0')}`}));
export type CodeFile={repo:string;path:string;commit:string;blobSha:string;size?:number};
export type TrackedProblem={id:string;problemRef:string;title:string;topic:string;idea:string|null;origin:'curriculum'|'github'|'leetcode'|'codeforces'|'conversation';codeFiles?:CodeFile[]};
export function canonicalProblems():TrackedProblem[]{return curriculum.map(p=>({id:p.id,problemRef:`lc:${p.leetcode_id}`,title:p.title,topic:p.topic,idea:p.idea,origin:'curriculum'}));}
export async function makeProblem(problemRef:string,title?:string,topic='External practice',idea:string|null=null,origin:TrackedProblem['origin']='conversation'):Promise<TrackedProblem>{
  parseLearningEvent({clientEventId:'catalog-validation',problemRef,kind:'problem_attempt',summary:'Validate the external problem reference.',origin:'chatgpt'});
  if(typeof title!=='undefined'&&(typeof title!=='string'||title.length<1||title.length>200)||typeof topic!=='string'||topic.length>80||idea!==null&&(typeof idea!=='string'||idea.length>700))throw Error('Invalid problem metadata');
  const lc=problemRef.match(/^lc:(\d+)$/),known=lc?canonicalProblems().filter(p=>p.problemRef===problemRef&&!curriculum.find(c=>c.id===p.id)!.concept_only):[];
  if(known.length===1)return known[0];
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(problemRef)));
  bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes.slice(0,16)].map(x=>x.toString(16).padStart(2,'0')).join('');
  return {id:[hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-'),problemRef,title:title??problemRef,topic,idea,origin};
}
export function allProblems(extra:TrackedProblem[]=[]):TrackedProblem[]{
  const known=canonicalProblems(),byId=new Map(known.map(p=>[p.id,p]));
  for(const p of extra){const old=byId.get(p.id);byId.set(p.id,old?.origin==='curriculum'?{...old,codeFiles:p.codeFiles}:p);}
  return [...byId.values()];
}
export function mergeProblems(old:TrackedProblem[],incoming:TrackedProblem[]):TrackedProblem[]{
  const merged=new Map(old.map(p=>[p.id,p]));
  for(const p of incoming){const previous=merged.get(p.id);merged.set(p.id,{...previous,...p,codeFiles:[...new Map([...(previous?.codeFiles??[]),...(p.codeFiles??[])].map(f=>[f.repo+':'+f.path,f])).values()].slice(0,10)});}
  return [...merged.values()];
}
