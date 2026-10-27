import {it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// @ts-ignore native local helpers
import {assertCurrentBuild,writeBuildState} from '../local/build-state.mjs';
// @ts-ignore native local helper
import {validateRecommendationContract,inspectBuildClient} from '../local/verify-build.mjs';
// @ts-ignore isolated upstream
import {fixtureRuntime} from '../scripts/demo-fixture.mjs';
it('rejects missing, stale-source and modified bundles and accepts a matching fingerprint',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mcp-build-contract-')),root=join(dir,'worker');
 try{
 for(const p of ['worker/src','src/lib','worker/dist-tunnel'])await mkdir(join(dir,p),{recursive:true});
 for(const [p,text] of [['src/entry.ts','source'],['../src/lib/shared.ts','shared'],['package.json','{}'],['package-lock.json','{}'],['wrangler.tunnel.jsonc','{}'],['dist-tunnel/tunnel.js','bundle']])await writeFile(join(root,p),text);
 await expect(assertCurrentBuild(root)).rejects.toThrow('LOCAL_BUILD_STALE');
 await writeBuildState(root);await expect(assertCurrentBuild(root)).resolves.toHaveProperty('sourceFingerprint');
 await writeFile(join(root,'src/entry.ts'),'changed');await expect(assertCurrentBuild(root)).rejects.toThrow('LOCAL_BUILD_STALE');
 await writeBuildState(root);await writeFile(join(root,'dist-tunnel/tunnel.js'),'tampered');await expect(assertCurrentBuild(root)).rejects.toThrow('LOCAL_BUILD_STALE');
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('validates actual built MCP fields for baseline, summary and visible questions without learning writes',async()=>{
 const f=fixtureRuntime();await f.mf.ready;
 try{
 const context={sessionId:'build-session-001',checkpointId:'build-checkpoint-001',coverage:'available_current_chat',problemRef:'lc:98',turns:[{turnId:'build-learner-001',role:'learner',text:'Why do ancestor bounds matter for BST validation?'}]};
 const baseline=await f.rpc('get_recommendations');expect(validateRecommendationContract(baseline)).toBe(true);expect(baseline.contextRelevance).toMatchObject({supplied:false,questionCount:0,appliedToReturnedItems:[]});
 expect(validateRecommendationContract({...baseline,engineRevision:undefined})).toBe(false);
 expect(validateRecommendationContract({...baseline,contextRelevance:undefined})).toBe(false);
 const summary=await f.rpc('get_recommendations',{context:{...context,coverage:'summary_only'}});expect(summary.contextRelevance).toMatchObject({supplied:true,questionCount:0,appliedToReturnedItems:[]});
 const relevant=await f.rpc('get_recommendations',{context});expect(validateRecommendationContract(relevant)).toBe(true);expect(relevant.contextRelevance.questionCount).toBe(1);expect(relevant.contextRelevance.appliedToReturnedItems.length).toBeGreaterThan(0);
 expect((await f.rpc('get_learning_signals')).eventCount).toBe(0);
 const health=await (await f.mf.dispatchFetch('http://127.0.0.1:8787/health')).json();expect(health).toMatchObject({engineRevision:baseline.engineRevision,responseContractVersion:baseline.responseContractVersion});
 const listing=await (await f.mf.dispatchFetch('http://127.0.0.1:8787/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})})).json();
 const client={getServerVersion:()=>({name:'coding-intuition-learning'}),listTools:async()=>listing.result,callTool:async()=>({structuredContent:baseline})};
 expect((await inspectBuildClient(client)).status).toBe('PASS');
 expect((await inspectBuildClient({...client,callTool:async()=>({structuredContent:{recommendations:[]}})})).code).toBe('STALE_OR_INVALID_RECOMMENDATION_CONTRACT');
 }finally{await f.mf.dispose();}
});
