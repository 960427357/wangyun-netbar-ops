async page => {
  // 同步线上数据并回读：抓 synProduct 接口 + 列表，输出 TSV
  const B = 'https://wyb.5188cloud.net';
  const log = [];
  let api = null;
  const onResp = async r => {
    if (!/thirdCoupon\/synProduct/.test(r.url())) return;
    try {
      const t = await r.text();
      api = { url: r.url().replace(B, ''), status: r.status(), body: t.slice(0, 300) };
    } catch (e) { api = { err: String(e).slice(0, 80) }; }
  };
  page.on('response', onResp);

  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.avue-crud__right span.syncbtn')].pop();
    if (!b) return 'NO SYNCBTN';
    b.click();
    return 'clicked';
  });
  log.push('click=' + clicked);

  // 等接口返回（最多 20 秒）
  for (let i = 0; i < 40 && !api; i++) await page.waitForTimeout(500);
  page.off('response', onResp);
  log.push('api=' + JSON.stringify(api));

  // toast（同步成功）
  const toast = await page.evaluate(() => [...document.querySelectorAll('.el-message')].map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()));
  log.push('toast=' + JSON.stringify(toast));

  await page.waitForTimeout(2500);

  // 确保 100 条/页
  await page.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    const w = [...document.querySelectorAll('.el-pagination .el-select__wrapper')].filter(vis)[0];
    if (w && !/100/.test(w.innerText)) w.click();
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const hit = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.offsetParent !== null).find(e => n(e.innerText) === '100条/页');
    if (hit) hit.click();
  });
  await page.waitForTimeout(2600);

  const data = await page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    return {
      total: n((document.querySelector('.el-pagination__total') || {}).innerText),
      rows: [...document.querySelectorAll('.el-table__body tbody tr')].filter(vis).map(tr =>
        [...tr.querySelectorAll('td')].map(td => n(td.innerText)).slice(0, 7)
      ),
    };
  });
  log.push(data.total);
  data.rows.forEach((r, i) => log.push([i + 1, ...r].join(' | ')));
  return log.join('\n');
}
