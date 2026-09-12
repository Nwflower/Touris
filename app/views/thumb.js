/* ==========================================================================
   Touris 知途 · 景点缩略图

   ★ 从 prototype/app.js 与 styles-extra.css 原样搬迁

   这套做得挺讲究，重建时不该丢：
     · 按景点类别生成抽象插画（纯内联 SVG，14 种造型，零外部请求）
     · 真实照片盖在插画之上，加载成功才淡入；失败就摘掉 img，露出插画
   于是「有网 / 没网」两种情况下都不会开天窗——路演现场网络不可靠时这点很值钱。

   ★ 图片代理

   本机直连 upload.wikimedia.org 不通（整个 wikipedia.org 都不通），
   所以默认经 wsrv.nl 取图。直连可用的环境把 USE_PROXY 改成 false。
   ========================================================================== */

const Thumb = (() => {
  const USE_PROXY = true;

  /** 图片 URL → 经代理的 URL。没有图时返回 null。 */
  function photoURL(name){
    const c = city();
    const raw = c && c.images && c.images[name];
    if(!raw) return null;
    if(!USE_PROXY) return raw;
    return 'https://wsrv.nl/?url=' + encodeURIComponent(raw.replace(/^https?:\/\//, '')) + '&w=960&output=jpg';
  }

  /* 按类别的抽象插画。造型取自原型，配色走 CSS 变量（见 hero.css 的 .sthumb）。 */
  const ART = {
    temple: '<path class="sky" d="M0 0h80v60H0z"/><path class="hill" d="M0 46c14-10 24-6 34 1s24 6 46-5v18H0z"/>' +
      '<path class="s1" d="M22 30h36l-6-7H28z"/><rect class="s2" x="28" y="30" width="24" height="14"/>' +
      '<path class="s1" d="M26 22h28l-14-8z"/><rect class="s3" x="37" y="35" width="6" height="9"/>',
    garden: '<path class="sky" d="M0 0h80v60H0z"/><rect class="sand" x="6" y="14" width="68" height="34" rx="3"/>' +
      '<path class="rake" d="M10 22h60M10 28h60M10 34h60M10 40h60"/>' +
      '<ellipse class="s2" cx="26" cy="30" rx="8" ry="6"/><ellipse class="s3" cx="48" cy="37" rx="5" ry="4"/>' +
      '<ellipse class="s3" cx="56" cy="24" rx="4" ry="3"/>',
    bamboo: '<path class="sky" d="M0 0h80v60H0z"/><g class="stalk">' +
      '<rect x="10" y="0" width="5" height="60"/><rect x="22" y="0" width="4" height="60"/>' +
      '<rect x="33" y="0" width="6" height="60"/><rect x="46" y="0" width="4" height="60"/>' +
      '<rect x="56" y="0" width="5" height="60"/><rect x="68" y="0" width="4" height="60"/></g>' +
      '<path class="rake" d="M0 18h80M0 38h80"/>',
    river: '<path class="sky" d="M0 0h80v60H0z"/><path class="hill" d="M0 26c12-12 26-10 38-2s26 8 42-4v14H0z"/>' +
      '<path class="water" d="M0 38h80v22H0z"/><path class="bridge" d="M8 40h64"/>' +
      '<path class="bridge" d="M20 40v8M40 40v8M60 40v8"/><path class="rake" d="M6 52h26M44 56h30"/>',
    market: '<path class="sky" d="M0 0h80v60H0z"/><rect class="s2" x="4" y="18" width="72" height="30"/>' +
      '<g class="awn"><path d="M4 18h12v8H4zM28 18h12v8H28zM52 18h12v8H52z"/></g>' +
      '<g class="awn2"><path d="M16 18h12v8H16zM40 18h12v8H40zM64 18h12v8H64z"/></g>' +
      '<rect class="s3" x="10" y="32" width="18" height="12"/><rect class="s3" x="34" y="32" width="14" height="12"/>' +
      '<rect class="s3" x="54" y="32" width="16" height="12"/>',
    street: '<path class="sky" d="M0 0h80v60H0z"/><path class="road" d="M32 60l8-38h4l8 38z"/>' +
      '<g class="s2"><path d="M0 14h30v46H0z"/><path d="M50 14h30v46H50z"/></g>' +
      '<g class="win"><rect x="6" y="22" width="6" height="7"/><rect x="18" y="22" width="6" height="7"/>' +
      '<rect x="58" y="22" width="6" height="7"/><rect x="70" y="22" width="6" height="7"/></g>' +
      '<g class="lant"><circle cx="34" cy="26" r="2.4"/><circle cx="48" cy="26" r="2.4"/></g>',
    museum: '<path class="sky" d="M0 0h80v60H0z"/><path class="s1" d="M8 22h64L40 8z"/>' +
      '<rect class="s2" x="8" y="22" width="64" height="26"/>' +
      '<g class="col"><rect x="16" y="26" width="6" height="22"/><rect x="30" y="26" width="6" height="22"/>' +
      '<rect x="44" y="26" width="6" height="22"/><rect x="58" y="26" width="6" height="22"/></g>' +
      '<rect class="s3" x="4" y="48" width="72" height="5"/>',
    shrine: '<path class="sky" d="M0 0h80v60H0z"/><path class="hill" d="M0 48c16-8 26-4 36 2s22 4 44-6v16H0z"/>' +
      '<g class="torii"><path d="M14 16h52v5H14z"/><path d="M18 24h44v4H18z"/>' +
      '<rect x="22" y="16" width="6" height="34"/><rect x="52" y="16" width="6" height="34"/></g>',
    castle: '<path class="sky" d="M0 0h80v60H0z"/><path class="s1" d="M26 24h28l-7-8H33z"/>' +
      '<path class="s1" d="M18 36h44l-8-9H26z"/><rect class="s2" x="30" y="24" width="20" height="12"/>' +
      '<rect class="s2" x="24" y="36" width="32" height="12"/><rect class="s3" x="6" y="48" width="68" height="6"/>',
    path: '<path class="sky" d="M0 0h80v60H0z"/><path class="water" d="M18 60c6-18 2-30 10-44"/>' +
      '<path class="road" d="M30 60c6-18 2-30 10-44"/>' +
      '<g class="tree"><circle cx="54" cy="20" r="8"/><circle cx="66" cy="30" r="6"/><circle cx="50" cy="38" r="7"/></g>' +
      '<path class="rake" d="M0 52h80"/>',
    tower: '<path class="sky" d="M0 0h80v60H0z"/><path class="s2" d="M36 52l3-34h2l3 34z"/>' +
      '<ellipse class="s1" cx="40" cy="18" rx="9" ry="5"/><rect class="s3" x="30" y="52" width="20" height="6"/>' +
      '<path class="rake" d="M0 46h80"/>',
    shopping: '<path class="sky" d="M0 0h80v60H0z"/><rect class="s2" x="12" y="16" width="56" height="34" rx="2"/>' +
      '<path class="awn" d="M12 16h56v7H12z"/><rect class="s3" x="22" y="30" width="14" height="20"/>' +
      '<rect class="s3" x="44" y="30" width="14" height="12"/><path class="rake" d="M12 50h56"/>',
    station: '<path class="sky" d="M0 0h80v60H0z"/><path class="s1" d="M4 20h72v6H4z"/>' +
      '<rect class="s2" x="10" y="26" width="60" height="22"/><rect class="s3" x="20" y="32" width="40" height="10" rx="2"/>' +
      '<path class="rake" d="M0 52h80M0 56h80"/>'
  };

  /** 缩略图。底层永远是 SVG 插画，有照片就盖上去。 */
  function html(name, extraClass){
    const c = city();
    const s = (c && c.spots && c.spots[name]) || {};
    const art = ART[s.cat] || ART.temple;
    const url = photoURL(name);
    return `<div class="sthumb ${extraClass || ''} c-${DOM.esc(s.cat || 'temple')}">
      <svg viewBox="0 0 80 60" preserveAspectRatio="none">${art}</svg>
      ${url ? `<img src="${DOM.esc(url)}" alt="${DOM.esc(name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}
      <span class="ph-mark">示意</span>
    </div>`;
  }

  /** 大图（轮播用）：同样的回落策略，只是尺寸不同 */
  function heroImg(name){
    const c = city();
    const url = photoURL(name);
    if(url) return `background-image:url('${DOM.esc(url)}')`;
    const s = (c && c.spots && c.spots[name]) || {};
    return `background-image:linear-gradient(135deg, #4A3F36, #2E2A26)`;
  }

  return { html, heroImg, photoURL, ART };
})();

/* 照片加载成功 → 淡入并盖住插画；失败 → 摘掉 img，露出插画。
   load / error 不冒泡，所以在捕获阶段代理，这样任何时候插入的 img 都能接住。 */
document.addEventListener('load', e => {
  const img = e.target;
  if(img.tagName === 'IMG' && img.parentElement && img.parentElement.classList.contains('sthumb')){
    img.classList.add('ok');
    img.parentElement.classList.add('has-photo');
  }
}, true);

document.addEventListener('error', e => {
  const img = e.target;
  if(img.tagName === 'IMG' && img.parentElement && img.parentElement.classList.contains('sthumb')){
    img.remove();
  }
}, true);
