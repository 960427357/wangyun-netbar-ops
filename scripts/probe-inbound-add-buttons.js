async page => {
  const n = s => (s || '').replace(/\s+/g, ' ').trim();
  const vis = e => e && e.offsetParent !== null;

  // 确保「商品入库」弹窗是打开的
  const ensureOpen = async () => {
    const has = await page.evaluate(() => {
      const v = e => e && e.offsetParent !== null;
      const d = [...document.querySelectorAll('.el-dialog')].filter(v).pop();
      return d ? (d.querySelector('.el-dialog__title') || {}).innerText : '';
    });
    if (/商品入库/.test(has || '')) return 'already';
    await page.evaluate(() => {
      const v = e => e && e.offsetParent !== null;
      const b = [...document.querySelectorAll('button, span, a')].filter(v).find(x => (x.innerText || '').replace(/\s+/g, '').trim() === '商品入库');
      if (b) b.click();
    });
    await page.waitForTimeout(3000);
    return 'opened';
  };

  const openAdd = async label => {
    const r = await page.evaluate(l => {
      const v = e => e && e.offsetParent !== null;
      const nn = s => (s || '').replace(/\s+/g, ' ').trim();
      const d = [...document.querySelectorAll('.el-dialog')].filter(v).pop();
      if (!d) return 'NO DIALOG';
      const it = [...d.querySelectorAll('.el-form-item')].filter(v)
        .find(i => nn(i.querySelector('.el-form-item__label')?.innerText).replace(/[：:]/g, '') === l);
      if (!it) return 'NO ITEM';
      const b = [...it.querySelectorAll('button, span, a')].filter(v)
        .find(x => nn(x.innerText).replace(/\s+/g, '') === '添加');
      if (!b) return 'NO ADD BTN';
      b.click();
      return 'clicked';
    }, label);
    await page.waitForTimeout(2600);
    return r;
  };

  const dumpTop = async () => {
    return await page.evaluate(() => {
      const v = e => e && e.offsetParent !== null;
      const nn = s => (s || '').replace(/\s+/g, ' ').trim();
      const ds = [...document.querySelectorAll('.el-dialog')].filter(v);
      const d = ds[ds.length - 1];
      if (!d) return { err: 'NO DIALOG', count: ds.length };
      const items = [...d.querySelectorAll('.el-form-item')].filter(v).map(i => ({
        label: nn(i.querySelector('.el-form-item__label')?.innerText).replace(/[：:]\s*$/, ''),
        ph: nn(i.querySelector('.el-select__placeholder')?.innerText),
        inputs: [...i.querySelectorAll('input')].filter(v).map(x => ({
          ph: x.placeholder || '', t: x.type, v: x.value })),
        radios: [...i.querySelectorAll('.el-radio-button,.el-radio')].filter(v).map(x => nn(x.innerText)),
        upload: !!i.querySelector('.el-upload'),
        switches: [...i.querySelectorAll('.el-switch')].filter(v).length,
      }));
      return {
        count: ds.length,
        titles: ds.map(x => nn(x.querySelector('.el-dialog__title')?.innerText)),
        title: nn(d.querySelector('.el-dialog__title')?.innerText),
        items,
        btns: [...new Set([...d.querySelectorAll('button')].filter(v).map(x => nn(x.innerText)).filter(Boolean))],
        text: nn(d.innerText).slice(0, 700),
        url: location.href,
      };
    });
  };

  const closeTop = async () => {
    await page.evaluate(() => {
      const v = e => e && e.offsetParent !== null;
      const nn = s => (s || '').replace(/\s+/g, ' ').trim();
      const ds = [...document.querySelectorAll('.el-dialog')].filter(v);
      const d = ds[ds.length - 1];
      if (!d) return;
      const b = [...d.querySelectorAll('button')].filter(v)
        .find(x => /^(取\s*消|关\s*闭)$/.test(nn(x.innerText)));
      if (b) b.click();
    });
    await page.waitForTimeout(1200);
  };

  const out = {};
  out.open = await ensureOpen();
  for (const label of ['商品分类', '商品名称', '商品单位']) {
    const click = await openAdd(label);
    const d = await dumpTop();
    out[label] = { click, dialog: d };
    await closeTop();
  }
  return JSON.stringify(out, null, 1);
}
