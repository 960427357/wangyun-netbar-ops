async page => {
  // 团购券设置：把挂在「商品」上的团购内容改成「网费」现金+赠送
  // 为什么：商品代网费只是给吧台发一张券，系统里不算网费收入，核销/提成/交接班都对不上
  // 步骤：开编辑 → 使用限制（已对就不动，动了会重置下面两个）→ 补必填下拉 → 删商品 → 填网费 → 确定 → 二次确认
  const URL = 'https://wyb.5188cloud.net/marketManage/verificationManagement/groupSet';

  const CFG = [
    // 券名（与列表完全一致，取唯一前缀即可）        现金   赠送    使用限制
    // { name: '【首购新客】39.9元得100元网费',      cash: 39.9, gift: 60.1,  limit: '限新会员' },  // 已改完
    { name: '【马年限定不限购可叠加】49.9元得70元网费', cash: 49.9, gift: 20.1,  limit: '不限制' },
    { name: '【马年限定不限购可叠加】29.9元得35元网费', cash: 29.9, gift: 5.1,   limit: '不限制' },
    { name: '【马年限定 首购新客】49.9元得150元网费', cash: 49.9, gift: 100.1, limit: '限新会员' },
    { name: '【新活动 可3张】69.9元得120元网费',      cash: 69.9, gift: 50.1,  limit: '不限制' },
    { name: '【新老会员通用】69.9享120网费',          cash: 69.9, gift: 50.1,  limit: '不限制' },
    { name: '【新会员】39.9享100网费｜限未注册用户',  cash: 39.9, gift: 60.1,  limit: '限新会员' },
    { name: '【老会员】29.9得35网费｜不限购可叠加',   cash: 29.9, gift: 5.1,   limit: '不限制' },
    { name: '【老会员】49.9得70网费｜不限购可叠加',   cash: 49.9, gift: 20.1,  limit: '不限制' },
    { name: '【新会员】49.9享150网费｜限未注册用户',  cash: 49.9, gift: 100.1, limit: '限新会员' },
  ];

  const ONLY = -1;       // -1 = 全跑；>=0 = 只跑这一条（先试跑再全量）
  const SAVE = true;
  const log = [];
  const targets = ONLY >= 0 ? [CFG[ONLY]] : CFG;

  const openPage = async () => {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    await page.evaluate(() => {
      const vis = e => e && e.offsetParent !== null;
      const w = [...document.querySelectorAll('.el-pagination .el-select__wrapper')].filter(vis)[0];
      if (w && !/100/.test(w.innerText)) w.click();
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const hit = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.offsetParent !== null).find(e => n(e.innerText) === '100条/页');
      if (hit) hit.click();
    });
    await page.waitForTimeout(2400);
    for (let i = 0; i < 25; i++) {
      const ok = await page.evaluate(() => {
        const vis = e => e && e.offsetParent !== null;
        return [...document.querySelectorAll('.el-table__body tbody tr')].filter(vis).length > 0
          && /共/.test((document.querySelector('.el-pagination__total') || {}).innerText || '');
      });
      if (ok) return;
      await page.waitForTimeout(800);
    }
  };

  const openEdit = async name => page.evaluate(name => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    const r = [...document.querySelectorAll('.el-table__body tbody tr')].filter(vis).find(x => n(x.innerText).includes(name));
    if (!r) return 'ROW NOT FOUND';
    const b = [...r.querySelectorAll('button,span')].filter(vis).find(x => n(x.innerText) === '编辑');
    if (!b) return 'EDIT BTN NOT FOUND';
    b.click();
    return 'ok';
  }, name);

  const selOf = (labelPart, optionText) => ({ labelPart, optionText });

  const pickSelect = async (labelPart, optionText) => {
    const opened = await page.evaluate(labelPart => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const vis = e => e && e.offsetParent !== null;
      const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
      if (!d) return 'NO DIALOG';
      const it = [...d.querySelectorAll('.el-form-item')].filter(vis)
        .find(i => n(i.querySelector('.el-form-item__label')?.innerText).includes(labelPart));
      if (!it) return 'NO ITEM';
      const w = it.querySelector('.el-select__wrapper');
      if (!w) return 'NO SELECT';
      w.click();
      return 'ok';
    }, labelPart);
    if (opened !== 'ok') return opened;
    await page.waitForTimeout(900);
    const picked = await page.evaluate(t => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const hit = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.offsetParent !== null).find(e => n(e.innerText) === t);
      if (!hit) return 'OPTION NOT FOUND: ' + t;
      hit.click();
      return 'ok';
    }, optionText);
    await page.waitForTimeout(1000);
    return picked;
  };

  // 读弹窗状态：三个下拉 + 已挂商品数 + 网费两个输入框
  const readState = async () => page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
    if (!d) return { err: 'NO DIALOG' };
    const itemOf = lp => [...d.querySelectorAll('.el-form-item')].filter(vis)
      .find(i => n(i.querySelector('.el-form-item__label')?.innerText).includes(lp));
    const get = lp => {
      const it = itemOf(lp);
      if (!it) return '(无此项)';
      return n(it.querySelector('.el-select__placeholder')?.innerText) || '(空)';
    };
    const c = itemOf('团购内容');
    const cash = c && c.querySelector('input[placeholder="现金"]');
    const gift = c && c.querySelector('input[placeholder="请输入"]');
    return {
      使用限制: get('使用限制'),
      单人核销次数: get('单人核销次数'),
      使用时间: get('使用时间'),
      商品数: c ? [...c.querySelectorAll('.good-item')].filter(vis).length : -1,
      商品: c ? [...c.querySelectorAll('.good-item')].filter(vis).map(g => n(g.querySelector('.left-name')?.innerText)) : [],
      现金: cash ? cash.value : '?',
      赠送: gift ? gift.value : '?',
    };
  });

  for (const c of targets) {
    try {
      await openPage();
      const opened = await openEdit(c.name);
      log.push(`【${c.name}】open=${opened}`);
      if (opened !== 'ok') continue;
      await page.waitForTimeout(2600);

      const before = await readState();
      log.push('  改前 = ' + JSON.stringify(before));

      // 1) 使用限制：只有不一致才动（一动手会把核销次数 / 使用时间清空）
      if (before.使用限制 !== c.limit) {
        log.push('  使用限制→' + c.limit + ' = ' + await pickSelect('使用限制', c.limit));
      } else {
        log.push('  使用限制已为 ' + c.limit + '，不动');
      }

      // 2) 补必填下拉，最多三轮；「限新会员」时核销次数不渲染，跳过
      for (let round = 0; round < 3; round++) {
        const st = await readState();
        const todo = [];
        if (st.单人核销次数 === '(空)' || st.单人核销次数 === '') todo.push(['单人核销次数', '不限制次数']);
        if (st.使用时间 !== '不限制时间') todo.push(['使用时间', '不限制时间']);
        if (!todo.length) { log.push('  必填下拉齐 = ' + JSON.stringify({ 使用限制: st.使用限制, 单人核销次数: st.单人核销次数, 使用时间: st.使用时间 })); break; }
        for (const [lp, v] of todo) {
          const r = await pickSelect(lp, v);
          if (r !== 'ok') log.push(`  补 ${lp} = ${r}`);
        }
        if (round === 2) log.push('  三轮后仍不齐 = ' + JSON.stringify(await readState()));
      }

      // 3) 删掉已挂的商品（商品和网费会同时发，必须清干净）
      const cleared = await page.evaluate(() => {
        const n = s => (s || '').replace(/\s+/g, ' ').trim();
        const vis = e => e && e.offsetParent !== null;
        const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
        const it = [...d.querySelectorAll('.el-form-item')].filter(vis)
          .find(i => n(i.querySelector('.el-form-item__label')?.innerText).includes('团购内容'));
        let cnt = 0;
        [...it.querySelectorAll('.good-item')].filter(vis).forEach(g => {
          const b = g.querySelector('.icon-delete');
          if (b) { b.click(); cnt++; }
        });
        return cnt;
      });
      await page.waitForTimeout(1200);
      const st2 = await readState();
      log.push(`  删商品 clicked=${cleared} 剩余=${st2.商品数} ${JSON.stringify(st2.商品)}`);

      // 4) 填网费：现金 / 赠送
      const fee = await page.evaluate(({ cash, gift }) => {
        const n = s => (s || '').replace(/\s+/g, ' ').trim();
        const vis = e => e && e.offsetParent !== null;
        const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
        const it = [...d.querySelectorAll('.el-form-item')].filter(vis)
          .find(i => n(i.querySelector('.el-form-item__label')?.innerText).includes('团购内容'));
        const setVal = (inp, v) => {
          if (!inp) return 'NO INPUT';
          const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          proto.set.call(inp, String(v));
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.dispatchEvent(new Event('blur', { bubbles: true }));
          return inp.value;
        };
        const a = it.querySelector('input[placeholder="现金"]');
        const b = it.querySelector('input[placeholder="请输入"]');
        const r1 = setVal(a, cash);
        const r2 = setVal(b, gift);
        return '现金=' + r1 + ' 赠送=' + r2;
      }, { cash: c.cash, gift: c.gift });
      log.push('  网费 = ' + fee);
      await page.waitForTimeout(900);

      if (!SAVE) { log.push('  SAVE=false 不提交'); continue; }

      // 5) 确定 → 二次确认
      let api = null;
      const onResp = async r => {
        if (!/thirdCoupon\/bindGoods/.test(r.url())) return;
        try { const t = await r.text(); api = { status: r.status(), body: t.replace(/\s+/g, ' ').slice(0, 140) }; } catch (e) { }
      };
      page.on('response', onResp);

      log.push('  点确定 = ' + await page.evaluate(() => {
        const n = s => (s || '').replace(/\s+/g, ' ').trim();
        const vis = e => e && e.offsetParent !== null;
        const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
        const b = [...d.querySelectorAll('button')].filter(vis).find(x => /^确\s*定$/.test(n(x.innerText)));
        if (!b) return 'NO OK BTN';
        b.click();
        return 'ok';
      }));
      await page.waitForTimeout(1800);

      const box = await page.evaluate(() => {
        const n = s => (s || '').replace(/\s+/g, ' ').trim();
        const vis = e => e && e.offsetParent !== null;
        const mb = [...document.querySelectorAll('.el-message-box')].filter(vis).pop();
        if (!mb) return 'NO CONFIRM BOX';
        const b = [...mb.querySelectorAll('button')].filter(vis).find(x => n(x.innerText) === '确定');
        if (!b) return 'NO CONFIRM BTN';
        b.click();
        return 'confirmed';
      });
      log.push('  二次确认 = ' + box);

      if (box === 'NO CONFIRM BOX') {
        const errs = await page.evaluate(() => {
          const n = s => (s || '').replace(/\s+/g, ' ').trim();
          const vis = e => e && e.offsetParent !== null;
          const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
          return [...d.querySelectorAll('.el-form-item__error')].map(e => n(e.innerText)).filter(Boolean);
        });
        log.push('  校验错误 = ' + JSON.stringify(errs));
      }

      for (let i = 0; i < 30 && !api; i++) await page.waitForTimeout(500);
      page.off('response', onResp);
      log.push('  bindGoods = ' + JSON.stringify(api));
      log.push('  toast = ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.el-message')].map(e => (e.innerText || '').replace(/\s+/g, ' ').trim()))));

      // 关掉可能残留的弹窗
      await page.evaluate(() => {
        const n = s => (s || '').replace(/\s+/g, ' ').trim();
        const vis = e => e && e.offsetParent !== null;
        const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
        if (!d) return;
        const b = [...d.querySelectorAll('button')].filter(vis).find(x => /^取\s*消$/.test(n(x.innerText)));
        if (b) b.click();
      });
      await page.waitForTimeout(1200);
    } catch (e) {
      log.push('  异常: ' + String(e.message).split('\n')[0]);
    }
  }

  await openPage();
  const data = await page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    return {
      total: n((document.querySelector('.el-pagination__total') || {}).innerText),
      rows: [...document.querySelectorAll('.el-table__body tbody tr')].filter(vis).map(tr =>
        [...tr.querySelectorAll('td')].map(td => n(td.innerText)).slice(0, 7)),
    };
  });
  log.push('--- 回读 ' + data.total);
  data.rows.forEach((r, i) => log.push([i + 1, ...r].join(' | ')));
  return log.join('\n');
}
