// 旺云商户端 纯上架到吧台（移库）脚本
// 运行：playwright-cli run-code --filename scripts/replenish.js
// 前提：已登录，playwright-cli 会话在线
//
// 语义（已实测）：
//   纯上架 = 默认吧台库存 +N，未出货 -N，总库存不变
//   注意：不要用「补货」弹窗做纯上架，补货的「数量」= 入库，会额外增加总库存
async page => {
  // ===== 参数 =====
  const GOODS_NAME = '康师傅冰红茶'; // 精确名称，区分「康师傅冰红茶 1L」
  const MOVE = 20;        // 上架到吧台的数量
  const DRY_RUN = true;   // true 只计算不改
  // ================

  await page.goto('https://wyb.5188cloud.net/marketManage/goodsManage/shop/goods');
  await page.waitForTimeout(1800);

  const search = page.getByPlaceholder('请输入商品名称').first();
  await search.fill(GOODS_NAME);
  await page.getByRole('button', { name: /搜\s*索/ }).first().click();
  await page.waitForTimeout(1600);

  const nameEl = page.getByText(GOODS_NAME, { exact: true }).last();
  const row = nameEl.locator('xpath=ancestor::tr[1]');
  const ins = row.locator('input');

  // 该行输入框顺序：进货价 / 销售价 / 兑换积分 / 默认吧台库存 / 未出货
  const barInput = ins.nth(3);
  const unInput = ins.nth(4);

  const bar0 = parseInt(await barInput.inputValue(), 10);
  const un0 = parseInt(await unInput.inputValue(), 10);
  if (isNaN(bar0) || isNaN(un0)) throw new Error('库存读取失败，检查行结构');
  if (un0 < MOVE) throw new Error('未出货不足，当前 ' + un0 + '，需要 ' + MOVE);

  const bar1 = bar0 + MOVE;
  const un1 = un0 - MOVE;

  if (DRY_RUN) {
    return JSON.stringify({ mode: 'dry-run', goods: GOODS_NAME, bar: bar0 + '->' + bar1, unshipped: un0 + '->' + un1, total: 'unchanged' });
  }

  await barInput.click();
  await barInput.fill(String(bar1));
  await barInput.press('Tab');
  await page.waitForTimeout(1200);

  await unInput.click();
  await unInput.fill(String(un1));
  await unInput.press('Tab');
  await page.waitForTimeout(1500);

  // 回读确认
  const barAfter = await barInput.inputValue();
  const unAfter = await unInput.inputValue();

  return JSON.stringify({ mode: 'applied', goods: GOODS_NAME, bar: barAfter, unshipped: unAfter, note: '建议刷新页面复核总库存不变' });
}
