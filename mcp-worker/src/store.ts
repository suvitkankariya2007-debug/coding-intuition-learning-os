import { discussionPage,extractQuestions } from './discussions';
import {rotateUpstreamProps} from './auth';
import {initialMonitor,sealCredentials,openCredentials,monitorCredentials,type MonitorState} from './monitor';
import { DurableObject } from 'cloudflare:workers';
import { assertOwner, readNamespaces, type Env, type AuthProps, sha256 } from './config';
import { withMemory } from './upstream';
import { emptySnapshot, eventEnvelope, parseEnvelope, type Snapshot, assertItem, learningDay } from './learning';
import { review } from '../../src/lib/srs';
import { fetchSource,readProblemCode } from './platforms';
import {allProblems,makeProblem,mergeProblems,curriculum} from './catalog';
const curriculumItem=(id:string)=>curriculum.some(p=>p.id===id);

/** Per-owner durable cache and small structured ledger; raw memory remains in Supermemory. */
export class LearnerStore extends DurableObject<Env> {
  private tail:Promise<unknown>=Promise.resolve();
  private async invalidateMemorySearchCache(){
    await this.ctx.storage.delete([...((await this.ctx.storage.list({prefix:'search:'})).keys())]);
  }
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
  async alarm(){
    const operation=this.tail.then(()=>this.monitorTick());this.tail=operation.catch(()=>{});await operation;
  }
  private async monitorTick(){
    const m=await this.ctx.storage.get<MonitorState>('monitor:state')??initialMonitor();
    if(!m.enabled)return m;
    const tasks=['leetcode','codeforces',...(this.env.GITHUB_SOLUTIONS_REPO?['github']:[]),'memory'];
    const task=tasks[m.taskIndex%tasks.length];m.lastRunAt=new Date().toISOString();
    try{
      const props=await monitorCredentials(this.env,await this.ctx.storage.get('monitor:credentials'));
      if(!this.env.LOCAL_CREDENTIALS)await this.ctx.storage.put('monitor:credentials',await sealCredentials(this.env,props));
      const r:any=await this.run(task==='memory'?'sync_memory':'sync_source',props,task==='memory'?{page:m.memoryPage}:{source:task,force:true,cursor:task==='codeforces'?m.cfCursor:1});
      if(r.available===false)throw Error('Source unavailable');
      if(task==='memory')m.memoryPage=r.nextPage??1;
      if(task==='codeforces')m.cfCursor=r.nextCursor??1;
      m.tasks[task]={status:r.incompleteDocuments?.length?'partial_provider_truncation':'success',checkedAt:m.lastRunAt};m.lastSuccessAt=m.lastRunAt;m.consecutiveFailures=0;
    }catch{m.tasks[task]={status:'failed_reconnect_or_retry',checkedAt:m.lastRunAt};m.consecutiveFailures++;}
    if(task!=='memory'||m.memoryPage===1)m.taskIndex=(m.taskIndex+1)%tasks.length;
    // One bounded task per wake-up; capped retry delay avoids tight failure loops.
    const delay=m.consecutiveFailures?Math.min(3600000,60000*2**Math.min(6,m.consecutiveFailures)):m.taskIndex===0?m.intervalMinutes*60000:60000;
    m.nextRunAt=Date.now()+delay;await this.ctx.storage.put('monitor:state',m);await this.ctx.storage.setAlarm(m.nextRunAt);return m;
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
    if(action==='refresh_credentials'){
      let current=props;const sealed=await this.ctx.storage.get<any>('monitor:credentials');
      if(sealed){const stored=await openCredentials(this.env,sealed);if(stored.expiresAt>=current.expiresAt)current=stored;}
      current=await rotateUpstreamProps(this.env,current);await this.ctx.storage.put('monitor:credentials',await sealCredentials(this.env,current));return current;
    }
    if(action==='monitor_status')return await this.ctx.storage.get('monitor:state')??initialMonitor();
    if(action==='configure_monitor'){
      const m=await this.ctx.storage.get<MonitorState>('monitor:state')??initialMonitor();
      if(!args.enabled){m.enabled=false;m.nextRunAt=null;await this.ctx.storage.deleteAlarm();await this.ctx.storage.put('monitor:state',m);return m;}
      if(!this.env.LOCAL_CREDENTIALS){if(!props.refreshToken||!this.env.SUPERMEMORY_CLIENT_ID||!/^[a-f0-9]{64}$/i.test(this.env.MONITOR_ENCRYPTION_KEY??''))return {enabled:false,setupRequired:'Hosted monitoring requires offline Supermemory authorization and MONITOR_ENCRYPTION_KEY.'};await this.run('refresh_credentials',props,{});}
      m.enabled=true;m.credentialMode=this.env.LOCAL_CREDENTIALS?'local':'encrypted';m.intervalMinutes=args.intervalMinutes??30;m.nextRunAt=Date.now()+1000;
      await this.ctx.storage.put('monitor:state',m);await this.ctx.storage.setAlarm(m.nextRunAt);return m;
    }
    if(action==='list_documents')return withMemory(props.accessToken,call=>call('list_documents',{namespace:props.namespace,page:args.page??1,limit:10}));
    if(action==='read_discussion')return withMemory(props.accessToken,async call=>{
      const r=await call('get_document',{namespace:props.namespace,documentId:args.documentId});if(r.namespace!==props.namespace||r.document?.id!==args.documentId)throw Error('Document mismatch');
      return discussionPage(props.namespace,r.document,args.offset??0,args.limit??8000,args.version);
    });
    if(action==='questions'){
      const rows=state.questions??[],offset=args.offset??0,limit=args.limit??25;
      return {total:rows.length,items:rows.slice(offset,offset+limit),nextOffset:offset+limit<rows.length?offset+limit:null,extraction:'literal_question_candidates_not_a_diagnosis',coverage:'only_synced_documents; role-labeled user turns or question lines; not guaranteed exhaustive'};
    }
    if(action==='submissions'){
      const offset=args.offset??0,limit=args.limit??20,catalog=allProblems(state.problems),rows=state.evidence.filter(e=>e.source===args.source).sort((a,b)=>b.observedAt.localeCompare(a.observedAt));
      return {source:args.source,status:state.sourceStatus[args.source]??null,totalStored:rows.length,uniqueProblems:new Set(rows.map(e=>e.itemId)).size,offset,nextOffset:offset+limit<rows.length?offset+limit:null,items:rows.slice(offset,offset+limit).map(e=>{
        const p=catalog.find(p=>p.id===e.itemId),id=e.provenanceId?.split(':')[1];
        return {...e,title:p?.title??null,problemRef:p?.problemRef??null,submissionUrl:args.source==='leetcode'?`https://leetcode.com/submissions/detail/${id}/`:`https://codeforces.com/contest/${p?.problemRef.match(/^cf:(\d+)/)?.[1]}/submission/${id}`};
      }),coverage:'accumulated_observed_submissions_not_complete_platform_history'};
    }
    if(action==='code'){
      const problem=allProblems(state.problems).find(p=>p.id===args.itemId);
      if(!problem)throw Error('Unknown learning item');
      const file=problem.codeFiles?.[Number(args.fileIndex??0)];
      return file?{found:true,...await readProblemCode(file,this.env)}:{found:false,reason:'No synchronized GitHub code file for this problem.'};
    }
    if(action==='search') {
      if(args.refresh===true)await this.invalidateMemorySearchCache();
      const query=String(args.query).trim();if(query.length<3||query.length>250)throw Error('Invalid query');
      const namespaces=readNamespaces(this.env);
      const key='search:'+await sha256(JSON.stringify({query,namespaces}));
      const cache=await this.ctx.storage.get<{at:number;value:any}>(key);
      if(args.refresh!==true&&cache&&Date.now()-cache.at<300000)return {...cache.value,cache:'hit'};
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
      let raw={...args};
      if(args.itemId&&!curriculumItem(args.itemId)){
        const p=allProblems(state.problems).find(p=>p.id===args.itemId);
        if(!p||args.problemRef&&args.problemRef!==p.problemRef)throw Error('Unknown or conflicting external problem');
        raw={...args,itemId:null,problemRef:p.problemRef};
      }
      const e=await eventEnvelope(raw);
      if(e.payload.event.problemRef){const ref=e.payload.event.problemRef;if(!allProblems(state.problems).some(p=>p.problemRef===ref))state.problems=mergeProblems(state.problems??[],[await makeProblem(ref,undefined,'External practice',e.payload.event.conceptKeys.join(' '))]);}
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
      await this.invalidateMemorySearchCache();
      return saved;
    }
    if(action==='review') {
      assertItem(args.itemId,state.problems);
      if(!Number.isInteger(args.grade)||args.grade<0||args.grade>5||typeof args.clientEventId!=='string'||!/^[A-Za-z0-9:_-]{8,100}$/.test(args.clientEventId))throw Error('Invalid review');
      const key='review:'+await sha256(args.clientEventId),fingerprint=await sha256(JSON.stringify({itemId:args.itemId,grade:args.grade}));
      const old=await this.ctx.storage.get<any>(key);if(old){if(old.fingerprint!==fingerprint)throw Error('Idempotency conflict');return {...old,duplicate:true};}
      const next=review(state.progress[args.itemId]??{ease:2.5,interval_days:0,repetitions:0},args.grade,learningDay());
      const record={itemId:args.itemId,grade:args.grade,reviewedAt:new Date().toISOString()};
      const tracked=allProblems(state.problems).find(p=>p.id===args.itemId)!;
      const problem=curriculumItem(args.itemId)?undefined:{problemRef:tracked.problemRef,title:tracked.title,topic:tracked.topic,idea:tracked.idea};
      await this.ctx.storage.put(key,{status:'pending',fingerprint});
      const memory=await withMemory(props.accessToken,call=>call('add_memory',{namespace:props.namespace,content:JSON.stringify({format:'coding-intuition-review-v1',clientEventId:args.clientEventId,record,schedule:next,problem,provenance:'learner_recall_grade_not_acceptance'})}));
      if(memory.success!==true||memory.namespace!==props.namespace)throw Error('Memory write unconfirmed');
      state.progress[args.itemId]={...next,grade:args.grade};state.reviews.push(record);
      const saved={status:'stored',fingerprint,nextDue:next.due_date,documentId:memory.id??null};await this.save(state,{[key]:saved});await this.invalidateMemorySearchCache();return saved;
    }
    if(action==='sync_memory') {
      const page=Number(args.page??1);if(!Number.isSafeInteger(page)||page<1||page>10000)throw Error('Invalid page');
      const staged:Record<string,unknown>={};
      const result=await withMemory(props.accessToken,async call=>{
        const listed=await call('list_documents',{namespace:props.namespace,page,limit:3});
        if(!Array.isArray(listed.documents))throw Error('Invalid document list');
        let changed=0,restored=0,extracted=0;const incomplete:string[]=[];
        for(const doc of listed.documents) {
          const key='document:v2:'+doc.id;
          if(await this.ctx.storage.get(key)===doc.updatedAt)continue;
          const fetched=await call('get_document',{namespace:props.namespace,documentId:doc.id});
          if(fetched.namespace!==props.namespace)throw Error('Space mismatch');
          if(fetched.document?.contentTruncated){incomplete.push(doc.id);continue;}
          const content=fetched.document?.content;
          if(typeof content!=='string')continue;
          const candidates=await extractQuestions({...fetched.document,id:doc.id,updatedAt:doc.updatedAt});
          state.questions=[...(state.questions??[]).filter(q=>q.documentId!==doc.id),...candidates];extracted+=candidates.length;
          const event=parseEnvelope(content);
          if(event&&!state.events.some(e=>e.clientEventId===event.clientEventId)) {
            state.events.push(event);restored++;
            if(event.problemRef&&!allProblems(state.problems).some(p=>p.problemRef===event.problemRef))state.problems=mergeProblems(state.problems??[],[await makeProblem(event.problemRef,undefined,'External practice',event.conceptKeys.join(' '))]);
            const {recordedAt,...raw}=event;const envelope=await eventEnvelope(raw,recordedAt);
            staged['receipt:'+await sha256(event.clientEventId)]={status:'stored',clientEventId:event.clientEventId,fingerprint:envelope.fingerprint,documentId:doc.id};
          }
          try {
            const parsed=JSON.parse(content);
            if(parsed.format==='coding-intuition-review-v1' && /^[A-Za-z0-9:_-]{8,100}$/.test(parsed.clientEventId)) {
              const r=parsed.record;
              if(!Number.isInteger(r?.grade)||r.grade<0||r.grade>5||!Number.isFinite(Date.parse(r.reviewedAt)))throw Error('Invalid review document');
              if(parsed.problem){const p=await makeProblem(parsed.problem.problemRef,parsed.problem.title,parsed.problem.topic,parsed.problem.idea);if(p.id!==r.itemId)throw Error('Problem identity mismatch');state.problems=mergeProblems(state.problems??[],[p]);}
              assertItem(r.itemId,state.problems);
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
        return {changed,restored,extracted,incompleteDocuments:incomplete,page,totalPages:listed.pagination?.totalPages??null,nextPage:page<(listed.pagination?.totalPages??page)?page+1:null};
      });
      await this.save(state,staged);
      await this.invalidateMemorySearchCache();
      return {...result,coverage:'one_document_page',historyComplete:result.page===1&&result.nextPage===null&&result.incompleteDocuments.length===0};
    }
    if(action==='sync_source') {
      const source=String(args.source),cursor=Number(args.cursor??1);
      const cached=state.sourceStatus[source] as any;
      if(args.force!==true&&cached?.available===true&&Date.now()-Date.parse(cached.checkedAt)<600000&&cached.pageFrom=== (source==='codeforces'?cursor:undefined))return {...cached,cache:'hit'};
      let result;
      try{result=await fetchSource(source,this.env,cursor);}
      catch{const failed={...cached,available:false,checkedAt:new Date().toISOString(),lastSuccessAt:cached?.lastSuccessAt??(cached?.available?cached.checkedAt:null),error:'public_source_unavailable',cache:'miss'};state.sourceStatus[source]=failed;await this.save(state);return failed;}
      state.problems=mergeProblems(state.problems??[],result.problems??[]);
      const merged=new Map(state.evidence.map(e=>[e.provenanceId,e]));for(const e of result.evidence)merged.set(e.provenanceId,e);
      state.evidence=[...merged.values()];state.sourceStatus[source]={...result.status,lastSuccessAt:result.status.checkedAt};
      if(result.observations)await this.ctx.storage.put('codeforces:'+cursor,result.observations);
      await this.save(state);const catalog=allProblems(state.problems);return {...result.status,cache:'miss',recentSubmissions:result.evidence.slice(0,20).map(e=>({...e,title:catalog.find(p=>p.id===e.itemId)?.title,problemRef:catalog.find(p=>p.id===e.itemId)?.problemRef})),recentObservations:result.observations?.slice(0,20)};
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
