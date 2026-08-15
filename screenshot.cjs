const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 1000 }
  });
  
  // Wait a bit for page to render fully
  await page.goto('http://localhost:8080/index.html');
  // scroll down
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(500); // let animations run
  
  // Find the Orchestration section and screenshot it
  const sections = await page.$$('section');
  // The orchestration section is the second to last section
  const orchSection = sections[sections.length - 2];
  await orchSection.screenshot({ path: 'orchestration-section.png' });
  console.log('Saved orchestration-section.png');
  
  // Now for ui-providers.html
  await page.goto('http://localhost:8080/ui-providers.html');
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(500);
  
  // Screenshot the main part or full page
  await page.screenshot({ path: 'ui-providers-section.png', fullPage: true });
  console.log('Saved ui-providers-section.png');

  await browser.close();
})();
