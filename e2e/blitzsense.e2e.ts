import { expect, test } from '@playwright/test';

test('settings Done button closes the dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('dialog', { name: 'Training settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog', { name: 'Training settings' })).toBeHidden();
});

test('hides evaluation until Analysis, flips material rows, and supports keyboard promotion', async ({ page }) => {
  await page.goto('/e2e/');
  const top = page.getByTestId('material-top').locator('[aria-label]');
  await expect(top).toHaveAttribute('aria-label', /Black captured/);
  await page.getByRole('button', { name: 'Flip material demo' }).click();
  await expect(top).toHaveAttribute('aria-label', /White captured/);

  await page.getByRole('button', { name: 'Start session' }).click();
  const board = page.getByRole('application', { name: /Chessboard/ });
  await expect(board).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('[title^="Stockfish Evaluation:"]')).toHaveCount(0);
  await expect(page.locator('[title="Stockfish Evaluation: +9.0"]')).toHaveCount(0);

  await page.waitForTimeout(2_600);
  await board.focus();
  for (let index = 0; index < 6; index += 1) await board.press('ArrowUp');
  await board.press('Enter');
  await board.press('ArrowUp');
  await board.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Choose a promotion' })).toBeVisible();
  await page.getByRole('button', { name: 'Promote to Knight' }).click();
  await expect(page.getByRole('link', { name: 'View on Lichess' })).toHaveAttribute('href', 'https://lichess.org/e2etest');
  await expect(page.locator('[title="Stockfish Evaluation: +9.0"]')).toHaveCount(0);
  const analysisButton = page.getByRole('button', { name: 'Analysis' });
  await expect(analysisButton).toBeEnabled();
  await analysisButton.click();
  await expect(analysisButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[title="Stockfish Evaluation: +9.0"]')).toBeVisible();
  await expect(page.getByText('a8=N', { exact: true })).toBeVisible();
  await expect(page.getByText('Engine #1', { exact: true }).last()).toHaveClass(/text-emerald-400/);
  await expect(page.getByText('Played move', { exact: true })).toHaveClass(/text-sky-400/);
  await expect(page.getByText('Your Move', { exact: true }).last()).toHaveClass(/text-rose-400/);
});

test('reveals evaluation after a timeout', async ({ page }) => {
  await page.goto('/e2e/?mode=timeout');
  await page.getByRole('button', { name: 'Start session' }).click();
  await expect(page.getByText('TIME UP')).toBeVisible({ timeout: 6_000 });
  await expect(page.locator('[title="Stockfish Evaluation: +9.0"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Analysis' }).click();
  await expect(page.locator('[title="Stockfish Evaluation: +9.0"]')).toBeVisible();
});
