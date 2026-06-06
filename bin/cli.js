#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

const VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version; }
  catch { return 'unknown'; }
})();

// ═══════════════════════════════════════════════════════════════════
// SCANNER — detects project type from filesystem
// ═══════════════════════════════════════════════════════════════════

function scanProject(dir, depth = 0) {
  const info = {
    name:        path.basename(dir),
    root:        dir,
    stack:       [],
    scripts:     {},
    configFiles: [],
    srcDirs:     [],
    isEmpty:     true,
  };

  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { return info; }

  const IGNORE = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', 'out',
    'Saved', 'Intermediate', 'DerivedDataCache', 'Binaries',
    '.memoc', 'skills', '.DS_Store', '.obsidian',
    'CLAUDE.md', 'AGENTS.md', 'llms.txt',
  ]);

  info.srcDirs = entries.filter(e => {
    try { return !IGNORE.has(e) && fs.statSync(path.join(dir, e)).isDirectory(); }
    catch { return false; }
  });

  const KNOWN_CONFIGS = [
    'package.json', 'tsconfig.json', 'jsconfig.json',
    'next.config.js', 'next.config.ts', 'next.config.mjs',
    'vite.config.js', 'vite.config.ts',
    'tailwind.config.js', 'tailwind.config.ts',
    'webpack.config.js', 'astro.config.mjs',
    'svelte.config.js', 'nuxt.config.ts',
    '.env', '.env.example', '.env.local',
    'Makefile', 'CMakeLists.txt',
    'Dockerfile', 'docker-compose.yml', 'compose.yml',
    'pyproject.toml', 'requirements.txt', 'setup.py', 'setup.cfg',
    'Cargo.toml', 'go.mod',
    'pom.xml', 'build.gradle', 'build.gradle.kts',
    'pubspec.yaml',
  ];
  info.configFiles = entries.filter(e => KNOWN_CONFIGS.includes(e));

  // ── Node.js
  const pkgPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    info.isEmpty = false;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) info.name = pkg.name;
      info.stack.push('Node.js');
      if (pkg.scripts) info.scripts = pkg.scripts;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['next'])                        info.stack.push('Next.js');
      else if (deps['react'])                  info.stack.push('React');
      if (deps['vue'])                         info.stack.push('Vue');
      if (deps['svelte'])                      info.stack.push('Svelte');
      if (deps['@angular/core'])               info.stack.push('Angular');
      if (deps['nuxt'])                        info.stack.push('Nuxt');
      if (deps['astro'])                       info.stack.push('Astro');
      if (deps['express'])                     info.stack.push('Express');
      if (deps['fastify'])                     info.stack.push('Fastify');
      if (deps['hono'])                        info.stack.push('Hono');
      if (deps['electron'])                    info.stack.push('Electron');
      if (deps['typescript'] || deps['ts-node']) info.stack.push('TypeScript');
      if (deps['prisma'] || deps['@prisma/client']) info.stack.push('Prisma');
      if (deps['drizzle-orm'])                 info.stack.push('Drizzle');
      if (deps['@supabase/supabase-js'])       info.stack.push('Supabase');
      if (deps['@tauri-apps/api'])             info.stack.push('Tauri');
    } catch {}
  }

  // ── Unreal Engine
  const uproject = entries.find(e => e.endsWith('.uproject'));
  if (uproject) {
    info.isEmpty = false;
    info.name = uproject.replace('.uproject', '');
    info.stack.push('Unreal Engine');
  }

  // ── Python
  if (['requirements.txt', 'pyproject.toml', 'setup.py'].some(f => fs.existsSync(path.join(dir, f)))) {
    info.isEmpty = false;
    info.stack.push('Python');
    try {
      const req = fs.existsSync(path.join(dir, 'requirements.txt'))
        ? fs.readFileSync(path.join(dir, 'requirements.txt'), 'utf8') : '';
      if (/fastapi/i.test(req))         info.stack.push('FastAPI');
      else if (/django/i.test(req))     info.stack.push('Django');
      else if (/flask/i.test(req))      info.stack.push('Flask');
      if (/torch|pytorch/i.test(req))   info.stack.push('PyTorch');
    } catch {}
  }

  // ── Rust
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) {
    info.isEmpty = false;
    info.stack.push('Rust');
  }

  // ── Go
  if (fs.existsSync(path.join(dir, 'go.mod'))) {
    info.isEmpty = false;
    info.stack.push('Go');
  }

  // ── C++ / CMake
  if (fs.existsSync(path.join(dir, 'CMakeLists.txt'))) {
    info.isEmpty = false;
    info.stack.push('C++ / CMake');
  }

  // ── .NET
  if (entries.some(e => e.endsWith('.csproj') || e.endsWith('.sln'))) {
    info.isEmpty = false;
    info.stack.push('.NET');
  }

  // ── Java
  if (fs.existsSync(path.join(dir, 'pom.xml')) || fs.existsSync(path.join(dir, 'build.gradle'))) {
    info.isEmpty = false;
    info.stack.push('Java');
  }

  // ── Flutter / Dart
  if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) {
    info.isEmpty = false;
    info.stack.push('Flutter');
  }

  // ── Monorepo: scan 1 level deep inside common workspace roots
  if (depth === 0) {
    for (const monoRoot of ['packages', 'apps', 'services', 'libs']) {
      const monoPath = path.join(dir, monoRoot);
      if (!fs.existsSync(monoPath)) continue;
      try {
        for (const sub of fs.readdirSync(monoPath)) {
          try {
            const subPath = path.join(monoPath, sub);
            if (!fs.statSync(subPath).isDirectory()) continue;
            const subInfo = scanProject(subPath, 1);
            if (!subInfo.isEmpty) info.isEmpty = false;
            for (const s of subInfo.stack) {
              if (!info.stack.includes(s)) info.stack.push(s);
            }
          } catch {}
        }
      } catch {}
    }
  }

  return info;
}

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

function nowISO() { return new Date().toISOString().slice(0, 19); }
function todayISO() { return new Date().toISOString().slice(0, 10); }

function stackStr(stack) { return stack.length ? stack.join(', ') : 'Not detected'; }

function listMd(arr, empty = '_None detected._') {
  return arr.length ? arr.map(x => `- \`${x}\``).join('\n') : empty;
}

function scriptsMd(scripts) {
  const pairs = Object.entries(scripts);
  return pairs.length
    ? pairs.map(([k, v]) => `- \`${k}\`: \`${v}\``).join('\n')
    : '_None detected._';
}

function hideOnWindows(dirPath) {
  if (process.platform === 'win32') {
    try { require('child_process').execFileSync('attrib', ['+h', dirPath], { stdio: 'ignore' }); } catch {}
  }
}

function chmodExecutable(filePath) {
  try { fs.chmodSync(filePath, 0o755); } catch {}
}

function isExecutable(filePath) {
  try { fs.accessSync(filePath, fs.constants.X_OK); return true; }
  catch { return false; }
}

function ensure(filePath, content) {
  if (fs.existsSync(filePath)) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return true;
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeChanged(filePath, content) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) return false;
  write(filePath, content);
  return true;
}

function slugify(value, fallback = 'note') {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

function uniquePath(filePath) {
  if (!fs.existsSync(filePath)) return filePath;
  const ext = path.extname(filePath);
  const base = filePath.slice(0, filePath.length - ext.length);
  let i = 2;
  while (fs.existsSync(`${base}-${i}${ext}`)) i += 1;
  return `${base}-${i}${ext}`;
}

function archiveLegacyLog(dir, mark) {
  const logPath = path.join(dir, '.memoc', 'log.md');
  if (!fs.existsSync(logPath)) {
    mark('skip', '.memoc/log.md (legacy; no file)');
    return;
  }
  const archivePath = uniquePath(path.join(dir, '.memoc', 'raw', 'legacy-log.md'));
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.renameSync(logPath, archivePath);
  mark('move', `${path.relative(dir, logPath)} -> ${path.relative(dir, archivePath)}`);
}

function movePathUnique(srcPath, destPath) {
  const target = uniquePath(destPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(srcPath, target);
  return target;
}

function archiveLegacySystems(dir, mark) {
  const systemsPath = path.join(dir, '.memoc', 'systems');
  if (!fs.existsSync(systemsPath)) {
    mark('skip', '.memoc/systems (legacy; no dir)');
    return;
  }
  const archivePath = movePathUnique(systemsPath, path.join(dir, '.memoc', 'raw', 'legacy-systems'));
  mark('move', `${path.relative(dir, systemsPath)} -> ${path.relative(dir, archivePath)}`);
}

function isDefaultLegacyWikiDirectory(dirPath) {
  let entries = [];
  try {
    entries = fs.readdirSync(dirPath).filter(name => !name.startsWith('.'));
  } catch {
    return false;
  }
  if (entries.length !== 1 || entries[0] !== 'README.md') return false;

  const src = safeRead(path.join(dirPath, 'README.md'));
  const name = path.basename(dirPath);
  if (name === 'sources') return src.includes('# Sources') && src.includes('Provenance records');
  if (name === 'topics') return src.includes('# Topics') && src.includes('Synthesized topic pages');
  if (name === 'global') return src.includes('# Global') && src.includes('Project-wide principles');
  return false;
}

function migrateKnowledgeWiki(dir, mark) {
  const wikiDir = path.join(dir, '.memoc', 'wiki');
  const knowledgeDir = path.join(wikiDir, 'knowledge');
  const moves = [
    ['sources.md', 'sources.md'],
    ['glossary.md', 'glossary.md'],
    ['questions.md', 'questions.md'],
    ['lint.md', 'lint.md'],
    ['sources', 'sources'],
    ['topics', 'topics'],
    ['global', 'global'],
  ];
  for (const [from, to] of moves) {
    const src = path.join(wikiDir, from);
    const dest = path.join(knowledgeDir, to);
    if (!fs.existsSync(src)) continue;
    if (fs.existsSync(dest)) {
      try {
        const st = fs.statSync(dest);
        if (st.isFile() && isDefaultKnowledgeScaffold(dest)) fs.unlinkSync(dest);
        else if (st.isDirectory() && fs.statSync(src).isDirectory()) {
          if (isDefaultLegacyWikiDirectory(src)) {
            fs.rmSync(src, { recursive: true, force: true });
            mark('remove', `${path.relative(dir, src)} (legacy wiki scaffold)`);
          } else {
            const archived = movePathUnique(src, path.join(dir, '.memoc', 'raw', 'legacy-wiki-root', from));
            mark('move', `${path.relative(dir, src)} -> ${path.relative(dir, archived)} (legacy wiki dir)`);
          }
          continue;
        }
        else continue;
      } catch {
        continue;
      }
    }
    const moved = movePathUnique(src, dest);
    mark('move', `${path.relative(dir, src)} -> ${path.relative(dir, moved)}`);
  }
}

function migrateKnowledgeLayerLinks(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const before = safeRead(filePath);
  if (!before) return false;

  let after = before;
  const normalized = filePath.replace(/\\/g, '/');

  if (/\/wiki\/knowledge\/(sources|glossary|questions|lint)\.md$/.test(normalized)) {
    after = after
      .replace(/\]\(index\.md\)/g, '](../index.md)')
      .replace(/\]\(\.\.\/raw\/README\.md\)/g, '](../../raw/README.md)');
  }

  if (/\/wiki\/knowledge\/global\/README\.md$/.test(normalized)) {
    after = after
      .replace(/\]\(\.\.\/index\.md\)/g, '](../../index.md)')
      .replace(/\]\(\.\.\/\.\.\/00-project-brief\.md\)/g, '](../../../00-project-brief.md)')
      .replace(/\]\(\.\.\/\.\.\/06-project-rules\.md\)/g, '](../../../06-project-rules.md)');
  }

  if (after === before) return false;
  write(filePath, after);
  return true;
}

function migrateRawKnowledgeLinks(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const before = safeRead(filePath);
  if (!before) return false;
  const after = before
    .replace(/\]\(\.\.\/wiki\/sources\/README\.md\)/g, '](../wiki/knowledge/sources/README.md)')
    .replace(/\]\(\.\.\/\.\.\/wiki\/sources\/README\.md\)/g, '](../../wiki/knowledge/sources/README.md)');
  if (after === before) return false;
  write(filePath, after);
  return true;
}

function isDefaultKnowledgeScaffold(filePath) {
  const src = safeRead(filePath);
  const name = path.basename(filePath);
  if (name === 'sources.md') return src.includes('# Sources') && src.includes('_No sources recorded yet.');
  if (name === 'glossary.md') return src.includes('# Glossary') && src.includes('_No terms defined yet.');
  if (name === 'questions.md') return src.includes('# Open Questions') && src.includes('_No open questions yet._');
  if (name === 'lint.md') return src.includes('# Wiki Lint') && src.includes('_No issues found._');
  return false;
}

function summarySectionBulletCounts(src) {
  const counts = {};
  let current = '';
  for (const line of String(src || '').split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].trim();
      counts[current] = counts[current] || 0;
      continue;
    }
    if (current && /^-\s+/.test(line)) counts[current] = (counts[current] || 0) + 1;
  }
  return counts;
}

function trimSummaryFile(dir) {
  const summaryPath = path.join(dir, '.memoc', 'session-summary.md');
  const archivePath = path.join(dir, '.memoc', 'session-summary-archive.md');
  if (!fs.existsSync(summaryPath)) {
    write(summaryPath, tplSessionSummary());
    return { action: 'add' };
  }

  const src = fs.readFileSync(summaryPath, 'utf8');
  const beforeBytes = Buffer.byteLength(src, 'utf8');
  const counts = summarySectionBulletCounts(src);
  const tooManyBullets = Object.values(counts).some(count => count > 3);
  if (beforeBytes <= 800 && !tooManyBullets) {
    return { action: 'skip', beforeBytes };
  }

  const compact = compactSessionSummary(src);
  const afterBytes = Buffer.byteLength(compact, 'utf8');
  const archiveHeader = fs.existsSync(archivePath)
    ? ''
    : '# Session Summary Archive\n\nOlder oversized startup summaries moved by `memoc trim-summary`.\n';
  fs.appendFileSync(archivePath, `${archiveHeader}\n## [${nowISO()}] archived summary (${beforeBytes}B)\n\n${src.trimEnd()}\n`, 'utf8');
  write(summaryPath, compact);
  return { action: 'trim', beforeBytes, afterBytes };
}

function migrateLegacyLogReferences(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const before = fs.readFileSync(filePath, 'utf8');
  let after = before
    .replace(/- \[Project Log\]\(log\.md\)\n/g, '- [Activity](activity.md)\n- [Worklog](worklog/README.md)\n')
    .replace(/\| `\.memoc\/log\.md` \| For append-only history \|\n/g, '| `.memoc/activity.md` | Generated worklog index |\n| `.memoc/worklog/` | Actor-scoped work history |\n')
    .replace(/See `\.memoc\/log\.md` for full history\./g, 'See `.memoc/worklog/` for full shared activity history.')
    .replace(/See `\.memoc\/log\.md`\./g, 'See `.memoc/worklog/` and generated `.memoc/activity.md`.')
    .replace(/- \[ \] `\.memoc\/log\.md` has a new entry for meaningful work\./g, '- [ ] Meaningful shared work has a `.memoc/worklog/<actor>/YYYY-MM/*.md` entry.')
    .replace(/Append `\.memoc\/log\.md` for meaningful changes, decisions, and handoffs\./g, 'Create a short actor worklog with `memoc work "<title>" --from-git` for meaningful changes, decisions, and handoffs.')
    .replace(/Keep completed history in `\.memoc\/log\.md`; keep current-state files short\./g, 'Keep completed history in actor worklogs; keep current-state files short.')
    .replace(/Append `\.memoc\/log\.md`\./g, 'If the change is meaningful shared work, run `memoc work "<title>" --from-git`.');
  if (after === before) return false;
  write(filePath, after);
  return true;
}

