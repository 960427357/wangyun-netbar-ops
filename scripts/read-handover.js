/*
 * read-handover.js — 读一个交接班班次的全量明细，并做对账 + 异常体检
 *
 * 前置：页面已登录并停在 /netBarSummary/handOver（列表）或 /netBar/handOverDetail?id=…
 * 用法：ROW = 0 表示列表第一行（最新的那一班）；改了 ROW 直接重跑。
 *
 * 为什么不能直接 fetch：shiftDetail 的 param 是密文、且前端带加签，页面内 fetch 会 406。
 * 只能点「查看」再拦截响应 —— 响应体是**明文 JSON**（约 13.8KB）。
 *
 * 输出：一段 JSON 文本（含三块：head 抬头 / check 对账 / top 排行 / warn 异常）。
 *       要落盘就重定向 stdout，再用 Python 取 "### Result" 与 "### Ran Playwright" 之间那段。
 */
async (page) => {
  const ROW = 0;

  // 1) 保证在列表页
  if (/handOverDetail/.test(page.url())) {
    await page.goBack();
    await page.waitForTimeout(3500);
  } else if (!/netBarSummary\/handOver/.test(page.url())) {
    await page.goto('https://wyb.5188cloud.net/netBarSummary/handOver', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
  }

  // 2) 先挂监听，再点「查看」（顺序反了会漏响应）
  const wait = new Promise((resolve) => {
    page.on('response', async (r) => {
      if (r.url().includes('shiftChange/shiftDetail')) {
        try { resolve(await r.text()); } catch (e) { resolve(''); }
      }
    });
  });

  const btns = page.locator('button:has-text("查看")');
  const n = await btns.count();
  let seen = 0, clicked = false;
  for (let i = 0; i < n; i++) {
    const b = btns.nth(i);
    if (!(await b.isVisible())) continue;          // 固定列会产生一批隐藏副本
    if (seen === ROW) { await b.click({ force: true }); clicked = true; break; }
    seen++;
  }
  if (!clicked) return JSON.stringify({ error: 'row not found', visible: seen });

  const body = await Promise.race([wait, new Promise((r) => setTimeout(() => r(''), 15000))]);
  if (!body) return JSON.stringify({ error: 'no shiftDetail response', url: page.url() });

  const d = JSON.parse(body).data;
  const r2 = (x) => Math.round(x * 100) / 100;
  const sum = (arr, k) => r2(arr.reduce((a, x) => a + (Number(x[k]) || 0), 0));

  // 3) 抬头
  const head = {
    person: d.classUserName,
    start: d.startTime,
    end: d.endTime,
    shift: /T0?8:4|08:5|09:0|09:1/.test('T' + (d.endTime || '').slice(11)) ? '夜班（结账在早上）' : '白班（结账在晚上）',
    totalIncome: d.totalIncome,
  };

  // 4) 对账
  const cash = r2((d.rechargeXj || 0) + (d.goodsIncomeXj || 0));
  const online = r2((d.rechargeWx || 0) + (d.rechargeZfb || 0) + (d.goodsIncomeWx || 0) + (d.goodsIncomeZfb || 0) + (d.goodsIncomeWallet || 0));
  const verify = r2((d.verifyAmountMt || 0) + (d.verifyAmountDy || 0) + (d.verifyAmountWwb || 0));
  const goodsSum = sum(d.categorySaleInfo || [], 'totalPrice');
  const check = {
    现金收入: { 页面: d.cashIncome, 复算: cash, ok: Math.abs(cash - d.cashIncome) < 0.01 },
    移动收入: { 页面: d.onlineIncome, 复算: online, ok: Math.abs(online - d.onlineIncome) < 0.01 },
    核销收入: { 页面: d.verifyTotalAmount, 复算: verify, ok: Math.abs(verify - d.verifyTotalAmount) < 0.01 },
    总收入: { 页面: d.totalIncome, 复算: r2(d.cashIncome + d.onlineIncome + d.verifyTotalAmount), ok: Math.abs(d.cashIncome + d.onlineIncome + d.verifyTotalAmount - d.totalIncome) < 0.01 },
    商品合计: { 分类表和: goodsSum, 四栏之和: r2((d.goodsIncomeXj || 0) + (d.goodsIncomeWx || 0) + (d.goodsIncomeZfb || 0) + (d.goodsIncomeWallet || 0)), goodsIncome字段: d.goodsIncome },
  };

  // 5) 商品排行（销量要把换购/兑换/中奖一起算，saleQty 有时不含换购）
  const items = (d.goodsSaleInfo || []).map((g) => ({
    分类: g.categoryName, 商品: g.goodsName,
    销量: (g.saleQty || 0) + (g.hgNum || 0) + (g.exchangeNum || 0) + (g.winningNum || 0),
    金额: g.totalPrice,
    换购: g.hgNum ? `${g.hgNum}件@${g.hgPrice}元` : '',
    积分兑: g.exchangeNum || 0,
  })).sort((a, b) => b.金额 - a.金额);

  // 6) 库存校验：前班 − 当前 = 售 + 换购 + 报损 − 入库 − 回补
  const stock = [];
  for (const c of d.categorySaleInfo || []) {
    const last = Number(c.lastBarAmount), now = Number(c.barAmount);
    if (!last && !now) { stock.push({ 分类: c.categoryName, 状态: '库存为空(成品不记库存，看原料表)', 销量: c.saleQty }); continue; }
    const real = last - now;
    const expect = (c.saleQty || 0) + (c.hgNum || 0) + (c.bsNum || 0) - (c.barChangeNum || 0) - (c.crossShiftRefundQuantity || 0);
    stock.push({ 分类: c.categoryName, 前班: last, 当前: now, 实减: real, 应减: expect, ok: real === expect });
  }

  // 7) 异常体检
  const warn = [];
  if ((d.reserveMoney || 0) === 0) warn.push('留给下班 0 元：钱箱无备用金，下个班找零要自己垫');
  if ((d.rentIncome || 0) === 0 && (d.rentInfo || []).length) {
    warn.push(`租赁 ${(d.rentInfo || []).reduce((a, x) => a + (x.rentTimes || 0), 0)} 次但收入 0 元：外设没配租金或免费借用`);
  }
  if ((d.reduceIntegral || 0) === 0 && (d.increaseIntegral || 0) > 0) warn.push(`积分只发不收：本班新增 ${d.increaseIntegral}、消耗 0`);
  if ((d.goodsIncome || 0) > 0 && Math.abs(goodsSum - (d.goodsIncomeXj + d.goodsIncomeWx + d.goodsIncomeZfb + d.goodsIncomeWallet)) > 0.01) {
    warn.push(`goodsIncome(${d.goodsIncome}) 与商品四栏之和(${r2(d.goodsIncomeXj + d.goodsIncomeWx + d.goodsIncomeZfb + d.goodsIncomeWallet)}) 不符：该字段口径不明，报表勿用`);
  }
  if ((d.verifyTotalAmount || 0) > (d.cashIncome + d.onlineIncome)) {
    warn.push(`核销 ${d.verifyTotalAmount} 超过现金+移动 ${r2(d.cashIncome + d.onlineIncome)}：券款在顾客买券时已付给平台，属流水口径，不是当班现金`);
  }
  for (const s of stock) if (s.ok === false) warn.push(`库存不闭合：${s.分类} 实减 ${s.实减} / 应减 ${s.应减}`);

  return JSON.stringify({
    head, check, warn,
    商品排行: items.slice(0, 12),
    租赁: (d.rentInfo || []).map((r) => `${r.goodsName} ×${r.rentTimes} = ${r.amount}元`),
    原料: (d.materialUseInfo || []).map((m) => `${m.materialName} ${m.startStock}→${m.endStock}${m.unitName} 售${m.saleQty} 报损${m.damageQty}`),
    库存: stock,
    其他: { 充零有赠: d.zeroCash, 老板充值: d.bossRecharge, 充负: d.minusCash, 积分新增: d.increaseIntegral, 积分消耗: d.reduceIntegral },
  }, null, 1);
}
