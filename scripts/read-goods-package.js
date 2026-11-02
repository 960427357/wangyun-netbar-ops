/**
 * 只读：套餐管理列表
 * 路径：销售管理 → 商超管理 → 商品管理 → 套餐管理（/marketManage/goodsManage/shop/goodsPackage）
 *
 * 说明：
 * - 先读「共 N 条」和「X条/页」，装得下就直接读；N > X 才切 100 条/页（铁律 #12）。
 * - 列表的「图片」列要判 td 里有没有 img；「销售价」列 innerText 读不到值，
 *   需要准确价格请进「编辑」看回填（见 references/07-商品销售.md §2.5）。
 */
async page => {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();

  await page.goto('https://wyb.5188cloud.net/marketManage/goodsManage/shop/goodsPackage',
    {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(4500);

  const shop = await page.evaluate(() => {
    const skip = /^(管理员|超级管理员|店长|收银员|AI 旺.*|退出|退出登录|首页|消息|设置)$/;
    const all = [...document.querySelectorAll('.el-header *')]
      .map(e => (e.innerText || '').trim()).filter(Boolean);
    return [...new Set(all)].find(t => !skip.test(t) && t.length <= 40) || '';
  });

  const read = async () => page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const visible = el => el && el.offsetParent !== null;
    const heads = [...document.querySelectorAll('.el-table__header th')]
      .filter(th => visible(th)).map(th => norm(th.innerText)).filter(Boolean);
    const rows = [...document.querySelectorAll('.el-table__body tbody tr')]
      .filter(tr => visible(tr))
      .map(tr => [...tr.querySelectorAll('td')].map(td =>
        td.querySelector('img') ? '[图]' : norm(td.innerText)));
    const pager = norm((document.querySelector('.el-pagination') || {}).innerText);
    return {heads, rows, pager};
  });

  let data = await read();
  const m = (data.pager || '').match(/共\s*(\d+)\s*条/);
  const p = (data.pager || '').match(/(\d+)\s*条\/页/);
  const total = m ? +m[1] : null;
  const perPage = p ? +p[1] : 10;

  let note;
  if (total !== null && total > perPage) {
    note = `共 ${total} 条 > ${perPage} 条/页，切 100 条/页`;
    try {
      await page.locator('.el-pagination__sizes .el-select').first().click();
      await page.waitForTimeout(700);
      await page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
        .filter({hasText: /100/}).first().click();
      await page.waitForTimeout(2500);
      data = await read();
    } catch (e) {
      note += '（切页失败，按当前页读）';
    }
  } else {
    note = `共 ${total ?? '?'} 条 ≤ ${perPage} 条/页，不切页`;
  }

  const stats = await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const visible = el => el && el.offsetParent !== null;
    const rows = [...document.querySelectorAll('.el-table__body tbody tr')].filter(tr => visible(tr));
    const out = {total: rows.length, 普通套餐: 0, 自选套餐: 0, 有图: 0, 自助购买是: 0};
    rows.forEach(tr => {
      const tds = [...tr.querySelectorAll('td')].map(td => norm(td.innerText));
      const t = tds.join(' | ');
      if (t.includes('普通套餐')) out.普通套餐++;
      if (t.includes('自选套餐')) out.自选套餐++;
      if (tr.querySelector('td img')) out.有图++;
      if (tds[4] === '是') out.自助购买是++;   // 第 5 列 = 允许网民自助购买
    });
    return out;
  });

  return [
    `场所=${shop}`,
    note,
    `分页原文=${data.pager}`,
    `统计=${JSON.stringify(stats)}`,
    '',
    '列头=' + JSON.stringify(data.heads),
    '',
    ...data.rows.map((r, i) => `${String(i).padStart(2)} ${r.join(' | ')}`),
  ].join('\n');
}
