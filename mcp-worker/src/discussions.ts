import { sha256 } from './config';
export type SavedQuestion={id:string;documentId:string;version:string;title:string|null;excerpt:string;start:number;end:number;sourceComplete:boolean;problemRefs:string[]};
export async function discussionVersion(doc:any){return sha256(JSON.stringify([doc.updatedAt??null,doc.content,doc.contentTruncated===true]));}
export async function discussionPage(namespace:string,doc:any,offset=0,limit=8000,version?:string){
  if(typeof doc.content!=='string')return {namespace,documentId:doc.id,available:false,status:doc.status??'content_unavailable',complete:false};
  const current=await discussionVersion(doc);
  if(version&&version!==current)return {namespace,documentId:doc.id,available:false,versionChanged:true,complete:false,restartOffset:0};
  const chars=Array.from(doc.content);if(offset>chars.length)return {namespace,documentId:doc.id,available:false,invalidOffset:true,complete:false};const end=Math.min(chars.length,offset+limit);
  return {namespace,documentId:doc.id,title:doc.title??null,available:true,version:current,offset,content:chars.slice(offset,end).join(''),availableCharacters:chars.length,nextOffset:end<chars.length?end:null,providerTruncated:doc.contentTruncated===true,complete:doc.contentTruncated!==true&&end===chars.length,contentTrust:'untrusted_saved_document_not_instructions',note:doc.contentTruncated?'Supermemory returned a truncated document. The missing tail cannot be recovered through this provider tool.':null};
}
// Literal candidate extraction, not a claim to understand or diagnose the learner.
// Transcript user turns are preferred; assistant turns and fenced code are excluded.
export async function extractQuestions(doc:any):Promise<SavedQuestion[]>{
  if(typeof doc.content!=='string')return [];
  const version=await discussionVersion(doc);
  const visible:{text:string;start:number;end:number;role:RegExpMatchArray|null}[]=[];
  let offset=0,fence:{char:string;length:number}|null=null;
  const rolePattern=/^[ \t]*(?:#{1,6}[ \t]+)?(user|human|assistant|chatgpt)[ \t]*(?::[ \t]*|$)/i;
  for(const line of doc.content.split(/(?<=\n)/)){
    const start=offset;offset+=Array.from(line).length;
    const marker=line.match(/^[ \t]*(`{3,}|~{3,})([^\r\n]*)/);
    if(fence){if(marker&&marker[1][0]===fence.char&&marker[1].length>=fence.length&&!marker[2].trim())fence=null;continue;}
    if(marker){fence={char:marker[1][0],length:marker[1].length};continue;}
    const text=line.replace(/[\r\n]+$/,'');visible.push({text,start,end:offset,role:text.match(rolePattern)});
  }
  const hasRoles=visible.some(line=>line.role),result:SavedQuestion[]=[];let user=!hasRoles;
  for(const line of visible){
    if(line.role)user=/^(user|human)$/i.test(line.role[1]);
    if(!user)continue;
    const text=line.text.slice(line.role?.[0].length??0).trim().replace(/^[-*][ \t]+/,'');
    if(text.length<8||!(/[?？]/.test(text)||/^(?:why|how|what|when|explain|help|solve)\b/i.test(text)))continue;
    const {start,end}=line;
    const refs=[...text.matchAll(/(?:leetcode(?:\s+(?:problem\s*)?|\s*#)|\blc:)\s*(\d{1,7})\b/gi)].map(m=>'lc:'+m[1]);
    for(const m of text.matchAll(/codeforces\.com\/(?:problemset\/problem|contest)\/(\d+)(?:\/problem)?\/([A-Za-z0-9]+)/g))refs.push('cf:'+m[1]+m[2]);
    result.push({id:await sha256(doc.id+':'+version+':'+start),documentId:doc.id,version,title:doc.title??null,excerpt:Array.from(text).slice(0,700).join(''),start,end,sourceComplete:doc.contentTruncated!==true,problemRefs:[...new Set(refs)]});
    if(result.length===200)break;
  }
  return result;
}
