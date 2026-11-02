/**
 * 只读：商品管理列表的价格列（切 100 条/页 一次读完）
 */
async page => {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();

  await page.goto('https://wyb.5188cloud.net/marketManage/goodsManage/shop/goods',
    {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(4500);

  // 切 100 条/页（铁律 #12：每次进页都要切）
  try {
    await page.locator('.el-pagination__sizes .el-select').first().click();
    await page.waitForTimeout(600);
    await page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({hasText: /100/}).first().click();
    await page.waitForTimeout(2500);
  } catch (e) {
    // 没切成功就按 10 条读
  }

  const data = await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const heads = [...document.querySelectorAll('.el-table__header th')]
      .filter(th => th.offsetParent !== null).map(th => norm(th.innerText)).filter(Boolean);
    const rows = [...document.querySelectorAll('.el-table__body tbody tr')].filter(tr => tr.offsetParent !== null);
    const cells = rows.map(tr => [...tr.querySelectorAll('td')].map(td => {
      const inp = td.querySelector('input');
      return inp ? `[${inp.value}]` : norm(td.innerText);
    }));
    const pager = norm((document.querySelector('.el-pagination') || {}).innerText);
    return {heads, count: rows.length, cells, pager};
  });

  return [
    `列头=${JSON.stringify(data.heads)}`,
    `行数=${data.count}  分页=${data.pager}`,
    '',
    ...data.cells.slice(0, 45).map((c, i) => `${String(i).padStart(2)} ${c.join(' | ')}`),
  ].join('\n');
}
