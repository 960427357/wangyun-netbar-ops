/**
 * 只读：团购套餐销量排行（团购管理 → 上架管理）
 *
 * 用法：
 *   playwright-cli run-code --filename scripts/read-groupon-sales.js
 *
 * 输出：总销量、按销量降序的排行（含占比、团购价、适用人群、上架状态）。
 *
 * 🔴 三条口径（页面顶部原文）：
 *   1. 销量**仅统计上架到旺云商城**的销量，**不含美团**。
 *   2. 销量是**历史累计**，页面**没有任何时间筛选**——问「本月卖了多少」用这一页答不了。
 *   3. **下架了销量也不清零**。实测有「暂未上架任何平台」的套餐仍带 3 单销量。
 */
async (page) => {
  await page.goto('https://wyb.5188cloud.net/marketManage/groupManagement/publish',
    {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(8000);

  const all = [];
  const pages = [];

  for (let p = 1; p <= 20; p++) {
    const rows = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('.el-table thead th')]
        .map(e => e.innerText.trim());
      const idx = heads.indexOf('销量');
      return [...document.querySelectorAll('.el-table tbody tr')].map(r => {
        const td = [...r.querySelectorAll('td')].map(c => c.innerText.trim());
        if (td.length < 6) return null;
        const platRaw = td[3] || '';
        const priceMatch = platRaw.match(/￥\s*([\d.]+)/);
        return {
          name: td[1],
          content: td[2].replace(/\n/g, ' '),
          onShelf: /已上架/.test(platRaw),
          platforms: platRaw.split('\n')[0].trim(),
          price: priceMatch ? parseFloat(priceMatch[1]) : null,
          audience: td[4],
          sales: parseInt((td[idx] || '0').replace(/[^\d]/g, ''), 10) || 0,
        };
      }).filter(Boolean);
    });

    pages.push({p, n: rows.length});
    all.push(...rows);
    if (rows.length === 0) break;

    const next = page.locator('.el-pager li')
      .filter({hasText: new RegExp('^' + (p + 1) + '$')}).first();
    if (await next.count() === 0) break;
    await next.click({force: true});
    await page.waitForTimeout(2500);
  }

  const total = all.reduce((s, x) => s + x.sales, 0);
  const rank = [...all].sort((a, b) => b.sales - a.sales).map((x, i) => ({
    名次: i + 1,
    套餐: x.name,
    销量: x.sales,
    占比: total ? (x.sales / total * 100).toFixed(1) + '%' : '-',
    团购价: x.price === null ? '-' : '￥' + x.price,
    适用人群: x.audience,
    上架状态: x.onShelf ? '已上架' : '未上架',
  }));

  const zero = all.filter(x => x.sales === 0).map(x => x.name);
  const offShelfWithSales = all.filter(x => !x.onShelf && x.sales > 0)
    .map(x => `${x.name}（${x.sales}）`);
  const cheap = all.filter(x => x.sales > 0 && x.price !== null && x.price <= 0.01)
    .map(x => x.name);

  return JSON.stringify({
    口径: '仅旺云商城，不含美团；历史累计，无时间筛选；下架不清零',
    套餐数: all.length,
    总销量: total,
    排行: rank,
    异常: {
      零销量: zero,
      未上架却有销量: offShelfWithSales,
      '有销量但团购价≤￥0.01（疑似测试价）': cheap,
    },
    翻页: pages,
  }, null, 1);
}
