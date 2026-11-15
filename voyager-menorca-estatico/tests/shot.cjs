const { chromium } = require('playwright');
const [,, base, ...pages] = process.argv;
(async () => {
  const b = await chromium.launch();
  for (const [name, vp] of [['m', { width: 390, height: 844 }], ['t', { width: 820, height: 1100 }], ['d', { width: 1440, height: 900 }]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1 });
    for (const p of pages) {
      const pg = await ctx.newPage();
      await pg.addInitScript(() => localStorage.setItem('vm_consent_v1', JSON.stringify({ analytics: false, ts: Date.now() })));
      await pg.goto(base + p, { waitUntil: 'load' });
      await pg.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } window.scrollTo(0, 0); });
      await pg.waitForTimeout(400);
      await pg.screenshot({ path: `tests/shots/${name}-${p.replace(/\W+/g, '_') || 'home'}.png`, fullPage: true });
      await pg.close();
    }
    await ctx.close();
  }
  await b.close();
})();
