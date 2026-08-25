# NEXTGEN DEV JFS Waybill Helper

Development-only Manifest V3 extension. It observes successful JFS waybill creation responses and opens the authenticated NEXTGEN DEV Pickup Adjustment helper.

## Local installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `extensions/nextgen-jfs-helper` folder.

The extension runs only on `https://jfs.jtcargo.co.id/*` and opens only `https://dev.nextgen-platform.com/helper/pickup-adjustment`. It does not read request headers, credentials, or request payloads, and it never persists, forwards, or logs the full response payload. Deduplication stores only a SHA-256-derived session key and timestamp for 60 seconds.
