// ============================================================
// 批量设置「兑换所需积分」（积分兑换，不是换购）
// 入口：销售管理 → 商超管理 → 商品管理（/marketManage/goodsManage/shop/goods）
//
// 关键：积分兑换与换购是两个独立机制
//   积分兑换 = integral 字段 = 本脚本只改这个
//   换购     = exchange / exchangePrice（凭证 + 加价）← 本脚本绝不触碰
//
// DOM 结构（不按这个写会串号，见 references/10-上架路径.md 四之三）：
//   商品行是 tr.goods_tr（td[2]=商品名, td[6]=兑换所需积分）
//   用 .el-table__body tbody tr 会命中"分类展开行"，点到的是该分类第一个商品
//
// 用法: playwright-cli run-code --filename scripts/set-goods-points.js
// ============================================================
async page => {
  // name 必须与表格里 td[2] 的文本完全一致；pts = 兑换所需积分
  const JOBS = [
    { name: '茶里王', pts: 100 },
    { name: '统一阿萨姆奶茶', pts: 100 },
    { name: '茶π乌龙茶', pts: 125 },
    { name: '营养快线水蜜桃味', pts: 125 },
    { name: '冰糖雪梨', pts: 75 },
  ];

  // 1 元 = N 积分 的换算（本店取 25：4 元饮料 = 100 分 ≈ 签到 10 天）
  const RATE = 25;

  const out = [];

  const waitNoDialog = async () => {
    for (let i = 0; i < 25; i++) {
      const n = await page.evaluate(() =>
        [...document.querySelectorAll('.el-dialog')].filter(e => e.offsetParent !== null).length);
      if (n === 0) return true;
      await page.waitForTimeout(200);
    }
    return false;
  };

  for (const job of JOBS) {
    await waitNoDialog();

    const opened = await page.evaluate((nm) => {
      const tr = [...document.querySelectorAll('tr.goods_tr')].find(t => {
        const tds = t.querySelectorAll('td');
        return tds[2] && (tds[2].innerText || '').trim() === nm;
      });
      if (!tr) return 'row-not-found';
      const b = [...tr.querySelectorAll('button')].find(x => (x.innerText || '').trim() === '编辑');
      if (!b) return 'no-btn';
      b.click();
      return 'ok';
    }, job.name);
    if (opened !== 'ok') { out.push({ ...job, err: opened }); continue; }

    // 等弹窗真正切到这个商品（数量=1 且文本含商品名）
    let matched = false;
    for (let i = 0; i < 30; i++) {
      matched = await page.evaluate((nm) => {
        const ds = [...document.querySelectorAll('.el-dialog')].filter(e => e.offsetParent !== null);
        return ds.length === 1 && (ds[0].innerText || '').includes(nm);
      }, job.name);
      if (matched) break;
      await page.waitForTimeout(250);
    }
    if (!matched) {
      out.push({ ...job, err: 'dialog-mismatch' });
      await page.keyboard.press('Escape');
      await waitNoDialog();
      continue;
    }

    const res = await page.evaluate((j) => {
      const d = [...document.querySelectorAll('.el-dialog')].filter(e => e.offsetParent !== null)[0];
      const inp = [...d.querySelectorAll('input')].find(i => (i.placeholder || '').includes('兑换所需积分'));
      if (!inp) return { err: 'no-pts-input' };
      const before = inp.value;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, String(j.pts));
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      inp.dispatchEvent(new Event('blur', { bubbles: true }));
      return { before, wrote: inp.value, nameOk: (d.innerText || '').includes(j.name) };
    }, job);
    if (res.err || !res.nameOk) {
      out.push({ ...job, err: res.err || 'name-lost' });
      await page.keyboard.press('Escape');
      await waitNoDialog();
      continue;
    }
    await page.waitForTimeout(450);

    const saved = await page.evaluate(() => {
      const ds = [...document.querySelectorAll('.el-dialog')].filter(e => e.offsetParent !== null);
      if (ds.length !== 1) return 'dialog-count-' + ds.length;
      const b = [...ds[0].querySelectorAll('button')].find(x => /保\s*存/.test(x.innerText || ''));
      if (!b) return 'no-save';
      b.click();
      return 'ok';
    });
    await page.waitForTimeout(1600);
    const toast = await page.evaluate(() =>
      [...document.querySelectorAll('.el-message')].map(e => (e.innerText || '').trim()).join(','));
    out.push({ name: job.name, pts: job.pts, before: res.before, wrote: res.wrote, saved, toast });

    await waitNoDialog();
  }

  // 回读：tr.goods_tr 的 td[6] input 值
  const readback = await page.evaluate(() =>
    [...document.querySelectorAll('tr.goods_tr')].map(t => {
      const tds = [...t.querySelectorAll('td')];
      const i = tds[6] ? tds[6].querySelector('input') : null;
      return [(tds[2]?.innerText || '').trim(), i ? i.value : ''];
    }).filter(x => x[0] && x[1]));

  return JSON.stringify({ rate: RATE, out, readback }, null, 1);
}
