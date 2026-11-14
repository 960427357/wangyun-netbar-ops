// 只读：充值策略 + 分批到账 两个视图一次读全
// 输出：① 策略表（含「分批到账」列与「网民自助购买」开关真实状态）② 分批到账记录表
// 入口是同一路由 netbarConfig/recharge 的 radio 切换，不是左侧菜单
async page => {
  const BASE = 'https://wyb.5188cloud.net/admin/systemSetting/netbarConfig/recharge';

  const waitTable = async (minRows = 1) => {
    for (let i = 0; i < 25; i++) {
      const ok = await page.evaluate(n => {
        const v = e => e && e.offsetParent !== null;
        const rows = [...document.querySelectorAll('.el-table__body tbody tr')].filter(v).length;
        const empty = /暂无数据/.test((document.querySelector('.el-table__empty-text') || {}).innerText || '');
        return rows >= n || empty;
      }, minRows);
      if (ok) break;
      await page.waitForTimeout(700);
    }
  };

  const clickRadio = async name => {
    const r = await page.evaluate(t => {
      const v = e => e && e.offsetParent !== null;
      const nn = s => (s || '').replace(/\s+/g, ' ').trim();
      const el = [...document.querySelectorAll('.el-radio-button')].filter(v).find(x => nn(x.innerText) === t);
      if (!el) return 'NO';
      (el.querySelector('.el-radio-button__inner') || el).click();
      return 'ok';
    }, name);
    await page.waitForTimeout(2200);
    return r;
  };

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await waitTable(1);

  // 切到「充值赠送策略」
  await clickRadio('充值赠送策略');
  await waitTable(1);

  // 100 条/页（切完必须校验行数，别只看有没有点）
  const setPageSize = async () => {
    for (let round = 0; round < 6; round++) {
      await page.evaluate(() => {
        const v = e => e && e.offsetParent !== null;
        const w = [...document.querySelectorAll('.el-pagination .el-select__wrapper')].filter(v)[0];
        if (w) w.click();
      });
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const nn = s => (s || '').replace(/\s+/g, ' ').trim();
        const o = [...document.querySelectorAll('.el-select-dropdown__item')].filter(e => e.offsetParent !== null)
          .find(e => /^100条\/页$/.test(nn(e.innerText)));
        if (o) o.click();
      });
      await page.waitForTimeout(1800);
      const st = await page.evaluate(() => {
        const v = e => e && e.offsetParent !== null;
        const rows = [...document.querySelectorAll('.el-table__body tbody tr')].filter(v).length;
        const m = ((document.querySelector('.el-pagination__total') || {}).innerText || '').match(/\d+/);
        return { rows, total: m ? +m[0] : 0 };
      });
      if (st.total === 0 || st.rows >= st.total) return st;
    }
    return await page.evaluate(() => {
      const v = e => e && e.offsetParent !== null;
      const rows = [...document.querySelectorAll('.el-table__body tbody tr')].filter(v).length;
      const m = ((document.querySelector('.el-pagination__total') || {}).innerText || '').match(/\d+/);
      return { rows, total: m ? +m[0] : 0 };
    });
  };
  const pageSize = await setPageSize();

  const strategies = await page.evaluate(() => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('.el-table__body tbody tr')].filter(v).map(tr => {
      const td = [...tr.querySelectorAll('td')];
      const c = i => (td[i] ? nn(td[i].innerText) : '');
      // 网民自助购买是 el-switch，innerText 恒空，必须读 aria-checked
      const sw = td[7] ? td[7].querySelector('.el-switch__input') : null;
      const online = sw ? sw.getAttribute('aria-checked') === 'true' : null;
      return {
        序号: c(0), 策略: c(1), 会员类型: c(2), 充值: c(3), 赠送: c(4), 等级: c(5), 会员日: c(6),
        网民自助购买: online === null ? '(无开关)' : (online ? '开' : '关'),
        次数: c(8), 场景: c(9), 分批到账: c(10),
        // button 与内层 span 文本相同，必须去重，否则每个动作出现两次
        动作: [...new Set([...(td[11] ? td[11].querySelectorAll('button') : [])].filter(v)
          .map(x => nn(x.innerText)).filter(Boolean))],
      };
    });
  });

  // 切到「分批到账记录」
  const switchTo = await clickRadio('分批到账记录');
  await waitTable(1);
  const records = await page.evaluate(() => {
    const v = e => e && e.offsetParent !== null;
    const nn = s => (s || '').replace(/\s+/g, ' ').trim();
    const heads = [...document.querySelectorAll('.el-table__header th')].filter(v).map(th => nn(th.innerText)).filter(Boolean);
    const rows = [...document.querySelectorAll('.el-table__body tbody tr')].filter(v)
      .map(tr => [...tr.querySelectorAll('td')].map(td => nn(td.innerText)));
    return {
      heads,
      rows,
      empty: nn((document.querySelector('.el-table__empty-text') || {}).innerText),
      statusOptions: null,
    };
  });

  const out = [`## 充值策略（共 ${strategies.length} 条 / 分页 ${pageSize.rows} 行 · 总 ${pageSize.total}）`,
    '序号 | 策略 | 类型 | 充值 | 赠送 | 等级 | 会员日 | 自助购买 | 次数 | 场景 | 分批到账 | 动作'];
  strategies.forEach(s => out.push([s.序号, s.策略, s.会员类型, s.充值, s.赠送, s.等级, s.会员日,
    s.网民自助购买, s.次数, s.场景, s.分批到账, s.动作.join('/')].join(' | ')));

  out.push('', `## 分批到账记录（switch=${switchTo}）`, records.heads.join(' | '));
  if (records.rows.length) records.rows.forEach(r => out.push(r.join(' | ')));
  else out.push(`(空) ${records.empty || '暂无数据'}`);

  return out.join('\n');
}
