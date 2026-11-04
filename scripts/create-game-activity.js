async page => {
  const n = s => (s || '').replace(/\s+/g, ' ').trim();
  const BASE = 'https://wyb.5188cloud.net';
  const log = [];

  // 只跑指定下标（-1 = 全跑）
  const ONLY = -1;
  const SAVE = true; // 先干跑确认字段，确认无误再改 true

  // 游戏活动策略：LOL / 绝地求生 两套表单结构不同，靠 game 字段切换
  const CFG = [
    // —— LOL ——
    { game: 'LOL', name: '超神奖励-5元网费', type: '超神数', calc: '累计', value: 1,
      modes: ['单双排', '灵活组排'], start: '2026-11-04', end: '2027-03-31',
      open: '14:00', close: '23:59', money: 5, perUser: 1, total: 0 },
    { game: 'LOL', name: '助攻王-累计30助攻送3元', type: '助攻数', calc: '累计', value: 30,
      modes: ['匹配', '大乱斗'], start: '2026-11-04', end: '2027-03-31',
      open: '12:00', close: '23:59', money: 3, perUser: 1, total: 0 },
    // —— 绝地求生（没有段位、没有场次计算，改成单场排名 / 单场杀敌 数字）——
    { game: '绝地求生', name: '吃鸡奖-第1名送10元', type: '单场排名', value: 1,
      modes: ['单排', '双排', '四排'], start: '2026-11-04', end: '2027-03-31',
      open: '14:00', close: '23:59', money: 10, perUser: 1, total: 0 },
    { game: '绝地求生', name: '单场杀神-单场10杀送5元', type: '单场杀敌', value: 10,
      modes: ['单排', '双排', '四排'], start: '2026-11-04', end: '2027-03-31',
      open: '14:00', close: '23:59', money: 5, perUser: 1, total: 0 },
  ];

  const toast = () => page.evaluate(() => {
    const f = s => (s || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('.el-message')].map(e => f(e.innerText));
  });

  const readForm = () => page.evaluate(() => {
    const f = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    return [...document.querySelectorAll('.el-form-item')].filter(vis).map(it => {
      const lb = f(it.querySelector('.el-form-item__label')?.innerText).replace(/[:：]$/, '');
      const inp = [...it.querySelectorAll('input')].filter(vis)
        .map(i => (i.type === 'checkbox' || i.type === 'radio' ? i.type + '=' + i.checked : i.value))
        .join(',');
      const sel = f(it.querySelector('.el-select__placeholder')?.innerText);
      const rad = [...it.querySelectorAll('.el-radio.is-checked')].map(e => f(e.innerText)).join(',');
      const chk = [...it.querySelectorAll('.el-checkbox.is-checked')].map(e => f(e.innerText)).join(',');
      return lb + ' = [' + [sel, rad, chk, inp].filter(Boolean).join(' / ') + ']';
    });
  });

  const fillByPh = async (ph, val) => {
    const i = page.locator(`input[placeholder="${ph}"]`).first();
    if (!(await i.count())) return ph + ': 无此输入框';
    await i.click();
    await i.fill(val);
    await page.waitForTimeout(300);
    await i.press('Enter');
    await page.waitForTimeout(500);
    await page.keyboard.press('Tab');
    await page.waitForTimeout(300);
    return ph + ' = ' + (await i.inputValue());
  };

  const pickSelect = async (idx, label) => {
    const w = page.locator('.el-select__wrapper').nth(idx);
    await w.click();
    await page.waitForTimeout(800);
    const r = await page.evaluate(l => {
      const f = s => (s || '').replace(/\s+/g, ' ').trim();
      const items = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.offsetParent !== null);
      if (!items.length) return 'EMPTY';
      const hit = items.find(e => f(e.innerText) === l);
      if (!hit) return 'NOT FOUND: ' + JSON.stringify(items.map(e => f(e.innerText)));
      hit.click();
      return 'ok';
    }, label);
    await page.waitForTimeout(700);
    return r;
  };

  // 选活动规则 / 选游戏类型：按 placeholder 文本定位对应下拉
  const pickSelectByPh = async (ph, label) => {
    const ok = await page.evaluate(p => {
      const f = s => (s || '').replace(/\s+/g, ' ').trim();
      const vis = e => e && e.offsetParent !== null;
      const w = [...document.querySelectorAll('.el-select__wrapper')].filter(vis).find(x => f(x.innerText).includes(p));
      if (!w) return false;
      w.click();
      return true;
    }, ph);
    if (!ok) return ph + ': 找不到下拉';
    await page.waitForTimeout(800);
    const r = await page.evaluate(l => {
      const f = s => (s || '').replace(/\s+/g, ' ').trim();
      const items = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.offsetParent !== null);
      const hit = items.find(e => f(e.innerText) === l);
      if (!hit) return 'NOT FOUND: ' + JSON.stringify(items.map(e => f(e.innerText)));
      hit.click();
      return 'ok';
    }, label);
    await page.waitForTimeout(700);
    return r;
  };

  const radio = async label => page.evaluate(l => {
    const f = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    const r = [...document.querySelectorAll('.el-radio')].filter(vis).find(e => f(e.innerText) === l);
    if (!r) return 'NOT FOUND';
    if (r.classList.contains('is-checked')) return 'already';
    r.querySelector('input')?.click();
    return 'ok';
  }, label);

  const checkbox = async label => page.evaluate(l => {
    const f = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    const b = [...document.querySelectorAll('.el-checkbox')].filter(vis).find(e => f(e.innerText) === l);
    if (!b) return 'NOT FOUND';
    if (!b.classList.contains('is-checked')) b.querySelector('.el-checkbox__inner').click();
    return 'ok';
  }, label);

  const setNumByLabel = async (label, val) => page.evaluate(([l, v]) => {
    const f = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    const it = [...document.querySelectorAll('.el-form-item')].filter(vis)
      .find(i => f(i.querySelector('.el-form-item__label')?.innerText).replace(/[:：]$/, '') === l);
    if (!it) return 'NO ITEM';
    const inp = [...it.querySelectorAll('input[type=number]')].filter(vis)[0];
    if (!inp) return 'NO INPUT';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, String(v));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    inp.blur();
    return 'set ' + inp.value;
  }, [label, val]);

  const run = async c => {
    const L = [];
    await page.goto(BASE + '/netBar/addActivity?actType=games', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder="请输入活动名称"]');
    await page.waitForTimeout(1500);

    L.push('游戏 = ' + await radio(c.game));
    await page.waitForTimeout(900);

    // 活动名称
    const nm = page.locator('input[placeholder="请输入活动名称"]').first();
    await nm.fill(c.name);
    L.push('活动名称 = ' + (await nm.inputValue()));

    // 活动类型
    L.push('活动类型 = ' + await pickSelect(0, c.type));
    await page.waitForTimeout(800);

    // LOL 专属：场次计算 + 门槛
    if (c.game === 'LOL') {
      L.push('场次计算 = ' + await radio(c.calc));
      await page.waitForTimeout(400);
    }
    // 门槛字段标签随活动类型变
    L.push('门槛(' + c.type + ') = ' + await setNumByLabel(c.type, c.value));

    // 活动模式
    const modes = [];
    for (const m of c.modes) modes.push(m + ':' + await checkbox(m));
    L.push('活动模式 = ' + modes.join(' '));

    // 活动开放规则
    L.push('活动周期 = ' + await pickSelectByPh('活动周期', '每日'));
    await page.waitForTimeout(600);

    // 日期 / 时间
    L.push(await fillByPh('请选择活动策略启用时间', c.start));
    L.push(await fillByPh('请选择活动策略结束时间', c.end));
    L.push(await fillByPh('选择活动开放时间', c.open));
    L.push(await fillByPh('选择活动结束时间', c.close));

    // 参与次数（0/空 = 不限）
    L.push('单用户 = ' + await setNumByLabel('单用户最大参与次数', c.perUser));
    L.push('总名额 = ' + await setNumByLabel('活动总参与名额', c.total));

    // 活动奖项：赠送网费
    const money = await page.evaluate(v => {
      const vis = e => e && e.offsetParent !== null;
      const box = document.querySelector('.prizeItemBorder');
      if (!box) return 'NO PRIZE BOX';
      const inp = [...box.querySelectorAll('input[type=number]')].filter(vis)[0];
      if (!inp) return 'NO MONEY INPUT';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, String(v));
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      inp.blur();
      return '赠送网费 = ' + inp.value;
    }, c.money);
    L.push('奖项 = ' + money);

    // 开启活动（默认关，必须点开；el-switch 用 JS click 不生效，要真实点击）
    const swLoc = page.locator('.el-switch').first();
    const before = await swLoc.evaluate(el => el.classList.contains('is-checked'));
    if (!before) await swLoc.click();
    await page.waitForTimeout(800);
    const after = await swLoc.evaluate(el => el.classList.contains('is-checked'));
    L.push('开启活动 = was=' + before + ' now=' + after);

    L.push('--- 提交前表单 ---');
    (await readForm()).forEach(t => L.push('  ' + t));

    if (!SAVE) { L.push('DRY RUN，未提交'); return L; }

    const hits = [];
    const onResp = r => {
      if (r.request().method() !== 'POST') return;
      if (!/activity/i.test(r.url())) return;
      hits.push(r.url().replace(BASE, '') + ' -> ' + r.status());
    };
    page.on('response', onResp);
    await page.evaluate(() => {
      const f = s => (s || '').replace(/\s+/g, ' ').trim();
      const vis = e => e && e.offsetParent !== null;
      const b = [...document.querySelectorAll('button')].filter(vis).find(x => /保存提交/.test(f(x.innerText)));
      if (b) b.click();
    });
    await page.waitForTimeout(4500);
    page.off('response', onResp);
    L.push('接口 = ' + JSON.stringify(hits));
    L.push('toast = ' + JSON.stringify(await toast()));
    L.push('提交后 URL = ' + page.url().replace(BASE, ''));
    return L;
  };

  const targets = ONLY >= 0 ? [CFG[ONLY]] : CFG;
  log.push('待处理 ' + targets.length + ' 条，SAVE=' + SAVE);
  for (const c of targets) {
    try {
      log.push('=== ' + c.game + ' / ' + c.name);
      log.push(...await run(c));
    } catch (e) {
      log.push('❌ ' + c.name + ' 异常：' + e.message.split('\n')[0]);
    }
    log.push('');
  }
  return log.join('\n');
}
