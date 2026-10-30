// 旺云商户端 · 团购套餐「推荐 / 热门」标记（上架管理列表行内）
// 用法：改 TARGET / ACTION → playwright-cli run-code --filename scripts/set-recommend-hot.js
// 前置：浏览器需已后台常驻（见 SKILL.md §一），本脚本不自己 open
//
// 语义：这两个是平台侧运营位，只对已上架旺云商城的套餐有意义。
// 「设为推荐」点击后立即落库（POST listInfo/setRecommended），无确认框；
// 点成功后同一位置文案变成「取消推荐」，这就是成功标志。

async page => {
  const TARGET = '9.9元享30元网费';   // 套餐名
  const ACTION = 'both';              // recommend | hot | both | none（none=**取消**两者，会改数据）

  const out = {steps: [], net: []};
  page.on('response', r => {
    if (r.request().method() !== 'GET' && r.url().includes('5188cloud')) {
      out.net.push({url: r.url().replace('https://wyb.5188cloud.net', ''), status: r.status()});
    }
  });

  const closeAll = async () => {
    await page.evaluate(() => {
      document.querySelectorAll('.el-drawer__close-btn, .el-dialog__headerbtn').forEach(b => b.click());
    });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(600);
  };

  // 点击后列表会整体刷新，行会短暂消失；读不到就轮询等它回来
  const waitRow = async (maxMs = 9000) => {
    let waited = 0;
    while (waited < maxMs) {
      const t = await page.evaluate(n => {
        const tr = [...document.querySelectorAll('.el-table__body-wrapper tbody tr')].find(x => x.innerText.includes(n));
        return tr ? tr.innerText.replace(/\s+/g, ' ').trim() : null;
      }, TARGET);
      if (t) return t;
      await page.waitForTimeout(1000);
      waited += 1000;
    }
    return null;
  };

  const readRow = async () => page.evaluate(t => {
    const tr = [...document.querySelectorAll('.el-table__body-wrapper tbody tr')].find(x => x.innerText.includes(t));
    return tr ? tr.innerText.replace(/\s+/g, ' ').trim() : null;
  }, TARGET);

  await closeAll();
  const URL = 'https://wyb.5188cloud.net/marketManage/groupManagement/publish';
  if (!page.url().includes('/marketManage/groupManagement/publish')) {
    await page.goto(URL, {waitUntil: 'domcontentloaded'});
    await page.waitForTimeout(5000);
  }
  if (page.url().includes('/login')) return 'FAIL: 未登录';

  for (let w = 0; w < 10; w++) {
    if (await page.locator('.el-table__body-wrapper tbody tr').count()) break;
    await page.waitForTimeout(1500);
  }
  out.steps.push({before: await readRow()});

  // 在目标行内点某个文案；文案不存在说明当前已是目标状态
  const clickInRow = async (label) => {
    const rows = page.locator('.el-table__body-wrapper tbody tr');
    const n = await rows.count();
    for (let i = 0; i < n; i++) {
      if (!(await rows.nth(i).innerText()).includes(TARGET)) continue;
      const el = rows.nth(i).locator(`text="${label}"`).first();
      if (await el.count()) { await el.click({force: true}); return 'clicked'; }
      return 'already';
    }
    return 'row-not-found';
  };

  if (ACTION === 'none') out.steps.push({warn: 'ACTION=none 会取消推荐/热门，属于写操作'});

  const want = ACTION === 'both' ? ['设为推荐', '设为热门']
             : ACTION === 'recommend' ? ['设为推荐']
             : ACTION === 'hot' ? ['设为热门']
             : ['取消推荐', '取消热门'];

  for (const label of want) {
    const r = await clickInRow(label);
    out.steps.push({click: label, r});
    if (r === 'clicked') await page.waitForTimeout(1200);
    out.steps.push({row: await waitRow()});
  }

  out.steps.push({msg: await page.evaluate(() =>
    [...document.querySelectorAll('.el-message')].map(e => e.innerText.trim()).filter(Boolean).join(' | '))});
  out.steps.push({net: out.net.slice(-6)});

  // 刷新复核，确认不是前端假状态
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(5000);
  out.steps.push({afterReload: await readRow()});
  await page.screenshot({path: 'recommend-hot-result.png'});
  return JSON.stringify(out, null, 2);
}
