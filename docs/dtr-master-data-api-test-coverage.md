# DTR Master Data — API test coverage

Host observed: `https://api.mdm.mppkvvcl.bestinfra.app`.
Page that triggered the calls: `/master-data/dtrs`.

Every call below was seen in the browser while that page was open, except the calls marked **not fired**. Those are the next calls the same page makes, and they are listed so hierarchy apply, selected export, and the import are not missed. Do not invent counts. Read `data.pagination.total` from the response you just received.

JSON calls use bearer auth and `Accept: application/json`. A success body is `{ success: true, data }`. A failure body is `{ success: false, error: { code, message } }`.

The UI checks for this page are in `docs/dtr-master-data-test-coverage.md`.

## Calls fired by the DTR list

| When | Method and path | Seen |
| --- | --- | --- |
| Page open, page change, search, applied filter | `GET /master-data/dtr-master-data` | 200 |
| After each list page that has serials | `GET /master-data/meter-communication-status` | 200 |
| **Download** with no rows selected | `POST /master-data/export` | 200 |
| Hierarchy type set to Organisation or Network | `GET /utils/hierarchies/{kind}` | not fired in this pass |
| Hierarchy entity search | `GET /utils/search/organisations` or `GET /utils/search/networks` | not fired in this pass |
| **Download Template** | `GET /master-data/bulk-upload-dtr/template` | not fired in this pass |
| **Validate** or **Submit** | `POST /master-data/bulk-upload-dtr` | not fired. Do not post a header-valid file on a shared environment. |

Shell calls that also returned 200 on open: `GET /auth/refresh`, `GET /auth/me`, `GET /permissions/me/permissions`, `GET /permissions/me/modules`, `GET /permissions/roles`, `GET /users/{id}`, `GET /notifications/stats`, `GET /auth/2fa/devices`.

## DMA-001 List DTRs

`GET /master-data/dtr-master-data`

Fired on open, on page 2, on search, and when **Online** was applied.

Query that the page sends:

| Query | Observed |
| --- | --- |
| `page` | `1` on open and after search. `2` when page 2 was opened. |
| `limit` | `10` |
| `q` | Sent only after search. Observed `q=GPH0000304`. |
| `communicationStatus` | Sent only after apply. Observed `communicationStatus=communicating`. |
| `organisationLookupId` or `networkLookupId` | Sent only after a hierarchy entity is applied. Not fired in this pass. |

The open request does not send `isActive`, `mappingStatus`, `q`, `connection`, or `communicationStatus`.

Observed URLs:

- `/master-data/dtr-master-data?page=1&limit=10`
- `/master-data/dtr-master-data?page=2&limit=10`
- `/master-data/dtr-master-data?page=1&limit=10&q=GPH0000304`
- `/master-data/dtr-master-data?page=1&limit=10&q=GPH0000304&communicationStatus=communicating`
- `/master-data/dtr-master-data?page=1&limit=10&communicationStatus=communicating`

`200` body:

```text
success: true
data.columns: 16 column descriptors
data.rows: up to limit rows
data.pagination.page
data.pagination.limit
data.pagination.total
data.pagination.totalPages
```

Column keys returned, in order:

`slNo`, `circle`, `division`, `zone`, `subStation`, `feederName`, `feederCode`, `dtrCode`, `newDtrCode`, `dtrCapacity`, `meterSerialNumber`, `meterMake`, `mf`, `latitude`, `longitude`, `serviceDate`.

Row keys returned on the checked response:

`id`, `slNo`, `circle`, `division`, `zone`, `subStation`, `feederCode`, `feederName`, `dtrCode`, `newDtrCode`, `dtrCapacity`, `dtrName`, `meterSerialNumber`, `meterMake`, `mf`, `latitude`, `longitude`, `serviceDate`, `meterLookupTblRefId`.

Expected:

- Status 200 and `success` is true.
- `pagination.page` and `pagination.limit` match the query.
- `pagination.totalPages` is `total / limit`, rounded up.
- `rows.length` is `limit` on a full page, and the remainder on the last page.
- On the checked session, page 1 with `limit=10` returned `total` 1202 and `totalPages` 121. Search `q=GPH0000304` returned `total` 1 and `totalPages` 1. **Online** with no search returned `total` 1. Re-read the live total. Do not freeze these numbers.
- A search row contains `q` in `dtrCode`, `newDtrCode`, `feederCode`, `feederName`, or `meterSerialNumber`.
- `communicationStatus=communicating` and `communicationStatus=non-communicating` are each a subset of the unfiltered total. The two totals are not required to add up to the unfiltered total. A serial returned as online is not also returned as offline, and the reverse.
- A blank search omits `q`.
- `limit=20` and `limit=50` return at most that many rows, and `totalPages` is `total / limit`, rounded up.
- A page past `totalPages` returns 200 with either no rows or the last page.
- A search with no match returns `total` 0 and no rows.
- `metric=DTRs ON` is sent only for the overview shortcut. `selectedIds` is a comma-separated list of positive integers, or an empty value when the list is empty. Do not send `metric=DTRs ON` together with `communicationStatus`.

