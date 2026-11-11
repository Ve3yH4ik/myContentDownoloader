import { test, expect, _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('desktop: download, inspect, save and reopen project', async () => {
  const html = await readFile('examples/catalog.html');
  const server = createServer((req,res)=>{ if (req.url !== '/slow') res.end(html); });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture address');
  const data = await mkdtemp(join(tmpdir(),'udd-ui-'));
  const app = await electron.launch({ args:['.',`--user-data-dir=${data}`] });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading',{name:'Майстерня даних'})).toBeVisible();
    await page.getByLabel('URL',{exact:true}).fill(`http://127.0.0.1:${address.port}`);
    await page.getByRole('button',{name:'▶ Запустити'}).click();
    await expect(page.getByRole('status')).toContainText('Завершено · 2 рядків');
    await expect(page.getByRole('cell',{name:'120.50',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Трасування',exact:true}).click();
    await expect(page.locator('pre')).toContainText('120.50 UAH');
    await page.getByRole('button',{name:'Зберегти проєкт'}).click();
    await expect(page.getByRole('status')).toContainText('Збережено версію');
    await page.getByLabel('URL',{exact:true}).fill('https://example.com');
    await page.getByRole('button',{name:'Відкрити',exact:true}).click();
    await expect(page.getByLabel('URL',{exact:true})).toHaveValue(`http://127.0.0.1:${address.port}`);
    await page.getByRole('button',{name:'▶ Запустити'}).click();
    await expect(page.getByRole('status')).toContainText('Завершено · 2 рядків');
    await page.getByRole('button',{name:'Таблиця',exact:true}).click();
    await page.screenshot({path:'test-results/desktop.png'});
    await page.getByLabel('URL',{exact:true}).fill(`http://127.0.0.1:${address.port}/slow`);
    await page.getByRole('button',{name:'▶ Запустити'}).click();
    await expect(page.getByRole('button',{name:'■ Зупинити'})).toBeEnabled();
    await page.getByRole('button',{name:'■ Зупинити'}).click();
    await expect(page.getByRole('status')).toContainText('Run stopped');
    await expect(page.getByRole('button',{name:'▶ Запустити'})).toBeEnabled();
  } finally {
    await app.close(); server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(data,{recursive:true,force:true});
  }
});
