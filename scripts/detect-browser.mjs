#!/usr/bin/env node
/**
 * detect-browser.mjs —— 浏览器环境自检
 *
 * 用法：
 *   node scripts/detect-browser.mjs          # 打印人类可读报告
 *   node scripts/detect-browser.mjs --json   # 输出 JSON，供其他脚本消费
 *
 * 退出码：0 = playwright 就绪；1 = 缺东西，需按提示安装
 *
 * 本包只用 playwright-cli。脚本里顺带检测 ego-browser 仅作留档，
 * 不参与判定，装了或没装都不影响退出码。
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

// 本包唯一支持的后端是 playwright-cli。
// ego-browser 已评估并决定不采用（API 与 Playwright 不兼容，维护两套写法不划算），
// 这里只把它记录在报告里备查，不参与任何判定，缺了、坏了都不影响结论。
const ready = pw.ok && pwBrowsers.ok;

const missing = [];
if (!pw.ok) missing.push('playwright-cli 未安装：npm i -g @playwright/cli');
if (!pwBrowsers.ok) missing.push('浏览器内核未下载：npx playwright install chromium');

const report = {
  platform,
  node: process.version,
  ready,
  playwright: {
    cli: { available: pw.ok, version: pw.version, path: pw.path },
    browsers: {
      installed: pwBrowsers.ok,
      path: pwBrowsers.path,
      kernels: pwBrowsers.browsers,
    },
  },
  missing,
  // 仅供追溯，不代表可用性
  ego: { available: ego.ok, version: ego.version, path: ego.path, adopted: false },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const mark = (b) => (b ? 'OK  ' : 'MISS');
  console.log('浏览器环境自检（后端：playwright-cli）\n');
  console.log(`  平台           ${report.platform}  (node ${report.node})`);
  console.log(`  playwright-cli ${mark(pw.ok)}  ${pw.version || '-'}`);
  if (pw.path) console.log(`                  ${pw.path}`);
  console.log(`  浏览器内核      ${mark(pwBrowsers.ok)}  ${pwBrowsers.browsers.join(', ') || '未安装'}`);
  if (pwBrowsers.path) console.log(`                  ${pwBrowsers.path}`);

  console.log('');
  if (ready) {
    console.log('  结论：就绪，可以运行脚本。');
  } else {
    console.log('  结论：未就绪，请先补齐：');
    for (const item of missing) console.log(`    · ${item}`);
  }

  // ego 只是留档，避免有人反复问「能不能用 ego」
  console.log(`\n  （ego-browser ${ego.ok ? '存在，已评估' : '未安装'}；本包已决定不采用，不影响使用）`);
  if (ego.ok) console.log('   评估结论见 references/90-浏览器工具适配.md');
}

process.exit(ready ? 0 : 1);
