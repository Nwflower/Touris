/* ==========================================================================
   Touris 知途 · 语义翻译（LLM 的唯一入口）

   ★ LLM 在这套系统里的角色：翻译官，不是作者

   产品的护城河是一条确定性链路：
       记忆 → Archive.constraints() → Derive.diffs() → 每条变更反查 memoryIds
   所以 LLM 绝不决定行程，只做一件事：把用户的**开放原话**翻译成**已有的
   语义标签**（SEMANTICS）。翻不出来就明说翻不出来，不许发明新标签——
   新标签 derive.js 认不出，validate.js 也会报错。

   ★ 三重闸门（缺一不可）

    1. response_format 的 strict schema —— 约束模型的输出形状。方便，但不是保证：
       官方文档写了非思考模式模型在思考态下可能静默失效。
    2. 本文件的 gate() —— 真正的保证。逐字段查词汇表，不合格就丢掉。
    3. 前端 Archive —— 最终只认闸门放行的那几条，别的进不去。

   第 2 层必须存在。把正确性寄托在模型守规矩上，等于没有正确性。

   ★ 降级路径不是死代码

   LLM 没配 key / 超时 / 返回垃圾 → 返回 degraded，前端回落到
   REASON_TO_MEMORY 那张手写表（39 条，本来就在跑）。路演当天不怕服务不可用。
   ========================================================================== */

const crypto = require('crypto');
const { loadVocabulary, fingerprint, TAG_TEXT, PACE_TEXT, fewShot } = require('./vocab');

/* ---------------- 配置 ----------------
   全部走环境变量。创空间在 Secrets 里配，绝不落到前端（见 app/account.js 的警告）。 */
const CFG = {
  baseUrl: (process.env.DASHSCOPE_BASE_URL || '').replace(/\/+$/, ''),
  apiKey: process.env.DASHSCOPE_API_KEY || '',
  model: process.env.DASHSCOPE_MODEL || 'qwen3.8-flash',
  timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS, 10) || 6000,
  maxMemories: 4
};

const V = loadVocabulary();
const VOCAB_VERSION = fingerprint(V);

/** 语义标签集合。刻意不用 ALL_TAGS——它把 pace 的值（slow/medium/fast）也算进了
    标签，是 memory.js 那层的宽松处。这里只要真正的 avoid/prefer 标签。 */
const TAGS = [...new Set(V.avoid.concat(V.prefer))].sort();

function enabled(){ return !!(CFG.apiKey && CFG.baseUrl); }

/* ---------------- 提示词 ----------------
   ★ 系统提示词必须逐字节稳定，否则前缀缓存永远不命中。
   所以：不放时间戳、不放请求 id、不放本次的城市和景点（那些进 user 消息）。
   词汇表与范例都从 data/memory.js 机械生成并排序，顺序也是稳定的。 */

const avoidLines  = V.avoid.map(t => `  ${t} = ${TAG_TEXT[t] || t}`).join('\n');
const preferLines = V.prefer.map(t => `  ${t} = ${TAG_TEXT[t] || t}`).join('\n');
const paceLines   = V.pace.map(p => `  ${p} = ${PACE_TEXT[p] || p}`).join('\n');

const SHOTS = fewShot(V, 2)
  .map(x => `  用户点「${x.reason}」→ text:"${x.rule.text}" type:"${x.rule.type}"`
    + (x.rule.pace ? ` pace:"${x.rule.pace}"` : '')
    + (x.rule.avoid ? ` avoid:${JSON.stringify([].concat(x.rule.avoid))}` : '')
    + (x.rule.prefer ? ` prefer:${JSON.stringify([].concat(x.rule.prefer))}` : ''))
  .join('\n');

const SYSTEM_PROMPT = `你在为一个「记忆驱动的旅行规划」产品做语义翻译。

用户会对某个旅行安排（一个景点、一顿饭、一家住宿、一段交通）表达喜欢或不喜欢，
用他自己的一句话。你的任务：把这句话翻译成下面词汇表里的语义标签。

# 可用的语义标签（只能从这里选，一个都不许发明）

节奏 pace：
${paceLines}

回避 avoid：
${avoidLines}

偏好 prefer：
${preferLines}

# 输出字段

- text：把这条记忆写成一句**通用的人话**——脱离这次上下文也能读懂。
  不要照抄用户原句，不要带「这家」「这里」这类指代。
  好例子：「不排长队的店」；坏例子：「这家店排队太久了」。
- type：只能是 ${V.types.join(' / ')} 之一。
- pace / avoid / prefer：从词汇表里选。**一条记忆至少要有其中一个**，
  否则它学不到任何东西，会被丢弃。
- 不确定的一律留空，不要猜。宁可少写，不要瞎写。

# 拆条

一句原话里如果有几件不同的事，拆成几条记忆。
例：「这家排队两小时，而且我不吃生的」
→ 两条：「不排长队的店」（avoid:["queue"]）、「不吃生食」（avoid:["street-food"]）。

# 关键

如果这句话里没有任何能归入词汇表的内容，memories 返回**空数组**。
这是正确答案，不是失败——假装学到了什么才是失败。

# 参考（这些是产品里手写的对照，学它们的措辞风格和标签粒度）

${SHOTS}`;

