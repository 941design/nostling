/**
 * E2E tests for Blossom media upload pipeline
 *
 * Tests the full upload flow: store blob → send message with attachment →
 * upload to blossom → placeholder replacement → message sent.
 *
 * Requires the blossom-server mock to be running (docker-compose.e2e.yml).
 */

import { test, expect } from './fixtures';
import { waitForAppReady, ensureIdentityExists, setupBlossomServer, waitForMediaUploadComplete } from './helpers';
import path from 'path';

const TEST_IMAGE_PATH = path.resolve(__dirname, 'fixtures/test-image.png');
const BLOSSOM_SERVER_URL = process.env.NOSTLING_BLOSSOM_SERVER || 'http://blossom-server:3001';

test.describe('Media Upload Pipeline', () => {
  test('stores blob and returns metadata', async ({ page }) => {
    await waitForAppReady(page);

    const result = await page.evaluate(async (filePath: string) => {
      return (window as any).api.blobStorage.storeBlob(filePath);
    }, TEST_IMAGE_PATH);

    expect(result).toBeDefined();
    expect(result.hash).toBeTruthy();
    expect(typeof result.hash).toBe('string');
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.metadata).toBeDefined();
    expect(result.metadata.mimeType).toBe('image/png');
    expect(result.metadata.sizeBytes).toBeGreaterThan(0);
    expect(result.metadata.dimensions).toBeDefined();
    expect(result.metadata.dimensions.width).toBe(8);
    expect(result.metadata.dimensions.height).toBe(8);
  });

  test('sends message with attachment and uploads to blossom', async ({ page }) => {
    test.setTimeout(90000);
    await waitForAppReady(page);

    // Create identity via UI
    await ensureIdentityExists(page, 'Media Upload Test');

    // Get identity info via IPC
    const identities: any[] = await page.evaluate(() => {
      return (window as any).api.nostling.identities.list();
    });
    expect(identities.length).toBeGreaterThan(0);
    const identity = identities[0];

    // Configure blossom server for this identity (handler resolves hex pubkey internally)
    await setupBlossomServer(page, identity.id, BLOSSOM_SERVER_URL);

    // Add a contact (using a fake npub — message will be sent via simulated path)
    await page.locator('button[aria-label="Add contact"]').click();
    await page.locator('input[placeholder="npub..."]').fill('npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsutghm7');
    await page.locator('input[placeholder="Friend"]').fill('Upload Target');
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('[data-testid^="contact-item-"]', { timeout: 5000 });

    // Get contact info
    const contacts: any[] = await page.evaluate((identityId: string) => {
      return (window as any).api.nostling.contacts.list(identityId);
    }, identity.id);
    expect(contacts.length).toBeGreaterThan(0);
    const contact = contacts[0];

    // Store the test image blob
    const blobResult = await page.evaluate(async (filePath: string) => {
      return (window as any).api.blobStorage.storeBlob(filePath);
    }, TEST_IMAGE_PATH);

    expect(blobResult.hash).toBeTruthy();

    // Fire-and-forget: messages.send triggers async upload pipeline + relay publish,
    // which can take 45+ seconds with retries. Don't block on the result.
    await page.evaluate(
      ({ identityId, contactId, hash, mimeType, sizeBytes, dimensions }) => {
        (window as any).api.nostling.messages.send({
          identityId,
          contactId,
          plaintext: 'Test image attachment',
          attachments: [
            {
              hash,
              name: 'test-image.png',
              mimeType,
              sizeBytes,
              dimensions,
            },
          ],
        });
      },
      {
        identityId: identity.id,
        contactId: contact.id,
        hash: blobResult.hash,
        mimeType: blobResult.metadata.mimeType,
        sizeBytes: blobResult.metadata.sizeBytes,
        dimensions: blobResult.metadata.dimensions,
      }
    );

    // Wait for upload pipeline to complete (blob uploaded to blossom, placeholder replaced)
    const message = await waitForMediaUploadComplete(page, identity.id, contact.id, 60000);

    expect(message).toBeDefined();

    // Verify mediaJson contains remote URL (not local-blob: placeholder)
    expect(message.mediaJson).toBeDefined();
    const mediaJson = JSON.parse(message.mediaJson);
    expect(mediaJson.attachments).toHaveLength(1);
    const attachment = mediaJson.attachments[0];
    expect(attachment.hash).toBe(blobResult.hash);

    // The imeta tag should contain a remote URL, not a local-blob: placeholder
    const urlTag = attachment.imeta.find((tag: string) => tag.startsWith('url '));
    expect(urlTag).toBeDefined();
    expect(urlTag).not.toContain('local-blob:');
    expect(urlTag).toContain(BLOSSOM_SERVER_URL);
  });

  test('attachment renders in conversation', async ({ page }) => {
    await waitForAppReady(page);

    // Create identity
    await ensureIdentityExists(page, 'Render Test');

    // Get identity
    const identities: any[] = await page.evaluate(() => {
      return (window as any).api.nostling.identities.list();
    });
    const identity = identities[0];

    // Add contact
    await page.locator('button[aria-label="Add contact"]').click();
    await page.locator('input[placeholder="npub..."]').fill('npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsutghm7');
    await page.locator('input[placeholder="Friend"]').fill('Render Target');
    await page.locator('button:has-text("Save")').click();
    await page.waitForSelector('[data-testid^="contact-item-"]', { timeout: 5000 });

    // Click on the contact to open conversation
    await page.locator('[data-testid^="contact-item-"]').first().click();

    // Get contact info
    const contacts: any[] = await page.evaluate((identityId: string) => {
      return (window as any).api.nostling.contacts.list(identityId);
    }, identity.id);
    const contact = contacts[0];

    // Store blob
    const blobResult = await page.evaluate(async (filePath: string) => {
      return (window as any).api.blobStorage.storeBlob(filePath);
    }, TEST_IMAGE_PATH);

    // Fire-and-forget: don't block on async upload pipeline + relay publish
    await page.evaluate(
      ({ identityId, contactId, hash, mimeType, sizeBytes, dimensions }) => {
        (window as any).api.nostling.messages.send({
          identityId,
          contactId,
          plaintext: 'Image attachment render test',
          attachments: [
            {
              hash,
              name: 'test-image.png',
              mimeType,
              sizeBytes,
              dimensions,
            },
          ],
        });
      },
      {
        identityId: identity.id,
        contactId: contact.id,
        hash: blobResult.hash,
        mimeType: blobResult.metadata.mimeType,
        sizeBytes: blobResult.metadata.sizeBytes,
        dimensions: blobResult.metadata.dimensions,
      }
    );

    // Wait for message to appear in conversation
    await expect(
      page.locator('[data-testid="message-bubble"]', { hasText: 'Image attachment render test' })
    ).toBeVisible({ timeout: 10000 });

    // Verify image element is rendered in the message bubble
    const messageBubble = page.locator('[data-testid="message-bubble"]', {
      hasText: 'Image attachment render test',
    });
    const image = messageBubble.locator('img');
    await expect(image).toBeVisible({ timeout: 10000 });
  });
});
