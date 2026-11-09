async page => {
  // 核销管理 → 团购券设置：按券名绑定团购内容（网费 = 现金 + 赠送）
  // 三个必填下拉全空也会被拦截：使用限制 / 单人核销次数 / 使用时间（最后这个最容易漏）
  // 老会员券：使用限制选「不限制」，不选等级限制（店主要求）
  const B = 'https://wyb.5188cloud.net';
  const URL = B + '/marketManage/verificationManagement/groupSet';

  const CFG = [
    { name: '【马年限定不限购可叠加】29.9元得35元网费', cash: 29.9, gift: 5.1, limit: '不限制' },
    { name: '【老会员】网费特惠29.9享35｜不限购可叠加',   cash: 29.9, gift: 5.1, limit: '不限制' },
    { name: '【新老会员通用】99享308网费畅玩套餐',       cash: 99,   gift: 209, limit: '不限制' },
  ];

  const ONLY = -1;
  const SAVE = true;
  const log = [];
  const targets = ONLY >= 0 ? [CFG[ONLY]] : CFG;

  const openPage = async () => {
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5200);
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
    // 等表格真正渲染出来（网络慢时 5200ms 不够，会有行读不到）
    for (let i = 0; i < 25; i++) {
      const ok = await page.evaluate(() => {
        const vis = e => e && e.offsetParent !== null;
        const rows = [...document.querySelectorAll('.el-table__body tbody tr')].filter(vis);
        const total = (document.querySelector('.el-pagination__total') || {}).innerText || '';
        return rows.length > 0 && /共/.test(total);
      });
      if (ok) return;
      await page.waitForTimeout(800);
    }
  };

  const openEdit = async (name) => page.evaluate(name => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    const r = [...document.querySelectorAll('.el-table__body tbody tr')].filter(vis).find(x => n(x.innerText).includes(name));
    if (!r) return 'ROW NOT FOUND';
    const b = [...r.querySelectorAll('button,span')].filter(vis).find(x => n(x.innerText) === '编辑');
    if (!b) return 'EDIT BTN NOT FOUND';
    b.click();
    return 'ok';
  }, name);

  const pickSelect = async (labelPart, optionText) => {
    const opened = await page.evaluate(labelPart => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const vis = e => e && e.offsetParent !== null;
      const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
      if (!d) return 'NO DIALOG';
      const it = [...d.querySelectorAll('.el-form-item')].filter(vis)
        .find(i => n(i.querySelector('.el-form-item__label')?.innerText).includes(labelPart));
      if (!it) return 'NO ITEM ' + labelPart;
      const w = it.querySelector('.el-select__wrapper');
      if (!w) return 'NO SELECT ' + labelPart;
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

  // 读三个必填下拉当前显示值
  const readState = async () => page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
    if (!d) return {};
    const get = lp => {
      const it = [...d.querySelectorAll('.el-form-item')].filter(vis)
        .find(i => n(i.querySelector('.el-form-item__label')?.innerText).includes(lp));
      if (!it) return 'NO ITEM';
      return n(it.querySelector('.el-select__placeholder')?.innerText) || '(空)';
    };
    return { 使用限制: get('使用限制'), 单人核销次数: get('单人核销次数'), 使用时间: get('使用时间') };
  });

  for (const c of targets) {
    try {
      await openPage();
      const opened = await openEdit(c.name);
      log.push(`【${c.name}】open=${opened}`);
      if (opened !== 'ok') continue;
      await page.waitForTimeout(2600);

      // 1) 使用限制
      log.push('  使用限制→' + c.limit + ' = ' + await pickSelect('使用限制', c.limit));

      // 2) 三个必填下拉补齐，最多三轮（改使用限制会连带重置核销次数 / 使用时间）
      for (let round = 0; round < 3; round++) {
        const st = await readState();
        const todo = [];
        if (st['单人核销次数'] !== '不限制次数') todo.push(['单人核销次数', '不限制次数']);
        if (st['使用时间'] !== '不限制时间') todo.push(['使用时间', '不限制时间']);
        if (!todo.length) { log.push('  必填下拉 = ' + JSON.stringify(st)); break; }
        for (const [lp, v] of todo) {
          const r = await pickSelect(lp, v);
          if (r !== 'ok') log.push(`  补 ${lp} = ${r}`);
        }
        if (round === 2) log.push('  三轮后仍不齐 = ' + JSON.stringify(await readState()));
      }

      // 3) 清掉已挂的商品
      const cleared = await page.evaluate(() => {
        const vis = e => e && e.offsetParent !== null;
        const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
        let n = 0;
        [...d.querySelectorAll('.good-item')].filter(vis).forEach(it => {
          const b = it.querySelector('.icon-delete');
          if (b) { b.click(); n++; }
        });
        return n;
      });
      await page.waitForTimeout(900);
      const leftover = await page.evaluate(() => {
        const vis = e => e && e.offsetParent !== null;
        const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
        return [...d.querySelectorAll('.good-item')].filter(vis).length;
      });
      log.push(`  清商品 deleted=${cleared} 剩余=${leftover}`);

      // 4) 填网费
      const fee = await page.evaluate(({ cash, gift }) => {
        const vis = e => e && e.offsetParent !== null;
        const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
        const it = [...d.querySelectorAll('.el-form-item')].filter(vis)
          .find(i => (i.querySelector('.el-form-item__label')?.innerText || '').includes('团购内容'));
        if (!it) return 'NO CONTENT ITEM';
        const setVal = (inp, v) => {
          const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          proto.set.call(inp, String(v));
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.dispatchEvent(new Event('blur', { bubbles: true }));
        };
        const a = it.querySelector('input[placeholder="现金"]');
        const b = it.querySelector('input[placeholder="请输入"]');
        if (!a || !b) return 'NO FEE INPUT';
        setVal(a, cash); setVal(b, gift);
        return 'cash=' + a.value + ' gift=' + b.value;
      }, { cash: c.cash, gift: c.gift });
      log.push('  网费 = ' + fee);
      await page.waitForTimeout(700);

      if (!SAVE) { log.push('  SAVE=false 不提交'); continue; }

      // 5) 确定 → 确认框 确定
      let api = null;
      const onResp = async r => {
        if (!/thirdCoupon\/bindGoods/.test(r.url())) return;
        try { const t = await r.text(); api = { status: r.status(), body: t.replace(/\s+/g, ' ').slice(0, 120) }; } catch (e) { }
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
      await page.waitForTimeout(800);
    } catch (e) {
      log.push(`  异常: ${String(e.message).split('\n')[0]}`);
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
