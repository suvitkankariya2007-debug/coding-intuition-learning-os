import {z} from 'zod';
import {stableId} from './continuity';
import {validatedCapture} from './session-capture';
import {inferCurriculumConcepts} from '../../src/lib/concept-graph';
const problemRef=z.string().regex(/^(lc:[0-9]{1,7}|cf:[0-9]{1,9}[A-Za-z0-9]{1,5}|manual:[a-z0-9][a-z0-9-]{2,95})$/);
export const contextSchema=z.strictObject({sessionId:stableId,checkpointId:stableId,coverage:z.enum(['available_current_chat','summary_only']),problemRef:problemRef.optional(),turns:z.array(z.strictObject({turnId:stableId,role:z.enum(['learner','assistant','unknown']),text:z.string().min(1).max(4000),problemRef:problemRef.optional()})).min(1).max(40),observations:z.array(z.strictObject({turnId:stableId,excerpt:z.string().min(1).max(700),event:z.record(z.string(),z.unknown())})).max(5).default([]),approved:z.literal(true).optional()}).refine(v=>new Set(v.turns.map(t=>t.turnId)).size===v.turns.length,'Turn IDs must be unique').refine(v=>v.turns.reduce((n,t)=>n+t.text.length,0)<=32000,'Supply bounded chunks of at most 32000 characters');
export function analyzeContext(raw:unknown,catalog:{problemRef:string;title:string;idea?:string|null;conceptKeys?:readonly string[]}[]){
 const input=contextSchema.parse(raw),observations=[...input.observations];
 if(input.coverage==='summary_only'&&observations.length)throw Error('Summary-only context cannot establish learner-attributed events; provide actual learner turns');
 for(const row of observations){const turn=input.turns.find(t=>t.turnId===row.turnId);if(!turn||turn.role!=='learner'||!turn.text.includes(row.excerpt))throw Error('Observation must cite an exact supplied learner excerpt');}
 const gaps:string[]=[];
 for(const turn of input.turns){
  // Text is untrusted data. Only explicit literal questions are automatically extracted.
  if(input.coverage==='summary_only'||turn.role!=='learner'||observations.some(o=>o.turnId===turn.turnId)||observations.length>=5)continue;
  const ref=turn.problemRef??input.problemRef;if(!ref){gaps.push('No problem reference for '+turn.turnId);continue;}
  let fence=false;const lines=turn.text.split('\n');let question='';
  for(const line of lines){if(/^\s*(```|~~~)/.test(line)){fence=!fence;continue;}if(!fence&&(/\?/.test(line)||/^\s*(why|how|explain|what|when|help|show|can|could|does|do|is|are|please)\b/i.test(line))){question=line.trim().slice(0,600);break;}}
  if(!question)continue;
  const p=catalog.find(p=>p.problemRef===ref),conceptKeys=inferCurriculumConcepts({title:question,topic:'',idea:p?.idea??p?.title??'',problemRef:ref,conceptKeys:p?.conceptKeys});
  observations.push({turnId:turn.turnId,excerpt:question,event:{problemRef:ref,kind:'problem_attempt',summary:'Explicit learner question: '+question,conceptKeys:conceptKeys.slice(0,6),origin:'chatgpt'}});
 }
 const summary=input.coverage==='summary_only'?'Supplied discussion summary: '+input.turns.map(t=>t.text).join(' | ').slice(0,650):observations.length?'Discussion checkpoint: '+observations.map(o=>String(o.event.summary)).join(' | ').slice(0,650):'Discussion checkpoint: no supported learner observations extracted from the supplied turns. No understanding, grade or mastery inferred.';
 const capture=validatedCapture({sessionId:input.sessionId,checkpointId:input.checkpointId,summary,approved:input.approved,observations});
 return {capture:{...capture,observations:observations},coverage:{source:input.coverage,turnsSupplied:input.turns.length,learnerTurns:input.turns.filter(t=>t.role==='learner').length,observations:observations.length,exhaustiveChatAccess:false,roleAttribution:'roles_supplied_by_ChatGPT_not_independently_authenticated',gaps},extraction:'literal_learner_questions_plus_quote_verified_host_proposals',limits:'Automatic extraction recognizes explicit questions, not arbitrary semantic mistakes or mastery. ChatGPT must propose deeper observations from actual learner work. Maximum five observations per checkpoint; send additional chunks with new checkpoint IDs.'};
}
