async page => {
  // ============================================================
  // 员工激励 · 只读审计（结构体检，不做数值告警）
  // 读出当前规则 + 历史规则，展开每条阶梯，并做「结构」诊断。
  //
  // ⚠️ 环境提醒：从当前环境读到的价格/比例/金额可能来自**测试场所**，
  //    一律视为占位符。本脚本因此**不判断数值大小**（不因 50% 就报警），
  //    只判断结构是否可被套利：起征点、周期×阶梯、范围、岗位、拆单。
  //    要算真实成本，必须由使用者传入真实毛利率与真实日销基线。
  //
  // 全程只读，不点保存、不点作废。
  // 改 ASSUME 调整估算假设（默认值仅用于演示，不是真实经营数据）。
  // 用法: playwright-cli run-code --filename scripts/audit-commission.js
  // ============================================================
  const ASSUME = {
    goodsDaily: 500,        // 仅占位：吧台商品日销售额（元），真实环境请替换
    rechargeDaily: 1000,    // 仅占位：会员充值日金额（元），真实环境请替换
    days: 30,               // 月天数
    grossMarginPct: null,   // 真实毛利率(%)。留 null = 无法判断「比例是否吃掉毛利」，脚本会明确说明
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

  // ---- 结构体检（不看数值大小，只看能不能被套利）----
  const flags = [];
  const structuralChecks = r => {
    const out = [];
    const steps = r.steps || [];

    // 1) 起征点：第一档门槛 ≤1 元 = 等于没有起征点（与比例无关，是结构问题）
    const firstFrom = steps.length ? Math.min(...steps.map(s => s.from)) : null;
    if (firstFrom !== null && firstFrom <= 1) out.push('起征点=1元（等于无起征点，任何金额都进提成）');

    // 2) 周期 × 阶梯：每日 + 多档阶梯 → 阶梯永远爬不上去
    if (steps.length > 1 && /每日/.test(r.cycle || '')) out.push('周期=每日且配了多档阶梯（每天清零，第二档起永远用不上）');

    // 3) 范围：全店商品 → 成本无法按毛利分类控制
    if (/全店商品/.test(r.scope || '')) out.push('范围=全店商品（无法按毛利分类控成本）');

    // 4) 岗位：单一收银员 → 自己卖自己提，无二次校验
    if (/收银员/.test(r.staff || '') && !/(店长|值班|经理)/.test(r.staff || '')) out.push('岗位仅收银员（无第二人校验，配合全店范围难审计）');

    // 5) 单笔类：可拆单套档
    if (r.algorithm === 'perRecharge') out.push('单笔充值提成（可拆单套档）');

    // 6) 比例 vs 毛利：只有给了真实毛利率才判
    if (ASSUME.grossMarginPct != null && steps.length) {
      const maxPct = Math.max(...steps.map(s => s.pct || 0));
      if (maxPct >= ASSUME.grossMarginPct) out.push(`最高比例 ${maxPct}% ≥ 毛利率 ${ASSUME.grossMarginPct}%（卖得多亏得多）`);
    }
    return out;
  };

  currR.forEach(r => {
    const issues = structuralChecks(r);
    r.structuralIssues = issues;
    if (issues.length) flags.push(`【结构】「${r.name}」：${issues.join('；')}`);
  });
  if (ASSUME.grossMarginPct == null) {
    flags.push('【未判】未提供真实毛利率（ASSUME.grossMarginPct=null），"比例是否吃掉毛利"这一项无法判断，请勿据此下结论');
  }

  return JSON.stringify({
    assume: ASSUME,
    currentRules: currR,
    historyRules: histR,
    risks: flags,
    note: '本次为只读审计，未做任何修改。risks 里只列「结构」问题，不因数值大就报警。estPerDay/estPerMonth 是基于 ASSUME 的线性外推，ASSUME 可能是占位值（测试环境），真实发生额请看「提成结算」页；真实门店务必先填 grossMarginPct 与真实日销基线。',
  }, null, 2);
}
