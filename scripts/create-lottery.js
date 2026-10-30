// ============================================================
// 新建「幸运转盘」抽奖活动
// 入口：活动管理 → 积分活动 → 转盘抽奖 → 「添 加」
//      会新开独立页 /netBar/addActivity?actType=lottery（不是弹窗）
//
// 关键机制：积分参与次数上限填 0 = 关闭积分抽奖。
//   填 0 后页面出现系统提示「不发放积分抽奖，顾客仍可参与赠送抽奖。」
//   即：顾客不能花积分抽，只能用活动赠送的「抽奖次数」抽。
//
// 用法: playwright-cli run-code --filename scripts/create-lottery.js
// 默认只填不存（SAVE=false）；确认无误后改 true 再跑一次
// ============================================================
async page => {
  const SAVE = false;

  const CFG = {
    name: '88元网费幸运转盘',
    limitTimes: 0,     // ★ 积分参与次数上限：0 = 禁用积分抽奖，只走赠送次数
    prizes: [
      // kind='prize' 选「奖品」；kind='thanks' 选「谢谢参与」
      // kind='thanks' 时系统自动隐藏「奖项数量」和奖品内容，不占库存
      {name: '88元网费', qty: 100, pct: 10, kind: 'prize', fee: 88},
      {name: '谢谢参与', pct: 90, kind: 'thanks'}
    ]
  };

  const log = [];

  await page.goto('https://wyb.5188cloud.net/netBar/addActivity?actType=lottery',
                  {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(3200);

  // ---------- 1. 活动名称 ----------
  await page.evaluate((n) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const fis = [...document.querySelectorAll('.el-form-item')];
    const fi = fis.find(f => ((f.querySelector('.el-form-item__label') || {}).innerText || '').includes('活动名称'));
    const inp = fi.querySelector('input');
    setter.call(inp, n);
    inp.dispatchEvent(new Event('input', {bubbles: true}));
    inp.dispatchEvent(new Event('change', {bubbles: true}));
  }, CFG.name);
  log.push('名称: ' + CFG.name);

  // ---------- 2. 参与人限制（默认已选「不限制」） ----------
  const people = await page.evaluate(() => {
    const fis = [...document.querySelectorAll('.el-form-item')];
    const fi = fis.find(f => ((f.querySelector('.el-form-item__label') || {}).innerText || '').includes('参与人限制'));
    const t = [...fi.querySelectorAll('.el-checkbox, .el-radio')].find(x => (x.innerText || '').replace(/\s/g, '') === '不限制');
    if (t && !(t.querySelector('input') || {}).checked) t.click();
    return [...fi.querySelectorAll('.el-checkbox, .el-radio')].map(x => ({
      t: (x.innerText || '').replace(/\s/g, ''),
      on: !!(x.querySelector('input') || {}).checked
    }));
  });
  await page.waitForTimeout(400);
  log.push('参与人: ' + JSON.stringify(people));

  // ---------- 3. 积分参与次数上限 = 0（封死积分抽奖） ----------
  const before = await page.evaluate((limit) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const fis = [...document.querySelectorAll('.el-form-item')];
    const fi = fis.find(f => ((f.querySelector('.el-form-item__label') || {}).innerText || '').includes('参与抽奖设置'));
    const ins = [...fi.querySelector('.chance-settings').querySelectorAll('input[type=number]')];
    const b = ins.map(i => i.value);
    setter.call(ins[0], String(limit));
    ins[0].dispatchEvent(new Event('input', {bubbles: true}));
    ins[0].dispatchEvent(new Event('change', {bubbles: true}));
    ins[0].dispatchEvent(new Event('blur', {bubbles: true}));
    return b;
  }, CFG.limitTimes);
  await page.waitForTimeout(700);
  log.push('次数上限: ' + before[0] + ' -> ' + CFG.limitTimes);

  // ---------- 4. 追加奖项到目标数量 ----------
  const need = CFG.prizes.length;
  const cur = await page.evaluate(() => document.querySelectorAll('.prizeItemBorder').length);
  for (let i = cur; i < need; i++) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /追\s*加\s*奖\s*项/.test(x.innerText));
      if (b) b.click();
    });
    await page.waitForTimeout(900);
  }
  const afterAdd = await page.evaluate(() => document.querySelectorAll('.prizeItemBorder').length);
  log.push('奖项块: ' + cur + ' -> ' + afterAdd);

  // ---------- 5. 填奖项（名称 / 数量 / 概率 / 类型） ----------
  const filled = await page.evaluate((prizes) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const put = (el, v) => {
      setter.call(el, String(v));
      el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
      el.dispatchEvent(new Event('blur', {bubbles: true}));
    };
    const blocks = [...document.querySelectorAll('.prizeItemBorder')];
    const out = [];
    prizes.forEach((p, i) => {
      const b = blocks[i];
      if (!b) { out.push({idx: i, err: 'no block'}); return; }
      const nameIn = b.querySelector('input[placeholder="请输入奖项名称"]');
      const qtyIn = b.querySelector('input[placeholder="请输入奖项数量"]');
      const pctIn = b.querySelector('input[placeholder="请输入中奖概率"]');
      if (nameIn) put(nameIn, p.name);
      if (qtyIn && p.qty != null) put(qtyIn, p.qty);
      if (pctIn) put(pctIn, p.pct);
      const rb = [...b.querySelectorAll('.el-radio-button')]
        .find(x => (x.innerText || '').replace(/\s/g, '') === (p.kind === 'thanks' ? '谢谢参与' : '奖品'));
      if (rb) rb.click();
      out.push({idx: i, name: p.name, qty: p.qty, pct: p.pct, kind: p.kind});
    });
    return out;
  }, CFG.prizes);
  await page.waitForTimeout(900);

  // ---------- 6. 「奖品」类型才填赠送网费 ----------
  const feeSet = await page.evaluate((prizes) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const blocks = [...document.querySelectorAll('.prizeItemBorder')];
    const res = [];
    prizes.forEach((p, i) => {
      if (p.kind !== 'prize' || p.fee == null) { res.push({idx: i, skip: true}); return; }
      const num = blocks[i].querySelector('input[type=number]');
      if (!num) { res.push({idx: i, err: 'no fee input'}); return; }
      setter.call(num, String(p.fee));
      num.dispatchEvent(new Event('input', {bubbles: true}));
      num.dispatchEvent(new Event('change', {bubbles: true}));
      num.dispatchEvent(new Event('blur', {bubbles: true}));
      res.push({idx: i, fee: num.value});
    });
    return res;
  }, CFG.prizes);
  await page.waitForTimeout(600);
  log.push('赠送网费: ' + JSON.stringify(feeSet));

  // ---------- 7. 回读整表 ----------
  const readback = await page.evaluate(() => {
    const fis = [...document.querySelectorAll('.el-form-item')];
    const fi = fis.find(f => ((f.querySelector('.el-form-item__label') || {}).innerText || '').includes('参与抽奖设置'));
    return {
      name: (document.querySelector('input[placeholder="请输入活动名称"]') || {}).value,
      chance: [...document.querySelectorAll('.chance-settings input[type=number]')].map(i => i.value),
      chanceText: ((fi || {}).innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      openTime: (document.querySelector('input[placeholder="选择活动开放时间"]') || {}).value,
      endTime: (document.querySelector('input[placeholder="选择活动结束时间"]') || {}).value,
      switchOn: [...document.querySelectorAll('.el-switch__input')].map(s => s.getAttribute('aria-checked')),
      prizes: [...document.querySelectorAll('.prizeItemBorder')].map(b => ({
        name: (b.querySelector('input[placeholder="请输入奖项名称"]') || {}).value,
        qty: (b.querySelector('input[placeholder="请输入奖项数量"]') || {}).value,
        pct: (b.querySelector('input[placeholder="请输入中奖概率"]') || {}).value,
        kind: [...b.querySelectorAll('.el-radio-button')].filter(x => /is-active/.test(x.className)).map(x => (x.innerText || '').replace(/\s/g, ''))[0],
        fee: (b.querySelector('input[type=number]') || {}).value
      }))
    };
  });

  if (!SAVE) return JSON.stringify({saved: false, log, readback}, null, 1);

  // ---------- 8. 开启活动 + 保存提交 ----------
  await page.evaluate(() => {
    const s = document.querySelector('.el-switch__input');
    if (s && s.getAttribute('aria-checked') !== 'true') (s.closest('.el-switch') || s).click();
  });
  await page.waitForTimeout(700);

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /保\s*存\s*提\s*交/.test(x.innerText));
    if (b) b.click();
  });

  // 保存成功后这个标签页会被关掉（URL 变 about:blank），只抓短窗口提示
  const snaps = [];
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(600);
    let s = null;
    try {
      s = await page.evaluate(() => ({
        msg: [...document.querySelectorAll('.el-message')].map(m => (m.innerText || '').trim()).filter(Boolean),
        errs: [...document.querySelectorAll('.el-form-item__error')].map(e => (e.innerText || '').trim()).filter(Boolean),
        url: location.href
      }));
    } catch (e) { break; }
    snaps.push(s);
    if (s.msg.length) break;
  }
  return JSON.stringify({saved: true, log, readback, snaps}, null, 1);
}
