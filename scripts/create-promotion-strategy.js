async page => {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const log = [];
  const SAVE = false;

  const CFG = {
    crowd: '高危人群',
    name: '唤回-高危会员免费5小时',
    gift: '免费上网5小时',
    days: 7,
    channels: ['旺旺宝网吧版APP', '公众号'],
  };

  const vis = `const vis = el => el && el.offsetParent !== null;`;
  const clickMenu = async (label) => page.evaluate((label) => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const isVis = el => el && el.offsetParent !== null;
    const hit = [...document.querySelectorAll('.menu-box .menu-item')].filter(isVis)
      .find(e => norm(e.innerText) === label);
    if (!hit) return 'NOT FOUND';
    hit.click();
    return 'ok';
  }, label);

  // 若不在策略列表，先回模块
  const ensure = async () => {
    const has = await page.evaluate(() =>
      [...document.querySelectorAll('.menu-box .menu-item')].some(e => e.offsetParent !== null));
    if (has) return 'ok';
    const r = await page.evaluate(() => {
      const norm = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      const b = [...document.querySelectorAll('button')].filter(isVis).find(x => /返\s*回/.test(norm(x.innerText)));
      if (b) { b.click(); return 'back'; }
      const li = [...document.querySelectorAll('li')].filter(isVis).find(e => norm(e.innerText) === '会员促销');
      if (li) { li.click(); return 'menu'; }
      return 'none';
    });
    await page.waitForTimeout(2500);
    return r;
  };
  log.push('ensure=' + await ensure());

  log.push('点策略设置 → ' + await clickMenu('策略设置'));
  await page.waitForTimeout(2500);

  // 点左侧人群
  const r1 = await page.evaluate((label) => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const isVis = el => el && el.offsetParent !== null;
    const hit = [...document.querySelectorAll('main div, main span')].filter(isVis)
      .find(e => norm(e.innerText) === label && e.children.length === 0);
    if (!hit) return 'NOT FOUND';
    (hit.closest('[cursor=pointer]') || hit).click();
    return 'ok';
  }, CFG.crowd);
  log.push('点 ' + CFG.crowd + ' → ' + r1);
  await page.waitForTimeout(2500);
  log.push('URL=' + page.url().split('.net')[1]);

  // 点添加
  const r2 = await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const isVis = el => el && el.offsetParent !== null;
    const b = [...document.querySelectorAll('button')].filter(isVis).find(x => /添\s*加/.test(norm(x.innerText)));
    if (!b) return 'NOT FOUND';
    b.click();
    return 'ok';
  });
  log.push('点添加 → ' + r2);
  await page.waitForTimeout(3200);
  log.push('表单页=' + page.url().split('.net')[1]);

  // 1. 策略名称
  await page.locator('input[placeholder="请输入活动名称"]').first().fill(CFG.name);
  log.push('名称=' + CFG.name);

  // 2. 选礼包
  const rb = await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const isVis = el => el && el.offsetParent !== null;
    const b = [...document.querySelectorAll('button')].filter(isVis).find(x => /选择礼包/.test(norm(x.innerText)));
    if (!b) return 'NOT FOUND';
    b.click();
    return 'ok';
  });
  log.push('打开礼包弹窗 → ' + rb);
  await page.waitForTimeout(2200);

  // 弹窗内：填名称 + 搜索
  const dlgInput = page.locator('.el-dialog:visible input[placeholder*="礼包名称"]').last();
  await dlgInput.fill(CFG.gift);
  await page.locator('.el-dialog:visible button').filter({hasText: /搜\s*索/}).last().click();
  await page.waitForTimeout(2200);

  const giftInfo = await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const isVis = el => el && el.offsetParent !== null;
    const ds = [...document.querySelectorAll('.el-dialog')].filter(isVis);
    const d = ds[ds.length - 1];
    const rows = [...d.querySelectorAll('.el-table__body tbody tr')].filter(isVis);
    return {
      count: rows.length,
      rows: rows.map(r => norm(r.innerText)),
      hasCheck: !!d.querySelector('.el-table__body .el-checkbox'),
      empt: norm((d.querySelector('.el-table__empty-text') || {}).innerText),
    };
  });
  log.push('礼包搜索结果: count=' + giftInfo.count + ' 有勾选框=' + giftInfo.hasCheck + ' 空态=' + giftInfo.empt);
  giftInfo.rows.forEach((t, i) => log.push('   ' + i + ' ' + t));

  // 勾第一行
  const pick = await page.evaluate(() => {
    const isVis = el => el && el.offsetParent !== null;
    const ds = [...document.querySelectorAll('.el-dialog')].filter(isVis);
    const d = ds[ds.length - 1];
    const box = [...d.querySelectorAll('.el-table__body .el-checkbox')].filter(isVis)[0];
    if (!box) return 'no checkbox';
    box.click();
    return 'ok';
  });
  log.push('勾选 → ' + pick);
  await page.waitForTimeout(900);

  const confirm = await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const isVis = el => el && el.offsetParent !== null;
    const ds = [...document.querySelectorAll('.el-dialog')].filter(isVis);
    const d = ds[ds.length - 1];
    const b = [...d.querySelectorAll('button')].find(x => /确认选择/.test(norm(x.innerText)));
    if (!b) return 'NOT FOUND';
    b.click();
    return 'ok';
  });
  log.push('确认选择 → ' + confirm);
  await page.waitForTimeout(2200);

  const giftShown = await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const isVis = el => el && el.offsetParent !== null;
    const it = [...document.querySelectorAll('.el-form-item')].filter(isVis)
      .find(i => norm(i.querySelector('.el-form-item__label')?.innerText).includes('礼包设置'));
    return norm(it?.querySelector('.el-form-item__content')?.innerText || '');
  });
  log.push('礼包回读=' + giftShown);

  // 3. 开放规则 → 每日
  const rs = await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const isVis = el => el && el.offsetParent !== null;
    const it = [...document.querySelectorAll('.el-form-item')].filter(isVis)
      .find(i => norm(i.querySelector('.el-form-item__label')?.innerText).includes('活动开放规则'));
    const s = it?.querySelector('.el-select__wrapper, .el-select');
    if (!s) return 'no select';
    s.click();
    return 'ok';
  });
  log.push('开下拉 → ' + rs);
  await page.waitForTimeout(1200);
  const ropt = await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const li = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.offsetParent !== null);
    const hit = li.find(e => norm(e.innerText) === '每日');
    if (!hit) return 'NOT FOUND:' + JSON.stringify(li.map(e => norm(e.innerText)));
    hit.click();
    return 'ok';
  });
  log.push('选每日 → ' + ropt);
  await page.waitForTimeout(1500);

  // 4. 券有效期天数
  const days = await page.evaluate(() => {
    const isVis = el => el && el.offsetParent !== null;
    const inp = [...document.querySelectorAll('input')].filter(isVis)
      .find(i => i.placeholder === '有效天数');
    if (!inp) return 'no input';
    return 'ok';
  });
  if (days === 'ok') {
    await page.locator('input[placeholder="有效天数"]').first().fill(String(CFG.days));
    log.push('有效天数=' + CFG.days);
  } else log.push('有效天数输入框=' + days);

  // 5. 发送渠道
  const ch = await page.evaluate((channels) => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const isVis = el => el && el.offsetParent !== null;
    const out = [];
    const boxes = [...document.querySelectorAll('.el-checkbox')].filter(isVis);
    for (const name of channels) {
      const b = boxes.find(x => norm(x.innerText) === name);
      if (!b) { out.push(name + ':NOT FOUND'); continue; }
      if (!b.classList.contains('is-checked')) b.click();
      out.push(name + ':' + (b.classList.contains('is-checked') ? 'on' : 'fail'));
    }
    return out;
  }, CFG.channels);
  log.push('渠道=' + JSON.stringify(ch));
  await page.waitForTimeout(900);

  // 6. 提交前回读
  const before = await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const isVis = el => el && el.offsetParent !== null;
    const items = [...document.querySelectorAll('.el-form-item')].filter(isVis);
    const fields = items.map(it => {
      const label = norm(it.querySelector('.el-form-item__label')?.innerText).replace(/[:：]$/, '');
      const c = it.querySelector('.el-form-item__content') || it;
      return label + ' = ' + norm(c.innerText).slice(0, 60);
    });
    const sw = [...document.querySelectorAll('.el-switch')].filter(isVis)
      .map(s => s.classList.contains('is-checked'));
    const checked = [...document.querySelectorAll('.el-checkbox')].filter(isVis)
      .filter(b => b.classList.contains('is-checked')).map(b => norm(b.innerText));
    return { fields, sw, checked };
  });
  log.push('\n--- 提交前 ---');
  before.fields.forEach(f => log.push('  ' + f));
  log.push('开关=' + JSON.stringify(before.sw) + ' 已勾=' + JSON.stringify(before.checked));

  log.push('\nSAVE=' + SAVE);
  return log.join('\n');
}
