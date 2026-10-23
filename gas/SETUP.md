# S02 Online Approval Backend

Use the existing Google Apps Script project **อนุมัติเอกสาร**. Do not create a new project.

## Existing data source
- Google Sheet: Document Approval History
- Spreadsheet ID: 1PC7pGX-28NqCak_5bKdSRNT23LNUdACZDC4j1qb-Tj8
- Drive root: Document Approval WebApp
- Root folder ID: 1uBqy7lmA-3z-tE9ToZJfEIES25SCCUWp
- Original Documents folder ID: 13L7XIYCXay_DeTa9tvWFJr7PwtDO5ygF
- Approved Documents folder ID: 1BjCYKHh9_4YDf1ZHT7wvkm_gubeb-hJX
- Assets folder ID: 1kpGV9WvWz6dsbmRmKF1m4Rn9Vpowe3o1

## Shared sheets
The existing History tab is preserved untouched.

New online workflow tabs:
- Requests
- Packets
- Audit
- Config
- Companies
- Signers
- Delegations

## Files in this branch
- gas/Code.gs — backend endpoints for Requests, Packets, Audit, Return, master data and delegated Proxy Approval
- src/online-api.ts — browser adapter for Apps Script Web App
- src/online-workspace.ts — Secretary Inbox and Approval Packet UI

## Existing Apps Script setup
1. Open the existing Apps Script project **อนุมัติเอกสาร**.
2. Back up the current `รหัส.gs` / server source and `Index.html` before changes.
3. Merge the backend functions from `gas/Code.gs` into the existing server source. Do not delete existing functions that are still in use.
4. Do not create a replacement spreadsheet or Drive root.
5. Deploy/update the Web App using a new version of the existing deployment.
6. For auditable Proxy Approval, deploy so the application can identify the user accessing the Web App. Verify `Session.getActiveUser().getEmail()` returns the signed-in user's company email in the actual deployment.
7. Keep access limited to the intended company users; do not make the approval backend anonymous/public.
8. Put the resulting existing `/exec` Web App URL into Document Workspace > ตั้งค่า > Online Approval Backend.
9. Use **ทดสอบการเชื่อมต่อ** and confirm the authenticated user, shared Sheet, and Drive folders are reachable.

## Delegated / Proxy Approval
Populate the Delegations tab only with explicit authorization.

Columns:
- id
- signerKey
- delegateEmail
- companyCodesJson
- startAt
- endAt
- scope
- maxAmount
- reason
- active
- updatedAt

Proxy Approval is rejected when:
- the reason is blank
- the user email cannot be identified
- no active delegation matches the executive signer
- the company is outside delegation scope
- the delegation is outside its date range
- a document has no approval marker

## Required QA before production
- Upload PDF -> Preview every page
- Place marker -> drag -> resize -> rotate
- Different marker sizes per document/page in one packet
- Close/reopen -> Draft restores
- Create request in Requests
- Secretary Inbox loads the same request from another device
- Multiple ready requests -> Create Approval Packet
- Packet with any missing markers must be blocked
- Signer must be authorized for every company in the packet
- Proxy approve -> reason required + active Delegation required
- Return request -> reason required
- Audit rows written for every action
- Original PDF stored separately from Approved PDF
- Test Windows desktop
- Test iPad Safari portrait and landscape
- Test mobile browser
- Final PDF marker coordinates match the original PDF, not the preview image

Do not merge the feature branch into main or deploy production until the above QA gates pass.
