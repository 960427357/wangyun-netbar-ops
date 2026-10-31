// 按路由逐页抓取页面要素（tab/按钮/列头/表单标签/提示）
// 用法：改 PAGES 后 playwright-cli run-code --filename scripts/crawl-pages.js
async page => {
  const PAGES = [
    ['促销-促销汇总','/memberActivityManage/summary'],
    ['促销-促销人群','/memberActivityManage/promotion'],
    ['促销-策略设置','/memberActivityManage/strategy'],
    ['促销-规则设置','/memberActivityManage/baseConfig/rules'],
    ['促销-宣传文案','/memberActivityManage/baseConfig/advertising'],
    ['促销-充值赠送活动','/memberActivityManage/rechargeGift'],
    ['促销-商品优惠券','/memberActivityManage/coupon'],
    ['活动-整点抽奖','/netBarActivity/hoursActivity'],
    ['活动-积分等级设置','/netBarActivity/scoreActivity/scoreSetting/grade'],
    ['活动-签到活动设置','/netBarActivity/scoreActivity/signIn/config'],
    ['活动-转盘抽奖','/netBarActivity/scoreActivity/lottery'],
    ['活动-游戏活动总览','/netBarActivity/gameActivity/overview'],
    ['活动-商品促销','/netBarActivity/promote'],
    ['活动-礼包设置','/netBarActivity/giftPackage'],
    ['服务-全局语音配置','/serviceManage/netBarVoiceManage/voiceConfig'],
    ['服务-大屏机位图','/serviceManage/netbarSite/bigScreen'],
    ['服务-通知','/serviceManage/notice/noticeRecord'],
    ['服务-宣传','/serviceManage/notice/promotion'],
    ['销售-核销设置','/marketManage/verificationManagement/writeOffSet'],
    ['销售-团购套餐','/marketManage/groupManagement/group'],
    ['销售-设备租赁设置','/marketManage/tenancy/setting'],
    ['销售-异常订单未处理','/marketManage/orderManagement/pending'],
    ['销售-库存预警','/marketManage/goodsManage/baseManage/warning'],
    ['销售-吧台设置','/marketManage/goodsManage/baseManage/barSet']
  ];

  const grab = () => page.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.width > 0; };
    const txt = e => (e.innerText || '').replace(/\s+/g, ' ').trim();
    return {
      path: location.pathname,
      tabs: [...new Set([...document.querySelectorAll('.el-tabs__item')].filter(vis).map(txt))].filter(Boolean).slice(0, 16),
      btns: [...new Set([...document.querySelectorAll('main button, .el-button')].filter(vis).map(txt))]
        .filter(t => t && t.length < 14).slice(0, 16),
      ths: [...new Set([...document.querySelectorAll('.el-table__header th')].filter(vis).map(txt))]
        .map(t => t.replace(/^\d+$/, '')).filter(Boolean).slice(0, 20),
      labels: [...new Set([...document.querySelectorAll('.el-form-item__label, .el-checkbox__label, .el-radio__label')]
        .filter(vis).map(txt))].filter(Boolean).slice(0, 30),
      tip: (document.body.innerText.match(/提示：[^\n]{0,50}/) || [''])[0],
      sub: (document.querySelector('.el-scrollbar__view') || {}).innerText
        ? (document.querySelector('.el-scrollbar__view').innerText || '').replace(/\s+/g, ' ').slice(0, 160) : ''
    };
  });

  const out = [];
  for (const [name, path] of PAGES) {
    await page.goto('https://wyb.5188cloud.net' + path, {waitUntil: 'domcontentloaded'}).catch(() => {});
    await page.waitForTimeout(2200);
    const g = await grab();
    out.push(`\n### ${name} ${path}`);
    out.push(`  at: ${g.path}`);
    if (g.tabs.length) out.push(`  tabs: ${g.tabs.join(' / ')}`);
    if (g.btns.length) out.push(`  btn: ${g.btns.join(' / ')}`);
    if (g.ths.length) out.push(`  col: ${g.ths.join(' / ')}`);
    if (g.labels.length) out.push(`  fld: ${g.labels.join(' / ')}`);
    if (g.tip) out.push(`  tip: ${g.tip}`);
    if (g.sub) out.push(`  txt: ${g.sub}`);
  }
  return out.join('\n');
}
