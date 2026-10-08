# DTR Master Data — test coverage

Page under test: `/master-data/dtrs`.
Title: **DTR Data**. Breadcrumb: **Master Data / DTR Data**.

Open it from **Master Data** in the sidebar, then **DTR Data**. Do not hard-code live counts. Read the list response the page itself receives. Unwrap `{ success: true, data }` before reading `rows` and `pagination.total`. The footer **of N** must equal `data.pagination.total`.

This file covers the list, search, filters, totals, paging, download, bulk upload, and the empty, denied, and failed states. DTR detail (`/dtr/{code}`) and Add DTR (`/master-data/dtrs/new`) are separate pages. They are covered here only as the result of a button. The DTR Overview dashboard is covered in `docs/dtr-overview-test-coverage.md`. The API checks are in `docs/dtr-master-data-api-test-coverage.md`.

Checked on `https://mdm.mppkvvcl.bestinfra.app` while signed in. On that session the first list was `GET /master-data/dtr-master-data?page=1&limit=10`, HTTP 200, footer **Showing 1–10 of 1202**, last page **121**. Those counts will move. Use them only as a worked example of the paging rule.

## List request

`GET /master-data/dtr-master-data`

| Query | When it is sent |
| --- | --- |
| `page` | Current page. The address bar does not store `page`. |
| `limit` | Page size. Default **10**. Choices are **10**, **20**, and **50**. The stored size is clamped to 1–100. |
| `q` | Search text after a 300 ms debounce, trimmed. Blank search is omitted. |
| `organisationLookupId` | Applied organisation scope, positive id only. |
| `networkLookupId` | Applied network scope, positive id only. The two ids are not sent together. |
| `communicationStatus` | Sent only for **Online** (`communicating`) or **Offline** (`non-communicating`). **All** omits it. |
| `metric` | Sent only when this page was opened from the **DTRs ON** card and the navigation state is not `selected_period`. The value is `DTRs ON`. While that metric is active, `communicationStatus` is not sent. |
| `selectedIds` | Sent when navigation state carries an id list and the **DTRs ON** shortcut above is not active. Values are positive integers. An empty list is sent as `selectedIds=` with an empty value. |

This page does not send `isActive` or `mappingStatus` on its own. The request builder can also send `mappingStatus`, `meterPhase`, `meterCategory`, `fromDate`, `toDate`, `presenceInRange`, `preferredMeterOnly`, and `totalsOnly`. The DTR Data screen has no controls for those, so a normal visit does not send them.

A URL `communicationStatus=communicating` or `communicationStatus=non-communicating` is applied as the starting communication filter. Any other communication value, including `never-communicated`, is treated as **All** and is not sent. `selectedIds` and `metric` on this page come from navigation state when a DTR Overview card opens the list. They are not typed into the filter panel.

## Columns

Serial **S.No** is the row number on the page. It is not an API field. The API `slNo` is not shown as its own column.

Default visible columns, in order: Circle, Division, Zone, Sub Station, Feeder Name, Feeder Code, DTR Code, New DTR Code, DTR Capacity, Meter SL No, Meter Make, MF, Latitude, Longitude, ServiceDate, Actions.

**Actions** cannot be hidden and stays in the last column. These keys are never shown as their own columns: `id`, `slNo`, `dtrName`, `meterLookupTblRefId`.

Each row has **Copy Feeder Code**, **Copy DTR Code**, **Copy Meter Serial Number**, and **View DTR details**. There is no edit or delete action on this list. **View DTR details** opens `/dtr/{code}`, using New DTR Code when it is present and DTR Code otherwise. A row with neither code disables the button with **DTR identifier unavailable**.

The pager is labelled **DTR Data pages**.

## DMD-001 Page opens

1. Sign in with read access to `dtrMasterData` (`dtrs.view`).
2. Open **Master Data**, then **DTR Data**.

Expected:

- URL path is `/master-data/dtrs`.
- Title is **DTR Data**.
- Breadcrumb is **Master Data / DTR Data**.
- Search placeholder is **Search ...**. The accessible name is **Search DTR master data**. The search id is `dtr-master-search`.
- The first list call is HTTP 200 with `page=1` and `limit=10`, and no `q`, `connection`, `communicationStatus`, `organisationLookupId`, or `networkLookupId`.
- Footer is **Showing 1–10 of N** when N is at least 10, and N equals `data.pagination.total`.
- **S.No** starts at 1.
- **Bulk Upload** is shown only when the user can create DTR master data (`dtrs.create`). **Download** is shown for a user who can read the page.
- While the first page is loading, **Download** is disabled. Numbers from a previous filter are not shown as the new result.
- After the list returns serials, the page calls `GET /master-data/meter-communication-status` with those serials. An empty page does not call it.