function markdownTitle(src, fallback) {
  const m = String(src || '').match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

function execGitConfig(dir, key) {
  try {
    return require('child_process')
      .execFileSync('git', ['config', '--get', key], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim();
  } catch {
    return '';
  }
}

function actorFile(dir) {
  return path.join(dir, '.memoc', 'local', 'actor');
}

function sanitizeActor(value) {
  return slugify(String(value || '').replace(/@.*$/, ''), 'unknown');
}

function detectActor(dir) {
  if (process.env.MEMOC_ACTOR) return { actor: sanitizeActor(process.env.MEMOC_ACTOR), source: 'MEMOC_ACTOR' };
  const localPath = actorFile(dir);
  try {
    const local = fs.readFileSync(localPath, 'utf8').trim();
    if (local) return { actor: sanitizeActor(local), source: '.memoc/local/actor' };
  } catch {}
  const gitUser = execGitConfig(dir, 'user.name');
  if (gitUser) return { actor: sanitizeActor(gitUser), source: 'git config user.name' };
  const gitEmail = execGitConfig(dir, 'user.email');
  if (gitEmail) return { actor: sanitizeActor(gitEmail), source: 'git config user.email' };
  const osUser = process.env.USER || process.env.USERNAME || process.env.LOGNAME;
  if (osUser) return { actor: sanitizeActor(osUser), source: 'OS user' };
  return { actor: 'unknown', source: 'fallback' };
}

function gitBranch(dir) {
  try {
    return require('child_process')
      .execFileSync('git', ['branch', '--show-current'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

function gitStatusFiles(dir) {
  try {
    const out = require('child_process')
      .execFileSync('git', ['status', '--short'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim();
    if (!out) return [];
    return out.split(/\r?\n/)
      .map(line => line.slice(3).trim())
      .filter(Boolean)
      .filter(file => !file.startsWith('.memoc/worklog/') && !file.startsWith('.memoc/activity.md'))
      .slice(0, 12);
  } catch {
    return [];
  }
}

function tplMemocCmdWrapper() {
  return [
    '@echo off',
    'set "MEMOC_RUNTIME=%MEMOC_RUNTIME_DIR%"',
    'if "%MEMOC_RUNTIME%"=="" (',
    '  if not "%LOCALAPPDATA%"=="" (',
    '    set "MEMOC_RUNTIME=%LOCALAPPDATA%\\memoc\\runtime"',
    '  ) else (',
    '    set "MEMOC_RUNTIME=%USERPROFILE%\\AppData\\Local\\memoc\\runtime"',
    '  )',
    ')',
    'set "MEMOC_CLI=%MEMOC_RUNTIME%\\bin\\cli.js"',
    'if exist "%MEMOC_CLI%" (',
    '  node "%MEMOC_CLI%" %*',
    ') else (',
    '  npx @kevin0181/memoc@latest %*',
    ')',
    'exit /b %ERRORLEVEL%',
    '',
  ].join('\r\n');
}

function tplMemocPs1Wrapper() {
  return [
    '$runtime = $env:MEMOC_RUNTIME_DIR',
    'if (-not $runtime) {',
    '  if ($env:LOCALAPPDATA) { $runtime = Join-Path $env:LOCALAPPDATA "memoc\\runtime" }',
    '  else { $runtime = Join-Path $env:USERPROFILE "AppData\\Local\\memoc\\runtime" }',
    '}',
    '$cli = Join-Path $runtime "bin\\cli.js"',
    'if (Test-Path $cli) {',
    '  & node $cli @args',
    '} else {',
    '  & npx @kevin0181/memoc@latest @args',
    '}',
    'exit $LASTEXITCODE',
    '',
  ].join('\n');
}

function tplMemocShWrapper() {
  return [
    '#!/bin/sh',
    'if [ -n "$MEMOC_RUNTIME_DIR" ]; then',
    '  memoc_runtime="$MEMOC_RUNTIME_DIR"',
    'else',
    '  memoc_runtime="${HOME:-$PWD}/.local/share/memoc/runtime"',
    'fi',
    'memoc_cli="$memoc_runtime/bin/cli.js"',
    'if [ -f "$memoc_cli" ]; then',
    '  exec node "$memoc_cli" "$@"',
    'fi',
    'exec npx @kevin0181/memoc@latest "$@"',
    '',
  ].join('\n');
}

function defaultUserBinDir() {
  if (process.env.MEMOC_USER_BIN_DIR) return process.env.MEMOC_USER_BIN_DIR;
  if (currentPlatform() === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || process.cwd(), 'AppData', 'Local'), 'memoc', 'bin');
  }
  return path.join(process.env.HOME || process.cwd(), '.local', 'bin');
}

function defaultRuntimeDir() {
  if (process.env.MEMOC_RUNTIME_DIR) return process.env.MEMOC_RUNTIME_DIR;
  if (currentPlatform() === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || process.cwd(), 'AppData', 'Local'), 'memoc', 'runtime');
  }
  return path.join(process.env.HOME || process.cwd(), '.local', 'share', 'memoc', 'runtime');
}

function runtimeCliPath() {
  return path.join(defaultRuntimeDir(), 'bin', 'cli.js');
}

function tplEnvPs1() {
  return `$memocBin = Join-Path $PSScriptRoot 'bin'\n$parts = $env:PATH -split [IO.Path]::PathSeparator\nif ($parts -notcontains $memocBin) {\n  $env:PATH = \"$memocBin$([IO.Path]::PathSeparator)$env:PATH\"\n}\n`;
}

function tplEnvSh() {
  return `# Source this from the project root to put the local memoc wrapper first in PATH.\nMEMOC_DIR="$PWD/.memoc"\ncase ":$PATH:" in\n  *":$MEMOC_DIR/bin:"*) ;;\n  *) PATH="$MEMOC_DIR/bin:$PATH"; export PATH ;;\nesac\n`;
}

function ensurePathHelpers(dir, mark) {
  ensureRuntimeInstall(mark);
  const files = [
    [path.join(dir, '.memoc', 'bin', 'memoc.cmd'), tplMemocCmdWrapper, false],
    [path.join(dir, '.memoc', 'bin', 'memoc.ps1'), tplMemocPs1Wrapper, false],
    [path.join(dir, '.memoc', 'bin', 'memoc'), tplMemocShWrapper, true],
    [path.join(dir, '.memoc', 'env.ps1'), tplEnvPs1, false],
    [path.join(dir, '.memoc', 'env.sh'), tplEnvSh, true],
  ];

  for (const [fp, tpl, executable] of files) {
    const rel = path.relative(dir, fp);
    const added = writeIfChanged(fp, tpl());
    if (executable) chmodExecutable(fp);
    mark(added, rel);
  }
}

function ensureUserLauncher(mark) {
  const userBin = defaultUserBinDir();
  ensureRuntimeInstall(mark);
  writeLaunchers(userBin, mark, 'user bin');
  return userBin;
}

function writeLaunchers(binDir, mark, label) {
  const files = [
    [path.join(binDir, 'memoc.cmd'), tplMemocCmdWrapper, false],
    [path.join(binDir, 'memoc.ps1'), tplMemocPs1Wrapper, false],
    [path.join(binDir, 'memoc'), tplMemocShWrapper, true],
  ];

  for (const [fp, tpl, executable] of files) {
    const added = writeIfChanged(fp, tpl());
    if (executable) chmodExecutable(fp);
    mark(added, `${label} ${path.basename(fp)}`);
  }
}

function writeIfChanged(filePath, content) {
  if (!fs.existsSync(filePath)) {
    write(filePath, content);
    return 'add';
  }
  try {
    if (fs.readFileSync(filePath, 'utf8') === content) return 'skip';
  } catch {}
  write(filePath, content);
  return 'update';
}

function writeIfDefaultish(filePath, content, isDefaultish) {
  if (!fs.existsSync(filePath)) {
    write(filePath, content);
    return 'add';
  }
  let src = '';
  try { src = fs.readFileSync(filePath, 'utf8'); } catch { return 'skip'; }
  if (!isDefaultish(src)) return 'skip';
  if (src === content) return 'skip';
  write(filePath, content);
  return 'update';
}

function hasOnlyScaffold(src, required) {
  if (!required.every(part => src.includes(part))) return false;
  const nonEmpty = src.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return nonEmpty.length <= 16;
}

function ensurePathRegistration(dir, mark) {
  ensureCurrentPathLauncher(mark);
  const binDir = ensureUserLauncher(mark);
  const pathSep = path.delimiter;

  if ((process.env.PATH || '').split(pathSep).some(p => samePath(p, binDir))) {
    mark('skip', 'PATH (user memoc bin already active)');
    return;
  }

  process.env.PATH = `${binDir}${pathSep}${process.env.PATH || ''}`;

  if (process.env.MEMOC_SKIP_PATH_REGISTER === '1') {
    mark('skip', 'PATH registration (test mode)');
    return;
  }

  if (currentPlatform() !== 'win32') {
    const updated = ensureUnixPathRegistration(binDir);
    mark(updated ? 'update' : 'skip', `${currentPlatform()} PATH (${userPathShellHint(binDir)})`);
    return;
  }

  try {
    const current = require('child_process')
      .execFileSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        "[Environment]::GetEnvironmentVariable('Path','User')",
      ], { encoding: 'utf8' })
      .trim();
    const parts = current.split(pathSep).filter(Boolean);
    if (parts.some(p => samePath(p, binDir))) {
      mark('skip', 'User PATH (memoc bin already registered)');
      return;
    }
    const nextPath = [binDir, ...parts].join(pathSep);
    require('child_process').execFileSync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      `[Environment]::SetEnvironmentVariable('Path', ${JSON.stringify(nextPath)}, 'User')`,
    ], { stdio: 'ignore' });
    mark('update', 'User PATH (memoc bin added; open a new terminal if needed)');
  } catch {
    mark('skip', 'User PATH registration failed (use . .\\.memoc\\env.ps1)');
  }
}

function ensureCurrentPathLauncher(mark) {
  const target = findWritablePathDir();
  if (!target) {
    mark('skip', 'active PATH launcher (no writable PATH directory found)');
    return false;
  }
  ensureRuntimeInstall(mark);
  writeLaunchers(target, mark, 'active PATH');
  return true;
}

function ensureRuntimeInstall(mark) {
  const runtimeDir = defaultRuntimeDir();
  const sourceRoot = path.join(__dirname, '..');
  const files = [
    [path.join(sourceRoot, 'bin', 'cli.js'), path.join(runtimeDir, 'bin', 'cli.js')],
    [path.join(sourceRoot, 'package.json'), path.join(runtimeDir, 'package.json')],
  ];
  const resourceDirs = [
    [path.join(sourceRoot, 'plugins'), path.join(runtimeDir, 'plugins')],
    [path.join(sourceRoot, 'skills'), path.join(runtimeDir, 'skills')],
  ];

  for (const [src, dest] of files) {
    try {
      const content = fs.readFileSync(src, 'utf8');
      const changed = writeIfChanged(dest, content);
      mark(changed, `runtime ${path.relative(runtimeDir, dest)}`);
    } catch {
      mark('skip', `runtime ${path.basename(dest)} unavailable`);
    }
  }

  for (const [src, dest] of resourceDirs) {
    try {
      if (!fs.existsSync(src)) {
        mark('skip', `runtime ${path.basename(dest)} unavailable`);
        continue;
      }
      fs.rmSync(dest, { recursive: true, force: true });
      copyDirSync(src, dest);
      mark(true, `runtime ${path.basename(dest)}`);
    } catch {
      mark('skip', `runtime ${path.basename(dest)} unavailable`);
    }
  }

  chmodExecutable(path.join(runtimeDir, 'bin', 'cli.js'));
  return path.join(runtimeDir, 'bin', 'cli.js');
}

function findWritablePathDir() {
  const dirs = [...new Set((process.env.PATH || '').split(path.delimiter).filter(Boolean))];
  const npmBin = npmGlobalBinDir();
  const ranked = dirs
    .filter(d => !isVolatilePathDir(d))
    .filter(d => {
      try { return fs.existsSync(d) && fs.statSync(d).isDirectory() && canWriteDir(d); }
      catch { return false; }
    })
    .sort((a, b) => pathRank(a, npmBin) - pathRank(b, npmBin));
  return ranked[0] || null;
}

function pathRank(dir, npmBin) {
  if (npmBin && samePath(dir, npmBin)) return 0;
  const lower = dir.toLowerCase();
  for (const root of userWritableRoots()) {
    if (root && lower.startsWith(root.toLowerCase())) return 1;
  }
  return 5;
}

function userWritableRoots() {
  return [
    process.env.APPDATA,
    process.env.LOCALAPPDATA,
    process.env.HOME,
    process.env.USERPROFILE,
  ].filter(Boolean).map(p => path.resolve(p));
}

