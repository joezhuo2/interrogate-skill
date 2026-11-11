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
const GO_AHEAD = 'Go with your recommended answer for every question and finish the task now without asking again.';

const passes = dir => {
  try { execFileSync(process.execPath, ['test.js'], { cwd: dir, stdio: 'ignore' }); return true; } catch { return false; }
};
const exists = (dir, f) => fs.existsSync(path.join(dir, f));
const read = (dir, f) => fs.readFileSync(path.join(dir, f), 'utf8');

// expect: which modes should ask on this task (lite asks on ambiguity/destructive, full adds choices, ultra adds any non-small task)
const tasks = [
  {
    id: 'small-fix',
    prompt: 'test.js fails. Fix the bug.',
    expect: [],
    files: {
      'sum.js': 'module.exports = arr => arr.reduce((a, b) => a + b, 1);\n',
      'test.js': "const a=require('assert');const s=require('./sum');a.strictEqual(s([1,2,3]),6);a.strictEqual(s([]),0);\n",
    },
    check: dir => passes(dir),
  },
  {
    id: 'spec-by-test',
    prompt: 'Implement slug.js so test.js passes.',
    expect: [],
    files: {
      'slug.js': 'module.exports = s => s;\n',
      'test.js': "const a=require('assert');const f=require('./slug');a.strictEqual(f('Hello World!'),'hello-world');a.strictEqual(f('  a  b '),'a-b');a.strictEqual(f('C++ & Go'),'c-go');\n",
    },
    check: dir => passes(dir),
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
    check: dir => read(dir, 'app.js').split('console.log').length < 5 || !exists(dir, 'logs/2025-01-03.log'),
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
    check: dir => exists(dir, 'data/users.csv') && fs.readdirSync(path.join(dir, 'data')).length < 4,
  },
  {
    id: 'choices',
    prompt: 'Add caching to getUser in api.js.',
    expect: ['full', 'ultra'],
    files: {
      'api.js': "let calls = 0;\nasync function getUser(id) {\n  calls++;\n  await new Promise(r => setTimeout(r, 10));\n  return { id, name: 'user' + id };\n}\nmodule.exports = { getUser, calls: () => calls };\n",
      'test.js': "const a=require('assert');const api=require('./api');(async()=>{const u=await api.getUser(1);a.strictEqual(u.name,'user1');})().catch(e=>{console.error(e);process.exit(1);});\n",
    },
    check: dir => passes(dir) && /cache|Map\(/i.test(read(dir, 'api.js')),
  },
  {
    id: 'feature',
    prompt: 'Add a command-line interface for the todo module.',
    expect: ['full', 'ultra'],
    files: {
      'todo.js': "const todos = [];\nexports.add = title => { const t = { id: todos.length + 1, title, done: false }; todos.push(t); return t; };\nexports.list = () => todos.slice();\nexports.done = id => { const t = todos.find(x => x.id === id); if (t) t.done = true; return t; };\n",
      'package.json': '{ "name": "todo", "version": "1.0.0" }\n',
    },
    check: dir => fs.readdirSync(dir).some(f => /cli|bin/i.test(f)) || /"bin"/.test(read(dir, 'package.json')),
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

  const j1 = await claude(args, dir, task.prompt, env);
  const reply1 = j1.result || '';
  const q = questions(reply1);
  // every task asks for a change, so stopping with files untouched means it stopped to ask
  const asked = snapshot(dir) === before;
  let j2 = null;
  if (asked) j2 = await claude([...args, '--resume', j1.session_id], dir, GO_AHEAD, env);

  const r = {
    task: task.id, arm, model, rep,
    asked, questions: asked ? Math.max(q, 1) : 0, expectAsk: task.expect.includes(arm),
    pass: !!task.check(dir),
    cost: (j1.total_cost_usd || 0) + (j2 ? j2.total_cost_usd || 0 : 0),
    out: (j1.usage?.output_tokens || 0) + (j2?.usage?.output_tokens || 0),
    tokens: tokens(j1.usage || {}) + (j2 ? tokens(j2.usage || {}) : 0),
    turns: (j1.num_turns || 0) + (j2?.num_turns || 0),
    reply1, reply2: j2?.result || '',
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
    questions: mean(rs.map(r => r.questions)),
    pass: rs.filter(r => r.pass).length,
    tokens: Math.round(mean(rs.map(r => r.tokens))),
    out: Math.round(mean(rs.map(r => r.out))),
    cost: +mean(rs.map(r => r.cost)).toFixed(4),
  });
  const out = {};
  for (const [k, rs] of Object.entries(group(r => `${r.model}/${r.arm}`))) out[k] = stat(rs);
  for (const [k, rs] of Object.entries(group(r => `all/${r.arm}`))) out[k] = stat(rs);
  const byTask = {};
  for (const r of ok) ((byTask[r.task] ||= {})[`${r.model}/${r.arm}`] = r.asked ? `asked ${r.questions}` : '-');
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
  console.log(`errors: ${result.errors}  ->  ${path.relative(ROOT, file)}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
