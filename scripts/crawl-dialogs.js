// 打开关键配置页的新增/编辑弹窗，抓取表单字段（只读，不改不存）
async page => {
  const JOBS = [
    ['员工-部门新增', '/staffManage/department', /新\s*增/],
    ['员工-岗位新增', '/staffManage/staffPost', /新\s*增/],
    ['员工-角色新增', '/staffManage/role', /新\s*增/],
    ['员工-员工新增', '/staffManage/mgr', /新\s*增/],
    ['员工-绩效任务新增', '/staffManage/netbarPerformance/taskSetting', /新\s*增/],
    ['员工-激励规则新增', '/staffManage/staffCommission/currRules', /新\s*增/],
    ['促销-优惠券新增', '/memberActivityManage/coupon', /新\s*增/],
    ['活动-礼包新增', '/netBarActivity/giftPackage', /新\s*增/],
    ['活动-商品促销新增', '/netBarActivity/promote', /添\s*加/],
    ['活动-整点抽奖新增', '/netBarActivity/hoursActivity', /添\s*加/],
    ['销售-团购套餐新增', '/marketManage/groupManagement/group', /新\s*增/],
    ['销售-商品分类新增', '/marketManage/goodsManage/baseManage/goodsCate', /添\s*加/],
    ['销售-设备租赁设置', '/marketManage/tenancy/setting', /添\s*加/]
  ];

  const out = [];
  for (const [name, path, btnRe] of JOBS) {
    await page.goto('https://wyb.5188cloud.net' + path, {waitUntil:'domcontentloaded'}).catch(()=>{});
    await page.waitForTimeout(2200);
    const clicked = await page.getByRole('button', {name: btnRe}).first().click({timeout:6000}).then(()=>true).catch(()=>false);
    if (!clicked) { out.push(`\n### ${name} :: 按钮未找到`); continue; }
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const dlgs = [...document.querySelectorAll('.el-dialog, .el-drawer')]
        .filter(d => d.getBoundingClientRect().height > 0);
      if (!dlgs.length) return { title:'无弹窗', fields:[] };
      const d = dlgs[dlgs.length - 1];
      const title = (d.querySelector('.el-dialog__title, .el-drawer__title') || {}).innerText || '(无标题)';
      const fields = [...d.querySelectorAll('.el-form-item')].map(fi => {
        const lb = (fi.querySelector('.el-form-item__label') || {}).innerText || '';
        const req = fi.querySelector('.is-required') ? '*' : '';
        const items = [...fi.querySelectorAll('input, textarea, .el-select, .el-radio, .el-checkbox')];
        const ph = items.map(i => i.placeholder || '').filter(Boolean);
        const opts = [...fi.querySelectorAll('.el-radio__label, .el-checkbox__label')].map(x => x.innerText.trim()).filter(Boolean);
        return `${req}${lb.replace(/\s+/g,'')}${ph.length?'('+[...new Set(ph)].join('|')+')':''}${opts.length?'['+[...new Set(opts)].join('/')+']':''}`;
      }).filter(Boolean);
      return { title, fields };
    });
    out.push(`\n### ${name}`);
    out.push(`  弹窗: ${info.title}`);
    if (info.fields.length) out.push(`  字段: ${info.fields.join(' ; ')}`);
    await page.keyboard.press('Escape').catch(()=>{});
    await page.waitForTimeout(600);
  }
  return out.join('\n');
}
