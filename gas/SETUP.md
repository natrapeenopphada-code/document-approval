# S02 Online Approval Backend

Use the existing Google Apps Script project **อนุมัติเอกสาร**. Do not create a new project.

## Existing data source
- Google Sheet: Document Approval History
- Spreadsheet ID: 1PC7pGX-28NqCak_5bKdSRNT23LNUdACZDC4j1qb-Tj8
- Reuse the existing Approval Drive root; do not create a replacement root.

## Files in this branch
- gas/Code.gs — backend endpoints for Requests, Packets, Audit, Return and Proxy Approval
- src/online-api.ts — browser adapter for the Apps Script Web App
- src/online-workspace.ts — Secretary Inbox and Approval Packet UI

## Existing Apps Script setup
1. Open the existing Apps Script project "อนุมัติเอกสาร".
2. Back up the current Code.gs / รหัส.gs and Index.html before changes.
3. Add the backend functions from gas/Code.gs into the existing server code without deleting existing functions.
4. In Project Settings > Script Properties add:
   - APPROVAL_ROOT_FOLDER_ID = the existing Approval Hub root folder ID.
5. Update the existing Web App deployment by creating a new version. Keep the same deployment URL.
6. Paste that existing /exec URL into Document Workspace > ตั้งค่า > Online Approval Backend.
7. Use "ทดสอบการเชื่อมต่อ" and confirm:
   - authenticated user is returned
   - Document Approval History is reachable
   - Approval Drive root is configured

## Required QA before production
- Upload PDF -> Preview every page
- Place marker -> drag -> resize -> rotate
- Close/reopen -> Draft restores
- Create request in Requests sheet
- Secretary Inbox loads request
- Multiple ready requests -> Create Approval Packet
- Packet with any missing markers must be blocked
- Proxy approve packet -> reason required
- Return request -> reason required
- Audit rows written for every action
- Test on Windows desktop, iPad Safari, iPhone/Android browser
