/**
 * Custom Theme Application E2E Tests
 *
 * Tests that custom theme modifications via variable sliders
 * are properly applied to the app when the user clicks Apply.
 *
 * Bug: Adjusting theme sliders (e.g., baseHue) generates custom colors
 * that appear in the preview, but when Apply is clicked, the custom
 * colors are not applied to the actual app UI.
 */

import { test, expect, type Page } from './fixtures';
import { waitForAppReady, ensureIdentityExists } from './helpers';

/**
 * Helper to open the theme selection panel
 */
async function openThemePanel(page: Page): Promise<void> {
  // Open hamburger menu
  await page.locator('button[aria-label="Open menu"]').click();
  await page.waitForTimeout(100);

  // Click on Theme panel trigger
  await page.locator('[data-testid="theme-panel-trigger"]').click();

  // Wait for theme panel to open
  await page.waitForSelector('[data-testid="theme-selection-panel"]', { timeout: 5000 });
}

/**
 * Helper to adjust the baseHue slider significantly
 *
 * Uses focus + Home/End keys to jump to extreme values (faster than arrow keys)
 * This triggers the custom theme generation flow
 */
async function adjustBaseHueSlider(page: Page): Promise<void> {
  // Wait for the sliders component to be visible in the sidebar
  const slidersContainer = page.locator('[data-testid="theme-variable-sliders"]');
  await slidersContainer.waitFor({ state: 'visible', timeout: 5000 });

  // Find the first slider (Base Hue slider)
  // Ark UI sliders have a thumb element that can receive focus
  const sliders = slidersContainer.locator('[data-scope="slider"]');
  const baseHueSlider = sliders.first();
  const thumb = baseHueSlider.locator('[data-part="thumb"]');

  // Click the thumb to focus it
  await thumb.click();
  await page.waitForTimeout(100);

  // Press Home to jump to minimum (hue 0 = red), then shift a bit
  // This creates a significant color change from the default blue (~210)
  await page.keyboard.press('Home');
  await page.waitForTimeout(100);

  // Press a few arrow rights to get to orange (~30)
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('ArrowRight');
  }

  await page.waitForTimeout(300);
}

test.describe('Custom Theme Application', () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppReady(page);
    await ensureIdentityExists(page, 'Custom Theme Test Identity');
  });

  test('should apply custom baseHue when slider is adjusted and Apply is clicked', async ({ page }) => {
    // Get initial app shell background color (default obsidian theme)
    const appShell = page.locator('[data-testid="app-shell"]');
    const initialBgColor = await appShell.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );
    expect(initialBgColor).not.toBe('rgba(0, 0, 0, 0)');

    // Open theme panel
    await openThemePanel(page);

    // Adjust the baseHue slider to a significantly different value
    // Default obsidian is around 210-240 hue (blues), this changes to ~30 (orange/warm)
    await adjustBaseHueSlider(page);

    // Wait for preview to update (custom colors should be generated)
    await page.waitForTimeout(300);

    // Click Apply button
    await page.locator('[data-testid="theme-panel-ok"]').click();

    // Wait for panel to close and theme to be applied
    await page.waitForSelector('[data-testid="theme-selection-panel"]', { state: 'hidden', timeout: 5000 });
    await page.waitForTimeout(500);

    // Get the new app shell background color
    const newBgColor = await appShell.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );

    // The background color should have changed to reflect the custom theme
    // This is the failing assertion - the bug is that custom colors are not applied
    expect(newBgColor).not.toBe(initialBgColor);
  });

  test('should preserve custom theme colors after panel closes', async ({ page }) => {
    // Open theme panel
    await openThemePanel(page);

    // Adjust the baseHue slider to a warm orange hue
    await adjustBaseHueSlider(page);
    await page.waitForTimeout(300);

    // Click Apply
    await page.locator('[data-testid="theme-panel-ok"]').click();
    await page.waitForSelector('[data-testid="theme-selection-panel"]', { state: 'hidden', timeout: 5000 });
    await page.waitForTimeout(300);

    // Capture the app shell background color immediately after apply
    const appShell = page.locator('[data-testid="app-shell"]');
    const colorAfterApply = await appShell.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );

    // Wait a bit and check the color is still the same
    await page.waitForTimeout(500);
    const colorAfterWait = await appShell.evaluate((el) =>
      window.getComputedStyle(el).backgroundColor
    );

    // Colors should remain consistent
    expect(colorAfterWait).toBe(colorAfterApply);

    // Parse the RGB values to verify it's a warm color (higher red component)
    const rgbMatch = colorAfterApply.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      const red = parseInt(rgbMatch[1], 10);
      const blue = parseInt(rgbMatch[3], 10);
      // For a warm theme with hue ~30, red should be higher than blue
      // This assertion will fail if the custom theme wasn't applied
      expect(red).toBeGreaterThan(blue);
    }
  });

});
