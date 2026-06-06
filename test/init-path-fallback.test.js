const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'bin', 'cli.js');
const pkg = require('../package.json');

function withTempProject(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoc-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'sample-app' }), 'utf8');
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function commandArg(arg) {
  if (process.platform === 'win32') return `"${String(arg).replace(/"/g, '""')}"`;
  return `'${String(arg).replace(/'/g, `'\\''`)}'`;
}

function runLocalMemoc(dir, args, env = process.env) {
  const localBin = path.join(dir, '.memoc', 'bin', process.platform === 'win32' ? 'memoc.cmd' : 'memoc');
  if (process.platform === 'win32') {
    return execSync([commandArg(localBin), ...args.map(commandArg)].join(' '), { cwd: dir, encoding: 'utf8', env });
  }
  return execFileSync(localBin, args, { cwd: dir, encoding: 'utf8', env });
}

test('init creates PATH helpers and teaches agents command fallbacks', () => {
  withTempProject(dir => {
    const userBin = path.join(dir, 'fake-user-bin');
    const activePathBin = path.join(dir, 'active-path-bin');
    fs.mkdirSync(activePathBin, { recursive: true });
    const output = execFileSync(process.execPath, [cliPath, 'init'], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        MEMOC_SKIP_PATH_REGISTER: '1',
        MEMOC_USER_BIN_DIR: userBin,
        MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
        PATH: `${activePathBin}${path.delimiter}${process.env.PATH || ''}`,
      },
    });

    const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
    assert.match(output, /PATH registration/);
    assert.match(output, /Agent command fallback/);
    assert.match(output, /\.\\\.memoc\\bin\\memoc\.cmd summary/);
    assert.match(output, /\.memoc\/bin\/memoc summary/);
    assert.match(agents, /Search memory first/);
    assert.match(agents, /`memoc search "<query>" --limit 5`/);
    assert.match(agents, /`\.\\\.memoc\\bin\\memoc\.cmd <command>`/);
    assert.match(agents, /`\.memoc\/bin\/memoc <command>`/);

    assert.ok(fs.existsSync(path.join(dir, '.memoc', 'env.ps1')));
    assert.ok(fs.existsSync(path.join(dir, '.memoc', 'env.sh')));
    assert.ok(fs.existsSync(path.join(dir, '.memoc', 'bin', 'memoc.cmd')));
    assert.ok(fs.existsSync(path.join(dir, '.memoc', 'bin', 'memoc.ps1')));
    assert.ok(fs.existsSync(path.join(dir, '.memoc', 'bin', 'memoc')));
    assert.ok(fs.existsSync(path.join(userBin, 'memoc.cmd')));
    assert.ok(fs.existsSync(path.join(userBin, 'memoc.ps1')));
    assert.ok(fs.existsSync(path.join(userBin, 'memoc')));
    const cmdWrapper = fs.readFileSync(path.join(userBin, 'memoc.cmd'), 'utf8');
    const ps1Wrapper = fs.readFileSync(path.join(userBin, 'memoc.ps1'), 'utf8');
    const shWrapper = fs.readFileSync(path.join(userBin, 'memoc'), 'utf8');
    assert.match(cmdWrapper, /%LOCALAPPDATA%\\memoc\\runtime/);
    assert.match(ps1Wrapper, /\$env:LOCALAPPDATA/);
    assert.match(shWrapper, /\$\{HOME:-\$PWD\}\/\.local\/share\/memoc\/runtime/);
    assert.match(cmdWrapper, /%~dp0\.\.\\runtime/);
    assert.match(cmdWrapper, /call node "%MEMOC_CLI%" %\*/);
    assert.match(cmdWrapper, /call npx @kevin0181\/memoc@latest %\*/);
    assert.match(ps1Wrapper, /Join-Path \$PSScriptRoot "\.\.\\runtime"/);
    assert.match(shWrapper, /\$\(dirname "\$0"\)\/\.\.\/runtime/);
    assert.doesNotMatch(cmdWrapper, /fake-runtime|C:\\Users\\kevin|\/Users\/neneee/);
    assert.doesNotMatch(ps1Wrapper, /fake-runtime|C:\\Users\\kevin|\/Users\/neneee/);
    assert.doesNotMatch(shWrapper, /fake-runtime|C:\\Users\\kevin|\/Users\/neneee/);
    assert.ok(fs.existsSync(path.join(dir, 'fake-runtime', 'bin', 'cli.js')));
    assert.ok(fs.existsSync(path.join(activePathBin, 'memoc.cmd')));
    assert.ok(fs.existsSync(path.join(activePathBin, 'memoc.ps1')));
    assert.ok(fs.existsSync(path.join(activePathBin, 'memoc')));
  });
});

test('project-local memoc launcher runs commands agents are told to use', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });

    assert.equal(runLocalMemoc(dir, ['--version'], env).trim(), pkg.version);
    fs.appendFileSync(path.join(dir, '.memoc', 'session-summary.md'), '\n- auth token refresh pending\n', 'utf8');
    const output = runLocalMemoc(dir, ['search', 'auth', '--snippets', '--limit', '3'], env);
    assert.match(output, /\.memoc[\\/]session-summary\.md/);
    assert.match(output, /auth token refresh pending/);
  });
});

test('init writes memoc markers and does not duplicate managed blocks', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };

    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });

    const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
    assert.equal((agents.match(/<!-- memoc:managed:start -->/g) || []).length, 1);
    assert.equal((agents.match(/<!-- memoc:managed:end -->/g) || []).length, 1);
    assert.doesNotMatch(agents, /context-forge:managed/);
  });
});

test('init migrates legacy context-forge markers without duplicating blocks', () => {
  withTempProject(dir => {
    fs.writeFileSync(
      path.join(dir, 'AGENTS.md'),
      [
        '# Existing Agent Notes',
        '',
        '<!-- context-forge:managed:start -->',
        'legacy managed block',
        '<!-- context-forge:managed:end -->',
        '',
        'User-owned notes stay here.',
        '',
      ].join('\n'),
      'utf8'
    );

    execFileSync(process.execPath, [cliPath, 'init'], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        MEMOC_SKIP_PATH_REGISTER: '1',
        MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
        MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
      },
    });

    const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
    assert.equal((agents.match(/<!-- memoc:managed:start -->/g) || []).length, 1);
    assert.equal((agents.match(/<!-- memoc:managed:end -->/g) || []).length, 1);
    assert.doesNotMatch(agents, /context-forge:managed/);
    assert.match(agents, /User-owned notes stay here/);
  });
});

test('init installs a cross-platform Claude hook and migrates old memoc hooks', () => {
  withTempProject(dir => {
    const claudeDir = path.join(dir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({
        hooks: {
          Stop: [
            {
              matcher: '',
              hooks: [
                { type: 'command', command: 'echo keep-me' },
                { type: 'command', command: "node -e \"fs.writeFileSync('.memoc/.pending','x'); git status --porcelain\" 2>/dev/null || true" },
              ],
            },
          ],
        },
      }, null, 2),
      'utf8'
    );

    execFileSync(process.execPath, [cliPath, 'init'], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        MEMOC_SKIP_PATH_REGISTER: '1',
        MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
        MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
      },
    });

    const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
    const commands = settings.hooks.Stop.flatMap(entry => entry.hooks || []).map(h => h.command);
    const memocHooks = commands.filter(command => command.includes('.memoc/.pending'));
    assert.equal(memocHooks.length, 1);
    assert.match(memocHooks[0], /execFileSync\('git',\['status','--porcelain'\]/);
    assert.doesNotMatch(memocHooks[0], /2>\/dev\/null|\|\| true/);
    assert.ok(commands.includes('echo keep-me'));
  });
});

test('update mode refreshes Claude hook and pending gitignore entry', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });

    const settingsPath = path.join(dir, '.claude', 'settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [{ matcher: '', hooks: [{ type: 'command', command: "node -e \"fs.writeFileSync('.memoc/.pending','x'); git status --porcelain\" 2>/dev/null || true" }] }],
        },
      }, null, 2),
      'utf8'
    );
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n.memoc/.pending-old\n', 'utf8');

    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const commands = settings.hooks.Stop.flatMap(entry => entry.hooks || []).map(h => h.command);
    const memocHooks = commands.filter(command => command.includes('.memoc/.pending'));
    assert.equal(memocHooks.length, 1);
    assert.doesNotMatch(memocHooks[0], /2>\/dev\/null|\|\| true/);
    assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /^\.memoc\/\.pending$/m);
  });
});

test('upgrade refreshes runtime while preserving existing memory', () => {
  withTempProject(dir => {
    const runtimeDir = path.join(dir, 'fake-runtime');
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: runtimeDir,
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });

    const summaryPath = path.join(dir, '.memoc', 'session-summary.md');
    const decisionsPath = path.join(dir, '.memoc', '03-decisions.md');
    fs.writeFileSync(summaryPath, '# Session Summary\n\n## Status\n- keep this memory\n', 'utf8');
    fs.appendFileSync(decisionsPath, '\n## 2026-05-20\n- Preserve user decisions.\n', 'utf8');
    fs.writeFileSync(path.join(dir, '.memoc', 'log.md'), '# Project Log\n\n## old\n- Preserve this legacy history.\n', 'utf8');
    fs.writeFileSync(path.join(dir, '.memoc', '05-done-checklist.md'), '# Done Checklist\n\n- [ ] `.memoc/log.md` has a new entry for meaningful work.\n', 'utf8');
    fs.writeFileSync(path.join(dir, '.memoc', 'memoc-usage.md'), '# memoc Usage\n\n1. Work.\n2. Append `.memoc/log.md`.\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'skills/project-memory-maintainer/SKILL.md'), '# Project Memory Maintainer\n\n- Append `.memoc/log.md` for meaningful changes, decisions, and handoffs.\n- Keep completed history in `.memoc/log.md`; keep current-state files short.\n', 'utf8');
    fs.mkdirSync(path.join(dir, '.memoc', 'systems'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.memoc', 'systems', 'gateway.md'), '# Gateway\n\nLegacy system doc.\n', 'utf8');
    fs.writeFileSync(path.join(runtimeDir, 'package.json'), JSON.stringify({ version: '0.0.1' }), 'utf8');

    const output = execFileSync(process.execPath, [cliPath, 'upgrade'], { cwd: dir, encoding: 'utf8', env });

    assert.match(output, /memoc upgrade/);
    assert.match(fs.readFileSync(summaryPath, 'utf8'), /keep this memory/);
    assert.match(fs.readFileSync(decisionsPath, 'utf8'), /Preserve user decisions/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(runtimeDir, 'package.json'), 'utf8')).version, pkg.version);
    assert.equal(fs.existsSync(path.join(dir, '.memoc', 'log.md')), false);
    assert.equal(fs.existsSync(path.join(dir, '.memoc', 'systems')), false);
    assert.match(fs.readFileSync(path.join(dir, '.memoc', 'raw', 'legacy-log.md'), 'utf8'), /Preserve this legacy history/);
    assert.match(fs.readFileSync(path.join(dir, '.memoc', 'raw', 'legacy-systems', 'gateway.md'), 'utf8'), /Legacy system doc/);
    assert.match(fs.readFileSync(path.join(dir, '.memoc', '05-done-checklist.md'), 'utf8'), /worklog\/<actor>\/YYYY-MM/);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, '.memoc', 'memoc-usage.md'), 'utf8'), /Append `\.memoc\/log\.md`/);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, 'skills/project-memory-maintainer/SKILL.md'), 'utf8'), /Append `\.memoc\/log\.md`|completed history in `\.memoc\/log\.md`/);
  });
});

test('init tolerates malformed Claude hook settings', () => {
  withTempProject(dir => {
    const claudeDir = path.join(dir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({ hooks: 'bad shape' }), 'utf8');

    execFileSync(process.execPath, [cliPath, 'init'], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        MEMOC_SKIP_PATH_REGISTER: '1',
        MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
        MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
      },
    });

    const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
    assert.ok(Array.isArray(settings.hooks.Stop));
    assert.equal(settings.hooks.Stop.flatMap(entry => entry.hooks || []).filter(h => h.command.includes('.memoc/.pending')).length, 1);
  });
});

test('init registers a user-local memoc launcher for unix shells', () => {
  withTempProject(dir => {
    const home = path.join(dir, 'fake home');
    const userBin = path.join(home, '.local', 'bin');
    fs.mkdirSync(home, { recursive: true });

    execFileSync(process.execPath, [cliPath, 'init'], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        MEMOC_PLATFORM: 'linux',
        MEMOC_USER_BIN_DIR: userBin,
        MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
      },
    });

    assert.ok(fs.existsSync(path.join(userBin, 'memoc')));
    const profile = fs.readFileSync(path.join(home, '.profile'), 'utf8');
    assert.match(profile, /MEMOC_BIN=/);
    assert.match(profile, /fake home/);
  });
});

test('search stays memory-scoped while grep finds source code matches', () => {
  withTempProject(dir => {
    const srcDir = path.join(dir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'particles.cpp'),
      'void GetParticles() { /* renderer shader */ }\n',
      'utf8'
    );
    fs.mkdirSync(path.join(dir, '.memoc'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.memoc', 'session-summary.md'), '- GetParticles memory note\n', 'utf8');

    const memoryOutput = execFileSync(process.execPath, [cliPath, 'search', 'GetParticles', '--snippets', '--limit', '5'], {
      cwd: dir,
      encoding: 'utf8',
    });
    const projectOutput = execFileSync(process.execPath, [cliPath, 'grep', 'GetParticles', '--snippets', '--limit', '5'], {
      cwd: dir,
      encoding: 'utf8',
    });

    assert.match(memoryOutput, /\.memoc[\\/]session-summary\.md:1/);
    assert.doesNotMatch(memoryOutput, /src[\\/]particles\.cpp/);
    assert.match(projectOutput, /src[\\/]particles\.cpp:1/);
    assert.doesNotMatch(projectOutput, /\.memoc[\\/]session-summary\.md/);
    assert.match(projectOutput, /GetParticles/);
  });
});

test('init creates an Obsidian-friendly connected wiki scaffold', () => {
  withTempProject(dir => {
    execFileSync(process.execPath, [cliPath, 'init'], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        MEMOC_SKIP_PATH_REGISTER: '1',
        MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
        MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
      },
    });

    const wikiIndex = fs.readFileSync(path.join(dir, '.memoc', 'wiki', 'index.md'), 'utf8');
    const projectWiki = fs.readFileSync(path.join(dir, '.memoc', 'wiki', 'project', 'README.md'), 'utf8');
    const knowledgeWiki = fs.readFileSync(path.join(dir, '.memoc', 'wiki', 'knowledge', 'README.md'), 'utf8');
    const topics = fs.readFileSync(path.join(dir, '.memoc', 'wiki', 'knowledge', 'topics', 'README.md'), 'utf8');
    const sources = fs.readFileSync(path.join(dir, '.memoc', 'wiki', 'knowledge', 'sources.md'), 'utf8');
    const agentIndex = fs.readFileSync(path.join(dir, '.memoc', '00-agent-index.md'), 'utf8');
    const skill = fs.readFileSync(path.join(dir, 'skills', 'project-memory-maintainer', 'SKILL.md'), 'utf8');
    const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
    const usage = fs.readFileSync(path.join(dir, '.memoc', 'memoc-usage.md'), 'utf8');

    assert.match(wikiIndex, /^---\nmemoc: true\n/m);
    assert.match(wikiIndex, /  - memoc\/wiki/);
    assert.match(projectWiki, /  - memoc\/project-wiki/);
    assert.match(knowledgeWiki, /  - memoc\/knowledge-wiki/);
    assert.match(topics, /  - memoc\/topic/);
    assert.match(agentIndex, /  - memoc\/core/);
    assert.match(wikiIndex, /\[Project Wiki\]\(project\/README\.md\)/);
    assert.match(wikiIndex, /\[Knowledge Wiki\]\(knowledge\/README\.md\)/);
    assert.match(wikiIndex, /\[Agent Index\]\(\.\.\/00-agent-index\.md\)/);
    assert.match(topics, /\[Knowledge Wiki\]\(\.\.\/README\.md\)/);
    assert.match(topics, /Avoid orphan pages/);
    assert.match(sources, /\[Open Questions\]\(questions\.md\)/);
    assert.match(agentIndex, /\[Wiki Lint\]\(wiki\/knowledge\/lint\.md\)/);
    assert.match(skill, /Keep the wiki graph connected/);
    assert.match(skill, /relative Markdown links/);
    assert.match(agents, /run `memoc update` first/);
    assert.match(usage, /applies Obsidian frontmatter tags/);
    assert.match(skill, /Obsidian tags are current/);
  });
});

test('upgrade refreshes default wiki scaffold links without overwriting user wiki pages', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });

    fs.writeFileSync(
      path.join(dir, '.memoc', 'wiki', 'index.md'),
      [
        '# Wiki Index',
        '',
        'Persistent LLM-maintained project wiki.',
        '',
        '## Pages',
        '',
        '_None yet._',
        '',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      path.join(dir, '.memoc', 'wiki', 'glossary.md'),
      [
        '# Glossary',
        '',
        '## Terms',
        '',
        '- User-owned term should stay.',
        '',
        '## Related',
        '',
        '- [Wiki Index](index.md)',
        '',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      path.join(dir, '.memoc', 'wiki', 'sources.md'),
      [
        '# Sources',
        '',
        '## Source Records',
        '',
        '_No sources recorded yet._',
        '',
        '## Related',
        '',
        '- [Wiki Index](index.md)',
        '- [Raw Sources](../raw/README.md)',
        '',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      path.join(dir, '.memoc', 'wiki', 'knowledge', 'global', 'README.md'),
      [
        '# Global',
        '',
        '## Related',
        '',
        '- [Wiki Index](../index.md)',
        '- [Project Brief](../../00-project-brief.md)',
        '- [Project Rules](../../06-project-rules.md)',
        '',
      ].join('\n'),
      'utf8'
    );
    for (const name of ['sources', 'topics', 'global']) {
      fs.mkdirSync(path.join(dir, '.memoc', 'wiki', name), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.memoc', 'wiki', name, 'README.md'),
        [
          `# ${name[0].toUpperCase()}${name.slice(1)}`,
          '',
          name === 'sources' ? 'Provenance records for conversations, URLs, docs, and issues.' : '',
          name === 'topics' ? 'Synthesized topic pages that compound knowledge across sessions.' : '',
          name === 'global' ? 'Project-wide principles, positioning, and long-lived direction.' : '',
          '',
          '## Related',
          '',
          '- [Wiki Index](../index.md)',
          '',
        ].join('\n'),
        'utf8'
      );
    }
    fs.writeFileSync(
      path.join(dir, '.memoc', 'raw', 'README.md'),
      [
        '# Raw Sources',
        '',
        '- Source records under [wiki/sources](../wiki/sources/README.md) summarize raw material.',
        '',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      path.join(dir, '.memoc', 'raw', 'files', 'README.md'),
      [
        '# Raw Files',
        '',
        '## Related',
        '',
        '- [Source Records](../../wiki/sources/README.md)',
        '',
      ].join('\n'),
      'utf8'
    );

    execFileSync(process.execPath, [cliPath, 'upgrade'], { cwd: dir, encoding: 'utf8', env });

    const wikiIndex = fs.readFileSync(path.join(dir, '.memoc', 'wiki', 'index.md'), 'utf8');
    const glossary = fs.readFileSync(path.join(dir, '.memoc', 'wiki', 'knowledge', 'glossary.md'), 'utf8');
    const sources = fs.readFileSync(path.join(dir, '.memoc', 'wiki', 'knowledge', 'sources.md'), 'utf8');
    const global = fs.readFileSync(path.join(dir, '.memoc', 'wiki', 'knowledge', 'global', 'README.md'), 'utf8');
    const rawReadme = fs.readFileSync(path.join(dir, '.memoc', 'raw', 'README.md'), 'utf8');
    const rawFiles = fs.readFileSync(path.join(dir, '.memoc', 'raw', 'files', 'README.md'), 'utf8');

    assert.match(wikiIndex, /## Wiki Layers/);
    assert.match(wikiIndex, /\[Knowledge Wiki\]\(knowledge\/README\.md\)/);
    assert.match(glossary, /^---\nmemoc: true\n/m);
    assert.match(glossary, /  - memoc\/glossary/);
    assert.match(glossary, /User-owned term should stay/);
    assert.match(glossary, /\[Wiki Index\]\(\.\.\/index\.md\)/);
    assert.match(sources, /\[Wiki Index\]\(\.\.\/index\.md\)/);
    assert.match(sources, /\[Raw Sources\]\(\.\.\/\.\.\/raw\/README\.md\)/);
    assert.match(global, /\[Wiki Index\]\(\.\.\/\.\.\/index\.md\)/);
    assert.match(global, /\[Project Brief\]\(\.\.\/\.\.\/\.\.\/00-project-brief\.md\)/);
    assert.match(global, /\[Project Rules\]\(\.\.\/\.\.\/\.\.\/06-project-rules\.md\)/);
    assert.equal(fs.existsSync(path.join(dir, '.memoc', 'wiki', 'glossary.md')), false);
    assert.equal(fs.existsSync(path.join(dir, '.memoc', 'wiki', 'sources.md')), false);
    assert.equal(fs.existsSync(path.join(dir, '.memoc', 'wiki', 'sources')), false);
    assert.equal(fs.existsSync(path.join(dir, '.memoc', 'wiki', 'topics')), false);
    assert.equal(fs.existsSync(path.join(dir, '.memoc', 'wiki', 'global')), false);
    assert.match(rawReadme, /\[wiki\/sources\]\(\.\.\/wiki\/knowledge\/sources\/README\.md\)/);
    assert.match(rawFiles, /\[Source Records\]\(\.\.\/\.\.\/wiki\/knowledge\/sources\/README\.md\)/);
  });
});

