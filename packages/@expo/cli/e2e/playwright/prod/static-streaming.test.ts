import { expect, test } from '@playwright/test';

import { clearEnv, restoreEnv } from '../../__tests__/export/export-side-effects';
import { getRouterE2ERoot } from '../../__tests__/utils';
import { createExpoServe, executeExpoAsync } from '../../utils/expo';
import { pageCollectErrors } from '../page';

test.beforeAll(() => clearEnv());
test.afterAll(() => restoreEnv());

const projectRoot = getRouterE2ERoot();
const outputDir = 'dist-static-streaming-playwright';

test.describe('streamed static output', () => {
  const expoServe = createExpoServe({ cwd: projectRoot, env: { NODE_ENV: 'production' } });

  test.beforeAll(async () => {
    await executeExpoAsync(projectRoot, ['export', '-p', 'web', '--output-dir', outputDir], {
      env: {
        NODE_ENV: 'production',
        EXPO_USE_STATIC: 'static',
        E2E_ROUTER_SRC: 'static-rendering',
        E2E_ROUTER_ASYNC: 'production',
      },
    });
    await expoServe.startAsync([outputDir]);
  });

  test.afterAll(async () => {
    await expoServe.stopAsync();
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('shows large delayed content in place with its styles', async ({ page }) => {
      await page.goto(new URL('/suspense', expoServe.url).href);

      const content = page.getByTestId('suspense-page').getByTestId('suspense-content');
      await expect(content).toBeVisible();
      await expect(content).toHaveText('x'.repeat(30_000) + 'FINAL_SUSPENSE_SENTINEL');
      await expect(content).toHaveCSS('color', 'rgb(0, 128, 0)');
      await expect(page.getByTestId('count')).toHaveText('Count: 0');
    });

    test('includes initial metadata for an async dynamic route', async ({ page }) => {
      await page.goto(new URL('/metadata-async/123', expoServe.url).href);

      await expect(page.getByTestId('async-metadata-text')).toBeVisible();
      await expect(page).toHaveTitle('Async Metadata 123');
      await expect(page.locator('head meta[name="description"]')).toHaveAttribute(
        'content',
        'Async metadata for /metadata-async/123'
      );
    });
  });

  test('hydrates resolved content with split JavaScript bundles', async ({ page }) => {
    const errors = pageCollectErrors(page);
    await page.goto(new URL('/suspense', expoServe.url).href);
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('Count: 1');
    expect(errors.all).toEqual([]);
  });
});
