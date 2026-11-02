/**
 * 套餐入库：创建一个套餐（普通套餐 / 自选套餐）
 * 用法：改 SPECS 后 run-code。DRY_RUN=true 时只填不提交。
 * 路径：销售管理 → 商超管理 → 商品管理 → 套餐管理 → 套餐入库
 */
async page => {
  const DRY_RUN = false;

  const SPECS = [
    {
      type: '自选套餐',
      name: '测试套餐-饮料任选2件',
      category: '饮料任选2件',
      pickCount: 2,
      unit: '套',
      price: 7,
      image: 'C:/Users/96042/WorkBuddy/2026-10-29-21-57-56/pkg-img/upload/pkg-drink-self.jpg',
      selfSale: '是',
      integral: '',
      items: [
        {goods: '康师傅冰红茶', qty: 1},
        {goods: '冰糖雪梨', qty: 1},
        {goods: '茶π乌龙茶', qty: 1},
      ],
    },
  ];

  const norm = s => (s || '').replace(/\s+/g, ' ').trim();
  const log = [];

  // —— 通用：DOM 原生点击可见按钮（避开隐藏模板元素）——
  const clickBtn = async (text, {last = false, scope = 'dialog'} = {}) =>
    page.evaluate(({text, last, scope}) => {
      const norm = s => (s || '').replace(/\s+/g, ' ').trim();
      const visible = el => el && el.offsetParent !== null;
      let root;
      if (scope === 'footer') {
        const d = [...document.querySelectorAll('.el-dialog')].filter(visible).pop();
        root = d ? d.querySelector('.el-dialog__footer') : null;
      } else if (scope === 'dialog') {
        root = [...document.querySelectorAll('.el-dialog')].filter(visible).pop();
      } else {
        root = document.body;
      }
      if (!root) return 'no dialog';
      const btns = [...root.querySelectorAll('button')]
        .filter(b => visible(b) && new RegExp('^' + text + '$').test(norm(b.innerText).replace(/\s+/g, '')));
      if (!btns.length) {
        const all = [...root.querySelectorAll('button')].filter(visible).map(b => norm(b.innerText));
        return 'NOT FOUND, have=' + JSON.stringify(all);
      }
      const b = last ? btns[btns.length - 1] : btns[0];
      b.click();
      return 'ok:' + norm(b.innerText);
    }, {text: text.replace(/\s+/g, ''), last, scope});

  // —— 通用：按 label 文本精确点单选框（原生 click 转发给内部 input，最稳）——
  const clickRadio = async (label, {all = false} = {}) =>
    page.evaluate(({label, all}) => {
      const norm = s => (s || '').replace(/\s+/g, ' ').trim();
      const visible = el => el && el.offsetParent !== null;
      const d = [...document.querySelectorAll('.el-dialog')].filter(visible).pop();
      if (!d) return 'no dialog';
      // 这个后台两种都有：el-radio（套餐类型）与 el-radio-button（是否类）
      const radios = [...d.querySelectorAll('.el-radio, .el-radio-button')].filter(r => visible(r));
      const t = radios.filter(r => norm(r.innerText) === label);
      const hit = all ? t[t.length - 1] : t[0];
      if (!hit) return 'NOT FOUND, have=' + JSON.stringify(radios.map(r => norm(r.innerText)));
      hit.click();
      return 'ok:' + label;
    }, {label, all});

  const hasDialog = async () =>
    page.evaluate(() => [...document.querySelectorAll('.el-dialog')].some(d => d.offsetParent !== null));

  const dumpContent = async () => page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const visible = el => el && el.offsetParent !== null;
    const d = [...document.querySelectorAll('.el-dialog')].filter(visible)[0];
    if (!d) return 'no dialog';
    const item = [...d.querySelectorAll('.el-form-item')]
      .find(it => norm(it.querySelector('.el-form-item__label')?.innerText).includes('套餐内容'));
    const box = item ? (item.querySelector('.el-form-item__content') || item) : d;
    return '文本=' + norm(box.innerText).slice(0, 260)
      + '  输入=' + JSON.stringify([...box.querySelectorAll('input')].filter(i => visible(i))
        .map(i => `ph="${i.placeholder}" val="${i.value}"`));
  });

  // —— 单个套餐创建 ——
  const createOne = async spec => {
    const r = [];
    r.push(`\n########## ${spec.name}（${spec.type}） ##########`);

    // 1. 进列表页
    await page.goto('https://wyb.5188cloud.net/marketManage/goodsManage/shop/goodsPackage',
      {waitUntil: 'domcontentloaded'});
    await page.waitForTimeout(4500);

    // 2. 打开弹窗
    r.push('打开弹窗 → ' + await clickBtn('套餐入库', {scope: 'body'}));
    await page.waitForTimeout(2500);
    if (!await hasDialog()) throw new Error('弹窗没打开');

    // 3. 套餐类型（默认普通套餐）
    if (spec.type === '自选套餐') {
      r.push('切自选套餐 → ' + await clickRadio('自选套餐'));
      await page.waitForTimeout(1500);
    } else {
      r.push('类型=普通套餐(默认)');
    }

    // 4. 套餐名称
    await page.locator('.el-dialog:visible input[placeholder="请输入套餐名称"]').first().fill(spec.name);
    r.push('名称已填');

    // 5. 套餐内容
    // 「选一个商品」封装：普通套餐与自选套餐的选商品弹窗结构相同（行内「选 择」）
    const pickGoods = async it => {
      r.push(`  选「${it.goods}」→ ` + await clickBtn('选择商品', {last: true}));
      await page.waitForTimeout(2200);

      await page.locator('.el-dialog:visible input[placeholder*="商品名称"]').last().fill(it.goods);
      await page.locator('.el-dialog:visible button').filter({hasText: /^搜/}).last().click();
      await page.waitForTimeout(2000);

      const picked = await page.evaluate(() => {
        const norm = s => (s || '').replace(/\s+/g, ' ').trim();
        const visible = el => el && el.offsetParent !== null;
        const dlg = [...document.querySelectorAll('.el-dialog')].filter(visible).pop();
        const tr = [...dlg.querySelectorAll('.el-table__body tbody tr')].filter(r => visible(r))[0];
        if (!tr) return 'no row';
        const btn = [...tr.querySelectorAll('button')].find(b => /择/.test(norm(b.innerText)));
        if (!btn) return 'no btn';
        btn.click();
        return 'ok ' + norm(tr.innerText).slice(0, 60);
      });
      r.push(`    行内选择 → ${picked}`);
      await page.waitForTimeout(2500);

      if (it.qty && it.qty !== 1) {
        await page.locator('.el-dialog:visible input[placeholder="商品数量"]').last().fill(String(it.qty));
        r.push(`    数量=${it.qty}`);
      }
    };

    if (spec.type === '自选套餐') {
      // 自选套餐：先填「分类名称 + 可选数量」，再往该分类里挂候选商品
      await page.locator('.el-dialog:visible .sort-item input').first().fill(spec.category);
      await page.waitForTimeout(500);
      await page.locator('.el-dialog:visible .sort-item input[type="number"]').first().fill(String(spec.pickCount));
      r.push(`分类名称=「${spec.category}」 可选数量=${spec.pickCount}`);

      for (let i = 0; i < spec.items.length; i++) {
        if (i > 0) {
          r.push(`  加第${i + 1}个候选 → ` + await clickBtn('添加商品'));
          await page.waitForTimeout(1600);
        }
        await pickGoods(spec.items[i]);
      }
    } else {
      for (let i = 0; i < spec.items.length; i++) {
        if (i > 0) {
          r.push(`  加第${i + 1}行 → ` + await clickBtn('添加商品'));
          await page.waitForTimeout(1500);
        }
        await pickGoods(spec.items[i]);
      }
    }

    r.push('  套餐内容 = ' + await dumpContent());

    // 6. 套餐单位
    await page.locator('.el-dialog:visible .el-form-item').filter({hasText: '套餐单位'}).first()
      .locator('.el-select').first().click();
    await page.waitForTimeout(1000);
    await page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
      .filter({hasText: new RegExp('^' + spec.unit + '$')}).first().click();
    await page.waitForTimeout(800);
    const unitShown = await page.evaluate(() => {
      const norm = s => (s || '').replace(/\s+/g, ' ').trim();
      const visible = el => el && el.offsetParent !== null;
      const d = [...document.querySelectorAll('.el-dialog')].filter(visible).pop();
      const it = [...d.querySelectorAll('.el-form-item')]
        .find(i => norm(i.querySelector('.el-form-item__label')?.innerText).includes('套餐单位'));
      const c = it.querySelector('.el-form-item__content') || it;
      const slot = c.querySelector('.el-select__selected-item:not(.is-hidden), .el-select__placeholder');
      return {
        shown: norm(slot ? slot.innerText : ''),
        transparent: slot ? slot.className.includes('is-transparent') : null,
      };
    });
    r.push(`单位=${spec.unit} → 回读显示「${unitShown.shown}」 未选中标记=${unitShown.transparent}`);

    // 6.5 套餐图片（🔴 必填：不传会报「请上传套餐图片」；先 fit-image.py 压到 ≤480KB）
    if (spec.image) {
      const fileInput = page.locator('.el-dialog:visible input[type="file"]').last();
      await fileInput.setInputFiles(spec.image);
      let okImg = false;
      for (let k = 0; k < 24; k++) {           // 上传是异步的，轮询 img.src
        await page.waitForTimeout(500);
        okImg = await page.evaluate(() => {
          const visible = el => el && el.offsetParent !== null;
          const d = [...document.querySelectorAll('.el-dialog')].filter(visible).pop();
          if (!d) return false;
          const img = d.querySelector('.el-upload img, .el-upload-list img, .el-upload-list__item-thumbnail');
          return !!(img && img.src && /^https?:/.test(img.src));
        });
        if (okImg) break;
      }
      r.push('图片上传=' + (okImg ? 'ok' : '❌ FAIL(img.src 为空)'));
    }

    // 7. 允许网民自助购买
    r.push('自助购买 → ' + await clickRadio(spec.selfSale, {all: true}));
    await page.waitForTimeout(600);

    // 8. 积分 / 销售价
    if (spec.integral !== '') {
      await page.locator('.el-dialog:visible input[placeholder="请输入兑换所需积分"]').first().fill(String(spec.integral));
    }
    await page.locator('.el-dialog:visible input[placeholder="请输入套餐销售价"]').first().fill(String(spec.price));
    r.push('销售价=' + spec.price);

    // 9. 提交前回读整张表单
    const before = await page.evaluate(() => {
      const norm = s => (s || '').replace(/\s+/g, ' ').trim();
      const visible = el => el && el.offsetParent !== null;
      const d = [...document.querySelectorAll('.el-dialog')].filter(visible)[0];
      return [...d.querySelectorAll('.el-form-item')].filter(i => visible(i)).map(i => {
        const label = norm(i.querySelector('.el-form-item__label')?.innerText).replace(/[:：]$/, '');
        const c = i.querySelector('.el-form-item__content') || i;
        const txt = norm(c.innerText).slice(0, 90);
        const on = [...c.querySelectorAll('.el-radio-button.is-active, .el-radio.is-checked')]
          .map(x => norm(x.innerText));
        return `${label} | 文本「${txt}」 | 选中项=${JSON.stringify(on)}`;
      });
    });
    r.push('提交前表单:\n    ' + before.join('\n    '));

    if (DRY_RUN) {
      r.push('>>> DRY_RUN，未提交。');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
      return r.join('\n');
    }

    // 10. 提交（⚠️ 底部「添 加」与单位旁「添 加」同名，必须限定在 footer 里点）
    //     同时截接口响应，前端 toast 往往只有「系统繁忙」这种兜底文案
    const respP = page.waitForResponse(
      r => /goodsPackage|package/i.test(r.url()) && r.request().method() === 'POST',
      {timeout: 20000}
    ).catch(() => null);
    r.push('提交 → ' + await clickBtn('添加', {scope: 'footer'}));
    const resp = await respP;
    await page.waitForTimeout(3000);
    if (resp) {
      let body = '';
      try { body = (await resp.text()).slice(0, 600); } catch (e) { body = '(读不到)'; }
      r.push(`接口 ${resp.status()} ${resp.url().split('?')[0].split('/').slice(-2).join('/')}\n    响应=${body}`);
    } else {
      r.push('⚠️ 没截到提交接口响应');
    }

    const errs = await page.evaluate(() => {
      const norm = s => (s || '').replace(/\s+/g, ' ').trim();
      const visible = el => el && el.offsetParent !== null;
      const d = [...document.querySelectorAll('.el-dialog')].filter(visible)[0];
      if (!d) return null;
      return {
        errors: [...d.querySelectorAll('.el-form-item__error')].filter(e => visible(e)).map(e => norm(e.innerText)),
        isError: [...d.querySelectorAll('.el-form-item.is-error')].filter(i => visible(i))
          .map(i => norm(i.querySelector('.el-form-item__label')?.innerText)),
      };
    });
    if (errs && (errs.errors.length || errs.isError.length)) {
      r.push('⚠️ 校验未过: errors=' + JSON.stringify(errs.errors) + ' 字段=' + JSON.stringify(errs.isError));
    }

    const after = await page.evaluate(() => {
      const norm = s => (s || '').replace(/\s+/g, ' ').trim();
      const visible = el => el && el.offsetParent !== null;
      const msg = [...document.querySelectorAll('.el-message, .el-message__content')]
        .filter(m => visible(m)).map(m => norm(m.innerText));
      const dlgOpen = [...document.querySelectorAll('.el-dialog')].some(d => d.offsetParent !== null);
      return {msg, dlgOpen};
    });
    r.push('提交结果: toast=' + JSON.stringify(after.msg) + ' 弹窗还开着=' + after.dlgOpen);
    return r.join('\n');
  };

  for (const spec of SPECS) log.push(await createOne(spec));

  // 全部建完：回读列表。
  // ⚠️ 只在「总数 > 当前页容量」时才切 100 条/页；套餐通常只有几条，白切一次多花 2~3 秒。
  await page.goto('https://wyb.5188cloud.net/marketManage/goodsManage/shop/goodsPackage',
    {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(4500);

  const total = await page.evaluate(() => {
    const t = (document.querySelector('.el-pagination') || {}).innerText || '';
    const m = t.match(/共\s*(\d+)\s*条/);
    if (!m) return null;
    const size = t.match(/(\d+)\s*条\/页/);
    return {count: +m[1], perPage: size ? +size[1] : 10};
  });
  if (total && total.count > total.perPage) {
    log.push(`\n列表共 ${total.count} 条 > ${total.perPage} 条/页，切 100 条/页`);
    try {
      await page.locator('.el-pagination__sizes .el-select').first().click();
      await page.waitForTimeout(700);
      await page.locator('.el-select-dropdown:visible .el-select-dropdown__item')
        .filter({hasText: /100/}).first().click();
      await page.waitForTimeout(2500);
    } catch (e) { log.push('切 100 失败，按当前页读'); }
  } else if (total) {
    log.push(`\n列表共 ${total.count} 条 ≤ ${total.perPage} 条/页，不切页，直接读`);
  }

  const list = await page.evaluate(() => {
    const norm = s => (s || '').replace(/\s+/g, ' ').trim();
    const heads = [...document.querySelectorAll('.el-table__header th')]
      .filter(th => th.offsetParent !== null).map(th => norm(th.innerText)).filter(Boolean);
    const rows = [...document.querySelectorAll('.el-table__body tbody tr')]
      .filter(tr => tr.offsetParent !== null)
      .map(tr => [...tr.querySelectorAll('td')].map(td =>
        td.querySelector('img') ? '[图]' : norm(td.innerText)));
    const pager = norm((document.querySelector('.el-pagination') || {}).innerText);
    return {heads, rows, pager};
  });

  log.push('\n===== 列表回读 =====');
  log.push('列头=' + JSON.stringify(list.heads));
  log.push('分页=' + list.pager);
  list.rows.forEach((r, i) => log.push(`${String(i).padStart(2)} ${r.join(' | ')}`));

  return log.join('\n');
}