test('wiki operations scaffold raw sources, source records, notes, and lint report', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });

    const docPath = path.join(dir, 'design-note.md');
    fs.writeFileSync(docPath, '# Renderer Design\n\nThe renderer has a staged pipeline.\n', 'utf8');

    const ingestOutput = execFileSync(process.execPath, [cliPath, 'ingest', 'design-note.md'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    assert.match(ingestOutput, /memoc ingest/);
    assert.match(ingestOutput, /\.memoc\/wiki\/knowledge\/sources\/\d{4}-\d{2}-\d{2}-renderer-design\.md/);

    const sourceFiles = fs.readdirSync(path.join(dir, '.memoc', 'wiki', 'knowledge', 'sources'))
      .filter(f => f.endsWith('renderer-design.md'));
    assert.equal(sourceFiles.length, 1);
    const sourceRecord = fs.readFileSync(path.join(dir, '.memoc', 'wiki', 'knowledge', 'sources', sourceFiles[0]), 'utf8');
    assert.match(sourceRecord, /type: wiki/);
    assert.match(sourceRecord, /status: needs-synthesis/);
    assert.match(sourceRecord, /  - memoc\/source/);
    assert.match(sourceRecord, /\[raw file\]\(\.\.\/\.\.\/\.\.\/raw\/files\//);

    const rawFiles = fs.readdirSync(path.join(dir, '.memoc', 'raw', 'files'))
      .filter(f => f.endsWith('renderer-design.md'));
    assert.equal(rawFiles.length, 1);

    const noteOutput = execFileSync(process.execPath, [cliPath, 'note', 'Renderer pipeline findings', '--body', 'Pipeline knowledge should persist.'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    assert.match(noteOutput, /memoc note/);
    const topic = fs.readFileSync(path.join(dir, '.memoc', 'wiki', 'knowledge', 'topics', 'renderer-pipeline-findings.md'), 'utf8');
    assert.match(topic, /  - memoc\/topic/);
    assert.match(topic, /Pipeline knowledge should persist/);

    const lintOutput = execFileSync(process.execPath, [cliPath, 'lint-wiki'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    assert.match(lintOutput, /memoc lint-wiki/);
    const lint = fs.readFileSync(path.join(dir, '.memoc', 'wiki', 'knowledge', 'lint.md'), 'utf8');
    assert.match(lint, /## Graph Checks/);
    assert.match(lint, /Last checked:/);

    const index = fs.readFileSync(path.join(dir, '.memoc', 'wiki', 'index.md'), 'utf8');
    assert.match(index, /Renderer Design/);
    assert.match(index, /Renderer pipeline findings/);
  });
});

test('memory search skips raw ingested material but finds source summaries', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });
    fs.writeFileSync(path.join(dir, 'raw-secret.md'), '# Raw Only\n\nneedle-raw-only\n', 'utf8');
    execFileSync(process.execPath, [cliPath, 'ingest', 'raw-secret.md'], { cwd: dir, encoding: 'utf8', env });

    const output = execFileSync(process.execPath, [cliPath, 'search', 'needle-raw-only', '--snippets', '--limit', '5'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    assert.doesNotMatch(output, /\.memoc[\\/]raw[\\/]files/);
    assert.match(output, /No matches found/);
  });
});

test('memory search stops early on low-priority worklog scans instead of hanging', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
      MEMOC_SEARCH_TIMEOUT_MS: '1',
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });

    const worklogDir = path.join(dir, '.memoc', 'worklog', 'tester', '2026-06');
    fs.mkdirSync(worklogDir, { recursive: true });
    for (let i = 0; i < 400; i++) {
      fs.writeFileSync(
        path.join(worklogDir, `20260605T2100-${String(i).padStart(4, '0')}.md`),
        `# Worklog ${i}\n\nneedle-only-in-worklog\n${'x'.repeat(4000)}\n`,
        'utf8'
      );
    }

    const output = execFileSync(process.execPath, [cliPath, 'search', 'needle-only-in-worklog', '--snippets', '--limit', '5'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });

    assert.match(output, /Search stopped early after scanning higher-priority memory files/);
  });
});

