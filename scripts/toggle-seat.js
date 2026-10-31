/**
 * 旺云商户端 · 按机位开关占座 / 订座
 * 路径：服务管理 → 机位图 → APP机位图 → 网吧占座限制 / 网吧订座限制
 *
 * 用法：改下面三个常量，然后
 *   playwright-cli run-code --filename scripts/toggle-seat.js
 *
 * 语义：右框 = 参与，左框 = 不参与。ACTION='exclude' 表示把机位移出参与名单。
 */

async page => {
  // ===== 参数 =====
  const TARGET = '068';        // 机位号，按前缀匹配（支持 "A002" 命中 "A002（包间2）"）
  const MODE = 'occupy';       // 'occupy' 占座 | 'order' 订座
  const ACTION = 'exclude';    // 'exclude' 不参与 | 'include' 参与
  const DRY_RUN = true;        // 改 false 才真正保存
  // ================

  const BLOCK = MODE === 'occupy' ? '网吧占座限制' : '网吧订座限制';
  const SIDE = ACTION === 'exclude' ? '不参与' : '参与';

  // 1. 进入 APP 机位图
  await page.goto('https://wyb.5188cloud.net/serviceManage/netbarSite/bigScreen',
    {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(3000);
  await page.getByText('APP机位图', {exact: true}).first().click({force: true}).catch(() => {});
  await page.waitForTimeout(2500);

  // 2. 取对应穿梭框：订座是第 1 个，占座是第 2 个（DOM 顺序）
  const idx = MODE === 'occupy' ? 1 : 0;
  const tr = page.locator('.el-transfer').nth(idx);
  if (!(await tr.count())) return 'FAIL: 找不到穿梭框，检查是否已登录且停在 APP机位图';

  const panels = tr.locator('.el-transfer-panel');
  const leftPanel = panels.nth(0);
  const rightPanel = panels.nth(1);

  // 取面板内机位名；排除表头全选框的 label（它也在 .el-checkbox__label 里）
  const names = async panel => panel.evaluate(p =>
    [...p.querySelectorAll('.el-checkbox__label')]
      .filter(el => !el.closest('.el-transfer-panel__header'))
      .map(el => el.innerText.trim())
      .filter(Boolean));

  let left = await names(leftPanel);
  let right = await names(rightPanel);
  const before = `左(${SIDE === '不参与' ? '不参与' : '不参与'})=[${left.join(',')||'空'}] | 右(参与)=[${right.join(',')||'空'}]`;

  // 3. 判断当前所在侧
  const inRight = right.some(x => x.startsWith(TARGET));
  const inLeft = left.some(x => x.startsWith(TARGET));
  if (!inRight && !inLeft) return `目标 ${TARGET} 不在任一框内，可能机位号写错。当前 ${before}`;

  const nowSide = inRight ? '参与' : '不参与';
  if (nowSide === SIDE) return `已是「${SIDE}」状态，无需改动。当前 ${before}`;

  // 4. 勾选并移动
  const fromPanel = inRight ? panels.nth(1) : panels.nth(0);
  const item = fromPanel.locator('.el-checkbox').filter({hasText: TARGET}).first();
  await item.scrollIntoViewIfNeeded();
  await item.click({force: true});
  await page.waitForTimeout(600);

  // 箭头：第 1 个左移（参与→不参与），第 2 个右移
  const arrow = tr.locator('.el-transfer__button').nth(ACTION === 'exclude' ? 0 : 1);
  await arrow.click({force: true});
  await page.waitForTimeout(1200);

  left = await names(leftPanel);
  right = await names(rightPanel);
  const after = `左=[${left.join(',')||'空'}] | 右=[${right.join(',')||'空'}]`;

  // 5. 校验移动结果
  const okMove = ACTION === 'exclude'
    ? left.some(x => x.startsWith(TARGET))
    : right.some(x => x.startsWith(TARGET));
  if (!okMove) return `FAIL: 移动未生效。改前 ${before}；改后 ${after}`;

  if (DRY_RUN) return `DRY_RUN 预览（未保存）\n块=${BLOCK} 目标=${TARGET} 动作=${ACTION}\n改前 ${before}\n改后 ${after}`;

  // 6. 点该区块的保存（不能点错，两个区块各有一个「保 存」）
  const btns = page.locator('main button').filter({hasText: /^保\s*存$/});
  const total = await btns.count();
  let hit = -1;
  for (let i = 0; i < total; i++) {
    const belongs = await btns.nth(i).evaluate((b, kw) => {
      let p = b;
      for (let k = 0; k < 6 && p; k++) {
        if ((p.innerText || '').includes(kw)) return true;
        p = p.parentElement;
      }
      return false;
    }, BLOCK);
    if (belongs) { hit = i; break; }
  }
  if (hit < 0) return `FAIL: 没找到「${BLOCK}」区块的保存按钮`;

  await btns.nth(hit).click({force: true});
  await page.waitForTimeout(2500);

  const toast = await page.evaluate(() =>
    ([...document.querySelectorAll('.el-message,.el-notification')]
      .map(e => e.innerText.replace(/\s+/g, ' ')).join(' | ')) || '无提示');

  // 7. 刷新复核，确认落库
  await page.reload({waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(3000);
  await page.getByText('APP机位图', {exact: true}).first().click({force: true}).catch(() => {});
  await page.waitForTimeout(2500);
  const tr2 = page.locator('.el-transfer').nth(idx);
  const l2 = await names(tr2.locator('.el-transfer-panel').nth(0));
  const r2 = await names(tr2.locator('.el-transfer-panel').nth(1));
  const persisted = (ACTION === 'exclude' ? l2 : r2).some(x => x.startsWith(TARGET));

  return `已保存\n块=${BLOCK} 目标=${TARGET} 动作=${ACTION}\ntoast=${toast}\n改后 ${after}\n刷新复核=${persisted ? '落库成功' : '未落库，请人工检查'}\n左=[${l2.join(',') || '空'}] 右=[${r2.join(',') || '空'}]`;
}
