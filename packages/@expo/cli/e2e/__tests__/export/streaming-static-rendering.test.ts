import fs from 'node:fs';
import path from 'node:path';

import { executeExpoAsync } from '../../utils/expo';
import { findProjectFiles, getPageHtml, getRouterE2ERoot } from '../utils';
import { runExportSideEffects } from './export-side-effects';

runExportSideEffects();

describe('exports static through the streaming renderer', () => {
  const projectRoot = getRouterE2ERoot();
  const outputName = 'dist-static-streaming';
  const outputDir = path.join(projectRoot, outputName);
  const baseUrl = '/one/two';

  beforeAll(async () => {
    await executeExpoAsync(projectRoot, ['export', '-p', 'web', '--output-dir', outputName], {
      env: {
        NODE_ENV: 'production',
        EXPO_USE_STATIC: 'static',
        E2E_ROUTER_SRC: 'static-rendering',
        E2E_FAVICON: './assets/icon.png',
        E2E_ROUTER_ASYNC: 'production',
        EXPO_E2E_BASE_PATH: baseUrl,
      },
    });
  });

  it('exports internal and user pages with split hydration bundles', () => {
    expect(findProjectFiles(outputDir)).toEqual(
      expect.arrayContaining([
        '+not-found.html',
        '_sitemap.html',
        'index.html',
        'suspense.html',
        'metadata.html',
        'metadata-async/123.html',
        expect.stringMatching(/_expo\/static\/js\/web\/suspense-[0-9a-f]{32}\.js/),
      ])
    );
  });

  it('preserves styles, fonts, favicon, and deferred bundles with a base path', async () => {
    const html = await getPageHtml(outputDir, 'index.html');
    expect(html.querySelector('head style#expo-reset')?.textContent).toContain('#root');
    expect(html.querySelector('head style#react-native-stylesheet')?.textContent).toContain(
      '[stylesheet-group="0"]'
    );
    expect(html.querySelector('style#expo-generated-fonts')?.textContent).toContain('@font-face');
    expect(html.querySelector('head link[rel="icon"]')?.attributes.href).toBe(
      `${baseUrl}/favicon.ico`
    );

    const assets = html.querySelectorAll('script[src], link[rel="stylesheet"], link[as="font"]');
    expect(html.querySelectorAll('script[src]').length).toBeGreaterThan(1);
    expect(html.querySelectorAll('link[rel="stylesheet"]').length).toBeGreaterThan(0);
    expect(html.querySelectorAll('link[as="font"]').length).toBeGreaterThan(0);
    for (const asset of assets) {
      const url = asset.attributes.src ?? asset.attributes.href;
      expect(url).toMatch(/^\/one\/two\//);
      expect(fs.existsSync(path.join(outputDir, url.slice(baseUrl.length)))).toBe(true);
      if (asset.tagName === 'SCRIPT') {
        expect(asset.hasAttribute('defer')).toBe(true);
      }
    }
  });

  it('resolves synchronous and async dynamic metadata into the initial head', async () => {
    const metadata = await getPageHtml(outputDir, 'metadata.html');
    expect(metadata.querySelector('head title')?.textContent).toBe('Metadata Page');
    expect(metadata.querySelector('head meta[name="description"]')?.attributes.content).toBe(
      'Page with generateMetadata'
    );

    const asyncMetadata = await getPageHtml(outputDir, 'metadata-async/123.html');
    expect(asyncMetadata.querySelector('head title')?.textContent).toBe('Async Metadata 123');
    expect(asyncMetadata.querySelector('head meta[name="description"]')?.attributes.content).toBe(
      'Async metadata for /metadata-async/123'
    );
  });
});
