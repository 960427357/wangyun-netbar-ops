async page => {
  // ================= 参数 =================
  const TITLE = '全体会员免费上网2小时';
  const CONTENT = '即日起到店，全体会员免费上网2小时，新老会员同享，无需任何消费。欢迎到店体验！';
  const START = '2026-10-31 14:00:00';
  const END = '2026-11-01 23:59:59';
  const DRY_RUN = true;
  // =======================================

  const log = [];
  await page.goto('https://wyb.5188cloud.net/netBarSummary/handOver', {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(2500);
  await page.goto('https://wyb.5188cloud.net/serviceManage/notice/promotion', {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(4500);
  if (page.url().includes('/login')) return 'FAIL: 未登录';

  // 关掉残留弹窗
  await page.evaluate(() => {
    const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
    ds.forEach(d => { const b = [...d.querySelectorAll('button')].find(x => /取\s*消|关\s*闭/.test(x.innerText)); if (b) b.click(); });
  });
  await page.waitForTimeout(700);

  await page.getByRole('button', {name: /添\s*加/}).first().click({force: true});
  await page.waitForTimeout(2500);
  const dlg = page.locator('.el-dialog:visible').last();

  // 标题
  await dlg.locator('input[placeholder="请输入标题"]').fill(TITLE);
  await page.waitForTimeout(300);

  // 状态开关：确保为开启
  const swBefore = await dlg.locator('.el-switch').first().getAttribute('class');
  if (!/is-checked/.test(swBefore || '')) {
    await dlg.locator('.el-switch').first().click({force: true});
    await page.waitForTimeout(600);
  }
  log.push({step: 'switch', before: /is-checked/.test(swBefore || ''), after: /is-checked/.test(await dlg.locator('.el-switch').first().getAttribute('class') || '')});

  // 时间：去掉只读直接打字（与通知页同一套办法）
  const setTime = async (ph, val) => {
    await page.evaluate(p => {
      const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
      const d = ds[ds.length - 1];
      const i = d && d.querySelector(`input[placeholder="${p}"]`);
      if (i) i.removeAttribute('readonly');
    }, ph);
    const inp = dlg.locator(`input[placeholder="${ph}"]`);
    await inp.click({force: true});
    await page.waitForTimeout(400);
    await inp.fill(val);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1200);
    return inp.inputValue();
  };
  const startVal = await setTime('选择展示开始时间', START);
  await dlg.locator('.el-dialog__title').click({force: true}).catch(() => {});
  await page.waitForTimeout(700);
  const endVal = await setTime('选择展示结束时间', END);
  await dlg.locator('.el-dialog__title').click({force: true}).catch(() => {});
  await page.waitForTimeout(700);
  log.push({step: 'times', startVal, endVal});

  // 内容：Quill 富文本
  const editor = dlg.locator('.ql-editor').first();
  await editor.click({force: true});
  await page.waitForTimeout(400);
  await page.keyboard.type(CONTENT, {delay: 12});
  await page.waitForTimeout(600);

  log.push({step: 'form', data: await page.evaluate(() => {
    const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
    const d = ds[ds.length - 1];
    if (!d) return 'dialog-gone';
    const q = p => { const e = d.querySelector(p); return e ? (e.value !== undefined ? e.value : e.innerText) : null; };
    return {
      title: q('input[placeholder="请输入标题"]'),
      start: q('input[placeholder="选择展示开始时间"]'),
      end: q('input[placeholder="选择展示结束时间"]'),
      switchOn: !!d.querySelector('.el-switch.is-checked'),
      editorText: (d.querySelector('.ql-editor') || {}).innerText,
      errors: [...d.querySelectorAll('.el-form-item__error')].map(e => e.innerText.trim()),
    };
  })});

  if (DRY_RUN) {
    await page.evaluate(() => {
      const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
      ds.forEach(d => { const b = [...d.querySelectorAll('button')].find(x => /取\s*消/.test(x.innerText)); if (b) b.click(); });
    });
    log.push({step: 'dryRun', msg: '未提交'});
    return JSON.stringify(log, null, 2);
  }

  // 确定
  const ok = await page.evaluate(() => {
    const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
    const d = ds[ds.length - 1];
    if (!d) return 'no-dialog';
    const b = [...d.querySelectorAll('button')].find(x => /确\s*定/.test(x.innerText));
    if (b) { b.click(); return 'clicked'; }
    return 'no-btn';
  });
  log.push({step: 'confirm', ok});
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