test('trim-summary archives oversized startup summary and rewrites compact snapshot', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });

    const summaryPath = path.join(dir, '.memoc', 'session-summary.md');
    fs.writeFileSync(
      summaryPath,
      [
        '# Session Summary',
        'Last: old',
        '',
        '## Status',
        ...Array.from({ length: 12 }, (_, i) => `- status detail ${i} ${'x'.repeat(120)}`),
        '',
        '## Changed',
        ...Array.from({ length: 8 }, (_, i) => `- changed detail ${i} ${'y'.repeat(120)}`),
        '',
        '## Open Tasks',
        '- task one',
        '',
        '## Resume',
        '- resume here',
        '',
      ].join('\n'),
      'utf8'
    );

    const output = execFileSync(process.execPath, [cliPath, 'trim-summary'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });

    const compact = fs.readFileSync(summaryPath, 'utf8');
    const archive = fs.readFileSync(path.join(dir, '.memoc', 'session-summary-archive.md'), 'utf8');

    assert.match(output, /memoc trim-summary/);
    assert.ok(Buffer.byteLength(compact, 'utf8') < 800);
    assert.equal((compact.match(/status detail/g) || []).length, 2);
    assert.equal((compact.match(/changed detail/g) || []).length, 2);
    assert.match(archive, /status detail 11/);
    assert.match(archive, /archived summary/);
  });
});