function userPrompt(text, ctx){
  const bits = [];
  if(ctx && ctx.city) bits.push(`当前城市：${ctx.city}`);
  if(ctx && ctx.spot) bits.push(`用户表态的安排：${ctx.spot}`);
  if(ctx && ctx.dir)  bits.push(`用户点了：${ctx.dir === 'up' ? '喜欢' : '不喜欢'}`);
  return (bits.length ? bits.join('\n') + '\n\n' : '') + `用户的原话：「${text}」`;
}

/* ---------------- 输出 schema ----------------
   pace 用空串当「未表达」的哨兵，而不是 nullable——
   `type: ["string","null"]` 配 enum 在部分实现上会报错，空串绕开这个坑。 */
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['memories'],
  properties: {
    memories: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'type', 'pace', 'avoid', 'prefer'],
        properties: {
          text:   { type: 'string' },
          type:   { type: 'string', enum: V.types },
          pace:   { type: 'string', enum: V.pace.concat(['']) },
          avoid:  { type: 'array', items: { type: 'string', enum: TAGS } },
          prefer: { type: 'array', items: { type: 'string', enum: TAGS } }
        }
      }
    }
  }
};

/* ---------------- 闸门（第 2 层，真正的保证） ---------------- */

/** 过滤出词汇表内的标签，越界的记进 bad */
function pickTags(arr, label, bad){
  if(!Array.isArray(arr)) return [];
  const out = [];
  arr.forEach(t => {
    if(typeof t !== 'string' || !t) return;
    if(TAGS.includes(t)){ if(!out.includes(t)) out.push(t); }
    else bad.push(label + ':' + t);
  });
  return out;
}

/**
 * 逐条校验模型输出。不合格的丢掉并记原因，绝不「修一修再用」。
 * @returns { memories, rejected } —— memories 可以直接喂给 Archive.remember
 */
function gate(raw){
  const memories = [], rejected = [];
  const list = (raw && Array.isArray(raw.memories)) ? raw.memories : [];
  const seen = new Set();

  for(const r of list.slice(0, CFG.maxMemories + 2)){
    if(!r || typeof r !== 'object'){ rejected.push({ reason: 'not_an_object' }); continue; }

    const text = String(r.text == null ? '' : r.text).trim();
    if(!text){ rejected.push({ reason: 'empty_text' }); continue; }
    if(text.length > 60){ rejected.push({ text, reason: 'text_too_long' }); continue; }
    if(seen.has(text)){ rejected.push({ text, reason: 'duplicate' }); continue; }

    const type = String(r.type == null ? '' : r.type).trim();
    if(!V.types.includes(type)){ rejected.push({ text, reason: 'bad_type:' + type }); continue; }

    const bad = [];
    const avoid  = pickTags(r.avoid,  'avoid',  bad);
    const prefer = pickTags(r.prefer, 'prefer', bad);
    const pace   = V.pace.includes(r.pace) ? r.pace : null;

    // 越界的标签 → 整条丢掉，不静默剔除标签后放行：那样 text 和语义会对不上，
    // 而「记忆可溯源」的前提是两者一致。
    if(bad.length){ rejected.push({ text, reason: 'tag_not_in_vocab:' + bad.join(',') }); continue; }

    // ★ 核心闸门：一条学不到东西的记忆等于没记。validate.js 防的就是这个。
    if(!avoid.length && !prefer.length && !pace){
      rejected.push({ text, reason: 'no_semantics' }); continue;
    }

    seen.add(text);
    const m = { text, type };
    if(pace) m.pace = pace;
    if(avoid.length) m.avoid = avoid;
    if(prefer.length) m.prefer = prefer;
    memories.push(m);
  }

  if(memories.length > CFG.maxMemories){
    rejected.push(...memories.splice(CFG.maxMemories).map(m => ({ text: m.text, reason: 'over_limit' })));
  }
  return { memories, rejected };
}

