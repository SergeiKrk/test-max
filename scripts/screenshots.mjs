import { chromium } from 'playwright';
import { expect } from 'playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { log } from 'node:console';

const output = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const baseURL = process.env.SCREENSHOT_URL || 'http://127.0.0.1:5201';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  let replyPending = false;
  let acknowledged = false;
  let sends = 0;
  await page.route('https://3100.api.green-api.com/**', async (route) => {
    const operation = new URL(route.request().url()).pathname.split('/')[2];
    const json = (body) => route.fulfill({ status: 200, json: body });
    switch (operation) {
      case 'getStateInstance': return json({ stateInstance: 'authorized' });
      case 'checkAccount': return json({ exist: true, chatId: '12345678' });
      case 'sendMessage':
        sends++;
        replyPending = true;
        return json({ idMessage: `demo-sent-${sends}` });
      case 'receiveNotification':
        await new Promise((resolve) => setTimeout(resolve, 200));
        return json(replyPending && !acknowledged ? {
          receiptId: 1,
          body: {
            typeWebhook: 'incomingMessageReceived',
            instanceData: { idInstance: 1234567890 },
            idMessage: 'demo-reply', timestamp: Math.floor(Date.now() / 1000),
            senderData: { chatType: 'user', chatId: '12345678', senderName: 'Демо-контакт' },
            messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет! Сообщение получил, всё работает.' } },
          },
        } : null);
      case 'deleteNotification': acknowledged = true; return json({ result: true });
      default: throw new Error(`Unexpected API operation: ${operation}`);
    }
  });
  await page.goto(baseURL);
  await page.getByLabel('idInstance').waitFor();
  await page.locator('[data-decoration] img').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
  await page.screenshot({ path: `${output}/connection-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/connection-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByLabel('idInstance').fill('1234567890');
  await page.getByLabel('apiTokenInstance').fill('demo-token-not-real');
  await page.getByRole('button', { name: 'Подключиться', exact: true }).click();
  await page.getByLabel('Номер телефона').fill('+7 999 000-00-01');
  await page.getByRole('button', { name: 'Создать чат' }).click();
  await page.getByLabel('Сообщение').fill('Привет! Проверяю чат через GREEN-API.');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await page.getByText('Привет! Сообщение получил, всё работает.', { exact: true }).waitFor();
  await page.getByLabel('Сообщение').fill('Отлично, спасибо!');
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await page.getByLabel('Сообщения', { exact: true }).getByText('Отлично, спасибо!', { exact: true }).waitFor();
  await expect(page.getByLabel('Сообщение', { exact: true })).toHaveValue('');
  await page.screenshot({ path: `${output}/chat-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/chat-mobile.png`, fullPage: true });
  log(`Saved four screenshots to ${output}. All API responses and credentials are synthetic.`);
} finally {
  await browser.close();
}
