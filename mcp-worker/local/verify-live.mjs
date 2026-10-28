import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {pathToFileURL} from 'node:url';
import {learningTools} from './doctor.mjs';

/** No private document text, credentials, test learning writes, or inferred Go success in reports. */
export async function verifyLiveClient(client,{now=Date.now()}={}){
  const report={status:'PARTIAL',transport:'local_sdk',liveChatGPTGoVerified:false,server:client.getServerVersion()?.name??null,checks:[],document:null,monitor:null};
  const add=(check,status,detail)=>report.checks.push({check,status,...(detail?{detail}:{})});
  const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});if(result.isError)throw Error('Tool unavailable');const data=result.structuredContent??JSON.parse(result.content?.find(c=>c.type==='text')?.text??'null');if(data===null)throw Error('Missing result');return data;};
  try{
    const tools=(await client.listTools()).tools.map(t=>t.name),missing=learningTools.filter(t=>!tools.includes(t));
    if(report.server!=='coding-intuition-learning'||missing.length){add('updated_learning_connection','FAIL',{missing});return {...report,status:'FAIL'};}
    add('updated_learning_connection','PASS',{toolCount:tools.length});
    const listed=await call('list_learning_documents',{page:1});
    if(!Array.isArray(listed.documents))throw Error('Invalid listing');
    add('saved_document_listing','PASS',{listed:listed.documents.length});
    for(const doc of listed.documents.slice(0,3)){
      let offset=0,version,characters=0,pages=0,previousLength=null,finished=false;
      for(;pages<100;pages++){
        const p=await call('read_saved_discussion',{documentId:doc.id,offset,limit:12000,...(version?{version}:{})});
        if(p.versionChanged||!p.available||typeof p.content!=='string'||p.offset!==offset)break;
        if(version&&version!==p.version)break;
        version=p.version;const length=Array.from(p.content).length;
        if(previousLength!==null&&previousLength!==p.availableCharacters)break;
        previousLength=p.availableCharacters;characters+=length;
        if(p.nextOffset===null){finished=p.complete===true&&!p.providerTruncated&&characters===p.availableCharacters&&characters>0;pages++;break;}
        if(p.nextOffset!==offset+length||p.nextOffset<=offset)break;
        offset=p.nextOffset;
      }
      if(finished){report.document={id:doc.id,version,pages,characters,complete:true};break;}
    }
    add('complete_saved_document_read',report.document?'PASS':'PARTIAL',report.document?{pages:report.document.pages,characters:report.document.characters}:'No complete nonempty document was verified among the first three returned documents.');
    const m=await call('get_monitor_status'),sources=await call('get_source_status');
    if(sources.sources?.github){
      let offset=0,inspected=0,candidate;
      do{const page=await call('get_learning_catalog',{offset,limit:50});candidate=page.items?.find(p=>p.codeFileCount>0);offset=page.nextOffset;inspected++;}while(!candidate&&offset!==null&&Number.isInteger(offset)&&inspected<20);
      let code;
      try{if(candidate)code=await call('get_problem_code',{itemId:candidate.itemId});}catch{}
      const readable=code?.found===true&&typeof code.content==='string'&&code.content.trim().length>0&&typeof code.path==='string'&&typeof code.repo==='string'&&/^[a-f0-9]{40}$/i.test(code.commit??'');
      add('github_code_read',readable?'PASS':'PARTIAL',readable?{itemId:candidate.itemId,repo:code.repo,path:code.path,commit:code.commit,characters:Array.from(code.content).length,truncated:code.truncated===true}:'No readable commit-pinned GitHub code verified. Source text is omitted from this report.');
    }
    const expected=['leetcode','codeforces',...(sources.sources?.github?['github']:[]),'memory'];
    const maxAge=(m.intervalMinutes??30)*60000+10*60000;
    const tasks=Object.fromEntries(expected.map(task=>{const row=m.tasks?.[task],source=sources.sources?.[task],sourceAt=Date.parse(source?.checkedAt),sourceReady=task==='memory'||source?.available===true&&Number.isFinite(sourceAt)&&now-sourceAt<=maxAge&&sourceAt<=now+30000,at=Date.parse(row?.checkedAt),fresh=Number.isFinite(at)&&now-at<=maxAge&&at<=now+30000;return [task,{status:!row?'PENDING':row.status==='success'&&fresh&&sourceReady?'PASS':'PARTIAL',lastResult:row?.status??null,checkedAt:row?.checkedAt??null}];}));
    report.monitor={enabled:m.enabled===true,nextRunAt:m.nextRunAt??null,tasks};
    add('monitor_enabled',m.enabled?'PASS':'PARTIAL');
    for(const [task,result]of Object.entries(tasks))add('monitor_'+task,result.status,{lastResult:result.lastResult,checkedAt:result.checkedAt});
    const scheduled=Number.isFinite(m.nextRunAt)&&m.nextRunAt>=now-60000&&m.nextRunAt<=now+maxAge;
    add('monitor_schedule',m.enabled&&scheduled?'PASS':'PARTIAL');
    report.status=report.checks.every(c=>c.status==='PASS')?'PASS':'PARTIAL';
  }catch{add('live_read','FAIL','Connection or upstream read failed; no raw exception or private content is included.');report.status='FAIL';}
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const client=new Client({name:'coding-intuition-live-check',version:'1'});
  try{await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp')));const report=await verifyLiveClient(client);console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;}
  catch{console.error(JSON.stringify({status:'FAIL',liveChatGPTGoVerified:false,nextAction:'Start the authenticated updated MCP server. No raw error or credentials are printed.'}));process.exitCode=1;}
  finally{await client.close().catch(()=>{});}
}