function npmGlobalBinDir() {
  try {
    const prefix = require('child_process').execFileSync('npm', ['config', 'get', 'prefix'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!prefix) return null;
    return currentPlatform() === 'win32' ? prefix : path.join(prefix, 'bin');
  } catch {
    return null;
  }
}

function isVolatilePathDir(dir) {
  const lower = dir.toLowerCase();
  return lower.includes(`${path.sep}_npx${path.sep}`) ||
    lower.includes(`${path.sep}node_modules${path.sep}.bin`) ||
    lower.includes(`${path.sep}npm-cache${path.sep}_npx${path.sep}`);
}

function canWriteDir(dir) {
  const probe = path.join(dir, `.memoc-write-test-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(probe, '');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function ensureUnixPathRegistration(binDir) {
  if (process.env.MEMOC_SKIP_PATH_REGISTER === '1') return false;

  const home = process.env.HOME;
  if (!home) return false;

  const block = [
    '# memoc PATH',
    `MEMOC_BIN=${shellSingleQuote(binDir)}`,
    'case ":$PATH:" in *":$MEMOC_BIN:"*) ;; *) PATH="$MEMOC_BIN:$PATH"; export PATH ;; esac',
    '# end memoc PATH',
  ].join('\n');

  const candidates = [
    path.join(home, '.profile'),
    path.join(home, '.zshrc'),
    path.join(home, '.bashrc'),
  ];

  let changed = false;
  for (const fp of candidates) {
    try {
      const src = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : '';
      if (src.includes(binDir) || src.includes('# memoc PATH')) continue;
      fs.appendFileSync(fp, `${src.endsWith('\n') || !src ? '' : '\n'}\n${block}\n`, 'utf8');
      changed = true;
    } catch {}
  }
  return changed;
}

function userPathShellHint(binDir) {
  return `user bin ${binDir} ${process.env.MEMOC_SKIP_PATH_REGISTER === '1' ? 'test mode' : 'registered; open a new terminal if needed'}`;
}

function currentPlatform() {
  return process.env.MEMOC_PLATFORM || process.platform;
}

function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function psSingleQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function escapeCmdPath(value) {
  return String(value).replace(/"/g, '""');
}

function samePath(a, b) {
  if (!a || !b) return false;
  const norm = p => path.resolve(p).toLowerCase().replace(/[\\/]+$/, '');
  try { return norm(a) === norm(b); } catch { return false; }
}

function updateSection(filePath, startMark, endMark, inner) {
  if (!fs.existsSync(filePath)) return false;
  const src = fs.readFileSync(filePath, 'utf8');
  const range = findMarkedRange(src, startMark, endMark);
  if (!range) return false;
  write(filePath,
    src.slice(0, range.s) + startMark + '\n' + inner + '\n' + endMark + src.slice(range.e + range.endMark.length)
  );
  return true;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION MARKERS
// ═══════════════════════════════════════════════════════════════════

const mk = n => [`<!-- memoc:${n}:start -->`, `<!-- memoc:${n}:end -->`];
const [MGMT_S,  MGMT_E]  = mk('managed');
const [ID_S,    ID_E]    = mk('identity');
const [SNAP_S,  SNAP_E]  = mk('snapshot');
const [CORE_S,  CORE_E]  = mk('core');
const [HDR_S,   HDR_E]   = mk('header');
const [SYS_S,   SYS_E]   = mk('systems');
const [WIKI_S,  WIKI_E]  = mk('wiki');

function markerPairs(startMark, endMark) {
  const legacyStart = startMark.replace('<!-- memoc:', '<!-- context-forge:');
  const legacyEnd = endMark.replace('<!-- memoc:', '<!-- context-forge:');
  return legacyStart === startMark
    ? [[startMark, endMark]]
    : [[startMark, endMark], [legacyStart, legacyEnd]];
}

function findMarkedRange(src, startMark, endMark) {
  for (const [sMark, eMark] of markerPairs(startMark, endMark)) {
    const s = src.indexOf(sMark);
    const e = src.indexOf(eMark);
    if (s !== -1 && e !== -1 && e > s) return { s, e, endMark: eMark };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// AGENT REGISTRY — third-party agent entry files (added via `add`)
// ═══════════════════════════════════════════════════════════════════

const AGENT_REGISTRY = {
  cursor:   { file: '.cursorrules',                    label: 'Cursor'         },
  windsurf: { file: '.windsurfrules',                  label: 'Windsurf'       },
  copilot:  { file: '.github/copilot-instructions.md', label: 'GitHub Copilot' },
  gemini:   { file: 'GEMINI.md',                       label: 'Gemini CLI'     },
};

// ═══════════════════════════════════════════════════════════════════
// DYNAMIC CONTENT (re-generated on update)
// ═══════════════════════════════════════════════════════════════════

function legacyManagedBlock() {
  return `${MGMT_S}
## Session Start
- [ ] Read \`.memoc/session-summary.md\`
- [ ] \`.pending\` exists? → review changed files → update memory if needed → delete it
- [ ] If \`memoc\` is not found in an existing shell, open a new terminal or load the local helper: PowerShell \`. .\\.memoc\\env.ps1\`; sh \`. ./.memoc/env.sh\`

## Before Opening More Files
- [ ] Run memoc commands in this order: \`memoc search "<query>"\` → \`.\\.memoc\\bin\\memoc.cmd search "<query>"\` (Windows) or \`.memoc/bin/memoc search "<query>"\` (sh) → \`npx @kevin0181/memoc search "<query>"\`
- [ ] Open on demand: \`02\` status · \`04\` resume · \`06\` rules · \`llms.txt\` map
- [ ] If memory search is not enough, search project files with \`memoc grep "<query>" --limit 5\`
- [ ] Keep output small: \`summary\`, \`search --limit\`, \`grep --limit\`, \`--snippets\`

## Before Finishing _(update only applicable files; skip Q&A / throwaway exploration)_
- [ ] Code/config/deps changed → \`02\` (version, commands list, Last synced) + \`session-summary.md\` (status, changed, open tasks)
- [ ] Decision made → \`03-decisions.md\` (what & why) + \`02\`
- [ ] Work incomplete or risky → \`04-handoff.md\` (verified commands, unverified items, next steps)
- [ ] Rule/preference set → \`06-project-rules.md\`
- [ ] Wiki/project-memory work → read \`skills/project-memory-maintainer/SKILL.md\`
${MGMT_E}`;
}

function managedBlock() {
  return `${MGMT_S}
## Session Start
- [ ] Read \`.memoc/session-summary.md\`
- [ ] \`.pending\` exists? Review changed files, update memory if needed, then delete it.
- [ ] If \`memoc\` is not found, use the project-local wrapper for the rest of the session: Windows \`.\\.memoc\\bin\\memoc.cmd <command>\`; sh \`.memoc/bin/memoc <command>\`

## Before Opening More Files
- [ ] Search memory first: \`memoc search "<query>" --limit 5\`, or wrapper fallback above if PATH fails
- [ ] Open on demand: \`02\` status, \`04\` resume, \`06\` rules, \`llms.txt\` map
- [ ] If memory search is not enough, search project files with \`memoc grep "<query>" --limit 5\` (or wrapper fallback)
- [ ] If asked to refresh/update memoc project memory, run \`memoc update\` first; this refreshes managed sections, wiki links, and Obsidian tags.
- [ ] For durable source material use \`memoc ingest <path-or-url>\`; for durable analysis/query results use \`memoc note "<title>"\`; after wiki edits run \`memoc lint-wiki\`.
- [ ] In shared repos, record meaningful work with \`memoc work "<title>"\`; actor defaults to \`MEMOC_ACTOR\`, local actor, git user, git email, or OS user.
- [ ] Keep output small: \`summary\`, \`search --limit\`, \`grep --limit\`, \`--snippets\`

## Before Finishing _(update only applicable files; skip Q&A / throwaway exploration)_
- [ ] Code/config/deps changed? Update \`02\` + \`session-summary.md\`
- [ ] Decision made? Update \`03-decisions.md\` + \`02\`
- [ ] Work incomplete or risky? Update \`04-handoff.md\`
- [ ] Rule/preference set? Update \`06-project-rules.md\`
- [ ] Wiki/project-memory work? Read \`skills/project-memory-maintainer/SKILL.md\`
- [ ] User asked to update memoc/project memory? Run \`memoc update\`, then update the smallest relevant agent-owned memory files.
- [ ] Shared repo work? Prefer \`memoc work "<title>" --from-git\` over appending shared files; run \`memoc activity --write\` only when regenerating indexes.
- [ ] Keep \`session-summary.md\` as a replace-only snapshot under 800B; move completed work to actor worklogs and resume risks to \`04-handoff.md\`. If it grew, run \`memoc trim-summary\`.
${MGMT_E}`;
}

function identityInner(p) {
  return [
    `- Project name: \`${p.name}\``,
    `- Detected stack: ${stackStr(p.stack)}`,
  ].join('\n');
}

function snapshotInner(p) {
  const lines = [
    `- Last synced: ${nowISO()}`,
    `- Detected stack: ${stackStr(p.stack)}`,
  ];
  if (p.configFiles.length)
    lines.push(`\n### Config Files\n\n${listMd(p.configFiles)}`);
  if (p.srcDirs.length)
    lines.push(`\n### Source Directories\n\n${listMd(p.srcDirs)}`);
  const sc = scriptsMd(p.scripts);
  if (sc !== '_None detected._')
    lines.push(`\n### Package Scripts\n\n${sc}`);
  return lines.join('\n');
}

function coreLlmsInner() {
  return `- [Session Summary](.memoc/session-summary.md): only required startup read.
- [Current State](.memoc/02-current-project-state.md): status, tasks, commands.
- [Handoff](.memoc/04-handoff.md): resume context, blockers, verification.
- [Rules](.memoc/06-project-rules.md): durable preferences.
- [Agent Index](.memoc/00-agent-index.md): compact file map.
- [Project Brief](.memoc/00-project-brief.md): short identity and direction.
- [Workflow](.memoc/01-agent-workflow.md): update trigger matrix.
- [Decisions](.memoc/03-decisions.md): durable decisions.
- [Project Wiki](.memoc/wiki/project/README.md): repo implementation docs.
- [Knowledge Wiki](.memoc/wiki/knowledge/README.md): external sources, concepts, glossary.
- [Activity](.memoc/activity.md): generated worklog index.
- [Raw Sources](.memoc/raw/README.md): immutable source material; do not read by default.
- [Wiki](.memoc/wiki/index.md): project/knowledge wiki hub.`;
}

function headerInner(p) {
  return `# ${p.name}\n\n> LLM-facing project map for this project.`;
}

function projectWikiLlmsInner(dir) {
  const projectDir = path.join(dir, '.memoc', 'wiki', 'project');
  if (!fs.existsSync(projectDir)) return '_None yet._';
  const files = fs.readdirSync(projectDir)
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .sort();
  if (!files.length) return '_None yet._';
  return files.map(f => `- [${f.replace('.md', '')}](.memoc/wiki/project/${f}): project implementation context.`).join('\n');
}

function wikiLlmsInner(dir) {
  const wikiDir = path.join(dir, '.memoc', 'wiki');
  if (!fs.existsSync(wikiDir)) return '_None yet._';
  const lines = [];
  try {
    const knowledgeDir = path.join(wikiDir, 'knowledge');
    for (const f of ['README.md', 'sources.md', 'glossary.md', 'questions.md', 'lint.md']) {
      if (fs.existsSync(path.join(knowledgeDir, f))) {
        lines.push(`- [knowledge/${f.replace('.md', '')}](.memoc/wiki/knowledge/${f}): knowledge wiki page.`);
      }
    }
    for (const sub of ['sources', 'topics', 'global']) {
      const subDir = path.join(knowledgeDir, sub);
      if (!fs.existsSync(subDir)) continue;
      for (const f of fs.readdirSync(subDir).sort()) {
        if (!f.endsWith('.md')) continue;
        lines.push(`- [knowledge/${sub}/${f.replace('.md', '')}](.memoc/wiki/knowledge/${sub}/${f}): knowledge wiki page.`);
      }
    }
  } catch {}
  return lines.length ? lines.join('\n') : '_None yet._';
}

function wikiScaffoldFiles(memDir) {
  return [
    [
      path.join(memDir, 'wiki/index.md'),
      tplWikiIndex,
      src => src.includes('# Wiki Index') && !src.includes('wiki/project'),
    ],
    [
      path.join(memDir, 'wiki/project/README.md'),
      tplWikiProjectReadme,
      src => hasOnlyScaffold(src, ['# Project Wiki', 'Implementation docs']) && !src.includes('## Related'),
    ],
    [
      path.join(memDir, 'wiki/knowledge/README.md'),
      tplWikiKnowledgeReadme,
      src => hasOnlyScaffold(src, ['# Knowledge Wiki', 'Source-backed concepts']) && !src.includes('## Related'),
    ],
    [
      path.join(memDir, 'wiki/knowledge/sources.md'),
      tplWikiSources,
      src => hasOnlyScaffold(src, ['# Sources', '_No sources recorded yet._']) && !src.includes('## Related'),
    ],
    [
      path.join(memDir, 'wiki/knowledge/glossary.md'),
      tplWikiGlossary,
      src => hasOnlyScaffold(src, ['# Glossary', '_No terms defined yet._']) && !src.includes('## Related'),
    ],
    [
      path.join(memDir, 'wiki/knowledge/questions.md'),
      tplWikiQuestions,
      src => hasOnlyScaffold(src, ['# Open Questions', '_No open questions yet._']) && !src.includes('## Related'),
    ],
    [
      path.join(memDir, 'wiki/knowledge/lint.md'),
      tplWikiLint,
      src => src.includes('# Wiki Lint') && src.includes('_No issues found._') && !src.includes('## Graph Checks'),
    ],
    [
      path.join(memDir, 'wiki/knowledge/sources/README.md'),
      tplWikiSourcesReadme,
      src => hasOnlyScaffold(src, ['# Sources', 'Provenance records']) && !src.includes('## Related'),
    ],
    [
      path.join(memDir, 'wiki/knowledge/topics/README.md'),
      tplWikiTopicsReadme,
      src => hasOnlyScaffold(src, ['# Topics', 'Synthesized topic pages']) && !src.includes('## Related'),
    ],
    [
      path.join(memDir, 'wiki/knowledge/global/README.md'),
      tplWikiGlobalReadme,
      src => hasOnlyScaffold(src, ['# Global', 'Project-wide principles']) && !src.includes('## Related'),
    ],
  ];
}

function ensureWikiScaffoldLinks(memDir, mark) {
  for (const [fp, tpl, isDefaultish] of wikiScaffoldFiles(memDir)) {
    const result = writeIfDefaultish(fp, tpl(), isDefaultish);
    if (result !== 'skip') mark(result, `${path.relative(path.dirname(memDir), fp)} (wiki links)`);
  }
}

function ensureObsidianFrontmatter(dir, mark) {
  const files = collectMemocMarkdownFiles(dir);
  let changed = 0;
  for (const fp of files) {
    if (ensureMemocFrontmatter(fp, dir)) changed += 1;
  }
  mark(changed ? 'update' : 'skip', `Obsidian tags (${changed || 'already present'})`);
}

function collectMemocMarkdownFiles(dir) {
  const files = [];
  function walk(root) {
    if (!fs.existsSync(root)) return;
    try {
      const st = fs.statSync(root);
      if (st.isFile()) {
        if (root.endsWith('.md')) files.push(root);
        return;
      }
      if (!st.isDirectory()) return;
      for (const entry of fs.readdirSync(root)) walk(path.join(root, entry));
    } catch {}
  }
  walk(path.join(dir, '.memoc'));
  walk(path.join(dir, 'skills', 'project-memory-maintainer'));
  return files
    .filter(fp => !/session-summary-archive(?:-\d+)?\.md$/.test(path.basename(fp)))
    .sort();
}

function ensureMemocFrontmatter(filePath, dir) {
  let src = '';
  try { src = fs.readFileSync(filePath, 'utf8'); } catch { return false; }
  const spec = obsidianFrontmatterSpec(path.relative(dir, filePath));
  const next = mergeYamlFrontmatter(src, spec);
  if (next === src) return false;
  write(filePath, next);
  return true;
}

function obsidianFrontmatterSpec(relPath) {
  const rel = relPath.replace(/\\/g, '/');
  let type = 'core';
  const tags = ['memoc'];
  const now = nowISO();
  const extra = {
    created: now,
    updated: now,
    status: 'active',
  };

  if (rel.startsWith('.memoc/wiki/')) {
    type = 'wiki';
    extra.confidence = 'medium';
    tags.push('memoc/wiki');
    if (rel.startsWith('.memoc/wiki/project/')) {
      tags.push('memoc/project-wiki');
      if (rel.endsWith('/README.md')) tags.push('memoc/project-index');
      else tags.push('memoc/project-doc');
    } else if (rel.startsWith('.memoc/wiki/knowledge/')) {
      tags.push('memoc/knowledge-wiki');
      if (rel.startsWith('.memoc/wiki/knowledge/sources/')) {
        tags.push('memoc/source');
        extra.status = 'needs-synthesis';
      } else if (rel.startsWith('.memoc/wiki/knowledge/topics/')) {
        tags.push('memoc/topic');
      } else if (rel.startsWith('.memoc/wiki/knowledge/global/')) {
        tags.push('memoc/global');
      } else if (rel.endsWith('/sources.md')) {
        tags.push('memoc/source');
      } else if (rel.endsWith('/glossary.md')) {
        tags.push('memoc/glossary');
      } else if (rel.endsWith('/questions.md')) {
        tags.push('memoc/question');
        extra.status = 'needs-review';
      } else if (rel.endsWith('/lint.md')) {
        tags.push('memoc/lint');
        extra.status = 'generated';
      }
    } else if (rel.startsWith('.memoc/wiki/sources/')) {
      tags.push('memoc/source');
      extra.status = 'needs-synthesis';
    } else if (rel.startsWith('.memoc/wiki/topics/')) {
      tags.push('memoc/topic');
    } else if (rel.startsWith('.memoc/wiki/global/')) {
      tags.push('memoc/global');
    } else if (rel.endsWith('/sources.md')) {
      tags.push('memoc/source');
    } else if (rel.endsWith('/glossary.md')) {
      tags.push('memoc/glossary');
    } else if (rel.endsWith('/questions.md')) {
      tags.push('memoc/question');
      extra.status = 'needs-review';
    } else if (rel.endsWith('/lint.md')) {
      tags.push('memoc/lint');
      extra.status = 'generated';
    }
  } else if (rel.startsWith('.memoc/systems/')) {
    type = 'system';
    tags.push('memoc/system');
  } else if (rel.startsWith('.memoc/raw/')) {
    type = 'raw';
    tags.push('memoc/raw');
  } else if (rel.startsWith('.memoc/worklog/')) {
    type = 'worklog';
    tags.push('memoc/worklog');
  } else if (rel.startsWith('.memoc/actors/')) {
    type = 'actor';
    tags.push('memoc/actor');
  } else if (rel.startsWith('skills/project-memory-maintainer/')) {
    type = 'skill';
    tags.push('memoc/skill');
  } else if (/(session-summary|current-project-state|handoff|project-rules|decisions|log)\.md$/.test(rel)) {
    type = 'state';
    tags.push('memoc/state');
  } else {
    tags.push('memoc/core');
  }

  return { type, tags, extra };
}

function mergeYamlFrontmatter(src, spec) {
  const fm = parseYamlFrontmatter(src);
  if (!fm) {
    return `${formatMemocFrontmatter(spec)}\n${String(src || '').replace(/^\uFEFF/, '')}`;
  }

  let body = fm.body;
  let rest = String(src || '').slice(fm.end).replace(/^\uFEFF/, '');
  const nested = parseYamlFrontmatter(rest);
  if (nested) {
    body = `${nested.body}\n${body}`;
    rest = rest.slice(nested.end).replace(/^\uFEFF/, '');
  }

  const lines = body.split(/\r?\n/);
  const existingTags = readYamlTags(lines);
  const mergedTags = [...new Set([...existingTags, ...spec.tags])];
  const nextLines = mergeYamlScalar(lines, 'memoc', 'true');
  mergeYamlScalar(nextLines, 'type', spec.type);
  mergeYamlScalar(nextLines, 'scope', 'project-memory');
  mergeYamlScalarIfMissing(nextLines, 'updated', spec.extra.updated);
  mergeYamlScalarIfMissing(nextLines, 'created', spec.extra.created);
  mergeYamlScalarIfMissing(nextLines, 'status', spec.extra.status);
  if (spec.extra.confidence) mergeYamlScalarIfMissing(nextLines, 'confidence', spec.extra.confidence);
  mergeYamlTags(nextLines, mergedTags);

  const nextFm = ['---', ...nextLines, '---'].join('\n');
  return `${nextFm}\n${rest.replace(/^\r?\n/, '')}`;
}

function parseYamlFrontmatter(src) {
  const text = String(src || '').replace(/^\uFEFF/, '');
  const offset = text.length === src.length ? 0 : 1;
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return null;
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return null;
  return { body: m[1], end: m[0].length + offset };
}

function formatMemocFrontmatter(spec) {
  return [
    '---',
    'memoc: true',
    `type: ${spec.type}`,
    'scope: project-memory',
    `created: ${spec.extra.created}`,
    `updated: ${spec.extra.updated}`,
    `status: ${spec.extra.status}`,
    ...(spec.extra.confidence ? [`confidence: ${spec.extra.confidence}`] : []),
    'tags:',
    ...spec.tags.map(tag => `  - ${tag}`),
    '---',
  ].join('\n');
}

function mergeYamlScalar(lines, key, value) {
  const re = new RegExp(`^${escapeRegExp(key)}\\s*:`);
  const idx = lines.findIndex(line => re.test(line.trim()));
  if (idx === -1) lines.push(`${key}: ${value}`);
  else lines[idx] = `${key}: ${value}`;
  return lines;
}

function mergeYamlScalarIfMissing(lines, key, value) {
  const re = new RegExp(`^${escapeRegExp(key)}\\s*:`);
  if (lines.findIndex(line => re.test(line.trim())) === -1) lines.push(`${key}: ${value}`);
  return lines;
}

function mergeYamlTags(lines, tags) {
  const idx = lines.findIndex(line => /^tags\s*:/.test(line.trim()));
  const tagLines = ['tags:', ...tags.map(tag => `  - ${tag}`)];
  if (idx === -1) {
    lines.push(...tagLines);
    return;
  }

  let end = idx + 1;
  while (end < lines.length && (/^\s+-\s+/.test(lines[end]) || lines[end].trim() === '')) end += 1;
  lines.splice(idx, end - idx, ...tagLines);
}

function readYamlTags(lines) {
  const tags = [];
  const inline = lines.find(line => /^tags\s*:\s*\[/.test(line.trim()));
  if (inline) {
    const m = inline.match(/\[(.*)\]/);
    if (m) {
      for (const item of m[1].split(',')) {
        const tag = item.trim().replace(/^['"]|['"]$/g, '').replace(/^#/, '');
        if (tag) tags.push(tag);
      }
    }
  }

  const idx = lines.findIndex(line => /^tags\s*:/.test(line.trim()));
  if (idx !== -1) {
    for (let i = idx + 1; i < lines.length; i++) {
      const m = lines[i].match(/^\s+-\s+(.+?)\s*$/);
      if (!m) {
        if (lines[i].trim() === '') continue;
        break;
      }
      const tag = m[1].trim().replace(/^['"]|['"]$/g, '').replace(/^#/, '');
      if (tag) tags.push(tag);
    }
  }

  return [...new Set(tags)];
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATES — entry files
// ═══════════════════════════════════════════════════════════════════

function tplClaude() {
  return `# CLAUDE.md

This is the Claude Code entry file for the project.

${managedBlock()}
`;
}

function tplAgents() {
  return `# AGENTS.md

This is the Codex entry file for the project.

${managedBlock()}
`;
}

function tplAgentEntry(label) {
  return `# ${label}

This is the ${label} entry file for this project.

${managedBlock()}
`;
}

function tplLlmsTxt(p) {
  return `${HDR_S}
# ${p.name}

> LLM-facing project map for this project.
${HDR_E}

This file is a map, not a startup read. Start from the entry-file protocol and open only what the task needs.

## Core

${CORE_S}
${coreLlmsInner()}
${CORE_E}

## Project Wiki

${SYS_S}
_None yet._
${SYS_E}

## Knowledge Wiki

${WIKI_S}
_None yet._
${WIKI_E}

## Optional

- [AGENTS.md](AGENTS.md): Codex entry file.
- [CLAUDE.md](CLAUDE.md): Claude Code entry file.
- [Project Memory Maintainer](skills/project-memory-maintainer/SKILL.md): local maintenance skill.
`;
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATES — dynamic .memoc files
// ═══════════════════════════════════════════════════════════════════

function tplProjectBrief(p) {
  return `# Project Brief

This is the shortest project summary for a fresh agent. Keep it factual and easy to scan.

## Identity

${ID_S}
${identityInner(p)}
${ID_E}

## Current Direction

_Not set yet._

## How To Approach

- Start from \`session-summary.md\`; search before opening more files.
- Open status, handoff, rules, map, project wiki, or knowledge wiki only when the task needs them.
- After durable work, update the smallest relevant memory set.
- Do not treat generated output folders as source unless the user explicitly asks.

## Next Useful Work

_None yet._

## Important Notes

_None yet._
`;
}

function tplAgentIndex(p) {
  return `# Agent Index

This is the fast entry map for agents. Start here, then open only the docs relevant to the task.

## Read Order

1. Entry file managed block.
2. \`.memoc/session-summary.md\`.
3. Search first, then open only task-relevant files.

## Project Snapshot

${SNAP_S}
${snapshotInner(p)}
${SNAP_E}

## Core Docs

- [Boot](boot.md)
- [Project Brief](00-project-brief.md)
- [memoc Usage](memoc-usage.md)
- [Agent Workflow](01-agent-workflow.md)
- [Current Project State](02-current-project-state.md)
- [Decisions](03-decisions.md)
- [Handoff](04-handoff.md)
- [Done Checklist](05-done-checklist.md)
- [Project Rules](06-project-rules.md)
- [Session Summary](session-summary.md)
- [Activity](activity.md)
- [Actors](actors/README.md)
- [Worklog](worklog/README.md)
- [Wiki Index](wiki/index.md)
- [Project Wiki](wiki/project/README.md)
- [Knowledge Wiki](wiki/knowledge/README.md)
- [Raw Sources](raw/README.md)

## Wiki

- [Wiki Index](wiki/index.md) — hub for project and knowledge wikis.
- [Project Wiki](wiki/project/README.md) — implementation docs for this repo.
- [Knowledge Wiki](wiki/knowledge/README.md) — source-backed concepts and external knowledge.
- [Sources](wiki/knowledge/sources.md) — source provenance and ingest notes.
- [Glossary](wiki/knowledge/glossary.md) — terms and aliases.
- [Open Questions](wiki/knowledge/questions.md) — unresolved knowledge gaps.
- [Wiki Lint](wiki/knowledge/lint.md) — orphan, stale, and contradiction checks.
`;
}

function tplCurrentState(p) {
  return `# Current Project State

Last synced: ${nowISO()}

## Current Status

_See Project Snapshot below. Keep only current human-written status notes here._

## Project Snapshot

${SNAP_S}
${snapshotInner(p)}
${SNAP_E}

## Open Tasks

_None yet._

## Completed Tasks

See \`.memoc/worklog/\` for full shared activity history.

## Commands

_None recorded yet._

## Notes

_None yet._

## Change Log

See \`.memoc/worklog/\` and generated \`.memoc/activity.md\`.
`;
}

function tplSessionSummary() {
  return `# Session Summary
Last: ${nowISO()}
Replace this file instead of appending to it. Keep total size <800B and each section ≤3 bullets.
Completed history belongs in actor worklogs; incomplete/risky resume detail belongs in \`04-handoff.md\`.
Agent-owned — updated by you, not by \`memoc update\`.

## Status
_What is the current state of the project?_

## Changed
_What changed in the last session? (code, config, decisions)_

## Open Tasks
_What still needs to be done?_

## Resume
_Where should the next agent pick up?_
`;
}

// ═══════════════════════════════════════════════════════════════════
// TEMPLATES — static .memoc files (same for every project)
// ═══════════════════════════════════════════════════════════════════

function tplBoot() {
  return `# Agent Boot

On-demand reference only. The entry-file managed block is authoritative.

## Open Only When Needed

| File | When to open |
| --- | --- |
| \`.memoc/session-summary.md\` | Every session start (only required read) |
| \`.memoc/02-current-project-state.md\` | Before changing behavior or checking tasks |
| \`.memoc/04-handoff.md\` | When resuming incomplete work |
| \`.memoc/06-project-rules.md\` | When unsure about preferences or conventions |
| \`.memoc/01-agent-workflow.md\` | When update routing is unclear |
| \`.memoc/05-done-checklist.md\` | Before finishing substantial work |
| \`.memoc/03-decisions.md\` | When a durable decision was made |
| \`.memoc/memoc-usage.md\` | For command details |
| \`.memoc/wiki/project/*.md\` | Before touching a specific subsystem |
| \`.memoc/wiki/knowledge/*.md\` | For source-backed concepts and external knowledge |
| \`llms.txt\` | For full project file map |

## Search First

\`memoc search "<query>"\` — returns file:line matches across memory and agent docs only.
\`memoc grep "<query>"\` — searches project source/text files when memory docs are not enough.
If \`memoc\` is not on PATH, try \`.\\.memoc\\bin\\memoc.cmd search "<query>"\` on Windows or \`.memoc/bin/memoc search "<query>"\` in sh, then \`npx @kevin0181/memoc search "<query>"\`.
Use it before opening any file to avoid reading more than needed.
`;
}

function tplWorkflow() {
  return `# Agent Workflow

Shared protocol for any coding agent.

## Entry Routine

1. Read the entry-file managed block.
2. Read \`.memoc/session-summary.md\` only.
3. Search before opening broad docs.
4. Work from the smallest relevant file set.
5. Update memory only when durable context changed.

## Memory Update Triggers

| Trigger | Update |
| --- | --- |
| User asks "update memoc", "refresh project memory", or similar | Run \`memoc update\` first, then update relevant agent-owned memory files |
| User creates or changes a requirement | \`02-current-project-state.md\`, \`06-project-rules.md\`, \`memoc work "<title>" --from-git\` |
| Code, config, data, or assets changed | \`02-current-project-state.md\`, relevant \`wiki/project/*.md\`, \`memoc work "<title>" --from-git\` |
| Architecture or system behavior changed | relevant \`wiki/project/*.md\`, \`03-decisions.md\` |
| A decision should affect future agents | \`03-decisions.md\`, \`02-current-project-state.md\` |
| Work is substantial enough to resume later | \`04-handoff.md\`, \`02-current-project-state.md\`, \`memoc work "<title>" --from-git\` |
| Durable project implementation knowledge was learned | \`wiki/project/*.md\`, \`wiki/index.md\` |
| Source material should feed the wiki | \`memoc ingest <path-or-url>\`, then synthesize affected \`wiki/knowledge/topics/*.md\` |
| A useful query answer should persist | \`memoc note "<title>"\`, then link related sources/topics |
| Shared repo work should be traceable | \`memoc work "<title>"\`; avoid appending long details to shared core files |
| \`session-summary.md\` exceeds 800B or starts accumulating history | Run \`memoc trim-summary\`; move completed history to worklog, resume details to \`04-handoff.md\` |

## Usually No Update Needed

- Pure Q&A with no durable outcome.
- Tiny typo-only edits.
- Temporary exploration that finds nothing actionable.

## Documentation Shape

- Entry files: protocol only.
- \`session-summary.md\`: replace-only latest snapshot, <800B, max 3 bullets per section; never use as history.
- \`02-current-project-state.md\`: current status, tasks, commands, recent notes.
- \`04-handoff.md\`: resume context, blockers, verified/unverified checks.
- \`03-decisions.md\`: append durable decisions only.
- \`worklog/<actor>/YYYY-MM/*.md\`: actor-scoped append-by-new-file activity records for shared repos.
- \`wiki/project/*.md\`: repo implementation docs.
- \`wiki/knowledge/*.md\`: source-backed concepts, provenance, glossary, questions.
`;
}

function tplDecisions() {
  return `# Decisions

Durable project decisions live here. Keep entries short, dated, and useful to future agents.

## Decision Log

_None yet._
`;
}

function tplHandoff() {
  return `# Agent Handoff

Last synced: ${nowISO()}

## What Changed

_None yet._

## Next Steps

_None yet._

## Blockers

_None yet._

## Do Not Touch Without Asking

_None yet._

## Verified

_None yet._

## Not Verified

_None yet._

## Resume Notes

_None yet._

## Suggested Reads

Search first, then open only files named above.
`;
}

function tplDoneChecklist() {
  return `# Done Checklist

Run through this before saying substantial work is complete.

## Code

- [ ] Changes compile or run without errors.
- [ ] Relevant tests pass (or new tests were added).
- [ ] No obvious security issues introduced.
- [ ] No hardcoded secrets or credentials.

## Memory

- [ ] \`.memoc/02-current-project-state.md\` reflects the new status.
- [ ] \`.memoc/03-decisions.md\` updated if a durable decision was made.
- [ ] \`.memoc/04-handoff.md\` updated if work is incomplete or risky.
- [ ] Meaningful shared work has a \`.memoc/worklog/<actor>/YYYY-MM/*.md\` entry.
- [ ] Relevant \`.memoc/wiki/project/*.md\` or \`.memoc/wiki/knowledge/*.md\` pages updated.

## Communication

- [ ] Final answer states what was verified and what was not.
- [ ] Unverified risks are noted in handoff.
`;
}

function tplProjectRules() {
  return `# Project Rules

Durable user and project preferences live here. Update when the user gives a rule that should persist across sessions.

## Operating Rules

- Keep \`AGENTS.md\` and \`CLAUDE.md\` as short entry files; durable context belongs under \`.memoc/\`.
- Do not track generated output folders such as \`out/\`, \`.next/\`, \`dist/\`, \`build/\` unless the user explicitly asks.
- Update \`.memoc/04-handoff.md\` after substantial work so the next agent can resume quickly.
- Use \`.memoc/05-done-checklist.md\` before saying substantial work is complete.

## Agent Behavior Preferences

- Be factual and operational in memory docs.
- Keep memory notes concise; do not paste temporary command output unless it changes future work.
- Preserve user changes and avoid reverting unrelated work.
- State unverified parts honestly in the final answer and handoff.

## Project-Specific Rules

_None yet._
`;
}

function tplLog() {
  return `# Project Log

Legacy file. New memoc activity belongs in actor worklogs under \`.memoc/worklog/\`.

This file is no longer created for new projects. Existing projects may delete it after migrating useful entries to worklogs.
`;
}

function tplActivity() {
  return `# Activity

Shared activity index for memoc work logs.

## How To Use

- Use \`memoc work "<title>"\` after meaningful work so shared repos get conflict-light per-actor records.
- Keep this file short; detailed work belongs in [worklog](worklog/README.md).
- Actor is detected from \`MEMOC_ACTOR\`, \`.memoc/local/actor\`, git config, git email, or OS user.

## Recent Work

_None yet._

## Related

- [Actors](actors/README.md)
- [Worklog](worklog/README.md)
`;
}

function tplActorsReadme() {
  return `# Actors

People or agents that update memoc in this shared repo.

## Actor Detection

1. \`MEMOC_ACTOR\`
2. \`.memoc/local/actor\` set by \`memoc actor set <name>\`
3. \`git config user.name\`
4. \`git config user.email\`
5. OS username

\`.memoc/local/\` is ignored by git so each machine can keep its own actor setting.

## Actors

_None yet. Use \`memoc actor set <name>\` or \`memoc work "<title>"\`._
`;
}

function tplWorklogReadme() {
  return `# Worklog

Conflict-light per-actor work records.

## Rules

- Prefer creating new worklog files over appending shared core memory files.
- Keep \`session-summary.md\` as the tiny current snapshot.
- Put detailed completed work here; put only team-critical unfinished risk in \`04-handoff.md\`.

## Layout

\`\`\`text
worklog/<actor>/YYYY-MM/YYYYMMDDTHHMM-title.md
\`\`\`

## Recent Work

_None yet._
`;
}

function tplMemocUsage() {
  return `# memoc Usage

This project uses \`memoc\` to maintain agent-readable project memory.

## Commands

\`\`\`bash
# Optional: put the project-local wrapper first in PATH for this shell
# PowerShell: . .\\.memoc\\env.ps1
# sh/bash:    . ./.memoc/env.sh

# First-time setup (or re-run to update managed sections)
memoc init

# Refresh memoc itself when run through npx @latest, preserving project memory
memoc upgrade

# Explicitly update managed sections based on current project state
memoc update
memoc trim-summary

# Shared repo actor/work tracking
memoc actor
memoc actor set neneee
memoc work "Auth refresh fix" --from-git
memoc activity
memoc activity --write
memoc doctor

# Tiny status overview
memoc summary

# Search memory first; add --snippets only when needed
memoc search "<query>" --limit 12
memoc search "<query>" --snippets --limit 5

# Search project source/text files when memory is not enough
memoc grep "<query>" --limit 12
memoc grep "<query>" --snippets --limit 5

# Wiki operations
memoc ingest <path-or-url>
memoc note "Durable topic or query result"
memoc lint-wiki
\`\`\`

If \`memoc\` is not on PATH, use \`.\\.memoc\\bin\\memoc.cmd <command>\` on Windows or \`.memoc/bin/memoc <command>\` in sh for the rest of the session. If the local wrapper is missing, use \`npx @kevin0181/memoc <command>\` or re-run init.

## Agent Read Order

1. Entry-file managed block.
2. \`.memoc/session-summary.md\` only.
3. Search memory first with one or two concrete terms: \`memoc search "<query>" --limit 5\`.
4. Open only the matching memory file(s) that matter.
5. If memory is not enough, search project files: \`memoc grep "<query>" --limit 5\`.
6. Use \`--snippets\` only when file names are not enough.

Use \`memoc search\` for known concepts, changed areas, decisions, tasks, or handoff notes. Skip it for brand-new questions where no prior memory can exist.

Raw files under \`.memoc/raw/\` are intentionally not part of normal memory search. Open them only through a linked source record when provenance is needed.

## Shared Repo Activity

Use \`memoc work "<title>" --from-git\` to create conflict-light activity records under \`.memoc/worklog/<actor>/YYYY-MM/\`. The command prefills actor, branch, timestamp, and changed files from git so agents only need to fill short Summary/Verification notes when useful. Actor is detected in this order: \`MEMOC_ACTOR\`, \`.memoc/local/actor\`, \`git config user.name\`, \`git config user.email\`, OS username. Use \`memoc actor set <name>\` to store a local actor name without committing it.

\`.memoc/activity.md\`, \`.memoc/worklog/README.md\`, and \`.memoc/actors/README.md\` are regenerated indexes. Run \`memoc activity --write\` to rebuild them from worklog/actor files instead of appending to them during every task.

## When To Run Memory Updates

Use \`memoc update\` or \`skills/project-memory-maintainer/SKILL.md\` when:

- The user asks to update memoc, refresh project memory, sync project memory, or "update the project in memoc".
- Requirements, acceptance criteria, user preferences, or project rules changed.
- Source code, config, data, content, or package scripts changed.
- Architecture, data flow, routing, auth, or deployment behavior changed.
- A decision was made that future agents should not revisit blindly.
- Work is partial, multi-step, blocked, or likely to be resumed by another agent.
- New implementation knowledge belongs in \`.memoc/wiki/project/\`.
- Source-backed concept knowledge belongs in \`.memoc/wiki/knowledge/\`.
- Shared work should be traceable without causing conflicts.

Usually skip for pure Q&A, throwaway exploration, or tiny edits with no future impact.

When the user asks for a general memoc/project-memory refresh, run \`memoc update\` first. It refreshes managed sections, reconnects default wiki scaffold links, and applies Obsidian frontmatter tags. Then update only the agent-owned files whose content actually changed, such as \`.memoc/session-summary.md\`, \`.memoc/02-current-project-state.md\`, \`.memoc/04-handoff.md\`, \`.memoc/wiki/index.md\`, project/knowledge wiki pages, or actor worklogs.

\`.memoc/session-summary.md\` is a startup snapshot, not a timeline. Rewrite it in place, do not append old work. If it exceeds 800B, run \`memoc trim-summary\`; it archives the previous summary and rewrites a compact version. Put completed history in actor worklogs, and put unfinished/risky resume detail in \`.memoc/04-handoff.md\`.

## Updating The Wiki

Create wiki pages under the right layer when knowledge should compound across sessions.

- \`.memoc/raw/\`: immutable source material copied or referenced by \`memoc ingest\`.
- \`.memoc/wiki/project/\`: implementation docs for this repo.
- \`.memoc/wiki/knowledge/sources/\`: provenance records.
- \`.memoc/wiki/knowledge/topics/\`: synthesized topic pages.
- \`.memoc/wiki/knowledge/global/\`: broader source-backed principles.

After creating or editing wiki pages:
1. Update \`.memoc/wiki/index.md\`.
2. Run \`memoc lint-wiki\`.
3. If the change is meaningful shared work, run \`memoc work "<title>" --from-git\`.

Useful scaffolds:

\`\`\`bash
memoc ingest path/to/source.md
memoc ingest https://example.com/spec
memoc note "Auth flow comparison"
memoc lint-wiki
\`\`\`

## Updating System Docs

Create or update \`.memoc/wiki/project/*.md\` when a subsystem needs durable implementation detail.

Examples: \`frontend.md\`, \`deployment.md\`, \`data-sources.md\`, \`auth.md\`
`;
}

function tplSystemsReadme() {
  return `# Systems

Legacy location. Project implementation docs now live in [Project Wiki](../wiki/project/README.md).

## Migration

Run \`memoc update\` to move an existing \`.memoc/systems/\` directory into \`.memoc/raw/legacy-systems/\`.
`;
}

function tplRawReadme() {
  return `# Raw Sources

Immutable source material for the memoc wiki.

## Rules

- Do not edit raw files after ingest; create a new raw file or source record when material changes.
- Do not read raw files at session start. Search or open the linked source/topic page first.
- Source records under [knowledge/sources](../wiki/knowledge/sources/README.md) summarize raw material and link to affected topics.

## Subdirectories

- [files](files/README.md) — local files copied during ingest
- [urls](urls/README.md) — URL references and fetched/exported material
- [conversations](conversations/README.md) — conversation excerpts worth preserving
- [docs](docs/README.md) — external docs, specs, and long references
`;
}

function tplRawFilesReadme() {
  return `# Raw Files

Local files copied by \`memoc ingest <path>\`.

## Related

- [Raw Sources](../README.md)
- [Source Records](../../wiki/knowledge/sources/README.md)
`;
}

function tplRawUrlsReadme() {
  return `# Raw URLs

URL references recorded by \`memoc ingest <url>\`.

## Related

- [Raw Sources](../README.md)
- [Source Records](../../wiki/knowledge/sources/README.md)
`;
}

function tplRawConversationsReadme() {
  return `# Raw Conversations

Conversation excerpts that should feed durable wiki synthesis.

## Related

- [Raw Sources](../README.md)
- [Source Records](../../wiki/knowledge/sources/README.md)
`;
}

function tplRawDocsReadme() {
  return `# Raw Docs

Long-form docs, specs, and references kept separate from synthesized topic pages.

## Related

- [Raw Sources](../README.md)
- [Source Records](../../wiki/knowledge/sources/README.md)
`;
}

function tplWikiIndex() {
  return `# Wiki Index

Persistent LLM-maintained wiki hub.

## Wiki Layers

- [Project Wiki](project/README.md) — this repo's implementation docs.
- [Knowledge Wiki](knowledge/README.md) — source-backed concepts, external docs, glossary, questions.
- [Raw Sources](../raw/README.md) — immutable source material before synthesis.

## Project Pages

_None yet. Link implementation pages from [project/README.md](project/README.md)._

## Knowledge Pages

_None yet. Use \`memoc ingest\` or \`memoc note "<title>"\` to create source-backed knowledge pages._

## Related Core Memory

- [Agent Index](../00-agent-index.md)
- [Project Brief](../00-project-brief.md)
- [Current Project State](../02-current-project-state.md)
`;
}

function tplWikiProjectReadme() {
  return `# Project Wiki

Implementation docs for this repository.

## Project Pages

_None yet. Add pages like \`architecture.md\`, \`auth.md\`, \`gateway.md\`, \`deployment.md\`, or \`ui-dashboard.md\`._

## How To Use

- Read project pages before editing the matching subsystem.
- Keep pages implementation-specific: files, flows, invariants, commands, risks.
- Link to [Knowledge Wiki](../knowledge/README.md) when external concepts or sources matter.

## Related

- [Wiki Index](../index.md)
- [Current Project State](../../02-current-project-state.md)
- [Decisions](../../03-decisions.md)
- [Knowledge Wiki](../knowledge/README.md)
`;
}

function tplWikiKnowledgeReadme() {
  return `# Knowledge Wiki

Source-backed concepts, external docs, glossary, questions, and durable research.

## Hubs

- [Sources](sources.md) — provenance, ingests, and source-to-topic links.
- [Topics](topics/README.md) — synthesized topic pages.
- [Global](global/README.md) — broad source-backed principles.
- [Glossary](glossary.md) — terms, aliases, and canonical page names.
- [Open Questions](questions.md) — unresolved questions and research leads.
- [Wiki Lint](lint.md) — graph health, orphan checks, contradictions, stale claims.

## Related

- [Wiki Index](../index.md)
- [Project Wiki](../project/README.md)
- [Raw Sources](../../raw/README.md)
`;
}

function tplWikiSources() {
  return `# Sources

Provenance index for conversations, URLs, docs, issues, and files that feed the wiki.

## Source Records

_No sources recorded yet. Link each source record to the topic/global/project pages it affects._

Use \`memoc ingest <path-or-url>\` to create source records without loading raw material into startup context.

## Related

- [Wiki Index](../index.md)
- [Knowledge Wiki](README.md)
- [Raw Sources](../../raw/README.md)
- [Source Records Directory](sources/README.md)
- [Topics](topics/README.md)
- [Open Questions](questions.md)
`;
}

function tplWikiGlossary() {
  return `# Glossary

Canonical names, aliases, and short definitions for project terms.

## Terms

_No terms defined yet. Link terms to their canonical topic, global, source, or project page._

## Related

- [Knowledge Wiki](README.md)
- [Topics](topics/README.md)
- [Global](global/README.md)
- [Open Questions](questions.md)
`;
}

function tplWikiQuestions() {
  return `# Open Questions

Unresolved questions, data gaps, contradictions, and follow-up research leads.

## Questions

_No open questions yet. Link each question to affected pages and sources._

## Related

- [Knowledge Wiki](README.md)
- [Sources](sources.md)
- [Topics](topics/README.md)
- [Wiki Lint](lint.md)
`;
}

function tplWikiSourcesReadme() {
  return `# Sources

Provenance records for conversations, URLs, docs, and issues.

## How To Link

- Keep source pages short: summary, raw location, affected project/knowledge pages, open synthesis work.
- Link each source record back to [Sources](../sources.md).
- Link outward to every topic, global page, project wiki page, or question that the source changes.
- Prefer one source per file when the source is substantial enough to cite later.

## Related

- [Knowledge Wiki](../README.md)
- [Sources](../sources.md)
- [Topics](../topics/README.md)
- [Open Questions](../questions.md)
`;
}

function tplWikiTopicsReadme() {
  return `# Topics

Synthesized topic pages that compound knowledge across sessions.

## Topic Pages

_None yet. Add pages here when a concept deserves durable synthesis._

## How To Link

- Each topic page should link back to [Knowledge Wiki](../README.md) and this [Topics](README.md) page.
- Link to related topics, source records, glossary terms, and open questions in prose or a \`## Related\` section.
- Avoid orphan pages: every topic needs at least one inbound link from an index, source, or related topic.

## Related

- [Knowledge Wiki](../README.md)
- [Sources](../sources.md)
- [Glossary](../glossary.md)
- [Wiki Lint](../lint.md)
`;
}

function tplWikiGlobalReadme() {
  return `# Global

Project-wide principles, positioning, and long-lived direction.

## Global Pages

_None yet. Add pages here for broad source-backed context that many topic/project pages should reference._

## How To Link

- Link global pages back to [Knowledge Wiki](../README.md), this [Global](README.md) page, and affected topic/project docs.
- Use global pages for durable synthesis, not temporary task notes.

## Related

- [Knowledge Wiki](../README.md)
- [Project Brief](../../../00-project-brief.md)
- [Project Rules](../../../06-project-rules.md)
- [Topics](../topics/README.md)
`;
}
function tplWikiLint()          {
  return `# Wiki Lint

Last checked: ${nowISO()}

## Graph Checks

- Every wiki page is listed from [Wiki Index](../index.md) or a directory README.
- Every wiki page links back to an index, project hub, knowledge hub, source, topic, or related page.
- Important concepts mentioned in two or more places have their own linked page.
- Source records link to the pages they update, and those pages link back to sources when provenance matters.

## Issues

_No issues found._

## Warnings

_None._

## Related

- [Knowledge Wiki](README.md)
- [Sources](sources.md)
- [Topics](topics/README.md)
- [Open Questions](questions.md)
`;
}

function tplSkillMaintainer() {
  return `---
name: project-memory-maintainer
description: Maintain this project's LLM-wiki memory files after durable context changes.
---

# Project Memory Maintainer

Use this local skill after meaningful project work so future agents can continue without rediscovering context.

## Required Reads

1. \`.memoc/session-summary.md\`
2. \`memoc summary\` or \`memoc search "<query>"\`; use \`memoc grep "<query>"\` only when source/text search is needed
3. Open only files you will use or update.

## Maintenance Checklist

- If the user asked to update/refresh memoc project memory, run \`memoc update\` first so managed sections, wiki scaffold links, and Obsidian tags are current.
- Keep \`llms.txt\` and \`.memoc/00-agent-index.md\` as concise maps.
- Keep \`.memoc/00-project-brief.md\` as the shortest project summary.
- Rewrite \`.memoc/session-summary.md\` as the latest snapshot only; never append a timeline. If it is over 800B, run \`memoc trim-summary\`.
- Update \`.memoc/02-current-project-state.md\` with new status, tasks, commands, and change log entries.
- Update \`.memoc/03-decisions.md\` when a durable decision is made.
- Update \`.memoc/04-handoff.md\` before ending substantial work.
- Check \`.memoc/05-done-checklist.md\` before saying substantial work is complete.
- Update \`.memoc/06-project-rules.md\` when the user gives durable preferences.
- Create a short actor worklog with \`memoc work "<title>" --from-git\` for meaningful changes, decisions, and handoffs.
- Create or update \`.memoc/wiki/project/*.md\` when a subsystem needs durable implementation explanation.
- Create or update \`.memoc/wiki/knowledge/*.md\` when source-backed concepts should compound over time.
- Use \`memoc ingest <path-or-url>\` for source material and \`memoc note "<title>"\` for durable query results or analysis.
- Use \`memoc work "<title>" --from-git\` for meaningful shared-repo work so details are saved in actor-scoped worklog files instead of causing shared-file conflicts.
- Keep the wiki graph connected: update \`.memoc/wiki/index.md\`, link project pages under \`.memoc/wiki/project/\`, link knowledge pages under \`.memoc/wiki/knowledge/\`, and include a \`## Related\` section on every new wiki page.
- Run \`memoc lint-wiki\` after wiki/source/topic edits and address broken links before finishing.
- Keep completed history in actor worklogs; keep current-state files short.
- Move completed session details out of \`session-summary.md\` into \`.memoc/worklog/<actor>/YYYY-MM/\`; move incomplete/risky resume details into \`04-handoff.md\`.
- In shared repos, do not use \`log.md\`; prefer new files under \`.memoc/worklog/<actor>/YYYY-MM/\` and regenerate \`.memoc/activity.md\` with \`memoc activity --write\`.
- Keep tool output small; prefer \`summary\`, file-only search, \`--limit\`, and targeted reads.

## Wiki Link Rules

- Use relative Markdown links that Obsidian can follow, for example \`[Project Wiki](project/README.md)\` or \`[Topics](knowledge/topics/README.md)\`.
- Every wiki page must have at least one inbound link from \`wiki/index.md\`, a directory README, a source page, project page, or related topic.
- Every wiki page must link outward to its parent hub plus 1-5 genuinely related pages when they exist.
- Prefer links in normal prose when the connection is meaningful; use \`## Related\` for compact navigation.
- When a concept appears in multiple pages, create or update a topic/glossary page and link all mentions to it.
- After wiki edits, check \`.memoc/wiki/knowledge/lint.md\` and note orphan pages, missing backlinks, contradictions, or stale claims.

## Concrete Triggers

Use this skill before finishing when any of these are true:

- The user gives a durable preference, project rule, changed requirement, or acceptance criterion.
- The agent edits code, config, package scripts, env, data, assets, routes, or deployment files.
- A subsystem's behavior, architecture, data flow, or API contract changes.
- A future agent would need to know why an approach was chosen or rejected.
- The work is partial, blocked, risky, multi-step, or likely to be resumed later.

Usually skip for pure Q&A, tiny edits with no future impact, or throwaway exploration.
`;
}

// ═══════════════════════════════════════════════════════════════════
// CLAUDE CODE HOOK SETTINGS
// ═══════════════════════════════════════════════════════════════════

function claudeStopHookCmd() {
  return `node -e "const fs=require('fs'),{execFileSync}=require('child_process');try{const o=execFileSync('git',['status','--porcelain'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});if(o.trim()){const files=o.trim().split(/\\r?\\n/).map(l=>l.slice(3).trim()).filter(Boolean).slice(0,8).join(', ');fs.writeFileSync('.memoc/.pending',new Date().toISOString()+'\\n'+files)}}catch{}"`;
}

function tplClaudeSettings() {
  return JSON.stringify({
    hooks: {
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: claudeStopHookCmd() }] }],
    },
  }, null, 2) + '\n';
}

function ensureClaudeStopHook(settingsPath) {
  const cmd = claudeStopHookCmd();
  let settings;
  try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); }
  catch { settings = {}; }

  if (!settings.hooks || typeof settings.hooks !== 'object' || Array.isArray(settings.hooks)) settings.hooks = {};
  if (!Array.isArray(settings.hooks.Stop)) settings.hooks.Stop = [];

  let hasCurrent = false;
  let changed = false;
  for (const entry of settings.hooks.Stop) {
    if (!Array.isArray(entry.hooks)) continue;
    const nextHooks = [];
    for (const hook of entry.hooks) {
      if (hook && hook.command === cmd) {
        if (hasCurrent) changed = true;
        else {
          hasCurrent = true;
          nextHooks.push(hook);
        }
      } else if (isMemocClaudeStopHook(hook)) {
        changed = true;
      } else {
        nextHooks.push(hook);
      }
    }
    entry.hooks = nextHooks;
  }
  settings.hooks.Stop = settings.hooks.Stop.filter(entry =>
    !Array.isArray(entry.hooks) || entry.hooks.length > 0
  );
  if (hasCurrent && !changed) return false; // no change needed

  if (!hasCurrent) settings.hooks.Stop.push({ matcher: '', hooks: [{ type: 'command', command: cmd }] });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return true; // merged or migrated
}

function isMemocClaudeStopHook(hook) {
  if (!hook || typeof hook.command !== 'string') return false;
  const command = hook.command;
  return command.includes('.memoc/.pending') &&
    command.includes('git') &&
    command.includes('status') &&
    command.includes('--porcelain');
}

// ═══════════════════════════════════════════════════════════════════
// MANAGED BLOCK UPDATE (CLAUDE.md / AGENTS.md)
// ═══════════════════════════════════════════════════════════════════

function ensureClaudeStopHookFile(dir, mark) {
  const claudeDir = path.join(dir, '.claude');
  const claudeSettings = path.join(claudeDir, 'settings.json');
  fs.mkdirSync(claudeDir, { recursive: true });
  if (!fs.existsSync(claudeSettings)) {
    write(claudeSettings, tplClaudeSettings());
    mark('add', '.claude/settings.json');
    return;
  }
  const merged = ensureClaudeStopHook(claudeSettings);
  mark(merged ? 'update' : 'skip', `.claude/settings.json (Stop hook ${merged ? 'merged' : 'already present'})`);
}

function ensurePendingGitignore(dir, mark) {
  const gitignorePath = path.join(dir, '.gitignore');
  const entries = ['.memoc/.pending', '.memoc/local/'];
  const gitignoreContent = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const lines = gitignoreContent.split(/\r?\n/).map(line => line.trim());
  const missing = entries.filter(entry => !lines.includes(entry));
  if (missing.length) {
    fs.appendFileSync(gitignorePath, (gitignoreContent.endsWith('\n') ? '' : '\n') + missing.join('\n') + '\n', 'utf8');
    mark('update', `.gitignore (${missing.join(', ')} added)`);
  } else {
    mark('skip', '.gitignore (memoc local entries already present)');
  }
}

function printCommandHint() {
  console.log('\n  Agent command fallback:');
  console.log('    memoc summary');
  console.log('    .\\.memoc\\bin\\memoc.cmd summary   # Windows');
  console.log('    .memoc/bin/memoc summary          # macOS/Linux sh');
  console.log('  If PATH fails once, use the project-local wrapper for the rest of the session.');
}

function applyManagedBlock(filePath, tplFn) {
  if (!fs.existsSync(filePath)) {
    write(filePath, tplFn());
    return 'add';
  }
  const src = fs.readFileSync(filePath, 'utf8');
  const range = findMarkedRange(src, MGMT_S, MGMT_E);
  if (!range) {
    // No managed block — inject at end, preserving all user content
    write(filePath, src.trimEnd() + '\n\n' + managedBlock() + '\n');
    return 'inject';
  }
  write(filePath, src.slice(0, range.s) + managedBlock() + src.slice(range.e + range.endMark.length));
  return 'update';
}

// ═══════════════════════════════════════════════════════════════════
// MAIN RUNNER
// ═══════════════════════════════════════════════════════════════════

function run(dir, forceUpdate, action = 'update') {
  const p       = scanProject(dir);
  const memDir  = path.join(dir, '.memoc');
  const isNew   = !fs.existsSync(path.join(memDir, 'boot.md'));
  const mode    = (isNew && !forceUpdate) ? 'init' : 'update';

  const log = [];
  const mark = (label, name) => log.push(`  ${label.padEnd(8)} ${name}`);

  if (mode === 'init') {
    console.log(`\n  memoc init — ${path.basename(dir)}`);
    console.log(p.isEmpty
      ? '  Empty project → using default values.'
      : `  Detected: ${stackStr(p.stack)}`
    );
    console.log();

    // Entry files — inject/update managed block, preserve existing user content
    mark(applyManagedBlock(path.join(dir, 'CLAUDE.md'), tplClaude), 'CLAUDE.md');
    mark(applyManagedBlock(path.join(dir, 'AGENTS.md'), tplAgents), 'AGENTS.md');
    if (ensure(path.join(dir, 'llms.txt'), tplLlmsTxt(p))) mark('add',  'llms.txt');
    else                                                    mark('skip', 'llms.txt');

    // Dynamic memory files
    const dynamicFiles = [
      [path.join(memDir, '00-project-brief.md'),       () => tplProjectBrief(p)],
      [path.join(memDir, '00-agent-index.md'),         () => tplAgentIndex(p)],
      [path.join(memDir, '02-current-project-state.md'), () => tplCurrentState(p)],
      [path.join(memDir, 'session-summary.md'),        tplSessionSummary],
    ];
    for (const [fp, tpl] of dynamicFiles) {
      const rel = path.relative(dir, fp);
      if (ensure(fp, tpl())) mark('add', rel); else mark('skip', rel);
    }

    // Static memory files
    const staticFiles = [
      [path.join(memDir, 'boot.md'),                   tplBoot],
      [path.join(memDir, '01-agent-workflow.md'),      tplWorkflow],
      [path.join(memDir, '03-decisions.md'),           tplDecisions],
      [path.join(memDir, '04-handoff.md'),             tplHandoff],
      [path.join(memDir, '05-done-checklist.md'),      tplDoneChecklist],
      [path.join(memDir, '06-project-rules.md'),       tplProjectRules],
      [path.join(memDir, 'activity.md'),               tplActivity],
      [path.join(memDir, 'actors/README.md'),          tplActorsReadme],
      [path.join(memDir, 'worklog/README.md'),         tplWorklogReadme],
      [path.join(memDir, 'memoc-usage.md'),    tplMemocUsage],
      [path.join(memDir, 'raw/README.md'),             tplRawReadme],
      [path.join(memDir, 'raw/files/README.md'),       tplRawFilesReadme],
      [path.join(memDir, 'raw/urls/README.md'),        tplRawUrlsReadme],
      [path.join(memDir, 'raw/conversations/README.md'), tplRawConversationsReadme],
      [path.join(memDir, 'raw/docs/README.md'),        tplRawDocsReadme],
      [path.join(memDir, 'wiki/index.md'),             tplWikiIndex],
      [path.join(memDir, 'wiki/project/README.md'),    tplWikiProjectReadme],
      [path.join(memDir, 'wiki/knowledge/README.md'),  tplWikiKnowledgeReadme],
      [path.join(memDir, 'wiki/knowledge/sources.md'), tplWikiSources],
      [path.join(memDir, 'wiki/knowledge/glossary.md'), tplWikiGlossary],
      [path.join(memDir, 'wiki/knowledge/questions.md'), tplWikiQuestions],
      [path.join(memDir, 'wiki/knowledge/lint.md'),    tplWikiLint],
      [path.join(memDir, 'wiki/knowledge/sources/README.md'), tplWikiSourcesReadme],
      [path.join(memDir, 'wiki/knowledge/topics/README.md'), tplWikiTopicsReadme],
      [path.join(memDir, 'wiki/knowledge/global/README.md'), tplWikiGlobalReadme],
      [path.join(dir,    'skills/project-memory-maintainer/SKILL.md'), tplSkillMaintainer],
    ];
    for (const [fp, tpl] of staticFiles) {
      const rel = path.relative(dir, fp);
      if (ensure(fp, tpl())) mark('add', rel); else mark('skip', rel);
    }

    // Claude Code Stop hook — writes .memoc/.pending when git detects changes
    ensureClaudeStopHookFile(dir, mark);

    // .gitignore — add .memoc/.pending if not already present
    ensurePendingGitignore(dir, mark);

    // Obsidian graph filters — tag memoc-owned Markdown without touching unrelated docs
    ensureObsidianFrontmatter(dir, mark);

    // PATH helpers — let agents run memoc even when the npm bin is not on PATH
    ensurePathHelpers(dir, mark);
    ensurePathRegistration(dir, mark);

  } else {
    // ── UPDATE MODE
    console.log(`\n  memoc ${action} — ${path.basename(dir)}`);
    console.log(`  Re-scanning project: ${p.isEmpty ? 'nothing detected' : stackStr(p.stack)}`);
    console.log();

    // Entry files — update managed blocks, preserve user content
    mark(applyManagedBlock(path.join(dir, 'CLAUDE.md'),  tplClaude), 'CLAUDE.md');
    mark(applyManagedBlock(path.join(dir, 'AGENTS.md'),  tplAgents), 'AGENTS.md');

    // Third-party agent files — update only if already added
    for (const [, agent] of Object.entries(AGENT_REGISTRY)) {
      const fp = path.join(dir, agent.file);
      if (fs.existsSync(fp)) {
        mark(applyManagedBlock(fp, () => tplAgentEntry(agent.label)), agent.file);
      }
    }

    // llms.txt — update all managed sections
    const llmsPath = path.join(dir, 'llms.txt');
    if (fs.existsSync(llmsPath)) {
      updateSection(llmsPath, HDR_S,  HDR_E,  headerInner(p));
      updateSection(llmsPath, CORE_S, CORE_E, coreLlmsInner());
      updateSection(llmsPath, SYS_S,  SYS_E,  projectWikiLlmsInner(dir));
      updateSection(llmsPath, WIKI_S, WIKI_E, wikiLlmsInner(dir));
      mark('update', 'llms.txt');
    } else {
      write(llmsPath, tplLlmsTxt(p));
      mark('add', 'llms.txt');
    }

    // Generated memory maps — replace so old protocols do not linger.
    const generatedRefresh = [
      [path.join(memDir, '00-project-brief.md'),       () => tplProjectBrief(p)],
      [path.join(memDir, '00-agent-index.md'),         () => tplAgentIndex(p)],
    ];
    for (const [fp, tpl] of generatedRefresh) {
      const rel = path.relative(dir, fp);
      mark(writeChanged(fp, tpl()) ? 'update' : 'skip', rel);
    }

    // Dynamic user-owned memory files — update managed sections only
    const dynUpdates = [
      [path.join(memDir, '02-current-project-state.md'), () => tplCurrentState(p), SNAP_S, SNAP_E, snapshotInner(p)],
    ];
    for (const [fp, tpl, s, e, inner] of dynUpdates) {
      const rel = path.relative(dir, fp);
      if (!fs.existsSync(fp)) {
        write(fp, tpl());
        mark('add', rel);
      } else if (updateSection(fp, s, e, inner)) {
        mark('update', `${rel} (managed section)`);
      } else {
        mark('skip',   rel);
      }
    }

    // session-summary is agent-owned — never overwrite, only add if missing
    const summaryPath = path.join(memDir, 'session-summary.md');
    if (fs.existsSync(summaryPath)) {
      const summarySize = Buffer.byteLength(fs.readFileSync(summaryPath, 'utf8'), 'utf8');
      if (summarySize > 1000) {
        console.log(`  ⚠  session-summary.md is ${summarySize}B (recommended: <800B).`);
      }
      mark('skip', '.memoc/session-summary.md (agent-owned, not modified)');
    } else {
      write(summaryPath, tplSessionSummary());
      mark('add', '.memoc/session-summary.md');
    }

    // Protocol/template files — replace on update so old instructions are removed.
    const templateRefresh = [
      [path.join(memDir, 'boot.md'),                   tplBoot],
      [path.join(memDir, '01-agent-workflow.md'),      tplWorkflow],
      [path.join(memDir, '05-done-checklist.md'),      tplDoneChecklist],
      [path.join(memDir, 'memoc-usage.md'),            tplMemocUsage],
      [path.join(dir,    'skills/project-memory-maintainer/SKILL.md'), tplSkillMaintainer],
    ];
    for (const [fp, tpl] of templateRefresh) {
      const rel = path.relative(dir, fp);
      mark(writeChanged(fp, tpl()) ? 'update' : 'skip', rel);
    }

    migrateKnowledgeWiki(dir, mark);
    archiveLegacySystems(dir, mark);

    // Static indexes/scaffolds — add if missing; content may be user- or command-owned.
    const addIfMissing = [
      [path.join(memDir, '03-decisions.md'),           tplDecisions],
      [path.join(memDir, '04-handoff.md'),             tplHandoff],
      [path.join(memDir, '06-project-rules.md'),       tplProjectRules],
      [path.join(memDir, 'activity.md'),               tplActivity],
      [path.join(memDir, 'actors/README.md'),          tplActorsReadme],
      [path.join(memDir, 'worklog/README.md'),         tplWorklogReadme],
      [path.join(memDir, 'raw/README.md'),             tplRawReadme],
      [path.join(memDir, 'raw/files/README.md'),       tplRawFilesReadme],
      [path.join(memDir, 'raw/urls/README.md'),        tplRawUrlsReadme],
      [path.join(memDir, 'raw/conversations/README.md'), tplRawConversationsReadme],
      [path.join(memDir, 'raw/docs/README.md'),        tplRawDocsReadme],
      [path.join(memDir, 'wiki/index.md'),             tplWikiIndex],
      [path.join(memDir, 'wiki/project/README.md'),    tplWikiProjectReadme],
      [path.join(memDir, 'wiki/knowledge/README.md'),  tplWikiKnowledgeReadme],
      [path.join(memDir, 'wiki/knowledge/sources.md'), tplWikiSources],
      [path.join(memDir, 'wiki/knowledge/glossary.md'), tplWikiGlossary],
      [path.join(memDir, 'wiki/knowledge/questions.md'), tplWikiQuestions],
      [path.join(memDir, 'wiki/knowledge/lint.md'),    tplWikiLint],
      [path.join(memDir, 'wiki/knowledge/sources/README.md'), tplWikiSourcesReadme],
      [path.join(memDir, 'wiki/knowledge/topics/README.md'), tplWikiTopicsReadme],
      [path.join(memDir, 'wiki/knowledge/global/README.md'), tplWikiGlobalReadme],
    ];
    for (const [fp, tpl] of addIfMissing) {
      const rel = path.relative(dir, fp);
      if (ensure(fp, tpl())) mark('add', rel);
      // silently skip existing — user/agent owns them
    }
    ensureWikiScaffoldLinks(memDir, mark);

    const knowledgeLayerFiles = [
      path.join(memDir, 'wiki/knowledge/sources.md'),
      path.join(memDir, 'wiki/knowledge/glossary.md'),
      path.join(memDir, 'wiki/knowledge/questions.md'),
      path.join(memDir, 'wiki/knowledge/lint.md'),
      path.join(memDir, 'wiki/knowledge/global/README.md'),
    ];
    for (const fp of knowledgeLayerFiles) {
      if (migrateKnowledgeLayerLinks(fp)) mark('update', `${path.relative(dir, fp)} (wiki links)`);
    }

    const rawLinkFiles = [
      path.join(memDir, 'raw/README.md'),
      path.join(memDir, 'raw/files/README.md'),
      path.join(memDir, 'raw/urls/README.md'),
      path.join(memDir, 'raw/conversations/README.md'),
      path.join(memDir, 'raw/docs/README.md'),
    ];
    for (const fp of rawLinkFiles) {
      if (migrateRawKnowledgeLinks(fp)) mark('update', `${path.relative(dir, fp)} (raw links)`);
    }

    const legacyReferenceFiles = [
      path.join(memDir, '02-current-project-state.md'),
      path.join(memDir, '04-handoff.md'),
      path.join(memDir, '06-project-rules.md'),
      path.join(memDir, 'wiki/index.md'),
      path.join(memDir, 'wiki/knowledge/sources.md'),
      path.join(memDir, 'wiki/glossary.md'),
      path.join(memDir, 'wiki/questions.md'),
      path.join(memDir, 'wiki/lint.md'),
    ];
    for (const fp of legacyReferenceFiles) {
      if (migrateLegacyLogReferences(fp)) mark('update', `${path.relative(dir, fp)} (legacy refs)`);
    }

    // PATH helpers — let agents run memoc even when the npm bin is not on PATH
    ensureClaudeStopHookFile(dir, mark);
    ensurePendingGitignore(dir, mark);
    ensurePathHelpers(dir, mark);
    ensurePathRegistration(dir, mark);

    archiveLegacyLog(dir, mark);

    const trim = trimSummaryFile(dir);
    if (trim.action === 'trim') {
      mark('update', `.memoc/session-summary.md (trimmed ${trim.beforeBytes}B -> ${trim.afterBytes}B)`);
      mark('update', '.memoc/session-summary-archive.md');
    } else if (trim.action === 'add') {
      mark('add', '.memoc/session-summary.md');
    } else {
      mark('skip', `.memoc/session-summary.md (compact ${trim.beforeBytes || 0}B)`);
    }

    // Obsidian graph filters — add/merge memoc tags for existing installs too
    ensureObsidianFrontmatter(dir, mark);
  }

  hideOnWindows(memDir);
  console.log(log.join('\n'));
  printCommandHint();
  console.log('\n  Done.');
}

// ═══════════════════════════════════════════════════════════════════
// ADD — add entry file for a specific agent
// ═══════════════════════════════════════════════════════════════════

function runAdd(dir) {
  const agentKey = (process.argv[3] || '').toLowerCase();

  if (!agentKey) {
    console.log('\n  Available agents:\n');
    for (const [key, agent] of Object.entries(AGENT_REGISTRY)) {
      const exists = fs.existsSync(path.join(dir, agent.file)) ? ' (already added)' : '';
      console.log(`  ${key.padEnd(10)} → ${agent.file}${exists}`);
    }
    console.log('\n  Usage: memoc add <agent>');
    return;
  }

  const agent = AGENT_REGISTRY[agentKey];
  if (!agent) {
    console.error(`\n  Unknown agent: "${agentKey}"`);
    console.error(`  Available: ${Object.keys(AGENT_REGISTRY).join(', ')}`);
    process.exit(1);
  }

  const filePath = path.join(dir, agent.file);
  const result = applyManagedBlock(filePath, () => tplAgentEntry(agent.label));
  console.log(`\n  ${result.padEnd(8)} ${agent.file}  (${agent.label})`);
  console.log('\n  Done.');
}

// ═══════════════════════════════════════════════════════════════════
// ACTOR / WORKLOG — conflict-light shared repo activity tracking
// ═══════════════════════════════════════════════════════════════════

function runActor(dir) {
  const sub = (process.argv[3] || '').toLowerCase();
  if (sub === 'set') {
    const name = process.argv.slice(4).join(' ').trim();
    if (!name) {
      console.error('\n  Usage: memoc actor set <name>');
      process.exit(1);
    }
    const actor = sanitizeActor(name);
    write(actorFile(dir), `${actor}\n`);
    ensurePendingGitignore(dir, () => {});
    console.log('\n  memoc actor\n');
    console.log(`    Set local actor: ${actor}`);
    console.log('    Stored in .memoc/local/actor (ignored by git).');
    console.log();
    return;
  }

  const detected = detectActor(dir);
  console.log('\n  memoc actor\n');
  console.log(`    Actor   ${detected.actor}`);
  console.log(`    Source  ${detected.source}`);
  console.log('\n  Use `memoc actor set <name>` to override locally.\n');
}

function runWork(dir) {
  const rawArgs = process.argv.slice(3);
  const opts = { status: 'done', body: '', fromGit: true };
  const titleParts = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--status') {
      opts.status = sanitizeActor(rawArgs[++i] || 'done');
      continue;
    }
    if (arg.startsWith('--status=')) {
      opts.status = sanitizeActor(arg.slice('--status='.length) || 'done');
      continue;
    }
    if (arg === '--body') {
      opts.body = rawArgs.slice(i + 1).join(' ');
      break;
    }
    if (arg === '--from-git') {
      opts.fromGit = true;
      continue;
    }
    if (arg === '--no-git') {
      opts.fromGit = false;
      continue;
    }
    titleParts.push(arg);
  }

  const title = titleParts.join(' ').trim();
  if (!title) {
    console.error('\n  Usage: memoc work "<title>" [--status done|wip|blocked] [--from-git|--no-git] [--body "summary"]');
    process.exit(1);
  }

  ensureMemocBase(dir);
  const detected = detectActor(dir);
  ensureActorProfile(dir, detected);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', 'T');
  const month = todayISO().slice(0, 7);
  const fileName = `${stamp}-${slugify(title, 'work')}.md`;
  const workPath = uniquePath(path.join(dir, '.memoc', 'worklog', detected.actor, month, fileName));
  write(workPath, worklogRecord(dir, title, detected, opts));
  ensureMemocFrontmatter(workPath, dir);

  console.log('\n  memoc work\n');
  console.log(`    Actor   ${detected.actor} (${detected.source})`);
  console.log(`    Work    ${normRel(dir, workPath)}`);
  console.log('    Next    Fill only Summary/Verification if needed; run `memoc activity --write` to regenerate indexes.');
  console.log();
}

function runActivity(dir) {
  const writeIndex = process.argv.slice(3).includes('--write');
  const workRoot = path.join(dir, '.memoc', 'worklog');
  const files = listMarkdownFiles(workRoot)
    .filter(fp => path.basename(fp) !== 'README.md')
    .sort()
    .reverse();
  const recent = files.slice(0, 20);

  if (writeIndex) {
    writeActivityIndexes(dir, recent);
    ensureObsidianFrontmatter(dir, () => {});
  }

  console.log('\n  memoc activity\n');
  if (!recent.length) {
    console.log('    No worklog entries yet. Use `memoc work "<title>"`.');
    console.log();
    return;
  }
  for (const fp of recent) {
    const src = safeRead(fp);
    const title = markdownTitle(src, path.basename(fp, '.md'));
    const actor = (src.match(/^actor:\s*(.+)$/m) || [])[1] || 'unknown';
    const status = (src.match(/^status:\s*(.+)$/m) || [])[1] || 'unknown';
    console.log(`    - ${normRel(dir, fp)}  ${actor}  ${status}  ${title}`);
  }
  if (writeIndex) console.log('\n    Wrote .memoc/activity.md and .memoc/worklog/README.md');
  console.log();
}

function ensureActorProfile(dir, detected) {
  const actorPath = path.join(dir, '.memoc', 'actors', `${detected.actor}.md`);
  if (fs.existsSync(actorPath)) return;
  write(actorPath, actorProfile(detected));
  ensureMemocFrontmatter(actorPath, dir);
}

function actorProfile(detected) {
  return `# ${detected.actor}

## Identity

- Actor: ${detected.actor}
- First detected from: ${detected.source}
- First seen: ${nowISO()}

## Notes

_Add stable collaboration preferences or ownership notes only when useful._

## Related

- [Actors](README.md)
- [Activity](../activity.md)
- [Worklog](../worklog/README.md)
`;
}

function worklogRecord(dir, title, detected, opts) {
  const branch = gitBranch(dir);
  const changedFiles = opts.fromGit ? gitStatusFiles(dir) : [];
  return `# ${title}

actor: ${detected.actor}
actor_source: ${detected.source}
branch: ${branch}
status: ${opts.status}
created: ${nowISO()}

## Summary

${opts.body ? `- ${opts.body}` : '_1-3 bullets only. Keep this as a short receipt, not a report._'}

## Changed Files

${changedFiles.length ? changedFiles.map(file => `- \`${file}\``).join('\n') : '_None detected. Use `memoc work "<title>" --from-git` after editing files to prefill this section._'}

