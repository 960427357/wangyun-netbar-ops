/**
 * 旺云商户端 · 网吧语音管理 —— 按事件开关语音播报
 *
 * 路径：服务管理 → 语音播报 → 网吧语音管理
 *       https://wyb.5188cloud.net/serviceManage/netBarVoiceManage/voiceManage
 *
 * 一个播报事件要出声，必须同时满足：
 *   1) 卡片内「语音播报通道」的「旺云控制台」勾选框 = 已勾
 *   2) 表格「开关」列 = 开
 * 缺一不响。本脚本把这两件事一起处理。
 *
 * 用法：
 *   playwright-cli run-code --filename scripts/toggle-voice.js
 *
 * 改动前请先看清三个常量。DRY_RUN 默认 true，只报数不落库。
 *
 * 铁律：整页只有一个「保 存」，它会一次提交全部 8 张卡片。
 *       点保存前务必用 ALL 模式复核整页，确认没有别的卡片被动过。
 */

async page => {
  // ============ 可改参数 ============
  const EVENT = '客户呼叫网管播报';   // 目标事件卡片标题
  const ENABLE = true;               // true=打开（通道+开关都开） false=关闭
  const ENSURE_CHANNEL = true;       // 是否同时处理「旺云控制台」勾选
  const DRY_RUN = true;              // true 只报数；false 真正点击并保存
  const ALL = true;                  // true 顺带输出全部卡片状态做复核
  // ==================================

  const URL = 'https://wyb.5188cloud.net/serviceManage/netBarVoiceManage/voiceManage';
  const TITLES = [
    '客户留言提醒播报', '客户下机打扫播报', '客户网费充值播报', '客户购买商品播报',
    '客户呼叫网管播报', '取消订单语音播报', '客户租赁设备播报', '客户呼叫退租',
  ];

  // 进场：确保在网吧语音管理页
  if (!page.url().includes('/netBarVoiceManage/voiceManage')) {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);   // 首屏 3-4 秒，加载中会假显示「暂无数据」
  }

  // 把每张卡片标上 data-vb，避免用父级 div 猜边界
  const tagged = await page.evaluate(list => {
    document.querySelectorAll('[data-vb]').forEach(e => e.removeAttribute('data-vb'));
    let hit = 0;
    for (const t of list) {
      const hs = [...document.querySelectorAll('*')]
        .filter(e => e.children.length === 0 && e.textContent.trim() === t);
      if (!hs.length) continue;
      let b = hs[0];
      for (let i = 0; i < 6 && b; i++) {
        if (b.querySelector && b.querySelector('.el-switch') && b.querySelector('table')) break;
        b = b.parentElement;
      }
      if (!b) continue;
      b.setAttribute('data-vb', t);
      hit++;
    }
    return hit;
  }, TITLES);

  const readCard = async title => {
    const box = page.locator(`[data-vb="${title}"]`);
    if (!(await box.count())) return null;
    const chan = box.locator('.el-checkbox').filter({ hasText: '旺云控制台' }).first();
    const hasChan = await chan.count();
    const chanOn = hasChan ? await chan.evaluate(el => el.classList.contains('is-checked')) : null;
    const sw = box.locator('.el-switch').first();
    const swOn = (await sw.count()) ? await sw.evaluate(el => el.classList.contains('is-checked')) : null;
    const rows = await box.locator('tbody tr').evaluateAll(rs =>
      rs.map(r => [...r.children].map(c => (c.innerText || '').trim().replace(/\s+/g, ' ')).join('/')));
    return { chanOn, swOn, rows };
  };

  const fmt = s => (s === null ? '无控件' : s ? '开' : '关');
  const out = [];

  if (!tagged) return 'FAIL: 未定位到任何卡片，页面可能未加载完或改版';

  // ---- 1. 目标卡片现状 ----
  const before = await readCard(EVENT);
  if (!before) return `FAIL: 未找到「${EVENT}」卡片`;
  out.push(`【目标】${EVENT}`);
  out.push(`  通道(旺云控制台)=${before.chanOn === null ? '无控件' : before.chanOn ? '已勾' : '未勾'}`);
  out.push(`  开关=${fmt(before.swOn)}`);
  out.push(`  表格行=${before.rows.join(' ;; ') || '空（可能是加载中，稍后重试）'}`);

  const needChan = ENSURE_CHANNEL && ENABLE && before.chanOn === false;
  const needSw = before.swOn !== null && before.swOn !== ENABLE;
  out.push(`  需处理：通道=${needChan ? '要勾' : '无需'} / 开关=${needSw ? (ENABLE ? '要打开' : '要关闭') : '无需'}`);

  // ---- 2. 执行 ----
  if (!needChan && !needSw) {
    out.push('  => 已是目标状态，无需改动');
  } else if (DRY_RUN) {
    out.push('  => DRY_RUN，未点击、未保存');
  } else {
    const box = page.locator(`[data-vb="${EVENT}"]`);
    if (needChan) {
      await box.locator('.el-checkbox').filter({ hasText: '旺云控制台' }).first().click({ force: true });
      await page.waitForTimeout(600);
    }
    if (needSw) {
      await box.locator('.el-switch').first().click({ force: true });
      await page.waitForTimeout(600);
    }
    // 整页只有一个保存，取最后一个
    const saves = page.locator('button').filter({ hasText: /^保\s*存$/ });
    const n = await saves.count();
    await saves.nth(n - 1).click({ force: true });
    await page.waitForTimeout(2500);

    const toast = await page.evaluate(() =>
      [...document.querySelectorAll('.el-message,.el-notification')]
        .map(e => e.innerText.replace(/\s+/g, ' ')).join(' || ') || '无提示');
    out.push(`  已点击并保存，toast=${toast}`);

    // 刷新复核（toast 可能是空，唯一可信是刷新后状态）
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await page.evaluate(list => {
      document.querySelectorAll('[data-vb]').forEach(e => e.removeAttribute('data-vb'));
      for (const t of list) {
        const hs = [...document.querySelectorAll('*')]
          .filter(e => e.children.length === 0 && e.textContent.trim() === t);
        if (!hs.length) continue;
        let b = hs[0];
        for (let i = 0; i < 6 && b; i++) {
          if (b.querySelector && b.querySelector('.el-switch') && b.querySelector('table')) break;
          b = b.parentElement;
        }
        if (b) b.setAttribute('data-vb', t);
      }
    }, TITLES);
    const after = await readCard(EVENT);
    out.push(`  刷新后 通道=${after.chanOn === null ? '无控件' : after.chanOn ? '已勾' : '未勾'} 开关=${fmt(after.swOn)} => ${(after.chanOn === true && after.swOn === true) === ENABLE ? '已落库' : '未落库，请人工核对'}`);
  }

  // ---- 3. 全页复核（保存是全局的，必须看清其它卡片）----
  if (ALL) {
    out.push('');
    out.push('【全页复核】');
    for (const t of TITLES) {
      const s = await readCard(t);
      if (!s) { out.push(`  ${t} :: 未找到`); continue; }
      out.push(`  ${t} | 通道=${s.chanOn === null ? '无' : s.chanOn ? '√' : '×'} | 开关=${fmt(s.swOn)}`);
    }
  }

  out.push('');
  out.push(DRY_RUN ? 'DRY_RUN 模式：以上为读数结果，未做任何修改。' : '已执行写入。');
  return out.join('\n');
}
