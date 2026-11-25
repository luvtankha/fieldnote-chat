import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

const password = 'fieldnote-test-password-123';

async function navigation(page) {
  const open = page.getByRole('button', { name: 'Open navigation' });
  if (await open.isVisible() && (await open.getAttribute('aria-expanded')) === 'false') await open.click();
  return page.getByRole('complementary', { name: 'Chat history' });
}

test('signup, socket reply, feedback, preferences, and retained history', async ({ page }) => {
  const email = `test-${randomUUID()}@example.com`;
  const sockets = [];
  page.on('websocket', (socket) => { if (socket.url().includes('/socket.io/')) sockets.push(socket); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'What’s on your mind?' })).toBeVisible();
  await page.getByRole('button', { name: /Brainstorm ideas/ }).click();
  await expect(page.getByRole('combobox', { name: 'Chat category' })).toHaveValue('creative');
  const message = page.getByRole('textbox', { name: 'Message' });
  await expect(message).toHaveValue(/Brainstorm five/);
  await page.getByRole('button', { name: 'Send message' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Your name').fill('Field Tester');
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByLabel(/Password/).fill(password);
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
  expect(sockets.length).toBeGreaterThan(0);
  await expect(message).toHaveValue(/Brainstorm five/);
  await message.fill('Plan a garden');
  await page.getByRole('button', { name: 'Send message' }).click();
  const chat = page.getByRole('region', { name: 'Conversation' });
  await expect(chat.getByText('Plan a garden', { exact: true })).toBeVisible();
  await expect(chat.getByText('Test reply for: Plan a garden')).toBeVisible();
  await expect(page.getByText('Creative', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Helpful', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Helpful', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Give feedback' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Your feedback').fill('Easy to follow.');
  await dialog.getByRole('button', { name: 'Save feedback' }).click();
  await expect(dialog).toBeHidden();

  await (await navigation(page)).getByRole('button', { name: 'Preferences' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Assistant name').fill('Juniper');
  await dialog.getByText('Dark', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  await expect(chat.getByText('Juniper', { exact: true })).toBeVisible();

  const sidebar = await navigation(page);
  await sidebar.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByLabel('Password').fill(password);
  await dialog.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'What’s on your mind?' })).toBeVisible();
  await (await navigation(page)).getByRole('button', { name: 'Plan a garden' }).click();
  await expect(chat.getByText('Test reply for: Plan a garden')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Helpful', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Give feedback' }).click();
  await expect(page.getByRole('dialog').getByLabel('Your feedback')).toHaveValue('Easy to follow.');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  expect(await page.locator('body').evaluate((el) => el.scrollWidth <= window.innerWidth)).toBe(true);
});
