# Ramani QR Studio

Internal QR code generator and scan analytics tool for **Ramani Groups**.

This version is built for **GitHub Pages + Google Sheets + Google Apps Script** and tracks every saved QR by its unique **QR Name**.

## What this version does

- URL, Text, Email, Phone, SMS and Wi-Fi QR types
- Required unique **QR Name**
- Explicit **Save QR & Enable Tracking** button
- A saved QR immediately appears in Analytics with 0 scans
- Every successful scan increments the saved QR Name's scan count
- Scan timestamps are stored in the Google Sheet
- Analytics shows total tracked QRs, total scans, scanned QR count, last scan and recent scan timestamps
- PNG and SVG downloads
- QR styling controls
- No database server or SQL required

## Important: how scan tracking now works

This build no longer depends on JSONP for the scan itself.

1. The QR code points to your deployed Google Apps Script Web App.
2. Apps Script validates the QR Name + token.
3. It increments the scan count and writes the scan timestamp.
4. Only after that, it opens `go.html` on the GitHub Pages site.
5. `go.html` opens the final URL, email, phone, SMS, text or Wi-Fi details.

This is more reliable than trying to record the scan with a background JSONP request after the QR has already opened.

## Project structure

```text
/
├── index.html
├── analytics.html
├── go.html
├── css/
│   └── style.css
├── js/
│   ├── app.js
│   ├── analytics.js
│   └── config.js
├── assets/
│   └── images/
│       ├── ramani-logo.png
│       └── ramani-favicon.png
├── apps-script/
│   └── Code.gs
├── LICENSE
├── .gitignore
└── README.md
```

# 1. Update Google Apps Script

Use the Google Sheet that will store the QR analytics.

1. Open the Sheet.
2. Go to **Extensions → Apps Script**.
3. Delete the existing `Code.gs` content.
4. Copy the full content from `apps-script/Code.gs` in this project.
5. Save.
6. Go to **Deploy → Manage deployments**.
7. Edit your existing Web App deployment, or create a new Web App deployment.
8. Choose a **new version**.
9. Set **Execute as** to **Me**.
10. Set **Who has access** to **Anyone** (or the broadest anonymous option allowed by your Workspace).
11. Deploy.
12. Copy the `/exec` Web App URL.

If you keep the same deployment, the existing `/exec` URL can stay the same after deploying the new version.

## Test the backend before GitHub

Paste the `/exec` URL directly into a browser.

A correct deployment displays:

> Ramani QR tracking service is running.

If Google asks the scanner to sign in, the Web App access is not open enough for public QR scanning.

# 2. Set the Web App URL

Open `js/config.js` and make sure it contains the current deployment URL:

```js
window.RAMANI_QR_CONFIG = {
  appsScriptUrl: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
  publicBaseUrl: ''
};
```

Leave `publicBaseUrl` blank for GitHub Pages.

# 3. Upload to GitHub Pages

1. Upload all files and folders to the GitHub repository.
2. Commit to `main`.
3. Open **Settings → Pages**.
4. Use **Deploy from a branch**.
5. Select `main` and `/ (root)`.
6. Save.
7. Open the GitHub Pages URL.

# 4. Create and save a tracked QR

1. Enter a unique **QR Name** such as `Chennai Hiring Poster Aug 2026`.
2. Wait until the tool says **Name is available**.
3. Select the QR type.
4. Enter the destination/content.
5. Click **Save QR & Enable Tracking**.
6. The status changes to **Saved & Tracking Enabled**.
7. Download the PNG/SVG or copy/share the QR.

The save action writes the QR Name, type, tracking token and creation time to the Sheet. The QR then appears in Analytics even before the first scan.

# 5. View Analytics

Open **Analytics** from the header.

For each QR Name you can see:

- QR Name
- type
- scan count
- created date/time
- last scanned date/time
- up to 100 recent scan timestamps

Use the search box to find a particular QR Name.

# Google Sheet tabs

The Apps Script automatically creates these tabs:

### `QR_CODES`

| QR Name | Type | Token | Created At | Scan Count | Last Scanned At |
|---|---|---|---|---:|---|

### `SCANS`

| Timestamp | QR Name | Type |
|---|---|---|

The script also detects the older `QR_CODES` layout without the Token column and upgrades it by inserting the Token column. Existing legacy rows can adopt their token when the old tracked QR is scanned or saved again.

# QR type behavior

- **URL:** count scan, then open the website.
- **Email:** count scan, then open the email app.
- **Phone:** count scan, then open the dialer.
- **SMS:** count scan, then open the messaging app.
- **Text:** count scan, then show the text.
- **Wi-Fi:** count scan, then show the network/password. A tracked web redirect cannot preserve native automatic Wi-Fi joining on all phones.

# Troubleshooting

## “Tracking service did not respond”

Check all of these:

- You pasted the newest `apps-script/Code.gs`.
- You deployed a **new version** after editing the code.
- The deployment is a **Web App**.
- **Execute as:** Me.
- **Who has access:** Anyone.
- The `/exec` URL in `js/config.js` exactly matches the active deployment.
- Opening the `/exec` URL directly shows `Ramani QR tracking service is running.`

## QR Name says it already exists

QR Names are intentionally unique. Use a new name for a different tracked QR.

## Analytics shows 0

First confirm you clicked **Save QR & Enable Tracking**. Then scan the downloaded/generated tracked QR. Refresh Analytics after the scan.

## Existing old QR data

The backend can upgrade the previous 5-column `QR_CODES` sheet by inserting the Token column. Back up the Sheet before changing production data if it contains important historical records.

## Privacy

The reporting Sheet stores QR Name, type, tracking token, creation time, scan count and scan timestamps. The destination/content remains encoded in the QR URL and is not written to the reporting Sheet by this version.
