import {z} from 'zod';
import {createHash} from 'node:crypto';
import {CONCEPT_KEYS} from '../../src/lib/concept-graph';
import {deriveLearningSignals} from '../../src/lib/learning-events';
import {allProblems} from './catalog';
import type {Snapshot} from './learning';
import type {Env,AuthProps} from './config';
import {stableId} from './continuity';
export const timeZoneSchema=z.string().min(1).max(80).refine(value=>{try{new Intl.DateTimeFormat('en',{timeZone:value});return true;}catch{return false;}},'Use a supported IANA time zone.');
const preferencesShape={
 language:z.enum(['cpp','python','java','javascript','typescript','go','rust','other']).nullable(),
 explanationDepth:z.enum(['concise','balanced','detailed']),
 exampleFormats:z.array(z.enum(['dry_run','counterexample','diagram','analogy'])).max(4),
 codeApproach:z.enum(['preserve_my_approach','compare_alternatives']),
 hintPolicy:z.enum(['progressive','ask_first','direct_on_request']),
 practiceGoal:z.enum(['interviews','competitive_programming','both']),
 sessionMinutes:z.number().int().min(5).max(180).nullable(),
 practiceDaysPerWeek:z.number().int().min(1).max(7).nullable(),
 timeZone:timeZoneSchema,
};
const sourcesShape={leetcodeUsername:z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).nullable().optional(),codeforcesHandle:z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/).nullable().optional(),githubRepo:z.string().max(200).regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).nullable().optional(),githubPath:z.string().min(1).max(300).refine(p=>p.split('/').every(x=>x&&x!=='.'&&x!=='..')&&!p.includes('\\'),'Use a relative repository directory.').nullable().optional()};
export const profileRecordSchema=z.strictObject({format:z.literal('coding-intuition-profile-v1'),revision:z.number().int().min(0).max(1000001),preferences:z.strictObject(preferencesShape),focusConcepts:z.array(z.enum(CONCEPT_KEYS)).max(8),adaptationEnabled:z.boolean(),sources:z.strictObject(sourcesShape),updatedAt:z.iso.datetime().nullable(),reason:z.string().max(300)});
export type LearnerProfile=z.infer<typeof profileRecordSchema>;
const changesSchema=z.strictObject({preferences:z.strictObject(preferencesShape).partial().optional(),focusConcepts:z.array(z.enum(CONCEPT_KEYS)).max(8).optional(),adaptationEnabled:z.boolean().optional(),sources:z.strictObject(sourcesShape).optional()}).refine(v=>Object.values(v).some(x=>x!==undefined&&(typeof x!=='object'||x===null||Array.isArray(x)||Object.keys(x).length>0)),'Supply at least one profile change.');
export const updateProfileSchema=z.strictObject({clientEventId:stableId,expectedRevision:z.number().int().min(0).max(1000000),changes:changesSchema,reason:z.string().min(5).max(300)});
export const getProfileSchema=z.strictObject({includeHistory:z.boolean().default(false),beforeRevision:z.number().int().min(1).max(1000002).optional(),limit:z.number().int().min(1).max(10).default(5)});
export function initialProfile(env?:Env,props?:Pick<AuthProps,'userId'>):LearnerProfile{
 const legacy=!!env?.OWNER_SUPERMEMORY_ID&&props?.userId===env.OWNER_SUPERMEMORY_ID;
 return {format:'coding-intuition-profile-v1',revision:0,preferences:{language:null,explanationDepth:'balanced',exampleFormats:[],codeApproach:'preserve_my_approach',hintPolicy:'progressive',practiceGoal:'both',sessionMinutes:null,practiceDaysPerWeek:null,timeZone:legacy?'Asia/Kolkata':'UTC'},focusConcepts:[],adaptationEnabled:true,sources:{},updatedAt:null,reason:'Neutral starting defaults; no personal preferences or ability inferred.'};
}
export function mergeProfile(current:LearnerProfile,input:z.infer<typeof updateProfileSchema>,now=new Date().toISOString()):LearnerProfile{
 return profileRecordSchema.parse({...current,revision:current.revision+1,updatedAt:now,reason:input.reason,...input.changes,preferences:{...current.preferences,...input.changes.preferences},sources:{...current.sources,...input.changes.sources}});
}
/** Environment defaults belong only to the legacy configured owner; never to other learners. */
export function learnerSources(env:Env,props:Pick<AuthProps,'userId'>,profile:LearnerProfile):Env{
 const owner=props.userId===env.OWNER_SUPERMEMORY_ID;
 const pick=(key:keyof LearnerProfile['sources'],fallback:string|undefined)=>profile.sources[key]===undefined?(owner?fallback:undefined):profile.sources[key]??undefined;
 return {...env,LEETCODE_USERNAME:pick('leetcodeUsername',env.LEETCODE_USERNAME)??'',CODEFORCES_HANDLE:pick('codeforcesHandle',env.CODEFORCES_HANDLE)??'',GITHUB_SOLUTIONS_REPO:pick('githubRepo',env.GITHUB_SOLUTIONS_REPO),GITHUB_SOLUTIONS_PATH:pick('githubPath',env.GITHUB_SOLUTIONS_PATH)};
}
export function sourceNames(env:Env){return [...(env.LEETCODE_USERNAME?['leetcode']:[]),...(env.CODEFORCES_HANDLE?['codeforces']:[]),...(env.GITHUB_SOLUTIONS_REPO?['github']:[])];}
export function profileView(profile:LearnerProfile,s:Snapshot){
 const refs=Object.fromEntries(allProblems(s.problems).map(p=>[p.id,p.problemRef]));
 const events=[...s.events].sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt)||a.clientEventId.localeCompare(b.clientEventId));
 const signals=deriveLearningSignals(events,refs),recent=events.slice(-30);
 const assisted=recent.filter(e=>!!e.hintStage&&e.hintStage!=='none').length;
 const independent=recent.filter(e=>e.independentlyExplained===true&&(!e.hintStage||e.hintStage==='none')&&['reasoning_insight','recall_check','transfer_attempt'].includes(e.kind)).length;
 const reviews=[...s.reviews].sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt)).slice(-20);
 const evidenceVersion=createHash('sha256').update(JSON.stringify([events.map(e=>[e.clientEventId,e.recordedAt]),s.reviews.map(r=>[r.clientEventId,r.reviewedAt,r.grade])])).digest('hex');
 const adaptations=profile.adaptationEnabled&&assisted>=3&&assisted>independent?[{rule:'recorded_hint_dependence',action:'Offer one unaided explanation or counterexample before the next hint; honor an explicit request for the solution.',basis:{assistedObservations:assisted,independentObservations:independent,window:recent.length}}]:[];
 return {profile,learningState:{evidenceVersion,eventCount:events.length,reviewCount:s.reviews.length,activeWeakConcepts:signals.activeWeakConcepts,recordedAssistance:{window:recent.length,assisted,independent},recentRecall:{count:reviews.length,successful:reviews.filter(r=>r.grade>=3).length},lastEvidenceAt:[...events.map(e=>e.recordedAt),...s.reviews.map(r=>r.reviewedAt)].sort().at(-1)??null,coverage:'Approved recorded observations and learner-confirmed grades only; not complete chat or practice history.',interpretation:'Learning signals are revisable evidence, not permanent ability labels.'},coachingPolicy:{...profile.preferences,preferenceBasis:profile.revision?'explicit_versioned_profile':'neutral_defaults_pending_confirmation',focusConcepts:profile.focusConcepts,adaptationEnabled:profile.adaptationEnabled,recommendedProblemCount:profile.preferences.sessionMinutes===null?5:Math.max(1,Math.min(5,Math.floor(profile.preferences.sessionMinutes/15))),adaptations,problemCountBasis:'A bounded planning estimate of one suggestion per 15 budgeted minutes; actual task duration is not inferred.',adaptationScope:'Optional profile relevance boosts and habit guidance; recorded progress remains available when disabled.',precedence:'The current explicit learner request takes priority over saved presentation preferences. Preferences change through approved profile updates; evidence never silently rewrites them.',rankingBasis:'When adaptation is enabled, explicit goal and focus preferences add bounded relevance boosts. Observed learning evidence remains distinct from preferences.'}};
}
