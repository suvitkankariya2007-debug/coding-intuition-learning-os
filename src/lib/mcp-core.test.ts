import {describe,expect,it,vi} from "vitest";
import {respondToMcp} from "./mcp-core";
const data=()=>Promise.resolve({recommendations:[{itemId:"a",title:"BST",score:30,reason:["Review due now"],evidence:{accepted:0,rejected:0,codeFiles:0,latestAt:null}}],due:[{itemId:"a",title:"BST",dueDate:"2026-10-17"}]});
describe("MCP protocol security contract",()=>{
 it("negotiates and exposes only read-only tools",async()=>{
  const init=await respondToMcp({jsonrpc:"2.0",id:1,method:"initialize"},data);
  expect(init).toHaveProperty("result.protocolVersion","2025-06-18");
  const result=await respondToMcp({jsonrpc:"2.0",id:2,method:"tools/list"},data);
  expect(JSON.stringify(result)).not.toMatch(/write|delete|execute_sql|sync_/);
 });
 it("never loads data for unknown tool names",async()=>{
  const loader=vi.fn(data);
  const r=await respondToMcp({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"delete_account"}},loader);
  expect(r).toHaveProperty("error.code",-32602);
  expect(loader).not.toHaveBeenCalled();
 });
 it("only returns bounded authenticated loader results",async()=>{
  const r=await respondToMcp({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"get_due_reviews",arguments:{}}},data);
  expect(JSON.stringify(r)).toContain("BST");
  expect(JSON.stringify(r)).not.toContain("password");
 });
 it("notification returns no response",async()=>{
  expect(await respondToMcp({jsonrpc:"2.0",method:"notifications/initialized"},data)).toBeNull();
 });
});
