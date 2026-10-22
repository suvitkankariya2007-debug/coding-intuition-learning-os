import type {SavedQuestion} from './discussions';
import {curriculum,allProblems,type TrackedProblem} from './catalog';
export {curriculum} from './catalog';
import { recommendDSA, type Evidence, type LearningItem } from '../../src/lib/evidence-intelligence';
import { rankWithReasoning } from '../../src/lib/reasoning-ranking';
import { parseLearningEvent, type LearningEventRecord } from '../../src/lib/learning-events';
import type { ToolData, ReviewRecord } from '../../src/lib/mcp-core';
import { sha256 } from './config';

export type Snapshot = { events: LearningEventRecord[]; reviews: ReviewRecord[]; evidence: Evidence[]; progress: Record<string,{due_date:string;ease:number;interval_days:number;repetitions:number;grade:number}>; sourceStatus: Record<string,unknown>; problems?:TrackedProblem[];questions?:SavedQuestion[] };
export const emptySnapshot = ():Snapshot => ({events:[],reviews:[],evidence:[],progress:{},sourceStatus:{}});
/** Stable IDs belong to this canonical MCP view, not the old per-user SQL row IDs. */
export function assertItem(id: string,extra:TrackedProblem[]=[]) {if(!allProblems(extra).some(p=>p.id===id))throw Error('Unknown learning item');}
export function learningDay(now = Date.now()) {return new Date(now+19800000).toISOString().slice(0,10);}
export function buildData(s:Snapshot):ToolData {
  const catalog=allProblems(s.problems);
  const items:LearningItem[]=catalog.map((p,index)=>{
    const review=s.progress[p.id];
    const accepted=s.evidence.some(e=>e.itemId===p.id && ['leetcode','codeforces'].includes(e.source) && e.accepted===true);
    const observations=s.events.filter(e=>e.itemId===p.id || e.problemRef===p.problemRef);
    const attempted=observations.length>0||s.evidence.some(e=>e.itemId===p.id&&['github','leetcode','codeforces'].includes(e.source));
    return {id:p.id,title:p.title,topic:p.topic,position:index+1,status:accepted?'solved':attempted||review?'attempted':'not_started',dueDate:review?.due_date??null,recallGrade:review?review.grade<=1?0:review.grade===2?1:review.grade===3?2:3:null};
  });
  const roadmap=items.map((p,i)=>({itemId:p.id,title:p.title,topic:p.topic,position:p.position,status:p.status!,dueDate:p.dueDate??null,idea:[catalog[i].idea,...s.events.filter(e=>e.itemId===p.id||e.problemRef===catalog[i].problemRef).flatMap(e=>e.conceptKeys)].filter(Boolean).join(' '),problemRef:catalog[i].problemRef,origin:catalog[i].origin}));
  // Rank the entire roadmap by weakness before choosing five, avoiding the old top-50 cutoff.
  const base=items.flatMap(item=>recommendDSA([item],s.evidence,{limit:1,now:learningDay()+'T00:00:00Z'}));
  const ranked=rankWithReasoning(base,roadmap,s.events).map(rec=>{
    const p=catalog.find(p=>p.id===rec.itemId)!;
    const history=s.events.filter(e=>e.itemId===p.id||e.problemRef===p.problemRef).sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt));
    let lastMistake=-1;history.forEach((e,i)=>{if(e.kind==='mistake'||e.kind==='recall_check'&&e.confidence!==null&&e.confidence<=2)lastMistake=i;});
    const improvement=lastMistake<0?0:history.slice(lastMistake+1).filter(e=>e.independentlyExplained===true&&['reasoning_insight','recall_check','transfer_attempt'].includes(e.kind)).length;
    return improvement?{...rec,score:rec.score-Math.min(18,improvement*6),reason:[...rec.reason,'Later independently explained reasoning reduced practice priority; self-report does not establish mastery.']}:rec;
  });
  const position=new Map(items.map(p=>[p.id,p.position]));
  ranked.sort((a,b)=>b.score-a.score||position.get(a.itemId)!-position.get(b.itemId)!);
  return {roadmap,recommendations:ranked.slice(0,5),learningEvents:s.events,reviews:s.reviews.slice().reverse(),evidence:s.evidence.map(e=>({...e,accepted:e.accepted===true})),
    due:roadmap.filter(p=>p.dueDate && p.dueDate<=learningDay()).map(p=>({itemId:p.itemId,title:p.title,dueDate:p.dueDate!}))};
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
