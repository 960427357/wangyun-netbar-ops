#!/usr/bin/env node
/**
 * detect-browser.js —— 浏览器后端探测
 *
 * 用法：
 *   node scripts/detect-browser.js          # 打印人类可读报告
 *   node scripts/detect-browser.js --json   # 输出 JSON，供其他脚本消费
 *
 * 退出码：0 = 至少有一个后端可用；1 = 两个都不可用
 *
 * 只做检测，不启动浏览器、不写任何文件。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const isWin = platform() === 'win32';

/**
 * 尝试执行一个命令，只返回是否可用及首行版本信息。
 *
 * 注意 shell 的用法：绝对路径里常含空格（如 "C:/Program Files/..."），
 * 一旦交给 shell 就会被按空格拆成多个参数而必然失败；
 * 只有在按名字调命令（可能解析到 .cmd 包装器）时才需要 shell。
 */
function probe(cmd, args = ['--version']) {
  const isAbsolutePath = /[\\/]/.test(cmd);
  try {
    const out = execFileSync(cmd, args, {
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: isWin && !isAbsolutePath,
      windowsHide: true,
    });
    return { ok: true, version: (out || '').trim().split('\n')[0].slice(0, 120) || null };
  } catch {
    // 执行失败（命令不存在 / 非零退出）一律视为不可用。
    // 不要用 stderr 内容兜底：Windows 的「不是内部或外部命令」正是失败的证据。
    return { ok: false, version: null };
  }
}

/** ego 可能不在 PATH，兜底扫一遍常见安装位置 */
function findEgo() {
  const direct = probe('ego-browser');
  if (direct.ok) return { ...direct, path: 'ego-browser (PATH)' };

  const candidates = [];
  if (isWin) {
    const roots = [
      'C:/Program Files/Citro Labs/ego lite/Application',
      'C:/Program Files (x86)/Citro Labs/ego lite/Application',
      join(homedir(), 'AppData/Local/Citro Labs/ego lite/Application'),
    ];
    for (const root of roots) {
      if (!existsSync(root)) continue;
      for (const ver of readdirSync(root).sort().reverse()) {
        const exe = join(root, ver, 'ego-browser.exe');
        if (existsSync(exe)) candidates.push({ exe, ver });
      }
    }
  } else {
    const roots = ['/Applications/ego lite.app/Contents/MacOS', join(homedir(), '.local/bin')];
    for (const root of roots) {
      for (const name of ['ego-browser', 'ego-browser.exe']) {
        const exe = join(root, name);
        if (existsSync(exe)) candidates.push({ exe, ver: null });
      }
    }
  }

  for (const { exe, ver } of candidates) {
    const r = probe(exe);
    // ego 的 --version 可能写到 stderr，取不到就退回安装目录名
    if (r.ok) return { ...r, version: r.version || ver, path: exe };
  }
  return { ok: false, version: null, path: null };
}

/** playwright-cli 的命令名在不同环境可能是 pwcli / playwright-cli */
function findPlaywrightCli() {
  for (const name of ['playwright-cli', 'pwcli']) {
    const r = probe(name);
    if (r.ok) return { ...r, path: `${name} (PATH)`, bin: name };
  }
  // Windows 全局 npm 目录
  if (isWin) {
    const npmBin = join(process.env.APPDATA || join(homedir(), 'AppData/Roaming'), 'npm');
    for (const name of ['playwright-cli.cmd', 'playwright-cli']) {
      const exe = join(npmBin, name);
      if (existsSync(exe)) {
        const r = probe(exe);
        if (r.ok) return { ...r, path: exe, bin: exe };
      }
    }
  }
  return { ok: false, version: null, path: null, bin: null };
}

/** 检查 Playwright 浏览器内核是否已下载，否则 open 会失败 */
function findPlaywrightBrowsers() {
  const roots = isWin
    ? [join(homedir(), 'AppData/Local/ms-playwright')]
    : [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const dirs = readdirSync(root).filter((d) => /^(chromium|firefox|webkit)/.test(d));
    if (dirs.length) return { ok: true, path: root, browsers: dirs };
  }
  return { ok: false, path: null, browsers: [] };
}

const ego = findEgo();
const pw = findPlaywrightCli();
const pwBrowsers = findPlaywrightBrowsers();

// 推荐策略：ego 更快的长流程，但它常驻 TaskSpace、需人工交接控制权；
// playwright 是零依赖基线，任何装了 node 的机器都能跑。
let recommended = 'none';
let reason = '';

if (pw.ok && pwBrowsers.ok) {
  recommended = 'playwright';
  reason = 'playwright-cli 与浏览器内核均就绪，可独立运行，无需 ego。';
  if (ego.ok) reason += ' ego 同时可用，长流程可切 ego 提速。';
} else if (ego.ok) {
  recommended = 'ego';
  reason = '仅 ego 可用；playwright-cli 或浏览器内核缺失。';
} else {
  reason = '两个后端都不可用，需先安装其一。';
}

const report = {
  platform,
  node: process.version,
  ego: { available: ego.ok, version: ego.version, path: ego.path },
  playwright: {
    cli: { available: pw.ok, version: pw.version, path: pw.path },
    browsers: {
      installed: pwBrowsers.ok,
      path: pwBrowsers.path,
      kernels: pwBrowsers.browsers,
    },
  },
  recommended,
  reason,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const mark = (b) => (b ? 'OK  ' : 'MISS');
  console.log('浏览器后端探测\n');
  console.log(`  平台          ${report.platform}  (node ${report.node})`);
  console.log(`  ego-browser   ${mark(ego.ok)}  ${ego.version || '-'}`);
  if (ego.path) console.log(`                 ${ego.path}`);
  console.log(`  playwright-cli ${mark(pw.ok)}  ${pw.version || '-'}`);
  if (pw.path) console.log(`                 ${pw.path}`);
  console.log(`  浏览器内核     ${mark(pwBrowsers.ok)}  ${pwBrowsers.browsers.join(', ') || '未安装'}`);
  console.log(`\n  推荐后端：${report.recommended}`);
  console.log(`  原因：${report.reason}`);
  console.log('\n  用法与写法对照见 references/90-浏览器工具适配.md');
}

process.exit(recommended === 'none' ? 1 : 0);
