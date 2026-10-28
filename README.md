# Coding Intuition Learning OS

A personal DSA learning project with a web application and a separate MCP server. The MCP connects ChatGPT tools to structured problem history and a user's own Supermemory account, with explicit approval for learning writes.

## Try the local MCP

The local MCP source, setup guide, scope, and verification limits are in [mcp-worker/README.md](mcp-worker/README.md). Start there before connecting an AI client. The repository is currently private; people outside the owner/collaborators cannot clone it until the owner makes it public.

The local automated suite uses simulated upstream services. It does not by itself prove live Supermemory sign-in or an authenticated ChatGPT tool call. Do not describe the hosted OAuth integration as live until a real read-only tool call succeeds.

## Web application

The repository also contains the Coding Intuition Learning OS web app, originally developed with [Lovable](https://lovable.dev). The app and the MCP worker have separate setup and verification instructions.

**Web app:** https://coding-intuition-learning-os.lovable.app
