async page => {
  // 只读：核销管理 → 团购券设置（/marketManage/verificationManagement/groupSet）
  // 先切 100 条/页再读全量，输出 TSV：名称 | 平台 | 状态 | 身份限制 | 单人核销 | 使用时间 | 团购内容
  if (!/groupSet/.test(page.url())) {
    await page.goto('https://wyb.5188cloud.net/marketManage/verificationManagement/groupSet', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000);
  }
  const switchPageSize = async () => {
    const done = await page.evaluate(() => {
      const vis = e => e && e.offsetParent !== null;
      const w = [...document.querySelectorAll('.el-pagination .el-select__wrapper')].filter(vis)[0];
      if (!w) return 'NO PAGER';
      if (/100/.test(w.innerText)) return 'ALREADY 100';
      w.click();
      return 'clicked';
    });
    if (done === 'ALREADY 100') return done;
    await page.waitForTimeout(900);
    const picked = await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const hit = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.offsetParent !== null).find(e => n(e.innerText) === '100条/页');
      if (!hit) return 'NO OPTION';
      hit.click();
      return 'ok';
    });
    await page.waitForTimeout(2600);
    return done + '/' + picked;
  };
  const pager = await switchPageSize();

  const data = await page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    const total = n((document.querySelector('.el-pagination__total') || {}).innerText);
    const rows = [...document.querySelectorAll('.el-table__body tbody tr')].filter(vis).map(tr =>
      [...tr.querySelectorAll('td')].map(td => n(td.innerText))
    );
    return { total, rows };
  });

  const out = ['pager=' + pager, data.total];
  data.rows.forEach((r, i) => {
    const cells = r.slice(0, 7);
    out.push([i + 1, ...cells].join(' | '));
  });
  return out.join('\n');
}