## Verification

_Commands run or checks not run. Keep to 1-3 bullets._

## Follow-up

_None._

## Related

- [Activity](../../../activity.md)
- [Worklog](../../README.md)
- [Actor](../../../actors/${detected.actor}.md)
`;
}

function writeActivityIndexes(dir, recentFiles) {
  const activityPath = path.join(dir, '.memoc', 'activity.md');
  const worklogReadme = path.join(dir, '.memoc', 'worklog', 'README.md');
  const actorsReadme = path.join(dir, '.memoc', 'actors', 'README.md');
  const rows = recentFiles.map(fp => {
    const src = safeRead(fp);
    const title = markdownTitle(src, path.basename(fp, '.md'));
    const actor = (src.match(/^actor:\s*(.+)$/m) || [])[1] || 'unknown';
    const status = (src.match(/^status:\s*(.+)$/m) || [])[1] || 'unknown';
    return { fp, title, actor, status };
  });
  const activityItems = rows.length
    ? rows.map(row => `- [${row.title}](${pathRelativeMarkdown(path.join(dir, '.memoc'), row.fp).replace(/^\.\//, '')}) — ${row.actor} ${row.status}.`).join('\n')
    : '_None yet._';
  write(activityPath, `# Activity

Generated shared activity index for memoc work logs.

Last generated: ${nowISO()}

## Recent Work

${activityItems}

## Related

- [Actors](actors/README.md)
- [Worklog](worklog/README.md)
`);

  const worklogItems = rows.length
    ? rows.map(row => `- [${row.title}](${pathRelativeMarkdown(path.join(dir, '.memoc', 'worklog'), row.fp).replace(/^\.\//, '')}) — ${row.actor} ${row.status}.`).join('\n')
    : '_None yet._';
  write(worklogReadme, `# Worklog

Generated index of conflict-light per-actor work records.

Last generated: ${nowISO()}

## Layout

\`\`\`text
worklog/<actor>/YYYY-MM/YYYYMMDDTHHMM-title.md
\`\`\`

## Rules

- Prefer creating new worklog files over appending shared core memory files.
- Keep worklog entries short: 1-3 summary bullets, key files, verification.

## Recent Work

${worklogItems}
`);

  const actorFiles = listMarkdownFiles(path.join(dir, '.memoc', 'actors'))
    .filter(fp => path.basename(fp) !== 'README.md')
    .sort();
  const actorItems = actorFiles.length
    ? actorFiles.map(fp => `- [${markdownTitle(safeRead(fp), path.basename(fp, '.md'))}](${path.basename(fp)})`).join('\n')
    : '_None yet. Use `memoc actor set <name>` or `memoc work "<title>"`._';
  write(actorsReadme, `# Actors

Generated actor index for this shared repo.

## Actor Detection

1. \`MEMOC_ACTOR\`
2. \`.memoc/local/actor\` set by \`memoc actor set <name>\`
3. \`git config user.name\`
4. \`git config user.email\`
5. OS username

\`.memoc/local/\` is ignored by git so each machine can keep its own actor setting.

## Actors

${actorItems}
`);
}

// ═══════════════════════════════════════════════════════════════════
// WIKI OPERATIONS — lint, ingest, and durable topic notes
// ═══════════════════════════════════════════════════════════════════

function runWikiLint(dir) {
  ensureObsidianFrontmatter(dir, () => {});
  const wikiDir = path.join(dir, '.memoc', 'wiki');
  const files = listMarkdownFiles(wikiDir);
  const issues = [];
  const warnings = [];
  const inbound = new Map(files.map(fp => [normRel(dir, fp), 0]));

  for (const fp of files) {
    const rel = normRel(dir, fp);
    const src = safeRead(fp);
    if (!parseYamlFrontmatter(src)) warnings.push(`${rel}: missing YAML frontmatter`);
    if (!src.includes('memoc/wiki')) warnings.push(`${rel}: missing memoc/wiki tag`);
    if (!/^## Related\b/m.test(src) && !rel.endsWith('wiki/index.md')) warnings.push(`${rel}: missing ## Related section`);

    for (const link of markdownLinks(src)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('#')) continue;
      const target = resolveMarkdownLink(fp, link);
      if (!target) continue;
      if (!fs.existsSync(target)) {
        issues.push(`${rel}: broken link ${link}`);
        continue;
      }
      const targetRel = normRel(dir, target);
      if (inbound.has(targetRel)) inbound.set(targetRel, inbound.get(targetRel) + 1);
    }
  }

  for (const [rel, count] of inbound.entries()) {
    if (rel.endsWith('wiki/index.md')) continue;
    if (count === 0) warnings.push(`${rel}: no inbound wiki links`);
  }

  const lintPath = path.join(wikiDir, 'knowledge', 'lint.md');
  write(lintPath, wikiLintReport(issues, warnings));
  ensureMemocFrontmatter(lintPath, dir);

  console.log('\n  memoc lint-wiki\n');
  console.log(`    Files     ${files.length}`);
  console.log(`    Issues    ${issues.length}`);
  console.log(`    Warnings  ${warnings.length}`);
  console.log('    Report    .memoc/wiki/knowledge/lint.md');
  if (issues.length) {
    console.log('\n  Issues:');
    for (const issue of issues.slice(0, 10)) console.log(`    - ${issue}`);
  }
  if (!issues.length && !warnings.length) console.log('\n  No issues found.');
  console.log();
}

function wikiLintReport(issues, warnings) {
  return `# Wiki Lint

Last checked: ${nowISO()}

## Graph Checks

- Every wiki page is listed from [Wiki Index](../index.md) or a directory README.
- Every wiki page links back to an index, project hub, knowledge hub, source, topic, or related page.
- Important concepts mentioned in two or more places have their own linked page.
- Source records link to the pages they update, and those pages link back to sources when provenance matters.

## Issues

${issues.length ? issues.map(x => `- ${x}`).join('\n') : '_No issues found._'}

## Warnings

${warnings.length ? warnings.map(x => `- ${x}`).join('\n') : '_None._'}

## Related

- [Wiki Index](../index.md)
- [Sources](sources.md)
- [Topics](topics/README.md)
- [Open Questions](questions.md)
`;
}

function runIngest(dir) {
  const target = process.argv[3];
  if (!target) {
    console.error('\n  Usage: memoc ingest <path-or-url>');
    process.exit(1);
  }

  ensureMemocBase(dir);
  const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(target);
  const title = ingestTitle(dir, target, isUrl);
  const slug = `${todayISO()}-${slugify(title, 'source')}`;
  let rawRef;
  let rawDisplay;

  if (isUrl) {
    const rawPath = uniquePath(path.join(dir, '.memoc', 'raw', 'urls', `${slug}.md`));
    write(rawPath, rawUrlRecord(title, target));
    ensureMemocFrontmatter(rawPath, dir);
    rawRef = pathRelativeMarkdown(path.join(dir, '.memoc', 'wiki', 'knowledge', 'sources'), rawPath);
    rawDisplay = normRel(dir, rawPath);
  } else {
    const abs = path.resolve(dir, target);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      console.error(`\n  Source file not found: ${target}`);
      process.exit(1);
    }
    const ext = path.extname(abs) || '.txt';
    const rawPath = uniquePath(path.join(dir, '.memoc', 'raw', 'files', `${slug}${ext}`));
    fs.mkdirSync(path.dirname(rawPath), { recursive: true });
    fs.copyFileSync(abs, rawPath);
    rawRef = pathRelativeMarkdown(path.join(dir, '.memoc', 'wiki', 'knowledge', 'sources'), rawPath);
    rawDisplay = normRel(dir, rawPath);
  }

  const sourcePath = uniquePath(path.join(dir, '.memoc', 'wiki', 'knowledge', 'sources', `${slug}.md`));
  write(sourcePath, sourceRecord(title, rawRef, target, isUrl));
  ensureMemocFrontmatter(sourcePath, dir);
  addWikiListItem(path.join(dir, '.memoc', 'wiki', 'knowledge', 'sources.md'), 'Source Records', pathRelativeMarkdown(path.join(dir, '.memoc', 'wiki', 'knowledge'), sourcePath), title, 'needs synthesis');
  addWikiListItem(path.join(dir, '.memoc', 'wiki', 'knowledge', 'sources', 'README.md'), 'Source Records', path.basename(sourcePath), title, 'source record');
  addWikiListItem(path.join(dir, '.memoc', 'wiki', 'index.md'), 'Knowledge Pages', pathRelativeMarkdown(path.join(dir, '.memoc', 'wiki'), sourcePath), title, 'source record');
  console.log('\n  memoc ingest\n');
  console.log(`    Source record  ${normRel(dir, sourcePath)}`);
  console.log(`    Raw reference  ${rawDisplay}`);
  console.log('    Next           Synthesize affected topics, then run memoc lint-wiki.');
  console.log();
}

function runNote(dir) {
  const rawArgs = process.argv.slice(3);
  const bodyIndex = rawArgs.indexOf('--body');
  let body = '';
  let titleArgs = rawArgs;
  if (bodyIndex !== -1) {
    titleArgs = rawArgs.slice(0, bodyIndex);
    body = rawArgs.slice(bodyIndex + 1).join(' ');
  }
  const title = titleArgs.join(' ').trim();
  if (!title) {
    console.error('\n  Usage: memoc note "<topic title>" [--body "short note"]');
    process.exit(1);
  }

  ensureMemocBase(dir);
  const topicPath = uniquePath(path.join(dir, '.memoc', 'wiki', 'knowledge', 'topics', `${slugify(title, 'topic')}.md`));
  write(topicPath, topicNote(title, body));
  ensureMemocFrontmatter(topicPath, dir);
  addWikiListItem(path.join(dir, '.memoc', 'wiki', 'knowledge', 'topics', 'README.md'), 'Topic Pages', path.basename(topicPath), title, 'topic note');
  addWikiListItem(path.join(dir, '.memoc', 'wiki', 'index.md'), 'Knowledge Pages', pathRelativeMarkdown(path.join(dir, '.memoc', 'wiki'), topicPath), title, 'saved query/topic note');
  console.log('\n  memoc note\n');
  console.log(`    Topic  ${normRel(dir, topicPath)}`);
  console.log('    Next   Link related sources/topics, then run memoc lint-wiki.');
  console.log();
}

function ensureMemocBase(dir) {
  const p = scanProject(dir);
  const memDir = path.join(dir, '.memoc');
  const files = [
    [path.join(memDir, 'wiki/index.md'), tplWikiIndex],
    [path.join(memDir, 'wiki/project/README.md'), tplWikiProjectReadme],
    [path.join(memDir, 'wiki/knowledge/README.md'), tplWikiKnowledgeReadme],
    [path.join(memDir, 'wiki/knowledge/sources.md'), tplWikiSources],
    [path.join(memDir, 'wiki/knowledge/sources/README.md'), tplWikiSourcesReadme],
    [path.join(memDir, 'wiki/knowledge/topics/README.md'), tplWikiTopicsReadme],
    [path.join(memDir, 'wiki/knowledge/global/README.md'), tplWikiGlobalReadme],
    [path.join(memDir, 'wiki/knowledge/glossary.md'), tplWikiGlossary],
    [path.join(memDir, 'wiki/knowledge/questions.md'), tplWikiQuestions],
    [path.join(memDir, 'wiki/knowledge/lint.md'), tplWikiLint],
    [path.join(memDir, 'raw/README.md'), tplRawReadme],
    [path.join(memDir, 'raw/files/README.md'), tplRawFilesReadme],
    [path.join(memDir, 'raw/urls/README.md'), tplRawUrlsReadme],
    [path.join(memDir, 'activity.md'), tplActivity],
    [path.join(memDir, 'actors/README.md'), tplActorsReadme],
    [path.join(memDir, 'worklog/README.md'), tplWorklogReadme],
    [path.join(memDir, '00-agent-index.md'), () => tplAgentIndex(p)],
  ];
  for (const [fp, tpl] of files) ensure(fp, tpl());
  ensureObsidianFrontmatter(dir, () => {});
}

function ingestTitle(dir, target, isUrl) {
  if (isUrl) {
    try {
      const u = new URL(target);
      return path.basename(u.pathname) || u.hostname;
    } catch {
      return target;
    }
  }
  try {
    const src = fs.readFileSync(path.resolve(dir, target), 'utf8');
    return markdownTitle(src, path.basename(target, path.extname(target)));
  } catch {
    return path.basename(target, path.extname(target));
  }
}

function rawUrlRecord(title, url) {
  return `# ${title}

Original URL: ${url}

This raw URL record stores provenance only. Summarize it in a source record before using it as durable project knowledge.
`;
}

function sourceRecord(title, rawRef, original, isUrl) {
  return `# ${title}

## Source

- Raw: [${isUrl ? 'URL record' : 'raw file'}](${rawRef})
- Original: ${original}
- Ingested: ${nowISO()}

## Summary

_Summarize only the durable facts future agents should reuse._

## Affects

- [Sources](../sources.md)
- [Topics](../topics/README.md)
- [Open Questions](../questions.md)

## Synthesis Tasks

- [ ] Create or update affected topic/global/project pages.
- [ ] Link those pages back to this source when provenance matters.
- [ ] Run \`memoc lint-wiki\`.

## Related

- [Sources Index](../sources.md)
- [Source Records](README.md)
- [Knowledge Wiki](../README.md)
`;
}

function topicNote(title, body) {
  return `# ${title}

## Summary

${body ? `- ${body}` : '_Capture the durable answer, analysis, or query result here._'}

## Evidence

- [Sources](../sources.md)

## Open Questions

_None yet._

## Related

- [Knowledge Wiki](../README.md)
- [Topics](README.md)
- [Glossary](../glossary.md)
`;
}

function listMarkdownFiles(root) {
  const files = [];
  function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d)) {
      const fp = path.join(d, entry);
      try {
        const st = fs.statSync(fp);
        if (st.isDirectory()) walk(fp);
        else if (entry.endsWith('.md')) files.push(fp);
      } catch {}
    }
  }
  walk(root);
  return files.sort();
}

