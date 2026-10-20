import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { pathToFileURL } from 'node:url';

export const learningTools = [
  'get_recommendations', 'get_due_reviews', 'get_roadmap', 'get_progress_report',
  'get_problem_history', 'diagnose_weaknesses', 'get_transfer_problem',
  'get_progressive_hint', 'get_memory_patterns', 'get_concept_connections',
  'get_learning_signals', 'record_reasoning_event', 'get_source_status',
  'sync_learning_source', 'refresh_learning_memory', 'record_review',
  'get_learning_catalog', 'get_problem_code',
];

// Shared by local and authenticated hosted-runtime tests. No learning writes,
// source synchronization, credentials, or retrieved memory text in the report.
export async function inspectLearningClient(client) {
  const report = { status: 'FAIL', server: client.getServerVersion()?.name ?? null,
    tools: [], checks: [], liveChatGPTCallVerified: false, learningWritesPerformed: false };
  const listed = await client.listTools();
  report.tools = listed.tools.map(t => t.name);
  const missing = learningTools.filter(name => !report.tools.includes(name));
  if (report.server !== 'coding-intuition-learning' || missing.length) {
    report.checks.push({ check: 'learning_server_identity', status: 'FAIL', missingTools: missing,
      nextAction: 'Wrong server or stale tool discovery. Stop the mock tunnel client; point the existing tunnel at http://127.0.0.1:8787/mcp and refresh the existing ChatGPT connection.' });
    return report;
  }
  report.checks.push({ check: 'learning_server_identity', status: 'PASS' });
  async function call(name, args = {}, validate = () => true) {
    try {
      const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 20000 });
      if (response.isError) throw Error('Tool failed');
      const data = response.structuredContent ?? JSON.parse(response.content.find(c => c.type === 'text')?.text ?? 'null');
      if (!validate(data)) throw Error('Unexpected or unavailable data');
      report.checks.push({ check: name, status: 'PASS' });
      return data;
    } catch {
      report.checks.push({ check: name, status: 'FAIL', nextAction: 'Check the local server and Supermemory authorization. No successful learning write is claimed.' });
      return null;
    }
  }
  await call('get_learning_catalog', { limit: 1 }, d => d?.canonicalCount === 188 && d.total >= 188);
  const roadmap = await call('get_roadmap', { limit: 1 }, d => d?.total === 188 && d.items?.length === 1);
  await call('get_progress_report', {}, d => d?.curriculumCount === 188);
  await call('get_due_reviews', {}, Array.isArray);
  await call('get_learning_signals', {}, d => Number.isInteger(d?.eventCount));
  await call('get_source_status');
  await call('diagnose_weaknesses');
  if (roadmap) {
    const itemId = roadmap.items[0].itemId;
    await call('get_problem_code', { itemId }, d => typeof d?.found === 'boolean');
    await call('get_problem_history', { itemId }, d => d?.found === true);
    await call('get_progressive_hint', { itemId, level: 1 }, d => d?.found === true);
    await call('get_concept_connections', { itemId }, d => d?.found === true);
    await call('get_transfer_problem', { itemId });
  }
  await call('get_memory_patterns', { query: 'My DSA learning preferences and progressive hint preferences' }, d => Array.isArray(d?.items));
  await call('get_recommendations', {}, d => Array.isArray(d?.recommendations) && d.memoryContext?.status !== 'unavailable');
  report.status = report.checks.every(c => c.status === 'PASS') ? 'PASS' : 'PARTIAL';
  return report;
}

export async function diagnoseLocal({ fetcher = fetch } = {}) {
  const base = 'http://127.0.0.1:8787';
  const localFetch = (url, init = {}) => fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) });
  const client = new Client({ name: 'coding-intuition-local-doctor', version: '0.1.0' });
  let stage = 'local_listener';
  try {
    const response = await localFetch(base + '/health');
    if (!response.ok) throw Error('Health unavailable');
    const health = await response.json();
    if (health.service !== 'coding-intuition-local-mcp') return { status: 'FAIL', stage,
      nextAction: 'Port 8787 is serving another application, not the learning MCP.' };
    stage = 'mcp_initialize';
    await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp'), { fetch: localFetch }));
    stage = 'learning_tool_calls';
    return { ...await inspectLearningClient(client), writesEnabled: health.writesEnabled,
      note: 'Local read calls only. This does not verify the OpenAI tunnel, ChatGPT Go, write permission, or deployment.' };
  } catch {
    return { status: 'FAIL', stage, nextAction: stage === 'local_listener'
      ? 'Start npm run tunnel:serve -- YOUR_SUPERMEMORY_USER_ID in another terminal. The owner ID is not an API key.'
      : 'Check Supermemory login and server availability. If ChatGPT still lists Mock_MCP_E2E, refresh its tool discovery after reconnecting the tunnel.' };
  } finally { await client.close().catch(() => {}); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await diagnoseLocal();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}
