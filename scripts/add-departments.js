/**
 * 旺云商户端 · 批量补建部门（员工管理 → 部门管理）
 * 路径：员工管理 → 部门管理  /staffManage/department
 *
 * 用法：playwright-cli run-code --filename scripts/add-departments.js
 *
 * 语义：只建「部门」，不建岗位/角色/员工。主管可选，留空即不指定。
 * 说明：部门必须先存在，岗位和员工才有得选，是员工体系五层的第一层。
 */

async page => {
  // ===== 参数 =====
  // 部门名 -> 主管员工（写下拉里显示的前缀，如 '员工C'；null 表示不指定）
  const DEPTS = [
    ['店务管理', null],
    ['前台收银', null],
    ['网管技术', null],
    ['吧台出品', null],
    ['保洁', null],
  ];
  const DRY_RUN = false;   // true 只看不写
  // ================

  const log = [];

  // 0. 确保在部门管理页（深链接可直达，登录态在 persistent profile 里）
  if (!page.url().includes('/staffManage/department')) {
    await page.goto('https://wyb.5188cloud.net/staffManage/department', {waitUntil: 'domcontentloaded'});
    await page.waitForTimeout(4000);
  }
  if (page.url().includes('/login')) return 'FAIL: 登录态失效，请先在浏览器里登录';

  const readRows = () => page.evaluate(() =>
    [...document.querySelectorAll('.el-table__body-wrapper tbody tr')]
      .map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim())));

  log.push({step: 'before', rows: await readRows()});

  // 先关掉可能残留的弹窗（页面用 .el-dialog 本体做容器，没有 .el-dialog__wrapper）
  const closeAnyDialog = () => page.evaluate(() => {
    const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
    ds.forEach(d => {
      const b = [...d.querySelectorAll('button')].find(x => /取\s*消/.test(x.innerText));
      if (b) b.click();
    });
  });
  await closeAnyDialog();
  await page.waitForTimeout(600);

  for (const [name, sup] of DEPTS) {
    // 已存在则跳过
    const exists = (await readRows()).some(r => r[0] === name);
    if (exists) { log.push({name, skip: '已存在'}); continue; }

    // 1. 打开新增
    await page.getByRole('button', {name: /新\s*增/}).first().click({force: true});
    await page.waitForTimeout(1200);

    const dlg = await page.evaluateHandle(() => {
      const ds = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null);
      return ds[ds.length - 1] || null;
    });
    if (!(await dlg.evaluate(e => !!e))) { log.push({name, err: '弹窗未出现'}); break; }

    // 2. 填部门名
    await page.evaluate(([w, v]) => {
      const inp = w.querySelector('input');
      inp.value = v;
      inp.dispatchEvent(new Event('input', {bubbles: true}));
      inp.dispatchEvent(new Event('change', {bubbles: true}));
    }, [dlg, name]);

    // 3. 选主管（可选）
    if (sup) {
      await page.evaluate(w => {
        const s = w.querySelector('.el-select');
        if (s) s.querySelector('input').click();
      }, dlg);
      await page.waitForTimeout(900);
      const picked = await page.evaluate(v => {
        const li = [...document.querySelectorAll('.el-select-dropdown__item')]
          .find(x => x.innerText.includes(v));
        if (li) { li.click(); return li.innerText.trim(); }
        return null;
      }, sup);
      if (!picked) log.push({name, warn: `主管「${sup}」未找到`});
      await page.waitForTimeout(500);
    }

    if (DRY_RUN) {
      const typed = await page.evaluate(w => {
        const inputs = [...w.querySelectorAll('input')].map(i => i.value);
        const err = w.querySelector('.el-form-item__error');
        return {inputs, err: err ? err.innerText.trim() : null};
      }, dlg);
      log.push({name, dryRun: true, typed});
      await page.evaluate(w => {
        const b = [...w.querySelectorAll('button')].find(x => /取\s*消/.test(x.innerText));
        if (b) b.click();
      }, dlg);
      await page.waitForTimeout(600);
      continue;
    }

    // 4. 保存
    await page.evaluate(w => {
      const b = [...w.querySelectorAll('button')].find(x => /保\s*存/.test(x.innerText));
      if (b) b.click();
    }, dlg);
    await page.waitForTimeout(1800);

    const msg = await page.evaluate(() =>
      [...document.querySelectorAll('.el-message')].map(e => e.innerText.trim()).join(' | '));

    // 弹窗没自动关就点取消，避免叠层
    await closeAnyDialog();
    await page.waitForTimeout(800);

    log.push({name, supervisor: sup || '未指定', msg: msg || '(无提示)'});
  }

  await page.waitForTimeout(1000);
  const after = await readRows();
  log.push({step: 'after', count: after.length, rows: after});

  return JSON.stringify(log, null, 2);
}
