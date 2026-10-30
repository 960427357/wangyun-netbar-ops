async page => {
  // 团购券宣传图生成（750×400）
  // 场所名 **不写死**，每次从后台右上角实时读，改店名后无需改脚本。
  // 改券：直接改下面 CARDS 里的 num/face/detail/tag/file 四项。
  // 用法：playwright-cli run-code --filename scripts/make-groupon-banner.js
  // 1. 先读后台右上角的场所名
  await page.goto('https://wyb.5188cloud.net/netBarSummary/handOver', {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(4000);
  if (page.url().includes('/login')) return 'FAIL: 未登录';

  const shopInfo = await page.evaluate(() => {
    const h = document.querySelector('.el-header') || document.querySelector('header');
    if (!h) return {shop: '', all: []};
    const els = [...h.querySelectorAll('*')].filter(e => e.children.length === 0 && e.innerText && e.innerText.trim());
    const all = els.map(e => e.innerText.trim());
    // 场所名是 header 里第一段纯文本（其后依次是「管理员」「AI 旺，您的智能助手」这类固定项）
    // 排除掉明显不是店名的固定项，避免换店后取错
    const skip = /^(管理员|超级管理员|店长|收银员|AI 旺.*|退出|退出登录|首页|消息|设置)$/;
    const shop = all.find(t => !skip.test(t) && t.length <= 40) || '';
    return {shop, all};
  });

  // 取不到就停，绝不回退到任何写死的店名（换店使用最容易在这里出错）
  if (!shopInfo.shop) {
    return 'FAIL: 未能从右上角读到场所名，header 文本为 ' + JSON.stringify(shopInfo.all)
      + '；请确认已登录且页面加载完成，然后重试。禁止在此回退为硬编码店名。';
  }
  const SHOP = shopInfo.shop;

  // 2. 两套券的文案
  const CARDS = [
    {
      file: '团购券-69元享120元网费/groupon-69-120.png',
      num: '69', numSize: 132,
      face: '享 120 元网费',
      detail: '网费 69 元 ＋ 赠送 51 元',
      tag: '新老会员均可购买',
      accent: '#ff5630,#ff8a3d',
    },
    {
      file: '团购券-9.9元享30元网费/groupon-9.9-30.png',
      num: '9.9', numSize: 108,
      face: '享 30 元网费',
      detail: '网费 9.9 元 ＋ 赠送 20.1 元',
      tag: '仅限新会员',
      accent: '#7c3aed,#c026d3',
    },
  ];

  const render = c => `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:750px; height:400px; overflow:hidden;
    font-family:"Microsoft YaHei","PingFang SC",sans-serif;
    background:radial-gradient(circle at 15% 20%, #2b3a8f 0%, #141a3c 45%, #0a0d1f 100%);
    color:#fff; position:relative; }
  .glow1 { position:absolute; width:420px; height:420px; border-radius:50%;
    background:radial-gradient(circle, rgba(255,86,48,.55) 0%, rgba(255,86,48,0) 70%);
    left:-120px; top:-140px; }
  .glow2 { position:absolute; width:380px; height:380px; border-radius:50%;
    background:radial-gradient(circle, rgba(56,189,248,.45) 0%, rgba(56,189,248,0) 70%);
    right:-100px; bottom:-160px; }
  .wrap { position:relative; padding:36px 44px; height:100%; display:flex; flex-direction:column; justify-content:space-between; }
  .shop { font-size:19px; letter-spacing:6px; color:#9fb4ff; font-weight:400; }
  .main { display:flex; align-items:flex-end; gap:18px; margin-top:14px; }
  .num { font-size:${c.numSize}px; font-weight:900; line-height:.86;
    background:linear-gradient(180deg,#fff 10%,#ffd66b 95%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .unit { font-size:40px; font-weight:700; color:#ffd66b; margin-bottom:12px; }
  .mid { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; margin-left:6px; }
  .mid b { font-size:38px; font-weight:800; color:#fff; letter-spacing:1px; white-space:nowrap; }
  .mid span { font-size:19px; color:#c7d2fe; letter-spacing:1px; white-space:nowrap; }
  .bar { display:flex; align-items:center; gap:14px; }
  .tag { background:linear-gradient(90deg,${c.accent}); color:#fff; font-size:22px; font-weight:700;
    padding:10px 22px; border-radius:999px; letter-spacing:2px; white-space:nowrap; }
  .note { font-size:18px; color:#a5b4fc; white-space:nowrap; }
  .price { font-size:19px; color:#8ea2ff; }
</style></head><body>
  <div class="glow1"></div><div class="glow2"></div>
  <div class="wrap">
    <div>
      <div class="shop">${SHOP}</div>
      <div class="main">
        <div class="num">${c.num}</div>
        <div class="unit">元</div>
        <div class="mid"><b>${c.face}</b><span>${c.detail}</span></div>
      </div>
    </div>
    <div class="bar">
      <div class="tag">${c.tag}</div>
      <div class="note">到店核销 · 即买即用</div>
    </div>
    <div class="price">旺云商城团购券 · 数量有限 售完即止</div>
  </div>
</body></html>`;

  const out = {shop: SHOP, headerTexts: shopInfo.all, files: []};
  for (const c of CARDS) {
    const p2 = await page.context().newPage();
    await p2.setViewportSize({width: 750, height: 400});
    await p2.setContent(render(c), {waitUntil: 'load'});
    await p2.waitForTimeout(700);
    await p2.screenshot({path: c.file, type: 'png'});
    await p2.close();
    out.files.push(c.file);
  }
  return JSON.stringify(out, null, 2);
}
