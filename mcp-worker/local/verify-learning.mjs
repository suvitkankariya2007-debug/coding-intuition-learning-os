import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {pathToFileURL} from 'node:url';

/** Read-only verification of receipts from a genuine, already approved attempt. */
export async function verifyLearningClient(client,{itemId,eventId,reviewId}={}){
  const report={status:'PARTIAL',transport:'local_sdk',liveChatGPTGoVerified:false,writesPerformed:false,checks:[]};
  const add=(check,ok)=>report.checks.push({check,status:ok?'PASS':'PARTIAL'});
  try{
    if(!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(itemId??'')||![eventId,reviewId].every(id=>/^[A-Za-z0-9:_-]{8,100}$/.test(id??'')))throw Error('Invalid receipt references');
    const r=await client.callTool({name:'get_problem_history',arguments:{itemId}});
    if(r.isError)throw Error('Read failed');
    const history=r.structuredContent??JSON.parse(r.content.find(c=>c.type==='text')?.text??'null');
    const event=history?.learningEvents?.find(e=>e.clientEventId===eventId);
    const review=history?.reviews?.find(r=>r.clientEventId===reviewId);
    add('problem_history',history?.found===true);
    add('approved_event_readback',!!event);
    add('confirmed_review_readback',!!review);
    add('review_schedule_available',!!review&&/^\d{4}-\d{2}-\d{2}$/.test(history.problem?.dueDate??''));
    report.receipts={itemId,eventId,reviewId,eventRecordedAt:event?.recordedAt??null,reviewedAt:review?.reviewedAt??null,grade:review?.grade??null,currentNextDue:history?.problem?.dueDate??null};
    report.status=report.checks.every(c=>c.status==='PASS')?'PASS':'PARTIAL';
    report.note='Confirms stored records and current schedule. Does not prove the quality of the attempt, learner consent, or a separate Go call. History is bounded; an older receipt may require source retrieval.';
  }catch{report.status='FAIL';report.checks.push({check:'receipt_readback',status:'FAIL'});}
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i+=2){const key={'--item-id':'itemId','--event-id':'eventId','--review-id':'reviewId'}[args[i]];if(!key||!args[i+1]){console.error('Use: npm run verify:learning -- --item-id UUID --event-id EVENT_ID --review-id REVIEW_ID');process.exit(1);}options[key]=args[i+1];}
  const client=new Client({name:'coding-intuition-learning-readback',version:'1'});
  try{await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp')));const report=await verifyLearningClient(client,options);console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;}
  catch{console.error('Receipt verification failed. Start the authenticated MCP server; no write was attempted.');process.exitCode=1;}
  finally{await client.close().catch(()=>{});}
}
