import {analyzeContext,contextSchema} from './context-ingestion';
import {validatedCapture,capturePolicySchema} from './session-capture';
import {evidenceIdentity} from '../../src/lib/learning-events';
import {initialProfile,mergeProfile,profileRecordSchema,updateProfileSchema,getProfileSchema,profileView,learnerSources,sourceNames,timeZoneSchema,type LearnerProfile} from './learner-profile';
import { discussionPage,extractQuestions } from './discussions';
import {MEMORY_CACHE_TTL_MS,memoryCacheIsFresh,saveQuestionSchema,listQuestionsSchema,questionRecordSchema,writeStatusSchema,retryWritesSchema,jobSummary,type QuestionRecord,type WriteJob} from './continuity';
import {rotateUpstreamProps} from './auth';
import {initialMonitor,reconcileMonitorSources,sealCredentials,openCredentials,monitorCredentials,type MonitorState} from './monitor';
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
      try {
        const tenant=await this.ctx.storage.get<{userId:string;namespace:string}>('tenant:identity');
        if(tenant&&(tenant.userId!==input.props.userId||tenant.namespace!==input.props.namespace))return new Response('Forbidden learner store',{status:403});
        if(!tenant)await this.ctx.storage.put('tenant:identity',{userId:input.props.userId,namespace:input.props.namespace});
        return Response.json(await this.run(input.action,input.props,input.args??{}));}
      catch(error){return Response.json({error:'Learning operation could not complete. Retry reads; reconcile pending writes before retrying.',code:error instanceof Error&&/^MEMORY_[A-Z_]+$/.test(error.message)?error.message:'LEARNING_OPERATION_FAILED'},{status:502});}
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
    const tenant=await this.tenantIdentity(),profile=await this.profile(tenant);
    const sourceEnv=learnerSources(this.env,tenant,profile);
    reconcileMonitorSources(m,{leetcode:sourceEnv.LEETCODE_USERNAME||'',codeforces:sourceEnv.CODEFORCES_HANDLE||'',github:(sourceEnv.GITHUB_SOLUTIONS_REPO??'')+':'+(sourceEnv.GITHUB_SOLUTIONS_PATH??'')});
    const tasks=[...sourceNames(sourceEnv),'memory'];
    const task=tasks[m.taskIndex%tasks.length],started=Date.now(),previous=m.tasks[task];let succeeded=false;m.lastRunAt=new Date().toISOString();
    try{
      const props=await monitorCredentials(this.env,await this.ctx.storage.get('monitor:credentials'),tenant);
      if(!this.env.LOCAL_CREDENTIALS)await this.ctx.storage.put('monitor:credentials',await sealCredentials(this.env,props));
      await this.run('retry_writes',props,{limit:1});
      const r:any=await this.run(task==='memory'?'sync_memory':'sync_source',props,task==='memory'?{page:m.memoryPage}:{source:task,force:true,cursor:task==='codeforces'?m.cfCursor:1});
      if(r.available===false)throw Error('Source unavailable');
      if(task==='memory')m.memoryPage=r.nextPage??1;
      if(task==='codeforces')m.cfCursor=r.nextCursor??1;
      const taskStatus=r.incompleteDocuments?.length?'partial_provider_truncation':task==='memory'&&!r.sweepComplete?'partial_indexing':'success';
      m.tasks[task]={status:taskStatus,checkedAt:m.lastRunAt,lastSuccessAt:taskStatus==='success'?new Date().toISOString():previous?.lastSuccessAt,lastCompletedAt:new Date().toISOString(),failureCount:0,durationMs:Date.now()-started,coverage:r.coverage,historyComplete:task==='memory'?r.sweepComplete&&!r.incompleteDocuments?.length:r.historyComplete};if(taskStatus==='success')m.lastSuccessAt=m.tasks[task].lastSuccessAt;m.consecutiveFailures=0;succeeded=true;
    }catch{m.tasks[task]={status:'failed_reconnect_or_retry',checkedAt:m.lastRunAt,lastSuccessAt:previous?.lastSuccessAt,failureCount:(previous?.failureCount??0)+1,durationMs:Date.now()-started};m.consecutiveFailures++;}
    if(task==='memory'&&succeeded)m.memoryPagesThisCycle=(m.memoryPagesThisCycle??0)+1;
    if(!succeeded||task!=='memory'||m.memoryPage===1||(m.memoryPagesThisCycle??0)>=3){m.taskIndex=(m.taskIndex+1)%tasks.length;if(task==='memory')m.memoryPagesThisCycle=0;}
    // One bounded task per wake-up; capped retry delay avoids tight failure loops.
    const delay=m.consecutiveFailures?Math.min(3600000,60000*2**Math.min(6,m.consecutiveFailures)):m.taskIndex===0?m.intervalMinutes*60000:60000;
    m.nextRunAt=Date.now()+delay;await this.ctx.storage.put('monitor:state',m);await this.ctx.storage.setAlarm(m.nextRunAt);return m;
  }
  private async tenantIdentity(){return await this.ctx.storage.get<{userId:string;namespace:string}>('tenant:identity')??{userId:this.env.OWNER_SUPERMEMORY_ID,namespace:this.env.MEMORY_NAMESPACE};}
  private async profile(props:Pick<AuthProps,'userId'>){return await this.ctx.storage.get<LearnerProfile>('profile:current')??initialProfile(this.env,props);}
  private applyChangedSources(state:Snapshot,props:Pick<AuthProps,'userId'>,old:LearnerProfile,next:LearnerProfile){
    const a=learnerSources(this.env,props,old),b=learnerSources(this.env,props,next),changed:string[]=[];
    for(const [source,keys] of [['leetcode',['LEETCODE_USERNAME']],['codeforces',['CODEFORCES_HANDLE']],['github',['GITHUB_SOLUTIONS_REPO','GITHUB_SOLUTIONS_PATH']]] as const){
      if(keys.some(k=>a[k]!==b[k])){changed.push(source);state.evidence=state.evidence.map(e=>e.source===source?{...e,inactive:true}:e);state.sourceStatus[source]={available:false,reason:'account_changed_resync_required',checkedAt:new Date().toISOString()};}
    }
    return changed;
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
  private async finishWrite(key:string,job:WriteJob,documentId:string|null){
    const state=await this.snapshot(),data=JSON.parse(job.content),extra:Record<string,unknown>={};
    let receipt:any={status:'stored',clientEventId:job.clientEventId,fingerprint:job.fingerprint,documentId};
    if(job.kind==='event'){
      const event=parseEnvelope(job.content);if(!event)throw Error('Invalid queued event');
      if(event.problemRef&&!allProblems(state.problems).some(p=>p.problemRef===event.problemRef))state.problems=mergeProblems(state.problems??[],[await makeProblem(event.problemRef,undefined,'External practice',event.conceptKeys.join(' '))]);
      if(!state.events.some(e=>e.clientEventId===event.clientEventId||event.source&&e.source&&evidenceIdentity(e.source)===evidenceIdentity(event.source)))state.events.push(event);
      receipt.provenance='learner_self_report_not_acceptance';
    }else if(job.kind==='review'){
      const r=data.record;
      if(!state.reviews.some(x=>x.clientEventId===r.clientEventId))state.reviews.push(r);
      const history=state.reviews.filter(x=>x.itemId===r.itemId).sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt)||String(a.clientEventId).localeCompare(String(b.clientEventId)));
      let schedule={ease:2.5,interval_days:0,repetitions:0,due_date:learningDay()};
      for(const row of history)schedule=review(schedule,row.grade,learningDay(Date.parse(row.reviewedAt),row.timeZone??'Asia/Kolkata'));
      state.progress[r.itemId]={...schedule,grade:history.at(-1)!.grade};
      receipt={...receipt,itemId:r.itemId,grade:r.grade,reviewedAt:r.reviewedAt,nextDue:schedule.due_date,provenance:'learner_recall_grade_not_acceptance'};
    }else if(job.kind==='question'){
      const r=questionRecordSchema.parse(data.record);
      receipt={...receipt,questionId:r.questionId,revision:r.revision};
      extra['thread-sync:'+r.questionId+':'+r.revision]={status:'stored',documentId};
    }else if(job.kind==='session'){
      receipt={...receipt,sessionId:data.sessionId,checkpointId:data.checkpointId};
    }else{
      const p=profileRecordSchema.parse(data.profile);receipt={...receipt,profileRevision:p.revision};extra['profile-sync:'+p.revision]={status:'stored',documentId};
    }
    await this.save(state,{...extra,[job.receiptKey]:receipt});
    // Crash before removal is safe: the stored receipt is checked before delivery.
    await this.ctx.storage.delete(key);await this.invalidateMemorySearchCache();return receipt;
  }
  private async deliver(key:string,job:WriteJob,props:AuthProps,resendUnconfirmed=false):Promise<any>{
    const old=await this.ctx.storage.get<any>(job.receiptKey);
    if(old?.status==='stored'){await this.ctx.storage.delete(key);return {...old,duplicate:true};}
    if(job.nextAttemptAt>Date.now()&&!resendUnconfirmed)return {...jobSummary(job),status:'pending',localDurable:true};
    try{
      if(job.status==='uncertain'&&!(resendUnconfirmed&&job.reconciledAbsentAt&&Date.now()-job.reconciledAbsentAt<600000)){
        // Never blindly resend a response-lost write. Reconcile one bounded document page per retry.
        const found=await withMemory(props.accessToken,async call=>{
          const scan=structuredClone(job.scan??{page:1,pages:null,ids:[]} as NonNullable<WriteJob['scan']>),listed=await call('list_documents',{namespace:props.namespace,page:scan.page,limit:3});
          const pages=listed.pagination?.totalPages;
          if(!Number.isSafeInteger(pages)||pages<0||!Array.isArray(listed.documents)||listed.documents.length>3)throw Error('Reconciliation inventory unavailable');
          const normalized=Math.max(1,pages);
          if(scan.pages!==null&&scan.pages!==normalized){job.scan=undefined;throw Error('Inventory changed; retry reconciliation');}
          scan.pages=normalized;
          for(const d of listed.documents){
            if(scan.ids.length>=10000)throw Error('Reconciliation inventory exceeds bounded scan');
            if(typeof d.id!=='string'||scan.ids.includes(d.id))throw Error('Unstable document inventory');
            const fetched=await call('get_document',{namespace:props.namespace,documentId:d.id});
            if(fetched.namespace!==props.namespace||fetched.document?.id!==d.id)throw Error('Reconciliation document identity mismatch');
            if(fetched.document.contentTruncated||typeof fetched.document.content!=='string'){scan.incomplete=true;scan.ids.push(d.id);continue;}
            const text=fetched.document.content;
            if(text===job.content)return d.id;
            // Legacy jobs may have a regenerated timestamp; compare stable logical identity too.
            try{const remote=JSON.parse(text);if(job.kind==='event'){const e=parseEnvelope(text);if(e?.clientEventId===job.clientEventId){const {recordedAt,...raw}=e;const envelope=await eventEnvelope(raw,recordedAt);if(envelope.fingerprint!==job.fingerprint)throw Error('Conflicting event identity');job.content=text;return d.id;}}else if(job.kind==='review'&&remote.format==='coding-intuition-review-v1'&&remote.clientEventId===job.clientEventId){if(await sha256(JSON.stringify({itemId:remote.record?.itemId,grade:remote.record?.grade}))!==job.fingerprint)throw Error('Conflicting review identity');job.content=text;return d.id;}}catch(error){if(error instanceof Error&&error.message.startsWith('Conflicting'))throw error;}
            scan.ids.push(d.id);
          }
          if(scan.page<normalized){scan.page++;job.scan=scan;return null;}
          if(!Number.isSafeInteger(listed.pagination?.totalItems)||listed.pagination.totalItems!==scan.ids.length)throw Error('Incomplete reconciliation inventory');
          // Even a full inventory cannot prove a timed-out provider write never committed.
          // Keep ambiguous writes durable for later reconciliation; never risk an automatic duplicate.
          job.scan=undefined;job.reconciledAbsentAt=scan.incomplete?undefined:Date.now();job.lastError=scan.incomplete?'provider_truncated; retained_for_reconciliation':'unconfirmed_write_not_found; retained_for_reconciliation';return null;
        });
        if(found)return await this.finishWrite(key,job,found);
        job.nextAttemptAt=Date.now()+(job.scan?1000:60000);await this.ctx.storage.put(key,job);
        return {...jobSummary(job),status:'pending',localDurable:true,retryPolicy:'reconcile_uncertain_before_resend'};
      }
      // Mark uncertain BEFORE calling the provider, including crashes and lost responses.
      job.attempts++;job.nextAttemptAt=0;await this.ctx.storage.put(key,job);
      const memory=await withMemory(props.accessToken,async call=>{job.status='uncertain';job.reconciledAbsentAt=undefined;await this.ctx.storage.put(key,job);return call('add_memory',{namespace:props.namespace,content:job.content});});
      if(memory.success!==true||memory.namespace!==props.namespace)throw Error('Memory write unconfirmed');
      return await this.finishWrite(key,job,memory.id??null);
    }catch(error){
      job.lastError=error instanceof Error&&/^MEMORY_[A-Z_]+$/.test(error.message)?error.message:'upstream_unavailable_or_write_unconfirmed';job.nextAttemptAt=Date.now()+Math.min(3600000,1000*2**Math.min(job.attempts+1,11));await this.ctx.storage.put(key,job);
      return {...jobSummary(job),status:'pending',localDurable:true,retryPolicy:'reconcile_uncertain_before_resend'};
    }
  }
  private async run(action:string,props:AuthProps,args:Record<string,any>):Promise<unknown> {
    if(action==='capture_policy')return {enabled:await this.ctx.storage.get<boolean>('capture:enabled')??false,scope:'brief_supplied_DSA_summaries_and_learner_supported_observations',trigger:'ChatGPT_tool_call_required_no_tab_close_listener'};
    const state=await this.snapshot();
    const profile=await this.profile(props),sources=learnerSources(this.env,props,profile);
    if(action==='snapshot')return {...state,learnerProfile:profile,evidence:state.evidence.filter(e=>!e.inactive),problems:state.problems?.map(p=>({...p,codeFiles:p.codeFiles?.filter(f=>f.repo===sources.GITHUB_SOLUTIONS_REPO&&(!sources.GITHUB_SOLUTIONS_PATH||f.path.startsWith(sources.GITHUB_SOLUTIONS_PATH+'/')))})),sourceConfiguration:{leetcodeUsername:sources.LEETCODE_USERNAME||null,codeforcesHandle:sources.CODEFORCES_HANDLE||null,githubRepo:sources.GITHUB_SOLUTIONS_REPO??null,githubPath:sources.GITHUB_SOLUTIONS_PATH??null}};
    if(action==='analyze_context'||action==='ingest_context'){
      const input=contextSchema.parse(args),hash=await sha256(JSON.stringify([{...input,approved:undefined},allProblems(state.problems).map(p=>[p.problemRef,p.title,p.idea]),'literal-question-v2'])),key='context-cache:'+hash;
      const cached=await this.ctx.storage.get<{at:number;value:any}>(key);
      const hit=!!cached&&memoryCacheIsFresh(cached.at),value=hit?cached!.value:analyzeContext(input,allProblems(state.problems));
      if(!hit){const entries=await this.ctx.storage.list<{at:number}>({prefix:'context-cache:'});for(const [old,row] of entries)if(!memoryCacheIsFresh(row.at)){await this.ctx.storage.delete(old);entries.delete(old);}if(entries.size<20)await this.ctx.storage.put(key,{at:Date.now(),value});}
      const result={...value,cache:hit?'hit':'miss',cacheTtlSeconds:3600,interpretation:'Learner questions establish discussion relevance, not diagnosed mistakes or mastery.'};
      if(action==='analyze_context')return {...result,writePerformed:false};
      const receipt=await this.run('capture_session',props,{...value.capture,approved:input.approved});
      return {...result,receipt};
    }
    if(action==='configure_capture'){const input=capturePolicySchema.parse(args);await this.ctx.storage.put('capture:enabled',input.enabled);return this.run('capture_policy',props,{});}
    if(action==='capture_session'){
      const input=validatedCapture(args);
      if(!input.approved&&!await this.ctx.storage.get<boolean>('capture:enabled'))return {status:'approval_required',writePerformed:false};
      const identity=await sha256(input.sessionId+':'+input.checkpointId),receiptKey='session-receipt:'+await sha256('session:'+identity.slice(0,60)),jobKey='outbox:session:'+identity;
      const payload={format:'coding-intuition-session-v1',sessionId:input.sessionId,checkpointId:input.checkpointId,summary:input.summary,observations:input.observations,namespace:props.namespace,learnerId:props.userId};
      const content=JSON.stringify(payload),fingerprint=await sha256(content),prior=await this.ctx.storage.get<any>(receiptKey);
      if(prior&&prior.fingerprint!==fingerprint)throw Error('Checkpoint conflict; use a new checkpointId for new context');
      let job=await this.ctx.storage.get<WriteJob>(jobKey);
      if(!prior&&!job){job={kind:'session',clientEventId:'session:'+identity.slice(0,60),receiptKey,fingerprint,content,createdAt:new Date().toISOString(),status:'queued',attempts:0,nextAttemptAt:0};await this.ctx.storage.put({[jobKey]:job,[receiptKey]:{status:'pending',fingerprint},['session:'+identity]:payload,'session:recent':[...((await this.ctx.storage.get<string[]>('session:recent'))??[]).filter(id=>id!==identity),identity].slice(-5)});}
      const summaryReceipt=prior?.status==='stored'?{...prior,duplicate:true}:await this.deliver(jobKey,job!,props);
      const observations=[];
      for(const row of input.observations){const clientEventId='capture:'+ (await sha256(input.sessionId+':'+row.turnId)).slice(0,60);try{observations.push(await this.run('record',props,{...row.event,clientEventId}));}catch{observations.push({status:'retry_required',clientEventId});}}
      return {status:summaryReceipt.status==='stored'&&observations.every((r:any)=>['stored','duplicate_evidence'].includes(r.status))?'stored':'pending',summaryReceipt,observations,questionThreadsUnchanged:true,interpretation:'Summary is context; only supplied learner observations affect learning signals. No mastery or grade inferred.'};
    }
    if(action==='get_profile'){
      const input=getProfileSchema.parse(args),prefix='profile-revision:';
      const history=input.includeHistory?[...(await this.ctx.storage.list<LearnerProfile>({prefix,...(input.beforeRevision?{end:prefix+String(input.beforeRevision).padStart(7,'0')}:{}),reverse:true,limit:input.limit+1})).values()]:[];
      return {...profileView(profile,state),sessionCapture:{enabled:await this.ctx.storage.get<boolean>('capture:enabled')??false,recentSummaries:await Promise.all(((await this.ctx.storage.get<string[]>('session:recent'))??[]).map(async id=>{const row=await this.ctx.storage.get<any>('session:'+id);return row?{sessionId:row.sessionId,checkpointId:row.checkpointId,summary:row.summary,interpretation:'supplied_summary_not_mastery'}:null;})),coverage:'latest_five_locally_captured_checkpoints_only'},sourceConfiguration:{leetcodeUsername:sources.LEETCODE_USERNAME||null,codeforcesHandle:sources.CODEFORCES_HANDLE||null,githubRepo:sources.GITHUB_SOLUTIONS_REPO??null,githubPath:sources.GITHUB_SOLUTIONS_PATH??null},configured:profile.revision>0,memorySync:profile.revision?await this.ctx.storage.get('profile-sync:'+profile.revision)??{status:'pending'}:{status:'not_saved'},...(input.includeHistory?{history:history.slice(0,input.limit),nextBeforeRevision:history.length>input.limit?history[input.limit-1].revision:null}:{})};
    }
    if(action==='update_profile'){
      const input=updateProfileSchema.parse(args),fingerprint=await sha256(JSON.stringify(input)),key='profile-receipt:'+await sha256(input.clientEventId),jobKey='outbox:profile:'+await sha256(input.clientEventId);
      const old=await this.ctx.storage.get<any>(key);
      if(old){if(old.fingerprint!==fingerprint)throw Error('Idempotency conflict');if(old.status==='stored')return {...old,duplicate:true};const job=await this.ctx.storage.get<WriteJob>(jobKey);if(!job)throw Error('Missing profile payload');return this.deliver(jobKey,job,props);}
      if(profile.revision!==input.expectedRevision)return {status:'revision_conflict',currentRevision:profile.revision,writePerformed:false};
      const next=mergeProfile(profile,input),changed=this.applyChangedSources(state,props,profile,next);
      const job:WriteJob={kind:'profile',clientEventId:input.clientEventId,receiptKey:key,fingerprint,content:JSON.stringify({format:'coding-intuition-learner-profile-v1',learnerId:props.userId,namespace:props.namespace,clientEventId:input.clientEventId,fingerprint,profile:next}),createdAt:new Date().toISOString(),status:'queued',attempts:0,nextAttemptAt:0};
      const extras:Record<string,unknown>={'profile:current':next,['profile-revision:'+String(next.revision).padStart(7,'0')]:next,[key]:{status:'pending',clientEventId:input.clientEventId,fingerprint,profileRevision:next.revision},[jobKey]:job};
      if(changed.length){const m=await this.ctx.storage.get<MonitorState>('monitor:state')??initialMonitor();for(const source of changed)delete m.tasks[source];if(changed.includes('codeforces'))m.cfCursor=1;m.taskIndex=0;extras['monitor:state']=m;}
      await this.save(state,extras);await this.invalidateMemorySearchCache();return this.deliver(jobKey,job,props);
    }
    if(action==='refresh_credentials'){
      let current=props;const sealed=await this.ctx.storage.get<any>('monitor:credentials');
      if(sealed){const stored=await openCredentials(this.env,sealed,props);if(stored.expiresAt>=current.expiresAt)current=stored;}
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
      const offset=args.offset??0,limit=args.limit??20,catalog=allProblems(state.problems),rows=state.evidence.filter(e=>e.source===args.source&&!e.inactive).sort((a,b)=>b.observedAt.localeCompare(a.observedAt));
      return {source:args.source,status:state.sourceStatus[args.source]??null,totalStored:rows.length,uniqueProblems:new Set(rows.map(e=>e.itemId)).size,offset,nextOffset:offset+limit<rows.length?offset+limit:null,items:rows.slice(offset,offset+limit).map(e=>{
        const p=catalog.find(p=>p.id===e.itemId),id=e.provenanceId?.split(':')[1];
        return {...e,title:p?.title??null,problemRef:p?.problemRef??null,submissionUrl:args.source==='leetcode'?`https://leetcode.com/submissions/detail/${id}/`:`https://codeforces.com/contest/${p?.problemRef.match(/^cf:(\d+)/)?.[1]}/submission/${id}`};
      }),coverage:'accumulated_observed_submissions_not_complete_platform_history'};
    }
    if(action==='code'){
      const problem=allProblems(state.problems).find(p=>p.id===args.itemId);
      if(!problem)throw Error('Unknown learning item');
      const file=problem.codeFiles?.filter(f=>f.repo===sources.GITHUB_SOLUTIONS_REPO&&(!sources.GITHUB_SOLUTIONS_PATH||f.path.startsWith(sources.GITHUB_SOLUTIONS_PATH+'/')))[Number(args.fileIndex??0)];
      return file?{found:true,...await readProblemCode(file,sources)}:{found:false,reason:'No synchronized GitHub code file for this problem.'};
    }
    if(action==='search') {
      if(args.refresh===true)await this.invalidateMemorySearchCache();
      const query=String(args.query).trim();if(query.length<3||query.length>250)throw Error('Invalid query');
      const namespaces=readNamespaces(this.env,props);
      const key='search:'+await sha256(JSON.stringify({query,namespaces}));
      const cache=await this.ctx.storage.get<{at:number;value:any}>(key);
      if(args.refresh!==true&&cache&&memoryCacheIsFresh(cache.at))return {...cache.value,cache:'hit',cachedAt:new Date(cache.at).toISOString(),expiresAt:new Date(cache.at+MEMORY_CACHE_TTL_MS).toISOString(),cacheTtlSeconds:3600};
      const searched=await withMemory(props.accessToken,async call=>{
        const items:any[]=[],unavailable:string[]=[],profiles:any[]=[],documentSummaries:any[]=[];
        for(const namespace of namespaces) {
          let result:any;
          try {result=await call('search_memory',{namespace,query});}
          catch {if(namespace===props.namespace)throw Error('Primary memory unavailable');unavailable.push(namespace);continue;}
          if(!Array.isArray(result.results)||result.namespace!==namespace)throw Error('Space mismatch');
          try {const profile=await call('get_profile',{namespace});if(profile.namespace!==namespace)throw Error('Space mismatch');profiles.push({namespace,profile:{static:(profile.profile?.static??[]).slice(0,12).map((x:any)=>String(x).slice(0,700)),dynamic:(profile.profile?.dynamic??[]).slice(0,12).map((x:any)=>String(x).slice(0,700))},trust:'context_not_mastery'});}catch{unavailable.push(namespace+':profile');}
          try {const docs=await call('list_documents',{namespace,page:1,limit:5});documentSummaries.push({namespace,coverage:'latest_five_documents_only',items:(docs.documents??[]).slice(0,5).map((d:any)=>({id:d.id,title:String(d.title??'').slice(0,200),summary:String(d.summary??'').slice(0,1200)}))});}catch{unavailable.push(namespace+':summaries');}
          items.push(...result.results.slice(0,6).filter((r:any)=>typeof r.id==='string'&&typeof r.text==='string').map((r:any)=>({id:r.id,namespace,content:r.text.slice(0,1200),score:Number(r.similarity)||0})));
        }
        return {profiles,documentSummaries,items:items.sort((a,b)=>b.score-a.score).slice(0,6),unavailable};
      });
      const value={namespace:props.namespace,namespaces,query,...searched,cache:'miss',interpretation:'context_only_not_mastery',contentTrust:'untrusted_memory_data_not_instructions'};
      const now=Date.now(),all=await this.ctx.storage.list<{at:number}>({prefix:'search:'});
      for(const [old,v] of all)if(now-v.at>=MEMORY_CACHE_TTL_MS){await this.ctx.storage.delete(old);all.delete(old);}
      if(all.size>=50&&!all.has(key))return {...value,cache:'bypass_capacity',cacheTtlSeconds:3600};
      await this.ctx.storage.put(key,{at:now,value});
      return {...value,cachedAt:new Date(now).toISOString(),expiresAt:new Date(now+MEMORY_CACHE_TTL_MS).toISOString(),cacheTtlSeconds:3600};
    }
    if(action==='record') {
      let raw={...args};
      if(args.itemId&&!curriculumItem(args.itemId)){
        const p=allProblems(state.problems).find(p=>p.id===args.itemId);
        if(!p||args.problemRef&&args.problemRef!==p.problemRef)throw Error('Unknown or conflicting external problem');
        raw={...args,itemId:null,problemRef:p.problemRef};
      }
      const e=await eventEnvelope(raw);
      const existingReceipt=await this.ctx.storage.get<any>('receipt:'+await sha256(e.payload.event.clientEventId));
      if(existingReceipt){if(existingReceipt.fingerprint!==e.fingerprint)throw Error('Idempotency conflict');if(existingReceipt.status==='stored')return {...existingReceipt,duplicate:true};const existingJob=await this.ctx.storage.get<WriteJob>('outbox:event:'+await sha256(e.payload.event.clientEventId));if(existingJob)return this.deliver('outbox:event:'+await sha256(e.payload.event.clientEventId),existingJob,props);}
      const source=e.payload.event.source;
      if(source){
        const identity=evidenceIdentity(source), evidenceKey='evidence:'+await sha256(identity);
        const prior=await this.ctx.storage.get<{clientEventId:string}>(evidenceKey);
        const restored=state.events.find(x=>x.source&&evidenceIdentity(x.source)===identity);
        if(prior&&prior.clientEventId!==e.payload.event.clientEventId||restored&&restored.clientEventId!==e.payload.event.clientEventId)return {status:'duplicate_evidence',originalClientEventId:prior?.clientEventId??restored?.clientEventId,writePerformed:false};
        if(source.kind==='saved_discussion'){
          const page:any=await this.run('read_discussion',props,{documentId:source.documentId,version:source.version,offset:source.start,limit:Array.from(source.excerpt).length});
          if(!page.available||page.version!==source.version||page.content!==source.excerpt)throw Error('Evidence source changed or excerpt mismatch');
          const full:any=await this.run('read_discussion',props,{documentId:source.documentId,version:source.version,offset:0,limit:Math.min(20000,source.start!+Array.from(source.excerpt).length)});
          if(source.start!>=20000)throw Error('Role verification requires an excerpt in the first 20000 characters');
          const before=Array.from(String(full.content??'')).slice(0,source.start).join('');
          const roles=[...(before+source.excerpt).matchAll(/^(?:#{1,6}\s*)?(user|human|assistant|chatgpt)\s*:/gim)];
          if(roles.length&&/assistant|chatgpt/i.test(roles.at(-1)![1]))throw Error('Assistant explanation cannot become learner evidence');
        }
      }

      if(e.payload.event.problemRef){const ref=e.payload.event.problemRef;if(!allProblems(state.problems).some(p=>p.problemRef===ref))state.problems=mergeProblems(state.problems??[],[await makeProblem(ref,undefined,'External practice',e.payload.event.conceptKeys.join(' '))]);}
      const key='receipt:'+await sha256(e.payload.event.clientEventId);
      const previous=await this.ctx.storage.get<any>(key);
      if(previous&&previous.fingerprint!==e.fingerprint)throw Error('Idempotency conflict');
      if(previous?.status==='stored')return {...previous,duplicate:true};
      const jobKey='outbox:event:'+await sha256(e.payload.event.clientEventId);
      let job=await this.ctx.storage.get<WriteJob>(jobKey);
      if(!job){
        // Legacy pending receipts lack the original timestamp/payload: reconcile before any resend.
        job={kind:'event',clientEventId:e.payload.event.clientEventId,receiptKey:key,fingerprint:e.fingerprint,content:e.content,createdAt:new Date().toISOString(),status:previous?'uncertain':'queued',attempts:0,nextAttemptAt:0};
        await this.ctx.storage.put({[jobKey]:job,[key]:{status:'pending',clientEventId:job.clientEventId,fingerprint:job.fingerprint},...(source?{['evidence:'+await sha256(evidenceIdentity(source))]:{clientEventId:job.clientEventId}}:{})});
      }
      return this.deliver(jobKey,job,props);
    }
    if(action==='review') {
      assertItem(args.itemId,state.problems);
      if(!Number.isInteger(args.grade)||args.grade<0||args.grade>5||typeof args.clientEventId!=='string'||!/^[A-Za-z0-9:_-]{8,100}$/.test(args.clientEventId))throw Error('Invalid review');
      const key='review:'+await sha256(args.clientEventId),fingerprint=await sha256(JSON.stringify({itemId:args.itemId,grade:args.grade}));
      const old=await this.ctx.storage.get<any>(key);if(old){if(old.fingerprint!==fingerprint)throw Error('Idempotency conflict');if(old.status==='stored')return {...old,duplicate:true};}
      const record={itemId:args.itemId,grade:args.grade,reviewedAt:new Date().toISOString(),clientEventId:args.clientEventId,timeZone:profile.preferences.timeZone};
      const tracked=allProblems(state.problems).find(p=>p.id===args.itemId)!;
      const problem=curriculumItem(args.itemId)?undefined:{problemRef:tracked.problemRef,title:tracked.title,topic:tracked.topic,idea:tracked.idea};
      const jobKey='outbox:review:'+await sha256(args.clientEventId);
      let job=await this.ctx.storage.get<WriteJob>(jobKey);
      if(!job){job={kind:'review',clientEventId:args.clientEventId,receiptKey:key,fingerprint,content:JSON.stringify({format:'coding-intuition-review-v1',clientEventId:args.clientEventId,record,problem,provenance:'learner_recall_grade_not_acceptance'}),createdAt:new Date().toISOString(),status:old?'uncertain':'queued',attempts:0,nextAttemptAt:0};await this.ctx.storage.put({[jobKey]:job,[key]:{status:'pending',fingerprint,clientEventId:args.clientEventId}});}
      return this.deliver(jobKey,job,props);
    }
    if(action==='save_question'){
      const input=saveQuestionSchema.parse(args),fingerprint=await sha256(JSON.stringify(input));
      const key='question-receipt:'+await sha256(input.clientEventId),jobKey='outbox:question:'+await sha256(input.clientEventId);
      const previous=await this.ctx.storage.get<any>(key);
      if(previous){if(previous.fingerprint!==fingerprint)throw Error('Idempotency conflict');if(previous.status==='stored')return {...previous,duplicate:true};const job=await this.ctx.storage.get<WriteJob>(jobKey);if(!job)throw Error('Missing durable question payload');return this.deliver(jobKey,job,props);}
      const threadKey='thread:'+input.questionId,old=await this.ctx.storage.get<QuestionRecord>(threadKey);
      if((old?.revision??0)!==input.expectedRevision)return {status:'revision_conflict',questionId:input.questionId,currentRevision:old?.revision??0,writePerformed:false};
      const {clientEventId,expectedRevision,...fields}=input,now=new Date().toISOString();
      const record:QuestionRecord={...fields,revision:expectedRevision+1,createdAt:old?.createdAt??now,updatedAt:now};
      const job:WriteJob={kind:'question',clientEventId,receiptKey:key,fingerprint,content:JSON.stringify({format:'coding-intuition-question-v1',clientEventId,record}),createdAt:now,status:'queued',attempts:0,nextAttemptAt:0};
      // Local current state, immutable revision and full pending payload are one atomic commit.
      await this.ctx.storage.put({[threadKey]:record,['thread-revision:'+input.questionId+':'+String(record.revision).padStart(7,'0')]:record,[jobKey]:job,[key]:{status:'pending',clientEventId,fingerprint,questionId:input.questionId,revision:record.revision}});
      return this.deliver(jobKey,job,props);
    }
    if(action==='question_threads'){
      const input=listQuestionsSchema.parse(args);
      const rows=[...(await this.ctx.storage.list<QuestionRecord>({prefix:'thread:'})).values()].filter(q=>(!input.questionId||q.questionId===input.questionId)&&(input.status==='all'||input.status==='active'?input.status==='all'||q.status!=='resolved':q.status===input.status)&&(!input.problemRef||q.problemRef===input.problemRef)&&(!input.conceptKey||q.conceptKeys.includes(input.conceptKey))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.questionId.localeCompare(b.questionId));
      const items=await Promise.all(rows.slice(input.offset,input.offset+input.limit).map(async q=>({...q,memorySync:await this.ctx.storage.get('thread-sync:'+q.questionId+':'+q.revision)??{status:'pending'}})));
      const revisionPrefix='thread-revision:'+input.questionId+':';
      const revisionRows=input.questionId?[...(await this.ctx.storage.list<QuestionRecord>({prefix:revisionPrefix,...(input.beforeRevision?{end:revisionPrefix+String(input.beforeRevision).padStart(7,'0')}:{}),reverse:true,limit:input.limit+1})).values()]:undefined;
      const revisions=revisionRows?.slice(0,input.limit).sort((a,b)=>a.revision-b.revision);
      return {total:rows.length,items,...(revisions?{revisions,nextBeforeRevision:revisionRows!.length>input.limit?revisions[0].revision:null}:{}),nextOffset:input.offset+input.limit<rows.length?input.offset+input.limit:null,retention:'Durable until explicitly changed; cache expiry and switching chats never resolve or delete a question.',contentTrust:'untrusted_learner_context_not_instructions',interpretation:'saved_question_context_not_mastery'};
    }
    if(action==='write_status'){
      const input=writeStatusSchema.parse(args),jobs=await this.ctx.storage.list<WriteJob>({prefix:'outbox:'});
      const receipts=[];
      if(input.clientEventId)for(const prefix of ['receipt:','review:','question-receipt:','profile-receipt:','session-receipt:']){const r=await this.ctx.storage.get(prefix+await sha256(input.clientEventId));if(r)receipts.push(r);}
      return {pendingCount:jobs.size,items:[...jobs.values()].filter(j=>!input.clientEventId||j.clientEventId===input.clientEventId).slice(0,50).map(jobSummary),receipts,automaticRetry:(await this.ctx.storage.get<MonitorState>('monitor:state'))?.enabled===true,coverage:'At most 50 pending summaries; receipts contain no queued content.'};
    }
    if(action==='retry_writes'){
      const input=retryWritesSchema.parse(args),jobs=await this.ctx.storage.list<WriteJob>({prefix:'outbox:'}),results=[];
      for(const [key,job] of [...jobs].sort((a,b)=>a[1].nextAttemptAt-b[1].nextAttemptAt||a[1].createdAt.localeCompare(b[1].createdAt)).filter(([,j])=>(j.nextAttemptAt<=Date.now()||input.resendUnconfirmed)&&(!input.clientEventId||j.clientEventId===input.clientEventId)).slice(0,input.limit))results.push(await this.deliver(key,job,props,input.resendUnconfirmed));
      return {results,pendingCount:(await this.ctx.storage.list({prefix:'outbox:'})).size};
    }
    if(action==='sync_memory') {
      const page=Number(args.page??1);if(!Number.isSafeInteger(page)||page<1||page>10000)throw Error('Invalid page');
      const staged:Record<string,unknown>={};
      const result=await withMemory(props.accessToken,async call=>{
        const listed=await call('list_documents',{namespace:props.namespace,page,limit:3});
        if(!Array.isArray(listed.documents))throw Error('Invalid document list');
        let changed=0,restored=0,extracted=0;const incomplete:string[]=[];
        for(const doc of listed.documents) {
          if(typeof doc.id!=='string'||!/^[-A-Za-z0-9_]{1,200}$/.test(doc.id))throw Error('Invalid document identity');
          const key='document:v4:'+doc.id;
          if(typeof doc.updatedAt==='string'&&await this.ctx.storage.get(key)===doc.updatedAt)continue;
          const fetched=await call('get_document',{namespace:props.namespace,documentId:doc.id});
          if(fetched.namespace!==props.namespace||fetched.document?.id!==doc.id)throw Error('Document identity mismatch');
          if(fetched.document?.contentTruncated){state.questions=(state.questions??[]).filter(q=>q.documentId!==doc.id);incomplete.push(doc.id);continue;}
          const content=fetched.document?.content;
          if(typeof content!=='string'){state.questions=(state.questions??[]).filter(q=>q.documentId!==doc.id);incomplete.push(doc.id);continue;}
          const candidates=await extractQuestions({...fetched.document,id:doc.id,updatedAt:doc.updatedAt});
          state.questions=[...(state.questions??[]).filter(q=>q.documentId!==doc.id),...candidates];extracted+=candidates.length;
          const event=parseEnvelope(content);
          if(event&&!state.events.some(e=>e.clientEventId===event.clientEventId||event.source&&e.source&&evidenceIdentity(e.source)===evidenceIdentity(event.source))) {
            state.events.push(event);restored++;
            if(event.problemRef&&!allProblems(state.problems).some(p=>p.problemRef===event.problemRef))state.problems=mergeProblems(state.problems??[],[await makeProblem(event.problemRef,undefined,'External practice',event.conceptKeys.join(' '))]);
            const {recordedAt,...raw}=event;const envelope=await eventEnvelope(raw,recordedAt);
            staged['receipt:'+await sha256(event.clientEventId)]={status:'stored',clientEventId:event.clientEventId,fingerprint:envelope.fingerprint,documentId:doc.id};
          }
          try {
            const parsed=JSON.parse(content);
            if(parsed.format==='coding-intuition-learner-profile-v1'){
              if(parsed.learnerId!==props.userId||parsed.namespace!==props.namespace||typeof parsed.clientEventId!=='string'||!/^[-A-Za-z0-9:_]{8,100}$/.test(parsed.clientEventId)||typeof parsed.fingerprint!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(parsed.fingerprint))throw Error('Invalid profile ownership or receipt');
              const profileReceiptKey='profile-receipt:'+await sha256(parsed.clientEventId),priorProfileReceipt=(staged[profileReceiptKey]??await this.ctx.storage.get<any>(profileReceiptKey)) as any;
              if(priorProfileReceipt&&priorProfileReceipt.fingerprint!==parsed.fingerprint)throw Error('Conflicting profile operation identity');
              const restoredProfile=profileRecordSchema.parse(parsed.profile);if(restoredProfile.revision<1)throw Error('Invalid saved profile revision');
              const current=(staged['profile:current']??profile) as LearnerProfile,revisionKey='profile-revision:'+String(restoredProfile.revision).padStart(7,'0'),existing=staged[revisionKey]??await this.ctx.storage.get(revisionKey);
              if(existing&&JSON.stringify(profileRecordSchema.parse(existing))!==JSON.stringify(restoredProfile))throw Error('Conflicting profile revision');
              if(current.revision<restoredProfile.revision){this.applyChangedSources(state,props,current,restoredProfile);staged['profile:current']=restoredProfile;}
              staged[revisionKey]=restoredProfile;staged['profile-sync:'+restoredProfile.revision]={status:'stored',documentId:doc.id};
              staged['profile-receipt:'+await sha256(parsed.clientEventId)]={status:'stored',clientEventId:parsed.clientEventId,fingerprint:parsed.fingerprint,profileRevision:restoredProfile.revision,documentId:doc.id};restored++;
            }
            if(parsed.format==='coding-intuition-question-v1'){
              const record=questionRecordSchema.parse(parsed.record),threadKey='thread:'+record.questionId,old=(staged[threadKey]??await this.ctx.storage.get(threadKey)) as QuestionRecord|undefined;
              const revisionKey='thread-revision:'+record.questionId+':'+String(record.revision).padStart(7,'0'),existing=staged[revisionKey]??await this.ctx.storage.get(revisionKey);
              if(existing&&JSON.stringify(questionRecordSchema.parse(existing))!==JSON.stringify(record))throw Error('Conflicting question revision');
              if(!old||old.revision<record.revision)staged[threadKey]=record;
              staged['thread-revision:'+record.questionId+':'+String(record.revision).padStart(7,'0')]=record;
              staged['thread-sync:'+record.questionId+':'+record.revision]={status:'stored',documentId:doc.id};
              const {revision,createdAt,updatedAt,...fields}=record,original=saveQuestionSchema.parse({...fields,clientEventId:parsed.clientEventId,expectedRevision:revision-1});
              staged['question-receipt:'+await sha256(parsed.clientEventId)]={status:'stored',clientEventId:parsed.clientEventId,fingerprint:await sha256(JSON.stringify(original)),questionId:record.questionId,revision,documentId:doc.id};
            }
            if(parsed.format==='coding-intuition-review-v1' && /^[A-Za-z0-9:_-]{8,100}$/.test(parsed.clientEventId)) {
              const r=parsed.record;
              if(!Number.isInteger(r?.grade)||r.grade<0||r.grade>5||!Number.isFinite(Date.parse(r.reviewedAt)))throw Error('Invalid review document');
              if(parsed.problem){const p=await makeProblem(parsed.problem.problemRef,parsed.problem.title,parsed.problem.topic,parsed.problem.idea);if(p.id!==r.itemId)throw Error('Problem identity mismatch');state.problems=mergeProblems(state.problems??[],[p]);}
              assertItem(r.itemId,state.problems);
              const key='review:'+await sha256(parsed.clientEventId);
              const previous=staged[key] as any ?? await this.ctx.storage.get<any>(key);
              if(previous?.status!=='stored') {
                state.reviews.push({itemId:r.itemId,grade:r.grade,reviewedAt:r.reviewedAt,clientEventId:parsed.clientEventId,...(r.timeZone?{timeZone:timeZoneSchema.parse(r.timeZone)}:{})});
                const history=state.reviews.filter(x=>x.itemId===r.itemId).sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt));
                let schedule={ease:2.5,interval_days:0,repetitions:0,due_date:learningDay()};
                for(const row of history) schedule=review(schedule,row.grade,learningDay(Date.parse(row.reviewedAt),row.timeZone??'Asia/Kolkata'));
                state.progress[r.itemId]={...schedule,grade:history.at(-1)!.grade};
                staged[key]={status:'stored',clientEventId:parsed.clientEventId,itemId:r.itemId,grade:r.grade,reviewedAt:r.reviewedAt,fingerprint:await sha256(JSON.stringify({itemId:r.itemId,grade:r.grade})),nextDue:schedule.due_date,documentId:doc.id,provenance:'learner_recall_grade_not_acceptance'};restored++;
              }
            }
          } catch { /* Free-form and malformed documents never become structured grades. */ }
          // Unknown/free-form documents stay in Supermemory and are retrieved semantically.
          if(typeof doc.updatedAt==='string')staged[key]=doc.updatedAt;changed++;
        }
        const totalPages=listed.pagination?.totalPages;
        const validTotal=Number.isSafeInteger(totalPages)&&totalPages>=0;
        const normalizedPages=validTotal?Math.max(1,totalPages):null;
        let sweep=page===1?{expectedPage:1,pages:normalizedPages,ids:[] as string[],incomplete:[] as string[],valid:validTotal}:await this.ctx.storage.get<any>('inventory:sweep');
        if(!sweep||sweep.expectedPage!==page||sweep.pages!==normalizedPages)sweep={expectedPage:page,pages:normalizedPages,ids:[],incomplete:[],valid:false};
        sweep.ids.push(...listed.documents.map((d:any)=>d.id));sweep.incomplete.push(...incomplete);sweep.expectedPage=page+1;
        const nextPage=normalizedPages&&page<normalizedPages?page+1:null;
        if(sweep.ids.some((id:any)=>typeof id!=='string')||new Set(sweep.ids).size!==sweep.ids.length)sweep.valid=false;
        if(!nextPage&&Number.isSafeInteger(listed.pagination?.totalItems)&&listed.pagination.totalItems!==sweep.ids.length)sweep.valid=false;
        const sweepComplete=!nextPage&&sweep.valid;
        let removedQuestions=0;
        if(sweepComplete){
          const ids=[...new Set(sweep.ids as string[])].sort();
          const signature=await sha256(JSON.stringify(ids));
          const previous=await this.ctx.storage.get<string>('inventory:signature');
          // Require two matching complete inventories; partial/out-of-order reads cannot delete candidates.
          if(previous===signature){const keep=new Set(ids),old=state.questions??[];const removed=old.filter(q=>!keep.has(q.documentId));state.questions=old.filter(q=>keep.has(q.documentId));removedQuestions=removed.length;for(const q of removed)staged['document:v4:'+q.documentId]=null;}
          staged['inventory:signature']=signature;
        }
        staged['inventory:sweep']=sweep;
        return {changed,restored,extracted,removedQuestions,sweepComplete,incompleteDocuments:[...new Set(sweep.incomplete as string[])],page,totalPages:normalizedPages,nextPage};
      });
      await this.save(state,staged);
      for(const [key,job] of await this.ctx.storage.list<WriteJob>({prefix:'outbox:'})){if((await this.ctx.storage.get<any>(job.receiptKey))?.status==='stored')await this.ctx.storage.delete(key);}
      await this.invalidateMemorySearchCache();
      return {...result,coverage:'one_document_page',historyComplete:result.page===1&&result.sweepComplete&&result.incompleteDocuments.length===0};
    }
    if(action==='sync_source') {
      const source=String(args.source),cursor=Number(args.cursor??1);
      if(!sourceNames(sources).includes(source))return {available:false,configured:false,reason:'source_not_configured',checkedAt:new Date().toISOString()};
      const cached=state.sourceStatus[source] as any;
      if(args.force!==true&&cached?.available===true&&Date.now()-Date.parse(cached.checkedAt)<600000&&cached.pageFrom=== (source==='codeforces'?cursor:undefined))return {...cached,cache:'hit'};
      let result;
      try{result=await fetchSource(source,sources,cursor);}
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
  if(!response.ok){const failure=await response.json().catch(()=>null) as any;throw Error(typeof failure?.code==='string'&&/^MEMORY_[A-Z_]+$/.test(failure.code)?failure.code:'Learning operation failed');}
  return response.json() as Promise<any>;
}
