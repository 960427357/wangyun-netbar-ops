/**
 * 手动派发员工任务（员工绩效 → 派发任务 → 新 增）
 *
 * 用法：
 *   1. 浏览器已登录并停在任意商户端页面；
 *   2. 改下方 JOBS；
 *   3. playwright-cli run-code --filename scripts/dispatch-task.js
 *
 * SAVE=false 时只填不存（默认），核对 readback 无误后再改 true。
 * 注意：责任人是单选，一条任务只能派给一个人；要多人做就写多条 JOBS。
 */
async (page) => {
  const BASE = 'https://wyb.5188cloud.net/staffManage/netbarPerformance/taskList';

  const SAVE = false;

  // mode: 'person' = 指定责任人（单选一人）；'post' = 指定岗位（广播，等员工抢单）
  const JOBS = [
    { name: '美团好评 1 条', pts: '20', mode: 'person', person: '虚拟收银01',
      posts: ['收银员'] },
    { name: '抖音好评 1 条', pts: '20', mode: 'person', person: '虚拟收银02',
      posts: ['收银员'] },
  ];

  const out = [];

  for (const job of JOBS) {
    const log = { job: job.name, steps: [] };

    // 每次重新进页面：avue 弹窗会缓存上一次的字段/选项，不重载容易读到脏状态
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    await page.locator('button').filter({ hasText: /新\s*增/ }).first().click();
    await page.waitForTimeout(3000);

    const dlgs = page.locator('.el-dialog').filter({ hasText: '手动派发任务' });
    let d = null;
    for (let i = 0; i < await dlgs.count(); i++) if (await dlgs.nth(i).isVisible()) d = dlgs.nth(i);
    if (!d) { log.err = 'no dialog'; out.push(log); continue; }

    // ① 任务名称
    const nameIn = d.locator('.el-form-item').filter({ hasText: '任务名称' }).locator('input').first();
    await nameIn.fill(job.name);
    await page.waitForTimeout(400);

    // ② 奖励积分
    const ptIn = d.locator('.el-form-item').filter({ hasText: '奖励积分' }).locator('input').first();
    await ptIn.fill(job.pts);
    await page.waitForTimeout(400);

    // ③ 参与类型
    const typeItem = d.locator('.el-form-item').filter({ hasText: '参与类型' });
    const wantType = job.mode === 'person' ? '指定责任人' : '指定岗位';
    await typeItem.locator('.el-radio').filter({ hasText: wantType }).click();
    await page.waitForTimeout(1500);

    // ④ 责任人 / 参与岗位（第 3 项会随类型切换）
    if (job.mode === 'person') {
      // ⚠️ filter({hasText:'责任人'}) 会命中「参与类型」，必须按 label 取索引
      const items = d.locator('.el-form-item');
      const idx = await items.evaluateAll(els => els.findIndex(e =>
        ((e.querySelector('.el-form-item__label')?.innerText) || '').replace(/\s+/g, '').startsWith('责任人')));
      const target = items.nth(idx).locator('.el-radio').filter({ hasText: job.person }).first();
      await target.scrollIntoViewIfNeeded();
      await target.click();
      await page.waitForTimeout(1200);
      log.steps.push('person=' + job.person);
    } else {
      for (const p of job.posts) {
        await d.locator('.el-checkbox').filter({ hasText: p }).first().click();
        await page.waitForTimeout(400);
        log.steps.push('post=' + p);
      }
    }

    // ⑤ 回读核对（必须在保存前，别信"点过了"）
    log.readback = await d.evaluate((el) => {
      const items = [...el.querySelectorAll('.el-form-item')];
      const pick = (kw) => {
        const it = items.find(x => ((x.querySelector('.el-form-item__label')?.innerText) || '')
          .replace(/\s+/g, '').startsWith(kw));
        if (!it) return null;
        const r = it.querySelector('.el-radio.is-checked');
        if (r) return r.innerText.trim();
        const cs = [...it.querySelectorAll('.el-checkbox.is-checked')].map(c => c.innerText.trim());
        return cs.length ? cs.join('+') : 'NONE';
      };
      const ins = [...el.querySelectorAll('input')];
      return { name: ins[0]?.value, pts: ins[1]?.value, type: pick('参与类型'), who: pick('责任人') };
    });

    if (SAVE) {
      const ok = log.readback.name === job.name
        && (job.mode === 'person' ? log.readback.who === job.person : true);
      if (!ok) { log.err = 'readback mismatch, skip save'; out.push(log); continue; }
      await d.locator('button').filter({ hasText: /保\s*存/ }).first().click();
      await page.waitForTimeout(3500);
      log.saved = true;
      log.dlgGone = !(await d.isVisible().catch(() => false));
    }
    out.push(log);
  }
  return out;
}