/**
 * 批量改移动端配置（wwbao）：电脑配置 + 服务标签
 *
 * 路径：系统设置 → 网吧配置 → 移动端配置
 *      /admin/systemSetting/netbarConfig/wwbao
 *
 * ⚠️ 这是「场所级」的电脑配置（固定 5 框：屏幕/CPU/显卡/键盘/鼠标，最多 100 组），
 *    和机位级 attr1~attr10（scripts/write-pc-config.js）是两套东西。
 *
 * 用法：改下面 OVERWRITE / CFG / TAGS 后
 *   playwright-cli run-code --filename scripts/write-wwbao.js
 *
 * OVERWRITE=false：只填不保存（不动删除、不点保存），用来核对文案。
 * OVERWRITE=true ：删多余组 → 填第一组 → 补标签 → 保存前逐项校验 → 通过才提交。
 *
 * 安全：保存前强制校验「组数=1、5 项一致、标签数一致」，任一项不符直接 ABORT 不提交。
 */
async (page) => {
  const OVERWRITE = false;

  // 电脑配置：固定 5 项，顺序不可改（屏幕/CPU/显卡/键盘/鼠标）
  const CFG = [
    ['屏幕：', '27英寸 2K 240Hz'],
    ['CPU：', 'i5-14600KF'],
    ['显卡：', 'RTX 4070 Super 12G'],
    ['键盘：', '电竞机械键盘'],
    ['鼠标：', '轻量化电竞鼠标']
  ];
  // 服务标签：最多 10 个，每个 ≤60 字
  const TAGS = ['电竞', '咖啡', '饮品', '包间', '24小时', '停车'];

  const log = [];

  await page.goto('https://wyb.5188cloud.net/admin/systemSetting/netbarConfig/wwbao',
    {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(6500);

  const findItem = kw => page.locator('.el-form-item')
    .filter({has: page.locator('.el-form-item__label', {hasText: kw})}).first();

  // ---------- ① 电脑配置：删多余组，只留一组 ----------
  const cfgItem = findItem('电脑配置');
  let groups = await cfgItem.locator('.computer-item-form').count();
  log.push(`电脑配置组数(初始)=${groups}`);

  if (OVERWRITE && groups > 1) {
    for (let k = groups - 1; k >= 1; k--) {
      const g = cfgItem.locator('.computer-item-form').nth(k);
      // 删除按钮 = .computer-item-form 的直接子级 i.el-icon-delete，别用 button/svg 的 last()
      await g.locator('> i.el-icon-delete').click({force: true});
      await page.waitForTimeout(900);
      const okBtn = page.locator('.el-message-box__btns button')
        .filter({hasText: /^确\s*定$/}).first();
      if (await okBtn.count() && await okBtn.isVisible().catch(() => false)) {
        await okBtn.click({force: true});
        await page.waitForTimeout(900);
      }
    }
    groups = await cfgItem.locator('.computer-item-form').count();
    log.push(`电脑配置组数(删除后)=${groups}`);
  }

  const inputs0 = cfgItem.locator('.computer-item-form').first().locator('input.el-input__inner');
  const n0 = await inputs0.count();
  log.push(`第一组输入框数=${n0}（应为 5）`);
  const filled = [];
  for (let i = 0; i < Math.min(n0, CFG.length); i++) {
    await inputs0.nth(i).fill(CFG[i][1]);
    const got = await inputs0.nth(i).inputValue();
    filled.push(got === CFG[i][1] ? 'OK' : {label: CFG[i][0], want: CFG[i][1], got});
  }
  log.push('电脑配置填充=' + JSON.stringify(filled));

  // ---------- ② 服务标签：缺几个点几次「+ 添加」 ----------
  const tagItem = findItem('服务标签');
  let tagInputs = tagItem.locator('input.el-input__inner');
  const cur = [];
  const n = await tagInputs.count();
  for (let i = 0; i < n; i++) cur.push(await tagInputs.nth(i).inputValue());
  log.push('服务标签初始=' + JSON.stringify(cur));

  const need = TAGS.length - cur.length;
  if (need > 0) {
    const addBtn = tagItem.locator('button').filter({hasText: /添加/}).first();
    for (let k = 0; k < need; k++) {
      await addBtn.click({force: true});
      await page.waitForTimeout(700);
    }
    log.push(`点了 ${need} 次「+ 添加」`);
  }

  tagInputs = tagItem.locator('input.el-input__inner');
  const total = await tagInputs.count();
  log.push(`服务标签行数=${total}`);
  const tagFilled = [];
  for (let i = 0; i < Math.min(total, TAGS.length); i++) {
    await tagInputs.nth(i).fill(TAGS[i]);
    const got = await tagInputs.nth(i).inputValue();
    tagFilled.push(got === TAGS[i] ? 'OK' : {i, want: TAGS[i], got});
  }
  log.push('服务标签填充=' + JSON.stringify(tagFilled));

  // ---------- ③ 回读 ----------
  const snap = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.el-form-item')];
    const fi = kw => items.find(x =>
      (x.querySelector('.el-form-item__label')?.innerText || '').includes(kw));
    const cfg = fi('电脑配置'), tag = fi('服务标签');
    return {
      组数: cfg.querySelectorAll('.computer-item-form').length,
      电脑配置: [...cfg.querySelectorAll('.computer-item-form')].map(f =>
        [...f.querySelectorAll('li')].map(li =>
          (li.querySelector('span')?.innerText || '') + (li.querySelector('input')?.value || ''))),
      服务标签: [...tag.querySelectorAll('input.el-input__inner')].map(e => e.value)
    };
  });

  if (!OVERWRITE) {
    return 'DRY_RUN 未保存\n' + log.join('\n') +
      '\n\n===== DOM =====\n' + JSON.stringify(snap, null, 1);
  }

  // ---------- ④ 保存前强制校验 ----------
  const errs = [];
  if (snap.组数 !== 1) errs.push(`组数=${snap.组数}（应为 1）`);
  const row0 = snap.电脑配置[0] || [];
  CFG.forEach(([label, val], i) => {
    if (row0[i] !== label + val) errs.push(`第${i + 1}项 want=${label + val} got=${row0[i]}`);
  });
  if (JSON.stringify(snap.服务标签) !== JSON.stringify(TAGS)) {
    errs.push(`标签 want=${JSON.stringify(TAGS)} got=${JSON.stringify(snap.服务标签)}`);
  }
  if (errs.length) {
    return 'ABORT 校验不通过，未保存\n' + log.join('\n') + '\n失败项：\n- ' + errs.join('\n- ') +
      '\n\n===== DOM =====\n' + JSON.stringify(snap, null, 1);
  }
  log.push('保存前校验：通过');

  // ---------- ⑤ 保存（整页一次性提交，接口密文） ----------
  const reqs = [];
  page.on('request', r => {
    if (r.url().includes('placeOnShelvesConfig') && r.method() === 'POST') {
      reqs.push('POST placeOnShelvesConfig/onShelves');
    }
  });
  await page.getByRole('button', {name: /保\s*存/}).first().click({force: true});
  await page.waitForTimeout(4500);

  // toast 只活 ~3 秒，读到空数组不代表失败，以刷新后回读为准
  log.push('保存请求=' + JSON.stringify(reqs));
  log.push('下一步：刷新页面回读确认（scripts/read-wwbao.js）');

  return 'SAVED\n' + log.join('\n') +
    '\n\n===== 保存前 DOM =====\n' + JSON.stringify(snap, null, 1);
}
