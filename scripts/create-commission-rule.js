async page => {
  // ============================================================
  // 新建「提成规则」——走「会员充值 → 单笔充值提成」路径
  // 用法: playwright-cli run-code --filename scripts/create-commission-rule.js
  // SAVE=false 只填不保存，用于核对；SAVE=true 才落库。
  // 注意：提交前必须在员工激励/当前规则页，且已登录。
  // ============================================================
  const CFG = {
    name: '商品推销10%提成',
    scene: '商品推销',            // 商品推销 / 会员拉新 / 会员充值 / 旺云团购
    way: '销售额提成',             // 固定提成 / 销售额提成 / 销售总额提成；会员充值多「单笔充值提成」
    cycle: '自然月',              // 每日 / 自然月 / 有效期
    // 生效时间必须 **晚于当前时刻**，填当天 00:00 会被拒：「生效时间不能小于当前时间」
    startAt: '2026-10-31 00:10:00',
    endAt: '2029-12-01 23:59:59',
    posts: ['收银员'],             // 管理员 / 保洁员 / 维修工 / 收银员
    // 参与范围：商品推销选 全店商品 / 指定分类 / 指定商品；旺云团购选 全部套餐 / 指定套餐
    // 会员充值场景没有这个字段，填 null
    scope: '全店商品',
    // 阶梯：第二个数是「提成%」（销售额/销售总额提成）或「提成元」（单笔充值提成）
    // 销售额提成 = 分段累进；销售总额提成 = 够档整笔乘
    steps: [
      {from: 0, pct: 10},
    ],
  };
  // 脚本跑在浏览器里，没有 process.env；改这一行决定是否落库（默认 false = 只报不存）
  const SAVE = false;
  const log = [];

  // ---------- 0. 确保在「当前规则」页并打开弹窗 ----------
  if (!page.url().includes('staffCommission/currRules')) {
    await page.goto('https://wyb.5188cloud.net/staffManage/staffCommission/currRules',
      {waitUntil: 'domcontentloaded'});
    await page.waitForTimeout(3000);
    if (page.url().includes('/login')) return 'FAIL: 登录态失效，需要人工登录';
  }
  const open = () => page.evaluate(() =>
    [...document.querySelectorAll('.el-dialog')].some(d => d.offsetParent !== null));
  if (!(await open())) {
    await page.locator('button.el-button', {hasText: /新\s*增/}).first().click({timeout: 10000});
    await page.waitForTimeout(1800);
  }
  if (!(await open())) return 'FAIL: 新增弹窗没打开';

  const dlg = page.locator('.el-dialog').filter({hasText: '新增提成规则'}).last();

  // ---------- 1. 规则名称 ----------
  await dlg.locator('input[placeholder="请输入 规则名称"]').fill(CFG.name);
  log.push(`名称: ${CFG.name}`);

  // ---------- 2. 单选：场景 / 方式 / 周期 ----------
  const pickRadio = async (labelText, optText) => {
    const ok = await page.evaluate(([l, o]) => {
      const d = [...document.querySelectorAll('.el-dialog')].filter(x => x.offsetParent !== null).pop();
      const fi = [...d.querySelectorAll('.el-form-item')].find(f =>
        ((f.querySelector('.el-form-item__label') || {}).innerText || '').replace(/\s+/g, '').replace(/:$/, '') === l);
      if (!fi) return false;
      const r = [...fi.querySelectorAll('.el-radio')].find(x =>
        (x.innerText || '').replace(/\s/g, '') === o.replace(/\s/g, ''));
      if (!r) return false;
      (r.querySelector('input') || r).click();
      return true;
    }, [labelText, optText]);
    await page.waitForTimeout(900);
    return ok;
  };

  if (!(await pickRadio('适用场景', CFG.scene))) return `FAIL: 选不到场景「${CFG.scene}」`;
  log.push(`场景: ${CFG.scene}`);

  if (!(await pickRadio('提成方式', CFG.way))) return `FAIL: 选不到方式「${CFG.way}」`;
  log.push(`方式: ${CFG.way}`);

  // 周期必须紧跟方式选（它会触发重渲染），日期一定放最后，否则会被清空
  if (!(await pickRadio('计算提成周期', CFG.cycle))) return 'FAIL: 选不到周期「' + CFG.cycle + '」';
  log.push(`周期: ${CFG.cycle}`);

  // ---------- 3. 阶梯行：按需补足条数 ----------
  const rowCount = () => page.evaluate(() => {
    const d = [...document.querySelectorAll('.el-dialog')].filter(x => x.offsetParent !== null).pop();
    const fi = [...d.querySelectorAll('.el-form-item')].find(f =>
      ((f.querySelector('.el-form-item__label') || {}).innerText || '').replace(/\s+/g, '').replace(/:$/, '') === '提成规则');
    return fi ? fi.querySelectorAll('.rule-item').length : 0;
  });

  let rows = await rowCount();
  if (rows === 0) {
    await page.evaluate(() => {
      const d = [...document.querySelectorAll('.el-dialog')].filter(x => x.offsetParent !== null).pop();
      const b = [...d.querySelectorAll('button')].find(x => /添\s*加/.test(x.innerText));
      b && b.click();
    });
    await page.waitForTimeout(800);
    rows = await rowCount();
  }
  while (rows < CFG.steps.length) {
    await page.evaluate(() => {
      const d = [...document.querySelectorAll('.el-dialog')].filter(x => x.offsetParent !== null).pop();
      const b = [...d.querySelectorAll('button')].find(x => /添\s*加/.test(x.innerText));
      b && b.click();
    });
    await page.waitForTimeout(700);
    const n = await rowCount();
    if (n === rows) break;
    rows = n;
  }
  if (rows < CFG.steps.length) return `FAIL: 阶梯行只加到 ${rows} 条`;

  // ---------- 4. 填阶梯（每行 2 个数字：门槛 X 元 / 提成 Y（% 或 元）） ----------
  const filled = await page.evaluate(steps => {
    const d = [...document.querySelectorAll('.el-dialog')].filter(x => x.offsetParent !== null).pop();
    const fi = [...d.querySelectorAll('.el-form-item')].find(f =>
      ((f.querySelector('.el-form-item__label') || {}).innerText || '').replace(/\s+/g, '').replace(/:$/, '') === '提成规则');
    const items = [...fi.querySelectorAll('.rule-item')];
    const setNum = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
      el.dispatchEvent(new Event('blur', {bubbles: true}));
    };
    const out = [];
    steps.forEach((s, i) => {
      const ins = [...items[i].querySelectorAll('input')];
      if (ins.length < 2) { out.push({err: `第${i + 1}行输入框不足`}); return; }
      const v2 = s.fixed !== undefined ? s.fixed : s.pct;
      setNum(ins[0], s.from);
      setNum(ins[1], v2);
      out.push({row: i + 1, from: ins[0].value, rate: ins[1].value});
    });
    return out;
  }, CFG.steps);
  log.push(`阶梯: ${JSON.stringify(filled)}`);

  // ---------- 4.5 参与商品 / 团购套餐（只有这两个场景有） ----------
  if (CFG.scope) {
    const labelOf = `参与商品`;   // 商品推销
    const opened = await page.evaluate(lb => {
      const d = [...document.querySelectorAll('.el-dialog')].filter(x => x.offsetParent !== null).pop();
      const fi = [...d.querySelectorAll('.el-form-item')].find(f =>
        ((f.querySelector('.el-form-item__label') || {}).innerText || '')
          .replace(/\s+/g, '').replace(/:$/, '').startsWith(lb));
      if (!fi) return false;
      const sel = fi.querySelector('.el-select');
      if (!sel) return false;
      const inp = sel.querySelector('input');
      (inp || sel).click();
      return true;
    }, labelOf);
    await page.waitForTimeout(900);
    const picked = await page.evaluate(t => {
      const dds = [...document.querySelectorAll('.el-select-dropdown')].filter(x => x.offsetParent !== null);
      const dd = dds[dds.length - 1];
      if (!dd) return null;
      const opts = [...dd.querySelectorAll('.el-select-dropdown__item')].map(i => i.innerText.trim());
      const it = [...dd.querySelectorAll('.el-select-dropdown__item')].find(i => i.innerText.trim() === t);
      if (!it) return {opts, clicked: false};
      it.click();
      return {opts, clicked: true};
    }, CFG.scope);
    await page.waitForTimeout(900);
    log.push(`范围: ${JSON.stringify({opened, picked})}`);
    if (!opened || !picked || !picked.clicked) return `FAIL: 参与范围没选上 ${CFG.scope} / ${JSON.stringify(picked)}`;
  }

  // ---------- 5. 参与岗位 ----------
  const posts = await page.evaluate(list => {
    const d = [...document.querySelectorAll('.el-dialog')].filter(x => x.offsetParent !== null).pop();
    const fi = [...d.querySelectorAll('.el-form-item')].find(f =>
      ((f.querySelector('.el-form-item__label') || {}).innerText || '').replace(/\s+/g, '').replace(/:$/, '') === '参与岗位');
    const done = [];
    list.forEach(t => {
      const c = [...fi.querySelectorAll('.el-checkbox')].find(x =>
        (x.innerText || '').replace(/\s/g, '') === t.replace(/\s/g, ''));
      if (!c) return;
      const inp = c.querySelector('input');
      if (!inp.checked) (inp || c).click();
      done.push(t);
    });
    return done;
  }, CFG.posts);
  await page.waitForTimeout(500);
  log.push(`岗位: ${JSON.stringify(posts)}`);

  // ---------- 6. 日期（必须最后填：前面任何一次单选重渲染都会把它清空） ----------
  const setDate = async (ph, val) => {
    const inp = dlg.locator(`input[placeholder="请选择 ${ph}"]`);
    await inp.evaluate(el => el.removeAttribute('readonly'));
    await inp.fill(val);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    // 收起面板：点弹窗标题，千万别按 Esc（会关掉整个弹窗）
    await dlg.locator('.el-dialog__title').click({timeout: 5000}).catch(() => {});
    await page.waitForTimeout(400);
  };
  await setDate('生效时间', CFG.startAt);
  await setDate('结束时间', CFG.endAt);
  const dates = await page.evaluate(() => {
    const d = [...document.querySelectorAll('.el-dialog')].filter(x => x.offsetParent !== null).pop();
    const g = ph => {
      const i = d.querySelector(`input[placeholder="请选择 ${ph}"]`);
      return i ? i.value : null;
    };
    return {start: g('生效时间'), end: g('结束时间')};
  });
  log.push(`日期: ${JSON.stringify(dates)}`);

  // ---------- 7. 回读整张表 ----------
  const snapshot = await page.evaluate(() => {
    const d = [...document.querySelectorAll('.el-dialog')].filter(x => x.offsetParent !== null).pop();
    const out = {};
    [...d.querySelectorAll('.el-form-item')].forEach(fi => {
      const label = ((fi.querySelector('.el-form-item__label') || {}).innerText || '')
        .replace(/\s+/g, '').replace(/:$/, '');
      const c = fi.querySelector('.el-form-item__content') || fi;
      // 单选/复选必须读 checked，光看值判断不出有没有选中
      const picked = [...c.querySelectorAll('.el-radio, .el-checkbox')]
        .filter(x => { const i = x.querySelector('input'); return i && i.checked; })
        .map(x => (x.innerText || '').replace(/\s+/g, ''));
      const clone = c.cloneNode(true);
      clone.querySelectorAll('input').forEach(i => i.replaceWith(document.createTextNode('〖' + (i.value || '') + '〗')));
      out[label] = {
        已选: picked.length ? picked : null,
        值: clone.innerText.replace(/\s+/g, ' ').trim().slice(0, 160)
      };
    });
    return out;
  });

  if (!SAVE) {
    return JSON.stringify({mode: 'DRY_RUN（未保存）', log, snapshot}, null, 2);
  }

  // ---------- 8. 保存 ----------
  await dlg.locator('button', {hasText: /保\s*存/}).first().click({timeout: 10000});
  await page.waitForTimeout(2500);

  const after = await page.evaluate(() => {
    const msg = [...document.querySelectorAll('.el-message, .el-message__content')]
      .map(m => (m.innerText || '').trim()).filter(Boolean);
    const stillOpen = [...document.querySelectorAll('.el-dialog')].some(d => d.offsetParent !== null);
    const rows = [...document.querySelectorAll('.el-table__body tr')].map(tr =>
      [...tr.querySelectorAll('td')].map(td => (td.innerText || '').replace(/\s+/g, ' ').trim()).join(' | '));
    return {msg, stillOpen, rows};
  });

  return JSON.stringify({mode: 'SAVED', log, snapshot, after}, null, 2);
}
