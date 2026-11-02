/**
 * 只读：销售总览（商机管理 → 商品管理 → 销售总览）—— 接口版
 * 路由 /marketManage/goodsManage/shop/goodsSale
 *
 * 用法：
 *   playwright-cli run-code --filename scripts/read-goods-sale-api.js
 *
 * 与 read-goods-sale.js 输出结构完全一致，差别只在取数方式：
 *   ❌ 原版：goto → 死等 9s → 解析 DOM 表格 → 每页翻页再等 2.5s → 点分类明细再等 3s
 *   ✅ 本版：goto 同时监听四个接口 → 切「100条/页」一次取全 → 纯 JSON 组装
 *
 * 🔴 关键结论（实测）：四个接口的**请求体全是 RSA 密文** `{"param":"<enc>"}`，
 *    自己拼 fetch 会被挡（406 非法访问），所以**发不了请求**；
 *    但**响应是明文 JSON**，所以**拦响应**完全可行。
 *    时间区间同理不能自选，跟着页面默认（当月）走。
 *
 * 字段对照（接口 → 原表格列）：
 *   goodsName→商品名称  categoryName→分类名称  saleQty→数量  amount→金额/积分
 *   payStyleName→支付渠道  obtainTypeName→获取方式  saleStyle→来源
 *   salesPersonName→销售人员  createTime→日期  buyingPrice→进货金额(单价)
 *
 * 接口：
 *   POST /business-erppro/saleDocument/getSaleDocumentTotal          汇总
 *   POST /business-erppro/saleDocument/saleDocumentSixMonth          半年卡
 *   POST /business-erppro/saleDocument/getSaleDocumentCategorySummary 分类汇总
 *   GET  /business-erppro/saleDocument/getSaleDocumentDetail         明细（分页）
 */