function safeRead(fp) {
  try { return fs.readFileSync(fp, 'utf8'); } catch { return ''; }
}

function normRel(dir, fp) {
  return path.relative(dir, fp).replace(/\\/g, '/');
}

function pathRelativeMarkdown(fromDir, toFile) {
  let rel = path.relative(fromDir, toFile).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function markdownLinks(src) {
  const links = [];
  const re = /!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(src))) links.push(m[1]);
  return links;
}

function resolveMarkdownLink(fromFile, link) {
  const clean = decodeURIComponent(String(link).split('#')[0]);
  if (!clean) return null;
  const base = path.resolve(path.dirname(fromFile), clean);
  if (path.extname(base)) return base;
  if (fs.existsSync(`${base}.md`)) return `${base}.md`;
  return base;
}

function addWikiListItem(filePath, heading, link, title, note) {
  const src = safeRead(filePath);
  if (!src) return;
  if (src.includes(`](${link})`) || src.includes(`](${link.replace(/^\.\//, '')})`)) return;
  const item = `- [${title}](${link.replace(/^\.\//, '')}) — ${note}.`;
  const re = new RegExp(`(## ${escapeRegExp(heading)}\\n)([\\s\\S]*?)(?=\\n## |$)`, 'm');
  const m = src.match(re);
  if (!m) {
    write(filePath, `${src.trimEnd()}\n\n## ${heading}\n\n${item}\n`);
    return;
  }
  const replacementBody = m[2].includes('_None yet') || m[2].includes('_No sources recorded yet')
    ? `\n${item}\n`
    : `${m[2].trimEnd()}\n${item}\n`;
  write(filePath, src.replace(re, `$1${replacementBody}`));
}

