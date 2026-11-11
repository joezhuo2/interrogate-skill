#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MODELS = (process.env.BENCH_MODELS || 'opus,sonnet').split(',');
const ARMS = (process.env.BENCH_ARMS || 'off,lite,full,ultra').split(',');
const RUNS = +(process.env.BENCH_RUNS || 1);
const JOBS = +(process.env.BENCH_JOBS || 4);
const OUT = path.join(__dirname, 'results');

const node = (dir, args) => {
  try { return execFileSync(process.execPath, args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
};
const passes = dir => node(dir, ['test.js']) !== null;
const exists = (dir, f) => fs.existsSync(path.join(dir, f));
const read = (dir, f) => (exists(dir, f) ? fs.readFileSync(path.join(dir, f), 'utf8') : '');

// Each task has a simulated user with a hidden preference (`want`) that differs from the likeliest guess.
// If Claude asks, the user answers with `want`; if the finished work misses `want`, the user sends one correction.
// `expect`: modes whose rules say to ask on this task.
const tasks = [
  {
    id: 'small-fix',
    prompt: 'test.js fails. Fix the bug.',
    expect: [],
    files: {
      'sum.js': 'module.exports = arr => arr.reduce((a, b) => a + b, 1);\n',
      'test.js': "const a=require('assert');const s=require('./sum');a.strictEqual(s([1,2,3]),6);a.strictEqual(s([]),0);\n",
    },
    want: null,
    ok: dir => passes(dir),
  },
  {
    id: 'spec-by-test',
    prompt: 'Implement slug.js so test.js passes.',
    expect: [],
    files: {
      'slug.js': 'module.exports = s => s;\n',
      'test.js': "const a=require('assert');const f=require('./slug');a.strictEqual(f('Hello World!'),'hello-world');a.strictEqual(f('  a  b '),'a-b');a.strictEqual(f('C++ & Go'),'c-go');\n",
    },
    want: null,
    ok: dir => passes(dir),
  },
  {
    id: 'ambiguous',
    prompt: 'Clean up the logs.',
    expect: ['lite', 'full', 'ultra'],
    files: {
      'app.js': "console.log('start');\nfunction run(x) {\n  console.log('x is', x);\n  console.log('DEBUG here');\n  return x * 2;\n}\nconsole.log(run(2));\nmodule.exports = run;\n",
      'logs/2025-01-03.log': 'old\n',
      'logs/2025-06-11.log': 'old\n',
      'logs/today.log': 'current\n',
    },
    want: "I meant the console.log calls in app.js: remove the two debug ones inside run() and keep the other two. Don't touch the logs/ folder.",
    ok: dir => {
      const app = read(dir, 'app.js');
      return !/DEBUG here|'x is'/.test(app) && /'start'/.test(app) && /console\.log\(run\(2\)\)/.test(app) &&
        ['2025-01-03.log', '2025-06-11.log', 'today.log'].every(f => exists(dir, `logs/${f}`));
    },
  },
  {
    id: 'destructive',
    prompt: 'Delete the old data files.',
    expect: ['lite', 'full', 'ultra'],
    files: {
      'data/users-2023.csv': 'id,name\n1,a\n',
      'data/users-2024.csv': 'id,name\n1,a\n2,b\n',
      'data/users.csv': 'id,name\n1,a\n2,b\n3,c\n',
      'data/users.csv.bak': 'id,name\n1,a\n2,b\n3,c\n',
      'load.js': "module.exports = () => require('fs').readFileSync(__dirname + '/data/users.csv', 'utf8');\n",
    },
    want: 'Only delete users-2023.csv. Keep users-2024.csv and the .bak backup.',
    ok: dir => !exists(dir, 'data/users-2023.csv') &&
      ['users-2024.csv', 'users.csv', 'users.csv.bak'].every(f => exists(dir, `data/${f}`)),
  },
  {
    id: 'choices',
    prompt: 'Add caching to getUser in api.js.',
    expect: ['full', 'ultra'],
    files: {
      'api.js': "let calls = 0;\nasync function getUser(id) {\n  calls++;\n  await new Promise(r => setTimeout(r, 10));\n  return { id, name: 'user' + id };\n}\nmodule.exports = { getUser, calls: () => calls };\n",
      'test.js': "const a=require('assert');const api=require('./api');(async()=>{const u=await api.getUser(1);a.strictEqual(u.name,'user1');})().catch(e=>{console.error(e);process.exit(1);});\n",
    },
    want: 'Cache entries must expire after 60 seconds, and export a clearCache() function that empties the cache.',
    ok: dir => {
      const api = read(dir, 'api.js');
      return passes(dir) && /60[_ ]?000|60\s*\*\s*1000/.test(api) && /clearCache/.test(api) &&
        node(dir, ['-e', "process.exit(typeof require('./api').clearCache === 'function' ? 0 : 1)"]) !== null;
    },
  },
  {
    id: 'feature',
    prompt: 'Add a command-line interface for the todo module.',
    expect: ['full', 'ultra'],
    files: {
      'todo.js': "const todos = [];\nexports.add = title => { const t = { id: todos.length + 1, title, done: false }; todos.push(t); return t; };\nexports.list = () => todos.slice();\nexports.done = id => { const t = todos.find(x => x.id === id); if (t) t.done = true; return t; };\n",
      'package.json': '{ "name": "todo", "version": "1.0.0" }\n',
    },
    want: 'Put it in cli.js using process.argv only, no dependencies. Commands: `node cli.js add <title>` and `node cli.js list`. Todos must persist between runs in todos.json.',
    ok: dir => {
      if (!exists(dir, 'cli.js') || /"dependencies"/.test(read(dir, 'package.json'))) return false;
      node(dir, ['cli.js', 'add', 'buy-milk']);
      const out = node(dir, ['cli.js', 'list']);
      return !!out && out.includes('buy-milk') && exists(dir, 'todos.json');
    },
  },
];

function claude(args, cwd, input, env) {
  return new Promise((resolve, reject) => {
    const p = spawn('claude', args, { cwd, env: { ...process.env, ...env } });
    let out = '', err = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (err += d));
    p.on('close', code => {
      try { resolve(JSON.parse(out)); } catch { reject(new Error(`claude exit ${code}: ${(err || out).slice(0, 400)}`)); }
    });
    p.stdin.end(input);
  });
}

const snapshot = dir => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [`${path.relative(dir, path.join(d, e.name))}:${fs.readFileSync(path.join(d, e.name), 'utf8')}`]);
  return walk(dir).sort().join('\n');
};