test('upgrade automatically trims oversized session summary', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });

    const summaryPath = path.join(dir, '.memoc', 'session-summary.md');
    const noisyBullets = Array.from({ length: 12 }, (_, i) => `- update detail ${i} ${'x'.repeat(120)}`).join('\n');
    fs.writeFileSync(summaryPath, `# Session Summary\n\n## Status\n${noisyBullets}\n\n## Open Tasks\n- keep task\n`, 'utf8');

    const output = execFileSync(process.execPath, [cliPath, 'upgrade'], { cwd: dir, encoding: 'utf8', env });
    const compact = fs.readFileSync(summaryPath, 'utf8');
    const archive = fs.readFileSync(path.join(dir, '.memoc', 'session-summary-archive.md'), 'utf8');

    assert.match(output, /session-summary\.md \(trimmed/);
    assert.ok(Buffer.byteLength(compact, 'utf8') < 800);
    assert.equal((compact.match(/update detail/g) || []).length, 2);
    assert.match(archive, /update detail 11/);
    assert.match(compact, /memoc\/state/);
  });
});

test('compress trims startup memory, archives legacy log, and refreshes activity indexes', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });
    execFileSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
    execFileSync(process.execPath, [cliPath, 'actor', 'set', 'neneee'], { cwd: dir, encoding: 'utf8', env });

    const summaryPath = path.join(dir, '.memoc', 'session-summary.md');
    fs.writeFileSync(summaryPath, `# Session Summary\n\n## Status\n${Array.from({ length: 10 }, (_, i) => `- noisy status ${i} ${'x'.repeat(120)}`).join('\n')}\n`, 'utf8');
    fs.writeFileSync(path.join(dir, '.memoc', 'log.md'), '# Project Log\n\n## old\n- legacy history\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'src.js'), 'console.log("changed");\n', 'utf8');
    execFileSync(process.execPath, [cliPath, 'work', 'Compression check', '--from-git'], { cwd: dir, encoding: 'utf8', env });

    const output = execFileSync(process.execPath, [cliPath, 'compress'], { cwd: dir, encoding: 'utf8', env });
    const compact = fs.readFileSync(summaryPath, 'utf8');

    assert.match(output, /memoc compress/);
    assert.match(output, /Startup\s+~/);
    assert.ok(Buffer.byteLength(compact, 'utf8') < 800);
    assert.equal(fs.existsSync(path.join(dir, '.memoc', 'log.md')), false);
    assert.match(fs.readFileSync(path.join(dir, '.memoc', 'raw', 'legacy-log.md'), 'utf8'), /legacy history/);
    assert.match(fs.readFileSync(path.join(dir, '.memoc', 'activity.md'), 'utf8'), /Compression check/);
    assert.match(fs.readFileSync(path.join(dir, '.memoc', 'worklog', 'README.md'), 'utf8'), /Compression check/);
  });
});

