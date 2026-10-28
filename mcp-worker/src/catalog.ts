import canonical from '../../data/canonical-roadmap-188.json';
import { parseLearningEvent } from '../../src/lib/learning-events';
import { CONCEPT_KEYS, type ConceptKey } from '../../src/lib/concept-graph';
import { z } from 'zod';

export const curriculum = canonical.map(row=>({...row,id:`18800000-0000-5000-8000-${String(row.position).padStart(12,'0')}`}));
export type CodeFile={repo:string;path:string;commit:string;blobSha:string;size?:number};
export type TrackedProblem={id:string;problemRef:string;title:string;topic:string;idea:string|null;origin:'curriculum'|'github'|'leetcode'|'codeforces'|'conversation'|'custom_catalog';codeFiles?:CodeFile[];catalogId?:string;catalogName?:string;externalId?:string;conceptKeys?:ConceptKey[];url?:string};
const conceptKeySchema=z.enum(CONCEPT_KEYS as [string,...string[]]);
function normalizedExternalId(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
export const importProblemCatalogSchema=z.object({
  catalogId:z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,27}$/),
  catalogName:z.string().trim().min(1).max(100),
  items:z.array(z.object({
    externalId:z.string().trim().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    title:z.string().trim().min(1).max(200),
    topic:z.string().trim().min(1).max(80),
    conceptKeys:z.array(conceptKeySchema).max(6).default([]),
    idea:z.string().trim().max(500).optional(),
    url:z.string().url().max(500).refine(value=>/^https?:\/\//i.test(value),'Only HTTP(S) links are supported').optional()
  }).strict()).min(1).max(50)
}).strict().superRefine((catalog,ctx)=>{
  const refs=new Set<string>();
  for(const [index,item] of catalog.items.entries()){
    const slug=normalizedExternalId(item.externalId);
    if(!slug){ctx.addIssue({code:'custom',path:['items',index,'externalId'],message:'External ID must contain letters or numbers.'});continue;}
    if(refs.has(slug))ctx.addIssue({code:'custom',path:['items',index,'externalId'],message:'External IDs must be unique after normalization.'});
    refs.add(slug);
  }
});
export type ImportedCatalog=z.infer<typeof importProblemCatalogSchema>;
export function customProblemRef(catalogId:string,externalId:string){
  const normalized=normalizedExternalId(externalId);
  // Keep the reference within the learning-event limit while distinguishing IDs
  // that share the same readable prefix. The full normalized ID feeds the suffix.
  let hash=0xcbf29ce484222325n;
  for(const character of normalized)hash=BigInt.asUintN(64,(hash^BigInt(character.codePointAt(0)!))*0x100000001b3n);
  const readable=normalized.slice(0,48);
  return `manual:cat-${catalogId}-${readable}-${hash.toString(36)}`;
}
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
