/* 自检 · 没有外网时的降级
   配置齐全但出不去，服务端必须**如实说**：oauth:false / llm:false / egress:false，
   登录给一句人话而不是 502。这条正是在魔搭免费规格上跑着的状态。
   用法：node tools/check-oauth-offline.js */
process.env.PORT = '7803';
process.env.TOURIS_DATA_DIR = require('path').join(require('os').tmpdir(), 'touris-noegress-' + Date.now());
process.env.OPENID_PROVIDER_URL = 'http://127.0.0.1:1';   // 不可路由，必然连不通
process.env.OAUTH_CLIENT_ID = 'cid';
process.env.OAUTH_CLIENT_SECRET = 'csecret';
process.env.LLM_BASE_URL = 'http://127.0.0.1:1/v1';
process.env.LLM_API_KEY = 'sk-whatever';
const app = require('../server.js').server;
const BASE = 'http://127.0.0.1:7803';

let pass = 0, fail = 0;
const ok = (n, c, e) => { c ? (pass++, console.log('  OK   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + JSON.stringify(e))); };

(async () => {
  await new Promise(r => app.listen(7803, '127.0.0.1', r));
  await new Promise(r => setTimeout(r, 5500));      // 等后台出网自检超时落地

  const me = await (await fetch(BASE + '/api/auth/me')).json();
  ok('配置齐了（oauthConfigured=true）', me.oauthConfigured === true, me);
  ok('* 但如实报 oauth=false', me.oauth === false, me);
  ok('* egress 明确为 false', me.egress === false, me);

  const h = await (await fetch(BASE + '/api/llm/health')).json();
  ok('* 模型侧也如实报 llm=false', h.llm === false && h.configured === true && h.egress === false, h);

  const r = await fetch(BASE + '/auth/login', { redirect: 'manual' });
  const body = await r.text();
  ok('* 登录直接给出人话说明（503，不是 502 堆栈）', r.status === 503 && /外网出口/.test(body), r.status);
  ok('  说明里不冒充成功', !/授权|authorize/.test(body));

  const d = await fetch(BASE + '/api/diag').then(x => x.text());
  ok('诊断端点默认关闭', d === '404', d.slice(0, 40));

  console.log('\n' + (fail ? 'FAIL ' : 'PASS ') + pass + ' 通过 / ' + fail + ' 失败');
  await new Promise(r => setTimeout(r, 100));
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('崩了:', e); process.exit(1); });
