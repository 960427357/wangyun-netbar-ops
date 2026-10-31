// ============================================================
// 创建虚拟收银账号（旺云商户端 → 员工管理 → 员工管理 → 新 增）
// 入口: /staffManage/mgr
// 用法: playwright-cli run-code --filename scripts/create-staff.js
//   CREATE = false → 只填不存（默认，先核对回读）
//   CREATE = true  → 真正保存
//
// 🔴 本页最关键的机制（手机号查重驱动表单）：
//   填完手机号约 1.5s 后系统查重，然后二选一：
//     · 号码**未注册** → 出现「密码」字段，手机号框可编辑，按钮「保 存」  ← 新建账号
//     · 号码**已注册** → 密码字段消失，手机号框 disabled，按钮变「确 定」 ← 绑定已有账号
//   所以：① 必须先填手机号再判断是否填密码；
//        ② 手机号一旦填了就锁死，同一弹窗改不了号，**每个账号前必须 reload**；
//        ③ 「密码框是否存在」本身就是号码是否被占用的判据。
//
// 其余实测：
//   · 定位必须用表单项**索引**（.el-form-item nth），label 文本匹配在本页会失配
//   · 下拉必须真实点击（locator.click）；evaluate 里 dispatchEvent 点选不会绑定值
//   · select 回读看 .el-form-item 的 innerText，input.value 恒为空
//   · 必填 4 项：手机号（账号）/ 昵称 / 岗位 / 姓名
//   · 保存后无 toast、弹窗直接关闭，必须回列表核对
// ============================================================
async page => {
  const CREATE = true;

  const STAFF = [
    { phone: '19900000006', nick: '收银01', name: '虚拟收银01', no: 'S001' },
    { phone: '19900000007', nick: '收银02', name: '虚拟收银02', no: 'S002' },
    { phone: '19900000008', nick: '收银03', name: '虚拟收银03', no: 'S003' },
  ];
  const PASSWORD = 'Wy123456';
  const POST = '收银员';     // 岗位（管理员 / 保洁员 / 维修工 / 收银员）
  const DEPT = '前台收银';    // 部门（店务管理 / 前台收银 / 网管技术 / 吧台出品 / 保洁）
  const BILLING = '收银员';   // 计费系统账号（店长 / 收银员 / 1 / 管理员）
  const ROLE = '收银员';      // 角色（多选，只勾这一项）

  const Q = '.el-dialog:visible .el-form-item';
  const out = [];

  const readLabels = () => page.evaluate(() => {
    const d = [...document.querySelectorAll('.el-dialog')].find(x => x.offsetParent !== null);
    return d ? [...d.querySelectorAll('.el-form-item__label')].map(l => (l.innerText || '').replace(/\s+/g, '')) : [];
  });

  for (const s of STAFF) {
    // 🔴 每个账号前必须 reload：手机号填完即锁死，弹窗无法复用
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4200);
    await page.getByRole('button', { name: /新\s*增/ }).first().click();
    await page.waitForTimeout(2300);

    const r = { phone: s.phone };

    const at = async (prefix) => {
      const labels = await readLabels();
      const i = labels.findIndex(l => l.startsWith(prefix));
      return i < 0 ? null : page.locator(Q).nth(i);
    };

    // 1) 先填手机号，等查重
    let fi = await at('手机号');
    if (!fi) { r.error = 'no-phone-field'; out.push(r); continue; }
    await fi.locator('input').first().fill(s.phone);
    await page.waitForTimeout(1900);

    // 2) 判断是否已注册
    const labelsAfter = await readLabels();
    r.hasPwd = labelsAfter.some(l => l.startsWith('密码'));
    r.registered = !r.hasPwd;
    if (r.registered) {
      r.skip = '该手机号已注册旺云商户端，未创建';
      out.push(r);
      await page.locator('.el-dialog:visible button').filter({ hasText: /取\s*消/ }).last().click().catch(() => {});
      await page.waitForTimeout(700);
      continue;
    }

    // 3) 未注册 → 密码必填
    const fillText = async (prefix, val) => {
      const f = await at(prefix);
      if (!f) return 'no-field';
      const inp = f.locator('input').first();
      try {
        await inp.fill(val, { timeout: 6000 });
        await page.waitForTimeout(200);
        if ((await inp.inputValue()) === val) return 'ok';
      } catch (e) { /* 兜底 */ }
      const ok = await f.evaluate((el, v) => {
        const i = el.querySelector('input');
        if (!i) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        i.focus(); setter.call(i, v);
        i.dispatchEvent(new Event('input', { bubbles: true }));
        i.dispatchEvent(new Event('change', { bubbles: true }));
        i.dispatchEvent(new Event('blur', { bubbles: true }));
        return i.value === v;
      }, val);
      await page.waitForTimeout(200);
      return ok ? 'ok(js)' : 'failed';
    };

    const pickSelect = async (prefix, optionText) => {
      const f = await at(prefix);
      if (!f) return 'no-field';
      try { await f.locator('.el-select').first().click({ timeout: 6000 }); }
      catch (e) { return 'click-fail'; }
      await page.waitForTimeout(900);
      const opt = page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
        .filter({ hasText: new RegExp('^\\s*' + optionText + '\\s*$') }).first();
      if (!(await opt.count())) { await page.keyboard.press('Escape'); return 'no-option'; }
      await opt.click();
      await page.waitForTimeout(800);
      const t = (await f.innerText()).replace(/\s+/g, ' ').trim();
      return t.includes(optionText) ? 'ok' : 'mismatch:' + t;
    };

    const checkRole = async (roleText) => {
      const f = await at('角色');
      if (!f) return 'no-field';
      const boxes = f.locator('.el-checkbox');
      const n = await boxes.count();
      for (let i = 0; i < n; i++) {
        const b = boxes.nth(i);
        const t = ((await b.innerText()) || '').replace(/\s+/g, ' ').trim();
        const on = await b.evaluate(el => el.classList.contains('is-checked'));
        if (t === roleText && !on) { await b.click(); await page.waitForTimeout(220); }
        else if (t !== roleText && on) { await b.click(); await page.waitForTimeout(220); }
      }
      return await f.evaluate(el => [...el.querySelectorAll('.el-checkbox')]
        .filter(b => b.classList.contains('is-checked')).map(b => (b.innerText || '').trim()));
    };

    r.pwdSet = await fillText('密码', PASSWORD);
    r.nickSet = await fillText('昵称', s.nick);
    r.noSet = await fillText('工号', s.no);
    r.post = await pickSelect('岗位', POST);
    r.nameSet = await fillText('姓名', s.name);
    r.role = await checkRole(ROLE);
    r.dept = await pickSelect('部门', DEPT);
    r.billing = await pickSelect('计费系统账号', BILLING);

    // 4) 保存前回读
    r.readback = await page.evaluate(() => {
      const d = [...document.querySelectorAll('.el-dialog')].find(x => x.offsetParent !== null);
      return [...d.querySelectorAll('.el-form-item')].map(f => {
        const lb = ((f.querySelector('.el-form-item__label') || {}).innerText || '').replace(/\s+/g, '');
        if (f.querySelector('.el-select')) return lb + ' = ' + (f.innerText || '').replace(/\s+/g, ' ').trim();
        const chk = [...f.querySelectorAll('.el-checkbox')].filter(b => b.classList.contains('is-checked')).map(b => (b.innerText || '').trim());
        if (chk.length) return lb + ' = [' + chk.join(',') + ']';
        const i = f.querySelector('input');
        return lb + ' = ' + (i && i.type !== 'password' ? i.value : i ? '<pwd已填>' : '');
      }).filter(Boolean);
    });

    if (CREATE) {
      const btn = page.locator('.el-dialog:visible button').filter({ hasText: /保\s*存/ }).last();
      await btn.click();
      await page.waitForTimeout(3200);
      r.save = {
        toast: await page.evaluate(() => [...document.querySelectorAll('.el-message__content')]
          .map(e => (e.innerText || '').trim()).filter(Boolean)),
        dlgStillOpen: await page.locator('.el-dialog:visible').count(),
      };
      if (r.save.dlgStillOpen > 0) {
        r.save.errors = await page.evaluate(() => [...document.querySelectorAll('.el-form-item__error')]
          .map(e => (e.innerText || '').trim()).filter(Boolean));
      }
      await page.waitForTimeout(1200);
    } else {
      r.note = 'DRY-RUN 未保存';
      await page.locator('.el-dialog:visible button').filter({ hasText: /取\s*消/ }).last().click().catch(() => {});
      await page.waitForTimeout(700);
    }
    out.push(r);
  }

  return JSON.stringify(out, null, 2);
}
