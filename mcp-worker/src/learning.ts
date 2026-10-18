import canonical from '../../data/canonical-roadmap-188.json';
import { recommendDSA, type Evidence, type LearningItem } from '../../src/lib/evidence-intelligence';
import { rankWithReasoning } from '../../src/lib/reasoning-ranking';
import { parseLearningEvent, type LearningEventRecord } from '../../src/lib/learning-events';
import type { ToolData, ReviewRecord } from '../../src/lib/mcp-core';
import { sha256 } from './config';

export type Snapshot = { events: LearningEventRecord[]; reviews: ReviewRecord[]; evidence: Evidence[]; progress: Record<string,{due_date:string;ease:number;interval_days:number;repetitions:number;grade:number}>; sourceStatus: Record<string,unknown> };
export const emptySnapshot = ():Snapshot => ({events:[],reviews:[],evidence:[],progress:{},sourceStatus:{}});
/** Stable IDs belong to this canonical MCP view, not the old per-user SQL row IDs. */
export const curriculum = canonical.map(row=>({...row,id:`18800000-0000-5000-8000-${String(row.position).padStart(12,'0')}`}));
export function assertItem(id: string) {if(!curriculum.some(p=>p.id===id))throw Error('Unknown canonical roadmap item');}
export function learningDay(now = Date.now()) {return new Date(now+19800000).toISOString().slice(0,10);}
export function buildData(s:Snapshot):ToolData {
  const items:LearningItem[]=curriculum.map(p=>{
    const review=s.progress[p.id];
    const accepted=s.evidence.some(e=>e.itemId===p.id && e.source==='leetcode' && e.accepted===true);
    const attempted=s.events.some(e=>e.itemId===p.id || e.problemRef===`lc:${p.leetcode_id}`);
    return {id:p.id,title:p.title,topic:p.topic,position:p.position,status:accepted?'solved':attempted||review?'attempted':'not_started',dueDate:review?.due_date??null,recallGrade:review?review.grade<=1?0:review.grade===2?1:review.grade===3?2:3:null};
  });
  const roadmap=items.map((p,i)=>({itemId:p.id,title:p.title,topic:p.topic,position:p.position,status:p.status!,dueDate:p.dueDate??null,idea:curriculum[i].idea}));
  // Rank the entire roadmap by weakness before choosing five, avoiding the old top-50 cutoff.
  const base=items.flatMap(item=>recommendDSA([item],s.evidence,{limit:1,now:learningDay()+'T00:00:00Z'}));
  const ranked=rankWithReasoning(base,roadmap,s.events);
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