test('doctor ignores summary archive frontmatter fences', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });
    fs.writeFileSync(
      path.join(dir, '.memoc', 'session-summary-archive.md'),
      '# Session Summary Archive\n\n---\nmemoc: true\n---\n# Old Summary\n',
      'utf8'
    );

    const output = execFileSync(process.execPath, [cliPath, 'doctor'], { cwd: dir, encoding: 'utf8', env });

    assert.doesNotMatch(output, /session-summary-archive\.md may have nested frontmatter/);
  });
});

test('upgrade merges memoc metadata into BOM frontmatter without duplicating YAML blocks', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    const skillPath = path.join(dir, 'skills', 'project-memory-maintainer', 'SKILL.md');
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(
      skillPath,
      '\uFEFF---\nname: project-memory-maintainer\ndescription: Existing skill.\n---\n\n# Existing Skill\n',
      'utf8'
    );

    execFileSync(process.execPath, [cliPath, 'upgrade'], { cwd: dir, encoding: 'utf8', env });

    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.equal((skill.match(/^---$/gm) || []).length, 2);
    assert.match(skill, /name: project-memory-maintainer/);
    assert.match(skill, /memoc: true/);
    assert.match(skill, /  - memoc\/skill/);
    assert.doesNotMatch(skill, /\uFEFF/);
  });
});

