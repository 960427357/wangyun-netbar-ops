// 旺云商户端 批量新增商品脚本
// 运行：playwright-cli run-code --filename scripts/add-goods.js
// 前提：已在该站登录，且 playwright-cli 会话在线
async page => {
  // ===== 在这里填商品清单 =====
  // img 为本地绝对路径，可留空；支持 jpg/png/jpeg，单图 ≤500KB
  const products = [
    { name: '测试商品A', img: '' },
    { name: '测试商品B', img: '' },
  ];
  const DRY_RUN = true; // true 只走界面不提交；确认无误后改 false
  // ============================

  const URL = 'https://wyb.5188cloud.net/marketManage/goodsManage/baseManage/goodsName';
  await page.goto(URL);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape').catch(() => {});

  const results = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const last = i === products.length - 1;
    try {
      await page.getByRole('button', { name: /添\s*加/ }).first().click();
      await page.waitForTimeout(700);

      // 只取「添加商品」这个可见弹窗，避开页面其它同名输入框
      const dlg = page.locator('.el-dialog').filter({ hasText: '添加商品' }).last();
      const nameInput = dlg.getByPlaceholder('请输入商品名称');
      await nameInput.waitFor({ state: 'visible', timeout: 6000 });
      await nameInput.fill(p.name);

      if (p.img) {
        const fileInput = dlg.locator('input[type=file]');
        if (await fileInput.count()) {
          await fileInput.first().setInputFiles(p.img);
          await page.waitForTimeout(800);
        }
      }

      if (DRY_RUN) {
        await dlg.getByRole('button', { name: /取\s*消/ }).first().click();
        results.push({ name: p.name, status: 'dry-run-ok' });
      } else {
        const btn = last
          ? dlg.getByRole('button', { name: /确\s*认/ }).first()
          : dlg.getByRole('button', { name: /继续添加/ }).first();
        await btn.click();
        await page.waitForTimeout(900);
        results.push({ name: p.name, status: 'submitted' });
      }
      await page.waitForTimeout(500);
    } catch (e) {
      results.push({ name: p.name, status: 'error', message: String(e.message || e).slice(0, 140) });
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  return JSON.stringify(results, null, 2);
}