## DMD-002 Search

1. Type a DTR code, feeder code, or meter serial from the current list.
2. Wait for the debounced request.
3. Clear the search with **Clear search**.

Expected:

- `q` on the settled request equals the trimmed text, and `page` is `1`.
- Applied filters stay on the request. A search does not drop `communicationStatus` or a hierarchy id.
- The footer total equals `data.pagination.total`. A single match shows **Showing 1–1 of 1** and hides the page buttons and the page-size control. The row checkbox is still shown.
- A search with no match shows heading **No DTR Rows**. The footer is not **Showing 1–10 of 0**. **Download** is disabled.
- Clearing search removes `q` and reloads page 1 with the filters that are still applied.
- Spaces-only input does not send `q`.

Worked example from the checked session: searching `GPH0000304` sent `page=1&limit=10&q=GPH0000304` and the footer was **Showing 1–1 of 1**. The search was started on page 2, and one earlier request still carried `page=2` with that `q`. The request that settled the screen was page 1.

## DMD-003 Advanced filters

Turn **Advanced Filters** on. The switch id is `dtr-master-advanced-filters-toggle`. The panel shows these controls, in this order:

| Control | Default label on the screen |
| --- | --- |
| Hierarchy Type | **Hierarchy type** |
| Hierarchy level | **Hierarchy level to search within**. Disabled until a type is chosen. |
| Hierarchy entity | **Hierarchy entity filter**. Disabled until a type is chosen. |
| Communication | **All**, **Online**, **Offline**. **All** is selected. |

The panel actions are **Reset Filters** and **Apply Filters**.

1. Apply one filter at a time with **Apply Filters**.
2. After each apply, read the request and the footer.
3. Choose **Reset Filters**.

Expected:

- Nothing changes until **Apply Filters**. Choosing a radio or a hierarchy value and not applying leaves the current list and the current request.
- After apply, the panel closes and the switch reads **Advanced Filters · N Applied**. N counts a hierarchy scope as 1 and a communication choice as 1. Search text is not counted.
- **All** sends no `communicationStatus`. **Online** sends `communicationStatus=communicating`. **Offline** sends `communicationStatus=non-communicating`.
- Hierarchy Type is **Organisation** or **Network**. A positive organisation id sends `organisationLookupId`. A positive network id sends `networkLookupId`. The two ids are not sent together.
- While hierarchy lookups are loading, the filter controls, radios, **Reset Filters**, and **Apply Filters** are disabled. A lookup failure is shown on the hierarchy control and does not invent filter options.
- **Reset Filters** returns the panel to **All** with no hierarchy, and reloads page 1 with `page` and `limit` only.
- A filter with no rows uses heading **No DTR Rows**. With no hierarchy id, the description is **No records match your search or filters.** When a hierarchy filter is also applied, the description is **No records match your search, hierarchy filter, and scope.**
- Changing search or an applied filter clears the row selection and returns to page 1.

Checked session: **Online** applied on top of `q=GPH0000304` sent `page=1&limit=10&q=GPH0000304&communicationStatus=communicating`, returned total 0, and the switch read **Advanced Filters · 1 Applied**. The empty description on screen was **No Records Match Your Search, Hierarchy Filter, And Scope.** even though the request had no hierarchy id. The source text for a hierarchy-empty list is that sentence. Until product confirms the copy, record the visible description and do not treat the extra words "hierarchy filter" as a passed check when no hierarchy id was sent. Clearing search after that kept `communicationStatus=communicating` and dropped `q`. On that session the online list total was 1. Re-read the live total.

## DMD-004 Total

1. Open the page with no extra filters.
2. Apply **Online**, then **Offline**, then **All**.
3. Apply one hierarchy entity.
4. Combine communication with search.

Expected:

- Every successful list response has `data.pagination.total` equal to the footer **of N**.
- The page count is `total / limit`, rounded up. On page size 10, a total of 1202 ends on page 121. The last page shows only the remainder (`total % limit`, or a full page when the remainder is 0). For 1202 and limit 10, the last page has 2 rows.
- **Online** total plus **Offline** total is not required to equal the unfiltered total.
- A failed list does not paint `total: 0` from the error body. The grid does not keep the previous rows as if they were the new result.