test('upgrade repairs nested frontmatter produced by older BOM handling', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    const skillPath = path.join(dir, 'skills', 'project-memory-maintainer', 'SKILL.md');
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(
      skillPath,
      [
        '---',
        'memoc: true',
        'type: skill',
        'tags:',
        '  - memoc',
        '---',
        '\uFEFF---',
        'name: project-memory-maintainer',
        'description: Existing skill.',
        '---',
        '',
        '# Existing Skill',
        '',
      ].join('\n'),
      'utf8'
    );

    execFileSync(process.execPath, [cliPath, 'upgrade'], { cwd: dir, encoding: 'utf8', env });

    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.equal((skill.match(/^---$/gm) || []).length, 2);
    assert.match(skill, /name: project-memory-maintainer/);
    assert.match(skill, /description: Maintain this project's LLM-wiki memory files/);
    assert.match(skill, /  - memoc\/skill/);
    assert.doesNotMatch(skill, /\uFEFF/);
  });
});

test('actor commands use local override and work creates conflict-light activity files', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });
    execFileSync('git', ['init'], { cwd: dir, encoding: 'utf8' });

    execFileSync(process.execPath, [cliPath, 'actor', 'set', 'neneee'], { cwd: dir, encoding: 'utf8', env });
    const actorOutput = execFileSync(process.execPath, [cliPath, 'actor'], { cwd: dir, encoding: 'utf8', env });
    assert.match(actorOutput, /Actor\s+neneee/);
    assert.match(actorOutput, /\.memoc\/local\/actor/);
    assert.equal(fs.readFileSync(path.join(dir, '.memoc', 'local', 'actor'), 'utf8').trim(), 'neneee');
    assert.match(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8'), /\.memoc\/local\//);

    fs.writeFileSync(path.join(dir, 'src.js'), 'console.log("changed");\n', 'utf8');
    const workOutput = execFileSync(process.execPath, [cliPath, 'work', 'Auth refresh fix', '--from-git', '--body', 'Fixed token refresh state.'], {
      cwd: dir,
      encoding: 'utf8',
      env,
    });
    assert.match(workOutput, /Actor\s+neneee/);
    assert.match(workOutput, /\.memoc\/worklog\/neneee\/\d{4}-\d{2}\//);

    const actorDirs = fs.readdirSync(path.join(dir, '.memoc', 'worklog')).filter(name => name === 'neneee');
    assert.equal(actorDirs.length, 1);
    const monthDirs = fs.readdirSync(path.join(dir, '.memoc', 'worklog', 'neneee')).filter(name => /^\d{4}-\d{2}$/.test(name));
    assert.equal(monthDirs.length, 1);
    const entries = fs.readdirSync(path.join(dir, '.memoc', 'worklog', 'neneee', monthDirs[0])).filter(name => name.includes('auth-refresh-fix'));
    assert.equal(entries.length, 1);
    const work = fs.readFileSync(path.join(dir, '.memoc', 'worklog', 'neneee', monthDirs[0], entries[0]), 'utf8');
    assert.match(work, /type: worklog/);
    assert.match(work, /  - memoc\/worklog/);
    assert.match(work, /actor: neneee/);
    assert.match(work, /Fixed token refresh state/);
    assert.match(work, /`src\.js`/);

    const actorProfile = fs.readFileSync(path.join(dir, '.memoc', 'actors', 'neneee.md'), 'utf8');
    assert.match(actorProfile, /type: actor/);
    assert.match(actorProfile, /  - memoc\/actor/);

    const activity = execFileSync(process.execPath, [cliPath, 'activity', '--write'], { cwd: dir, encoding: 'utf8', env });
    assert.match(activity, /Auth refresh fix/);
    assert.match(activity, /neneee/);
    assert.match(fs.readFileSync(path.join(dir, '.memoc', 'activity.md'), 'utf8'), /Auth refresh fix/);
    assert.match(fs.readFileSync(path.join(dir, '.memoc', 'worklog', 'README.md'), 'utf8'), /Auth refresh fix/);
  });
});