async (page) => {
  const URL = 'https://wyb.5188cloud.net/marketManage/goodsManage/shop/goodsSale';
  const T0 = Date.now();
  const timing = {};

  const once = (urlPart) => page.waitForResponse(
    r => r.url().includes(urlPart) && r.status() === 200,
    {timeout: 45000}
  ).then(r => r.json());

  // ① 先注册监听再导航，避免响应比监听先到
  const detailP = once('getSaleDocumentDetail');
  const totalP = once('getSaleDocumentTotal');
  const sixP = once('saleDocumentSixMonth');
  const catP = once('getSaleDocumentCategorySummary');

  await page.goto(URL, {waitUntil: 'domcontentloaded'});
  const [detail0, totalR, sixR, catR] = await Promise.all([detailP, totalP, sixP, catP]);
  timing['首屏四接口'] = Date.now() - T0;

  // ② 明细补全
  //    默认 10 条/页。两条路实测下来成本差很多：
  //      · 翻页：每次约 0.4s，只在页数少时划算
  //      · 切「100条/页」：下拉动画 + 可交互等待，固定花掉约 3.7s
  //    所以 ≤3 页直接翻，页数多才切 100，切完仍不够再翻。
  let rows = detail0.data || [];
  const wantCount = detail0.count || 0;
  const pagesAt10 = Math.ceil(wantCount / 10);

  if (rows.length < wantCount && pagesAt10 > 3) {
    const tSwitch = Date.now();
    try {
      await page.locator('.el-pagination__sizes .el-select__wrapper').first().click({timeout: 5000});
      // 等下拉真的出现，不要用固定 sleep
      await page.locator('.el-select-dropdown:visible').first()
        .waitFor({state: 'visible', timeout: 3000});

      const opts = await page.evaluate(() =>
        [...document.querySelectorAll('.el-select-dropdown')]
          .filter(d => d.offsetParent !== null)
          .flatMap(d => [...d.querySelectorAll('.el-select-dropdown__item')].map(e => e.innerText.trim()))
      );
      const max = opts
        .map(t => ({text: t, n: parseInt(t, 10) || 0}))
        .sort((a, b) => b.n - a.n)[0];

      if (max && max.n > rows.length) {
        const p = once('getSaleDocumentDetail');
        // 页面上有两个分页器（明细/分类），下拉都 teleport 到 body，
        // 必须限定在当前展开的那个里点，否则会点到不可见的同名项
        await page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
          .filter({hasText: max.text}).first().click({timeout: 5000});
        const big = await p;
        if (big && big.data && big.data.length > rows.length) rows = big.data;
      }
    } catch {
      // 切不动就退回翻页，不阻断
    }
    timing['切每页条数'] = Date.now() - tSwitch;
  }

  // ③ 仍不足则翻页：只等接口响应，不等 DOM 渲染
  let guard = 0;
  while (rows.length < wantCount && guard++ < 50) {
    const p = once('getSaleDocumentDetail');
    const next = page.locator('.el-pagination:visible .btn-next').first();
    const disabled = await next.isDisabled().catch(() => true);
    if (disabled) break;
    await next.click({timeout: 5000}).catch(() => {});
    try {
      const j = await p;
      if (!j.data || !j.data.length) break;
      rows.push(...j.data);
    } catch {
      break;
    }
  }
  timing['明细取全'] = Date.now() - T0;

  // ④ 字段映射成原表格的列名，后续聚合逻辑与原版一致
  //    两个口径坑（实测）：
  //    1) buyingPrice 缺失时是**空字符串 ""**，不是 0。表格那种行才显示 `--`；
  //       红牛等 buyingPrice=0（数字）在表格里显示 0.00，不能算缺失。
  //    2) 扫码渠道的 payStyleName 是长串，如
  //       "通联扫码支付|汇付扫码支付---支付宝"，表格只显示「支付宝扫码」。
  const shortPay = (name) => {
    if (!name) return '(空)';
    const tail = name.includes('---') ? name.split('---').pop().trim() : name;
    if (/支付宝/.test(tail)) return '支付宝扫码';
    if (/微信/.test(tail)) return '微信扫码';
    return tail;
  };

  const goods = rows.map(r => ({
    商品名称: r.goodsName,
    分类名称: r.categoryName,
    数量: r.saleQty,
    '金额/积分': r.amount,
    支付渠道: shortPay(r.payStyleName),
    获取方式: r.obtainTypeName,
    来源: r.saleStyle,
    销售人员: r.salesPersonName,
    日期: r.createTime,
    进货金额: (r.buyingPrice === '' || r.buyingPrice == null) ? '--' : r.buyingPrice,
  }));

  const T = totalR.data || {};
  const totals = {
    销售数量: T.saleQty ?? null,
    销售金额: T.amount ?? null,
    积分兑换: T.integral ?? null,
  };

  const months = (sixR.data || []).map(m => ({
    月份: m.month,
    销售收入: m.amount,
    进货金额: m.buyingAmount,
    销售差额: m.profitAmount,
  }));

  const byCate = (catR.data || []).map(c => ({
    分类: c.categoryName,
    数量: c.saleQty,
    金额: c.amount,
    进货: c.purchaseCost,
    差额: c.saleProfit,
  }));

  // ⑤ 聚合（口径与 read-goods-sale.js 保持一致）
  const num = (s) => parseFloat(String(s).replace(/[^\d.-]/g, '')) || 0;
  const agg = {};
  const pay = {}, obt = {}, src = {}, seller = {};

  for (const r of goods) {
    const n = r['商品名称'];
    if (!n) continue;
    const q = parseInt(r['数量'], 10) || 0;
    const a = num(r['金额/积分']);
    agg[n] = agg[n] || {商品: n, 分类: r['分类名称'], 数量: 0, 金额: 0, 次数: 0};
    agg[n].数量 += q; agg[n].金额 += a; agg[n].次数 += 1;
    pay[r['支付渠道']] = (pay[r['支付渠道']] || 0) + a;
    const s = (r['销售人员'] || '').trim() || '(空白·无人计提成)';
    seller[s] = seller[s] || {销售人员: s, 件: 0, 元: 0, 笔: 0};
    seller[s].件 += q; seller[s].元 += a; seller[s].笔 += 1;
    obt[r['获取方式']] = (obt[r['获取方式']] || 0) + 1;
    src[r['来源']] = (src[r['来源']] || 0) + q;
  }

  const rank = Object.values(agg).sort((a, b) => b.金额 - a.金额)
    .map(x => ({...x, 金额: +x.金额.toFixed(2)}));

  const dates = goods.map(r => (r['日期'] || '').slice(0, 10)).filter(Boolean).sort();
  const byDay = {};
  for (const r of goods) {
    const d = (r['日期'] || '').slice(0, 10);
    if (!d) continue;
    byDay[d] = byDay[d] || {日: d, 件: 0, 元: 0};
    byDay[d].件 += parseInt(r['数量'], 10) || 0;
    byDay[d].元 += num(r['金额/积分']);
  }
  Object.values(byDay).forEach(x => { x.元 = +x.元.toFixed(2); });

  const sumDetail = +goods.reduce((s, r) => s + num(r['金额/积分']), 0).toFixed(2);
  const sumPoints = +goods.filter(r => r['支付渠道'] === '积分兑换')
    .reduce((s, r) => s + num(r['金额/积分']), 0).toFixed(2);

  const freeRows = goods.filter(r => num(r['金额/积分']) === 0).length;
  const penny = goods.filter(r => num(r['金额/积分']) > 0 && num(r['金额/积分']) <= 0.01)
    .map(r => `${r['商品名称']}(${r['金额/积分']})`);
  const noCost = goods.filter(r => r['进货金额'] === '--').map(r => r['商品名称']);

  return JSON.stringify({
    口径: '（不包含使用会员余额支付、核销和积分兑换的订单，套餐和未填写进货金额的商品订单进货金额按0元进行计算）',
    汇总: totals,
    半年收入: months,
    日期范围: dates.length ? dates[0] + ' ~ ' + dates[dates.length - 1] : '无数据',
    明细行数: goods.length,
    每日分布: Object.values(byDay).sort((a, b) => a.日.localeCompare(b.日)),
    分类明细: byCate,
    商品排行: rank,
    '销售人员(提成归属)': Object.values(seller)
      .map(x => ({...x, 元: +x.元.toFixed(2)}))
      .sort((a, b) => b.元 - a.元),
    支付渠道金额: pay,
    获取方式笔数: obt,
    来源件数: src,
    异常: {
      '金额为0的行数': freeRows,
      '0.01元行': penny,
      '进货金额缺失(记--的商品)': [...new Set(noCost)],
      '明细件数 vs 汇总件数': `${goods.reduce((s, r) => s + (parseInt(r['数量'], 10) || 0), 0)} 件 / ${totals.销售数量} 件`,
      '明细金额合计 vs 汇总金额': `明细 ${sumDetail} 元 / 汇总 ${totals.销售金额} 元（差 ${(+sumDetail - totals.销售金额).toFixed(2)}，应等于积分兑换渠道 ${sumPoints} 元）`,
    },
    _取数耗时ms: timing,
    _总耗时ms: Date.now() - T0,
  }, null, 1);
}
