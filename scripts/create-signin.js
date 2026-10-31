// ============================================================
// 新建「积分签到」活动（签到赠送 / 连续or累计签到 / 多档奖励）
// 入口：活动管理 → 积分活动 → 签到赠送 → 签 到 活 动 设 置 → 新 增
//       新开独立页 /netBar/addActivity?actType=signIn（不是弹窗）
//
// 页面结构（源码级已核）：
//   ① 基础签到设置：签到所需上机时长 / 活动策略启用·结束时间 / 领取期限
//   ② 签到奖励设置：签到模式（连续 / 累计）+ 最多 10 个奖励档位
//      每档 = 「签到 N 天 → 礼品内容（礼包/专场卡/赠送网费/商品）」
//   ③ 保存提交
//
// payload（addSignIn-a9a755cc.js 实读）：{type:18, dataType:0, attr:0|1,
//   limitTime, startTime:'YYYY-MM-DD 00:00:00', endTime:'YYYY-MM-DD 23:59:59',
//   giftDate:1(按天)|0(按日期), giftpackLifespan:N, prizeList:[{name,days,prizeType:1,...}]}
//
// 用法: playwright-cli run-code --filename scripts/create-signin.js
// 默认只填不存（SAVE=false）；确认无误后改 true 再跑一次
// ============================================================
async page => {
  const SAVE = false;          // ← 确认档位与成本后改 true

  // 默认值 = 「稳健方案」（references/14-积分签到.md §十三 运营设计）
  // 要点：上机 1h 当闸门 / 累计签到拉中腰部 / 周期=自然月 / 档位等差偏缓
  const CFG = {
    onlineHours: 1,            // 签到所需上机时长（小时，0=不限制，0.5 步进，上限 24）
                               // ⚠️ 填 0 = 全体会员在家也能签，成本按全量放大
    startDate: '2026-11-01',   // 活动策略启用时间（不能早于今天）
    endDate:   '2026-11-30',   // 活动策略结束时间（= 自然月，决定"多久刷新一次"）
    claimMode: 'days',         // days = 发放日起 N 天内有效；range = 指定日期区间
    claimDays: 7,              // claimMode=days 时生效
    claimStart: '',            // claimMode=range 时填，格式 YYYY-MM-DD
    claimEnd:   '',
    mode: 'cumulative',        // continuous = 连续签到；cumulative = 累计签到
                               // ⚠️ 做活跃度用 cumulative；连续签到只配短周期小额
    // 奖励档位：days = 签到天数（1~365，且不得超过活动周期天数），gift = 赠送网费（元）
    // 一档也可以换成礼包/专场卡/商品，需要时改本脚本的奖励区块
    // 下限档建议给"商品"（饮料/零食，即时兑现），此处用网费是脚本基线
    rewards: [
      {days: 5,  gift: 5},
      {days: 10, gift: 15},
      {days: 15, gift: 30},
      {days: 22, gift: 60},
    ],
  };

  const log = [];

  // ---------- 0. 进列表页，点「新 增」进配置页 ----------
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.left-menu-item')].find(x => (x.innerText || '').trim() === '签到赠送');
    if (b) b.click();
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /新\s*增/.test(x.innerText || ''));
    if (b) b.click();
  });
  await page.waitForTimeout(3500);
  log.push('配置页: ' + (await page.evaluate(() => location.href)));
  if (!/actType=signIn/.test(await page.evaluate(() => location.href))) {
    return JSON.stringify({ok: false, err: '未进入签到配置页', log}, null, 1);
  }

  const put = `(el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
    el.dispatchEvent(new Event('blur', {bubbles: true}));
  }`;

  // ---------- 1. 签到所需上机时长 ----------
  const hours = await page.evaluate(({h}) => {
    const fis = [...document.querySelectorAll('.el-form-item')].filter(f => f.offsetParent !== null);
    const fi = fis.find(f => ((f.querySelector('.el-form-item__label') || {}).innerText || '').includes('上机时长'));
    const inp = fi && fi.querySelector('input[type=number]');
    if (!inp) return 'not found';
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, String(h));
    inp.dispatchEvent(new Event('input', {bubbles: true}));
    inp.dispatchEvent(new Event('change', {bubbles: true}));
    inp.dispatchEvent(new Event('blur', {bubbles: true}));
    return inp.value;
  }, {h: CFG.onlineHours});
  log.push('上机时长: ' + hours);

  // ---------- 2. 领取期限 ----------
  const claim = await page.evaluate(({mode, days}) => {
    const fis = [...document.querySelectorAll('.el-form-item')].filter(f => f.offsetParent !== null);
    const fi = fis.find(f => ((f.querySelector('.el-form-item__label') || {}).innerText || '').includes('领取期限'));
    if (!fi) return 'no field';
    if (mode === 'days') {
      const inp = fi.querySelector('input[placeholder="有效天数"]');
      if (!inp) return 'no days input';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, String(days));
      inp.dispatchEvent(new Event('input', {bubbles: true}));
      inp.dispatchEvent(new Event('change', {bubbles: true}));
      inp.dispatchEvent(new Event('blur', {bubbles: true}));
      return 'days=' + inp.value;
    }
    return 'range mode: 需手工选日期';
  }, {mode: CFG.claimMode, days: CFG.claimDays});
  log.push('领取期限: ' + claim);

  // ---------- 3. 签到模式（连续 / 累计） ----------
  const mode = await page.evaluate(({want}) => {
    const fis = [...document.querySelectorAll('.el-form-item')].filter(f => f.offsetParent !== null);
    const fi = fis.find(f => ((f.querySelector('.el-form-item__label') || {}).innerText || '').includes('签到模式'));
    if (!fi) return 'no field';
    const target = want === 'continuous' ? '连续签到' : '累计签到';
    const r = [...fi.querySelectorAll('.el-radio')].find(x => (x.innerText || '').replace(/\s/g, '') === target);
    if (r && !(r.querySelector('input') || {}).checked) r.click();
    return [...fi.querySelectorAll('.el-radio')]
      .map(x => ({t: (x.innerText || '').replace(/\s/g, ''), on: !!(x.querySelector('input') || {}).checked}));
  }, {want: CFG.mode});
  await page.waitForTimeout(400);
  log.push('签到模式: ' + JSON.stringify(mode));

  // ---------- 4. 日期最后填（改单选会重渲染清空日期） ----------
  for (const [ph, val] of [['请选择启用时间', CFG.startDate], ['请选择结束时间', CFG.endDate]]) {
    const r = await page.evaluate(({ph, val}) => {
      const inp = document.querySelector(`input[placeholder="${ph}"]`);
      if (!inp) return 'not found: ' + ph;
      inp.readOnly = false;                    // 日期框常带 readonly，先摘掉
      inp.removeAttribute('readonly');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, val);
      inp.dispatchEvent(new Event('input', {bubbles: true}));
      inp.dispatchEvent(new Event('change', {bubbles: true}));
      return inp.value;
    }, {ph, val});
    // 回车落到日期上，再点标题收起面板（不要按 Esc，会关掉整个页面/弹窗）
    await page.click(`input[placeholder="${ph}"]`).catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(600);
    await page.mouse.click(5, 5).catch(() => {});
    await page.waitForTimeout(400);
    log.push(`日期[${ph}]: ${r} -> ${await page.evaluate(p => (document.querySelector(`input[placeholder="${p}"]`) || {}).value, ph)}`);
  }

  // ---------- 5. 逐档添加奖励 ----------
  const addReward = async (rw) => {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].filter(x => /添加奖励/.test(x.innerText || '')).pop();
      if (b) b.click();
    });
    await page.waitForTimeout(1200);

    const filled = await page.evaluate(({days, gift}) => {
      const dlg = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null).pop();
      if (!dlg) return 'no dialog';
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const put = (el, v) => {
        setter.call(el, String(v));
        el.dispatchEvent(new Event('input', {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
        el.dispatchEvent(new Event('blur', {bubbles: true}));
      };
      const fis = [...dlg.querySelectorAll('.el-form-item')];
      // 天数：label 含「签到天数」
      const dayFi = fis.find(f => /签到天数/.test((f.querySelector('.el-form-item__label') || {}).innerText || ''));
      const dayInp = dayFi && dayFi.querySelector('input[type=number]');
      if (!dayInp) return 'no days input';
      put(dayInp, days);
      // 赠送网费：礼品内容区块里的 input-number（placeholder=请输入）
      const giftFi = fis.find(f => /礼品内容/.test((f.querySelector('.el-form-item__label') || {}).innerText || ''));
      const giftInp = giftFi && giftFi.querySelector('input[type=number]');
      if (giftInp) put(giftInp, gift);
      return {days: dayInp.value, gift: giftInp ? giftInp.value : null};
    }, rw);
    await page.waitForTimeout(400);

    // 确定
    const ok = await page.evaluate(() => {
      const dlg = [...document.querySelectorAll('.el-dialog')].filter(d => d.offsetParent !== null).pop();
      if (!dlg) return 'no dialog';
      const b = [...dlg.querySelectorAll('button')].find(x => /确\s*定/.test(x.innerText || ''));
      if (b) { b.click(); return 'clicked'; }
      return 'no ok btn';
    });
    await page.waitForTimeout(900);
    const errs = await page.evaluate(() =>
      [...document.querySelectorAll('.el-form-item__error, .el-message')].map(e => (e.innerText || '').trim()).filter(Boolean));
    log.push(`档位 ${rw.days}天/${rw.gift}元: ${JSON.stringify(filled)} ${ok} ${errs.length ? 'ERR=' + JSON.stringify(errs) : ''}`);
  };

  // 已有档位先清零（重复运行时避免叠加）
  const exist = await page.evaluate(() => document.querySelectorAll('.el-table__body tr').length);
  if (exist > 0) log.push('⚠ 页面已有 ' + exist + ' 个档位，本次为增量添加');

  for (const rw of CFG.rewards) await addReward(rw);

  // ---------- 6. 回读 ----------
  const readback = await page.evaluate(() => {
    const vis = el => el && el.offsetParent !== null;
    const txt = el => (el ? (el.innerText || '').replace(/\s+/g, ' ').trim() : '');
    const fis = [...document.querySelectorAll('.el-form-item')].filter(vis);
    const pick = kw => {
      const fi = fis.find(f => ((f.querySelector('.el-form-item__label') || {}).innerText || '').includes(kw));
      return fi ? txt(fi.querySelector('.el-form-item__content') || fi) : null;
    };
    return {
      hours: pick('上机时长'),
      start: (document.querySelector('input[placeholder="请选择启用时间"]') || {}).value,
      end: (document.querySelector('input[placeholder="请选择结束时间"]') || {}).value,
      claim: pick('领取期限'),
      mode: [...document.querySelectorAll('.el-radio')].filter(vis)
        .filter(r => (r.querySelector('input') || {}).checked).map(txt),
      rows: [...document.querySelectorAll('.el-table__body tr')].filter(vis)
        .map(tr => [...tr.querySelectorAll('td')].map(td => txt(td)).filter(Boolean)),
      errors: [...document.querySelectorAll('.el-form-item__error')].map(e => txt(e)).filter(Boolean),
    };
  });

  if (!SAVE) return JSON.stringify({saved: false, log, readback}, null, 1);

  // ---------- 7. 保存提交 ----------
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /保\s*存\s*提\s*交/.test(x.innerText || ''));
    if (b) b.click();
  });
  const snaps = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(800);
    let s = null;
    try {
      s = await page.evaluate(() => ({
        msg: [...document.querySelectorAll('.el-message')].map(m => (m.innerText || '').trim()).filter(Boolean),
        errs: [...document.querySelectorAll('.el-form-item__error')].map(e => (e.innerText || '').trim()).filter(Boolean),
        url: location.href,
      }));
    } catch (e) { break; }
    snaps.push(s);
    if (s.msg.length) break;
  }
  return JSON.stringify({saved: true, log, readback, snaps}, null, 1);
}
