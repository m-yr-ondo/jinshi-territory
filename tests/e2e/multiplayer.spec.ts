import { expect, test } from '@playwright/test';

test('two humans join the same territory arena', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const first = await firstContext.newPage();
  const second = await secondContext.newPage();

  await first.goto('/');
  await first.getByPlaceholder('Enter your name').fill('E2E One');
  await first.getByRole('button', { name: 'Claim the arena' }).click();
  await expect(first.locator('.hud')).toHaveClass(/visible/);
  await expect(first.locator('.connection')).toContainText('Connected');

  await second.goto('/');
  await second.getByPlaceholder('Enter your name').fill('E2E Two');
  await second.getByRole('button', { name: 'Claim the arena' }).click();
  await expect(second.locator('.hud')).toHaveClass(/visible/);
  await expect(second.locator('.leaderboard')).toContainText('E2E One', { timeout: 10_000 });
  await expect(second.locator('.leaderboard')).toContainText('E2E Two', { timeout: 10_000 });
  await expect(second.locator('[data-territory]')).toContainText('%');

  await firstContext.close();
  await expect(second.locator('.connection')).toContainText('Connected');
  await secondContext.close();
});
