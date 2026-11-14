async page => {
  const log = [];
  const reqs = [];
  const onResp = async r => {
    const u = r.url();
    if (!/goodsInfo|goodsName|goodsCate|goodsUnit/.test(u)) return;
    if (!/POST|PUT/.test(r.request().method())) return;
    let body = '';
    try { body = (await r.request().postData()) || ''; } catch (e) {}
    let resp = '';
    try { resp = (await r.text()).slice(0, 300); } catch (e) {}
    reqs.push({ url: u.replace('https://wyb.5188cloud.net', ''), req: body.slice(0, 400), resp });
  };
  page.on('response', onResp);

  const newName = '测试入库品1114';

  // 回到商品管理列表
  await page.evaluate(() => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    const b = [...document.querySelectorAll('button, span, a')].filter(v)
      .find(x => /^(返回列表|返回商品管理)$/.test(nn(x.innerText)));
    if (b) b.click();
  });
  await page.waitForTimeout(3000);

  // 打开商品入库
  log.push('open=' + await page.evaluate(() => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    const b = [...document.querySelectorAll('button, span, a')].filter(v).find(x => nn(x.innerText) === '商品入库');
    if (!b) return 'NO BTN';
    b.click(); return 'ok';
  }));
  await page.waitForTimeout(3000);

  const pickSelect = async (label, match) => {
    const r = await page.evaluate(l => {
      const v = e => e && e.offsetParent !== null;
      const nn = s => (s || '').replace(/\s+/g, ' ').trim();
      const d = [...document.querySelectorAll('.el-dialog')].filter(v).pop();
      const it = [...d.querySelectorAll('.el-form-item')].filter(v)
        .find(i => nn(i.querySelector('.el-form-item__label')?.innerText).replace(/[：:]/g, '') === l);
      if (!it) return 'NO ITEM';
      const w = it.querySelector('.el-select__wrapper');
      if (!w) return 'NO WRAPPER';
      w.click(); return 'ok';
    }, label);
    if (r !== 'ok') return r;
    await page.waitForTimeout(800);
    const got = await page.evaluate(m => {
      const nn = s => (s || '').replace(/\s+/g, ' ').trim();
      const opts = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.offsetParent !== null);
      const hit = m ? opts.find(o => nn(o.innerText).includes(m)) : opts[0];
      if (!hit) return 'NO OPT';
      hit.click();
      return nn(hit.innerText);
    }, match || '');
    await page.waitForTimeout(1200);
    return got;
  };

  log.push('分类=' + await pickSelect('商品分类', '小食品'));

  // 点商品名称旁的「添 加」
  log.push('点名称添加=' + await page.evaluate(() => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    const d = [...document.querySelectorAll('.el-dialog')].filter(v).pop();
    const it = [...d.querySelectorAll('.el-form-item')].filter(v)
      .find(i => nn(i.querySelector('.el-form-item__label')?.innerText).replace(/[：:]/g, '') === '商品名称');
    if (!it) return 'NO ITEM';
    const b = [...it.querySelectorAll('button, span, a')].filter(v).find(x => nn(x.innerText).replace(/\s+/g, '') === '添加');
    if (!b) return 'NO ADD';
    b.click(); return 'ok';
  }));
  await page.waitForTimeout(2500);

  // 面板里填新商品名
  const filled = await page.evaluate(val => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    const d = [...document.querySelectorAll('.el-dialog')].filter(v).pop();
    const it = [...d.querySelectorAll('.el-form-item')].filter(v)
      .find(i => nn(i.querySelector('.el-form-item__label')?.innerText).replace(/[：:]/g, '') === '商品名称');
    const inp = it && [...it.querySelectorAll('input')].filter(v).find(x => x.placeholder === '请输入商品名称');
    if (!inp) return 'NO INPUT';
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(inp, val);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return inp.value;
  }, newName);
  log.push('填名=' + filled);
  await page.waitForTimeout(600);

  log.push('确认=' + await page.evaluate(() => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    const d = [...document.querySelectorAll('.el-dialog')].filter(v).pop();
    const b = [...d.querySelectorAll('button')].filter(v).find(x => /^确\s*认$/.test(nn(x.innerText)));
    if (!b) return 'NO CONFIRM';
    b.click(); return 'ok';
  }));
  await page.waitForTimeout(3500);

  log.push('面板后名称=' + await page.evaluate(() => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    const d = [...document.querySelectorAll('.el-dialog')].filter(v).pop();
    const it = [...d.querySelectorAll('.el-form-item')].filter(v)
      .find(i => nn(i.querySelector('.el-form-item__label')?.innerText).replace(/[：:]/g, '') === '商品名称');
    return it ? nn(it.innerText).slice(0, 60) : 'NO ITEM';
  }));

  log.push('单位=' + await pickSelect('商品单位', '包'));
  log.push('属性=' + await page.evaluate(() => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    const d = [...document.querySelectorAll('.el-dialog')].filter(v).pop();
    const it = [...d.querySelectorAll('.el-form-item')].filter(v)
      .find(i => nn(i.querySelector('.el-form-item__label')?.innerText).replace(/[：:]/g, '') === '商品属性');
    return it ? nn(it.querySelector('.el-select__placeholder')?.innerText) : 'NO ITEM';
  }));
  await page.waitForTimeout(1500);

  // 填数量 / 出货 / 价格 / 自助购买=否
  const nums = await page.evaluate(() => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    const d = [...document.querySelectorAll('.el-dialog')].filter(v).pop();
    const set = (el, val) => {
      const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      s.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    };
    const out = {};
    const item = l => [...d.querySelectorAll('.el-form-item')].filter(v)
      .find(i => nn(i.querySelector('.el-form-item__label')?.innerText).replace(/[：:]/g, '') === l);
    const q = item('数量'), ship = item('出货到默认吧台（0）'), buy = item('进货价');
    if (q) { const i = q.querySelector('input'); set(i, '1'); out.qty = i.value; }
    if (ship) { const i = ship.querySelector('input'); set(i, '1'); out.ship = i.value; }
    if (buy) { const i = buy.querySelector('input'); set(i, '0.01'); out.buy = i.value; }
    const radioNo = [...d.querySelectorAll('.el-radio-button, .el-radio')].filter(v).find(x => nn(x.innerText) === '否');
    if (radioNo) radioNo.click();
    out.radio = radioNo ? '否 clicked' : 'NO RADIO';
    return out;
  });
  log.push('数量=' + JSON.stringify(nums));
  await page.waitForTimeout(800);

  // 提交（底部「添 加」）
  log.push('submit=' + await page.evaluate(() => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    const d = [...document.querySelectorAll('.el-dialog')].filter(v).pop();
    const btns = [...d.querySelectorAll('.el-dialog__footer button')].filter(v);
    const b = btns.find(x => nn(x.innerText).replace(/\s+/g, '') === '添加');
    if (!b) return 'NO SUBMIT, btns=' + btns.map(x => nn(x.innerText)).join('/');
    b.click(); return 'ok';
  }));
  await page.waitForTimeout(4000);

  const after = await page.evaluate(() => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    const msgs = [...document.querySelectorAll('.el-message')].filter(v).map(e => nn(e.innerText));
    const ds = [...document.querySelectorAll('.el-dialog')].filter(v);
    const errs = ds.length ? [...ds[ds.length - 1].querySelectorAll('.el-form-item__error')].filter(v).map(e => nn(e.innerText)) : [];
    return { msgs, errs, dialogOpen: ds.length > 0 };
  });

  page.off('response', onResp);
  return JSON.stringify({ log, after, reqs }, null, 1);
}
