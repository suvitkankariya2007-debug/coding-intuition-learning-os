import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UPSTREAM } from './config';

/** A fresh MCP connection per operation; never forward the downstream ChatGPT token. */
export async function withMemory<T>(accessToken: string, work: (call: (name: string, args?: Record<string, unknown>) => Promise<any>) => Promise<T>): Promise<T> {
  const client = new Client({ name: 'coding-intuition-learning', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(UPSTREAM.mcp), {
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
    fetch: async (url, init) => {
      const response=await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(12000) });
      if(!response.ok&&response.status>=400)throw Error(response.status===401?'MEMORY_AUTH_REQUIRED':response.status===403?'MEMORY_ACCESS_DENIED':response.status===429?'MEMORY_RATE_LIMITED':'MEMORY_PROVIDER_UNAVAILABLE');
      if(response.status>=300&&response.status<400)throw Error('Unexpected upstream redirect');
      return response;
    },
  });
  let conversationId: string | undefined;
  try {
    await client.connect(transport);
    return await work(async (name, args = {}) => {
      const result = await client.callTool({ name, arguments: { ...args, ...(conversationId ? { conversation_id: conversationId } : {}) } });
      for (const block of (result.content ?? []) as any[]) {
        if (block.type !== 'text') continue;
        try { const parsed = JSON.parse(block.text); if (typeof parsed.conversation_id === 'string') conversationId = parsed.conversation_id; } catch { /* prose */ }
      }
      if (result.isError) throw Error('Supermemory operation failed');
      if (result.structuredContent) return result.structuredContent;
      for (const block of (result.content ?? []) as any[]) {
        if (block.type !== 'text') continue;
        try { const parsed = JSON.parse(block.text); if (!parsed.conversation_id) return parsed; } catch { /* prose */ }
      }
      throw Error('Supermemory returned an unsupported response shape');
    });
  } finally { await client.close().catch(() => {}); }
}
