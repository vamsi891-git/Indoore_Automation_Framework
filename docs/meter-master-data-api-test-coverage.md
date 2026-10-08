# Meter Master Data — API test coverage

Host observed: `https://api.mdm.mppkvvcl.bestinfra.app`.
Page that triggered the calls: `/master-data/meters`.

Every call below was seen in the browser while that page was open, except the two calls marked **not fired**. Those two are the next calls the same page makes, and they are listed so the import and the network hierarchy are not missed. Do not invent counts. Read `data.pagination.total` from the response you just received.

JSON calls use bearer auth and `Accept: application/json`. A success body is `{ success: true, data }`. A failure body is `{ success: false, error: { code, message } }`.

The UI checks for this page are in `docs/meter-master-data-test-coverage.md`.

## Calls fired by the meter list

| When | Method and path | Seen |
| --- | --- | --- |
| Page open, page change, search, applied filter | `GET /meters-data` | 200 |
| After each list page that has serials | `GET /master-data/meter-communication-status` | 200 |
| Hierarchy type set to Organisation | `GET /utils/hierarchies/organisation` | 200 |
| **Download** with no rows selected | `POST /master-data/export` | 200 |
| **Download Template** in Bulk Upload | `GET /master-data/bulk-upload-meters/template` | 200 |

## MMA-001 List meters

`GET /meters-data`

Fired on open, on page 2, on page 3, on search, and when Connection **DTR** was applied.

Query that the page sends:

| Query | Observed |
| --- | --- |
| `page` | `1` on open and after search. `2` and `3` when those pages were opened. |
| `limit` | `10` |
| `isActive` | `true` |
| `mappingStatus` | `mapped` |
| `q` | Sent only after search. Observed `q=85081195`. |
| `connection` | Sent only after apply. Observed `connection=dtr`. |
| `communicationStatus` | Sent only for Online (`communicating`) or Offline (`non-communicating`). |
| `organisationLookupId` or `networkLookupId` | Sent only after a hierarchy entity is applied. |

Observed URLs:

- `/meters-data?page=1&limit=10&isActive=true&mappingStatus=mapped`
- `/meters-data?page=2&limit=10&isActive=true&mappingStatus=mapped`
- `/meters-data?page=3&limit=10&isActive=true&mappingStatus=mapped`
- `/meters-data?page=1&limit=10&q=85081195&isActive=true&mappingStatus=mapped`
- `/meters-data?page=1&limit=10&isActive=true&mappingStatus=mapped&connection=dtr`

`200` body:

```text
success: true
data.columns: 12 column descriptors
data.rows: up to limit rows
data.pagination.page
data.pagination.limit
data.pagination.total
data.pagination.totalPages
```

Column keys returned, in order:

`slNo`, `meterSerialNumber`, `connection`, `meterRapdrpCode`, `assetId`, `mf`, `simNumber`, `ismiNumber`, `ipAddress`, `modemSerialNumber`, `modemImeiNumber`, `isActiveStatus`.

Row keys returned on the checked response:

`id`, `slNo`, `meterLookupTblRefId`, `meterSerialNumber`, `simNumber`, `ismiNumber`, `ipAddress`, `modemSerialNumber`, `modemImeiNumber`, `organisationLookupTblRefId`, `networkLookupTblRefId`, `isActiveStatus`, `connection`, `assetId`, `meterRapdrpCode`, `mf`, `mtr`, `mctr`, `lptr`, `lctr`, `accuracyClass`, `meterPoNumber`, `meterPoDate`, `meterTestingDate`, `displayDigitCount`, `deviceManufacturerTblRefId`, `meterManufacturer`, `meterModelTblRefId`, `meterModel`, `meterVersion`, `meterStatus`, `dlmsNonDlms`, `meterRating`.

Expected:

- Status 200 and `success` is true.
- `pagination.page` and `pagination.limit` match the query.
- `pagination.totalPages` is `total / limit`, rounded up.
- `rows.length` is `limit` on a full page, and the remainder on the last page.
- On the checked session, page 3 with `limit=10` returned `total` 127615 and `totalPages` 12762. Search `q=85081195` returned `total` 1 and `totalPages` 1. Connection `dtr` returned `total` 1195. Re-read the live total. Do not freeze these numbers.
- Each row `meterSerialNumber` contains `q` when `q` is a serial search.
- When `connection=dtr`, each returned row has connection DTR. When `connection=consumer`, each returned row has connection Consumer.
- `isActive=true` does not return inactive meters.
- A blank search omits `q`.

## MMA-002 Communication status for the visible serials

`GET /master-data/meter-communication-status`

Fired after the list, once the page has meter serials. It is not fired for an empty page.

Observed query:

`limit=10&meterSerialNumbers={comma-separated serials from the current rows}`

The serial list matches the `meterSerialNumber` values on that page. `limit` matches the list `limit`.

`200` body:

```text
success: true
data.activeMeters: number
data.communicatingCount: number
data.nonCommunicatingCount: number
data.columns: 4 column descriptors
data.rows: array
data.pagination.page
data.pagination.limit
data.pagination.total
data.pagination.totalPages
```