/* ---------------- 结果缓存 ----------------
   ★ 确定性靠这里，不靠采样参数。

   app/core/bootstrap.js 的 regen 写着「重复生成结果应当一致」。同一个人的同一句话、
   同一份词汇表，必须得到同样的记忆。缓存同时买到三件事：确定性、省钱、演示兜底
   （热门组合预热过就是毫秒级，现场网络抖也不怕）。 */
const CACHE = new Map();
const CACHE_MAX = 500;

function cacheKey(text, ctx){
  return crypto.createHash('sha256')
    .update(JSON.stringify([VOCAB_VERSION, CFG.model, text, (ctx && ctx.spot) || '', (ctx && ctx.dir) || '']))
    .digest('hex');
}

function cacheGet(k){
  const hit = CACHE.get(k);
  if(!hit) return null;
  if(Date.now() - hit.at > 24 * 3600 * 1000){ CACHE.delete(k); return null; }
  CACHE.delete(k); CACHE.set(k, hit);          // LRU：命中就挪到队尾
  return hit;
}

function cacheSet(k, val){
  CACHE.set(k, { at: Date.now(), val });
  while(CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
}

/* ---------------- 调模型 ---------------- */

/** 把可能的 content 形状收敛成字符串（文本模型给 string，多模态给数组） */
function contentText(content){
  if(typeof content === 'string') return content;
  if(Array.isArray(content)){
    return content.map(c => (c && typeof c.text === 'string') ? c.text : '').join('');
  }
  return '';
}

async function callModel(text, ctx){
  const res = await fetch(CFG.baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + CFG.apiKey
    },
    body: JSON.stringify({
      model: CFG.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt(text, ctx) }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'travel_memory', strict: true, schema: SCHEMA }
      },
      temperature: 0,
      max_tokens: 800
    }),
    signal: AbortSignal.timeout(CFG.timeoutMs)
  });

  if(!res.ok){
    const body = await res.text().catch(() => '');
    const err = new Error('HTTP ' + res.status + ': ' + body.slice(0, 300));
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const usage = (data && data.usage) || {};

  // 前缀缓存有没有真的命中，只能这样看。长期为 0 说明前缀被什么弄脏了。
  const cached = (usage.prompt_tokens_details || {}).cached_tokens;
  if(cached != null) console.log('[llm] cached_tokens=' + cached + ' prompt=' + usage.prompt_tokens);

  const raw = contentText(data && data.choices && data.choices[0]
    && data.choices[0].message && data.choices[0].message.content);
  if(!raw) throw new Error('模型返回了空的 content');
  return raw;
}

/* ---------------- 对外入口 ---------------- */

/**
 * 把一句话翻译成记忆。
 * @returns {{ok:boolean, memories:Array, rejected:Array, cached?:boolean,
 *            degraded?:boolean, reason?:string}}
 *          ok:false 时前端回落到 REASON_TO_MEMORY 查表——不要当成错误弹窗。
 */
async function interpret(text, ctx){
  text = String(text == null ? '' : text).trim();
  if(!text) return { ok: false, degraded: true, reason: 'empty_input', memories: [], rejected: [] };
  if(text.length > 200) text = text.slice(0, 200);   // 一句话不该这么长；截断而非报错

  const key = cacheKey(text, ctx);
  const hit = cacheGet(key);
  if(hit) return Object.assign({}, hit.val, { cached: true });

  if(!enabled()){
    return { ok: false, degraded: true, reason: 'not_configured', memories: [], rejected: [] };
  }

  let raw;
  try{
    raw = await callModel(text, ctx);
  }catch(e){
    const reason = (e.name === 'TimeoutError' || e.name === 'AbortError')
      ? 'timeout' : ('request_failed: ' + e.message);
    console.warn('[llm] 调用失败，降级：' + reason);
    return { ok: false, degraded: true, reason, memories: [], rejected: [] };
  }

  let parsed;
  try{
    parsed = JSON.parse(raw);
  }catch(e){
    // 就算开了 strict schema 也要接住——模型和网关都会有意料之外的时候
    console.warn('[llm] 返回的不是合法 JSON，降级：' + raw.slice(0, 200));
    return { ok: false, degraded: true, reason: 'bad_json', memories: [], rejected: [] };
  }

  const { memories, rejected } = gate(parsed);
  if(rejected.length) console.warn('[llm] 闸门丢掉了 ' + rejected.length + ' 条：', rejected);

  const out = { ok: true, memories, rejected };
  cacheSet(key, out);        // 空结果也缓存：否则同一句翻不出来会反复打模型
  return out;
}

module.exports = {
  interpret, gate, enabled, cacheKey, CACHE,
  SYSTEM_PROMPT, SCHEMA, userPrompt, contentText,
  config: CFG, vocab: V, vocabVersion: VOCAB_VERSION, tags: TAGS
};