test('actor falls back to git config when local actor is unset', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
      MEMOC_ACTOR: '',
    };
    execFileSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
    execFileSync('git', ['config', 'user.name', 'Jane Doe'], { cwd: dir, encoding: 'utf8' });
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });

    const actorOutput = execFileSync(process.execPath, [cliPath, 'actor'], { cwd: dir, encoding: 'utf8', env });
    assert.match(actorOutput, /Actor\s+jane-doe/);
    assert.match(actorOutput, /git config user\.name/);
  });
});

test('doctor reports oversized summaries and user-specific wrapper paths', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });
    fs.writeFileSync(path.join(dir, '.memoc', 'session-summary.md'), `# Session Summary\n\n${'x'.repeat(1000)}\n`, 'utf8');
    fs.writeFileSync(path.join(dir, '.memoc', 'bin', 'memoc'), "#!/bin/sh\nexec node '/Users/neneee/.local/share/memoc/runtime/bin/cli.js' \"$@\"\n", 'utf8');

    const output = execFileSync(process.execPath, [cliPath, 'doctor'], { cwd: dir, encoding: 'utf8', env });
    assert.match(output, /session-summary\.md exceeds 800B/);
    assert.match(output, /user-specific runtime path/);
  });
});

test('doctor reports missing project-local wrappers', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });
    fs.rmSync(path.join(dir, '.memoc', 'bin'), { recursive: true, force: true });

    const output = execFileSync(process.execPath, [cliPath, 'doctor'], { cwd: dir, encoding: 'utf8', env });

    assert.match(output, /Missing \.memoc[\\/]bin[\\/]memoc; run memoc upgrade/);
    assert.match(output, /Missing \.memoc[\\/]bin[\\/]memoc\.cmd; run memoc upgrade/);
    assert.match(output, /Missing \.memoc[\\/]bin[\\/]memoc\.ps1; run memoc upgrade/);
  });
});

