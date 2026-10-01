import { test, expect, Page } from '@playwright/test';
const password = 'browser-test-password';
async function register(page: Page, name: string, email: string) {
  await page.goto('/');
  await page.getByLabel('表示名', { exact: true }).fill(name);
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'アカウントを作って、入室する' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'はじまりのロビー' }),
  ).toBeVisible();
  await expect(page.locator('.connection')).toHaveText('● オンライン');
}
test('two real browser users complete the service journey', async ({
  browser,
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: testInfo.outputPath('landing.png'),
    fullPage: true,
  });
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const email = `browser-a-${suffix}@example.test`;
  await register(page, 'ブラウザ太郎', email);
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    other = await context.newPage();
  other.on('pageerror', (e) => errors.push(e.message));
  await register(other, 'ブラウザ花子', `browser-b-${suffix}@example.test`);
  await expect(page.locator('.occupancy')).toContainText('2 人');
  const map = page.locator('canvas');
  await map.click();
  const before = await map.evaluate((node: HTMLCanvasElement) =>
    node.toDataURL(),
  );
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(650);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(200);
  expect(
    await map.evaluate((node: HTMLCanvasElement) => node.toDataURL()),
  ).not.toBe(before);
  await page
    .getByLabel('メッセージ', { exact: true })
    .fill('こんにちは、同じ空間から！');
  await page.getByRole('button', { name: '送信 ↑', exact: true }).click();
  await expect(other.getByRole('log')).toContainText(
    'こんにちは、同じ空間から！',
  );
  await page
    .getByLabel('メッセージ', { exact: true })
    .fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: '送信 ↑', exact: true }).click();
  await expect(other.getByRole('log')).toContainText(
    '<img src=x onerror=alert(1)>',
  );
  expect(await other.locator('.messages img').count()).toBe(0);
  await page.getByRole('button', { name: 'プロフィールを編集' }).click();
  await page.getByLabel('表示名', { exact: true }).fill('太郎の居場所');
  await page.getByLabel('一言コメント').fill('今日はゆっくり');
  await page.getByRole('button', { name: 'plum', exact: true }).click();
  await page.getByRole('button', { name: '保存する', exact: true }).click();
  await other.getByRole('button', { name: /参加者/ }).click();
  await expect(other.locator('.people-list')).toContainText('太郎の居場所');
  await expect(other.locator('.people-list')).toContainText('今日はゆっくり');
  await other.getByRole('button', { name: '通報', exact: true }).click();
  await other
    .getByLabel('理由', { exact: true })
    .fill('Automated acceptance test: no actual misconduct');
  await other.getByRole('button', { name: '通報する', exact: true }).click();
  await expect(
    other.getByRole('dialog', { name: '通報', exact: true }),
  ).not.toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('space-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: /まなびの教室/ }).click();
  await expect(
    page.getByRole('heading', { name: 'まなびの教室' }),
  ).toBeVisible();
  await expect(page.locator('.occupancy')).toContainText('1 人');
  await expect(other.locator('.occupancy')).toContainText('1 人');
  await page
    .getByLabel('メッセージ', { exact: true })
    .fill('教室だけのメッセージ');
  await page.getByRole('button', { name: '送信 ↑', exact: true }).click();
  await other.getByRole('button', { name: 'チャット', exact: true }).click();
  await expect(other.getByRole('log')).not.toContainText(
    '教室だけのメッセージ',
  );
  await page.context().setOffline(true);
  await expect(page.locator('.connection')).not.toHaveText('● オンライン');
  await page.context().setOffline(false);
  await expect(page.locator('.connection')).toHaveText('● オンライン');
  await expect(
    page.getByRole('heading', { name: 'まなびの教室' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'はじまりのロビー' }),
  ).toBeVisible();
  await expect(page.locator('.profile-button')).toContainText('太郎の居場所');
  await page.getByRole('button', { name: '退出してログアウト' }).click();
  await expect(
    page.getByRole('heading', { name: 'おかえりなさい。' }),
  ).toBeVisible();
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ログインして、入室する' }).click();
  await expect(page.locator('.profile-button')).toContainText('太郎の居場所');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.dpad')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('space-mobile.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'プロフィールを編集' }).click();
  await page.getByRole('button', { name: 'アカウントを退会する' }).click();
  await page.getByLabel('確認のためパスワードを入力').fill(password);
  await page.getByRole('button', { name: '退会してデータを削除する' }).click();
  await expect(page.getByLabel('メールアドレス')).toBeVisible();
  await other.getByRole('button', { name: 'プロフィールを編集' }).click();
  await other.getByRole('button', { name: 'アカウントを退会する' }).click();
  await other.getByLabel('確認のためパスワードを入力').fill(password);
  await other.getByRole('button', { name: '退会してデータを削除する' }).click();
  await expect(other.getByLabel('メールアドレス')).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});