// ═══════════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════════

function runSearch(dir, scope = 'memory') {
  const rawArgs = process.argv.slice(3);
  const opts = { mode: 'files', limit: 12, all: false };
  const queryParts = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '--snippets') { opts.mode = 'snippets'; continue; }
    if (arg === '--files')    { opts.mode = 'files';    continue; }
    if (arg === '--all')      { opts.all = true;        continue; }
    if (arg === '--limit') {
      const n = Number(rawArgs[++i]);
      if (Number.isFinite(n) && n > 0) opts.limit = Math.floor(n);
      continue;
    }
    if (arg.startsWith('--limit=')) {
      const n = Number(arg.slice('--limit='.length));
      if (Number.isFinite(n) && n > 0) opts.limit = Math.floor(n);
      continue;
    }
    queryParts.push(arg);
  }

  const query = queryParts.join(' ').toLowerCase();

  const searchRoots = scope === 'project' ? [dir] : memorySearchRoots(dir);

  if (!query) {
    // No query — list searchable files sorted by recency
    const allFiles = [];
    function collectFile(fp) {
      if (!fs.existsSync(fp)) return;
      const rel = path.relative(dir, fp);
      let mtime = 0;
      try { mtime = fs.statSync(fp).mtimeMs; } catch {}
      allFiles.push({ file: rel, mtime });
    }
    function collectDir(d) {
      if (!fs.existsSync(d)) return;
      for (const entry of fs.readdirSync(d)) {
        const fp = path.join(d, entry);
        try {
          const st = fs.statSync(fp);
          if (st.isDirectory()) {
            if (!shouldSkipSearchDir(entry, scope)) collectDir(fp);
          } else if (isSearchableFile(fp, entry, st, scope)) collectFile(fp);
        } catch {}
      }
    }
    for (const root of searchRoots) {
      try {
        if (fs.statSync(root).isDirectory()) collectDir(root);
        else collectFile(root);
      } catch {}
    }
    allFiles.sort((a, b) => b.mtime - a.mtime || a.file.localeCompare(b.file));
    const limited = opts.all ? allFiles : allFiles.slice(0, opts.limit);
    console.log(limited.map(r => r.file).join('\n'));
    if (!opts.all && allFiles.length > limited.length) {
      console.log(`... ${allFiles.length - limited.length} more files. Use --all to show all.`);
    }
    return;
  }

  const matchesByFile = new Map(); // rel -> { matches: [], mtime: number }

  function searchFile(fp) {
    if (!fs.existsSync(fp)) return;
    const rel = path.relative(dir, fp);
    let mtime = 0;
    try {
      const st = fs.statSync(fp);
      if (!isSearchableFile(fp, path.basename(fp), st, scope)) return;
      mtime = st.mtimeMs;
    } catch {}
    const lines = fs.readFileSync(fp, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(query)) {
        if (!matchesByFile.has(rel)) matchesByFile.set(rel, { matches: [], mtime });
        matchesByFile.get(rel).matches.push({ line: i + 1, text: line.trim() });
      }
    });
  }

  function walkDir(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d)) {
      const fp = path.join(d, entry);
      try {
        const st = fs.statSync(fp);
        if (st.isDirectory()) {
          if (!shouldSkipSearchDir(entry, scope)) walkDir(fp);
        } else if (isSearchableFile(fp, entry, st, scope)) searchFile(fp);
      } catch {}
    }
  }

  for (const root of searchRoots) {
    try {
      if (fs.statSync(root).isDirectory()) walkDir(root);
      else searchFile(root);
    } catch {}
  }

  if (!matchesByFile.size) {
    console.log('No matches found.');
  } else if (opts.mode === 'files') {
    const rows = [...matchesByFile.entries()]
      .map(([file, { matches, mtime }]) => ({ file, count: matches.length, mtime }))
      .sort((a, b) =>
        searchPriority(a.file, scope) - searchPriority(b.file, scope) ||
        b.count - a.count ||
        b.mtime - a.mtime ||
        a.file.localeCompare(b.file)
      );
    const limited = opts.all ? rows : rows.slice(0, opts.limit);
    console.log(limited.map(r => `${r.file}  ${r.count} match${r.count === 1 ? '' : 'es'}`).join('\n'));
    if (!opts.all && rows.length > limited.length) {
      console.log(`... ${rows.length - limited.length} more files. Use --all to show all, or --snippets for line matches.`);
    }
  } else {
    const snippets = [];
    for (const [file, { matches }] of matchesByFile.entries()) {
      for (const m of matches) snippets.push({ file, line: m.line, text: m.text });
    }
    snippets.sort((a, b) =>
      searchPriority(a.file, scope) - searchPriority(b.file, scope) ||
      a.file.localeCompare(b.file) ||
      a.line - b.line
    );
    const limited = opts.all ? snippets : snippets.slice(0, opts.limit);
    console.log(limited.map(m => `${m.file}:${m.line}  ${m.text}`).join('\n'));
    if (!opts.all && snippets.length > limited.length) {
      console.log(`... ${snippets.length - limited.length} more matches. Use --all to show all, or --limit N.`);
    }
  }
}

