// ============================================================
// 新建「充值赠送活动」—— 充值满 X 元，赠送抽奖 N 次
// 入口：会员促销 → 充值赠送活动  /memberActivityManage/rechargeGift
//       「添 加」新开独立页 /netBar/addMemberActivity?actType=recharge（不是弹窗）
//
// 页面语义是 **档位制**：「充值满 [cash] 元 ，赠送抽奖 [n] 次」，最多 6 档（.prizeItemBorder）。
// 一档除抽奖次数外，还能同时挂「赠送专场卡」和「商品（最多9个）」。
// 接口（activitiesInfo/detail）明文：type=9，prizeList[].cash=门槛，
//   prizeRelationList[].prizeType=4 即「赠送抽奖N次」，prizeNum=N。
//
// 用法: playwright-cli run-code --filename scripts/create-recharge-gift.js
// 默认只填不存（SAVE=false）；确认无误后改 true 再跑一次
// ============================================================
async page => {
  const SAVE = true;

  const CFG = {
    name: '充值每满50送1次抽奖',
    validity: 'long',        // long = 长久有效 / range = 时间范围（选 range 还要填起止）
    open: true,              // 开启活动
    // 档位：cash=充值门槛（元），lottery=赠送抽奖次数。最多 6 条
    // 注意：这是档位制不是累进制。多档时系统按「满足的最高档」发一份奖品包（未实测累加行为）
    rules: [
      {cash: 50,  lottery: 1},
      {cash: 100, lottery: 2},
      {cash: 150, lottery: 3},
      {cash: 200, lottery: 4},
      {cash: 250, lottery: 5},
      {cash: 300, lottery: 6},
    ],
  };

  const log = [];

  await page.goto('https://wyb.5188cloud.net/netBar/addMemberActivity?actType=recharge',
                  {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(3000);

  // ---------- 1. 活动名称 ----------
  const nm = await page.evaluate((v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const inp = document.querySelector('input[placeholder="请输入活动名称"]');
    if (!inp) return 'not found';
    setter.call(inp, v);
    inp.dispatchEvent(new Event('input', {bubbles: true}));
    inp.dispatchEvent(new Event('change', {bubbles: true}));
    return inp.value;
  }, CFG.name);
  log.push('名称: ' + nm);

  // ---------- 2. 有效期 ----------
  const vd = await page.evaluate((want) => {
    const fis = [...document.querySelectorAll('.el-form-item')];
    const fi = fis.find(f => ((f.querySelector('.el-form-item__label') || {}).innerText || '').includes('有效期'));
    const target = want === 'long' ? '长久有效' : '时间范围';
    const r = [...fi.querySelectorAll('.el-radio')].find(x => (x.innerText || '').replace(/\s/g, '') === target);
    if (r && !(r.querySelector('input') || {}).checked) r.click();
    return [...fi.querySelectorAll('.el-radio')].map(x => ({
      t: (x.innerText || '').replace(/\s/g, ''), on: !!(x.querySelector('input') || {}).checked
    }));
  }, CFG.validity);
  await page.waitForTimeout(500);
  log.push('有效期: ' + JSON.stringify(vd));

  // ---------- 3. 补齐档位数（「添加规则」） ----------
  const need = CFG.rules.length;
  let cur = await page.evaluate(() => document.querySelectorAll('.prizeItemBorder').length);
  for (let i = cur; i < need; i++) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /添\s*加\s*规\s*则/.test(x.innerText));
      if (b) b.click();
    });
    await page.waitForTimeout(900);
  }
  log.push('档位: ' + cur + ' -> ' + (await page.evaluate(() => document.querySelectorAll('.prizeItemBorder').length)));

  // ---------- 4. 填每档：门槛 + 抽奖次数 ----------
  const filled = await page.evaluate((rules) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const put = (el, v) => {
      setter.call(el, String(v));
      el.dispatchEvent(new Event('input', {bubbles: true}));
      el.dispatchEvent(new Event('change', {bubbles: true}));
      el.dispatchEvent(new Event('blur', {bubbles: true}));
    };
    const blocks = [...document.querySelectorAll('.prizeItemBorder')];
    const out = [];
    rules.forEach((r, i) => {
      const b = blocks[i];
      if (!b) { out.push({idx: i, err: 'no block'}); return; }
      const nums = [...b.querySelectorAll('input[type=number]')];
      if (nums.length < 2) { out.push({idx: i, err: '仅 ' + nums.length + ' 个数字框'}); return; }
      put(nums[0], r.cash);      // 充值满 ___ 元
      put(nums[1], r.lottery);   // 赠送抽奖 ___ 次
      out.push({idx: i, cash: nums[0].value, lottery: nums[1].value});
    });
    return out;
  }, CFG.rules);
  await page.waitForTimeout(700);
  log.push('档位填写: ' + JSON.stringify(filled));

  // ---------- 5. 开启活动 ----------
  if (CFG.open) {
    await page.evaluate(() => {
      const s = document.querySelector('.el-switch__input');
      if (s && s.getAttribute('aria-checked') !== 'true') (s.closest('.el-switch') || s).click();
    });
    await page.waitForTimeout(600);
  }
  log.push('开启活动: ' + (await page.evaluate(() =>
    [...document.querySelectorAll('.el-switch__input')].map(s => s.getAttribute('aria-checked')).join(','))));

  // ---------- 6. 回读 ----------
  const readback = await page.evaluate(() => {
    const fis = [...document.querySelectorAll('.el-form-item')];
    const vfi = fis.find(f => ((f.querySelector('.el-form-item__label') || {}).innerText || '').includes('有效期'));
    return {
      name: (document.querySelector('input[placeholder="请输入活动名称"]') || {}).value,
      validity: [...vfi.querySelectorAll('.el-radio')].filter(x => (x.querySelector('input') || {}).checked)
                  .map(x => (x.innerText || '').replace(/\s/g, '')),
      switchOn: [...document.querySelectorAll('.el-switch__input')].map(s => s.getAttribute('aria-checked')),
      rules: [...document.querySelectorAll('.prizeItemBorder')].map(b => {
        const nums = [...b.querySelectorAll('input[type=number]')];
        return {
          text: (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70),
          cash: nums[0] ? nums[0].value : null,
          lottery: nums[1] ? nums[1].value : null
        };
      }),
      errors: [...document.querySelectorAll('.el-form-item__error')].map(e => (e.innerText || '').trim()).filter(Boolean)
    };
  });

  if (!SAVE) return JSON.stringify({saved: false, log, readback}, null, 1);

  // ---------- 7. 保存提交 ----------
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /保\s*存\s*提\s*交/.test(x.innerText));
    if (b) b.click();
  });
  const snaps = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(700);
    let s = null;
    try {
      s = await page.evaluate(() => ({
        msg: [...document.querySelectorAll('.el-message')].map(m => (m.innerText || '').trim()).filter(Boolean),
        box: [...document.querySelectorAll('.el-message-box')].filter(b => b.offsetParent !== null)
               .map(b => (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160)),
        errs: [...document.querySelectorAll('.el-form-item__error')].map(e => (e.innerText || '').trim()).filter(Boolean),
        url: location.href
      }));
    } catch (e) { break; }
    snaps.push(s);
    if (s.msg.length || s.box.length) break;
  }
  return JSON.stringify({saved: true, log, readback, snaps}, null, 1);
}
