/**
 * 只读：APP机位图里「网吧占座限制 / 网吧订座限制」的参与名单
 * 不改任何值、不点保存
 *
 * ⭐ 这是占座/订座的「闸门」：右框（参与）为空 ⇒ 该功能对客完全不生效，
 *    订座配置页里的参数一个都用不上（即使总开关是开的）。
 *    占座与订座各自一套名单，互不影响。
 */
async page => {
  await page.goto('https://wyb.5188cloud.net/serviceManage/netbarSite/bigScreen',
    {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(3500);
  await page.getByText('APP机位图', {exact: true}).first().click({force: true}).catch(() => {});
  await page.waitForTimeout(3000);

  const out = await page.evaluate(() => {
    const names = panel => [...panel.querySelectorAll('.el-checkbox__label')]
      .filter(el => !el.closest('.el-transfer-panel__header'))
      .map(el => el.innerText.trim()).filter(Boolean);

    const blocks = [...document.querySelectorAll('.el-transfer')].map((tr, i) => {
      const panels = tr.querySelectorAll('.el-transfer-panel');
      let title = '';
      let p = tr.parentElement;
      for (let k = 0; k < 5 && p; k++) {
        const t = (p.innerText || '').match(/网吧(占座|订座)限制/);
        if (t) { title = t[0]; break; }
        p = p.parentElement;
      }
      const heads = [...panels].map(x =>
        (x.querySelector('.el-transfer-panel__header')?.innerText || '').replace(/\s+/g, ' ').trim());
      return {
        idx: i, title, heads,
        左: panels[0] ? names(panels[0]) : [],
        右: panels[1] ? names(panels[1]) : [],
      };
    });
    return blocks;
  });

  const verdict = out.map(b => {
    const key = b.title.includes('占座') ? '占座' : '订座';
    const n = b.右.length;
    return n > 0
      ? `${key}：生效中（参与 ${n} 台）`
      : `${key}：**不生效**（参与 0 台，右框空 → 该功能对客不出现）`;
  }).join('\n');

  return `${verdict}\n\n===== 明细 =====\n${JSON.stringify(out, null, 2)}`;
}
