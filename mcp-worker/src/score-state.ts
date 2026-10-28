import {createHash} from 'node:crypto';
import {learningDay,type Snapshot} from './learning';
import {ENGINE_REVISION} from './engine-contract';
import type {Recommendation} from '../../src/lib/evidence-intelligence';
/** A deterministic read-only snapshot. Pending outbox writes never enter Snapshot.events. */
export function scoreState(snapshot:Snapshot,recommendations:Recommendation[],context:{focusItemId?:string;catalogId?:string;questions?:unknown[]}={}){
 const day=learningDay(Date.now(),snapshot.learnerProfile?.preferences.timeZone);
 const arithmetic=recommendations.map(r=>{
  const components=r.components??[],componentTotal=components.reduce((n,c)=>n+c.points,0);
  const temporaryPoints=components.filter(c=>['temporary_session_focus','provisional_discussion_question'].includes(c.factor)).reduce((n,c)=>n+c.points,0);
  return {itemId:r.itemId,total:r.score,componentTotal,arithmeticValid:Number.isFinite(r.score)&&r.score===componentTotal,scoreWithoutTemporaryContext:r.score-temporaryPoints,temporaryContextPoints:temporaryPoints};
 });
 const version=createHash('sha256').update(JSON.stringify({engine:ENGINE_REVISION,day,profile:snapshot.learnerProfile,events:snapshot.events,reviews:snapshot.reviews,progress:snapshot.progress,evidence:snapshot.evidence.filter(e=>!e.inactive),problems:snapshot.problems,context,arithmetic})).digest('hex');
 return {version,calculatedAt:new Date().toISOString(),learningDay:day,recalculatedOnEveryCall:true,weightsPolicy:'fixed_rules_varying_evidence',pendingWritesAffectScores:false,arithmetic,allArithmeticValid:arithmetic.every(r=>r.arithmeticValid),comparison:'Compare version and component evidence across calls. Changed evidence can leave totals or order unchanged. Temporary context disappears when omitted; pending writes do not count as confirmed events.'};
}
