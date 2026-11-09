async page => {
  // 只读：团购券设置 → 逐条打开「团购关联」弹窗，核对实际绑了什么
  // 列表的「团购内容」列只是摘要（如 `39.9元得100*1`），看不出是网费还是商品
  // 输出每行：名称 | 使用限制 | 单人核销 | 使用时间 | 礼品套餐 | 专场卡 | 商品 | 网费现金 | 网费赠送
  const URL = 'https://wyb.5188cloud.net/marketManage/verificationManagement/groupSet';

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
      const rows = [...document.querySelectorAll('.el-table__body tbody tr')].filter(vis);
      return rows.length > 0 && /共/.test((document.querySelector('.el-pagination__total') || {}).innerText || '');
    });
    if (ok) break;
    await page.waitForTimeout(800);
  }

  const names = await page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const vis = e => e && e.offsetParent !== null;
    return [...document.querySelectorAll('.el-table__body tbody tr')].filter(vis)
      .map(tr => n(tr.querySelectorAll('td')[0].innerText));
  });

  // 场所名（券列表是场所级数据，先确认读到的是哪一家）
  const place = await page.evaluate(() => {
    const n = s => (s || '').replace(/\s+/g, ' ').trim();
    const h = document.querySelector('.el-header');
    if (!h) return '(no header)';
    const skip = /^(管理员|超级管理员|店长|收银员|AI 旺.*|退出|退出登录|首页|消息|设置|在线客服.*|商务咨询.*)$/;
    return [...new Set([...h.querySelectorAll('*')].map(e => n(e.innerText))
      .filter(t => t && !skip.test(t) && t.length <= 30))].slice(0, 3).join(' / ');
  });
  const line = ['场所=' + place, '条数=' + names.length];
  for (let idx = 0; idx < names.length; idx++) {
    const opened = await page.evaluate(i => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const vis = e => e && e.offsetParent !== null;
      const r = [...document.querySelectorAll('.el-table__body tbody tr')].filter(vis)[i];
      if (!r) return 'NO ROW';
      const b = [...r.querySelectorAll('button,span')].filter(vis).find(x => n(x.innerText) === '编辑');
      if (!b) return 'NO EDIT';
      b.click();
      return 'ok';
    }, idx);
    if (opened !== 'ok') { line.push(`${idx + 1} | ${names[idx]} | ${opened}`); continue; }
    await page.waitForTimeout(2600);

    const d = await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const vis = e => e && e.offsetParent !== null;
      const dlg = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
      if (!dlg) return { err: 'NO DIALOG' };
      const itemOf = lp => [...dlg.querySelectorAll('.el-form-item')].filter(vis)
        .find(i => n(i.querySelector('.el-form-item__label')?.innerText).includes(lp));
      const sel = lp => {
        const it = itemOf(lp);
        if (!it) return '(无此项)';
        return n(it.querySelector('.el-select__placeholder')?.innerText) || '(空)';
      };
      const content = itemOf('团购内容');
      const btn = t => {
        const b = [...content.querySelectorAll('button')].filter(vis)
          .find(x => n(x.innerText).includes(t));
        return b ? n(b.innerText) : '(NO BTN)';
      };
      const cash = content.querySelector('input[placeholder="现金"]');
      const gift = content.querySelector('input[placeholder="请输入"]');
      const goods = [...content.querySelectorAll('.goods-table .good-item')].filter(vis).map(g => {
        const num = g.querySelector('input[placeholder="数量"]');
        return n(g.querySelector('.left-name')?.innerText) + '×' + (num ? num.value : '?');
      });
      return {
        名称: n(dlg.querySelector('.el-table__body')?.innerText) || n(dlg.innerText).split('使用限制')[0],
        使用限制: sel('使用限制'),
        单人核销次数: sel('单人核销次数'),
        使用时间: sel('使用时间'),
        礼品套餐: btn('礼品套餐'),
        专场卡: btn('专场卡'),
        商品: goods.length ? goods.join(' + ') : '(无)',
        网费: (cash && cash.value ? cash.value : '0') + '+' + (gift && gift.value ? gift.value : '0'),
      };
    });

    line.push([idx + 1, names[idx], d.使用限制, d.单人核销次数, d.使用时间, d.礼品套餐, d.专场卡, d.商品, d.网费, d.err || ''].join(' | '));

    // 只读：不保存，点「取 消」关掉
    await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const vis = e => e && e.offsetParent !== null;
      const dlg = [...document.querySelectorAll('.el-dialog')].filter(vis).pop();
      const b = [...dlg.querySelectorAll('button')].filter(vis).find(x => /^取\s*消$/.test(n(x.innerText)));
      if (b) b.click();
    });
    await page.waitForTimeout(1400);
  }

  return line.join('\n');
}
