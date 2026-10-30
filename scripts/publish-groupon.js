// 旺云商户端 · 团购套餐上架到指定平台（默认旺云商城）
// 用法：改下面 5 个常量 → playwright-cli open --browser=msedge --headed --persistent
//       → playwright-cli run-code --filename scripts/publish-groupon.js
//
// 前置：套餐必须已在「团购管理 → 团购套餐」里建好（见 .create-groupon / 文档 12）。
// 本脚本只做「上架」，不改套餐内容。DRY_RUN=true 只填不提交。

async page => {
  const TARGET = '69元享120元网费';  // 套餐名称，必须在列表里能搜到
  const PLATFORM = '旺云商城';        // 上架到哪个平台行：旺云商城 | 美团
  const MARKET = '120';              // 门市价格 = 券面价值（用户说「享受 120 网费」就填 120）
  const PRICE = '69';                // 团购价格 = 用户实付
  const STOCK = '9999';              // 库存：店规一律 9999，不要自拟
  const DRY_RUN = false;

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
    await page.waitForTimeout(700);
  };

  const waitPlatformRows = async (maxMs = 25000) => {
    let waited = 0, c = 0;
    while (waited < maxMs) {
      await page.waitForTimeout(2500);
      waited += 2500;
      c = await page.evaluate(() => {
        const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
        const d = ds[ds.length - 1];
        return d ? d.querySelectorAll('.el-table__body-wrapper tbody tr').length : 0;
      });
      if (c > 0) break;
    }
    return {count: c, waited};
  };

  // 打开「上/下架」→ 点平台行「上架」→ 拿到抽屉。平台列表偶发空白，必须重试并整页重载
  const openDrawer = async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      await page.goto('https://wyb.5188cloud.net/marketManage/groupManagement/publish',
                      {waitUntil: 'domcontentloaded'});
      await page.waitForTimeout(5000);
      if (page.url().includes('/login')) return {err: 'login'};

      for (let w = 0; w < 10; w++) {
        if (await page.locator('.el-table__body-wrapper tbody tr').count()) break;
        await page.waitForTimeout(1500);
      }
      const rows = page.locator('.el-table__body-wrapper tbody tr');
      const n = await rows.count();
      let idx = -1;
      for (let i = 0; i < n; i++) {
        if ((await rows.nth(i).innerText()).includes(TARGET)) { idx = i; break; }
      }
      if (idx < 0) { out.steps.push({attempt, err: 'row-not-found', n}); continue; }
      out.steps.push({attempt, idx});

      await rows.nth(idx).getByRole('button', {name: /上\/下架/}).click({force: true});
      const wait = await waitPlatformRows();
      out.steps.push({attempt, platformRows: wait.count, waitedMs: wait.waited});
      if (!wait.count) { await closeAll(); continue; }   // 空表：重载再来

      const clicked = await page.evaluate(p => {
        const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
        const d = ds[ds.length - 1];
        const tr = [...d.querySelectorAll('.el-table__body-wrapper tbody tr')].find(t => t.innerText.includes(p));
        if (!tr) return false;
        const b = [...tr.querySelectorAll('button')].find(x => /上\s*架/.test(x.innerText));
        if (b) { b.click(); return true; }
        return false;
      }, PLATFORM);
      if (!clicked) { out.steps.push({attempt, err: 'no-upload-btn'}); await closeAll(); continue; }

      await page.waitForTimeout(4000);
      return {ok: true, attempt};
    }
    return {err: 'gave-up'};
  };

  await closeAll();
  // 预热：新 session 直接 goto 深链会被守卫回落，先落首页
  await page.goto('https://wyb.5188cloud.net/netBarSummary/handOver', {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(3000);

  const opened = await openDrawer();
  out.steps.push({open: opened});
  if (!opened.ok) return JSON.stringify(out, null, 2);

  const drawer = page.locator('.el-drawer:visible').last();
  await drawer.locator('input[placeholder="请输入 门市价格"]').fill(MARKET);
  await page.waitForTimeout(200);
  await drawer.locator('input[placeholder="请输入 团购价格"]').fill(PRICE);
  await page.waitForTimeout(200);
  await drawer.locator('input[placeholder="请输入 库存数量"]').fill(STOCK);
  await page.waitForTimeout(500);

  out.steps.push({filled: await page.evaluate(() => {
    const ds = [...document.querySelectorAll('.el-drawer')].filter(d => d.offsetParent !== null);
    return [...ds[ds.length - 1].querySelectorAll('input')].map(i => i.value);
  })});

  if (DRY_RUN) { out.steps.push({dryRun: true}); return JSON.stringify(out, null, 2); }

  // 第 1 步：抽屉底部「上 架」
  await drawer.locator('button').filter({hasText: /上\s*架/}).last().click();
  await page.waitForTimeout(2000);

  // 第 2 步：确认框按钮是「提交」，不是「确定」——这一条最容易卡住
  out.steps.push({confirmBox: await page.evaluate(() => {
    const bs = [...document.querySelectorAll('.el-message-box')].filter(b => b.offsetParent !== null);
    const b = bs[bs.length - 1];
    return b ? {text: b.innerText.replace(/\s+/g, ' ').trim().slice(0, 100),
                buttons: [...b.querySelectorAll('button')].map(x => x.innerText.replace(/\s+/g, '')).filter(Boolean)} : null;
  })});

  const submit = page.locator('.el-message-box').filter({visible: true})
                       .locator('button').filter({hasText: /提\s*交/}).last();
  if (await submit.count()) await submit.click();
  else await page.evaluate(() => {
    const bs = [...document.querySelectorAll('.el-message-box')].filter(b => b.offsetParent !== null);
    const b = bs[bs.length - 1];
    if (b) { const x = [...b.querySelectorAll('button')].find(y => /提\s*交/.test(y.innerText)); if (x) x.click(); }
  });

  await page.waitForTimeout(5000);
  out.steps.push({netAfter: out.net.slice(-5)});

  // 复核：重载列表 + 重开上/下架看平台状态
  await closeAll();
  await page.goto('https://wyb.5188cloud.net/marketManage/groupManagement/publish',
                  {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(5500);
  out.steps.push({listRow: await page.evaluate(t => {
    const tr = [...document.querySelectorAll('.el-table__body-wrapper tbody tr')].find(x => x.innerText.includes(t));
    return tr ? tr.innerText.replace(/\s+/g, ' ').trim() : null;
  }, TARGET)});

  const rows2 = page.locator('.el-table__body-wrapper tbody tr');
  const n2 = await rows2.count();
  let i2 = -1;
  for (let i = 0; i < n2; i++) { if ((await rows2.nth(i).innerText()).includes(TARGET)) { i2 = i; break; } }
  if (i2 >= 0) {
    await rows2.nth(i2).getByRole('button', {name: /上\/下架/}).click({force: true});
    await waitPlatformRows();
    out.steps.push({platforms: await page.evaluate(() => {
      const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
      const d = ds[ds.length - 1];
      return d ? [...d.querySelectorAll('.el-table__body-wrapper tbody tr')].map(tr =>
        [...tr.querySelectorAll('td')].map(td => td.innerText.replace(/\s+/g, ' ').trim())) : null;
    })});
  }
  await page.screenshot({path: 'publish-groupon-result.png'});
  return JSON.stringify(out, null, 2);
}
