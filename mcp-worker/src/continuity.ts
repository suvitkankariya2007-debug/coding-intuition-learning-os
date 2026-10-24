import {z} from 'zod';
import {CONCEPT_KEYS} from '../../src/lib/concept-graph';
export const MEMORY_CACHE_TTL_MS=60*60*1000;
export const memoryCacheIsFresh=(cachedAt:number,now=Date.now())=>Number.isFinite(cachedAt)&&now>=cachedAt&&now-cachedAt<MEMORY_CACHE_TTL_MS;
export const stableId=z.string().regex(/^[A-Za-z0-9:_-]{8,100}$/);
export const questionFields={
 questionId:stableId,
 question:z.string().min(5).max(1000),
 problemRef:z.string().regex(/^(lc:[0-9]{1,7}|cf:[0-9]{1,9}[A-Za-z0-9]{1,5}|manual:[a-z0-9][a-z0-9-]{2,95})$/).optional(),
 status:z.enum(['open','paused','resolved']),
 approaches:z.array(z.string().min(1).max(500)).max(5),
 mistakes:z.array(z.string().min(1).max(500)).max(5),
 conceptKeys:z.array(z.enum(CONCEPT_KEYS)).max(5),
 nextStep:z.string().min(1).max(500),
};
export const saveQuestionSchema=z.strictObject({...questionFields,clientEventId:stableId,expectedRevision:z.number().int().min(0).max(1000000)});
export const questionRecordSchema=z.strictObject({...questionFields,revision:z.number().int().min(1).max(1000001),updatedAt:z.iso.datetime(),createdAt:z.iso.datetime()});
export type QuestionRecord=z.infer<typeof questionRecordSchema>;
export const listQuestionsSchema=z.strictObject({questionId:stableId.optional(),beforeRevision:z.number().int().min(1).max(1000002).optional(),status:z.enum(['active','all','open','paused','resolved']).default('active'),problemRef:questionFields.problemRef,conceptKey:z.enum(CONCEPT_KEYS).optional(),offset:z.number().int().min(0).max(1000000).default(0),limit:z.number().int().min(1).max(25).default(10)});
export const writeStatusSchema=z.strictObject({clientEventId:stableId.optional()});
export const retryWritesSchema=z.strictObject({limit:z.number().int().min(1).max(3).default(1),clientEventId:stableId.optional(),resendUnconfirmed:z.boolean().default(false),acknowledgeDuplicateRisk:z.literal(true).optional()}).refine(v=>!v.resendUnconfirmed||!!v.clientEventId&&v.acknowledgeDuplicateRisk===true,'A targeted unconfirmed resend requires a clientEventId and explicit duplicate-risk acknowledgement.');
export type WriteJob={kind:'event'|'review'|'question'|'profile';clientEventId:string;receiptKey:string;fingerprint:string;content:string;createdAt:string;status:'queued'|'uncertain';attempts:number;nextAttemptAt:number;scan?:{page:number;pages:number|null;ids:string[];incomplete?:boolean};lastError?:string;reconciledAbsentAt?:number};
export const jobSummary=(j:WriteJob)=>({kind:j.kind,clientEventId:j.clientEventId,status:j.status,createdAt:j.createdAt,attempts:j.attempts,nextAttemptAt:j.nextAttemptAt,reconciliationPage:j.scan?.page??null,lastError:j.lastError??null,reconciledAbsentAt:j.reconciledAbsentAt??null});

/** Small default context; retrieve a thread explicitly when its full approaches/history are needed. */
export function compactQuestionContext(result:{total:number;items:any[];nextOffset:number|null}){
 return {...result,items:result.items.map(q=>({questionId:q.questionId,revision:q.revision,problemRef:q.problemRef??null,status:q.status,question:q.question.slice(0,250),conceptKeys:q.conceptKeys,lastApproach:q.approaches.at(-1)?.slice(0,200)??null,lastReportedMistake:q.mistakes.at(-1)?.slice(0,200)??null,nextStep:q.nextStep.slice(0,200),memorySync:q.memorySync})),coverage:'Brief context only; use get_learning_questions with questionId and status all for the full saved state and paginated revisions.'};
}
