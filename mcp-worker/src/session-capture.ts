import {z} from 'zod';
import {stableId} from './continuity';
import {parseLearningEvent} from '../../src/lib/learning-events';
export const capturePolicySchema=z.strictObject({enabled:z.boolean()});
export const captureSchema=z.strictObject({sessionId:stableId,checkpointId:stableId,summary:z.string().min(10).max(700),approved:z.literal(true).optional(),observations:z.array(z.strictObject({turnId:stableId,excerpt:z.string().min(1).max(700),event:z.record(z.string(),z.unknown())})).max(5).default([])});
export function validatedCapture(raw:unknown){const input=captureSchema.parse(raw);
 // Reuse event guardrails for bounded summaries and credential rejection; synthetic event is never stored.
 parseLearningEvent({clientEventId:'validate-summary',problemRef:'manual:session-summary',kind:'problem_attempt',summary:input.summary,origin:'chatgpt'});
 const observations=input.observations.map(o=>{if('source' in o.event||'clientEventId' in o.event)throw Error('Capture generates source and event identity; supply learner event fields only');const event=parseLearningEvent({...o.event,clientEventId:'validate-observation',source:{kind:'current_chat',role:'learner',sessionId:input.sessionId,turnId:o.turnId,excerpt:o.excerpt}});return {turnId:o.turnId,event};});
 return {...input,observations};}
