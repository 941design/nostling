# Blossom Upload URL Uses Server-Reported Hostname Instead of Client-Configured URL - Bug Report

## Bug Description

When uploading media to a Blossom server, the upload pipeline stores the URL returned by the server in `mediaJson` rather than constructing the URL from the client-configured server URL. When the Blossom server runs behind a reverse proxy, in Docker, or on a different hostname than the client uses to reach it, the stored URL is unreachable from the Electron app, causing images to fail to load with `ERR_NAME_NOT_RESOLVED`.

## Expected Behavior

After a successful Blossom upload, the `mediaJson` field should contain a URL reachable by the client. The URL should be constructed from the client-configured Blossom server URL (stored in `blossom_servers` table) combined with the blob hash, e.g.:
```
http://localhost:3001/blob/<sha256-hash>
```

## Reproduction Steps

1. Start the dual-instance environment with Docker blossom server:
   ```bash
   make dev-dual
   ```
   This starts a Blossom server in Docker accessible at `http://localhost:3001` (container name: `blossom-server`)

2. Create identities and contacts on both instances

3. Configure the Blossom server for Alice's identity on Instance A:
   ```js
   const ids = await window.api.nostling.identities.list();
   await window.api.test.insertBlossomServer({
     identityId: ids[0].id,
     url: 'http://localhost:3001',
     label: 'Dev Blossom'
   })
   ```

4. Store a test image and send it as an attachment:
   ```js
   const blob = await window.api.blobStorage.storeBlob('/path/to/test-image.png');
   const ids = await window.api.nostling.identities.list();
   const contacts = await window.api.nostling.contacts.list(ids[0].id);
   await window.api.nostling.messages.send({
     identityId: ids[0].id,
     contactId: contacts[0].id,
     plaintext: 'Image test',
     attachments: [{
       hash: blob.hash,
       name: 'test-image.png',
       mimeType: blob.metadata.mimeType,
       sizeBytes: blob.metadata.sizeBytes,
       dimensions: blob.metadata.dimensions
     }]
   })
   ```

5. Wait 30 seconds for upload pipeline processing

6. Check the message's `mediaJson`:
   ```js
   const msgs = await window.api.nostling.messages.list(ids[0].id, contacts[0].id);
   const sent = msgs.find(m => m.content.includes('Image test'));
   console.log(sent.mediaJson);
   ```

7. **Observe**: `mediaJson` contains `http://blossom-server:3001/blob/<hash>` instead of `http://localhost:3001/blob/<hash>`

8. Both Instance A and Instance B show broken image placeholders with console error:
   ```
   Failed to load resource: net::ERR_NAME_NOT_RESOLVED
   Error: getaddrinfo EAI_AGAIN blossom-server
   ```

## Actual Behavior

The upload pipeline at `upload-pipeline.ts:272-280` extracts the URL from the Blossom server's HTTP response body:

```typescript
const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const remoteUrl = body.url || body.nurl;
resolve(remoteUrl);
```

The Blossom server returns its own internal hostname in the response URL (e.g., `http://blossom-server:3001/blob/<hash>`). This URL is then used directly in `replacePlaceholdersInMediaJson()` (`upload-pipeline.ts:489`):

```typescript
updatedJson = updatedJson.replace(`local-blob:${hash}`, remoteUrl);
```

The client-configured URL (`http://localhost:3001`) stored in the `blossom_servers` table is only used for the upload endpoint (`${server.url}/upload`) but not for constructing the blob retrieval URL.

## Root Cause

`upload-pipeline.ts:275` trusts the server-provided URL blindly. The Blossom BUD-02 spec returns the blob descriptor including a URL, but that URL reflects the server's own view of its hostname — which may differ from how clients reach it (e.g., Docker internal hostname, reverse proxy, CDN).

The client already knows the correct base URL — it's in the `blossom_servers` table. The blob hash is also known. So the retrieval URL should be constructed as: `${configuredServerUrl}/blob/${hash}`.

## Impact

- Severity: **High** — media attachments are completely broken in Docker dev environment
- All uploaded images and files show as broken/unloadable on both sender and receiver
- The upload itself succeeds (message status transitions to `sent`, `local-blob:` placeholder is replaced)
- The replaced URL is simply unreachable from the client
- Affects any deployment where the Blossom server's self-reported hostname differs from the client-facing URL

## Relevant Code

| File | Lines | Purpose |
|------|-------|---------|
| `src/main/media/upload-pipeline.ts` | 272-280 | Extracts `body.url \|\| body.nurl` from server response |
| `src/main/media/upload-pipeline.ts` | 489 | Replaces `local-blob:` placeholder with server-provided URL |
| `src/main/media/upload-pipeline.ts` | 240 | Upload URL construction: `${server.url}/upload` |
| `src/main/media/imeta-builder.ts` | 30 | Initial `local-blob:` placeholder creation |
| `src/main/blossom/BlossomServerService.ts` | 440-459 | `selectHealthyServer()` returns server with configured URL |

## Suggested Fix

In `upload-pipeline.ts`, after receiving the server response, construct the blob URL from the client-configured server URL instead of trusting the server-provided URL:

```typescript
// Current (line 275):
const remoteUrl = body.url || body.nurl;

// Fix: construct URL from configured server URL + response hash
const responseHash = body.sha256 || body.url?.split('/').pop();
const remoteUrl = `${server.url}/blob/${responseHash}`;
```

Alternatively, extract just the hash/path from the response URL and combine it with `server.url`.
