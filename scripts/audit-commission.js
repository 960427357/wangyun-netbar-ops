async page => {
  // ============================================================
  // 员工激励 · 只读审计
  // 读出当前规则 + 历史规则，展开每条阶梯，估算提成成本。
  // 用途：发现「50% 这种明显配错」的规则。
  // 全程只读，不点保存、不点作废。
  // 改 ASSUME 调整估算假设。
  // 用法: playwright-cli run-code --filename scripts/audit-commission.js
  // ============================================================
  const ASSUME = {
    goodsDaily: 500,        // 假设：吧台商品日销售额（元）
    rechargeDaily: 1000,    // 假设：会员充值日金额（元）
    days: 30,               // 月天数
  };

  const LIST = 'https://wyb.5188cloud.net/staffManage/staffCommission/currRules';
  const HIST = 'https://wyb.5188cloud.net/staffManage/staffCommission/historyRules';

  // ---- 从「提成规则」文本里解析阶梯 ----
  const parseSteps = txt => {
    if (!txt) return {kind: 'none', steps: []};
    // 关键：系统在这段文字后面拼了一整段「提成规则示例」，里面是**演示用的阶梯**（100/10%、200/15%、300/20%）。
    // 不切掉的话，每条规则都会被多解析出 3 档假数据，估算全错。
    const t = String(txt).split('提成规则示例')[0];
    const steps = [];
    // 销售额提成: 销售额累计超过 X 元部分，提成 Y%
    let re = /销售额累计超过\s*([\d.]+)\s*元部分，提成\s*([\d.]+)\s*%/g;
    let m;
    while ((m = re.exec(t))) steps.push({from: +m[1], pct: +m[2]});
    if (steps.length) return {kind: 'progressive', steps};
    // 销售总额提成: 销售总额达到 X 元，提成 Y%
    re = /销售总额达到\s*([\d.]+)\s*元[^，]*，提成\s*([\d.]+)\s*%/g;
    while ((m = re.exec(t))) steps.push({from: +m[1], pct: +m[2]});
    if (steps.length) return {kind: 'tiered', steps};
    // 单笔充值提成: 单次充值满 X 元，提成 Y 元
    re = /单次充值满\s*([\d.]+)\s*元，提成\s*([\d.]+)\s*元/g;
    while ((m = re.exec(t))) steps.push({from: +m[1], fixed: +m[2]});
    if (steps.length) return {kind: 'perRecharge', steps};
    // 固定提成: 数字 + 元
    const fx = t.match(/^([\d.]+)\s*元/);
    if (fx) return {kind: 'fixed', steps: [{fixed: +fx[1]}]};
    return {kind: 'unknown', steps: [], raw: t.slice(0, 120)};
  };

  // ---- 估算：金额 → 提成 ----
  const estimate = (parsed, amount) => {
    const {kind, steps} = parsed;
    if (!steps.length) return null;
    if (kind === 'fixed') return steps[0].fixed;
    if (kind === 'tiered') {
      const sorted = [...steps].sort((a, b) => a.from - b.from);
      let hit = null;
      sorted.forEach(s => { if (amount >= s.from) hit = s; });
      return hit ? +(amount * hit.pct / 100).toFixed(2) : 0;
    }
    if (kind === 'progressive') {
      const sorted = [...steps].sort((a, b) => a.from - b.from);
      let total = 0;
      for (let i = 0; i < sorted.length; i++) {
        const lo = sorted[i].from;
        const hi = i + 1 < sorted.length ? sorted[i + 1].from : Infinity;
        if (amount <= lo) break;
        const seg = Math.min(amount, hi) - lo;
        if (seg > 0) total += seg * sorted[i].pct / 100;
      }
      return +total.toFixed(2);
    }
    if (kind === 'perRecharge') {
      const sorted = [...steps].sort((a, b) => a.from - b.from);
      let hit = null;
      sorted.forEach(s => { if (amount >= s.from) hit = s; });
      return hit ? hit.fixed : 0;
    }
    return null;
  };

  // ---- 读某行的「查看」详情 ----
  const readDetail = () => page.evaluate(() => {
    const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
    const d = ds[ds.length - 1];
    if (!d) return null;
    const val = lab => {
      const fi = [...d.querySelectorAll('.el-form-item')].find(x =>
        ((x.querySelector('.el-form-item__label') || {}).innerText || '').replace(/\s+/g, '').replace(/:$/, '') === lab);
      if (!fi) return null;
      const c = fi.querySelector('.el-form-item__content') || fi;
      const clone = c.cloneNode(true);
      clone.querySelectorAll('input').forEach(i => i.replaceWith(document.createTextNode('〖' + (i.value || '') + '〗')));
      return clone.innerText.replace(/\s+/g, ' ').trim();
    };
    return {
      name: (val('规则名称') || '').replace(/〖.*?〗|[\d\s/]+$/g, '').trim(),
      rule: val('提成规则') || val('提成金额'),
      start: val('生效时间'),
      end: val('结束时间'),
      goods: val('参与商品：'),
    };
  });

  const closeDlg = async () => {
    await page.evaluate(() => {
      const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
      ds.forEach(d => { const b = d.querySelector('.el-dialog__headerbtn'); if (b) b.click(); });
    });
    await page.waitForTimeout(800);
  };

  // ---- 抓某一页的所有规则 ----
  const scanPage = async (url, label) => {
    await page.goto(url, {waitUntil: 'domcontentloaded'});
    await page.waitForTimeout(4500);
    const rowsMeta = await page.evaluate(() => [...document.querySelectorAll('.el-table__body-wrapper tbody tr')].map(tr =>
      [...tr.querySelectorAll('td')].map(td => td.innerText.replace(/\s+/g, ' ').trim())));
    const out = [];
    for (let i = 0; i < rowsMeta.length; i++) {
      // 每条都重载，避免弹窗残留串数据
      await page.goto(url, {waitUntil: 'domcontentloaded'});
      await page.waitForTimeout(3800);
      const rows = page.locator('.el-table__body-wrapper tbody tr');
      if (i >= await rows.count()) continue;
      const rowCells = rowsMeta[i];
      const btn = rows.nth(i).locator('button').filter({hasText: /查\s*看/}).first();
      if (!(await btn.count())) continue;
      await btn.click({force: true});
      await page.waitForTimeout(2600);
      const detail = await readDetail();
      await closeDlg();
      out.push({page: label, index: i, cells: rowCells, detail});
    }
    return out;
  };

  const curr = await scanPage(LIST, '当前规则');
  const hist = await scanPage(HIST, '历史规则');

  // ---- 汇总 + 估算 ----
  const report = [];
  const inspect = r => {
    const parsed = parseSteps(r.detail && r.detail.rule);
    const scene = r.cells[1];
    const isRecharge = /会员充值/.test(scene);
    const amount = isRecharge ? ASSUME.rechargeDaily : ASSUME.goodsDaily;
    const perDay = estimate(parsed, amount);
    return {
      page: r.page,
      name: r.cells[0],
      scene,
      mode: r.cells[2],
      cycle: r.cells[3],
      period: `${r.cells[4]} → ${r.cells[5]}`,
      staff: r.cells[6],
      scope: r.cells[r.page === '历史规则' ? 8 : 7],
      expiredAt: r.page === '历史规则' ? r.cells[7] : null,
      algorithm: parsed.kind,
      steps: parsed.steps,
      assumeAmount: amount,
      estPerDay: perDay,
      estPerMonth: perDay != null ? +(perDay * ASSUME.days).toFixed(2) : null,
    };
  };

  const currR = curr.map(inspect);
  const histR = hist.map(inspect);

  // ---- 风险标记 ----
  const flags = [];
  currR.forEach(r => {
    if (r.algorithm === 'progressive' || r.algorithm === 'tiered') {
      const maxPct = Math.max(...r.steps.map(s => s.pct || 0));
      if (maxPct >= 30) flags.push(`【高风险】当前规则「${r.name}」最高提成 ${maxPct}%，按假设 ${r.assumeAmount} 元/天估算，日发 ${r.estPerDay} 元、月发 ${r.estPerMonth} 元`);
      if (r.steps.length && Math.min(...r.steps.map(s => s.from)) <= 1) flags.push(`【注意】当前规则「${r.name}」第一档门槛只有 ${Math.min(...r.steps.map(s => s.from))} 元，等于没有起征点`);
    }
    if (r.algorithm === 'perRecharge') flags.push(`【套利风险】当前规则「${r.name}」是单笔充值提成，可按单笔拆分套档`);
  });

  return JSON.stringify({
    assume: ASSUME,
    currentRules: currR,
    historyRules: histR,
    risks: flags,
    note: '本次为只读审计，未做任何修改。estPerDay/estPerMonth 是基于 ASSUME 的线性外推，不是真实发生额，真实数据看「提成结算」页。',
  }, null, 2);
}
