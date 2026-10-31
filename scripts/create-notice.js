async page => {
  // ================= 参数 =================
  const TITLE = '全体会员免费上网2小时';
  const CONTENT = '即日起到店，全体会员免费上网2小时，新老会员同享，无需任何消费。';
  const WHEN = '2026-10-31 14:00';     // 通知时间（精确到分）
  const MODE = 'save';                 // save=只保存(待提交) | submit=提交审核
  // =======================================

  const log = [];
  const closeDialogs = async () => {
    await page.evaluate(() => {
      const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
      ds.forEach(d => { const b = [...d.querySelectorAll('button')].find(x => /取\s*消|关\s*闭/.test(x.innerText)); if (b) b.click(); });
    });
    await page.waitForTimeout(600);
  };

  await page.goto('https://wyb.5188cloud.net/netBarSummary/handOver', {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(2500);
  await page.goto('https://wyb.5188cloud.net/serviceManage/notice/noticeRecord', {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(4000);
  if (page.url().includes('/login')) return 'FAIL: 未登录';
  await closeDialogs();

  await page.getByRole('button', {name: /新\s*增/}).first().click({force: true});
  await page.waitForTimeout(2200);
  const dlg = page.locator('.el-dialog:visible').last();

  await dlg.locator('input[placeholder="请输入 标题"]').fill(TITLE);
  await dlg.locator('textarea').first().fill(CONTENT);

  // 通知时间：去掉 readonly 后直接打字（实测唯一可靠的方式，时间轴点选不落值）
  const ti = dlg.locator('input[placeholder="选择 通知时间"]');
  await page.evaluate(() => {
    const i = document.querySelector('.el-dialog input[placeholder="选择 通知时间"]');
    if (i) i.removeAttribute('readonly');
  });
  await ti.click({force: true});
  await page.waitForTimeout(500);
  await ti.fill(WHEN);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  // 收起日期面板：点弹窗标题（用 Esc 会把整个弹窗关掉）
  await dlg.locator('.el-dialog__title').click({force: true}).catch(() => {});
  await page.waitForTimeout(800);

  log.push({step: 'filled', data: await page.evaluate(() => {
    const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
    const d = ds[ds.length - 1];
    if (!d) return 'dialog-gone';
    return {
      title: (d.querySelector('input[placeholder="请输入 标题"]') || {}).value,
      content: (d.querySelector('textarea') || {}).value,
      time: (d.querySelector('input[placeholder="选择 通知时间"]') || {}).value,
      errors: [...d.querySelectorAll('.el-form-item__error')].map(e => e.innerText.trim()),
    };
  })});

  const btnText = MODE === 'submit' ? '保存并提交审核' : '保 存';
  const clicked = await page.evaluate(t => {
    const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
    const d = ds[ds.length - 1];
    const b = [...d.querySelectorAll('button')].find(x => x.innerText.replace(/\s+/g, '') === t.replace(/\s+/g, ''));
    if (b) { b.click(); return 'clicked'; }
    return 'no-btn';
  }, btnText);
  log.push({step: 'submit', btn: btnText, clicked});
  await page.waitForTimeout(4000);

  log.push({step: 'msg', text: await page.evaluate(() =>
    [...document.querySelectorAll('.el-message, .el-form-item__error')].map(e => e.innerText.trim()).join(' | '))});

  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(4500);
  log.push({step: 'rows', data: await page.evaluate(() =>
    [...document.querySelectorAll('.el-table__body-wrapper tbody tr')].map(tr =>
      [...tr.querySelectorAll('td')].map(td => td.innerText.replace(/\s+/g, ' ').trim())))});

  return JSON.stringify(log, null, 2);
}
