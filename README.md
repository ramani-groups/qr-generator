# Ramani QR Studio

Internal QR code generator and scan analytics tool for **Ramani Groups**.

The frontend is designed for **GitHub Pages**. Scan counts are stored in a Google Sheet through the included Google Apps Script backend.

## What is included

- URL, Text, Email, Phone, SMS and Wi-Fi QR types
- Only the selected content type is shown in the Build your code section
- Required **unique QR Name** for every QR code
- Automatic scan tracking for all six types
- QR Name based analytics and search
- Total scans, creation date, last scanned time and recent scan timestamps
- PNG and SVG downloads
- QR foreground/background color, size, margin and error-correction controls
- Ramani logo and favicon
- Responsive desktop/mobile design
- No SQL database required

## Important behavior for tracked QR codes

Tracking requires every generated QR to open `go.html` first so the scan can be counted.

- **URL:** scan is counted, then the website opens.
- **Email:** scan is counted, then the email application is opened.
- **Phone:** scan is counted, then the dialer is opened.
- **SMS:** scan is counted, then the messaging application is opened.
- **Text:** scan is counted, then the text is displayed on the Ramani QR page.
- **Wi-Fi:** scan is counted, then the Wi-Fi name/password are displayed with a copy action. Browsers cannot reliably auto-join a Wi-Fi network after a tracked web redirect, so tracked Wi-Fi QR codes cannot preserve the normal native Wi-Fi auto-connect behavior.

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

## One-time Google Sheet setup

1. Create a new Google Sheet. Suggested name: **Ramani QR Studio Database**.
2. In that Sheet open **Extensions → Apps Script**.
3. Delete the sample code and paste everything from `apps-script/Code.gs`.
4. Save the Apps Script project.
5. Choose **Deploy → New deployment**.
6. Select **Web app**.
7. Set **Execute as** to yourself.
8. Set access to **Anyone** or the broadest option permitted by the Ramani Google Workspace policy so QR scans can be recorded without asking the scanner to sign in.
9. Deploy and authorize the script.
10. Copy the Web App URL ending in `/exec`.
11. Open `js/config.js` and paste the URL:

```js
window.RAMANI_QR_CONFIG = {
  appsScriptUrl: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
  publicBaseUrl: ''
};
```

The Apps Script automatically creates two tabs in the Google Sheet when it receives its first request:

- `QR_CODES` — QR Name, Type, Created At, Scan Count, Last Scanned At
- `SCANS` — Timestamp, QR Name, Type

No SQL setup is required.

## GitHub Pages deployment

1. Create a GitHub repository.
2. Upload all project files preserving the folders.
3. Push/commit the files to `main`.
4. Open **Settings → Pages**.
5. Under Build and deployment choose **Deploy from a branch**.
6. Select `main` and `/ (root)`.
7. Save.
8. Open the generated GitHub Pages URL.

Leave `publicBaseUrl` blank in `js/config.js`; the tool automatically uses its deployed GitHub Pages folder.

## Creating a QR code

1. Enter a **QR Name**. It must be unique.
2. Wait for the tool to confirm that the name is available.
3. Choose URL, Text, Email, Phone, SMS or Wi-Fi.
4. Enter the requested content.
5. Customize the QR if required.
6. Download PNG or SVG.

The first successful download registers the QR Name in the Google Sheet. The same QR Name cannot be reused for another QR code.

## Analytics

Open `analytics.html` from the header.

The page shows:

- total tracked QR codes
- total scans
- number of QR codes that have been scanned
- QR Name
- QR type
- scan count
- created date/time
- last scanned date/time
- recent scan timestamps for a selected QR Name

Use the search box to find a specific QR Name.

## Privacy and internal use

This repository is intended for **Ramani Groups internal use**. The reporting Sheet stores QR Name, QR type and scan timestamps/counts. QR content itself is not written to the reporting Sheet by this implementation.

The QR URL necessarily contains the encoded action data so the scan page can perform the requested action. Do not use this tool for secrets that should never appear inside a QR code or URL.

The current static GitHub Pages version does not provide employee authentication. If strict access control is required, add an authenticated hosting/access layer before using it for confidential internal data.

## Browser support

Modern versions of Chrome, Edge, Safari and Firefox. QR scanning behavior for phone, SMS and email actions depends on the scanner device and installed applications.

## License

See `LICENSE`.


## Google Sheets analytics integration

This build is configured to use the deployed Google Apps Script Web App in `js/config.js`. The backend source used for the deployment is also included at `apps-script/Code.gs` for reference.

Analytics supports QR totals, today and seven-day scan counts, per-QR scan history, device/browser/OS/referrer/IP/location metadata when available, CSV export, date filtering of scan details/exports, and permanent QR deletion. Deleting a QR also removes its scan-history rows so its QR Name can be reused. QR payload/content is not stored in Google Sheets.

IP-based location is best-effort and is collected by the redirect page through a third-party IP geolocation request; exact browser geolocation is used only if the visitor has already granted location permission. Metadata fields can therefore be blank when browsers, networks, privacy tools, or service availability prevent collection.
