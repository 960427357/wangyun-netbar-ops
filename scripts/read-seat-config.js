/**
 * 读「订座配置」页全部字段状态（只读，不改任何值）
 * 路径：系统设置 → 网吧配置 → 订座配置 /admin/systemSetting/netbarConfig/orderSeat
 */
async page => {
  const URL = 'https://wyb.5188cloud.net/admin/systemSetting/netbarConfig/orderSeat';

  await page.goto(URL, {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(5000);   // 首屏 3-4 秒，慢一点更稳

  const shop = await page.evaluate(() => {
    const skip = /^(管理员|超级管理员|店长|收银员|AI 旺.*|退出|退出登录|首页|消息|设置)$/;
    const all = [...document.querySelectorAll('.el-header *')]
      .map(e => (e.innerText || '').trim()).filter(Boolean);
    const uniq = [...new Set(all)];
    return uniq.find(t => !skip.test(t) && t.length <= 40) || '';
  });

  const parts = await page.evaluate(() => {
    const out = [];
    // 所有开关：label 文字（可能为空）+ aria-checked
    [...document.querySelectorAll('.el-switch')].forEach((sw, i) => {
      const inp = sw.querySelector('.el-switch__input');
      const checked = inp ? inp.getAttribute('aria-checked') : null;
      // 找最近的文字说明：向右找同行的兄弟文本
      let ctx = '';
      let p = sw.parentElement;
      for (let k = 0; k < 4 && p; k++) {
        const t = (p.innerText || '').replace(/\s+/g, ' ').trim();
        if (t) { ctx = t.slice(0, 90); break; }
        p = p.parentElement;
      }
      out.push(`SWITCH#${i} checked=${checked} | ${ctx}`);
    });

    // 所有数字输入框
    [...document.querySelectorAll('input.el-input__inner')].forEach((el, i) => {
      let ctx = '';
      let p = el.parentElement;
      for (let k = 0; k < 4 && p; k++) {
        const t = (p.innerText || '').replace(/\s+/g, ' ').trim();
        if (t) { ctx = t.slice(0, 90); break; }
        p = p.parentElement;
      }
      out.push(`INPUT#${i} val=${JSON.stringify(el.value)} ph=${JSON.stringify(el.placeholder || '')} | ${ctx}`);
    });

    // 单选 / 复选
    [...document.querySelectorAll('.el-radio,.el-checkbox')].forEach((el, i) => {
      const label = (el.innerText || '').replace(/\s+/g, ' ').trim();
      const input = el.querySelector('input');
      out.push(`RADIO-CHK#${i} ${JSON.stringify(label)} checked=${input ? input.checked : null} disabled=${input ? input.disabled : null}`);
    });

    return out;
  });

  const rawText = await page.evaluate(() =>
    (document.querySelector('main') || document.body).innerText.replace(/\n{2,}/g, '\n').trim());

  return `场所名=${shop}\nURL=${page.url()}\n\n===== 控件清单 =====\n${parts.join('\n')}\n\n===== 页面正文 =====\n${rawText.slice(0, 3000)}`;
}