function memorySearchRoots(dir) {
  return [
    path.join(dir, '.memoc'),
    path.join(dir, 'skills'),
    path.join(dir, 'llms.txt'),
    path.join(dir, 'AGENTS.md'),
    path.join(dir, 'CLAUDE.md'),
    ...Object.values(AGENT_REGISTRY).map(agent => path.join(dir, agent.file)),
  ];
}

function shouldSkipSearchDir(name, scope = 'memory') {
  const skipped = new Set([
    '.git', 'node_modules', '.next', 'dist', 'build', 'out', 'coverage',
    'Saved', 'Intermediate', 'DerivedDataCache', 'Binaries',
    '.venv', 'venv', '__pycache__', '.pytest_cache',
  ]);
  if (scope === 'project') {
    skipped.add('.memoc');
    skipped.add('skills');
    skipped.add('.claude');
  } else {
    skipped.add('raw');
  }
  return skipped.has(name);
}

function isSearchableFile(fp, name, st, scope = 'memory') {
  if (!st || !st.isFile()) return false;
  if (st.size > 1024 * 1024) return false;
  if (scope === 'project' && isAgentMemoryFile(name)) return false;
  if (name === 'llms.txt' || name.endsWith('rules')) return true;
  const ext = path.extname(fp).toLowerCase();
  if (scope === 'memory') {
    return new Set(['.md', '.txt']).has(ext);
  }
  return new Set([
    '.md', '.txt', '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.env',
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
    '.py', '.rs', '.go', '.java', '.cs', '.cpp', '.cc', '.cxx', '.c', '.h', '.hpp', '.hxx',
    '.html', '.css', '.scss', '.sass', '.vue', '.svelte',
    '.sql', '.graphql', '.gql', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
    '.xml', '.gradle', '.kts', '.cmake',
  ]).has(ext);
}

function isAgentMemoryFile(name) {
  return new Set([
    'AGENTS.md',
    'CLAUDE.md',
    'GEMINI.md',
    'llms.txt',
    '.cursorrules',
    '.windsurfrules',
    'copilot-instructions.md',
  ]).has(name);
}

function searchPriority(file, scope = 'memory') {
  if (scope !== 'memory') return 0;
  const normalized = file.replace(/\\/g, '/');
  const order = [
    '.memoc/session-summary.md',
    '.memoc/02-current-project-state.md',
    '.memoc/04-handoff.md',
    '.memoc/06-project-rules.md',
    '.memoc/03-decisions.md',
    '.memoc/activity.md',
    'AGENTS.md',
    'CLAUDE.md',
    'llms.txt',
    '.memoc/00-project-brief.md',
    '.memoc/00-agent-index.md',
  ];
  const exact = order.indexOf(normalized);
  if (exact !== -1) return exact;
  if (normalized.startsWith('.memoc/wiki/project/')) return 20;
  if (normalized.startsWith('.memoc/wiki/knowledge/')) return 30;
  if (normalized.startsWith('.memoc/wiki/')) return 35;
  if (normalized.startsWith('skills/')) return 40;
  return 50;
}

// ═══════════════════════════════════════════════════════════════════
// TOKENS — estimate token cost of current memory state
// ═══════════════════════════════════════════════════════════════════

function runTokens(dir) {
  const stats = memoryTokenStats(dir);

  console.log('\n  memoc tokens\n');
  let startupTotal = 0;
  console.log('  Startup (always loaded):');
  for (const item of stats.startup) {
    startupTotal += item.tokens;
    const warn = item.bytes > 1000 ? '  ⚠ large' : '';
    console.log(`    ${item.name.padEnd(32)} ${String(item.tokens).padStart(5)} tokens  (${item.bytes}B)${warn}`);
  }
  console.log(`    ${'── startup total'.padEnd(32)} ${String(startupTotal).padStart(5)} tokens`);

  console.log('\n  On-demand (read when needed):');
  let onDemandTotal = 0;
  for (const item of stats.onDemand) {
    onDemandTotal += item.tokens;
    const warn = item.tokens > 500 ? '  ⚠ consider compress' : '';
    console.log(`    ${item.name.padEnd(32)} ${String(item.tokens).padStart(5)} tokens  (${item.bytes}B)${warn}`);
  }
  console.log(`    ${'── on-demand total'.padEnd(32)} ${String(onDemandTotal).padStart(5)} tokens`);
  console.log(`\n  If all loaded: ~${startupTotal + onDemandTotal} tokens`);

  const summaryContent = safeRead(path.join(dir, '.memoc', 'session-summary.md'));
  const summaryBytes   = Buffer.byteLength(summaryContent, 'utf8');
  if (summaryBytes > 800) {
    console.log(`\n  ⚠ session-summary.md is ${summaryBytes}B — recommended <800B. Run \`memoc trim-summary\`, then move completed history to worklog and resume details to 04-handoff.md.`);
  }
  console.log();
}

function memoryTokenStats(dir) {
  const est  = text => Math.ceil(Buffer.byteLength(text, 'utf8') / 4);
  const read = fp   => { try { return fs.readFileSync(fp, 'utf8'); } catch { return ''; } };
  const memDir = path.join(dir, '.memoc');
  const startup = [
    ['CLAUDE.md',          path.join(dir, 'CLAUDE.md'), true],
    ['session-summary.md', path.join(memDir, 'session-summary.md'), true],
  ];
  const onDemand = [
    ['llms.txt',                      path.join(dir, 'llms.txt')],
    ['02-current-project-state.md',   path.join(memDir, '02-current-project-state.md')],
    ['03-decisions.md',               path.join(memDir, '03-decisions.md')],
    ['04-handoff.md',                 path.join(memDir, '04-handoff.md')],
    ['06-project-rules.md',           path.join(memDir, '06-project-rules.md')],
    ['activity.md',                   path.join(memDir, 'activity.md')],
  ];
  const existing = ([, fp, keep]) => keep || fs.existsSync(fp);
  const toItem = ([name, fp]) => {
    const content = read(fp);
    return { name, fp, bytes: Buffer.byteLength(content, 'utf8'), tokens: est(content) };
  };
  const startupItems = startup.filter(existing).map(toItem);
  const onDemandItems = onDemand.filter(existing).map(toItem);
  return {
    startup: startupItems,
    onDemand: onDemandItems,
    startupTokens: startupItems.reduce((sum, item) => sum + item.tokens, 0),
    allTokens: [...startupItems, ...onDemandItems].reduce((sum, item) => sum + item.tokens, 0),
  };
}

// ═══════════════════════════════════════════════════════════════════
// DOCTOR — quick health checks for shared memoc repos
// ═══════════════════════════════════════════════════════════════════

function runDoctor(dir) {
  const issues = [];
  const warnings = [];
  const memDir = path.join(dir, '.memoc');
  const summaryPath = path.join(memDir, 'session-summary.md');
  const summary = safeRead(summaryPath);
  if (!summary) issues.push('Missing .memoc/session-summary.md');
  else if (Buffer.byteLength(summary, 'utf8') > 800) warnings.push('session-summary.md exceeds 800B; run memoc trim-summary');

  const wrapperFiles = [
    path.join(dir, '.memoc', 'bin', 'memoc'),
    path.join(dir, '.memoc', 'bin', 'memoc.cmd'),
    path.join(dir, '.memoc', 'bin', 'memoc.ps1'),
  ];
  for (const fp of wrapperFiles) {
    if (!fs.existsSync(fp)) {
      issues.push(`Missing ${normRel(dir, fp)}; run memoc upgrade`);
      continue;
    }
    const src = safeRead(fp);
    if (src && (/C:\\Users\\|\/Users\/[^/]+\/\.local\/share\/memoc\/runtime/.test(src))) {
      issues.push(`${normRel(dir, fp)} contains a user-specific runtime path; run memoc upgrade`);
    }
  }
  const shWrapper = path.join(dir, '.memoc', 'bin', 'memoc');
  if (currentPlatform() !== 'win32' && fs.existsSync(shWrapper) && !isExecutable(shWrapper)) {
    issues.push(`${normRel(dir, shWrapper)} is not executable; run memoc upgrade`);
  }

  for (const fp of collectMemocMarkdownFiles(dir)) {
    const src = safeRead(fp);
    const fenceCount = (src.match(/^---$/gm) || []).length;
    if (fenceCount > 2) warnings.push(`${normRel(dir, fp)} may have nested frontmatter; run memoc upgrade`);
  }

  const actor = detectActor(dir);
  if (actor.actor === 'unknown') warnings.push('Actor could not be detected; run memoc actor set <name>');

  console.log('\n  memoc doctor\n');
  console.log(`    Actor    ${actor.actor} (${actor.source})`);
  console.log(`    Issues   ${issues.length}`);
  console.log(`    Warnings ${warnings.length}`);
  if (issues.length) {
    console.log('\n  Issues:');
    for (const issue of issues) console.log(`    - ${issue}`);
  }
  if (warnings.length) {
    console.log('\n  Warnings:');
    for (const warning of warnings.slice(0, 20)) console.log(`    - ${warning}`);
  }
  if (!issues.length && !warnings.length) console.log('\n  Looks good.');
  console.log();
}

// ═══════════════════════════════════════════════════════════════════
// COMPRESS — safe whole-memory compaction
// ═══════════════════════════════════════════════════════════════════

function runCompress(dir) {
  ensureMemocBase(dir);
  const before = memoryTokenStats(dir);
  const actions = [];
  const mark = (label, name) => actions.push(`    ${label.padEnd(8)} ${name}`);

  console.log(`\n  memoc compress\n`);
  archiveLegacyLog(dir, mark);

  const trim = trimSummaryFile(dir);
  if (trim.action === 'trim') {
    mark('update', `.memoc/session-summary.md (${trim.beforeBytes}B -> ${trim.afterBytes}B)`);
    mark('update', '.memoc/session-summary-archive.md');
  } else if (trim.action === 'add') {
    mark('add', '.memoc/session-summary.md');
  } else {
    mark('skip', `.memoc/session-summary.md (compact ${trim.beforeBytes || 0}B)`);
  }

  const workRoot = path.join(dir, '.memoc', 'worklog');
  const recent = listMarkdownFiles(workRoot)
    .filter(fp => path.basename(fp) !== 'README.md')
    .sort()
    .reverse()
    .slice(0, 20);
  writeActivityIndexes(dir, recent);
  mark('update', '.memoc/activity.md, .memoc/worklog/README.md, .memoc/actors/README.md');

  ensureObsidianFrontmatter(dir, mark);

  const after = memoryTokenStats(dir);
  const startupDelta = before.startupTokens - after.startupTokens;
  const allDelta = before.allTokens - after.allTokens;
  console.log(actions.join('\n'));
  console.log(`\n    Startup  ~${before.startupTokens} -> ~${after.startupTokens} tokens (${startupDelta >= 0 ? '-' : '+'}${Math.abs(startupDelta)})`);
  console.log(`    All mem   ~${before.allTokens} -> ~${after.allTokens} tokens (${allDelta >= 0 ? '-' : '+'}${Math.abs(allDelta)})`);
  console.log('    Note     Decisions, handoff, rules, wiki topics, and source docs are preserved.');
  console.log('\n  Done.\n');
}

// ═══════════════════════════════════════════════════════════════════
// TRIM SUMMARY — keep startup memory small and move bulky text aside
// ═══════════════════════════════════════════════════════════════════

