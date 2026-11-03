async page => {
  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const log = [];
  const BASE = 'https://wyb.5188cloud.net';

  // 只跑指定 key（'' = 全跑）；SKIP 里的跳过。同名策略已存在也会自动跳过（可重复跑）
  const ONLY = '';
  const SKIP = [];
  const SAVE = true;

  const LIST = {
    riskGroup: '/memberActivityManage/strategy/riskGroup/list',
    highRisk: '/memberActivityManage/strategy/highRisk/list',
    highNetWroth: '/memberActivityManage/strategy/highNetWroth/list',
    onlineCrowd: '/memberActivityManage/strategy/onlineCrowd/list',
    longTime: '/memberActivityManage/strategy/computerLongTime/list',
    memberBirthday: '/memberActivityManage/strategy/memberBirthday/birthday',
    salesDay: '/memberActivityManage/strategy/salesDay/list',
  };

  // form: coupon = 策略名称/礼包/开放规则/券有效期/属性/渠道/促销文案/开关
  //       gift   = 活动名称/有效期/适用会员等级/礼包/开关（生日、促销日那种「发礼包」页）
  // 🔴 actType 和列表 key 不是一回事：上机超长列表叫 computerLongTime，添加页叫 longTime
  const CFG = [
    { key: 'riskGroup',     actType: 'riskGroup',     form: 'coupon', crowd: '风险人群',       name: '风险唤回-30元网费+红牛', gift: '测试-只送网费30加红牛', days: 7,
      msg: '老板喊你回来啦！到店送你30元网费+红牛1瓶，7天内有效。' },
    { key: 'highRisk',      actType: 'highRisk',      form: 'coupon', crowd: '高危人群',       name: '高危唤回-免费上机5小时', gift: '免费上网5小时',         days: 7,
      msg: '好久不见！免费上网5小时请你了，7天内有效，回店即用。' },
    { key: 'highNetWroth',  actType: 'highNetWroth',  form: 'coupon', crowd: '高净值人群',     name: '高净值留存-包时卡+网费', gift: '测试-包时卡加网费',     days: 15,
      msg: '感谢老顾客一直支持！赠你5小时包时卡1张，15天内有效。' },
    { key: 'onlineCrowd',   actType: 'onlineCrowd',   form: 'coupon', crowd: '线上人群',       name: '线上激活-30元网费+红牛', gift: '测试-只送网费30加红牛', days: 7,
      msg: '新人福利：送你30元网费+红牛1瓶，7天内到店上机即用。' },
    { key: 'longTime',      actType: 'longTime',      form: 'coupon', crowd: '上机超时长人群', name: '超长时段加送-5小时',     gift: '免费上网5小时',         days: 7,
      msg: '坐得够久，给你加钟：5小时包时卡1张，7天内有效。' },
    { key: 'memberBirthday', actType: 'memberBirthday', form: 'gift', crowd: '会员生日',      name: '生日礼-30元网费+红牛',   gift: '测试-只送网费30加红牛',
      msg: '生日快乐！送你30元网费+红牛1瓶，来店一起玩。' },
    { key: 'salesDay',      actType: 'salesDay',      form: 'coupon', crowd: '促销日',         name: '促销日-到店送5小时',     gift: '免费上网5小时',         days: 3,
      msg: '会员日到店福利：免费上网5小时，3天内有效。' },
  ];

  const CHANNELS = ['旺旺宝网吧版APP', '公众号'];
  const ENABLE = true; // 开启活动

  const toast = async () => page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('.el-message')].map(e => n(e.innerText));
  });

  const visibleSwitch = () => page.evaluate(() =>
    [...document.querySelectorAll('.el-switch')].filter(e => e.offsetParent !== null)
      .map(e => e.classList.contains('is-checked'))[0]);

  // 礼包弹窗：打开 → 搜名称 → 勾行 → 确认选择
  const pickGift = async (giftName, L) => {
    const opened = await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      const b = [...document.querySelectorAll('button')].filter(isVis).find(x => /选择礼包/.test(n(x.innerText)));
      if (!b) return 'NOT FOUND';
      b.click();
      return 'ok';
    });
    L.push('打开礼包弹窗 = ' + opened);
    await page.waitForTimeout(2500);

    await page.locator('input[placeholder*="礼包名称"]').last().fill(giftName);
    await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      const ds = [...document.querySelectorAll('.el-dialog')].filter(isVis);
      const d = ds[ds.length - 1];
      const b = [...d.querySelectorAll('button')].filter(isVis).find(x => /搜\s*索/.test(n(x.innerText)));
      if (b) b.click();
    });
    await page.waitForTimeout(2500);

    const picked = await page.evaluate((gift) => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      const ds = [...document.querySelectorAll('.el-dialog')].filter(isVis);
      const d = ds[ds.length - 1];
      if (!d) return 'NO DIALOG';
      const rows = [...d.querySelectorAll('.el-table__body tbody tr')].filter(isVis);
      const r = rows.find(x => n(x.innerText).includes(gift));
      if (!r) return 'ROW NOT FOUND: ' + JSON.stringify(rows.map(x => n(x.innerText)));
      const cb = r.querySelector('.el-checkbox');
      if (!cb) return 'NO CHECKBOX';
      if (!cb.classList.contains('is-checked')) cb.querySelector('.el-checkbox__inner').click();
      return 'row=' + n(r.innerText) + ' rows=' + rows.length;
    }, giftName);
    L.push('勾选礼包 = ' + picked);
    await page.waitForTimeout(700);

    const confirmed = await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      const ds = [...document.querySelectorAll('.el-dialog')].filter(isVis);
      const d = ds[ds.length - 1];
      const b = [...d.querySelectorAll('button')].filter(isVis).find(x => /确认选择/.test(n(x.innerText)));
      if (!b) return 'NOT FOUND';
      b.click();
      return 'ok';
    });
    L.push('确认选择 = ' + confirmed);
    await page.waitForTimeout(2000);

    const back = await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      const it = [...document.querySelectorAll('.el-form-item')].filter(isVis)
        .find(i => n(i.querySelector('.el-form-item__label')?.innerText).includes('礼包设置'));
      return n(it?.innerText || '');
    });
    L.push('礼包回读 = ' + back);
    return back;
  };

  // 适用会员等级：没勾就勾「所有等级」（它是独立选项，不是全选）
  const pickAllLevels = async (L) => {
    const has = await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      return !!([...document.querySelectorAll('.el-form-item')].filter(isVis)
        .find(i => n(i.querySelector('.el-form-item__label')?.innerText).includes('适用会员等级')));
    });
    if (!has) { L.push('适用会员等级 = 本页无此字段'); return; }
    const state = await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      return [...document.querySelectorAll('.el-checkbox')].filter(isVis)
        .map(b => n(b.innerText) + '=' + b.classList.contains('is-checked'));
    });
    L.push('会员等级(初) = ' + JSON.stringify(state));
    const anyChecked = await page.evaluate(() => {
      const isVis = el => el && el.offsetParent !== null;
      return [...document.querySelectorAll('.el-checkbox')].filter(isVis)
        .some(b => b.classList.contains('is-checked'));
    });
    if (!anyChecked) {
      await page.locator('.el-checkbox').filter({ hasText: '所有等级' }).first()
        .locator('.el-checkbox__inner').click();
      await page.waitForTimeout(500);
      L.push('勾选所有等级');
    }
  };

  const submitAndVerify = async (c, L) => {
    const hits = [];
    const onReq = r => {
      const u = r.url();
      if (/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)(\?|$)/.test(u)) return;
      if (!/5188cloud/.test(u)) return;
      if (!/\/business-(wy|merchant|erppro)\//.test(u)) return;
      hits.push(r.method() + ' ' + u.replace('https://wyb.5188cloud.net', '').split('?')[0]);
    };
    page.on('request', onReq);
    await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      const b = [...document.querySelectorAll('button')].filter(isVis).find(x => /保存提交/.test(n(x.innerText)));
      if (b) b.click();
    });
    await page.waitForTimeout(1500);
    L.push('toast = ' + JSON.stringify(await toast()));
    await page.waitForTimeout(3000);
    page.off('request', onReq);
    L.push('提交接口 = ' + JSON.stringify([...new Set(hits)]));
    L.push('提交后 URL = ' + page.url().replace('https://wyb.5188cloud.net', ''));

    await page.goto(BASE + LIST[c.key], { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const rows = await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      return [...document.querySelectorAll('.el-table__body tbody tr')].filter(isVis)
        .map(r => n(r.innerText)).slice(0, 3);
    });
    L.push('--- 列表前几行 ---');
    rows.forEach(t => L.push('  ' + t));
    L.push(rows.some(t => t.includes(c.name)) ? '✅ 已出现在列表' : '❌ 列表未见');
  };

  const open = async c => {
    await page.goto(BASE + '/netBar/addMemberActivity?actType=' + c.actType, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[placeholder="请输入活动名称"]', { timeout: 30000 });
    await page.waitForTimeout(1200);
  };

  // ---------- 券型策略 ----------
  const buildCoupon = async c => {
    const L = [];
    L.push(`=== ${c.crowd}（${c.key} / actType=${c.actType}）券型 ===`);
    await open(c);
    await page.locator('input[placeholder="请输入活动名称"]').first().fill(c.name);
    L.push('名称 = ' + c.name);

    const giftBack = await pickGift(c.gift, L);
    if (!giftBack || giftBack.includes('请选择礼包') || giftBack.length < 8) {
      L.push('❌ 礼包没选上，中止（不提交）');
      return L;
    }

    await pickAllLevels(L);

    // 活动开放规则 → 每日
    await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      const it = [...document.querySelectorAll('.el-form-item')].filter(isVis)
        .find(i => n(i.querySelector('.el-form-item__label')?.innerText).includes('活动开放规则'));
      it?.querySelector('.el-select__wrapper')?.click();
    });
    await page.waitForTimeout(1000);
    const rulePick = await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const hit = [...document.querySelectorAll('.el-select-dropdown__item')]
        .filter(e => e.offsetParent !== null).find(e => n(e.innerText) === '每日');
      if (!hit) return 'NOT FOUND';
      hit.click();
      return 'ok';
    });
    L.push('开放规则 = 每日 / ' + rulePick);
    await page.waitForTimeout(1200);

    const dayIn = page.locator('input[placeholder="有效天数"]').first();
    if (await dayIn.count()) {
      await dayIn.fill(String(c.days));
      L.push('有效天数 = ' + c.days);
    } else L.push('有效天数输入框 = 缺失');

    // 发送渠道（短信一律不勾）——必须真实点击 .el-checkbox__inner
    for (const name of CHANNELS) {
      await page.locator('.el-checkbox').filter({ hasText: name }).first()
        .locator('.el-checkbox__inner').click();
      await page.waitForTimeout(250);
    }
    const smsBox = page.locator('.el-checkbox').filter({ hasText: '短信' }).first();
    if (await smsBox.count()) {
      if ((await smsBox.getAttribute('class') || '').includes('is-checked')) {
        await smsBox.locator('.el-checkbox__inner').click();
        await page.waitForTimeout(250);
      }
    }
    const chkState = await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      return [...document.querySelectorAll('.el-checkbox')].filter(isVis)
        .map(e => n(e.innerText) + '=' + e.classList.contains('is-checked'));
    });
    L.push('勾选态 = ' + JSON.stringify(chkState));

    // 促销文案：每勾一个渠道就出现必填输入框，不填提交报「请检查是否填写完整」
    await page.waitForTimeout(700);
    const msgInputs = page.locator('input[placeholder*="促销文案可用于发送通知"]');
    const msgCount = await msgInputs.count();
    for (let i = 0; i < msgCount; i++) {
      await msgInputs.nth(i).fill(c.msg);
      await page.waitForTimeout(200);
    }
    L.push(`促销文案 = ${msgCount} 个框 → ` + JSON.stringify(
      await page.evaluate(() => [...document.querySelectorAll('input[placeholder*="促销文案可用于发送通知"]')]
        .filter(e => e.offsetParent !== null).map(e => e.value))));

    // 开启活动（JS click 对 el-switch 无效，必须真实点击）
    const swBefore = await visibleSwitch();
    if (swBefore !== ENABLE) {
      await page.locator('.el-switch').first().click();
      await page.waitForTimeout(400);
    }
    L.push('开启活动 = was=' + swBefore + ' now=' + await visibleSwitch());

    const before = await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      return [...document.querySelectorAll('.el-form-item')].filter(isVis).map(it => n(it.innerText).slice(0, 80));
    });
    L.push('--- 提交前 ---');
    before.forEach(t => L.push('  ' + t));

    if (!SAVE) { L.push('SAVE=false，停在此处'); return L; }
    await submitAndVerify(c, L);
    return L;
  };

  // ---------- 礼包型策略（生日） ----------
  const buildGift = async c => {
    const L = [];
    L.push(`=== ${c.crowd}（${c.key} / actType=${c.actType}）礼包型 ===`);
    await open(c);
    await page.locator('input[placeholder="请输入活动名称"]').first().fill(c.name);
    L.push('名称 = ' + c.name);
    L.push('有效期 = 保持默认「长久有效」');

    await pickAllLevels(L);

    const giftBack = await pickGift(c.gift, L);
    if (!giftBack || giftBack.includes('请选择礼包') || giftBack.length < 8) {
      L.push('❌ 礼包没选上，中止（不提交）');
      return L;
    }

    const swBefore = await visibleSwitch();
    if (swBefore !== ENABLE) {
      await page.locator('.el-switch').first().click();
      await page.waitForTimeout(400);
    }
    L.push('开启活动 = was=' + swBefore + ' now=' + await visibleSwitch());

    const before = await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      return [...document.querySelectorAll('.el-form-item')].filter(isVis).map(it => n(it.innerText).slice(0, 80));
    });
    L.push('--- 提交前 ---');
    before.forEach(t => L.push('  ' + t));

    if (!SAVE) { L.push('SAVE=false，停在此处'); return L; }
    await submitAndVerify(c, L);
    return L;
  };

  const targets = CFG.filter(c => (ONLY ? c.key === ONLY : true) && !SKIP.includes(c.key));
  log.push('待建 ' + targets.length + ' 条，SAVE=' + SAVE + '，开启活动=' + ENABLE);
  for (const c of targets) {
    // 幂等：列表里已有同名策略就跳过，避免重复建
    await page.goto(BASE + LIST[c.key], { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const exists = await page.evaluate((name) => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      return [...document.querySelectorAll('.el-table__body tbody tr')].filter(isVis)
        .some(r => n(r.innerText).includes(name));
    }, c.name);
    if (exists) {
      log.push(`⏭ ${c.crowd}：已存在「${c.name}」，跳过`);
      log.push('');
      continue;
    }
    try {
      const L = c.form === 'gift' ? await buildGift(c) : await buildCoupon(c);
      log.push(...L);
    } catch (e) {
      log.push(`❌ ${c.crowd} 异常：${e.message.split('\n')[0]}`);
    }
    log.push('');
  }
  return log.join('\n');
}
