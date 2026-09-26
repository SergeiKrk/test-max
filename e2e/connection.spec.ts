import { expect, test } from 'playwright/test';

test('connection scene adapts without overlapping the form', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [width, height] of [[1440, 900], [1100, 700], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByLabel('idInstance')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const form = await page.locator('form').boundingBox();
    for (const item of await page.locator('[data-decoration]').all()) {
      if (!await item.isVisible()) continue;
      const rect = await item.boundingBox();
      expect(rect && form && rect.x < form.x + form.width && rect.x + rect.width > form.x && rect.y < form.y + form.height && rect.y + rect.height > form.y).toBe(false);
    }
    expect(await page.locator('[data-decoration] img').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`connection-${width}.png`), fullPage: true });
  }
});

test('motion pauses for input; errors preserve geometry and retry works', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let attempts = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://3100.api.green-api.com/**', async (route) => {
    if (route.request().url().includes('getStateInstance')) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 350));
      await route.fulfill({ status: 200, json: { stateInstance: attempts === 1 ? 'notAuthorized' : 'authorized' } });
    } else await route.fulfill({ status: 200, json: null });
  });
  await page.goto('/');
  const layer = page.locator('[data-decoration="plane"] [data-parallax]');
  await expect(layer).toHaveCSS('transform', /^matrix/);
  await page.mouse.move(1300, 180);
  await expect.poll(() => layer.evaluate((node) => getComputedStyle(node).transform)).not.toBe('matrix(1, 0, 0, 1, 0, 0)');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('idInstance')).toBeFocused();
  await page.getByLabel('idInstance').fill('1234567890');
  await page.getByLabel('apiTokenInstance').fill('test-token-only');
  await page.getByRole('button', { name: 'Показать токен' }).click();
  await expect(page.getByLabel('apiTokenInstance')).toHaveAttribute('type', 'text');
  await expect.poll(() => layer.evaluate((node) => Math.abs(new DOMMatrix(getComputedStyle(node).transform).m41))).toBeLessThan(0.5);
  const flight = page.locator('[data-flight]');
  await expect.poll(() => flight.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41)).toBeGreaterThan(35);
  await expect.poll(() => flight.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m42)).toBeLessThan(-18);
  const before = await page.getByLabel('idInstance').boundingBox();
  await page.getByRole('button', { name: 'Подключиться', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Подключение...' })).toBeDisabled();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await page.getByLabel('idInstance').boundingBox()).toEqual(before);
  await expect(page.getByLabel('apiTokenInstance')).toHaveValue('test-token-only');
  await page.getByRole('button', { name: 'Подключиться', exact: true }).click();
  await expect(page.locator('[data-exiting="true"]')).toBeVisible();
  await expect(page.getByLabel('Номер телефона')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Подключение...' })).toBeDisabled();
  await expect(page.getByLabel('Номер телефона')).toBeVisible();
  await expect(page.locator('[data-decoration]')).toHaveCount(0);
  await page.getByRole('button', { name: /Отключиться|Выйти/ }).click();
  await expect(page.getByLabel('idInstance')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(1200, 120);
  await expect(layer).toHaveCSS('transform', 'none');
  expect(errors).toEqual([]);
});

test('parallax layers move at different depths and in opposite directions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('[data-decoration="plane"] [data-parallax]')).toHaveCSS('transform', /^matrix/);
  await page.mouse.move(1400, 450);
  const translation = (name: string) => page.locator(`[data-decoration="${name}"] [data-parallax]`).evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41);
  await expect.poll(() => translation('plane')).toBeGreaterThan(18);
  expect(await translation('minimal')).toBeGreaterThan(5);
  expect(await translation('parallax')).toBeLessThan(-10);
  expect(await translation('connector')).toBeLessThan(-8);
  await page.mouse.move(720, 450);
  await expect.poll(() => translation('plane')).toBeLessThan(0.5);
});
