# Ramani QR Studio

Internal QR generator and scan tracker for Ramani Groups.

## One-time Google Apps Script setup

1. Open the Google Sheet used for QR Studio.
2. Extensions -> Apps Script.
3. Replace the complete script with `apps-script/Code.gs` from this repository.
4. Save.
5. Run `setupDatabase()` once and approve permissions.
6. Deploy -> Manage deployments -> Edit -> choose **New version** -> Deploy.
7. Keep **Execute as: Me** and **Who has access: Anyone**.
8. The existing `/exec` URL is already configured in `js/config.js`.

## Important test

Open this in a browser (replace the URL only if you create a different deployment):

`YOUR_EXEC_URL?action=health&callback=testCallback`

Expected output:

`testCallback({"ok":true,"message":"Ramani QR Studio API is running."});`

If you see plain JSON instead of `testCallback(...)`, the currently deployed Apps Script is not the version in `apps-script/Code.gs`.

## GitHub Pages

Upload all files to the repository root, then Settings -> Pages -> Deploy from branch -> main / root.

## Tracking model

Every tracked QR is registered with a unique QR Name and QR ID. The QR encodes `go.html?id=...`. When scanned, `go.html` calls Apps Script, records a scan timestamp, then performs the destination action. URL redirects directly; email/phone/SMS open their schemes; text is displayed; Wi-Fi details are displayed because a tracked web redirect cannot trigger the native Wi-Fi join QR behavior after the scan.