## DMD-005 Paging and page size

1. Go to page 2.
2. Change page size to 20, then 50.
3. Move to a page, then change the page size.
4. Open a result whose total is smaller than 10.

Expected:

- Page 2 sends `page=2`. The address bar stays `/master-data/dtrs` with no `page` query. **S.No** continues from the previous page. On page size 10, page 2 starts at **11** and the footer is **Showing 11–20 of N**.
- Page size 20 sends `limit=20` and the control reads **20 / page**. Size 50 sends `limit=50`. The default control reads **10 / page**.
- The menu offers only 10, 20, and 50.
- The page-size control is shown only when `data.pagination.total` is at least 10.
- Changing page size returns to page 1.
- **Previous page** is disabled on page 1. **Next page** is disabled on the last page.
- A page past the end is replaced by the last valid page. When the total is 0, the pager is hidden.

## DMD-006 Download

1. With no rows selected, click **Download** on a filtered list. Prefer a search that returns a small total so the file is the filtered set, not the whole utility.
2. Select one row and click **Download** again.
3. Repeat while the list request is still loading, and again on an empty result.

Expected:

- The button label is **Download**, then **Downloading…**, and it is disabled while the file is being built.
- With no selection, the call is `POST /master-data/export` with `resource: "dtr"` and `mode: "filtered"`. Filters are the applied search and filters only: trimmed `q`, organisation or network id, and `communicationStatus` when Online or Offline is applied. `page` and `limit` are not the export scope. The saved file name used by the client is **DTR Master Data.xlsx**.
- Success message: **DTR master data downloaded successfully.**
- With rows selected, the same button uses `mode: "selected"` and the selected meter lookup ids (`meterLookupTblRefId` when it is a positive number, otherwise a positive row id). Success message: **Downloaded N selected DTR.** or **Downloaded N selected DTRs.**
- An empty download file fails with **Download file was empty.**
- A failed filtered download says **Unable to download DTR master data right now.** A failed selected download says **Unable to download selected DTR rows right now.**
- No selection when a selected download is required: **No selected DTR rows to download.**
- A selected id that cannot be resolved: **Some selected rows could not be resolved. Open View Selected or re-select rows after loading each page.**
- **Download** is disabled while the list is loading, while the export is running, and when the total is 0 and nothing is selected.

When the page was opened from a DTR Overview card that sets a metric title, **Download** builds the file from the filtered rows in the browser instead of the filtered export above, and the success text is **Downloaded N record.** or **Downloaded N records.** A failure on that path says **Unable to download DTR data right now.**

Checked session: search `GPH0000304` (1 row) sent this body and returned HTTP 200, content type `spreadsheetml.sheet`:

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

The button showed **Downloading…** and returned to **Download**.

## DMD-007 Bulk upload

**Bulk Upload** is visible only when the user can create DTR master data. It opens the dialog titled **Bulk Upload DTR**.

### Dialog

- Title **Bulk Upload DTR**.
- Description: **Upload an Excel (.xlsx) file to add multiple DTR records at once.**
- Template row **Need a template?**, file name **DTRs_Bulk_Upload_Template.xlsx**, and **Download Template**.
- Drop zone: **Upload DTR List**, **Drag & drop or click to browse**. The file input accepts `.xlsx` only. Its id ends with `-bulk-file-input`. The entity key is `dtr`, so the expected id is `dtr-bulk-file-input`.
- **Validate** stays disabled until a file is chosen.
- **Download Template** calls `GET /master-data/bulk-upload-dtr/template` and saves `DTRs_Bulk_Upload_Template.xlsx`.

### File checks

These run in the browser when **Validate** is clicked. A file that fails here is not posted. The alert title is **File validation failed**.

| File | Result |
| --- | --- |
| Extension is not `.xlsx` | **Only .xlsx files are allowed.** |
| `.xlsx` name whose browser type is not an Excel type, `application/octet-stream`, or blank | **Only Excel (.xlsx) files are allowed. Images, PDF, and other formats are not supported.** |
| Larger than 5 MB | **File size must not exceed 5 MB.** |
| Workbook cannot be read, or has no sheet | **File must be readable and follow the approved template.** |
| Header row is blank | **Required columns must be present.** |
| A required header is missing | **Required columns must be present. Missing:** then the missing names. Header match ignores case. |
| Duplicate header, ignoring case | **Duplicate column names are not allowed:** then the names. |
| No data row, or only blank data rows | **File must contain at least one data row.** |

