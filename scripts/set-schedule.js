/*
 * set-schedule.js — 给单个员工排整月班（旺云商户端：员工管理 → OA管理 → 排班）
 *
 * 前置：岗位管理里已配好班次（本例「早班 09:00-21:00」「夜班 21:00-09:00」）；
 *       页面已停在 /staffManage/oa/scheduling 且已切到目标月份（月份输入框改完必须点「搜 索」）。
 *
 * 用法：
 *   PERSON = 0/1/2  目标员工是表格里第几个含「虚拟收银」的行（0 起）
 *   SAVE   = false  只填不存，先看 preview 的 30 个格子对不对
 *
 * 规则：每人 6 天循环 —— 2 早 → 2 夜 → 休 2 天；三人起点各错开 2 天，
 *       保证每天正好 1 早 + 1 夜。（3 人 × 4 班 = 12 = 2 班/天 × 6 天）
 */
async (page) => {
  const PERSON = 0;   // 0/1/2
  const SAVE = false; // true 才会点「确 定」

  // 三名收银员的轮转：偏移 0 / 2 / 4
  const shiftFor = (p, day) => {
    const r = ((day - 1) % 6) + 1;
    if (p === 0) return r <= 2 ? '早班' : r <= 4 ? '夜班' : null;   // 早早晚晚休休
    if (p === 1) return r <= 2 ? null : r <= 4 ? '早班' : '夜班';   // 休休早早晚晚
    return r <= 2 ? '夜班' : r <= 4 ? null : '早班';                // 夜夜休休早早
  };

  // 选值：必须点「当前可见」的那个 popper —— 30 个 select 会留下 30 个 dropdown
  const pick = async (sel, text) => {
    await sel.click();
    await page.waitForTimeout(300);
    return page.evaluate((t) => {
      const vis = [...document.querySelectorAll('.el-select-dropdown')].filter((d) => {
        const r = d.getBoundingClientRect();
        return r.height > 5 && d.offsetParent !== null;
      });
      if (!vis.length) return 'nolist';
      const li = [...vis[vis.length - 1].querySelectorAll('.el-select-dropdown__item')]
        .find((x) => x.innerText.trim() === t);
      if (!li) return 'noitem';
      li.click();
      return 'ok';
    }, text);
  };

  // 清掉可能残留的弹窗（只按「取 消」文案点，绝不按索引）
  for (let i = 0; i < 3; i++) {
    const cancel = page.locator('.el-dialog:visible button', { hasText: '取' }).first();
    if (await cancel.count()) { await cancel.click().catch(() => {}); await page.waitForTimeout(400); }
  }

  // 目标员工行：按姓名定位，不写死行号
  const row = page.locator('tbody tr').filter({ hasText: `虚拟收银0${PERSON + 1}` }).first();
  if (!(await row.count())) return JSON.stringify({ err: '未找到目标员工行' });

  const name = (await row.locator('td').nth(1).innerText()).replace(/\s+/g, ' ').trim();
  await row.locator('td').nth(1).click();      // 点姓名才开弹窗，点日期格子无效
  await page.waitForTimeout(1200);

  const dlg = page.locator('.el-dialog:visible').first();
  const title = (await dlg.locator('.el-dialog__title').innerText()).trim();
  if (!title.includes(name)) return JSON.stringify({ err: '弹窗不匹配', title, name });

  const sels = dlg.locator('.el-select');
  const total = await sels.count();            // 应为当月天数
  const fails = [];

  for (let day = 1; day <= total; day++) {
    const want = shiftFor(PERSON, day);
    if (!want) continue;                       // 休息 = 留空，没有「休息」选项
    const r = await pick(sels.nth(day - 1), want);
    if (r !== 'ok') fails.push(`${day}:${want}:${r}`);
  }

  const preview = [];
  for (let day = 1; day <= total; day++) {
    const t = (await sels.nth(day - 1).innerText()).replace(/\s+/g, ' ').trim();
    preview.push(t === '班次' ? '-' : t === '早班' ? '早' : t === '夜班' ? '夜' : t);
  }

  let closed = null;
  if (SAVE) {
    await dlg.locator('button', { hasText: '确' }).first().click();
    await page.waitForTimeout(2500);
    closed = (await page.locator('.el-dialog:visible').count()) === 0; // 关闭即成功，无 toast
  }

  return JSON.stringify({ name, total, fails, preview: preview.join(' '), saved: closed });
}
