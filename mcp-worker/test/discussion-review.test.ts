import {describe,it,expect} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {parseDiscussionReview} from '../src/discussion-review';
// @ts-ignore Native fixture runtime; no user data or credentials.
import {fixtureRuntime} from '../scripts/demo-fixture.mjs';

const current={observations:[{conceptKey:'bst-ordering',observation:'The supplied answer describes tree shape without checking ancestor ordering.',source:{kind:'current_chat',excerpt:'yes it has at most two children'}}]};
describe('evidence-linked discussion review',()=>{
 it('returns concepts, pitfalls, fallbacks, review reasons and actual platform problems without saving proposed doubts',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{
   const before=f.state.documents.length,plan=await f.rpc('review_learning_discussion',current);
   expect(plan).toMatchObject({status:'PLAN_READY',persistsObservations:false});
   expect(plan.discussionEvidence[0].source.verification).toBe('client_supplied_excerpt_not_independently_verified');
   expect(plan.keyConcepts[0]).toMatchObject({conceptKey:'bst-ordering',pitfallIsPersonalDiagnosis:false,basis:'curated_coaching_rule_v1'});
   for(const key of ['remember','pitfall','fallback','whyReview','recallQuestion'])expect(plan.keyConcepts[0][key].length).toBeGreaterThan(20);
   expect(plan.practice.some((p:any)=>p.problemRef==='lc:98')).toBe(true);expect(new Set(plan.practice.map((p:any)=>p.problemRef)).size).toBe(plan.practice.length);
   expect(plan.practice.every((p:any)=>p.platform==='leetcode'&&p.linkType==='platform_search'&&p.url.startsWith('https://leetcode.com/problemset/?search='))).toBe(true);
   expect(f.state.documents).toHaveLength(before);expect((await f.rpc('get_learning_signals')).eventCount).toBe(0);
   const varied=await f.rpc('review_learning_discussion',{observations:[{...current.observations[0],conceptKey:'hash-lookup'},current.observations[0]],limit:2});expect(varied.practice.some((p:any)=>p.matchedConcepts.includes('hash-lookup'))).toBe(true);expect(varied.practice.some((p:any)=>p.matchedConcepts.includes('bst-ordering'))).toBe(true);
  }finally{await f.mf.dispose();}
 });
 it('verifies saved evidence by exact document version and Unicode offset and rejects stale or invented excerpts',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{
   const page=await f.rpc('read_saved_discussion',{documentId:'discussion-1'}),excerpt='Why does LeetCode 98 need ancestor bounds?';
   const start=Array.from(page.content.slice(0,page.content.indexOf(excerpt))).length;
   const args={observations:[{conceptKey:'bst-ordering',observation:'The saved question asks why inherited ordering bounds are necessary.',source:{kind:'saved_discussion',documentId:'discussion-1',version:page.version,start,excerpt}}]};
   const plan=await f.rpc('review_learning_discussion',args);expect(plan.discussionEvidence[0].source).toMatchObject({verification:'saved_excerpt_verified',start,sourceComplete:true});
   await expect(f.rpc('review_learning_discussion',{observations:[{...args.observations[0],source:{...args.observations[0].source,excerpt:'Invented discussion evidence'}}]})).rejects.toThrow();
   f.state.documents[0].content+='\nChanged after read';await expect(f.rpc('review_learning_discussion',args)).rejects.toThrow();
  }finally{await f.mf.dispose();}
 });
 it('labels partial source content and missing platform matches without inventing CP problems',async()=>{
  const f=fixtureRuntime();await f.mf.ready;
  try{
   expect(await f.rpc('review_learning_discussion',{...current,platform:'codeforces'})).toMatchObject({status:'PARTIAL',practice:[]});
   const page=await f.rpc('read_saved_discussion',{documentId:'truncated-1'});
   const plan=await f.rpc('review_learning_discussion',{observations:[{conceptKey:'base-case',observation:'This fixture question is only a proposed interpretation of the visible prefix.',source:{kind:'saved_discussion',documentId:'truncated-1',version:page.version,start:0,excerpt:page.content}}]});
   expect(plan.status).toBe('PARTIAL');expect(plan.discussionEvidence[0].source.sourceComplete).toBe(false);
   await f.rpc('sync_learning_source',{source:'codeforces',force:true});
   const cf=await f.rpc('review_learning_discussion',{observations:[{...current.observations[0],conceptKey:'binary-search'}],platform:'codeforces'});
   expect(cf.practice.length).toBeGreaterThan(0);expect(cf.practice.every((p:any)=>p.platform==='codeforces'&&/^cf:9999[AB]$/.test(p.problemRef))).toBe(true);
  }finally{await f.mf.dispose();}
 });
 it('advertises read-only scope and rejects unsupported concepts, oversized extracts and fake source shapes',async()=>{
  expect(()=>parseDiscussionReview({observations:[]})).toThrow();
  expect(()=>parseDiscussionReview({observations:[{...current.observations[0],conceptKey:'made-up'}]})).toThrow();
  expect(()=>parseDiscussionReview({observations:[{...current.observations[0],source:{kind:'current_chat',excerpt:'x'.repeat(701)}}]})).toThrow();
  expect(()=>parseDiscussionReview({observations:[{...current.observations[0],source:{kind:'saved_discussion',excerpt:'text',documentId:123,version:'abc',start:0}}]})).toThrow();
  const f=fixtureRuntime();await f.mf.ready;const client=new Client({name:'discussion-review-fixture',version:'1'});
  try{
   await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp'),{fetch:(url:any,init:any)=>f.mf.dispatchFetch(String(url),init)}));
   const tool=(await client.listTools()).tools.find(t=>t.name==='review_learning_discussion')!;
   expect(tool.annotations).toMatchObject({readOnlyHint:true,destructiveHint:false});
   const result=await client.callTool({name:'review_learning_discussion',arguments:current});expect(result.isError).toBe(false);expect(result.structuredContent).toEqual(JSON.parse((result.content[0] as any).text));
  }finally{await client.close().catch(()=>{});await f.mf.dispose();}
 });
});