Required headers, in template order:

Zone, Sub Station, Feeder, DTR Code, DTR Name, DTR Capacity (KVA), Status, Meter Serial Number, Main/Sub Meter, Service Point ID, Meter Phase, Connected To DCU, SIM No., IMSI No., IP Address, Modem Serial Number, Modem IMEI, Meter Initial Reading, Latitude, Longitude, DTR Address, Remarks.

The DTR client checks the file and the header row only. It does not check cell values before **Validate** posts. A workbook that has every required header and one data row is posted to `POST /master-data/bulk-upload-dtr` with `conflictMode`. Do not run **Validate** or **Submit** on a header-valid file on a shared environment. Use a non-xlsx file, a missing header, a duplicate header, an empty sheet, or a file with no data row.

## DMD-008 Selection and view

1. Select two rows.
2. Click **Download**.
3. Clear the selection by changing the search.
4. Use **View DTR details** on a row that has a DTR code.

Expected:

- The header checkbox selects and clears the rows on the current page. The checkbox name is **Select all rows**. A row checkbox name includes the page, the S.No, the DTR code, and the meter serial.
- A selected download uses those rows. Clearing search or applying a filter clears the selection.
- **View DTR details** opens `/dtr/{code}`. Do not change data on that page as part of this list check.

## DMD-009 Access and failures

| Condition | Expected |
| --- | --- |
| User lacks `dtrs.view` | Title **DTR Data**. **Access denied**. **You need dtrs.view to view DTR data.** No list rows. **Bulk Upload** is hidden. |
| User lacks `dtrs.create` | **Bulk Upload** is hidden. The list and **Download** remain. |
| Permission request fails | **Unable to load your permissions. Try refreshing the page.** |
| Signed out | The app returns to login. |
| `dtr-master-data` fails | The grid does not show rows from the failed body, and the footer is not **of 0** unless a successful body says total 0. |
| Empty scope and no search or filter | **No records match your scope, or the dataset is empty.** |

## DMD-010 Edges

| ID | Condition | Expected |
| --- | --- | --- |
| DMD-090 | `q` is `  GPH0000304  ` | Request `q` is `GPH0000304`. |
| DMD-091 | URL `communicationStatus=never-communicated` | The value is ignored. The request does not send it. |
| DMD-092 | URL `communicationStatus=communicating` | The communication control starts on **Online** and the request sends `communicationStatus=communicating`. |
| DMD-093 | URL `communicationStatus=bogus` | The request does not send `communicationStatus`. |
| DMD-094 | Total is 0 on a successful response | Heading **No DTR Rows**. The pager is hidden. The footer is not **Showing 1–10 of 0**. |
| DMD-095 | One row only | The row checkbox is still shown. Page size and page buttons are hidden. Footer is **Showing 1–1 of 1**. |
| DMD-096 | Page size changed while on page 2 | The next request is `page=1` with the new `limit`. |
| DMD-097 | File over 5 MB, then **Validate** | **File size must not exceed 5 MB.** No import POST. |
| DMD-098 | Non-xlsx chosen, then **Validate** | **Only .xlsx files are allowed.** No import POST. |

## Out of this page

| Screen | Why it is separate |
| --- | --- |
| DTR detail | `/dtr/{code}`, opened by **View DTR details** |
| Add DTR | `/master-data/dtrs/new` |
| DTR Overview | `/dtr/dashboard`, covered in `docs/dtr-overview-test-coverage.md` |
| Meter Data | `/master-data/meters` |
| Consumer Data | `/master-data/consumers` |

## Coverage checklist

1. DMD-001: route, title, breadcrumb, first page, no extra query on open.
2. DMD-002: search, trimmed `q`, single match, no match, clear, filters kept.
3. DMD-003: hierarchy, communication, badge count, apply, reset.
4. DMD-004: footer total equals `data.pagination.total` for the unfiltered list and each filter.
5. DMD-005: pages 10, 20, and 50, serial numbers, last page remainder.
6. DMD-006: filtered download and selected download, disabled states, failure text.
7. DMD-007: template download, file rejection, required headers, no import POST on a rejected file.
8. DMD-008: select, view route.
9. DMD-009: missing permission, missing create, failed list.
10. DMD-090 to DMD-098: bad query values, empty total, one row, page size reset, oversized file, non-xlsx file.
