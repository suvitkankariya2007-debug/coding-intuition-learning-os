import type { Recommendation } from "./evidence-intelligence";

type JsonId = string | number | null;
export type McpRequest = {jsonrpc:"2.0";id?:JsonId;method:string;params?:unknown};
export type ToolData = {recommendations:Recommendation[];due:{itemId:string;title:string;dueDate:string}[]};
const tools = [
 {name:"get_recommendations",description:"Get the authenticated learner's next five evidence-ranked DSA problems. Read-only.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"get_due_reviews",description:"List up to 20 reviews due today for the authenticated learner. Read-only.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
];
const success = (id:JsonId,result:unknown) => ({jsonrpc:"2.0" as const,id,result});
const failure = (id:JsonId,code:number,message:string) => ({jsonrpc:"2.0" as const,id,error:{code,message}});
export async function respondToMcp(input:unknown, loadData:()=>Promise<ToolData>) {
 if (!input || typeof input!=="object" || Array.isArray(input)) return failure(null,-32600,"Invalid Request");
 const m=input as Record<string,unknown>;
 const id:JsonId = (typeof m.id==="string"||typeof m.id==="number"||m.id===null) ? m.id as JsonId:null;
 if (m.jsonrpc!=="2.0" || typeof m.method!=="string") return failure(id,-32600,"Invalid Request");
 if (m.method==="notifications/initialized" && !("id" in m)) return null;
 if (!("id" in m)) return null;
 if (m.method==="initialize") return success(id,{protocolVersion:"2025-06-18",capabilities:{tools:{listChanged:false}},serverInfo:{name:"coding-intuition-mcp",version:"0.1.0"}});
 if (m.method==="ping") return success(id,{});
 if (m.method==="tools/list") return success(id,{tools});
 if (m.method!=="tools/call") return failure(id,-32601,"Method not found");
 const p=m.params;
 if (!p||typeof p!=="object"||Array.isArray(p)) return failure(id,-32602,"Invalid parameters");
 const args=p as Record<string,unknown>;
 if (typeof args.name!=="string" || !tools.some(t=>t.name===args.name)) return failure(id,-32602,"Unknown tool");
 if (args.arguments!==undefined && (typeof args.arguments!=="object" || args.arguments===null || Array.isArray(args.arguments) || Object.keys(args.arguments as object).length)) return failure(id,-32602,"Tool requires empty arguments");
 try {
   const data=await loadData();
   const output=args.name==="get_due_reviews" ? data.due.slice(0,20) : data.recommendations.slice(0,5);
   return success(id,{content:[{type:"text",text:JSON.stringify(output)}],isError:false});
 } catch {
   return failure(id,-32603,"Learning data temporarily unavailable");
 }
}
