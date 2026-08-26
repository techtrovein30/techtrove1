import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('BROWSER_ERROR:', error.message));

  console.log('Navigating to http://localhost:5173/');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  console.log('Root HTML length on /:', (await page.innerHTML('#root')).length);

  console.log('Navigating to http://localhost:5173/wch1925');
  await page.goto('http://localhost:5173/wch1925', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  console.log('Root HTML length on /wch1925:', (await page.innerHTML('#root')).length);
  
  await browser.close();
})();
