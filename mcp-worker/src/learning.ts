import type {LearnerProfile} from './learner-profile';
import type {SavedQuestion} from './discussions';
import {curriculum,allProblems,type TrackedProblem} from './catalog';
export {curriculum} from './catalog';
import { recommendDSA, type Evidence, type LearningItem } from '../../src/lib/evidence-intelligence';
import { rankWithReasoning } from '../../src/lib/reasoning-ranking';
import { parseLearningEvent,deriveLearningSignals, type LearningEventRecord } from '../../src/lib/learning-events';
import type { ToolData, ReviewRecord } from '../../src/lib/mcp-core';
import { sha256 } from './config';
import {inferCurriculumConcepts} from '../../src/lib/concept-graph';

export type Snapshot = { learnerProfile?:LearnerProfile; sourceConfiguration?:{leetcodeUsername:string|null;codeforcesHandle:string|null;githubRepo:string|null;githubPath:string|null}; events: LearningEventRecord[]; reviews: (ReviewRecord & {timeZone?:string})[]; evidence: (Evidence & {inactive?:boolean})[]; progress: Record<string,{due_date:string;ease:number;interval_days:number;repetitions:number;grade:number}>; sourceStatus: Record<string,unknown>; problems?:TrackedProblem[];questions?:SavedQuestion[] };
export const emptySnapshot = ():Snapshot => ({events:[],reviews:[],evidence:[],progress:{},sourceStatus:{}});
/** Stable IDs belong to this canonical MCP view, not the old per-user SQL row IDs. */
export function assertItem(id: string,extra:TrackedProblem[]=[]) {if(!allProblems(extra).some(p=>p.id===id))throw Error('Unknown learning item');}
export function learningDay(now=Date.now(),timeZone='Asia/Kolkata'){const parts=new Intl.DateTimeFormat('en',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));const get=(type:string)=>parts.find(p=>p.type===type)!.value;return get('year')+'-'+get('month')+'-'+get('day');}
export function buildData(s:Snapshot,options:{focusItemId?:string}={}):ToolData {
  const catalog=allProblems(s.problems),profile=s.learnerProfile,day=learningDay(Date.now(),profile?.preferences.timeZone);
  s={...s,evidence:s.evidence.filter(e=>!e.inactive)};
  const items:LearningItem[]=catalog.map((p,index)=>{
    const review=s.progress[p.id];
    const accepted=s.evidence.some(e=>e.itemId===p.id && ['leetcode','codeforces'].includes(e.source) && e.accepted===true);
    const observations=s.events.filter(e=>e.itemId===p.id || e.problemRef===p.problemRef);
    const platform=s.evidence.some(e=>e.itemId===p.id&&['leetcode','codeforces'].includes(e.source));
    const code=s.evidence.some(e=>e.itemId===p.id&&e.source==='github');
    const attempted=observations.length>0||platform;
    return {id:p.id,title:p.title,topic:p.topic,position:index+1,activeDifficulty:deriveLearningSignals(observations,{[p.id]:p.problemRef}).activeWeakConcepts.length>0,practiceEvidence:observations.length||review?'learner_report':platform?'platform_observation':code?'code_only':'none',status:accepted?'solved':attempted||review?'attempted':'not_started',dueDate:review?.due_date??null,recallGrade:review?review.grade<=1?0:review.grade===2?1:review.grade===3?2:3:null};
  });
  const roadmap=items.map((p,i)=>({itemId:p.id,title:p.title,topic:p.topic,position:p.position,status:p.status!,dueDate:p.dueDate??null,idea:[catalog[i].idea,...s.events.filter(e=>e.itemId===p.id||e.problemRef===catalog[i].problemRef).flatMap(e=>e.conceptKeys)].filter(Boolean).join(' '),problemRef:catalog[i].problemRef,origin:catalog[i].origin}));
  // Rank the entire roadmap by weakness before choosing five, avoiding the old top-50 cutoff.
  const base=items.flatMap(item=>recommendDSA([item],s.evidence,{limit:1,now:day+'T00:00:00Z'}));
  const ranked=rankWithReasoning(base,roadmap,s.events).map(rec=>{
    const p=catalog.find(p=>p.id===rec.itemId)!;
    const history=s.events.filter(e=>e.itemId===p.id||e.problemRef===p.problemRef).sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt));
    let lastMistake=-1;history.forEach((e,i)=>{if(e.kind==='mistake'||e.kind==='recall_check'&&e.confidence!==null&&e.confidence<=2)lastMistake=i;});
    const improvement=lastMistake<0?0:history.slice(lastMistake+1).filter(e=>e.independentlyExplained===true&&(!e.hintStage||e.hintStage==='none')&&['reasoning_insight','recall_check','transfer_attempt'].includes(e.kind)).length;
    const lastReview=s.reviews.filter(r=>r.itemId===p.id).sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt)).at(-1);
    const reviewAt=lastReview?Date.parse(lastReview.reviewedAt):NaN;
    const laterDifficulty=history.some(e=>Date.parse(e.recordedAt)>reviewAt&&(e.kind==='mistake'||e.kind==='recall_check'&&e.confidence!==null&&e.confidence<=2||e.kind==='transfer_attempt'&&e.independentlyExplained===false));
    const laterFailure=s.evidence.some(e=>e.itemId===p.id&&['leetcode','codeforces'].includes(e.source)&&e.accepted!==true&&!!e.verdict&&Date.parse(e.observedAt)>reviewAt);
    const cooling=!!lastReview&&lastReview.grade>=3&&s.progress[p.id]?.due_date>day&&!laterDifficulty&&!laterFailure;
    return {...rec,score:rec.score-Math.min(18,improvement*6)-(cooling?25:0),reason:[...rec.reason,...(improvement?['Later independently explained reasoning reduced practice priority; self-report does not establish mastery.']:[]),...(cooling?['Successful recall review is scheduled for later; prioritize other practice until due or new difficulty appears.']:[])]};
  });
  if(profile?.adaptationEnabled){
    for(const rec of ranked){const p=catalog.find(p=>p.id===rec.itemId)!;const matches=profile.focusConcepts.filter(key=>inferCurriculumConcepts(p).includes(key)||s.events.some(e=>(e.itemId===p.id||e.problemRef===p.problemRef)&&e.conceptKeys.includes(key)));if(matches.length){rec.score+=Math.min(18,matches.length*6);rec.reason.push('Explicit learner focus: '+matches.join(', '));}
      const goal=profile.preferences.practiceGoal;if(goal==='competitive_programming'&&p.problemRef.startsWith('cf:')||goal==='interviews'&&p.problemRef.startsWith('lc:')){rec.score+=6;rec.reason.push('Explicit practice goal: '+goal+'; relevance preference, not mastery evidence');}
    }
  }
  const position=new Map(items.map(p=>[p.id,p.position]));
  if(options.focusItemId){
    const focus=roadmap.find(p=>p.itemId===options.focusItemId);if(!focus)throw Error('Unknown session focus');
    const concepts=inferCurriculumConcepts(focus);
    for(const rec of ranked){const p=roadmap.find(p=>p.itemId===rec.itemId)!;const boost=p.itemId===focus.itemId?30:inferCurriculumConcepts(p).some(k=>concepts.includes(k))?12:p.topic===focus.topic&&!['External practice','unknown'].includes(p.topic)?6:0;if(boost){rec.score+=boost;rec.reason.push('Current session focus; contextual relevance, not saved weakness evidence');}}
  }
  ranked.sort((a,b)=>b.score-a.score||position.get(a.itemId)!-position.get(b.itemId)!);
  return {roadmap,recommendations:ranked.slice(0,profile?.preferences.sessionMinutes===null||profile?.preferences.sessionMinutes===undefined?5:Math.max(1,Math.min(5,Math.floor(profile.preferences.sessionMinutes/15)))),learningEvents:s.events,reviews:s.reviews.slice().reverse(),evidence:s.evidence.map(e=>({...e,accepted:e.accepted===true})),
    due:roadmap.filter(p=>p.dueDate && p.dueDate<=day).map(p=>({itemId:p.itemId,title:p.title,dueDate:p.dueDate!}))};
}
export async function eventEnvelope(raw: unknown, recordedAt = new Date().toISOString()) {
  const event=parseLearningEvent(raw);
  if(event.itemId)assertItem(event.itemId);
  const payload={format:'coding-intuition-event-v1',event:{...event,recordedAt},provenance:'learner_self_report_not_acceptance'};
  const content=JSON.stringify(payload);
  return {payload,content,fingerprint:await sha256(JSON.stringify(event))};
}
export function parseEnvelope(content: string):LearningEventRecord|null {
  try {
    const data=JSON.parse(content);
    if(data.format!=='coding-intuition-event-v1'||typeof data.event?.recordedAt!=='string'||!Number.isFinite(Date.parse(data.event.recordedAt)))return null;
    const {recordedAt,...raw}=data.event;
    const event=parseLearningEvent(raw);
    if(event.itemId)assertItem(event.itemId);
    return {...event,recordedAt};
  }catch{return null;}
}
