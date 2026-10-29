# Google Sheets for product links

The suite starts disconnected. Enter your own spreadsheet URL in the connection panel. No Google request occurs until **Connect & load**. SharePoint remains disabled.

In **Flyer Lookup → Manage product links, verification & Google Sheets**, you can add, edit, delete and verify links locally now. Multiple links are retained separately. **Set primary** chooses the single link used by the existing master lookup. Verification applies to the exact UPC + market + URL. Changing any of those clears it; changing the name does not. Flyer Revision QA displays saved verification for the exact workbook link.

## Your existing backend

The adapter uses the schema you supplied:

- `products`: appearance log, left unchanged.
- `master_products`: `upc, product_name, link, last_updated`; retains one primary link per UPC.
- `product_link_reviews`: created only on the first reviewed save; contains alternate links and verification metadata. It has `id, flyer, flyer_date, location, product_name, upc, link, imported_at, verified_at, verified_by, verification_key, is_primary` columns.

The connection uses Google's authenticated Sheets API directly. It does not enable or require the Apps Script deployment's anonymous write endpoint. The supplied Apps Script can still read primary links from `master_products`; it does not itself understand alternate-link review records.

## Connect

1. In your Google Cloud project, enable **Google Sheets API** and configure the OAuth consent screen. If the app is in testing, add your Google account as a test user.
2. Create an **OAuth client ID → Web application**. Add the exact origin where you serve this suite under **Authorized JavaScript origins**. For local use, register your actual loopback origin and port. For shared use, register the HTTPS site origin. A file opened via `file://` cannot use this OAuth flow.
3. Copy the public client ID ending in `.apps.googleusercontent.com` into the connection panel. A client secret is neither needed nor accepted by this app.
4. Enter your spreadsheet URL and keep the `product_link_reviews` tab name. Click **Connect & load**, sign in with an account that can edit the spreadsheet, and consent to Sheets access.
5. Review imported local rows. Existing local rows with the same ID are retained and reported as conflicts; choose edits explicitly. Use **Set primary** where there are alternate links.
6. Click **Review changes for Google**. Inspect every addition, edit and deletion. Click **Save reviewed changes to Google** to apply that plan. No save runs automatically.

Google's `spreadsheets` OAuth scope grants access to spreadsheets your account can access; the application restricts its requests to the entered spreadsheet ID. Tokens remain in memory and expire; reconnect when needed. Disconnect revokes the current token. Neither passwords nor tokens belong in chat, source files or saved environment instructions.

Required browser destinations: `accounts.google.com`, `sheets.googleapis.com`, `oauth2.googleapis.com`. Network settings may also need `docs.google.com` for opening the provided sheet. Local QA works without these destinations.

## Validation and limits

Local editing, verification, multiple links, persistence and disconnected behavior passed browser tests. The Google adapter passed mocked API tests for schema loading, literal cell values, primary-link preservation, review-tab creation, pre-save change detection and disconnect. **No real Google sign-in, read or write has been performed. An OAuth client ID is still required.**

Saving re-reads both affected tabs and rejects changes made since loading. Google Sheets does not provide a compare-and-swap transaction here: a collaborator editing between that check and the write is a remaining race. Avoid concurrent editing during a save. Unknown columns, duplicate master UPCs, formulas and malformed IDs stop sync for review. Auxiliary data from unrelated tabs is never included in a write request.

Host the suite as a static site; run `python3 -m http.server 8000 --bind 127.0.0.1` from the repository for local development. This onboarding session does not publish a site or deploy Google Cloud configuration.
