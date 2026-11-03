async page => {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const log = [];
  const BASE = 'https://wyb.5188cloud.net';
  const URL_COUPON = BASE + '/memberActivityManage/coupon';

  // 只跑指定下标（-1 = 全跑）
  const ONLY = -1;
  const SAVE = true; // 先只填不存，确认字段都填对了再改 true

  // 券 + 配套的赠送规则（券本身不发放，规则才是发放入口）
  const CFG = [
    { coupon: '商超满20减3',  amount: 20,  deduct: 3,  days: 30, scene: '商超', user: '会员',
      rule: '满20送3元券',  trigger: 20,  qty: 1, end: '2026-12-31 23:59:59' },
    { coupon: '商超满50减8',  amount: 50,  deduct: 8,  days: 45, scene: '商超', user: '会员',
      rule: '满50送8元券',  trigger: 50,  qty: 1, end: '2026-12-31 23:59:59' },
    { coupon: '商超满100减15', amount: 100, deduct: 15, days: 60, scene: '商超', user: '会员',
      rule: '满100送15元券', trigger: 100, qty: 1, end: '2026-12-31 23:59:59' },
  ];

  const toast = () => page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('.el-message')].map(e => n(e.innerText));
  });

  const dlg = () => page.locator('.el-dialog').last();

  const pickSelect = async (idx, label) => {
    await dlg().locator('.el-select__wrapper').nth(idx).click();
    await page.waitForTimeout(900);
    // 选项是异步拉的，空列表要再等一等重读（优惠券下拉尤其慢）
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await page.evaluate((label) => {
        const n = s => (s || '').replace(/\s+/g, ' ').trim();
        const items = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.offsetParent !== null);
        if (!items.length) return { state: 'EMPTY' };
        const hit = items.find(e => n(e.innerText) === label);
        if (!hit) return { state: 'NOT FOUND', list: items.map(e => n(e.innerText)) };
        hit.click();
        return { state: 'ok' };
      }, label);
      if (r.state === 'ok') { await page.waitForTimeout(900); return 'ok'; }
      if (r.state === 'NOT FOUND') { await page.waitForTimeout(600); return 'NOT FOUND: ' + JSON.stringify(r.list); }
      await page.waitForTimeout(1200);
    }
    return 'EMPTY（下拉一直没加载出选项）';
  };

  const readForm = () => page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const isVis = el => el && el.offsetParent !== null;
    const d = [...document.querySelectorAll('.el-dialog')].filter(isVis).pop();
    if (!d) return 'NO DIALOG';
    const items = [...d.querySelectorAll('.el-form-item')].filter(isVis);
    return items.map(it => {
      const label = n(it.querySelector('.el-form-item__label')?.innerText).replace(/[:：]$/, '');
      const inp = [...it.querySelectorAll('input')].filter(isVis)
        .map(i => (i.type === 'checkbox' || i.type === 'radio' ? i.type + '=' + i.checked : i.value))
        .join(',');
      const sel = n(it.querySelector('.el-select__placeholder')?.innerText);
      return label + ' = ' + (sel || inp || n(it.innerText).slice(0, 40));
    });
  });

  const clickBtn = async (text) => page.evaluate((text) => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const isVis = el => el && el.offsetParent !== null;
    const v = (text || '').replace(/\s+/g, '');
    const b = [...document.querySelectorAll('button')].filter(isVis)
      .find(x => n(x.innerText).replace(/\s+/g, '') === v);
    if (!b) return 'NOT FOUND';
    b.click();
    return 'ok';
  }, text);

  // ---------------- 券 ----------------
  const buildCoupon = async c => {
    const L = [];
    await page.goto(URL_COUPON, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);

    L.push('新增按钮 = ' + await clickBtn('新 增'));
    await page.waitForTimeout(2000);

    await dlg().locator('input[placeholder="请输入 优惠券名称"]').fill(c.coupon);
    await dlg().locator('input[placeholder="请输入 一次消费金额"]').fill(String(c.amount));
    await dlg().locator('input[placeholder="请输入 可抵扣金额"]').fill(String(c.deduct));
    L.push('场景 = ' + await pickSelect(0, c.scene));
    L.push('用户 = ' + await pickSelect(1, c.user));
    // 有效期默认「天」，只填天数
    const dayIn = dlg().locator('input[placeholder="请输入 有效期天数"]');
    if (await dayIn.count()) await dayIn.fill(String(c.days));
    else L.push('有效期天数输入框 = 缺失');
    await page.waitForTimeout(400);

    L.push('--- 券表单 ---');
    (await readForm()).forEach(t => L.push('  ' + t));

    if (!SAVE) { L.push('SAVE=false，停在此处'); return L; }
    L.push('保存 = ' + await clickBtn('保 存'));
    await page.waitForTimeout(2500);
    L.push('toast = ' + JSON.stringify(await toast()));
    return L;
  };

  // ---------------- 赠送规则 ----------------
  const buildRule = async c => {
    const L = [];
    await page.goto(URL_COUPON, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    L.push('切到赠送规则 = ' + await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      const b = [...document.querySelectorAll('button')].filter(isVis).find(x => n(x.innerText) === '赠送规则');
      if (!b) return 'NOT FOUND';
      b.click();
      return 'ok';
    }));
    await page.waitForTimeout(2500);

    L.push('新增按钮 = ' + await clickBtn('新 增'));
    await page.waitForTimeout(2000);

    await dlg().locator('input[placeholder="请输入 规则名称"]').fill(c.rule);
    L.push('消费场景 = ' + await pickSelect(0, c.scene));
    L.push('优惠券 = ' + await pickSelect(1, c.coupon));
    const qty = dlg().locator('input[placeholder="请输入 数量"]');
    if (await qty.count()) await qty.fill(String(c.qty));
    await dlg().locator('input[placeholder="请输入 一次性消费金额"]').fill(String(c.trigger));

    // 状态：单个 checkbox，勾上才是启用
    const st = await dlg().evaluate((el) => {
      const cb = el.querySelector('input[type=checkbox]');
      if (!cb) return 'no checkbox';
      const was = cb.checked;
      if (!was) cb.click();
      return 'was=' + was + ' now=' + cb.checked;
    });
    L.push('状态 = ' + st);

    // 生效 / 失效时间
    const setDate = async (ph, val) => {
      const i = dlg().locator(`input[placeholder="请选择 ${ph}"]`);
      if (!(await i.count())) return ph + ': 无输入框';
      await i.fill(val);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
      return ph + ' = ' + await i.inputValue();
    };
    L.push(await setDate('生效时间', c.start));
    L.push(await setDate('失效时间', c.end));
    await page.waitForTimeout(400);

    L.push('--- 规则表单 ---');
    (await readForm()).forEach(t => L.push('  ' + t));

    if (!SAVE) { L.push('SAVE=false，停在此处'); return L; }
    L.push('保存 = ' + await clickBtn('保 存'));
    await page.waitForTimeout(2500);
    L.push('toast = ' + JSON.stringify(await toast()));
    return L;
  };

  const readLists = async () => {
    const L = [];
    await page.goto(URL_COUPON, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const grab = () => page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      return [...document.querySelectorAll('.el-table__body tbody tr')].filter(isVis)
        .map(r => n(r.innerText).slice(0, 100));
    });
    L.push('--- 优惠券列表 ---');
    (await grab()).forEach(t => L.push('  ' + t));
    await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      [...document.querySelectorAll('button')].filter(isVis).find(x => n(x.innerText) === '赠送规则')?.click();
    });
    await page.waitForTimeout(2500);
    L.push('--- 赠送规则列表 ---');
    (await grab()).forEach(t => L.push('  ' + t));
    return L;
  };

  const idx = ONLY >= 0 ? [ONLY] : CFG.map((_, i) => i);
  for (const i of idx) {
    const c = CFG[i];
    c.start = c.start || '2026-11-03 00:00:00';
    log.push(`===== ${i} ${c.coupon} / ${c.rule} =====`);
    try {
      log.push(...await buildCoupon(c));
      if (SAVE) {
        log.push('');
        log.push(...await buildRule(c));
      }
    } catch (e) {
      log.push('❌ 异常：' + e.message.split('\n')[0]);
    }
    log.push('');
  }
  if (SAVE) log.push(...await readLists());
  return log.join('\n');
}
