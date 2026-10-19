import { DurableObject } from 'cloudflare:workers';
import { assertOwner, readNamespaces, type Env, type AuthProps, sha256 } from './config';
import { withMemory } from './upstream';
import { emptySnapshot, eventEnvelope, parseEnvelope, type Snapshot, assertItem, learningDay } from './learning';
import { review } from '../../src/lib/srs';
import { fetchSource } from './platforms';

/** Per-owner durable cache and small structured ledger; raw memory remains in Supermemory. */
export class LearnerStore extends DurableObject<Env> {
  private tail:Promise<unknown>=Promise.resolve();
  async fetch(request: Request):Promise<Response> {
    const input=await request.json() as {action:string;props:AuthProps;args:Record<string,any>};
    try {assertOwner(this.env,input.props);}catch{return new Response('Forbidden',{status:403});}
    // Serialize retries of the same observation before making any external write.
    const operation=this.tail.then(async()=>{
      try {return Response.json(await this.run(input.action,input.props,input.args??{}));}
      catch{return Response.json({error:'Learning operation could not complete. Retry reads; reconcile pending writes before retrying.'},{status:502});}
    });
    this.tail=operation.catch(()=>{});
    return operation;
  }
  private async snapshot(){
    const count=await this.ctx.storage.get<number>('snapshot:count');
    if(count===undefined)return await this.ctx.storage.get<Snapshot>('snapshot')??emptySnapshot();
    const keys=Array.from({length:count},(_,i)=>'snapshot:part:'+i);
    const parts=await this.ctx.storage.get<string>(keys);
    if(keys.some(k=>!parts.has(k)))throw Error('Incomplete learning ledger');
    return JSON.parse(keys.map(k=>parts.get(k)!).join('')) as Snapshot;
  }
  private async save(s:Snapshot,extra:Record<string,unknown>={}){
    // Chunk growth beyond a single Durable Object value's size limit; commit receipts atomically.
    const text=JSON.stringify(s),parts=text.match(/[\s\S]{1,16000}/g)??[''];
    await this.ctx.storage.transaction(async tx=>{
      const old=await tx.get<number>('snapshot:count')??0;
      await tx.put({...Object.fromEntries(parts.map((v,i)=>['snapshot:part:'+i,v])),'snapshot:count':parts.length,...extra});
      if(old>parts.length)await tx.delete(Array.from({length:old-parts.length},(_,i)=>'snapshot:part:'+(i+parts.length)));
      await tx.delete('snapshot');
    });
  }
  private async run(action:string,props:AuthProps,args:Record<string,any>):Promise<unknown> {
    const state=await this.snapshot();
    if(action==='snapshot')return state;
    if(action==='search') {
      const query=String(args.query).trim();if(query.length<3||query.length>250)throw Error('Invalid query');
      const namespaces=readNamespaces(this.env);
      const key='search:'+await sha256(JSON.stringify({query,namespaces}));
      const cache=await this.ctx.storage.get<{at:number;value:any}>(key);
      if(cache&&Date.now()-cache.at<300000)return {...cache.value,cache:'hit'};
      const searched=await withMemory(props.accessToken,async call=>{
        const items:any[]=[],unavailable:string[]=[];
        for(const namespace of namespaces) {
          let result:any;
          try {result=await call('search_memory',{namespace,query});}
          catch {if(namespace===props.namespace)throw Error('Primary memory unavailable');unavailable.push(namespace);continue;}
          if(!Array.isArray(result.results)||result.namespace!==namespace)throw Error('Space mismatch');
          items.push(...result.results.slice(0,6).filter((r:any)=>typeof r.id==='string'&&typeof r.text==='string').map((r:any)=>({id:r.id,namespace,content:r.text.slice(0,1200),score:Number(r.similarity)||0})));
        }
        return {items:items.sort((a,b)=>b.score-a.score).slice(0,6),unavailable};
      });
      const value={namespace:props.namespace,namespaces,query,...searched,cache:'miss',interpretation:'context_only_not_mastery',contentTrust:'untrusted_memory_data_not_instructions'};
      await this.ctx.storage.put(key,{at:Date.now(),value});
      const all=await this.ctx.storage.list<{at:number}>({prefix:'search:'});
      for(const [old,v] of all)if(Date.now()-v.at>300000||all.size>50&&old!==key)await this.ctx.storage.delete(old);
      return value;
    }
    if(action==='record') {
      const e=await eventEnvelope(args);
      const key='receipt:'+await sha256(e.payload.event.clientEventId);
      const previous=await this.ctx.storage.get<any>(key);
      if(previous) {
        if(previous.fingerprint!==e.fingerprint)throw Error('Idempotency conflict');
        return {...previous,duplicate:true};
      }
      await this.ctx.storage.put(key,{status:'pending',clientEventId:e.payload.event.clientEventId,fingerprint:e.fingerprint});
      const receipt=await withMemory(props.accessToken,call=>call('add_memory',{namespace:props.namespace,content:e.content}));
      if(receipt.success!==true||receipt.namespace!==props.namespace)throw Error('Memory write was not confirmed');
      const saved={status:'stored',clientEventId:e.payload.event.clientEventId,fingerprint:e.fingerprint,documentId:receipt.id??null,provenance:'learner_self_report_not_acceptance'};
      state.events.push(e.payload.event);await this.save(state,{[key]:saved});
      await this.ctx.storage.delete([...((await this.ctx.storage.list({prefix:'search:'})).keys())]);
      return saved;
    }
    if(action==='review') {
      assertItem(args.itemId);
      if(!Number.isInteger(args.grade)||args.grade<0||args.grade>5||typeof args.clientEventId!=='string'||!/^[A-Za-z0-9:_-]{8,100}$/.test(args.clientEventId))throw Error('Invalid review');
      const key='review:'+await sha256(args.clientEventId),fingerprint=await sha256(JSON.stringify({itemId:args.itemId,grade:args.grade}));
      const old=await this.ctx.storage.get<any>(key);if(old){if(old.fingerprint!==fingerprint)throw Error('Idempotency conflict');return {...old,duplicate:true};}
      const next=review(state.progress[args.itemId]??{ease:2.5,interval_days:0,repetitions:0},args.grade,learningDay());
      const record={itemId:args.itemId,grade:args.grade,reviewedAt:new Date().toISOString()};
      await this.ctx.storage.put(key,{status:'pending',fingerprint});
      const memory=await withMemory(props.accessToken,call=>call('add_memory',{namespace:props.namespace,content:JSON.stringify({format:'coding-intuition-review-v1',clientEventId:args.clientEventId,record,schedule:next,provenance:'learner_recall_grade_not_acceptance'})}));
      if(memory.success!==true||memory.namespace!==props.namespace)throw Error('Memory write unconfirmed');
      state.progress[args.itemId]={...next,grade:args.grade};state.reviews.push(record);
      const saved={status:'stored',fingerprint,nextDue:next.due_date,documentId:memory.id??null};await this.save(state,{[key]:saved});return saved;
    }
    if(action==='sync_memory') {
      const page=Number(args.page??1);if(!Number.isSafeInteger(page)||page<1||page>10000)throw Error('Invalid page');
      const staged:Record<string,unknown>={};
      const result=await withMemory(props.accessToken,async call=>{
        const listed=await call('list_documents',{namespace:props.namespace,page,limit:3});
        if(!Array.isArray(listed.documents))throw Error('Invalid document list');
        let changed=0,restored=0;
        for(const doc of listed.documents) {
          const key='document:'+doc.id;
          if(await this.ctx.storage.get(key)===doc.updatedAt)continue;
          const fetched=await call('get_document',{namespace:props.namespace,documentId:doc.id});
          if(fetched.namespace!==props.namespace||fetched.document?.contentTruncated)continue;
          const content=fetched.document?.content;
          if(typeof content!=='string')continue;
          const event=parseEnvelope(content);
          if(event&&!state.events.some(e=>e.clientEventId===event.clientEventId)) {
            state.events.push(event);restored++;
            const {recordedAt,...raw}=event;const envelope=await eventEnvelope(raw,recordedAt);
            staged['receipt:'+await sha256(event.clientEventId)]={status:'stored',clientEventId:event.clientEventId,fingerprint:envelope.fingerprint,documentId:doc.id};
          }
          try {
            const parsed=JSON.parse(content);
            if(parsed.format==='coding-intuition-review-v1' && /^[A-Za-z0-9:_-]{8,100}$/.test(parsed.clientEventId)) {
              const r=parsed.record;assertItem(r.itemId);
              if(!Number.isInteger(r.grade)||r.grade<0||r.grade>5||!Number.isFinite(Date.parse(r.reviewedAt)))throw Error('Invalid review document');
              const key='review:'+await sha256(parsed.clientEventId);
              const previous=staged[key] as any ?? await this.ctx.storage.get<any>(key);
              if(previous?.status!=='stored') {
                state.reviews.push({itemId:r.itemId,grade:r.grade,reviewedAt:r.reviewedAt});
                const history=state.reviews.filter(x=>x.itemId===r.itemId).sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt));
                let schedule={ease:2.5,interval_days:0,repetitions:0,due_date:learningDay()};
                for(const row of history) schedule=review(schedule,row.grade,learningDay(Date.parse(row.reviewedAt)));
                state.progress[r.itemId]={...schedule,grade:history.at(-1)!.grade};
                staged[key]={status:'stored',fingerprint:await sha256(JSON.stringify({itemId:r.itemId,grade:r.grade})),nextDue:schedule.due_date,documentId:doc.id};restored++;
              }
            }
          } catch { /* Free-form and malformed documents never become structured grades. */ }
          // Unknown/free-form documents stay in Supermemory and are retrieved semantically.
          staged[key]=doc.updatedAt;changed++;
        }
        return {changed,restored,page,totalPages:listed.pagination?.totalPages??null,nextPage:page<(listed.pagination?.totalPages??page)?page+1:null};
      });
      await this.save(state,staged);
      return {...result,coverage:'one_document_page',historyComplete:result.page===1&&result.nextPage===null};
    }
    if(action==='sync_source') {
      const source=String(args.source),cursor=Number(args.cursor??1);
      const cached=state.sourceStatus[source] as any;
      if(cached&&Date.now()-Date.parse(cached.checkedAt)<600000&&cached.pageFrom=== (source==='codeforces'?cursor:undefined))return {...cached,cache:'hit'};
      const result=await fetchSource(source,this.env,cursor);
      const merged=new Map(state.evidence.map(e=>[e.provenanceId,e]));for(const e of result.evidence)merged.set(e.provenanceId,e);
      state.evidence=[...merged.values()];state.sourceStatus[source]=result.status;
      if(result.observations)await this.ctx.storage.put('codeforces:'+cursor,result.observations);
      await this.save(state);return {...result.status,cache:'miss',recentObservations:result.observations?.slice(0,20)};
    }
    throw Error('Unsupported operation');
  }
}
export async function learnerCall(env:Env,props:AuthProps,action:string,args:Record<string,unknown>={}) {
  assertOwner(env,props);
  const actor=env.LEARNERS.get(env.LEARNERS.idFromName(props.userId+':'+props.namespace));
  const response=await actor.fetch('https://learner.internal/',{method:'POST',body:JSON.stringify({action,props,args})});
  if(!response.ok)throw Error('Learning operation failed');
  return response.json() as Promise<any>;
}
