// MCP 服务器 stdio 入口。
// 用法: node dist/mcp-cli.js   (在 MCP 客户端配置为 stdio 服务器)
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp/server';

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[robofarm-mcp] stdio server ready');
}

main().catch((err) => {
  console.error('[robofarm-mcp] 启动失败:', err);
  process.exit(1);
});
