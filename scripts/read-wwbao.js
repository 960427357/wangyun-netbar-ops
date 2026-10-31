/**
 * 只读：移动端配置（wwbao）整页字段一次读全
 *
 * 路径：系统设置 → 网吧配置 → 移动端配置
 *      /admin/systemSetting/netbarConfig/wwbao
 *
 * 不改任何值、不点保存。
 * 用法：playwright-cli run-code --filename scripts/read-wwbao.js
 */
async (page) => {
  await page.goto('https://wyb.5188cloud.net/admin/systemSetting/netbarConfig/wwbao',
    {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(6500);

  const snap = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.el-form-item')];
    const fi = kw => items.find(x =>
      (x.querySelector('.el-form-item__label')?.innerText || '').includes(kw));
    const sw = i => document.querySelectorAll('.el-switch')[i]
      ?.querySelector('.el-switch__input')?.getAttribute('aria-checked');
    const cfg = fi('电脑配置'), tag = fi('服务标签'), img = fi('室内图片');

    return {
      场所名: document.querySelector('.navbar-brand, .logo-text, .place-name')?.innerText.trim() || '(见左上角)',
      是否上架旺旺宝网吧版: sw(0),
      是否允许办理会员: sw(1),
      别名: items[2]?.querySelector('input')?.value,
      联系电话: items[3]?.querySelector('input')?.value,
      人均消费金额: items[4]?.querySelector('input')?.value,
      服务标签: [...tag.querySelectorAll('input.el-input__inner')].map(e => e.value),
      服务标签上限: '10',
      营业状态: document.querySelector('.el-select')?.innerText.trim(),
      营业时间: items[7]?.querySelector('input')?.value,
      电脑配置组数: cfg.querySelectorAll('.computer-item-form').length,
      电脑配置: [...cfg.querySelectorAll('.computer-item-form')].map(f =>
        [...f.querySelectorAll('li')].map(li =>
          (li.querySelector('span')?.innerText || '').replace('：', '') + '=' +
          (li.querySelector('input')?.value || ''))),
      室内图张数: img?.querySelectorAll('img').length,
      室内图地址: [...(img?.querySelectorAll('img') || [])].map(e => (e.src || '').slice(0, 90))
    };
  });

  // 诊断：把明显的坑直接点出来
  const warn = [];
  const tags = snap.服务标签;
  if (tags.length < 6) warn.push(`服务标签只有 ${tags.length} 个（上限 10，空着等于放弃 app 筛选入口）`);
  if (snap.电脑配置组数 > 1) warn.push(`电脑配置有 ${snap.电脑配置组数} 组——多组=对外承诺多套机型，确认是否真实有多套`);
  if (!tags.length) warn.push('服务标签为空');
  if (snap.别名 && snap.别名 !== snap.场所名 && snap.场所名 !== '(见左上角)') {
    warn.push(`⚠️ 别名「${snap.别名}」≠ 场所名「${snap.场所名}」，app 显示别名`);
  }
  if (snap.室内图张数 <= 1) warn.push('室内图片只有主图，没有环境图（上限 20 张）');
  if (snap.是否上架旺旺宝网吧版 !== 'true') warn.push('未上架旺旺宝网吧版 → app 上搜不到这家店');

  return JSON.stringify({体检: warn.length ? warn : '未发现明显问题', 明细: snap}, null, 1);
}
