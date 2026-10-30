// 旺云商户端 · 团购券一条龙：建套餐 → 上架到平台（一次 run-code 跑完）
// 前置：浏览器已常驻（见 SKILL.md §一），无需本脚本自己 open
//   playwright-cli run-code --filename scripts/create-publish-groupon.js
//
// 与 create-groupon + publish-groupon 两个脚本等价，但**共享同一次页面加载**，
// 少两次重登/重载，适合「做一个券并上架」这类一次性任务。

async page => {
  const NAME = '9.9元享30元网费';        // 套餐名（把价格写进名字）
  const CASH = '9.9';                    // 现金网费 = 实付
  const GIFT = '20.1';                   // 赠送网费 = 券面额 - 实付
  const AUDIENCE = '新会员';              // 所有用户 | 新会员 | 老会员
  const IMG = 'C:/Users/96042/WorkBuddy/2026-10-29-21-57-56/团购券-9.9元享30元网费/groupon-9.9-30.png';
  const PLATFORM = '旺云商城';            // 旺云商城 | 美团
  const MARKET = '30';                   // 门市价格 = 券面额
  const PRICE = '9.9';                   // 团购价格 = 实付
  const STOCK = '9999';                  // 店规：一律 9999
  const DRY_RUN = false;

  const log = [];
  const net = [];
  page.on('response', r => {
    if (r.request().method() !== 'GET' && r.url().includes('5188cloud')) {
      net.push({url: r.url().replace('https://wyb.5188cloud.net', ''), status: r.status()});
    }
  });

  const closeAll = async () => {
    await page.evaluate(() => {
      document.querySelectorAll('.el-drawer__close-btn, .el-dialog__headerbtn').forEach(b => b.click());
    });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(600);
  };
  const go = async (u, ms = 4500) => {
    await page.goto(u, {waitUntil: 'domcontentloaded'});
    await page.waitForTimeout(ms);
  };

  // 复用已加载页面：页内路由跳转比整页重载快得多
  const navInApp = async (path, ms = 3500) => {
    const done = await page.evaluate(p => {
      const cur = location.pathname;
      if (cur === p) return false;
      history.pushState({}, '', p);
      window.dispatchEvent(new PopStateEvent('popstate', {state: {}}));
      return true;
    }, path).catch(() => false);
    if (done) await page.waitForTimeout(ms);
    return done && page.url().endsWith(path);
  };

  await closeAll();
  if (!page.url().includes('5188cloud')) {
    await go('https://wyb.5188cloud.net/netBarSummary/handOver', 3000);
  }
  if (page.url().includes('/login')) return 'FAIL: 未登录，请手动登录后再跑';

  // ── 1. 建套餐 ─────────────────────────────────────────────
  const okNav = await navInApp('/marketManage/groupManagement/group');
  if (!okNav) await go('https://wyb.5188cloud.net/marketManage/groupManagement/group');
  log.push({step: 'openGroupPage', fastNav: okNav});

  await page.getByRole('button', {name: /新\s*增/}).first().click({force: true});
  await page.waitForTimeout(2200);
  const dlg = page.locator('.el-dialog:visible').last();

  await dlg.locator('input[placeholder="请输入 套餐名称"]').fill(NAME);
  await dlg.locator('input[type="file"]').first().setInputFiles(IMG);
  await page.waitForTimeout(3200);              // 等图片上传返回
  await dlg.locator('input[placeholder="现金"]').fill(CASH);
  await page.waitForTimeout(250);
  const nums = dlg.locator('input[type="number"]');
  const cnt = await nums.count();
  for (let i = 0; i < cnt; i++) {
    if ((await nums.nth(i).getAttribute('placeholder')) === '请输入') { await nums.nth(i).fill(GIFT); break; }
  }
  await page.waitForTimeout(400);

  if (AUDIENCE !== '所有用户') {
    await dlg.evaluate((el, want) => {
      const fi = [...el.querySelectorAll('.el-form-item')].find(x =>
        ((x.querySelector('.el-form-item__label') || {}).innerText || '').replace(/\s+/g, '') === '使用限制：');
      if (!fi) return;
      const r = [...fi.querySelectorAll('.el-radio')].find(x => x.innerText.trim() === want);
      if (r) (r.querySelector('input') || r).click();
    }, AUDIENCE);
    await page.waitForTimeout(400);
  }
  log.push({step: 'filled', nums: await nums.evaluateAll(e => e.map(x => x.value)), audience: AUDIENCE});

  if (DRY_RUN) { log.push({dryRun: true}); return JSON.stringify(log, null, 2); }

  await dlg.getByRole('button', {name: /保\s*存|确\s*认/}).last().click({force: true})
    .catch(async () => {
      await page.evaluate(() => {
        const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
        const d = ds[ds.length - 1];
        const b = [...d.querySelectorAll('button')].find(x => /保\s*存|确\s*认/.test(x.innerText));
        if (b) b.click();
      });
    });
  await page.waitForTimeout(4000);
  log.push({step: 'saved', msg: await page.evaluate(() =>
    [...document.querySelectorAll('.el-message')].map(e => e.innerText.trim()).filter(Boolean).join(' | '))});
  log.push({step: 'listHasNew', created: await page.evaluate(n => {
    const tr = [...document.querySelectorAll('.el-table__body-wrapper tbody tr')].find(x => x.innerText.includes(n));
    return tr ? tr.innerText.replace(/\s+/g, ' ').trim() : null;
  }, NAME)});

  // ── 2. 上架 ──────────────────────────────────────────────
  const waitPlatformRows = async (maxMs = 25000) => {
    let waited = 0, c = 0;
    while (waited < maxMs) {
      await page.waitForTimeout(2500); waited += 2500;
      c = await page.evaluate(() => {
        const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
        const d = ds[ds.length - 1];
        return d ? d.querySelectorAll('.el-table__body-wrapper tbody tr').length : 0;
      });
      if (c > 0) break;
    }
    return c;
  };

  const openDrawer = async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const fast = await navInApp('/marketManage/groupManagement/publish', 4000);
      if (!fast) await go('https://wyb.5188cloud.net/marketManage/groupManagement/publish', 5000);
      for (let w = 0; w < 10; w++) {
        if (await page.locator('.el-table__body-wrapper tbody tr').count()) break;
        await page.waitForTimeout(1500);
      }
      const rows = page.locator('.el-table__body-wrapper tbody tr');
      const n = await rows.count();
      let idx = -1;
      for (let i = 0; i < n; i++) { if ((await rows.nth(i).innerText()).includes(NAME)) { idx = i; break; } }
      if (idx < 0) { log.push({attempt, err: 'row-not-found', n}); continue; }

      await rows.nth(idx).getByRole('button', {name: /上\/下架/}).click({force: true});
      const c = await waitPlatformRows();
      log.push({attempt, platformRows: c, fastNav: fast});
      if (!c) { await closeAll(); continue; }   // 平台空表：整页重载再来

      const clicked = await page.evaluate(p => {
        const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
        const d = ds[ds.length - 1];
        const tr = [...d.querySelectorAll('.el-table__body-wrapper tbody tr')].find(t => t.innerText.includes(p));
        if (!tr) return false;
        const b = [...tr.querySelectorAll('button')].find(x => /上\s*架/.test(x.innerText));
        if (b) { b.click(); return true; }
        return false;
      }, PLATFORM);
      if (!clicked) { log.push({attempt, err: 'no-upload-btn'}); await closeAll(); continue; }
      await page.waitForTimeout(3500);
      return true;
    }
    return false;
  };

  if (!(await openDrawer())) return JSON.stringify({log, err: 'openDrawer failed'}, null, 2);

  const drawer = page.locator('.el-drawer:visible').last();
  await drawer.locator('input[placeholder="请输入 门市价格"]').fill(MARKET);
  await page.waitForTimeout(200);
  await drawer.locator('input[placeholder="请输入 团购价格"]').fill(PRICE);
  await page.waitForTimeout(200);
  await drawer.locator('input[placeholder="请输入 库存数量"]').fill(STOCK);
  await page.waitForTimeout(400);

  await drawer.locator('button').filter({hasText: /上\s*架/}).last().click();
  await page.waitForTimeout(1800);
  log.push({confirmBox: await page.evaluate(() => {
    const bs = [...document.querySelectorAll('.el-message-box')].filter(b => b.offsetParent !== null);
    const b = bs[bs.length - 1];
    return b ? [...b.querySelectorAll('button')].map(x => x.innerText.replace(/\s+/g, '')).filter(Boolean) : null;
  })});

  // 确认框按钮是「提交」，不是「确定」
  const submit = page.locator('.el-message-box').filter({visible: true})
                       .locator('button').filter({hasText: /提\s*交/}).last();
  if (await submit.count()) await submit.click();
  else await page.evaluate(() => {
    const bs = [...document.querySelectorAll('.el-message-box')].filter(b => b.offsetParent !== null);
    const b = bs[bs.length - 1];
    if (b) { const x = [...b.querySelectorAll('button')].find(y => /提\s*交/.test(y.innerText)); if (x) x.click(); }
  });
  await page.waitForTimeout(4500);
  log.push({net: net.slice(-4)});

  // ── 3. 复核 ──────────────────────────────────────────────
  await closeAll();
  await go('https://wyb.5188cloud.net/marketManage/groupManagement/publish', 5000);
  log.push({finalRow: await page.evaluate(n => {
    const tr = [...document.querySelectorAll('.el-table__body-wrapper tbody tr')].find(x => x.innerText.includes(n));
    return tr ? tr.innerText.replace(/\s+/g, ' ').trim() : null;
  }, NAME)});
  await page.screenshot({path: 'groupon-publish-result.png'});
  return JSON.stringify(log, null, 2);
}