function runTrimSummary(dir) {
  const result = trimSummaryFile(dir);
  if (result.action === 'add') {
    console.log('\n  memoc trim-summary\n');
    console.log('    Added .memoc/session-summary.md');
    console.log('\n  Done.\n');
    return;
  }

  if (result.action === 'skip') {
    console.log('\n  memoc trim-summary\n');
    console.log(`    session-summary.md is already compact (${result.beforeBytes}B).`);
    console.log('\n  Done.\n');
    return;
  }

  console.log('\n  memoc trim-summary\n');
  console.log(`    Archived  .memoc/session-summary-archive.md`);
  console.log(`    Rewrote   .memoc/session-summary.md (${result.beforeBytes}B → ${result.afterBytes}B)`);
  console.log('    Reminder  Completed history belongs in worklog; resume details belong in 04-handoff.md.');
  console.log('\n  Done.\n');
}

function compactSessionSummary(src) {
  const sections = ['Status', 'Changed', 'Open Tasks', 'Resume'];
  const lines = [
    '# Session Summary',
    `Last: ${nowISO()}`,
    'Replace, do not append. Keep <800B.',
    'History: worklog. Resume risks: 04-handoff.md.',
    '',
  ];

  for (const heading of sections) {
    lines.push(`## ${heading}`);
    const bullets = compactSummaryBullets(sectionText(src, heading));
    if (bullets.length) lines.push(...bullets);
    else lines.push(summaryPlaceholder(heading));
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function sectionText(src, heading) {
  const re = new RegExp(`(?:^|\\n)## ${escapeRegExp(heading)}\\n([\\s\\S]*?)(?=\\n## |$)`);
  const m = String(src || '').match(re);
  return m ? m[1].trim() : '';
}

function compactSummaryBullets(text) {
  const maxLine = 48;
  return String(text || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !/^_.*_$/.test(line))
    .map(line => line.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 2)
    .map(line => {
      const compact = line
        .replace(/`/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      return `- ${compact.length > maxLine ? `${compact.slice(0, maxLine - 3)}...` : compact}`;
    });
}

function summaryPlaceholder(heading) {
  if (heading === 'Status') return '_Current state in 1-3 bullets._';
  if (heading === 'Changed') return '_Recent durable changes only._';
  if (heading === 'Open Tasks') return '_Current open tasks only._';
  return '_Where the next agent should resume._';
}

// ═══════════════════════════════════════════════════════════════════
// INSTALL-PLUGIN — register memoc skills with agent apps
// ═══════════════════════════════════════════════════════════════════

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (fs.statSync(s).isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

function readJsonLoose(fp) {
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    try { return JSON.parse(raw); } catch (_) {}
    let cleaned = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      const next = raw[i + 1];
      if (inString) {
        cleaned += ch;
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        cleaned += ch;
        continue;
      }
      if (ch === '/' && next === '/') {
        while (i < raw.length && raw[i] !== '\n') i++;
        cleaned += '\n';
        continue;
      }
      cleaned += ch;
    }
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(cleaned);
  } catch { return null; }
}

function writePiMemocExtension(dest, skillNames) {
  const lines = [
    'import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";',
    '',
    'const SKILLS: Array<[string, string]> = [',
    ...skillNames.map((name) => {
      const command = name;
      return `  ["${command}", "${name}"],`;
    }),
    '];',
    '',
    'export default function memocPiExtension(pi: ExtensionAPI) {',
    '  for (const [command, skillName] of SKILLS) {',
    '    pi.registerCommand(command, {',
    '      description: `Run ${skillName} skill`,',
    '      handler: async (args, ctx) => {',
    '        const message = args.trim() ? `/skill:${skillName} ${args.trim()}` : `/skill:${skillName}`;',
    '        if (ctx.isIdle()) pi.sendUserMessage(message);',
    '        else {',
    '          pi.sendUserMessage(message, { deliverAs: "followUp" });',
    '          ctx.ui.notify(`Queued ${skillName}`, "info");',
    '        }',
    '      },',
    '    });',
    '  }',
    '}',
    '',
  ];
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, lines.join('\n'));
}

function resolveSkillsSource(pkgRoot, pluginSrc, skillNames) {
  const candidates = [
    path.join(pkgRoot, 'skills'),
    path.join(pluginSrc, 'skills'),
  ];
  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    if (skillNames.every(name => fs.existsSync(path.join(dir, name, 'SKILL.md')))) return dir;
  }
  return null;
}

function runInstallPlugin() {
  const os = require('os');
  const PLUGIN_KEY = 'memoc@memoc';

  const pkgRoot    = path.join(__dirname, '..');
  const pluginSrc  = path.join(pkgRoot, 'plugins', 'memoc');

  if (!fs.existsSync(pluginSrc)) {
    console.error('Error: plugin files not found in package.');
    console.error('Ensure you are running from the installed memoc package or repo root.');
    process.exit(1);
  }

  const claudeDir     = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const cacheDir      = path.join(claudeDir, 'plugins', 'cache', 'memoc', 'memoc', VERSION);
  const marketplaceDir = path.join(claudeDir, 'plugins', 'marketplaces', 'memoc');
  const marketplacePluginDir = path.join(marketplaceDir, 'plugins', 'memoc');
  const claudeMarketplacePath = path.join(marketplaceDir, '.claude-plugin', 'marketplace.json');
  const agentsMarketplacePath = path.join(marketplaceDir, '.agents', 'plugins', 'marketplace.json');
  const installedPath = path.join(claudeDir, 'plugins', 'installed_plugins.json');
  const settingsPath  = path.join(claudeDir, 'settings.json');

  // copy plugin files to Claude's cache and local marketplace registry
  copyDirSync(pluginSrc, cacheDir);
  copyDirSync(pluginSrc, marketplacePluginDir);
  const claudeMarketplace = {
    $schema: 'https://anthropic.com/claude-code/marketplace.schema.json',
    name: 'memoc',
    description: 'memoc skills and plugin installer for Claude Code, Codex, and skills-compatible coding agents.',
    owner: {
      name: 'kevin0181',
    },
    plugins: [{
      name: 'memoc',
      description: 'Session-to-session memory and coding guardrail skills for AI coding agents.',
      author: {
        name: 'kevin0181',
      },
      source: './plugins/memoc',
      category: 'productivity',
      homepage: 'https://github.com/neneee0181/memoc',
    }],
  };
  const agentsMarketplace = {
    name: 'memoc',
    interface: {
      displayName: 'memoc',
    },
    plugins: [{
      name: 'memoc',
      source: {
        source: 'local',
        path: './plugins/memoc',
      },
      policy: {
        installation: 'AVAILABLE',
        authentication: 'ON_INSTALL',
      },
      category: 'Productivity',
    }],
  };
  for (const [marketplacePath, marketplace] of [
    [claudeMarketplacePath, claudeMarketplace],
    [agentsMarketplacePath, agentsMarketplace],
  ]) {
    fs.mkdirSync(path.dirname(marketplacePath), { recursive: true });
    fs.writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + '\n');
  }

  // update installed_plugins.json
  const installed = readJsonLoose(installedPath) || {};
  installed.version = installed.version || 2;
  installed.plugins = installed.plugins || {};
  const now = new Date().toISOString();
  const existing = Array.isArray(installed.plugins[PLUGIN_KEY]) ? installed.plugins[PLUGIN_KEY][0] : null;
  installed.plugins[PLUGIN_KEY] = [{
    scope:       'user',
    installPath: cacheDir,
    version:     VERSION,
    installedAt: existing ? existing.installedAt : now,
    lastUpdated: now,
  }];
  fs.mkdirSync(path.dirname(installedPath), { recursive: true });
  fs.writeFileSync(installedPath, JSON.stringify(installed, null, 2) + '\n');

  // update settings.json
  const settings = readJsonLoose(settingsPath) || {};
  settings.enabledPlugins = settings.enabledPlugins || {};
  settings.enabledPlugins[PLUGIN_KEY] = true;
  settings.extraKnownMarketplaces = settings.extraKnownMarketplaces || {};
  settings.extraKnownMarketplaces.memoc = {
    source: {
      source: 'directory',
      path: marketplaceDir,
    },
  };
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 }); }
  catch { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n'); }

  const SKILL_NAMES = [
    'memoc', 'memoc-init', 'memoc-upgrade', 'memoc-search',
    'memoc-work', 'memoc-note', 'memoc-doctor', 'memoc-compress',
    'memoc-code', 'memoc-think', 'memoc-simple', 'memoc-scope', 'memoc-goal',
  ];
  const DEPRECATED_SKILL_NAMES = [
    'memoc-summary', 'memoc-tokens', 'memoc-trim', 'memoc-activity',
    'memoc-ingest', 'memoc-lint', 'memoc-actor',
  ];

  // Register global skills for Codex Desktop and other apps that read
  // the common Skills location used by the skills CLI.
  const agentsDir    = path.join(os.homedir(), '.agents');
  const agentSkills  = path.join(agentsDir, 'skills');
  const skillLockPath = path.join(agentsDir, '.skill-lock.json');
  const skillsSrc    = resolveSkillsSource(pkgRoot, pluginSrc, SKILL_NAMES);
  const piDir        = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent');
  const piExtension  = path.join(piDir, 'extensions', 'memoc.ts');
  const piSettingsPath = path.join(piDir, 'settings.json');

  if (skillsSrc) {
    const skillLock = readJsonLoose(skillLockPath) || { version: 3, skills: {} };
    if (!skillLock.skills) skillLock.skills = {};
    for (const name of DEPRECATED_SKILL_NAMES) {
      const oldDest = path.join(agentSkills, name);
      if (fs.existsSync(oldDest)) fs.rmSync(oldDest, { recursive: true, force: true });
      delete skillLock.skills[name];
    }
    for (const name of SKILL_NAMES) {
      const src = path.join(skillsSrc, name);
      if (!fs.existsSync(src)) continue;
      copyDirSync(src, path.join(agentSkills, name));
      const prev = skillLock.skills[name] || {};
      skillLock.skills[name] = {
        source:          'neneee0181/memoc',
        sourceType:      'npm',
        sourceUrl:       'https://github.com/neneee0181/memoc.git',
        skillPath:       `skills/${name}/SKILL.md`,
        skillFolderHash: VERSION,
        installedAt:     prev.installedAt || now,
        updatedAt:       now,
      };
    }
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(skillLockPath, JSON.stringify(skillLock, null, 2) + '\n');

    // Pi Dev also reads ~/.agents/skills. Keep only the extension in ~/.pi/agent
    // so startup does not report duplicate skill conflicts.
    for (const name of [...SKILL_NAMES, ...DEPRECATED_SKILL_NAMES]) {
      const oldPiDest = path.join(piDir, 'skills', name);
      if (fs.existsSync(oldPiDest)) fs.rmSync(oldPiDest, { recursive: true, force: true });
    }
    writePiMemocExtension(piExtension, SKILL_NAMES);
    const piSettings = readJsonLoose(piSettingsPath) || {};
    piSettings.enableSkillCommands = true;
    fs.mkdirSync(path.dirname(piSettingsPath), { recursive: true });
    fs.writeFileSync(piSettingsPath, JSON.stringify(piSettings, null, 2) + '\n');
  }

  console.log('\n  memoc plugin installed\n');
  console.log('  Claude Code    ~/.claude/plugins/cache/memoc/ + ~/.claude/plugins/marketplaces/memoc/');
  console.log('  Codex Desktop  ~/.agents/skills/');
  console.log('  Skills spec    ~/.agents/skills/ (Cursor, Windsurf, and other supported agents)');
  console.log('  Pi Dev         ~/.pi/agent/extensions/memoc.ts (uses ~/.agents/skills/)');
  console.log('\n  Skills:');
  for (const s of SKILL_NAMES) console.log(`    /${s}`);
  console.log('\n  Restart open agent apps to reload skills.\n');
}

function runUninstallPlugin() {
  const os = require('os');
  const PLUGIN_KEY = 'memoc@memoc';
  const SKILL_NAMES = [
    'memoc', 'memoc-init', 'memoc-upgrade', 'memoc-search',
    'memoc-work', 'memoc-note', 'memoc-doctor', 'memoc-compress',
    'memoc-code', 'memoc-think', 'memoc-simple', 'memoc-scope', 'memoc-goal',
    'memoc-summary', 'memoc-tokens', 'memoc-trim', 'memoc-activity',
    'memoc-ingest', 'memoc-lint', 'memoc-actor',
  ];

  const claudeDir     = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const cacheBase     = path.join(claudeDir, 'plugins', 'cache', 'memoc');
  const marketplaceBase = path.join(claudeDir, 'plugins', 'marketplaces', 'memoc');
  const installedPath = path.join(claudeDir, 'plugins', 'installed_plugins.json');
  const settingsPath  = path.join(claudeDir, 'settings.json');

  // remove Claude Code cache
  if (fs.existsSync(cacheBase)) fs.rmSync(cacheBase, { recursive: true, force: true });
  if (fs.existsSync(marketplaceBase)) fs.rmSync(marketplaceBase, { recursive: true, force: true });

  // remove from installed_plugins.json
  const installed = readJsonLoose(installedPath);
  if (installed && installed.plugins) {
    delete installed.plugins[PLUGIN_KEY];
    fs.writeFileSync(installedPath, JSON.stringify(installed, null, 2) + '\n');
  }

  // remove from ~/.agents/skills/
  const agentsDir    = path.join(os.homedir(), '.agents');
  const skillLockPath = path.join(agentsDir, '.skill-lock.json');
  const piDir        = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.pi', 'agent');
  const piExtension  = path.join(piDir, 'extensions', 'memoc.ts');
  for (const name of SKILL_NAMES) {
    const d = path.join(agentsDir, 'skills', name);
    if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
    const piSkillDir = path.join(piDir, 'skills', name);
    if (fs.existsSync(piSkillDir)) fs.rmSync(piSkillDir, { recursive: true, force: true });
  }
  if (fs.existsSync(piExtension)) fs.rmSync(piExtension, { force: true });
  const skillLock = readJsonLoose(skillLockPath);
  if (skillLock && skillLock.skills) {
    for (const name of SKILL_NAMES) delete skillLock.skills[name];
    fs.writeFileSync(skillLockPath, JSON.stringify(skillLock, null, 2) + '\n');
  }

  // remove from settings.json
  const settings = readJsonLoose(settingsPath);
  if (settings && settings.enabledPlugins) {
    delete settings.enabledPlugins[PLUGIN_KEY];
    if (settings.extraKnownMarketplaces) delete settings.extraKnownMarketplaces.memoc;
    try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', { mode: 0o600 }); }
    catch { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n'); }
  }

  console.log('  memoc plugin removed from Claude Code and ~/.agents/skills/.');
  console.log('  Restart Claude Code to deactivate.');
}

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════

function runSummary(dir) {
  const files = [
    path.join(dir, '.memoc/session-summary.md'),
    path.join(dir, '.memoc/02-current-project-state.md'),
    path.join(dir, '.memoc/04-handoff.md'),
  ];

  function read(fp) {
    try { return fs.readFileSync(fp, 'utf8'); } catch { return ''; }
  }

  function section(src, heading) {
    const re = new RegExp(`(?:^|\\n)## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`);
    const m = src.match(re);
    return m ? m[1].trim() : '';
  }

  function bullets(text, max = 3) {
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('- ') && !line.includes('_None yet._'))
      .slice(0, max);
  }

  const summary = read(files[0]);
  const state = read(files[1]);
  const handoff = read(files[2]);
  try {
    const pkg = JSON.parse(read(path.join(dir, 'package.json')));
    if (pkg.name || pkg.version) {
      console.log(`Project: ${pkg.name || path.basename(dir)}${pkg.version ? `@${pkg.version}` : ''}`);
    }
  } catch {}
  const rows = [
    ['Status', bullets(section(summary, 'Status')).concat(bullets(section(state, 'Current Status'))).slice(0, 3)],
    ['Open Tasks', bullets(section(summary, 'Open Tasks')).concat(bullets(section(state, 'Open Tasks'))).slice(0, 3)],
    ['Resume', bullets(section(summary, 'Resume')).concat(bullets(section(handoff, 'Next Steps'))).slice(0, 3)],
    ['Verified', bullets(section(handoff, 'Verified'), 2)],
  ];

  let printed = false;
  for (const [label, items] of rows) {
    if (!items.length) continue;
    printed = true;
    console.log(`${label}:`);
    for (const item of items) console.log(item);
  }
  if (!printed) console.log('No summary bullets yet. Read .memoc/session-summary.md.');
}

// ═══════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

const cmd = process.argv[2];
const cwd = process.cwd();

if (cmd === '--version' || cmd === '-v') {
  console.log(VERSION);
  process.exit(0);
}

if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
  console.log('Usage: memoc <command>\n');
  console.log('Commands:');
  console.log('  init               Scaffold agent memory (auto-detects project, updates if already exists)');
  console.log('  update             Force-update managed sections based on current project state');
  console.log('  upgrade            Refresh memoc runtime/wrappers and managed sections; preserve memory');
  console.log('  summary            Print a tiny status/resume overview');
  console.log('  tokens             Estimate token cost of current memory files');
  console.log('  trim-summary       Archive and compact oversized session-summary.md');
  console.log('  compress           Compact memoc files and refresh generated indexes');
  console.log('  add <agent>        Add entry file for a specific agent (run without args to list)');
  console.log('  actor [set <name>] Show or set the local memoc actor');
  console.log('  work "<title>"     Create a conflict-light actor worklog entry');
  console.log('  activity           List recent memoc worklog entries');
  console.log('  doctor             Check common memoc health issues');
  console.log('  search "<query>"   Search memory/agent docs (use --snippets for line matches)');
  console.log('  grep "<query>"     Search project source/text files (use --snippets for line matches)');
  console.log('  ingest <path|url>  Create a raw/source record scaffold for wiki synthesis');
  console.log('  note "<title>"     Save a durable topic/query-result scaffold');
  console.log('  lint-wiki          Check wiki links, tags, backlinks, and Related sections');
  console.log('\nPlugin skills (Claude Code / Codex):');
  console.log('  install-plugin     Register /memoc-* skills with Claude Code, Codex, and Skills agents');
  console.log('  uninstall-plugin   Remove memoc plugin and global Skills entries');
  console.log('\nSearch flags:');
  console.log('  --files            Show file names and match counts, sorted by relevance + recency (default)');
  console.log('  --snippets         Show matching lines');
  console.log('  --limit N          Limit output (default 12)');
  console.log('  --all              Show all matches');
  console.log('\nFlags:');
  console.log('  --version, -v      Print version');
  process.exit(0);
}

if (cmd === 'init')     { run(cwd, false);             process.exit(0); }
if (cmd === 'update')   { run(cwd, true, 'update');    process.exit(0); }
if (cmd === 'upgrade')  { run(cwd, true, 'upgrade');   process.exit(0); }
if (cmd === 'summary')  { runSummary(cwd);    process.exit(0); }
if (cmd === 'tokens')   { runTokens(cwd);     process.exit(0); }
if (cmd === 'trim-summary') { runTrimSummary(cwd); process.exit(0); }
if (cmd === 'compress') { runCompress(cwd);   process.exit(0); }
if (cmd === 'add')      { runAdd(cwd);        process.exit(0); }
if (cmd === 'actor')    { runActor(cwd);      process.exit(0); }
if (cmd === 'work')     { runWork(cwd);       process.exit(0); }
if (cmd === 'activity') { runActivity(cwd);   process.exit(0); }
if (cmd === 'doctor')   { runDoctor(cwd);     process.exit(0); }
if (cmd === 'search')   { runSearch(cwd, 'memory');  process.exit(0); }
if (cmd === 'grep')     { runSearch(cwd, 'project'); process.exit(0); }
if (cmd === 'ingest')   { runIngest(cwd);     process.exit(0); }
if (cmd === 'note')     { runNote(cwd);       process.exit(0); }
if (cmd === 'lint-wiki')         { runWikiLint(cwd);       process.exit(0); }
if (cmd === 'install-plugin')   { runInstallPlugin();     process.exit(0); }
if (cmd === 'uninstall-plugin') { runUninstallPlugin();   process.exit(0); }

console.error(`Unknown command: ${cmd}`);
console.error('Run "memoc --help" for usage.');
process.exit(1);
