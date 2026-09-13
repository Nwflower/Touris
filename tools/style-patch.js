/* ⚠️ 已下线（第 0 代地图方案）
   本工具服务于早期的 MapLibre + PMTiles 离线底图，配套的 tiles/ 与 tiles/assets/
   已在 2026-09-13 的仓库整理中删除，现在没有任何引用。
   现行方案是构建期预烤栅格——见 prototype/tiles-raster/CREDITS.md 与
   prototype/real-maps.js 的文件头。重启矢量方案前不要使用本工具。
   ========================================================================== */

/* ==========================================================================
   给 Protomaps 生成的样式补上 CJK 字形回退

   Protomaps 的 basemaps-assets 不含汉字字形（实测 19968+ 区间是空的 29 字节 stub），
   所以我们自己用 font-maker 生成了 "Noto Sans SC"。MapLibre 的 text-font 是
   fontstack —— 会按顺序对每个字体请求同一区间并合并字形，缺的字由后面的字体补。
   所以只要把 "Noto Sans SC" 追加到每个字体栈末尾，中文标签就能渲染。

   样式里的 text-font 有两种形态，都要处理：
     1. 纯字体数组          ["Noto Sans Regular"]
     2. 表达式，内部是 literal 数组
        ["case", [...], ["literal", ["Noto Sans Medium"]], ["literal", ["Noto Sans Regular"]]]
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.patchFontstack = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const CJK_FALLBACK = 'Noto Sans SC';

  /** 递归：把表达式树里所有 ["literal", [字体...]] 的字体数组追加回退字体 */
  function patchNode(node) {
    if (!Array.isArray(node)) return node;
    if (node[0] === 'literal' && Array.isArray(node[1])) {
      return ['literal', appendFont(node[1])];
    }
    return node.map(patchNode);
  }

  function appendFont(fonts) {
    return fonts.includes(CJK_FALLBACK) ? fonts.slice() : fonts.concat(CJK_FALLBACK);
  }

  /**
   * 就地修改 style.layers 里每个 text-font。
   * 返回被改动的图层数，方便调用方断言「确实生效了」。
   */
  function patchFontstack(style) {
    let touched = 0;
    (style.layers || []).forEach(layer => {
      const layout = layer.layout;
      if (!layout || !layout['text-font']) return;
      const tf = layout['text-font'];
      // 纯字体数组：每个元素都是字符串；表达式的第一个元素是操作符、后面是数组
      const isPlain = tf.every(x => typeof x === 'string');
      layout['text-font'] = isPlain ? appendFont(tf) : patchNode(tf);
      touched++;
    });
    return touched;
  }

  /** 校验：每个 text-font 最终都包含回退字体。返回未覆盖的图层 id 列表。 */
  function verifyFontstack(style) {
    const bad = [];
    (style.layers || []).forEach(layer => {
      const tf = layer.layout && layer.layout['text-font'];
      if (!tf) return;
      const flat = JSON.stringify(tf);
      if (flat.indexOf(CJK_FALLBACK) === -1) bad.push(layer.id);
    });
    return bad;
  }

  // 主函数直接可用（patchFontstack(style)），校验函数挂在它身上
  patchFontstack.verify = verifyFontstack;
  return patchFontstack;
});
