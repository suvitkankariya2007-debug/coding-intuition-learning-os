import {describe,it,expect} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
// @ts-ignore Native fixtures only; no user credentials or real records.
import {fixtureRuntime,originalDiscussion} from '../scripts/demo-fixture.mjs';
// @ts-ignore Native read-only receipt checker.
import {verifyLearningClient} from '../local/verify-learning.mjs';

describe('complete isolated learning cycle',()=>{
 it('reads source/context, writes an observed difficulty and recall grade, then verifies restart and Supermemory recovery',async()=>{
   const directory=await mkdtemp(join(tmpdir(),'learning-cycle-')),recovery=await mkdtemp(join(tmpdir(),'learning-cycle-recovery-'));
   let f=fixtureRuntime(directory);await f.mf.ready;
   const clients:Client[]=[];
   const connect=async()=>{const client=new Client({name:'learning-cycle-fixture',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp'),{fetch:(url:any,init:any)=>f.mf.dispatchFetch(String(url),init)}));clients.push(client);return client;};
   try{
     f.state.documents.splice(1,1);
     let text='',offset:any=0,version;
     do{const page=await f.rpc('read_saved_discussion',{documentId:'discussion-1',offset,limit:5000,...(version?{version}:{})});version=page.version;text+=page.content;offset=page.nextOffset;}while(offset!==null);
     expect(text).toBe(originalDiscussion);
     await f.rpc('refresh_learning_memory');expect((await f.rpc('get_saved_questions')).total).toBe(2);
     await f.rpc('sync_learning_source',{source:'github',force:true});
     const problem=(await f.rpc('get_learning_catalog',{offset:188})).items.find((p:any)=>p.codeFileCount>0);
     const client=await connect(),code=await client.callTool({name:'get_problem_code',arguments:{itemId:problem.itemId}});
     expect(code.structuredContent).toMatchObject({found:true,commit:'a'.repeat(40),acceptanceVerified:false});
     expect(JSON.parse((code.content[0] as any).text)).toEqual(code.structuredContent);
     const refs={itemId:problem.itemId,eventId:'cycle-mistake-0001',reviewId:'cycle-review-0001'};
     expect((await verifyLearningClient(client,refs)).status).toBe('PARTIAL');
     expect(await f.rpc('diagnose_weaknesses')).toEqual([]);
     const baseline=(await f.rpc('get_recommendations')).recommendations.find((r:any)=>r.itemId===problem.itemId);
     const docsBefore=f.state.documents.length;
     const event={clientEventId:refs.eventId,itemId:problem.itemId,kind:'mistake',summary:'Simulated learner omitted the boundary invariant in this isolated test.',mistakeClass:'boundary',conceptKeys:['binary-search'],hintStage:'gentle',origin:'chatgpt'};
     const eventReceipt=await f.rpc('record_reasoning_event',event);
     expect(eventReceipt.status).toBe('stored');
     const adapted=(await f.rpc('get_recommendations')).recommendations.find((r:any)=>r.itemId===problem.itemId);
     expect(adapted.score).toBeGreaterThan(baseline.score);expect(adapted.reason.join(' ')).toContain('binary-search');
     expect((await f.rpc('diagnose_weaknesses'))[0]).toMatchObject({pattern:'boundary',occurrences:1,lowRecall:0});
     const reviewArgs={itemId:problem.itemId,grade:2,clientEventId:refs.reviewId};
     const receipt=await f.rpc('record_review',reviewArgs);
     expect(receipt).toMatchObject({status:'stored',clientEventId:refs.reviewId,itemId:problem.itemId,grade:2,provenance:'learner_recall_grade_not_acceptance'});
     expect((await f.rpc('record_review',reviewArgs))).toMatchObject({...receipt,duplicate:true});
     await expect(f.rpc('record_review',{...reviewArgs,grade:5})).rejects.toThrow();
     expect(f.state.documents).toHaveLength(docsBefore+2);
     const history=await f.rpc('get_problem_history',{itemId:problem.itemId});
     expect(history.problem.status).toBe('attempted');expect(history.problem.dueDate).toBe(receipt.nextDue);
     expect(history.reviews[0].clientEventId).toBe(refs.reviewId);
     const reviewed=(await f.rpc('get_recommendations')).recommendations.find((r:any)=>r.itemId===problem.itemId);
     expect(reviewed.score).toBeGreaterThan(adapted.score);expect(reviewed.reason).toContain('Previous recall was difficult');
     const privateDocuments=f.state.documents;
     await client.close();await f.mf.dispose();f=fixtureRuntime(directory);f.state.documents=privateDocuments;await f.mf.ready;
     const restarted=await connect(),readback=await verifyLearningClient(restarted,refs);
     expect(readback.status).toBe('PASS');expect(readback.receipts.grade).toBe(2);expect(readback.writesPerformed).toBe(false);expect(readback.liveChatGPTGoVerified).toBe(false);
     expect(JSON.stringify(readback)).not.toContain(event.summary);
     await restarted.close();await f.mf.dispose();f=fixtureRuntime(recovery);f.state.documents=privateDocuments;await f.mf.ready;
     let page:any=1;do{page=(await f.rpc('refresh_learning_memory',{page})).nextPage;}while(page!==null);
     const restored=await connect();expect((await verifyLearningClient(restored,refs)).status).toBe('PASS');
     expect((await f.rpc('record_review',reviewArgs))).toMatchObject({duplicate:true,clientEventId:refs.reviewId});
     expect((await f.rpc('get_problem_history',{itemId:problem.itemId})).reviews).toHaveLength(1);
   }finally{for(const c of clients)await c.close().catch(()=>{});await f.mf.dispose();await rm(directory,{recursive:true,force:true});await rm(recovery,{recursive:true,force:true});}
 },30000);
});
