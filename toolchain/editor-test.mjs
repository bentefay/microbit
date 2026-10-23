import fs from 'node:fs';
import puppeteer from 'puppeteer';
const url = process.argv[2];
if (!url?.startsWith('http://localhost:3232/')) throw new Error('Expected localhost editor URL');
const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'], userDataDir: '/tmp/chromium' });
let page;
let workspaceFailed = false;
try {
  page = await browser.newPage();
  page.on('console', message => {
    if (/falling back.*memory|workspace.*failed/i.test(message.text())) workspaceFailed = true;
    if (/error|failed|falling back/i.test(message.text())) console.log('Browser:', message.text());
  });
  page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 400) console.log('HTTP:', response.status(), response.url()); });
  page.on('pageerror', error => console.error('Browser error:', error.message));
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(resolve => setTimeout(resolve, 3000));
  await page.waitForFunction(() => typeof E !== 'undefined' && E.workspace.getHeaders().some(h => h.name === 'car'));
  await page.evaluate(async () => {
    const header = E.workspace.getHeaders().find(h => h.name === 'car');
    await E.getEditor().loadHeaderAsync(header);
  });
  await new Promise(resolve => setTimeout(resolve, 3000));
  const decompiled = await page.evaluate(async () => {
    const result = await E.compiler.decompileAsync('main.ts');
    return { success: result.success, xml: result.outfiles['main.blocks'], diagnostics: result.diagnostics };
  });
  if (!decompiled.success || !decompiled.xml?.includes('car_start_commissioning') || decompiled.xml.includes('typescript_statement')) throw new Error('Custom block decompilation failed: ' + JSON.stringify(decompiled));
  await page.waitForFunction(() => !E.getEditor().updatingEditorFile);
  await page.evaluate(() => E.getEditor().openJavaScript());
  await page.waitForFunction(() => E.getEditor().editorFile?.name === 'main.ts');
  const text = await page.evaluate(() => E.pkg.mainPkg.readFile('main.ts'));
  if (text.trim() !== 'car.startCommissioning()') throw new Error('Unexpected blocks-to-TypeScript result: ' + text);
  await page.waitForFunction(() => !E.getEditor().updatingEditorFile);
  await page.evaluate(() => E.getEditor().openBlocksAsync());
  await page.waitForFunction(() => E.getEditor().editorFile?.name === 'main.blocks');
  const result = await page.evaluate(async () => {
    const result = await E.compiler.compileAsync({ native: true });
    return { success: result.success, hex: result.outfiles['binary.hex'], diagnostics: result.diagnostics };
  });
  if (!result.success || !result.hex) throw new Error('Browser compilation failed: ' + JSON.stringify(result.diagnostics));
  await page.evaluate(() => E.getEditor().saveFileAsync());
  if (workspaceFailed) throw new Error('Filesystem workspace failed or fell back to memory');
  if (fs.readFileSync('/workspace/projects/car/main.ts', 'utf8').trim() !== text.trim()) throw new Error('Browser and repository sources differ');
  fs.writeFileSync('/workspace/built/browser-car.hex', result.hex);
  console.log('PASS: repository car loaded; custom block -> TypeScript -> blocks; native cache compile returned HEX.');
  fs.mkdirSync('/workspace/built', { recursive: true });
  await page.screenshot({ path: '/workspace/built/editor.png' });
} catch (error) {
  if (page) {
    console.error('Editor state:', await page.evaluate(() => ({file:globalThis.E?.getEditor().editorFile?.name, text:document.body.innerText.slice(-3500)})).catch(() => 'unavailable'));
    await page.screenshot({ path: '/workspace/built/editor-failure.png' });
  }
  throw error;
} finally { await browser.close(); }
