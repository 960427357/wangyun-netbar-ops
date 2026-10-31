/**
 * 只读：销售总览（商超管理 → 商品管理 → 销售总览）
 * 路由 /marketManage/goodsManage/shop/goodsSale
 *
 * 用法：
 *   playwright-cli run-code --filename scripts/read-goods-sale.js
 *
 * 读四块：
 *   ① 半年收入卡（销售收入 / 进货金额 / 销售差额 × 最近 6 个月）
 *   ② 汇总（销售数量 / 销售金额 / 积分兑换）
 *   ③ 分类明细（点「分类明细」单选，一次全出）
 *   ④ 商品明细（行级流水，10 条/页，自动翻页抓全量）
 * 输出：按商品聚合的销量榜、按支付渠道/获取方式/来源/销售人员分布、异常项。
 *
 * ⭐「销售人员」= 员工提成归属（取员工档案的「姓名」，不是昵称）。
 *   空白 = 这单没人拿提成，不会自动转给「操作人」。有名字也不一定有提成，
 *   还要过岗位/场景/起征点（见 references/07 §2.3.6 与 13-员工激励）。
 *
 * 🔴 只读，不点「搜索/清空」，不改任何值。
 * 🔴 时间范围：默认是**当月**（页面不显示，控件文本是「-」，但查询带当月区间）。
 *    要换区间只能点日期控件手选——请求体是 RSA 密文，直连 fetch 返回 406「非法访问」。
 */
