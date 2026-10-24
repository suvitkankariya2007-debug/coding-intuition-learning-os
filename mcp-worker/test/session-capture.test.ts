import {it,expect} from 'vitest';
// @ts-ignore Isolated provider fixture.
import {fixtureRuntime} from '../scripts/demo-fixture.mjs';
const checkpoint={sessionId:'session-capture-001',checkpointId:'checkpoint-001',summary:'We discussed BST ancestor bounds. The learner still checks only immediate children.',observations:[{turnId:'learner-turn-001',excerpt:'I compare only each immediate child.',event:{problemRef:'lc:98',kind:'mistake',summary:'I checked immediate children rather than inherited ancestor bounds.',conceptKeys:['bst-ordering'],hintStage:'none',origin:'chatgpt'}}]};
it('requires opt-in, captures summary and learner evidence once, and supports revocation',async()=>{
 const f=fixtureRuntime();await f.mf.ready;
 try{
 expect(await f.rpc('get_session_capture_policy')).toMatchObject({enabled:false});
 expect(await f.rpc('capture_learning_session',checkpoint)).toMatchObject({status:'approval_required',writePerformed:false});
 expect(f.state.documents).toHaveLength(2);
 await f.rpc('configure_session_capture',{enabled:true});
 const receipt=await f.rpc('capture_learning_session',checkpoint);expect(receipt).toMatchObject({status:'stored',questionThreadsUnchanged:true});
 expect((await f.rpc('get_learning_signals')).eventCount).toBe(1);
 const size=f.state.documents.length;
 await f.rpc('capture_learning_session',checkpoint);expect(f.state.documents).toHaveLength(size);
 await f.rpc('capture_learning_session',{...checkpoint,checkpointId:'checkpoint-002'});expect((await f.rpc('get_learning_signals')).eventCount).toBe(1);
 await expect(f.rpc('capture_learning_session',{...checkpoint,summary:'This is different checkpoint content with the same identity.'})).rejects.toThrow();
 await f.rpc('configure_session_capture',{enabled:false});expect(await f.rpc('capture_learning_session',{...checkpoint,checkpointId:'checkpoint-003'})).toMatchObject({status:'approval_required'});
 }finally{await f.mf.dispose();}
});
it('keeps failed uploads durable, allows an approved one-off and never derives events from explanations alone',async()=>{
 const f=fixtureRuntime();await f.mf.ready;
 try{
 f.state.offline=true;
 expect(await f.rpc('capture_learning_session',{...checkpoint,approved:true})).toMatchObject({status:'pending'});
 expect((await f.rpc('get_learning_write_status')).pendingCount).toBe(2);
 f.state.offline=false;
 const before=(await f.rpc('get_learning_signals')).eventCount;
 expect(await f.rpc('capture_learning_session',{...checkpoint,approved:true,checkpointId:'checkpoint-summary-only',observations:[]})).toMatchObject({status:'stored'});
 expect((await f.rpc('get_learning_signals')).eventCount).toBe(before);
 await expect(f.rpc('capture_learning_session',{...checkpoint,approved:true,summary:'api_key=secretprivatevalue1234567'})).rejects.toThrow();
 }finally{await f.mf.dispose();}
});