## DMA-002 Communication status for the visible serials

`GET /master-data/meter-communication-status`

Fired after the list, once the page has meter serials. It is not fired for an empty page.

Observed query:

`limit=10&meterSerialNumbers={comma-separated serials from the current rows}`

After the one-row search the query was `limit=1&meterSerialNumbers=19271515`.

`200` body:

```text
success: true
data.activeMeters
data.communicatingCount
data.nonCommunicatingCount
data.columns: slNo, meterSerialNumber, communicationStatus, lastCommunication
data.rows
data.pagination.page, limit, total, totalPages
```

Expected:

- Status 200.
- `communicatingCount` plus `nonCommunicatingCount` equals `activeMeters`.
- `pagination.limit` equals the number of serials requested.
- Every requested serial is present in `rows`.

## DMA-003 Hierarchy ids

`GET /utils/hierarchies/organisation` and `GET /utils/hierarchies/network` return `data.items` with `id`, `name`, and `order`.

`GET /utils/search/organisations` and `GET /utils/search/networks` take `hierarchyId` and `limit`.

Expected when an entity id from that search is sent to the list:

- `organisationLookupId` or `networkLookupId` is the id that was chosen.
- The other id is absent.
- The filtered `pagination.total` is less than or equal to the unfiltered total.

These lookup calls were not fired in this browser pass. The list builder does send the id once the page applies an entity.

## DMA-004 Export

`POST /master-data/export`

Accept: spreadsheetml. Body is JSON.

Filtered body observed for `q=GPH0000304`:

```json
{
  "resource": "dtr",
  "mode": "filtered",
  "filters": { "q": "GPH0000304" },
  "selectedIds": [],
  "selectedCodes": [],
  "columns": [
    "slNo", "circle", "division", "zone", "subStation", "feederName", "feederCode",
    "dtrCode", "newDtrCode", "dtrCapacity", "meterSerialNumber", "meterMake", "mf",
    "latitude", "longitude", "serviceDate"
  ]
}
```

Response: HTTP 200, content type `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, 6256 bytes.

Expected:

- Status 200 for a one-row filtered export, or 202 when the service queues a job. A queued job is not a downloaded file.
- The first sheet header row is **Sl No.** followed by the visible column labels, in the `columns` order.
- The data row count equals the filtered `pagination.total`.
- `filters` carries trimmed `q`, one hierarchy id, and `communicationStatus` when that filter is applied. It does not carry `page` or `limit`.
- `mode: "selected"` with one `meterLookupTblRefId` returns one data row. This mode was not fired in this pass.
- Export with `communicationStatus` or a hierarchy id, when the filtered total is more than one row, returns that many data rows. Prefer a filter whose total is small.
- A missing token or a bad bearer returns 401.
- Export without the CSRF cookie returns 403 `CSRF_MISSING`.

## DMA-005 Bulk template

`GET /master-data/bulk-upload-dtr/template`

Not fired in this pass. The page calls it from **Download Template**.

Expected:

- Status 200.
- Content type includes `spreadsheetml`.
- The file starts with a zip header (`PK`).
- The first row equals these 22 headers, in order:

Zone, Sub Station, Feeder, DTR Code, DTR Name, DTR Capacity (KVA), Status, Meter Serial Number, Main/Sub Meter, Service Point ID, Meter Phase, Connected To DCU, SIM No., IMSI No., IP Address, Modem Serial Number, Modem IMEI, Meter Initial Reading, Latitude, Longitude, DTR Address, Remarks.

## DMA-006 Import

`POST /master-data/bulk-upload-dtr`

Multipart fields: `file`, `conflictMode`.

Not fired in this pass. The browser posts only after its own file checks pass, so a header-valid workbook is an import. Do not post one on a shared environment.

Safe API files are files the service must reject without inserting a row:

- a `.csv` or other non-xlsx body
- an `.xlsx` with a required header missing
- an `.xlsx` with only the header row
- an `.xlsx` with an empty sheet
- an `.xlsx` with a duplicate header

Expected:

- Status 400, 415, or 422, or a 2xx body whose `success` is not true.
- The list `pagination.total` after the call equals the total from before the call.
- A missing token or a bad bearer returns 401.

The client does not check DTR cell values before this POST. Row-level rules belong in the browser file checks only when they reject the file before the POST. They are not a reason to upload a valid-looking row.

## DMA-007 Access

Observed permission key on the signed-in user: `dtrs.view`. Create is `dtrs.create`. The page key is `dtrMasterData`.

Expected:

- Each read above returns 401 with no token and 401 with `Authorization: Bearer not-a-token`.
- A user without `dtrs.view` cannot read the list. The only local user is `validAdmin`, so a stripped session is a web check unless a second user exists.
- A user without `dtrs.create` can still read the list. Create denial is a web check for the same reason.