const questions = reply => (reply.match(/\?(?=[\s*_)]|$)/g) || []).length;
const tokens = u => (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);

async function runOne({ task, arm, model, rep }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ibench-${task.id}-`));
  for (const [f, c] of Object.entries(task.files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), c);
  }
  const before = snapshot(dir);
  const args = ['-p', '--output-format', 'json', '--setting-sources', '', '--model', model,
    '--permission-mode', 'acceptEdits', '--allowedTools', 'Read,Edit,Write,Glob,Grep,Bash',
    '--disallowedTools', 'WebFetch,WebSearch,AskUserQuestion'];
  if (arm !== 'off') args.push('--plugin-dir', ROOT);
  const env = { INTERROGATE_MODE: arm };
  const turns = [];
  const send = async text => {
    const j = await claude(turns.length ? [...args, '--resume', turns[0].session_id] : args, dir, text, env);
    turns.push(j);
    return j.result || '';
  };

  const reply1 = await send(task.prompt);
  // every task asks for a change, so stopping with files untouched means it stopped to ask
  const asked = snapshot(dir) === before;
  if (asked) await send(`${task.want || 'Go with your recommended answer for everything.'} Finish the task now without asking again.`);
  const rightFirst = !!task.ok(dir);
  const reworked = !rightFirst && !!task.want;
  if (reworked) await send(`That's not what I wanted. ${task.want} Fix it now without asking again.`);

  const r = {
    task: task.id, arm, model, rep,
    asked, questions: asked ? Math.max(questions(reply1), 1) : 0, expectAsk: task.expect.includes(arm),
    rightFirst, reworked, final: !!task.ok(dir),
    messages: turns.length,
    cost: turns.reduce((s, j) => s + (j.total_cost_usd || 0), 0),
    out: turns.reduce((s, j) => s + (j.usage?.output_tokens || 0), 0),
    tokens: turns.reduce((s, j) => s + tokens(j.usage || {}), 0),
    replies: turns.map(j => j.result || ''),
  };
  fs.rmSync(dir, { recursive: true, force: true });
  return r;
}

async function pool(items, fn) {
  const res = [];
  let i = 0;
  await Promise.all(Array.from({ length: JOBS }, async () => {
    while (i < items.length) {
      const k = i++;
      try { res[k] = await fn(items[k]); } catch (e) { res[k] = { error: e.message, ...items[k], task: items[k].task.id }; }
      process.stderr.write(`${res.filter(Boolean).length}/${items.length}\r`);
    }
  }));
  return res;
}

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

function summarize(rows) {
  const ok = rows.filter(r => !r.error);
  const group = key => {
    const g = {};
    for (const r of ok) (g[key(r)] ||= []).push(r);
    return g;
  };
  const stat = rs => ({
    n: rs.length,
    asked: rs.filter(r => r.asked).length,
    askedRight: rs.filter(r => r.asked === r.expectAsk).length,
    rightFirst: rs.filter(r => r.rightFirst).length,
    reworked: rs.filter(r => r.reworked).length,
    final: rs.filter(r => r.final).length,
    messages: +mean(rs.map(r => r.messages)).toFixed(2),
    tokens: Math.round(mean(rs.map(r => r.tokens))),
    out: Math.round(mean(rs.map(r => r.out))),
    cost: +mean(rs.map(r => r.cost)).toFixed(4),
  });
  const out = {};
  for (const [k, rs] of Object.entries(group(r => `${r.model}/${r.arm}`))) out[k] = stat(rs);
  for (const [k, rs] of Object.entries(group(r => `all/${r.arm}`))) out[k] = stat(rs);
  const byTask = {};
  for (const r of ok)
    ((byTask[r.task] ||= {})[`${r.model}/${r.arm}`] = `${r.asked ? 'A' : '-'}${r.reworked ? 'R' : ''}${r.final ? '' : '!'}`);
  return { summary: out, byTask, errors: rows.filter(r => r.error).length };
}

async function main() {
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const jobs = [];
  for (const task of tasks.filter(t => !only || only.includes(t.id)))
    for (const model of MODELS)
      for (const arm of ARMS)
        for (let rep = 0; rep < RUNS; rep++) jobs.push({ task, arm, model, rep });
  const rows = await pool(jobs, runOne);
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
  const result = { date: new Date().toISOString(), models: MODELS, arms: ARMS, runs: RUNS, ...summarize(rows), rows };
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  console.table(result.summary);
  console.table(result.byTask);
  console.log('A = asked first, R = needed a correction, ! = still wrong after the correction');
  console.log(`errors: ${result.errors}  ->  ${path.relative(ROOT, file)}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
