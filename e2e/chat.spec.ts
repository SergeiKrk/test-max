import { expect, test } from 'playwright/test';

const idInstance = '1234567890';
const token = 'test-token-only';
const chatId = '98765432';

test('connects, sends text, receives and acknowledges a reply', async ({ page }) => {
  let messageSent = false;
  let receiveRequests = 0;
  let deletes = 0;
  let sends = 0;
  const sentTexts: string[] = [];
  const longText = `${'Длинныйтекст'.repeat(24)}\nВторая строка сообщения`;

  await page.route('https://3100.api.green-api.com/**', async (route) => {
    const request = route.request();
    const operation = new URL(request.url()).pathname.split('/')[2];
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const fulfill = (body: unknown) => route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(body) });
    switch (operation) {
      case 'getStateInstance':
        await fulfill({ stateInstance: 'authorized' });
        break;
      case 'checkAccount':
        expect(request.postDataJSON()).toEqual({ phoneNumber: 79991234567 });
        await fulfill({ exist: true, chatId });
        break;
      case 'sendMessage':
        expect(request.postDataJSON()).toMatchObject({ chatId });
        sentTexts.push(request.postDataJSON().message as string);
        sends += 1;
        await fulfill({ idMessage: `sent-${sends}` });
        messageSent = true;
        break;
      case 'receiveNotification':
        receiveRequests += 1;
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (messageSent && deletes === 0) {
          await fulfill({
            receiptId: 101,
            body: {
              typeWebhook: 'incomingMessageReceived',
              instanceData: { idInstance: Number(idInstance) },
              idMessage: 'reply-1',
              timestamp: 1_760_000_000,
              senderData: { chatType: 'user', chatId },
              messageData: {
                typeMessage: 'textMessage',
                textMessageData: { textMessage: `${'Длинныйтекст'.repeat(24)}\nТестовый ответ` },
              },
            },
          });
        } else {
          await fulfill(null);
        }
        break;
      case 'deleteNotification':
        expect(request.method()).toBe('DELETE');
        expect(new URL(request.url()).pathname.endsWith('/101')).toBe(true);
        deletes += 1;
        await fulfill({ result: true });
        break;
      default:
        throw new Error(`Unexpected mocked operation: ${operation}`);
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByLabel('idInstance').fill(idInstance);
  await page.getByLabel('apiTokenInstance').fill(token);
  await page.getByRole('button', { name: 'Подключиться' }).click();
  await page.getByLabel('Номер телефона').fill('+7 999 123-45-67');
  await page.getByRole('button', { name: 'Создать чат' }).click();
  await page.getByLabel('Сообщение').fill('Проверка отправки');
  await page.getByRole('button', { name: 'Отправить' }).click();
  await expect(page.getByText('Принято API')).toBeVisible();
  await expect(page.getByText('Доставлено')).toHaveCount(0);
  await expect.poll(() => deletes).toBe(1);
  expect(receiveRequests).toBeGreaterThan(0);
  await expect(page.getByText('Тестовый ответ')).toBeVisible();
  await expect.poll(() => deletes).toBe(1);
  expect(sends).toBe(1);
  await expect(page.getByRole('button', { name: 'Повторить отправку' })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(token);

  await page.getByLabel('Сообщение').fill(longText);
  await page.getByRole('button', { name: 'Отправить' }).click();
  const longOutgoing = page.getByRole('listitem').filter({ hasText: longText });
  await expect(longOutgoing).toBeVisible();
  await expect(longOutgoing.getByText('Вторая строка сообщения')).toBeVisible();
  expect(sentTexts).toEqual(['Проверка отправки', longText]);

  const desktopLayout = await page.locator('section[aria-label="Чат GREEN-API"]').evaluate((element) => {
    const bounds = (selector: string) => {
      const rect = element.querySelector(selector)?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    };
    return {
      appHeader: document.querySelector('.app-header') !== null,
      rail: bounds(':scope > nav'),
      sidebar: bounds(':scope > aside'),
      conversation: bounds(':scope > main'),
      contact: bounds('nav[aria-label="Список чатов"] > button'),
      conversationHeader: bounds(':scope > main > header'),
      messageColumn: bounds('ol[aria-label="Сообщения"]'),
      bodyWidth: document.body.scrollWidth,
    };
  });
  expect(desktopLayout.appHeader).toBe(false);
  expect(desktopLayout.rail?.width).toBe(76);
  expect(desktopLayout.sidebar?.width).toBe(394);
  expect(desktopLayout.contact?.height).toBe(81);
  expect(desktopLayout.conversationHeader?.height).toBe(64);
  expect(desktopLayout.messageColumn?.width).toBe(720);
  expect(desktopLayout.bodyWidth).toBe(1440);
  await page.screenshot({ path: 'test-results/message-layout-desktop.png' });

  await page.setViewportSize({ width: 1024, height: 768 });
  const mediumLayout = await page.locator('section[aria-label="Чат GREEN-API"]').evaluate((element) => {
    const header = element.querySelector(':scope > main > header')?.getBoundingClientRect();
    const messageColumn = element.querySelector('ol[aria-label="Сообщения"]')?.getBoundingClientRect();
    return {
      headerHeight: header?.height,
      conversationWidth: element.querySelector(':scope > main')?.getBoundingClientRect().width,
      messageColumnWidth: messageColumn?.width,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(mediumLayout.headerHeight).toBe(64);
  expect(mediumLayout.conversationWidth).toBe(554);
  expect(mediumLayout.messageColumnWidth).toBe(554);
  expect(mediumLayout.documentWidth).toBe(1024);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const mobileConversation = await page.locator('section[aria-label="Чат GREEN-API"]').evaluate((element) => {
    const header = element.querySelector(':scope > main > header')?.getBoundingClientRect();
    const messageColumn = element.querySelector('ol[aria-label="Сообщения"]')?.getBoundingClientRect();
    return {
      headerHeight: header?.height,
      messageColumnWidth: messageColumn?.width,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(mobileConversation.headerHeight).toBe(64);
  expect(mobileConversation.messageColumnWidth).toBe(390);
  expect(mobileConversation.documentWidth).toBe(390);
  await page.screenshot({ path: 'test-results/message-layout-mobile.png' });
  await page.getByRole('button', { name: 'К списку чатов' }).click();
  await expect(page.getByRole('region', { name: 'Чат GREEN-API' })).toHaveAttribute('data-mobile-view', 'list');
  const mobileLayout = await page.locator('section[aria-label="Чат GREEN-API"]').evaluate((element) => {
    const rail = element.querySelector(':scope > nav')?.getBoundingClientRect();
    const sidebar = element.querySelector(':scope > aside')?.getBoundingClientRect();
    return {
      rail: rail ? { width: rail.width, height: rail.height } : null,
      sidebar: sidebar ? { width: sidebar.width, height: sidebar.height } : null,
      bodyWidth: document.documentElement.scrollWidth,
    };
  });
  expect(mobileLayout.rail).toEqual({ width: 390, height: 52 });
  expect(mobileLayout.sidebar?.width).toBe(390);
  expect(mobileLayout.bodyWidth).toBe(390);
  await page.reload();
  await expect(page.getByLabel('idInstance')).toHaveValue('');
  await expect(page.getByLabel('apiTokenInstance')).toHaveValue('');
});
