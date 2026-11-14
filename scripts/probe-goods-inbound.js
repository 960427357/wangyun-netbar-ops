async page => {
  const URL = 'https://wyb.5188cloud.net/marketManage/goodsManage/shop/goods';
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  for (let i = 0; i < 30; i++) {
    const st = await page.evaluate(() => {
      const vis = e => e && e.offsetParent !== null;
      const rows = [...document.querySelectorAll('.el-table__body tbody tr')].filter(vis).length;
      const t = (document.querySelector('.el-pagination__total') || {}).innerText || '';
      const m = String(t).match(/共\s*(\d+)\s*条/);
      return { rows, total: m ? +m[1] : 0 };
    });
    if (st.total > 0 && st.rows >= 1) break;
    await page.waitForTimeout(800);
  }

  const head = await page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    const h = document.querySelector('.el-header');
    const place = h ? [...new Set([...h.querySelectorAll('*')].map(e => n(e.innerText))
      .filter(t => t && t.length <= 30 && !/^(管理员|退出|首页|消息|设置)$/.test(t)))].slice(0, 2).join(' / ') : '?';
    const btns = [...document.querySelectorAll('.avue-crud__left button, .avue-crud__left span, .avue-crud__left a')]
      .filter(vis).map(e => n(e.innerText)).filter(Boolean);
    const heads = [...document.querySelectorAll('.el-table__header th')].filter(vis).map(th => n(th.innerText)).filter(Boolean);
    const total = n((document.querySelector('.el-pagination__total') || {}).innerText);
    return { place, btns: [...new Set(btns)], heads, total, url: location.href };
  });

  // 打开「商品入库」
  const opened = await page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    const b = [...document.querySelectorAll('.avue-crud__left button, .avue-crud__left span, .avue-crud__left a, button')]
      .filter(vis).find(x => n(x.innerText) === '商品入库');
    if (!b) return 'NO BTN';
    b.click();
    return 'ok';
  });
  await page.waitForTimeout(3000);

  const dlg = await page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
    if (!d) return { err: 'NO DIALOG' };
    const items = [...d.querySelectorAll('.el-form-item')].filter(vis).map(i => {
      const label = n(i.querySelector('.el-form-item__label')?.innerText);
      const ph = n(i.querySelector('.el-select__placeholder')?.innerText);
      const inputs = [...i.querySelectorAll('input')].filter(vis)
        .map(x => ({ type: x.type, ph: x.placeholder, v: x.value, dis: x.disabled }));
      const radios = [...i.querySelectorAll('.el-radio-button, .el-radio')].filter(vis).map(x => n(x.innerText));
      const cbs = [...i.querySelectorAll('.el-checkbox')].filter(vis).map(x => n(x.innerText));
      const req = !!i.querySelector('.is-required');
      return { label, req, ph, inputs, radios, cbs };
    });
    const btns = [...d.querySelectorAll('.el-dialog__footer button, .el-dialog__header button')].filter(vis).map(x => n(x.innerText));
    return {
      title: n(d.querySelector('.el-dialog__title')?.innerText),
      cls: String(d.className),
      width: d.style.width,
      items,
      btns,
      text: n(d.innerText).slice(0, 800),
    };
  });

  // 只读，关掉
  await page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    const d = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
    if (!d) return;
    const b = [...d.querySelectorAll('button')].filter(vis)
      .find(x => /^(关\s*闭|取\s*消)$/.test(n(x.innerText)));
    if (b) b.click();
  });

  return JSON.stringify({ head, opened, dlg }, null, 1);
}
