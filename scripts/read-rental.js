async (page) => {
  // ===== 外设租赁读取器 =====
  // MODE: 'renting'=租赁中 | 'finished'=已完成（用 START/END 筛，口径=归还时间）
  const CFG = { MODE: 'renting', START: '2026-10-25', END: '2026-10-31', SHOW: 12 };
  const BASE = 'https://wyb.5188cloud.net';
  const caps = [];
  page.on('response', async (r) => {
    if (!r.url().includes('rentOrder/list')) return;
    try { caps.push(await r.text()); } catch (e) {}
  });

  // --- 1. 进页面 ---
  if (!/tenancy\/(statistics|log)/.test(page.url())) {
    await page.goto(BASE + '/marketManage/tenancy/statistics', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
  }
  const clickText = async (t) => page.evaluate((t) => {
    const el = [...document.querySelectorAll('.left-menu-item,.menu-item,div,span,li')]
      .find(e => e.children.length === 0 && (e.innerText || '').trim() === t);
    if (el) el.click();
  }, t);
  await clickText('租赁记录');
  await page.waitForTimeout(2200);
  await clickText(CFG.MODE === 'renting' ? '租赁中' : '已完成');
  await page.waitForTimeout(3000);

  // --- 2. 已完成：筛日期 ---
  if (CFG.MODE === 'finished' && CFG.START) {
    const setDate = async (ph, val) => {
      const inp = page.locator('input[placeholder="' + ph + '"]').first();
      if (!(await inp.count())) return;
      await inp.evaluate(el => el.removeAttribute('readonly'));
      await inp.click();
      await inp.fill('');
      await inp.type(val, { delay: 25 });
      await page.keyboard.press('Enter');
      await page.waitForTimeout(350);
    };
    await setDate('开始时间', CFG.START);
    await setDate('结束时间', CFG.END);
    await page.evaluate(() => document.body.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(e => /搜\s*索|查\s*询/.test(e.innerText) && e.offsetParent !== null);
      if (b) b.click();
    });
    await page.waitForTimeout(3000);
  }

  // --- 3. 页容量拉到 100 ---
  const sel = page.locator('.el-pagination__sizes .el-input, .el-pagination .el-select').first();
  if (await sel.count()) {
    await sel.click();
    await page.waitForTimeout(700);
    const li = page.locator('.el-select-dropdown__item').filter({ hasText: /100/ }).first();
    if (await li.count()) { await li.click(); await page.waitForTimeout(2600); }
  }

  // --- 4. 翻页收全 ---
  const parse = () => {
    const out = [];
    for (const b of caps) {
      try {
        const d = JSON.parse(b);
        if (d && Array.isArray(d.data)) out.push({ count: d.count, rows: d.data });
      } catch (e) {}
    }
    return out;
  };
  let got = parse();
  let total = got.length ? got[got.length - 1].count : 0;
  for (let p = 2; p <= Math.ceil(total / 100) && p <= 12; p++) {
    const li = page.locator('.el-pagination .el-pager li').filter({ hasText: new RegExp('^' + p + '$') }).first();
    if (!(await li.count())) break;
    await li.click();
    await page.waitForTimeout(2200);
  }
  got = parse();
  const seen = new Set();
  const rows = [];
  for (const g of got) for (const x of g.rows) if (!seen.has(x.id)) { seen.add(x.id); rows.push(x); }
  if (!rows.length) return JSON.stringify({ error: '未捕获到 rentOrder/list，检查是否已登录/是否在设备租赁页' });

  // --- 5. 归类：类别用设备管理映射 ---
  await clickText('设备管理');
  await page.waitForTimeout(2500);
  const sel2 = page.locator('.el-pagination__sizes .el-input, .el-pagination .el-select').first();
  if (await sel2.count()) {
    await sel2.click(); await page.waitForTimeout(600);
    const li = page.locator('.el-select-dropdown__item').filter({ hasText: /100/ }).first();
    if (await li.count()) { await li.click(); await page.waitForTimeout(2200); }
  }
  const goodsTxt = await page.evaluate(() => [...document.querySelectorAll('table tbody tr')]
    .filter(t => t.offsetParent !== null).map(t => t.innerText.replace(/\s+/g, ' ').trim()));
  const gmap = {};
  const stock = {};
  for (const line of goodsTxt) {
    const m = line.match(/^(.+?)\s+(鼠标垫|鼠标|键盘)\s+(\S+)\s+(\S+)\s+(\d+)\s/);
    if (m) { gmap[m[1]] = m[2]; stock[m[1]] = +m[5]; }
  }
  const cat = (x) => gmap[x.goodsName] || x.categoryName || '?';

  // --- 6. 统计 ---
  const hrs = (x) => x.returnTime
    ? (new Date(x.returnTime.replace(/-/g, '/')) - new Date(x.startTime.replace(/-/g, '/'))) / 3600000 : null;
  const agg = {};
  const orders = {};
  for (const x of rows) {
    const a = agg[x.goodsName] = agg[x.goodsName] || { n: 0, orders: new Set(), users: new Set(), h: 0, stock: stock[x.goodsName] || 0, cat: cat(x) };
    a.n++; a.orders.add(x.orderNo); a.users.add(x.realName || '(空)');
    const h = hrs(x); if (h) a.h += h;
    (orders[x.orderNo] = orders[x.orderNo] || []).push(x);
  }
  const closed = rows.filter(x => x.returnTime);
  const totalH = closed.reduce((s, x) => s + hrs(x), 0);
  const devTotal = Object.values(stock).reduce((s, v) => s + v, 0) + rows.filter(x => !x.returnTime).length;

  const rank = Object.entries(agg).sort((a, b) => b[1].n - a[1].n)
    .map(([name, a]) => ({ 设备: name, 类别: a.cat, 件次: a.n, 单: a.orders.size, 人: a.users.size, 累计h: Math.round(a.h * 10) / 10, 库存: a.stock }));

  const idle = Object.keys(stock).filter(k => !agg[k]);
  const tonight = rows.filter(x => !x.returnTime).map(x => ({
    编号: x.orderNo, 客人: x.realName || '(空)', 设备: x.goodsName,
    开租: x.startTime, 已租h: Math.round((Date.now() - new Date(x.startTime.replace(/-/g, '/'))) / 360000) / 10,
    费用: x.amount, 押金: x.deposit
  }));
  const noName = rows.filter(x => !(x.realName || '').trim()).length;
  const multi = Object.entries(orders).filter(([, xs]) => xs.filter(x => !x.returnTime).map(x => x.orderNo).length && xs.length >= 3).length;

  return JSON.stringify({
    抬头: { 模式: CFG.MODE === 'renting' ? '租赁中' : '已完成', 窗口: CFG.MODE === 'finished' ? CFG.START + ' ~ ' + CFG.END : '—', 抓取时间: new Date().toLocaleString('zh-CN') },
    汇总: {
      明细条数: rows.length, 接口count: total, 订单数: Object.keys(orders).length,
      在租件数: rows.filter(x => !x.returnTime).length,
      已归还件数: closed.length, 累计时长h: Math.round(totalH * 10) / 10,
      单均h: closed.length ? Math.round(totalH / Object.keys(orders).length * 10) / 10 : 0,
      收入: rows.reduce((s, x) => s + (+x.amount || 0), 0),
      押金: rows.reduce((s, x) => s + (+x.deposit || 0), 0),
      库存件数: Object.values(stock).reduce((s, v) => s + v, 0), 总设备数: devTotal,
      利用率估算: devTotal ? Math.round(totalH / (devTotal * 24 * 7) * 10000) / 100 + '%（按 7 天窗估）' : '—'
    },
    在租明细: tonight,
    设备排行: rank,
    零租借型号: idle,
    异常: [
      noName ? noName + ' 条客户名为空（未绑会员，丢件找不到人）' : null,
      rank.length && rank[0].库存 && rank[0].件次 > rank[0].库存 * 3 ? '主力款周转超过 3 倍，注意损耗' : null,
      rows.some(x => !x.returnTime && (Date.now() - new Date(x.startTime.replace(/-/g, '/'))) > 24 * 3600000) ? '存在超过 24 小时未归还的租赁' : null,
      rows.every(x => (+x.amount || 0) === 0) ? '全部订单金额为 0（租金未配价）' : null
    ].filter(Boolean)
  }, null, 1);
}
