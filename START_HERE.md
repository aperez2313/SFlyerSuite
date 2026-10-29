# Open Sedano's Email Suite on your computer

1. Download the ZIP from the `codex/site-download` branch on GitHub and **extract it**. Do not run it from inside the ZIP viewer.
2. Install Python 3 from https://www.python.org/downloads/ if it is not already installed. On Windows, enable **Add Python to PATH** during installation.
3. In the extracted folder:
   - **Windows:** double-click `Start-Windows.bat`.
   - **Mac:** open Terminal in the extracted folder and run `bash Start-Mac.command`.
4. The suite opens in your browser. Keep the terminal window open while using it. Press **Ctrl+C** in that window when finished.

If the browser does not open automatically, type `http://localhost:8000/index.html` in its address bar. If port 8000 is busy, close the previous suite server before starting another.

Choose **Flyer Revision QA** in the left navigation and upload your Email workbook and flyer PDFs. Only page 1 is inspected. Add the REPUBLICA workbook for market assignments and secondary verification. Missing files produce review warnings.

In **Flyer Lookup**, expand **Manage product links, verification & Google Sheets** to add, edit, delete and verify links. These changes are stored in your browser. Use the same browser profile to keep them; clearing browser site data removes local storage. Google starts disconnected and needs the setup described in `GOOGLE_SHEETS_SETUP.md`. SharePoint remains disabled.

The suite runs only on your computer. Starting this server does not publish a public website or upload your workbooks/PDFs. The Email workbook is never automatically overwritten by Flyer Revision QA.

The downloadable branch contains application code and libraries only. Uploaded workbooks, PDFs, derived test fixtures and reports are excluded. Complete validation requires both market flyers and the matching REPUBLICA script.
