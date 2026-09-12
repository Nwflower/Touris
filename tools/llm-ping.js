#!/usr/bin/env node
/* ==========================================================================
   Touris 知途 · 语义翻译联调自检

   为什么需要这个：文档能确认的东西和"你的 API Key + 你那个地域 + 你那个模型
   真的接受这个请求体"是两件事。结构化输出的参数名、thinking 模式的行为、
   temperature 是否被接受——这些只有真打一次才知道。

   它刻意**不吞错**：失败时把 HTTP 状态和响应体原样打出来。
   跑法（先配好两个环境变量）：

     Bash:        DASHSCOPE_API_KEY=sk-xxx DASHSCOPE_BASE_URL=https://xxx.cn-beijing.maas.aliyuncs.com/compatible-mode/v1 node tools/llm-ping.js
     PowerShell:  $env:DASHSCOPE_API_KEY='sk-xxx'; $env:DASHSCOPE_BASE_URL='https://...'; node tools/llm-ping.js

   不传句子时用下面这句默认的——它故意一句话里有两件事，用来验证「拆条」。
   ========================================================================== */

const { interpret, enabled, config, vocabVersion, tags, SYSTEM_PROMPT, SCHEMA } = require('../server/interpret');

const SAMPLE = process.argv.slice(2).join(' ') || '这家店排队要两小时，而且我不吃生的';

(async () => {
  console.log('Touris 知途 · 语义翻译自检');
  console.log('  模型       : ' + config.model);
  console.log('  base_url   : ' + (config.baseUrl || '(未设置)'));
  console.log('  api_key    : ' + (config.apiKey ? '已设置（' + config.apiKey.slice(0, 6) + '…）' : '(未设置)'));
  console.log('  词汇表     : ' + vocabVersion + ' · ' + tags.length + ' 个标签');
  console.log('  超时       : ' + config.timeoutMs + 'ms');
  console.log('  提示词     : ' + SYSTEM_PROMPT.length + ' 字符 · schema ' + Object.keys(
    SCHEMA.properties.memories.items.properties).length + ' 个字段');
  console.log();

  if(!enabled()){
    console.log('✗ 没配齐 DASHSCOPE_API_KEY / DASHSCOPE_BASE_URL——服务端会一路降级到');
    console.log('  REASON_TO_MEMORY 查表。配上再跑这个脚本。');
    process.exit(1);
  }

  console.log('句子：「' + SAMPLE + '」');
  console.log();

  const t0 = Date.now();
  const r = await interpret(SAMPLE, { city: '京都', spot: '锦市场', dir: 'down' });
  const ms = Date.now() - t0;

  if(!r.ok){
    console.log('✗ 失败（' + ms + 'ms）：' + r.reason);
    console.log();
    console.log('  这条 reason 里带着 HTTP 状态和响应体。逐项对一下：');
    console.log('   · 400 + 提到 response_format / json_schema → 该模型不支持 JSON Schema 模式，');
    console.log('     改用 {"type":"json_object"}（注意：那样提示词里必须出现 "JSON" 字样），');
    console.log('     或换成支持列表里的模型（Qwen3.8-Flash / Qwen3.7-Plus / Qwen3.7-Max / Qwen3.8-Max）。');
    console.log('   · 400 + 提到 temperature → 去掉 server/interpret.js 里那个参数（缓存仍保证确定性）。');
    console.log('   · 401 / 403 → API Key 与地域不匹配（各地域的 Key 不通用）。');
    console.log('   · 404 → base_url 少了或多了 /compatible-mode/v1。');
    console.log('   · timeout → 调大 LLM_TIMEOUT_MS。');
    process.exit(1);
  }

  console.log('✓ 成功（' + ms + 'ms' + (r.cached ? '，命中缓存' : '') + '）');
  console.log();
  console.log('落成 ' + r.memories.length + ' 条记忆：');
  r.memories.forEach(m => {
    const bits = [];
    if(m.pace) bits.push('pace=' + m.pace);
    if(m.avoid) bits.push('avoid=[' + m.avoid.join(',') + ']');
    if(m.prefer) bits.push('prefer=[' + m.prefer.join(',') + ']');
    console.log('  · ' + m.text + '  ⟨' + m.type + '⟩  ' + bits.join(' '));
  });

  if(r.rejected.length){
    console.log();
    console.log('被闸门拦下 ' + r.rejected.length + ' 条：');
    r.rejected.forEach(x => console.log('  × ' + (x.text || '(无 text)') + ' — ' + x.reason));
  }

  if(!r.memories.length){
    console.log();
    console.log('一句都没翻出来。如果这不是你预期的，看提示词是不是太严——');
    console.log('但它也可能是正确答案：「这句话里没有能归入现有偏好的内容」。');
  }

  console.log();
  console.log('上面如果出现了 cached_tokens=… 那行日志，第二次跑同一个句子时它应当 > 0。');
  console.log('一直是 0 说明前缀被什么弄脏了（系统提示词里混进了变量）。');
})();
