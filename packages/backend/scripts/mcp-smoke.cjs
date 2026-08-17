// MCP stdio 冒烟测试: 启动 mcp-cli.js, 走一遍 initialize / tools / resources / prompt
const { spawn } = require('node:child_process');
const { join } = require('node:path');

const cli = spawn('node', ['dist/mcp-cli.js'], { cwd: join(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'] });
let buf = '';
let seq = 0;
const pending = new Map();

function send(method, params, id) {
  const msg = { jsonrpc: '2.0', method };
  if (id !== undefined) msg.id = id;
  if (params !== undefined) msg.params = params;
  cli.stdin.write(JSON.stringify(msg) + '\n');
  return id;
}
function request(method, params) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, resolve);
    send(method, params, id);
    setTimeout(() => reject(new Error(`timeout: ${method}`)), 8000);
  });
}

cli.stdout.on('data', (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const r = pending.get(msg.id);
      pending.delete(msg.id);
      r(msg);
    }
  }
});

const ready = new Promise((resolve) => {
  cli.stderr.on('data', (d) => {
    if (d.toString().includes('stdio server ready')) resolve();
  });
  setTimeout(resolve, 1500); // 兜底: 未捕获 ready 也不阻塞
});

(async () => {
  await ready; // 等服务器就绪再发请求
  const init = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-test', version: '0' },
  });
  console.log('initialize ok, server:', JSON.stringify(init.result.serverInfo));
  send('notifications/initialized', {});

  const tools = await request('tools/list', {});
  console.log('tools:', tools.result.tools.map((t) => t.name).join(', '));

  const docs = await request('tools/call', { name: 'get_doc', arguments: { section: 'operations' } });
  const text = docs.result.content[0].text;
  console.log('get_doc(operations) chars:', text.length, '| 含 Move:', text.includes('Move'), '| 含示例:', text.includes('示例'));

  const crop = await request('tools/call', { name: 'get_crop', arguments: { crop: 'strawberry' } });
  console.log('get_crop(strawberry):', crop.result.content[0].text.split('\n').slice(1, 4).join(' '));

  const resources = await request('resources/list', {});
  console.log('resources:', resources.result.resources.length, '个, 首个:', resources.result.resources[0].uri);

  const read = await request('resources/read', { uri: 'robofarm://docs/crops' });
  console.log('read crops 含草莓:', read.result.contents[0].text.includes('草莓'));

  const prompts = await request('prompts/list', {});
  console.log('prompts:', prompts.result.prompts.map((p) => p.name).join(', '));

  const prompt = await request('prompts/get', { name: 'write_player_code' });
  console.log('prompt messages:', prompt.result.messages.length, '| 含 run 指引:', prompt.result.messages[0].content.text.includes('function run'));

  cli.kill();
  console.log('STDIO OK');
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e.message);
  cli.kill();
  process.exit(1);
});
