/**
 * 全站页面盘点：逐页判定「能否修改 / 有无数据 / 有哪些操作入口」
 * 只读，不点任何新增或保存。
 * 用 START / COUNT 分批跑，避免单次超时。
 */
async page => {
  const START = 0;      // 起始序号
  const COUNT = 22;     // 本次抓多少页
  const WAIT = 2200;    // 每页等待

  // 叶子路由（来自 /api/netbarMenus）
  const ROUTES = [
    ['交接班', '/netBarSummary/handOver'],
    ['商超总览', '/marketManage/goodsManage/summary'],
    ['商品管理', '/marketManage/goodsManage/shop/goods'],
    ['套餐管理', '/marketManage/goodsManage/shop/goodsPackage'],
    ['销售总览', '/marketManage/goodsManage/shop/goodsSale'],
    ['商品报损', '/marketManage/goodsManage/shop/goodsDestory'],
    ['盘点记录', '/marketManage/goodsManage/shop/stockHistory'],
    ['点货记录', '/marketManage/goodsManage/shop/barStockHistory'],
    ['原料管理', '/marketManage/goodsManage/shop/rawMaterial'],
    ['商品分类', '/marketManage/goodsManage/baseManage/goodsCate'],
    ['商品名称', '/marketManage/goodsManage/baseManage/goodsName'],
    ['计量单位', '/marketManage/goodsManage/baseManage/goodsUnit'],
    ['吧台设置', '/marketManage/goodsManage/baseManage/barSet'],
    ['标签设置', '/marketManage/goodsManage/baseManage/tagsSet'],
    ['库存预警', '/marketManage/goodsManage/baseManage/warning'],
    ['团购授权', '/marketManage/verificationManagement/groupBuy'],
    ['团购券设置', '/marketManage/verificationManagement/groupSet'],
    ['核销记录', '/marketManage/verificationManagement/gruopWriteOff'],
    ['核销总览', '/marketManage/verificationManagement/summary'],
    ['团购互斥组', '/marketManage/verificationManagement/groupMutex'],
    ['核销设置', '/marketManage/verificationManagement/writeOffSet'],
    ['团购套餐', '/marketManage/groupManagement/group'],
    ['上架管理', '/marketManage/groupManagement/publish'],
    ['上架历史', '/marketManage/groupManagement/putHistory'],
    ['团购总览', '/marketManage/groupManagement/wangyunPreSale'],
    ['租赁数据统计', '/marketManage/tenancy/statistics'],
    ['设备管理', '/marketManage/tenancy/management'],
    ['租赁中', '/marketManage/tenancy/log/underLease'],
    ['租赁已完成', '/marketManage/tenancy/log/finished'],
    ['租赁设置', '/marketManage/tenancy/setting'],
    ['异常单未处理', '/marketManage/orderManagement/pending'],
    ['异常单已处理', '/marketManage/orderManagement/processed'],
    ['会员管理', '/customerManage/vipManage'],
    ['历史会员删除', '/customerManage/memberHistory'],
    ['黑名单', '/customerManage/memberBlack'],
    ['促销汇总', '/memberActivityManage/summary'],
    ['流失预警', '/memberActivityManage/promotion/churnWarning'],
    ['高净值人群', '/memberActivityManage/promotion/highNetWorth'],
    ['线上人群', '/memberActivityManage/promotion/onlineCrowd'],
    ['上机超时长人群', '/memberActivityManage/promotion/onlineOverTime'],
    ['会员生日', '/memberActivityManage/promotion/memberBirthday'],
    ['促销日', '/memberActivityManage/promotion/memberDay'],
    ['老带新', '/memberActivityManage/promotion/invitation'],
    ['不参加人群', '/memberActivityManage/promotion/notParticipate'],
    ['促销进行中', '/memberActivityManage/history/inProgress'],
    ['促销待生效', '/memberActivityManage/history/pending'],
    ['促销已结束', '/memberActivityManage/history/ended'],
    ['风险人群策略', '/memberActivityManage/strategy/riskGroup/list'],
    ['风险人群历史', '/memberActivityManage/strategy/riskGroup/record'],
    ['高危人群策略', '/memberActivityManage/strategy/highRisk/list'],
    ['高危人群历史', '/memberActivityManage/strategy/highRisk/record'],
    ['高净值策略', '/memberActivityManage/strategy/highNetWroth/list'],
    ['高净值历史', '/memberActivityManage/strategy/highNetWroth/record'],
    ['线上人群策略', '/memberActivityManage/strategy/onlineCrowd/list'],
    ['线上人群历史', '/memberActivityManage/strategy/onlineCrowd/record'],
    ['超时长策略', '/memberActivityManage/strategy/computerLongTime/list'],
    ['超时长历史', '/memberActivityManage/strategy/computerLongTime/record'],
    ['促销日策略', '/memberActivityManage/strategy/salesDay/list'],
    ['促销日历史', '/memberActivityManage/strategy/salesDay/record'],
    ['生日策略', '/memberActivityManage/strategy/memberBirthday/birthday'],
    ['生日历史', '/memberActivityManage/strategy/memberBirthday/record'],
    ['老带新策略', '/memberActivityManage/strategy/invitation/invitationList'],
    ['老带新历史', '/memberActivityManage/strategy/invitation/invitationRecord'],
    ['促销规则设置', '/memberActivityManage/baseConfig/rules'],
    ['宣传文案', '/memberActivityManage/baseConfig/advertising'],
    ['充值赠送活动', '/memberActivityManage/rechargeGift'],
    ['商品优惠券', '/memberActivityManage/coupon'],
    ['整点抽奖', '/netBarActivity/hoursActivity'],
    ['积分等级设置', '/netBarActivity/scoreActivity/scoreSetting/grade'],
    ['积分会员参与限制', '/netBarActivity/scoreActivity/scoreSetting/Integral'],
    ['签到活动设置', '/netBarActivity/scoreActivity/signIn/config'],
    ['签到奖励记录', '/netBarActivity/scoreActivity/signIn/record'],
    ['转盘抽奖', '/netBarActivity/scoreActivity/lottery'],
    ['积分记录', '/netBarActivity/scoreActivity/exchangeLog'],
    ['游戏活动总览', '/netBarActivity/gameActivity/overview'],
    ['绝地求生活动', '/netBarActivity/gameActivity/pubg'],
    ['LOL活动', '/netBarActivity/gameActivity/lol'],
    ['游戏活动策略', '/netBarActivity/gameActivity/strategy/list'],
    ['游戏活动历史', '/netBarActivity/gameActivity/strategy/record'],
    ['商品促销', '/netBarActivity/promote'],
    ['礼包设置', '/netBarActivity/giftPackage'],
    ['部门管理', '/staffManage/department'],
    ['岗位管理', '/staffManage/staffPost'],
    ['角色管理', '/staffManage/role'],
    ['员工管理', '/staffManage/mgr'],
    ['绩效任务设置', '/staffManage/netbarPerformance/taskSetting'],
    ['绩效派发任务', '/staffManage/netbarPerformance/taskList'],
    ['绩效积分统计', '/staffManage/netbarPerformance/pointList'],
    ['激励当前规则', '/staffManage/staffCommission/currRules'],
    ['提成结算', '/staffManage/staffCommission/settlement'],
    ['激励历史规则', '/staffManage/staffCommission/historyRules'],
    ['打赏设置', '/staffManage/staffReward/setting'],
    ['赏金设置', '/staffManage/staffReward/management'],
    ['打赏结算', '/staffManage/staffReward/settlement'],
    ['考勤明细', '/staffManage/oa/workDays'],
    ['排班', '/staffManage/oa/scheduling'],
    ['全局语音配置', '/serviceManage/netBarVoiceManage/voiceConfig'],
    ['网吧语音管理', '/serviceManage/netBarVoiceManage/voiceManage'],
    ['日常语音提醒', '/serviceManage/netBarVoiceManage/audioDaily'],
    ['专呼语音', '/serviceManage/netBarVoiceManage/dedicatedVoice'],
    ['客户端别名', '/serviceManage/netBarVoiceManage/terminalName'],
    ['大屏机位图', '/serviceManage/netbarSite/bigScreen'],
    ['通知', '/serviceManage/notice/noticeRecord'],
    ['宣传', '/serviceManage/notice/promotion'],
    ['计费基础设置', '/msBarOptions/baseSetting'],
    ['区域方案', '/msBarOptions/area'],
    ['会员等级', '/msBarOptions/levels'],
    ['上网卡', '/msBarOptions/cards'],
    ['充值活动方案', '/msBarOptions/deposit'],
    ['终端管理', '/msBarOptions/clients'],
    ['控制台设置', '/msBarOptions/consoles'],
    ['场所管理', '/admin/systemSetting/place'],
    ['一体机', '/admin/systemSetting/deviceManagement/wwbytj'],
    ['支付宝桌贴', '/admin/systemSetting/deviceManagement/zfbTouch'],
    ['网吧基础配置', '/admin/systemSetting/netbarConfig/base'],
    ['充值策略', '/admin/systemSetting/netbarConfig/recharge'],
    ['移动端配置', '/admin/systemSetting/netbarConfig/wwbao'],
    ['订座配置', '/admin/systemSetting/netbarConfig/orderSeat'],
    ['专场卡配置', '/admin/systemSetting/netbarConfig/specialCardSet'],
    ['一体机配置', '/admin/systemSetting/netbarConfig/ytjSet'],
    ['补贴策略设置', '/admin/systemSetting/netbarConfig/subsidyStrategy'],
    ['电脑配置', '/admin/systemSetting/netbarConfig/computerConfig'],
    ['通知设置', '/admin/systemSetting/staffNotice'],
    ['服务号授权', '/admin/systemSetting/pubwechatAuthorization'],
    ['购买短信', '/admin/systemSetting/sms/buySms'],
    ['短信记录', '/admin/systemSetting/sms/smsRecord'],
    ['网银钱包', '/admin/payManage/walletManage'],
    ['收款账号', '/admin/payManage/accountNumber'],
  ];

  const slice = ROUTES.slice(START, START + COUNT);
  const out = [];

  for (const [name, rawPath] of slice) {
    const path = rawPath.replace(/\/{2,}/g, '/');
    try {
      await page.goto('https://wyb.5188cloud.net' + path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(WAIT);
      const info = await page.evaluate(() => {
        const main = document.querySelector('main') || document.body;
        const txt = main.innerText.replace(/\s+/g, ' ');
        const ro = /无法修改|当前版本不支持/.test(txt);
        const btns = [...new Set([...main.querySelectorAll('button')]
          .map(b => b.innerText.replace(/\s+/g, '').trim())
          .filter(t => t && t.length <= 8))];
        const rows = main.querySelectorAll('.el-table__body tbody tr').length;
        const empty = [...main.querySelectorAll('.el-table__empty-text')].map(e => e.innerText.trim());
        const tabs = [...new Set([...main.querySelectorAll('.el-tabs__item')].map(e => e.innerText.trim()).filter(Boolean))];
        const inputs = main.querySelectorAll('input, textarea').length;
        const switches = main.querySelectorAll('.el-switch').length;
        const noAuth = /暂无权限|没有权限|无访问权限/.test(txt);
        return { ro, btns, rows, empty, tabs, inputs, switches, noAuth, len: txt.length };
      });
      const flags = [];
      if (info.ro) flags.push('只读');
      if (info.noAuth) flags.push('无权限');
      out.push([
        name,
        path,
        `行=${info.rows}`,
        `空=${info.empty.length ? info.empty.join('/') : '-'}`,
        `入=${info.inputs}`,
        `开=${info.switches}`,
        `签=${info.tabs.length ? info.tabs.slice(0, 6).join('·') : '-'}`,
        `钮=${info.btns.length ? info.btns.slice(0, 8).join('/') : '-'}`,
        flags.join(',') || '-',
      ].join(' | '));
    } catch (e) {
      out.push(`${name} | ${path} | ERR=${String(e).slice(0, 60)}`);
    }
  }
  return out.join('\n');
}