test('doctor reports non-executable sh wrapper and upgrade repairs it', () => {
  withTempProject(dir => {
    const env = {
      ...process.env,
      MEMOC_SKIP_PATH_REGISTER: '1',
      MEMOC_USER_BIN_DIR: path.join(dir, 'fake-user-bin'),
      MEMOC_RUNTIME_DIR: path.join(dir, 'fake-runtime'),
    };
    execFileSync(process.execPath, [cliPath, 'init'], { cwd: dir, encoding: 'utf8', env });
    const wrapperPath = path.join(dir, '.memoc', 'bin', 'memoc');

    if (process.platform !== 'win32') {
      fs.chmodSync(wrapperPath, 0o644);
      const brokenOutput = execFileSync(process.execPath, [cliPath, 'doctor'], { cwd: dir, encoding: 'utf8', env });
      assert.match(brokenOutput, /\.memoc[\\/]bin[\\/]memoc is not executable; run memoc upgrade/);
    }

    execFileSync(process.execPath, [cliPath, 'upgrade'], { cwd: dir, encoding: 'utf8', env });
    if (process.platform !== 'win32') assert.ok(fs.statSync(wrapperPath).mode & 0o111);

    const output = execFileSync(process.execPath, [cliPath, 'doctor'], { cwd: dir, encoding: 'utf8', env });
    assert.doesNotMatch(output, /Missing \.memoc[\\/]bin[\\/]memoc|not executable/);
  });
});
