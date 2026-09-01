import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PERF = path.join(ROOT, 'tmp', 'perf');
const INPUT = path.join(PERF, 'input');
const OUTPUT = path.join(PERF, 'output');
const PUBLIC = path.join(OUTPUT, 'public');
const CLI = path.join(ROOT, 'engine', 'bin', 'cli.js');

function fmtMs(ms) {
  return ms >= 100 ? ms.toFixed(0) + 'ms' : ms >= 1 ? ms.toFixed(1) + 'ms' : (ms * 1000).toFixed(0) + 'µs';
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function timeSSR() {
  const t0 = performance.now();
  const res = spawnSync(process.execPath, [CLI, 'build', '--source', INPUT, '--output', OUTPUT, '--domain', 'https://bench.local'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const wall = performance.now() - t0;
  if (res.status !== 0) {
    throw new Error('SSR build failed:\n' + (res.stderr || res.stdout).split('\n').filter(l => /error/i.test(l)).join('\n'));
  }
  let bytes = 0;
  let files = 0;
  async function walk(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else { bytes += (await fs.stat(p)).size; files++; }
    }
  }
  await walk(PUBLIC);
  return { wall, files, bytes };
}

async function loadPage(relPage) {
  const html = await fs.readFile(path.join(PUBLIC, relPage), 'utf8');
  const dom = new JSDOM(html, { url: 'https://bench.local/' + relPage, runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  const assets = [];
  for (const m of html.matchAll(/<script src="([^"]+)"/g)) assets.push(m[1]);
  const t0 = performance.now();
  for (const src of assets) {
    const file = path.join(PUBLIC, src.replace(/^\//, ''));
    let code = await fs.readFile(file, 'utf8');
    if (path.basename(file) === 'handlebars.min.js') {
      code = code.replace(/sourceMappingURL=.*$/, '');
    }
    window.eval(code);
  }
  const bootMs = performance.now() - t0;
  if (!window.__IGNITION_STATE__) throw new Error('boot failed for ' + relPage);
  return { dom, window, bootMs };
}

function timeIt(fn, iters) {
  const runs = [];
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    fn(i);
    runs.push(performance.now() - t0);
  }
  return { median: median(runs), min: Math.min(...runs), max: Math.max(...runs) };
}

async function bootMedian(relPage, runs = 5) {
  const warm = await loadPage(relPage);
  warm.dom.window.close();
  const boots = [];
  for (let i = 0; i < runs; i++) {
    const d = await loadPage(relPage);
    boots.push(d.bootMs);
    d.dom.window.close();
  }
  return { median: median(boots), min: Math.min(...boots), max: Math.max(...boots) };
}

async function benchCSR() {
  const out = {};

  out.catalogBoot = await bootMedian('catalog/books/page/1.html');

    const { dom: d2, window: w2 } = await loadPage('catalog/books/page/1.html');
    const st = w2.__IGNITION_STATE__;
    const add = timeIt((i) => {
      st.cart.items.push({ id: 10000 + i, price: 100, name: 'Bench item ' + i });
    }, 20);
    out.cartPush = add;
    const remove = timeIt(() => {
      st.cart.items.splice(0, 1);
    }, 20);
    out.cartSplice = remove;
    d2.window.close();

  {
    out.dashboardBoot = await bootMedian('dashboard/main.html');
    const { dom, window } = await loadPage('dashboard/main.html');
    const st = window.__IGNITION_STATE__;
    const rows = st.metrics.sales;
    out.salesRows = rows.length;
    st.ui.period = 'week';
    const periodRuns = [];
    for (let i = 0; i < 12; i++) {
      const t0 = performance.now();
      st.ui.period = i % 2 ? 'week' : 'month';
      periodRuns.push(performance.now() - t0);
    }
    out.dashboardPeriodToMonth = median(periodRuns.filter((_, i) => i % 2 === 0));
    out.dashboardPeriodToWeek = median(periodRuns.filter((_, i) => i % 2 === 1));
    const fresh = () => rows.map((r, i) => ({ ...r, amount: r.amount + 1 }));
    out.dashboardReplaceSales200 = timeIt(() => {
      st.metrics.sales = fresh();
    }, 10);
    st.ui.period = 'month';
    // Fine-grained метрика: leaf-мутация одной ячейки. На блоке с
    // data-ignition-fine это точечный патч стикером без ре-рендера блока.
    out.dashboardPointUpdate = timeIt((i) => {
      st.filteredSales[i % rows.length].amount = 1000 + i;
    }, 20);
    dom.window.close();
  }

  {
    out.formBoot = await bootMedian('form/main.html');
    const { dom, window } = await loadPage('form/main.html');
    const st = window.__IGNITION_STATE__;
    const fields = Object.keys(st.form.fields);
    out.formFieldEdit = timeIt((i) => {
      st.form.fields[fields[i % fields.length]] = 'edited-' + i;
    }, 40);
    dom.window.close();
  }

  return out;
}

async function measureSizes() {
  const sizes = {};
  for (const f of ['assets/ignition-runtime.js', 'assets/handlebars.min.js', 'assets/templates.js', 'assets/controllers/catalog.js']) {
    const p = path.join(PUBLIC, f);
    try {
      sizes[f] = (await fs.stat(p)).size;
    } catch {}
  }
  const page1 = await fs.readFile(path.join(PUBLIC, 'catalog/books/page/1.html'), 'utf8');
  sizes['catalogPage1.html'] = Buffer.byteLength(page1);
  return sizes;
}

async function main() {
  const scaleArg = process.argv.indexOf('--scale');
  const scale = scaleArg > -1 ? Number(process.argv[scaleArg + 1]) || 1 : 1;
  process.env.PERF_SCALE = String(scale);

  console.log(`\n=== ignition bench (scale=${scale}) ===\n`);

  console.log('generating synthetic input...');
  const { generate } = await import('./generate.js');
  const gen = await generate(INPUT);
  console.log(`  ${gen.fileCount} files -> ${path.relative(ROOT, INPUT)}`);

  process.stdout.write('running SSR build... ');
  await fs.rm(PUBLIC, { recursive: true, force: true });
  const ssr = await timeSSR();
  console.log(fmtMs(ssr.wall));
  console.log(`  ${ssr.files} files, ${(ssr.bytes / 1024).toFixed(0)} KB output`);

  console.log('booting pages in jsdom...');
  const csr = await benchCSR();
  const sizes = await measureSizes();

  console.log('\n--- SSR ---');
  console.log(`build wall:            ${fmtMs(ssr.wall)}  (${ssr.files} files, ${(ssr.bytes / 1024 / 1024).toFixed(1)} MB)`);

  console.log('\n--- CSR boot (jsdom, median of 5) ---');
  console.log(`catalog boot:          ${fmtMs(csr.catalogBoot.median)}  (min ${fmtMs(csr.catalogBoot.min)})`);
  console.log(`dashboard boot:        ${fmtMs(csr.dashboardBoot.median)}  (min ${fmtMs(csr.dashboardBoot.min)})`);
  console.log(`form boot:             ${fmtMs(csr.formBoot.median)}  (min ${fmtMs(csr.formBoot.min)})`);

  console.log('\n--- reactivity (median per op) ---');
  const rows = [
    ['cart push (blocks re-render)', csr.cartPush],
    ['cart splice', csr.cartSplice],
    ['dashboard period -> month (all ' + (csr.salesRows ?? '?') + ' rows)', { median: csr.dashboardPeriodToMonth, min: csr.dashboardPeriodToMonth, max: csr.dashboardPeriodToMonth }],
    ['dashboard period -> week (7 rows)', { median: csr.dashboardPeriodToWeek, min: csr.dashboardPeriodToWeek, max: csr.dashboardPeriodToWeek }],
    ['dashboard sales replace (' + (csr.salesRows ?? '?') + ')', csr.dashboardReplaceSales200],
    ['dashboard point cell update', csr.dashboardPointUpdate],
    ['form field edit', csr.formFieldEdit],
  ];
  for (const [name, r] of rows) {
    if (r) console.log(`${name.padEnd(34)} ${fmtMs(r.median).padStart(10)}  (min ${fmtMs(r.min)}, max ${fmtMs(r.max)})`);
  }

  console.log('\n--- sizes ---');
  for (const [name, b] of Object.entries(sizes)) {
    console.log(`${name.padEnd(34)} ${(b / 1024).toFixed(1)} KB`);
  }

  const report = { scale, ssr, csr, sizes, date: new Date().toISOString() };
  const reportPath = path.join(PERF, 'report.json');
  await fs.mkdir(PERF, { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nreport: ${path.relative(ROOT, reportPath)}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
