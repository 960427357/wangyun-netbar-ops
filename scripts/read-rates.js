/**
 * 旺云商户端 · 区域费率读取（纯只读，不改任何配置）
 * 用法：playwright-cli run-code --filename scripts/read-rates.js
 * 前置：浏览器已登录 wyb.5188cloud.net
 * 输出：8 个区域的四档费率 + 临时卡费率明细，markdown 表
 */

async page => {
  const AREAS = ['默认区域','曲屏区域','电竞区','包间1','包间2','大厅','包间3','包间4'];
  const URL = 'https://wyb.5188cloud.net/msBarOptions/area';

  // 1. 直达区域方案页
  await page.goto(URL, {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(2500);

  const rows = [];
  for (const area of AREAS) {
    // 2. 拦截该区域的规则接口
    const waiter = page.waitForResponse(
      r => r.url().includes('billing_policy/area/rules') && r.status() === 200,
      {timeout: 15000}
    ).catch(() => null);

    await page.getByText(area, {exact:true}).first().click({force:true}).catch(()=>{});
    const resp = await waiter;

    let rule = null, details = [];
    if (resp) {
      try {
        const data = (await resp.json()).data || {};
        rule = data.rule || null;
        details = data.details || [];
      } catch (e) { /* ignore */ }
    }
    if (!rule) { rows.push({area, err:'接口未返回'}); continue; }

    // 3. 切到临时卡档，读费率明细（当前可见 pane）
    await page.getByRole('tab', {name:'临时卡', exact:true}).first().click({force:true}).catch(()=>{});
    await page.waitForTimeout(900);
    const grid = await page.evaluate(() => {
      const pane = [...document.querySelectorAll('.el-tab-pane')]
        .find(p => p.getBoundingClientRect().height > 0 && p.innerText.includes('起步价'));
      if (!pane) return '?';
      const tr = pane.querySelector('.el-table__body tbody tr');
      if (!tr) return '?';
      const cells = [...tr.children].slice(1).map(c => c.innerText.trim());
      const uniq = [...new Set(cells)];
      return uniq.length === 1 ? uniq[0] : uniq.join('/'); // 全时段同值只留一个
    });

    // 4. 包夜（bboRule=1）
    const night = details
      .filter(d => d.bboRule === 1)
      .map(d => `${hm(d.iuseTimeb)}-${hm(d.iuseTimee)} ${d.iprice/100}元`)
      .join(' / ') || '无';

    const y = c => (c ? (c.iMinFee/100) : '-');
    const u = c => (c ? (c.iUnit/100) : '-');

    rows.push({
      area,
      plan: rule.srulename || rule.guid,
      temp:  `${y(rule.temp)}/${u(rule.temp)}`,
      fee:   `${y(rule.fee)}/${u(rule.fee)}`,
      time:  `${y(rule.time)}/${u(rule.time)}`,
      chain: `${y(rule.chain)}/${u(rule.chain)}`,
      grid,
      night
    });
  }

  function hm(sec) {
    const h = Math.floor(sec/3600) % 24;
    return String(h).padStart(2,'0') + ':00';
  }

  const head = '| 区域 | 方案 | 临时卡 起/单 | 计费卡 起/单 | 计时卡 起/单 | 连锁卡 起/单 | 费率明细 | 包夜 |\n|---|---|---|---|---|---|---|---|';
  const body = rows.map(r => r.err
    ? `| ${r.area} | ${r.err} | - | - | - | - | - | - |`
    : `| ${r.area} | ${r.plan} | ${r.temp} | ${r.fee} | ${r.time} | ${r.chain} | ${r.grid} | ${r.night} |`
  ).join('\n');

  return '\n' + head + '\n' + body + '\n\n（起=起步价元，单=单位价元；费率明细为临时卡全时段值。只读未改配置。）';
}
