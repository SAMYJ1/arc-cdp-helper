const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      args._.push(arg);
      continue;
    }
    const [key, inline] = arg.slice(2).split('=');
    if (inline !== undefined) {
      args[key] = inline;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage() {
  console.log(`
Usage:
  node scripts/arc-cdp.js tabs
  node scripts/arc-cdp.js open --url <url>
  node scripts/arc-cdp.js click --selector <css> [--title <contains>] [--url-match <contains>]
  node scripts/arc-cdp.js click-text --text <text> [--title <contains>] [--url-match <contains>]
  node scripts/arc-cdp.js type --selector <css> --text <text> [--title <contains>] [--url-match <contains>]
  node scripts/arc-cdp.js press --key <Enter|Escape|...> [--title <contains>] [--url-match <contains>]
  node scripts/arc-cdp.js eval --js <expression> [--title <contains>] [--url-match <contains>]
  node scripts/arc-cdp.js screenshot --path <file> [--title <contains>] [--url-match <contains>]
  node scripts/arc-cdp.js wait-url --url-match <contains> [--title <contains>] [--page <index>]
  node scripts/arc-cdp.js wait-new-page [--title <contains>] [--url-match <contains>]

Options:
  --endpoint <url>       CDP endpoint, default http://127.0.0.1:9222
  --title <contains>     Match page title substring
  --url-match <text>     Match page URL substring
  --page <index>         Use page index from tabs output (default first match)
  --wait <ms>            Wait after action (default 500)
  --timeout <ms>         Action timeout (default 15000)
  --path <file>          Screenshot path
  --selector <css>       CSS selector
  --text <text>          Visible text / input text
  --key <key>            Keyboard key for press
  --js <expression>      JS expression/function for eval
`);
}

async function listPages(browser) {
  const rows = [];
  for (const [ci, context] of browser.contexts().entries()) {
    const pages = context.pages();
    for (const [pi, page] of pages.entries()) {
      let title = '';
      let url = '';
      try {
        title = await page.title();
        url = page.url();
      } catch (err) {
        title = `[error: ${err.message}]`;
      }
      rows.push({ context: ci, page: pi, title, url });
    }
  }
  return rows;
}

function matchPages(pages, args) {
  let out = pages;
  if (args.title) out = out.filter((p) => p.title.includes(args.title));
  if (args['url-match']) out = out.filter((p) => p.url.includes(args['url-match']));
  return out;
}

async function resolvePage(browser, args) {
  const pages = await listPages(browser);
  const matches = matchPages(pages, args);

  if (args.page !== undefined) {
    const target = pages.find((p) => String(p.page) === String(args.page));
    if (!target) throw new Error(`No page found with index ${args.page}`);
    return browser.contexts()[target.context].pages()[target.page];
  }

  if (matches.length === 0) {
    throw new Error(`No page matched. Filters: title=${args.title || ''} url-match=${args['url-match'] || ''}`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple pages matched; refine filters or pass --page. Matches: ${JSON.stringify(matches, null, 2)}`);
  }
  const target = matches[0];
  return browser.contexts()[target.context].pages()[target.page];
}

async function waitForNewPage(context, timeout) {
  return context.waitForEvent('page', { timeout });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || ['-h', '--help', 'help'].includes(command)) {
    usage();
    process.exit(command ? 0 : 1);
  }

  const endpoint = args.endpoint || process.env.ARC_CDP_URL || 'http://127.0.0.1:9222';
  const timeout = Number(args.timeout || 15000);
  const waitMs = Number(args.wait || 500);

  const browser = await chromium.connectOverCDP(endpoint);
  try {
    if (command === 'tabs') {
      console.log(JSON.stringify({ endpoint, contexts: browser.contexts().length, pages: await listPages(browser) }, null, 2));
      return;
    }

    if (command === 'open') {
      if (!args.url) throw new Error('--url is required');
      const context = browser.contexts()[0] || await browser.newContext();
      const page = await context.newPage();
      await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout });
      await page.waitForTimeout(waitMs);
      console.log(JSON.stringify({ ok: true, title: await page.title(), url: page.url() }, null, 2));
      return;
    }

    if (command === 'wait-new-page') {
      const context = browser.contexts()[0];
      if (!context) throw new Error('No browser context found');
      const page = await waitForNewPage(context, timeout);
      await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
      console.log(JSON.stringify({ ok: true, title: await page.title(), url: page.url() }, null, 2));
      return;
    }

    const page = await resolvePage(browser, args);
    const context = page.context();
    page.setDefaultTimeout(timeout);
    await page.bringToFront();

    if (command === 'click') {
      if (!args.selector) throw new Error('--selector is required');
      const maybeNewPage = waitForNewPage(context, timeout).catch(() => null);
      await page.locator(args.selector).first().click();
      await page.waitForTimeout(waitMs);
      const newPage = await maybeNewPage;
      const result = { ok: true, action: 'click', title: await page.title(), url: page.url() };
      if (newPage) {
        await newPage.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
        result.newPage = { title: await newPage.title(), url: newPage.url() };
      }
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === 'click-text') {
      if (args.text === undefined) throw new Error('--text is required');
      const maybeNewPage = waitForNewPage(context, timeout).catch(() => null);
      await page.getByText(String(args.text), { exact: !!args.exact }).first().click();
      await page.waitForTimeout(waitMs);
      const newPage = await maybeNewPage;
      const result = { ok: true, action: 'click-text', text: String(args.text), title: await page.title(), url: page.url() };
      if (newPage) {
        await newPage.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
        result.newPage = { title: await newPage.title(), url: newPage.url() };
      }
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === 'type') {
      if (!args.selector) throw new Error('--selector is required');
      if (args.text === undefined) throw new Error('--text is required');
      const locator = page.locator(args.selector).first();
      await locator.click();
      await locator.fill(String(args.text));
      await page.waitForTimeout(waitMs);
      console.log(JSON.stringify({ ok: true, action: 'type', title: await page.title(), url: page.url() }, null, 2));
      return;
    }

    if (command === 'press') {
      if (!args.key) throw new Error('--key is required');
      const before = page.url();
      const maybeNewPage = waitForNewPage(context, timeout).catch(() => null);
      await page.keyboard.press(String(args.key));
      await page.waitForTimeout(waitMs);
      const newPage = await maybeNewPage;
      const result = { ok: true, action: 'press', key: args.key, title: await page.title(), url: page.url(), navigated: before !== page.url() };
      if (newPage) {
        await newPage.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
        result.newPage = { title: await newPage.title(), url: newPage.url() };
      }
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (command === 'wait-url') {
      if (!args['url-match']) throw new Error('--url-match is required');
      await page.waitForURL((url) => url.toString().includes(String(args['url-match'])), { timeout });
      console.log(JSON.stringify({ ok: true, title: await page.title(), url: page.url() }, null, 2));
      return;
    }

    if (command === 'eval') {
      if (!args.js) throw new Error('--js is required');
      const result = await page.evaluate(args.js);
      console.log(JSON.stringify({ ok: true, result }, null, 2));
      return;
    }

    if (command === 'screenshot') {
      const outPath = args.path || path.join(process.cwd(), 'arc-cdp-screenshot.png');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      await page.screenshot({ path: outPath, fullPage: !!args.fullPage });
      console.log(JSON.stringify({ ok: true, path: outPath, title: await page.title(), url: page.url() }, null, 2));
      return;
    }

    throw new Error(`Unknown command: ${command}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
