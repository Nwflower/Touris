/* LLM 联调自检：真打一次接口，不吞错。
   用法：npm run llm:ping            （默认例句）
         npm run llm:ping -- "这里人太多了" */
'use strict';
const { server, gateCandidates, extractJSON } = require('../server');

const KEY = process.env.DASHSCOPE_API_KEY || '';
const BASE = process.env.DASHSCOPE_BASE_URL || '';

function die(msg, hint) {
  console.error('✗ ' + msg);
  if (hint) console.error('  排查方向：' + hint);
  server.close();
  process.exit(1);
}

(async () => {
  if (!KEY || !BASE) {
    die('缺少 DASHSCOPE_API_KEY / DASHSCOPE_BASE_URL 环境变量',
      '只放服务端环境（创空间配在 Secrets）；BASE_URL 形如 https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1');
  }
  const { callLLM } = require('../server');
  const text = await callLLM(
    '输出严格的 JSON：{"candidates":[{"name":"景点名","reason":"理由"}]}，不要输出其他文字。',
    '候选：[宽窄巷子, 锦里, 杜甫草堂]。请提名 2 个适合「我晕博物馆」的旅行者的点。'
  ).catch(e => die('调用失败：' + e.message, 'Key 与地域不匹配 / base_url 写错 / 模型名不存在'));

  let json;
  try { json = extractJSON(text); } catch (e) { die('输出里抠不出 JSON：' + text.slice(0, 200), '模型没遵守 JSON 指令，换 instruct 模型或加低温度'); }
  try {
    const gated = gateCandidates(json, ['宽窄巷子', '锦里', '杜甫草堂'], 2);
    console.log('✓ 接口与闸门正常。闸门后提名：', gated.map(x => x.name).join('、'));
  } catch (e) {
    die('闸门拒绝（原始输出：' + text.slice(0, 200) + '）', e.code === 'empty-gated' ? '模型提名的名字不在候选池——提示词需要更强调「逐字一致」' : '输出结构不对');
  }
  server.close();
})();
