async page => {
  const BASE = 'https://wyb.5188cloud.net';
  const PAGES = [
    ['风险人群', '/memberActivityManage/strategy/riskGroup/list'],
    ['高危人群', '/memberActivityManage/strategy/highRisk/list'],
    ['高净值人群', '/memberActivityManage/strategy/highNetWroth/list'],
    ['线上人群', '/memberActivityManage/strategy/onlineCrowd/list'],
    ['上机超时长人群', '/memberActivityManage/strategy/computerLongTime/list'],
    ['促销日', '/memberActivityManage/strategy/salesDay/list'],
    ['会员生日', '/memberActivityManage/strategy/memberBirthday/birthday'],
    ['老带新', '/memberActivityManage/strategy/invitation/list'],
  ];
  const out = [];
  for (const [label, path] of PAGES) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3200);
    const r = await page.evaluate(() => {
      const n = s => (s || '').replace(/\s+/g, ' ').trim();
      const isVis = el => el && el.offsetParent !== null;
      const rows = [...document.querySelectorAll('.el-table__body tbody tr')].filter(isVis);
      const total = n((document.querySelector('.el-pagination__total') || {}).innerText || '');
      return {
        total,
        rows: rows.map(tr => ({
          txt: n(tr.innerText),
          on: [...tr.querySelectorAll('.el-switch')].map(s => s.classList.contains('is-checked'))[0],
        })),
      };
    });
    out.push(`【${label}】${r.total} 共 ${r.rows.length} 行`);
    r.rows.forEach(x => out.push(`   [${x.on === true ? '开' : x.on === false ? '关' : '-'}] ${x.txt}`));
    out.push('');
  }
  return out.join('\n');
}
