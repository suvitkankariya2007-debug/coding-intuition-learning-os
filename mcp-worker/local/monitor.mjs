import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const command=process.argv[2]??'status';
if(!['start','stop','status'].includes(command))throw Error('Use start, stop or status');
const client=new Client({name:'coding-intuition-monitor-control',version:'1'});
try{
  await client.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp')));
  const result=await client.callTool({name:command==='status'?'get_monitor_status':'configure_background_monitor',arguments:command==='status'?{}:{enabled:command==='start',intervalMinutes:30}});
  if(result.isError)throw Error('Monitor control failed. Check the server login and --allow-writes permission.');
  for(const item of result.content??[])if(item.type==='text')console.log(item.text);
}catch{console.error('Monitor control failed. Start the authenticated local MCP with --allow-writes and check its diagnostics.');process.exitCode=1;}
finally{await client.close().catch(()=>{});}
