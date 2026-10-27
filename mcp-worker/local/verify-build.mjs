import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {pathToFileURL} from 'node:url';
export function validateRecommendationContract(data){
 if(data?.engineRevision!=='audit-relevance-v3'||data.responseContractVersion!=='recommendations-v2')return false;
 const c=data.contextRelevance;
 const matchesValid=Array.isArray(c?.appliedToReturnedItems)&&c.appliedToReturnedItems.every(row=>typeof row.itemId==='string'&&typeof row.problemRef==='string'&&row.points===12&&Array.isArray(row.matches)&&row.matches.length>0&&row.matches.every(m=>typeof m.evidenceId==='string'&&['same_problem','curated_transfer','specific_concept'].includes(m.matchType)&&Array.isArray(m.matchedConcepts)));
 return !!c&&typeof c.supplied==='boolean'&&Number.isInteger(c.questionCount)&&matchesValid&&Array.isArray(data.recommendations)&&data.recommendations.every(r=>Number.isFinite(r.score)&&Array.isArray(r.components)&&r.components.every(c=>Number.isFinite(c.points)&&Array.isArray(c.evidenceIds))&&r.components.reduce((n,c)=>n+c.points,0)===r.score);
}
export async function inspectBuildClient(client){
 const report={status:'FAIL',learningWritesPerformed:false,liveChatGPTCallVerified:false};
 if(client.getServerVersion()?.name!=='coding-intuition-learning')return {...report,code:'WRONG_MCP_SERVER'};
 const listing=await client.listTools();const tool=listing?.tools?.find(t=>t.name==='get_recommendations');
 if(!tool?.inputSchema?.properties?.context)return {...report,code:'STALE_RECOMMENDATION_SCHEMA'};
 const result=await client.callTool({name:'get_recommendations',arguments:{}},undefined,{timeout:30000});
 if(result.isError)return {...report,code:'RECOMMENDATION_CALL_FAILED'};
 const data=result.structuredContent??JSON.parse(result.content.find(c=>c.type==='text')?.text??'null');
 if(!validateRecommendationContract(data))return {...report,code:'STALE_OR_INVALID_RECOMMENDATION_CONTRACT',nextAction:'Restart Terminal 1 from the updated repository, verify the tunnel target is http://127.0.0.1:8787/mcp, then refresh the existing Go connection.'};
 return {...report,status:'PASS',engineRevision:data.engineRevision,responseContractVersion:data.responseContractVersion,contextRelevance:data.contextRelevance,note:'Local contract verified. This does not prove that Go is calling this same endpoint or that pending writes are stored.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const client=new Client({name:'coding-intuition-build-check',version:'1'});
 try{await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp'),{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(30000)})}));const report=await inspectBuildClient(client);console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;}
 catch{console.error(JSON.stringify({status:'FAIL',code:'LOCAL_BUILD_CHECK_UNAVAILABLE',nextAction:'Check Terminal 1 and local sign-in. No write was attempted.'}));process.exitCode=1;}
 finally{await client.close().catch(()=>{});}
}
