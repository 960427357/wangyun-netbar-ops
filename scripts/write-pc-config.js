/**
 * 批量写机位「电脑配置」（占座/订座时 app 显示的那段）
 * 路径：系统设置 → 网吧配置 → 电脑配置 → 区域设置（整批覆盖选中区域下所有机位）
 *
 * 用法：改 LINES（最多 6 条），然后
 *   playwright-cli run-code --filename scripts/write-pc-config.js
 *
 * 硬限制：最多 6 行；每行输入框 maxlength=20（下面用原生 setter 绕过，实测可写 32 字）。
 * 安全：填完先逐字校验 6 个输入框，不一致直接中止不提交。
 */
async page => {
  const OVERWRITE = false;   // 改 true 才会真正保存

  const LINES = [
    'CPU：Intel i5-14600KF',
    '显卡：RTX 4070 Super 12G',
    '内存：32G DDR4 3600MHz',
    '硬盘：1TB NVMe 高速固态 / 散热：240 水冷',
    '显示器：27 英寸 2K 240Hz IPS',
    '外设：电竞机械键盘 + 轻量化电竞鼠标 + 7.1 声道游戏耳机',
  ];
  const D = '.el-dialog';

  await page.goto('https://wyb.5188cloud.net/admin/systemSetting/netbarConfig/computerConfig',
    {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('main .el-table tbody tr', {timeout: 20000}).catch(() => {});
  await page.waitForTimeout(4000);

  // 改前基线
  const before = await page.evaluate(() =>
    [...document.querySelectorAll('main .el-table tbody tr')].map(tr => {
      const td = tr.querySelectorAll('td');
      return `${(td[1] || {}).innerText?.trim()} | ${(td[2] || {}).innerText?.replace(/\s+/g, ',') || ''}`;
    }));

  // 区域设置
  await page.getByRole('button', {name: /区域设置/}).first().click({force: true});
  await page.waitForSelector('.el-dialog .el-checkbox', {timeout: 15000}).catch(() => {});
  await page.waitForTimeout(2000);
  const title = await page.evaluate(s => (document.querySelector(s + ' .el-dialog__title') || {}).innerText, D);
  if (!title || !/区域设置/.test(title)) return `FAIL: 没打开区域设置弹窗（title=${title}）`;

  // 勾选全部区域
  const areas = await page.evaluate(s => {
    const boxes = [...document.querySelectorAll(s + ' .el-dialog__body .el-checkbox')];
    return boxes.map(b => ({label: b.innerText.trim(), checked: b.querySelector('input')?.checked}));
  });
  const boxes = page.locator(D + ' .el-dialog__body .el-checkbox');
  const nb = await boxes.count();
  for (let i = 0; i < nb; i++) {
    const cb = boxes.nth(i);
    const on = await cb.evaluate(b => b.querySelector('input')?.checked);
    if (!on) await cb.click({force: true}).catch(() => {});
  }
  await page.waitForTimeout(800);

  // 加 5 行到 6 行
  const addBtn = page.locator(D + ' button').filter({hasText: /添加配置/}).first();
  for (let k = 1; k < LINES.length; k++) {
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click({force: true});
      await page.waitForTimeout(500);
    }
  }

  // 6 行灌值（绕 20 字）
  const filled = await page.evaluate(lines => {
    const ins = [...document.querySelectorAll('.el-dialog__body input.el-input__inner')];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    ins.forEach((el, i) => {
      if (i >= lines.length) return;
      el.focus();
      setter.call(el, lines[i]);
      el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
      el.blur();
    });
    return ins.map(e => e.value);
  }, LINES);
  await page.waitForTimeout(800);

  const ok = filled.length === LINES.length && filled.every((v, i) => v === LINES[i]);
  await page.screenshot({path: 'pc-before-save.png'});
  if (!ok) {
    return `FAIL 填充不一致，已中止未提交\n期望=${JSON.stringify(LINES)}\n实际=${JSON.stringify(filled)}\n改前=${before.join(' ;; ')}`;
  }

  if (!OVERWRITE) return `DRY_RUN 已填未提交\n区域可选=${JSON.stringify(areas)}\n行=${JSON.stringify(filled, null, 1)}`;

  // 提交
  const okBtn = page.locator(D + ' button').filter({hasText: /确\s*定/}).first();
  await okBtn.click({force: true});
  await page.waitForTimeout(4500);

  const toast = await page.evaluate(() =>
    ([...document.querySelectorAll('.el-message')].map(e => e.innerText.replace(/\s+/g, ' ')).join(' | ')) || '无提示');

  // 刷新复核
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForSelector('main .el-table tbody tr', {timeout: 20000}).catch(() => {});
  await page.waitForTimeout(4000);

  const after = await page.evaluate(() =>
    [...document.querySelectorAll('main .el-table tbody tr')].map(tr => {
      const td = tr.querySelectorAll('td');
      return {
        名称: (td[1] || {}).innerText?.trim(),
        区域: (td[2] || {}).innerText?.trim(),
        配置: [...tr.querySelectorAll('td')][3]
          ? [...tr.querySelectorAll('td')[3].querySelectorAll('div')].map(d => d.innerText.trim()).filter(Boolean)
          : [],
      };
    }));

  await page.screenshot({path: 'pc-after-save.png'});

  return `toast=${toast}\n\n勾选区域=${areas.map(a => a.label).join('、')}\n\n改前基线=${before.join(' ;; ')}\n\n改后=${JSON.stringify(after, null, 1)}`;
}