The page reads `meterSerialNumber` and `communicationStatus` from each row.

Expected:

- Status 200.
- Every requested serial that the service knows is present once.
- `communicationStatus` is only `communicating` or `non-communicating` when the page keeps the row.
- `pagination.limit` equals the requested `limit`.
- `communicatingCount` plus `nonCommunicatingCount` is consistent with the rows in that response.

## MMA-003 Organisation hierarchy

`GET /utils/hierarchies/organisation`

Fired when Hierarchy Type is set to **Organisation**. The list does not refetch until **Apply Filters**.

`200` body:

```text
success: true
data.items[]: id, code, name, order
```

Expected:

- Status 200.
- Each item has a positive `id`, a `name`, and an `order`.
- The level dropdown is filled from these items. No second hierarchy call is required to open that dropdown.

Network uses the same page action with `GET /utils/hierarchies/network`. That path was not fired in this pass because Hierarchy Type stayed on Organisation.

Typing in the hierarchy entity box calls `GET /utils/search/organisations` or `GET /utils/search/networks`. That search was not fired in this pass.

## MMA-004 Download the filtered list

`POST /master-data/export`

Fired by **Download** when no rows are selected. Observed status 200 for a one-row filtered list (`q=19271140`, `connection=dtr`).

Request:

- `Content-Type: application/json`
- `Accept: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json`
- Body:

```json
{
  "resource": "meter",
  "mode": "filtered",
  "filters": {},
  "selectedIds": [],
  "selectedCodes": [],
  "columns": []
}
```

`filters` carries the applied list filters only: trimmed `q`, `organisationLookupId` or `networkLookupId`, `isActive`, `mappingStatus` (`mapped`), `connection` (`consumer` or `dtr`), and `communicationStatus` (`communicating` or `non-communicating`). `page` and `limit` are not part of the export scope.

`columns` starts with `slNo` and then the visible column keys, without `actions`.

A selected download uses the same path with `mode: "selected"` and the selected meter ids in `selectedIds`. `filters` is empty for that mode. That selected call was not fired in this pass.

Expected:

- Status 200.
- The body is an Excel file, not a JSON error.
- The file contains the filtered set. A one-row filter does not export the full 127615 meters.
- An empty file is a failure on the page even if the status is 200.

`GET /master-data/export-jobs/{id}` and `GET /master-data/export-jobs/{id}/download` exist in the client and were not called by this Download button.

## MMA-005 Bulk upload template

`GET /master-data/bulk-upload-meters/template`

Fired by **Download Template**. Observed status 200.

Response content type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

The page saves the bytes as `Meters_Bulk_Upload_Template.xlsx`.

Expected:

- Status 200.
- The body is a non-empty `.xlsx` workbook.
- The header row contains the 24 template names in `docs/meter-master-data-test-coverage.md`, starting with **Meter Serial Number** and ending with **Meter Rating**.

## MMA-006 Bulk upload validate and submit

`POST /master-data/bulk-upload-meters`

**Not fired** in this pass. A `.csv` file was rejected in the browser before any import POST. A valid workbook was not uploaded, because this POST is the import call.

When a file passes the browser checks, **Validate** sends `multipart/form-data` with:

- `file`: the workbook
- `conflictMode`: `merge`

**Submit** sends the same file again with `conflictMode` `merge` or `override`.

Expected when this call is used:

- A rejected workbook does not reach this POST.
- `conflictMode` is only `merge` or `override`.
- A preview response does not change `GET /meters-data` `pagination.total` until submit succeeds.
- After a successful submit, a following list call can find the new or updated meter by `q`.

## Shell calls fired while the page is open

These are the signed-in app shell. They are not the meter list contract. They did return 200 on this page.

| Method and path | `data` keys observed |
| --- | --- |
| `GET /auth/refresh` | Called during load. |
| `GET /auth/me` | `user`, `permissions`, `isUltimate`, `tokenScopeStale`, `requiresMandatory2FASetup` |
| `GET /permissions/me/permissions` | `permissions` (string array) |
| `GET /permissions/me/modules` | `modules` |
| `GET /permissions/roles` | Called during load. |
| `GET /users/{id}` | Called during load for the signed-in user. |
| `GET /notifications/stats` | `total`, `read`, `unread` |
| `GET /auth/2fa/devices` | `devices`, `org2FARequired`, `canManage`, and the 2FA flags |

Expected:

- Each of these is 200 for a signed-in user who can open Meter Data.
- `permissions` includes the meter master read permission. Without it, the page must not call `GET /meters-data`.
- A 401 on these calls returns the user to login and does not paint meter rows.

## Coverage checklist

1. MMA-001: default list, page 2, page 3, `q`, `connection=dtr`, pagination math.
2. MMA-002: communication status uses the serials on the current page.
3. MMA-003: organisation hierarchy items `id`, `code`, `name`, `order`.
4. MMA-004: filtered export is an Excel file for the current filters.
5. MMA-005: template download is a non-empty `.xlsx`.
6. MMA-006: import POST stays uncalled for a non-xlsx file.
7. Shell: auth, permissions, notifications, and 2FA return 200 and do not replace the meter list.
