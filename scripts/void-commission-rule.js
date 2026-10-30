async page => {
  // ============================================================
  // 作废一条「当前规则」（提成规则）
  // 用法: playwright-cli run-code --filename scripts/void-commission-rule.js
  // CFG.name = 规则名称（精确匹配第一列）；CONFIRM=false 只点开确认框、不提交
  // 作废前会把整行参数打出来，便于日后还原
  // ============================================================
  const CFG = {name: '商品推销'};
  const CONFIRM = false;  // 默认只点开确认框不提交；确认要作废再改 true

  const URL = 'https://wyb.5188cloud.net/staffManage/staffCommission/currRules';
  const log = [];

  // 关掉可能残留的弹窗
  await page.evaluate(() => {
    [...document.querySelectorAll('.el-dialog')].filter(x => x.offsetParent !== null).forEach(d => {
      const b = [...d.querySelectorAll('button')].find(x => /取\s*消|关\s*闭/.test(x.innerText));
      b && b.click();
    });
  });
  await page.waitForTimeout(800);

  await page.goto(URL, {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(3000);
  if (page.url().includes('/login')) return 'FAIL: 登录态失效';

  // 找到目标行，先把参数记下来
  const before = await page.evaluate(n => {
    const tr = [...document.querySelectorAll('.el-table__body tr')]
      .find(t => ((t.querySelector('td') || {}).innerText || '').trim() === n);
    if (!tr) return null;
    const cells = [...tr.querySelectorAll('td')].map(td => (td.innerText || '').replace(/\s+/g, ' ').trim());
    const b = [...tr.querySelectorAll('button')].find(x => /作\s*废/.test(x.innerText));
    if (!b) return {cells, clicked: false};
    b.click();
    return {cells, clicked: true};
  }, CFG.name);

  if (!before) return `FAIL: 找不到规则「${CFG.name}」`;
  log.push(`作废前存档: ${JSON.stringify(before.cells)}`);
  if (!before.clicked) return 'FAIL: 该行没有「作废」按钮';

  await page.waitForTimeout(1600);

  // 抓确认框
  const box = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.el-message-box')].filter(x => x.offsetParent !== null).pop();
    if (!b) return null;
    return {
      text: (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      btns: [...b.querySelectorAll('button')].map(x => x.innerText.replace(/\s+/g, '')).filter(Boolean)
    };
  });
  log.push(`确认框: ${JSON.stringify(box)}`);

  if (!CONFIRM) return JSON.stringify({mode: 'DRY_RUN（未提交）', log}, null, 2);

  // 点确认按钮：文案可能是 确定 / 提交 / 确认
  const confirmed = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.el-message-box')].filter(x => x.offsetParent !== null).pop();
    if (!b) return 'no box';
    const btn = [...b.querySelectorAll('button')].find(x => /确\s*定|提\s*交|确\s*认/.test(x.innerText));
    if (!btn) return 'no confirm btn: ' + [...b.querySelectorAll('button')].map(x => x.innerText).join('/');
    btn.click();
    return 'clicked';
  });
  await page.waitForTimeout(2500);

  const after = await page.evaluate(n => ({
    msg: [...document.querySelectorAll('.el-message')].map(m => (m.innerText || '').trim()).filter(Boolean),
    rows: [...document.querySelectorAll('.el-table__body tr')].map(tr => (tr.querySelector('td') || {}).innerText.trim()),
    stillThere: [...document.querySelectorAll('.el-table__body tr')]
      .some(t => ((t.querySelector('td') || {}).innerText || '').trim() === n)
  }), CFG.name);

  return JSON.stringify({mode: 'CONFIRMED', log, confirmed, after}, null, 2);
}