async (page) => {
  await page.goto('https://wyb.5188cloud.net/marketManage/goodsManage/shop/goodsSale',
    {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(9000);

  const readTop = () => page.evaluate(() => {
    const txt = document.body.innerText;
    const flat = txt.replace(/\n{2,}/g, '\n');

    // ① 半年卡：ul.sale_income 里每个 li = 月份 + 三个数字
    const months = [...document.querySelectorAll('.sale_income li')]
      .map(li => [...li.querySelectorAll('div')].map(d => d.innerText.trim()))
      .filter(a => a.length >= 4 && /^\d{4}-\d{2}月?$/.test(a[0].replace('月', '') + ''))
      .map(a => ({
        月份: a[0].replace('月', ''),
        销售收入: parseFloat(a[1]) || 0,
        进货金额: parseFloat(a[2]) || 0,
        销售差额: parseFloat(a[3]) || 0,
      }));

    // ② 汇总行：销售数量：51 销售金额：336.03 积分兑换：68
    const grab = (k) => {
      const m = flat.match(new RegExp(k + '[：:]\\s*([\\d.]+)'));
      return m ? parseFloat(m[1]) : null;
    };
    const totals = {
      销售数量: grab('销售数量'),
      销售金额: grab('销售金额'),
      积分兑换: grab('积分兑换'),
    };

    return {说明: (flat.match(/（不包含[^）]*）/) || [''])[0], months, totals};
  });

  // ④ 商品明细：翻页抓全量
  const collectRows = async () => {
    const out = [];
    for (let p = 1; p <= 30; p++) {
      const rows = await page.evaluate(() => {
        const t = [...document.querySelectorAll('.el-table')].filter(x => x.offsetParent !== null)[0];
        if (!t) return [];
        const heads = [...t.querySelectorAll('thead th')].map(e => e.innerText.trim());
        return [...t.querySelectorAll('tbody tr')].map(r => {
          const td = [...r.querySelectorAll('td')].map(c => c.innerText.trim().replace(/\n/g, ' '));
          if (td.length < 13) return null;
          const o = {};
          heads.forEach((h, i) => { if (h) o[h] = td[i]; });
          return o;
        }).filter(Boolean);
      });
      out.push(...rows);
      const next = page.locator('.el-pager li').filter({hasText: new RegExp('^' + (p + 1) + '$')}).first();
      if (await next.count() === 0) break;
      await next.click({force: true});
      await page.waitForTimeout(2500);
    }
    return out;
  };

  const top = await readTop();
  const goods = await collectRows();

  // ③ 分类明细
  await page.locator('.el-radio-button', {hasText: '分类明细'}).first().click({force: true});
  await page.waitForTimeout(3000);
  const byCate = await page.evaluate(() => {
    const t = [...document.querySelectorAll('.el-table')].filter(x => x.offsetParent !== null)[0];
    if (!t) return [];
    return [...t.querySelectorAll('tbody tr')].map(r => {
      const td = [...r.querySelectorAll('td')].map(c => c.innerText.trim());
      if (td.length < 5) return null;
      return {分类: td[0], 数量: parseInt(td[1], 10) || 0, 金额: parseFloat(td[2]) || 0,
        进货: parseFloat(td[3]) || 0, 差额: parseFloat(td[4]) || 0};
    }).filter(Boolean);
  });

  // 聚合
  const num = (s) => parseFloat(String(s).replace(/[^\d.-]/g, '')) || 0;
  const agg = {};
  const pay = {}, obt = {}, src = {};
  const seller = {};   // 销售人员 = 提成归属人（姓名，不是昵称）
  for (const r of goods) {
    const n = r['商品名称'];
    if (!n) continue;
    const q = parseInt(r['数量'], 10) || 0;
    const a = num(r['金额/积分']);
    agg[n] = agg[n] || {商品: n, 分类: r['分类名称'], 数量: 0, 金额: 0, 次数: 0};
    agg[n].数量 += q; agg[n].金额 += a; agg[n].次数 += 1;
    pay[r['支付渠道']] = (pay[r['支付渠道']] || 0) + a;
    // 空白 = 这单没人计提成
    const s = (r['销售人员'] || '').trim() || '(空白·无人计提成)';
    seller[s] = seller[s] || {销售人员: s, 件: 0, 元: 0, 笔: 0};
    seller[s].件 += q; seller[s].元 += a; seller[s].笔 += 1;
    obt[r['获取方式']] = (obt[r['获取方式']] || 0) + 1;
    src[r['来源']] = (src[r['来源']] || 0) + q;
  }
  const rank = Object.values(agg).sort((a, b) => b.金额 - a.金额)
    .map(x => ({...x, 金额: +x.金额.toFixed(2)}));

  // 日期范围 + 每日分布（验证「不选时间 = 当月」）
  const dates = goods.map(r => (r['日期'] || '').slice(0, 10)).filter(Boolean).sort();
  const byDay = {};
  for (const r of goods) {
    const d = (r['日期'] || '').slice(0, 10);
    if (!d) continue;
    byDay[d] = byDay[d] || {日: d, 件: 0, 元: 0};
    byDay[d].件 += parseInt(r['数量'], 10) || 0;
    byDay[d].元 += num(r['金额/积分']);
  }
  Object.values(byDay).forEach(x => { x.元 = +x.元.toFixed(2); });

  // 明细金额合计 vs 汇总金额：差额 = 支付渠道为「积分兑换」的行
  const sumDetail = +goods.reduce((s, r) => s + num(r['金额/积分']), 0).toFixed(2);
  const sumPoints = +goods.filter(r => r['支付渠道'] === '积分兑换')
    .reduce((s, r) => s + num(r['金额/积分']), 0).toFixed(2);

  // 异常
  const freeRows = goods.filter(r => num(r['金额/积分']) === 0).length;
  const penny = goods.filter(r => num(r['金额/积分']) > 0 && num(r['金额/积分']) <= 0.01)
    .map(r => `${r['商品名称']}(${r['金额/积分']})`);
  const noCost = goods.filter(r => r['进货金额'] === '--' || r['进货金额'] === '')
    .map(r => r['商品名称']);

  return JSON.stringify({
    口径: top.说明,
    汇总: top.totals,
    半年收入: top.months,
    日期范围: dates.length ? dates[0] + ' ~ ' + dates[dates.length - 1] : '无数据',
    明细行数: goods.length,
    每日分布: Object.values(byDay).sort((a, b) => a.日.localeCompare(b.日)),
    分类明细: byCate,
    商品排行: rank,
    '销售人员(提成归属)': Object.values(seller)
      .map(x => ({...x, 元: +x.元.toFixed(2)}))
      .sort((a, b) => b.元 - a.元),
    支付渠道金额: pay,
    获取方式笔数: obt,
    来源件数: src,
    异常: {
      '金额为0的行数': freeRows,
      '0.01元行': penny,
      '进货金额缺失(记--的商品)': [...new Set(noCost)],
      '明细件数 vs 汇总件数': `${goods.reduce((s, r) => s + (parseInt(r['数量'], 10) || 0), 0)} 件 / ${top.totals.销售数量} 件`,
      '明细金额合计 vs 汇总金额': `明细 ${sumDetail} 元 / 汇总 ${top.totals.销售金额} 元（差 ${(+sumDetail - top.totals.销售金额).toFixed(2)}，应等于积分兑换渠道 ${sumPoints} 元）`,
    },
  }, null, 1);
}
