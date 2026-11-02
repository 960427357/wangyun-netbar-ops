/**
 * 只读：团购券全量盘点 + 校验 + 待人工处理清单
 * （核销管理 → 团购券设置 /marketManage/verificationManagement/groupSet）
 *
 * 用法：
 *   playwright-cli run-code --filename scripts/audit-groupon-coupons.js
 *
 * 干什么：
 *   1. 进页后**先把页容量切到 100 条/页**（列表默认 10 条/页，只读第一页必漏）。
 *      切完回读页码区，从 1 2 3 收缩成 1 才算切上（页容量不记忆，每次进页都要切）。
 *   2. 一页读完，按四类分桶：网费 / 包时 / 福袋 / 其他。
 *   3. 网费券跑校验式：现金 == 实付 且 现金 + 赠送 == 券面。
 *   4. 输出「待人工处理」清单（包时 + 福袋），逐条列名并写清卡在哪。
 *
 * 为什么要有第 4 步：
 *   包时券本轮不绑，但它的「团购内容」同样为空。不列名，事后分不清「故意跳过」和「漏绑」，
 *   下次巡检还得重新扫一遍才发现。跳过必须留痕。
 *
 * 只读：不点编辑、不保存、不同步。
 */
async (page) => {
  await page.goto('https://wyb.5188cloud.net/marketManage/verificationManagement/groupSet',
    {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(4500);

  const place = await page.evaluate(() =>
    document.querySelector('.el-header')
      ? document.querySelector('.el-header').innerText.replace(/\s+/g, ' ').trim().slice(0, 40)
      : '(no header)');

  // --- 1. 切页容量到 100 ---
  const readPag = () => page.evaluate(() => {
    const vis = el => el && el.getBoundingClientRect().height > 0;
    const p = [...document.querySelectorAll('.el-pagination')].filter(vis).pop();
    return {
      pag: p ? p.innerText.replace(/\s+/g, ' ').trim() : '(no pagination)',
      rows: [...document.querySelectorAll('.el-table__body tbody tr')].filter(vis).length,
    };
  });

  const before = await readPag();
  let switched = false;
  if (await page.locator('.el-pagination__sizes').count()) {
    await page.locator('.el-pagination__sizes').last().click();
    await page.waitForTimeout(800);
    await page.locator('.el-select-dropdown__item')
      .filter({ hasText: /^100条\/页$/ }).last().click();
    await page.waitForTimeout(2300);
    switched = true;
  }
  const after = await readPag();

  // --- 2. 读全量 ---
  const rows = await page.evaluate(() => {
    const vis = el => el && el.getBoundingClientRect().height > 0;
    return [...document.querySelectorAll('.el-table__body tbody tr')].filter(vis)
      .map(r => [...r.querySelectorAll('td')].map(td => td.innerText.replace(/\s+/g, ' ').trim()));
  });

  // --- 3. 分类 ---
  const PACK = /小时|通宵|包夜|早鸟|畅玩|大厅套餐|单人包|双人包|五人包|专场卡/;
  const NAME_PRICE = /(\d+(?:\.\d+)?)\s*元?\s*(?:抢|抵|享|得)\s*(\d+(?:\.\d+)?)/;
  const CONTENT = /(\d+(?:\.\d+)?)元现金网费\+(\d+(?:\.\d+)?)元赠送网费/;

  const buckets = { 网费: [], 包时: [], 福袋: [], 其他: [] };
  for (const r of rows) {
    const [name, plat, , limit, , , content] = r;
    const item = { name, plat, limit, content: content || '' };
    if (PACK.test(name)) { buckets.包时.push(item); continue; }
    if (/福袋/.test(name)) { buckets.福袋.push(item); continue; }
    if (NAME_PRICE.test(name)) { buckets.网费.push(item); continue; }
    buckets.其他.push(item);
  }

  // --- 4. 网费券校验 ---
  const 网费明细 = buckets.网费.map(it => {
    const n = it.name.match(NAME_PRICE);
    const c = it.content.match(CONTENT);
    if (!it.content || it.content === '--') return { ...it, 结论: '内容为空，待绑' };
    if (!c) return { ...it, 结论: '内容格式异常，人工看' };
    const X = +n[1], Y = +n[2], C = +c[1], G = +c[2];
    const ok = Math.abs(C - X) < 0.005 && Math.abs(C + G - Y) < 0.005;
    return ok
      ? { ...it, 结论: 'OK' }
      : { ...it, 结论: `金额不符，现金 ${C} 应 ${X}，合计 ${+(C + G).toFixed(2)} 应 ${Y}` };
  });

  const 待人工 = [
    ...buckets.包时.map(it => ({
      券名: it.name, 平台: it.plat, 现有内容: it.content || '空',
      卡在哪: it.content ? '已绑（早先填过），需人工确认绑法是否符合当前口径' : '包时券，绑法待人工确认',
    })),
    ...buckets.福袋.map(it => ({
      券名: it.name, 平台: it.plat, 现有内容: it.content || '空',
      卡在哪: '福袋券名只有面值没有实付价，缺平台实际售价',
    })),
    ...网费明细.filter(x => x.结论 !== 'OK').map(x => ({
      券名: x.name, 平台: x.plat, 现有内容: x.content || '空', 卡在哪: x.结论,
    })),
  ];

  return {
    场所: place,
    页容量: { 切换前: before, 切换后: after, 切成功: switched && after.rows === before.rows ? '行数未变（可能本来就只有一页）' : '已切' },
    总数: rows.length,
    分类: { 网费: buckets.网费.length, 包时: buckets.包时.length, 福袋: buckets.福袋.length, 其他: buckets.其他.length },
    网费校验: {
      通过: 网费明细.filter(x => x.结论 === 'OK').length,
      有问题: 网费明细.filter(x => x.结论 !== 'OK'),
    },
    待人工处理: 待人工,
    提醒: 待人工.length
      ? `⚠️ 共 ${待人工.length} 条未处理，需人工确认。包时券定绑法、福袋券给售价。`
      : '无待处理项。',
  };
}
