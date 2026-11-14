// 只读探针 2：用 waitForResponse 精确抓「分批到账记录」接口的响应体
// 结论用途：分清是「服务端返回 0 条」还是「前端没渲染」
async page => {
  const BASE = 'https://wyb.5188cloud.net/admin/systemSetting/netbarConfig/recharge';
  const URLRE = /rechargeBatchStrategy\/page/;

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  const clickRadio = async name => page.evaluate(t => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    const el = [...document.querySelectorAll('.el-radio-button')].filter(v).find(x => nn(x.innerText) === t);
    if (!el) return 'NO';
    (el.querySelector('.el-radio-button__inner') || el).click();
    return 'ok';
  }, name);

  // 点「分批到账记录」并等这一次响应
  const waitRec = page.waitForResponse(r => URLRE.test(r.url()), { timeout: 20000 }).catch(e => null);
  const s1 = await clickRadio('分批到账记录');
  const resp1 = await waitRec;
  let body1 = null, status1 = null;
  if (resp1) {
    status1 = resp1.status();
    try { body1 = (await resp1.text()).slice(0, 2000); } catch (e) { body1 = '(read fail: ' + e.message + ')'; }
  }
  await page.waitForTimeout(1500);

  // 再点「搜索」，看第二次响应的 count 是否变化
  const waitSearch = page.waitForResponse(r => URLRE.test(r.url()), { timeout: 15000 }).catch(e => null);
  const searched = await page.evaluate(() => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    const b = [...document.querySelectorAll('button')].filter(v).find(x => /^搜\s*索$/.test(nn(x.innerText)));
    if (!b) return 'NO';
    b.click();
    return 'ok';
  });
  const resp2 = await waitSearch;
  let body2 = null, status2 = null;
  if (resp2) {
    status2 = resp2.status();
    try { body2 = (await resp2.text()).slice(0, 2000); } catch (e) { body2 = '(read fail: ' + e.message + ')'; }
  }
  await page.waitForTimeout(1000);

  const dom = await page.evaluate(() => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    return {
      activeRadio: nn((document.querySelector('.el-radio-button.is-active') || {}).innerText),
      rowCount: [...document.querySelectorAll('.el-table__body tbody tr')].filter(v).length,
      empty: nn((document.querySelector('.el-table__empty-text') || {}).innerText),
      total: nn((document.querySelector('.el-pagination__total') || {}).innerText),
    };
  });

  return JSON.stringify({ s1, searched, status1, body1, status2, body2, dom }, null, 2);
}
