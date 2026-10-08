# Meter Master Data — test coverage

Page under test: `/master-data/meters`.
Title: **Meter Data**. Breadcrumb: **Master Data / Meter Data**.

Open it from **Master Data** in the sidebar, then **Meter Data**. Do not hard-code live counts. Read the list response the page itself receives. Unwrap `{ success: true, data }` before reading `items` and `total`. The footer **of N** must equal `data.total`.

This file covers the list, search, filters, totals, paging, download, bulk upload, and the empty, denied, and failed states. Add Meter (`/master-data/meters/add-meter`) and Edit Meter (`/master-data/meters/{id}/edit`) are separate pages. They are covered here only as the result of a button or a row action.

Checked on `https://mdm.mppkvvcl.bestinfra.app` while signed in. On that session the first list was `GET /meters-data?page=1&limit=10&isActive=true&mappingStatus=mapped`, HTTP 200, footer **Showing 1–10 of 127615**, last page **12762**. Those counts will move. Use them only as a worked example of the paging rule.

## List request

`GET /meters-data`

| Query | When it is sent |
| --- | --- |
| `page` | Current page. The address bar does not store `page`. |
| `limit` | Page size. Default **10**. Choices are **10**, **20**, and **50**. The stored size is clamped to 1–100. |
| `q` | Search text after a 300 ms debounce, trimmed. Blank search is omitted. |
| `isActive` | Always sent on this page. Default **`true`**. The screen has no Active/Inactive control. `false` and `all` are accepted by the request builder only when the value is already one of those three. |
| `mappingStatus` | Default **`mapped`**. A URL value of `mapped` or `unmapped` is kept. Any other value is ignored and the request still sends `mapped`. |
| `organisationLookupId` | Applied organisation scope, positive id only. |
| `networkLookupId` | Applied network scope, positive id only. |
| `connection` | **Consumer** sends `consumer`. **DTR** sends `dtr`. **All** omits it. The request builder also accepts `feeder` and `substation`, but the screen menu does not offer them. |
| `communicationStatus` | Sent only for **Online** (`communicating`) or **Offline** (`non-communicating`). **All** omits it. |

`assetType`, `fromDate`, `toDate`, and `presenceInRange` are part of the shared meters query builder. This page does not show those controls and does not send them.

A URL `communicationStatus=communicating` or `communicationStatus=non-communicating` is applied as the starting communication filter. Any other communication value is treated as **All**.

## Columns

Serial **S.No** is the row number on the page. It is not an API field.

Default visible columns, in order: Meter SL No., Connection, MF, SIM Number, IMSI Number, IP Address, Modem Serial No., Modem IMEI No., Actions.

**Actions** cannot be hidden and stays in the last column. A new column returned by the API is added to the visible set. These keys are never shown as their own columns: `id`, `slNo`, `meterLookupTblRefId`, `organisationLookupTblRefId`, `networkLookupTblRefId`, `isActiveStatus`, `meterRapdrpCode`, `assetId`.

Each row has **Copy Meter Serial Number**, **Edit meter**, and **Delete meter**.

## MMD-001 Page opens

1. Sign in with read access to `meterMasterData`.
2. Open **Master Data**, then **Meter Data**.

Expected:

- URL path is `/master-data/meters`.
- Title is **Meter Data**.
- Breadcrumb is **Master Data / Meter Data**.
- Search placeholder is **Search by Meter SL No or Modem Serial No**. The search name is `meter-master-search`.
- The first list call is HTTP 200 with `page=1`, `limit=10`, `isActive=true`, `mappingStatus=mapped`, and no `q`, `connection`, or `communicationStatus`.
- Footer is **Showing 1–10 of N** when N is at least 10, and N equals `data.total`.
- **S.No** starts at 1.
- **Bulk Upload** is shown only when the user can create meter master data. **Download** is shown for a user who can read the page.
- While the first page is loading, **Download** is disabled and the grid shows skeleton rows. Numbers from a previous filter are not shown as the new result.

## MMD-002 Search

1. Type a meter serial or a modem serial from the current list.
2. Wait for the debounced request.
3. Clear the search with **Clear search**.

Expected:

- `q` on the request equals the trimmed text.
- Page returns to 1. Any selected rows are cleared.
- Applied filters stay on the request. A search does not drop `connection` or `communicationStatus`.
- The footer total equals `data.total`. A single match shows **Showing 1–1 of 1** and hides the page buttons and the page-size control.
- A search with no match uses the empty description **No records match your search or filters.** The footer is not **Showing 1–10 of 0**.
- Clearing search removes `q` and reloads page 1 with the filters that are still applied.
- Spaces-only input does not send `q`.

Worked example from the checked session: with Connection **DTR** already applied, searching `19271140` sent `page=1&limit=10&q=19271140&isActive=true&mappingStatus=mapped&connection=dtr` and the footer was **Showing 1–1 of 1**.

## MMD-003 Advanced filters

Turn **Advanced Filters** on. The panel shows these controls, in this order:

| Control | Default label on the screen |
| --- | --- |
| Hierarchy Type | Hierarchy Type |
| First hierarchy level | Select Hierarchy |
| Hierarchy entity | Select Hierarchy, or **Search organisation hierarchy** after Organisation is chosen |
| Connection | Connection. Menu: **All**, **Consumer**, **DTR** |
| Communication | **All**, **Online**, **Offline**. **All** is selected. |

The panel actions are **Reset Filters** and **Apply Filters**.

1. Apply one filter at a time with **Apply Filters**.
2. After each apply, read the request and the footer.
3. Choose **Reset Filters**.

Expected:

- Nothing changes until **Apply Filters**. Closing the panel, or editing a dropdown and not applying, leaves the current list and the current request.
- After apply, the panel closes and the switch reads **Advanced Filters · N Applied**. N is the number of applied advanced filters: hierarchy scope counts as 1, connection counts as 1, communication counts as 1. The default `isActive=true` and `mappingStatus=mapped` are not counted.
- **Consumer** sends `connection=consumer`. **DTR** sends `connection=dtr`. **All** omits `connection`.
- A Consumer request is not expected to return a row whose Connection is DTR, and a DTR request is not expected to return a row whose Connection is Consumer. Product has not confirmed that rule. Until it is confirmed, a mismatched label is logged as **ISSUE MMA-001** with the row id and serial, and the check stays soft. Consumer plus DTR is not required to equal the unfiltered total.
- **All** sends no `communicationStatus`. **Online** sends `communicationStatus=communicating`. **Offline** sends `communicationStatus=non-communicating`.
- Hierarchy Type is **Organisation** or **Network**. The level and entity controls stay disabled until a type is chosen. A positive organisation id sends `organisationLookupId`. A positive network id sends `networkLookupId`. The two ids are not sent together.
- While hierarchy lookups are loading, the filter controls, radios, **Reset Filters**, and **Apply Filters** are disabled. A lookup failure is shown on the hierarchy control and does not invent filter options.
- **Reset Filters** returns the panel to the defaults above, including **All**, and reloads page 1 with `isActive=true` and `mappingStatus=mapped` only.
- A filter with no rows uses **No records match your search or filters.** When a hierarchy filter is also applied, the description is **No records match your search, hierarchy filter, and scope.**
- Changing search or an applied filter clears the row selection and returns to page 1.

Worked example: Connection **DTR** then **Apply Filters** sent `connection=dtr`, the switch read **Advanced Filters · 1 Applied**, and the footer total equalled `data.total` (1195 on the checked session, last page 120).

## MMD-004 Total

1. Open the page with no extra filters.
2. Apply **Consumer**, then **DTR**, then clear connection.
3. Apply **Online**, then **Offline**, then **All**.
4. Apply one hierarchy entity.
5. Combine connection and communication.

Expected:

- Every successful list response has `data.total` equal to the footer **of N**.
- The page count is `total / limit`, rounded up. On page size 10, a total of 127615 ends on page 12762. A total of 1195 ends on page 120. The last page shows only the remainder (`total % limit`, or a full page when the remainder is 0).
- **Consumer** total plus **DTR** total is not required to equal the unfiltered total. Meters with another connection, or with no connection, stay in the unfiltered list.
- **Online** total plus **Offline** total is not required to equal the unfiltered total. Meters that have never communicated stay in **All** and are excluded from both radios.
- A failed list does not paint `total: 0` from the error body. The grid does not keep the previous rows as if they were the new result.

## MMD-005 Paging and page size

1. Go to page 2.
2. Change page size to 20, then 50.
3. Move to a page, then change the page size.
4. Open a result whose total is smaller than 10.

Expected:

- Page 2 sends `page=2`. The address bar stays `/master-data/meters` with no `page` query. **S.No** continues from the previous page. On page size 10, page 2 starts at **11** and the footer is **Showing 11–20 of N**.
- Page size 20 sends `limit=20` and the control reads **20 / page**. Size 50 sends `limit=50`. The default control reads **10 / page**.
- The menu offers only 10, 20, and 50.
- The page-size control is shown only when `data.total` is at least 10.
- Changing page size returns to page 1.
- **Previous page** is disabled on page 1. **Next page** is disabled on the last page.
- A page past the end is replaced by the last valid page. When the total is 0, the pager is hidden.
- Page buttons inside a selected-rows view do not send a new list request.

## MMD-006 Download

1. With no rows selected, click **Download** on a filtered list. Prefer a search that returns a small total so the file is the filtered set, not the whole utility.
2. Select one or two rows and click **Download** again.
3. Repeat while the list request is still loading, and again on an empty result.

Expected:

- The button label is **Download**, then **Downloading…**, and it is disabled while the file is being built.
- With no selection, the call is `POST /master-data/export` with `resource: "meter"`, `mode: "filtered"`. Filters are the applied search and filters: trimmed `q`, organisation or network id, `isActive`, `mappingStatus: "mapped"`, `connection` when Consumer or DTR is applied, and `communicationStatus` when Online or Offline is applied. The file is the filtered set, not the current page only. `page` and `limit` are not the export scope.
- Success message: **Meter master data downloaded successfully.**
- With rows selected, the same button uses `mode: "selected"` and the selected meter ids. Success message: **Downloaded N selected meter.** or **Downloaded N selected meters.**
- An empty download file fails with **Download file was empty.**
- A failed filtered download says **Unable to download meter master data right now.** A failed selected download says **Unable to download selected meter rows right now.**
- No selection: **No selected meter rows to download.**
- A selected id that cannot be resolved: **Some selected rows could not be resolved. Open View Selected or re-select rows after loading each page.**
- **Download** is disabled while permissions are loading, while the export is running, while the list is loading, while the list is in error, and when the total is 0 and nothing is selected.

Checked session: search `19271140` with Connection **DTR** (1 row) sent `POST /master-data/export` HTTP 200. The button showed **Downloading…** and returned to **Download**.

## MMD-007 Bulk upload

**Bulk Upload** is visible only when the user can create meter master data. It opens the dialog titled **Bulk Upload Meters**.

### Dialog

- Title **Bulk Upload Meters**.
- Description: **Upload an Excel (.xlsx) file to add multiple meters at once.**
- Template row **Need a template?**, file name **Meters_Bulk_Upload_Template.xlsx**, and **Download Template**.
- Drop zone: **Upload Meter List**, **Drag & drop or click to browse**, **.xlsx · Max 5 MB**. The file input accepts `.xlsx` only.
- **Validate** stays disabled until a file is chosen. While validation runs the label is **Validating…**.
- **Download Template** calls `GET /master-data/bulk-upload-meters/template` and saves `Meters_Bulk_Upload_Template.xlsx`. Success toast: **Meter bulk upload template downloaded.** Failure toast: **Unable to download the template right now.** An empty template file fails with **Template file was empty.** The button is disabled while the template is downloading.
- There is no “do not reorder columns” note on this dialog. Columns are matched by header name, not by position.

### File checks

These run in the browser when **Validate** is clicked. A file that fails here is not posted.

| File | Result |
| --- | --- |
| Extension is not `.xlsx` | Alert **File validation failed**. **Only .xlsx files are allowed.** |
| `.xlsx` name whose browser type is not an Excel type, `application/octet-stream`, or blank | **Only Excel (.xlsx) files are allowed. Images, PDF, and other formats are not supported.** |
| Larger than 5 MB | Rejected when the file is chosen, before **Validate**. Toast: **File size must be 5 MB or less.** |
| Workbook cannot be read, or has no sheet | **File must be readable and follow the approved template.** |
| Header row is blank | **Required columns must be present.** |
| A required header is missing | **Required columns must be present. Missing:** then the missing names. Header match ignores case. |
| Duplicate header, ignoring case | **Duplicate column names are not allowed:** then the names. |
| No data row, or only blank data rows | **File must contain at least one data row.** |
| An extra column that is not in the template | Allowed. The file is not failed for that column. |
| Reordered template columns | Allowed when every required header is present. |

Checked session: `meters.csv` was accepted into the dialog (name and size shown, **Validate** enabled) and then failed with **File validation failed / Only .xlsx files are allowed.** No `POST /master-data/bulk-upload-meters` was sent. The template download was `GET /master-data/bulk-upload-meters/template` HTTP 200.

### Template columns

Required headers, in template order:

Meter Serial Number, Meter RAPDRP Code, Asset ID, MPTR, MCTR, LPTR, LCTR, MF, Accuracy Class, Meter PO Number, Meter PO Date, Meter Testing Date, No. Of Display Digit, Meter Manufacturer, Meter Model, Meter Version, SIM Number, IMSI Number, IP Address, Modem Serial No., Modem IMEI No., Meter Status, DLMS / Non-DLMS, Meter Rating.

**Meter Manufacturer** and **Meter Model** must be present as headers. A blank cell in those two columns is not a format error.

Blank optional cells are valid. A fully blank data row is skipped and is not an error.

### Row checks

Row numbers in the messages are the spreadsheet row, with the header as row 1.

| Column | When the cell has a value |
| --- | --- |
| Meter Serial Number | Required. Trimmed. Blank: **Meter Serial Number is mandatory.** The same serial on two data rows, ignoring case: **Duplicate Meter Serial Number "…" within the upload file.** |
| Meter RAPDRP Code | Must equal that row’s Meter Serial Number, or stay blank. Otherwise: **Meter RAPDRP Code must match Meter Serial Number or remain blank.** |
| Asset ID | Same rule as Meter RAPDRP Code. |
| MPTR, MCTR, LPTR, LCTR | Must be an integer, including 0 and negative integers. Otherwise: **{column} must be a valid integer.** |
| MF | Must be a number greater than 0. Otherwise: **MF must be greater than zero.** |
| No. Of Display Digit | Must be an integer greater than 0. Otherwise: **No. Of Display Digit must be a valid positive integer.** |
| Accuracy Class | At most 8 characters. Otherwise: **Accuracy Class must not exceed 8 characters.** |
| Meter PO Number | At most 32 characters. |
| Meter Version | At most 32 characters. |
| Meter Rating | At most 15 characters. |
| Meter Status | `Active`, `Inactive`, and also `true`, `false`, `yes`, `no`, `1`, `0`, ignoring case and extra spaces. Anything else: **Meter Status must be Active or Inactive.** |
| SIM Number | Digits only, 18 to 20 digits. Otherwise: **SIM Number (ICCID) must be numeric with 18 to 20 digits.** |
| IMSI Number | Digits only, 14 to 15 digits. Otherwise: **IMSI Number must be numeric with 14 to 15 digits.** |
| IP Address | IPv4 such as `192.168.1.1`, or an IPv6 form made of hex and colons. Otherwise: **IP Address must be a valid IPv4 (e.g. 192.168.1.1) or IPv6 (e.g. 2001:db8::ff00:42) address.** |
| Modem Serial No. | 8 to 32 characters: letters, numbers, and hyphens. Otherwise: **Modem Serial No. must be 8 to 32 alphanumeric characters (letters, numbers, hyphens).** |
| Modem IMEI No. | Exactly 15 digits. Otherwise: **Modem IMEI No. must be exactly 15 digits.** |
| DLMS / Non-DLMS | `DLMS`, `Non-DLMS`, `Non DLMS`, or `NA`, ignoring case and spaces around `/`. Otherwise: **DLMS / Non-DLMS must contain valid values.** |
| Meter PO Date | A real date. An Excel date number is accepted. Otherwise: **Meter PO Date must be valid.** A future date: **Meter PO Date cannot be in the future.** |
| Meter Testing Date | Same date rules. A future date: **Meter Testing Date cannot be in the future.** When both dates are present, testing before the PO date: **Meter Testing Date must be greater than or equal to Meter PO Date.** |

### After the browser checks pass

**Validate** posts the file to `POST /master-data/bulk-upload-meters` with `conflictMode=merge`. It does not insert rows by itself when the response is a validation preview.

- A preview with no blocking errors shows **Preview**, **Import mode**, and **Submit**.
- **Merge** is the default: **Add new records and update matching records without affecting unrelated records.** The confirm box is **I confirm merging matching master-data records.**
- **Override**: **Override matching records with uploaded values.** The confirm box is **I confirm overriding matching master-data records.**
- Changing mode clears the confirm box. **Submit** stays disabled until the box is checked and the preview has at least one valid row.
- **Submit** posts the same file again with `conflictMode` `merge` or `override`.
- Success text, when the server does not send its own message: **Your file was uploaded successfully. Records will appear once processing is complete.**
- A submit that comes back as a failed validation: **Upload could not be completed. Please review the validation results.**
- A transport or server failure on validate: **Validation failed. Please try again.** On submit: **Upload failed. Please try again.** The alert title for that failure is **Upload failed**.
- **Back** returns to the file step. Closing the dialog clears the chosen file.

Do not treat a valid file as a safe check on a shared environment. **Validate** already posts to the import endpoint. Use a file that fails a browser check when the goal is to prove rejection without writing meters.

## MMD-008 Selection, edit, and delete

1. Select two rows.
2. Click **Download**.
3. Clear the selection by changing the search.
4. Use **Edit meter** on a row that has an id.
5. Use **Delete meter**, then cancel.

Expected:

- The header checkbox selects and clears the rows on the current page.
- A selected download uses those rows. Clearing search or applying a filter clears the selection.
- Edit opens `/master-data/meters/{id}/edit`. A row with no meter id does not navigate, and **Edit meter** is disabled with **Meter identifier unavailable**.
- Delete opens **Delete Meter**. Message: **Are you sure you want to delete this meter?** Detail: **This action will deactivate the selected meter and it will no longer appear in the active Meter List.** **Cancel** closes the dialog and leaves the list unchanged. **Delete** continues to the step-up dialog labelled **Delete meter**.

## MMD-009 Access and failures

| Condition | Expected |
| --- | --- |
| User lacks read on `meterMasterData` | Title **Meter Data**. No list rows. **Bulk Upload** is hidden. |
| User lacks create | **Bulk Upload** is hidden. The list and **Download** remain. |
| Permission request fails | **Unable to load your permissions. Try refreshing the page.** |
| Signed out | The app returns to login. |
| `meters-data` fails | The grid does not show rows from the failed body, and the footer is not **of 0** unless a successful body says total 0. |
| First load | Skeleton rows. **Download** is disabled. |
| Empty scope and no search or filter | **No records match your scope, or the dataset is empty.** |

## MMD-010 Edges

| ID | Condition | Expected |
| --- | --- | --- |
| MMD-090 | `q` is `  19271140  ` | Request `q` is `19271140`. |
| MMD-091 | URL `communicationStatus=never-communicated` | The value is ignored. The request does not send it. |
| MMD-092 | URL `mappingStatus=bogus` | The request sends `mappingStatus=mapped`. |
| MMD-093 | URL `mappingStatus=unmapped` | The request sends `mappingStatus=unmapped`. |
| MMD-094 | URL `communicationStatus=communicating` | The communication control starts on **Online** and the request sends `communicationStatus=communicating`. |
| MMD-095 | Total is 0 on a successful response | Empty state for the current search or filter. The pager is hidden. |
| MMD-096 | One row only | The row checkbox is still shown. Page size and page buttons are hidden. Footer is **Showing 1–1 of 1**. |
| MMD-097 | Page size changed while on page 2 | The next request is `page=1` with the new `limit`. |
| MMD-098 | File over 5 MB chosen in Bulk Upload | Toast **File size must be 5 MB or less.** **Validate** is not run. |
| MMD-099 | Non-xlsx chosen, then **Validate** | **Only .xlsx files are allowed.** No import POST. |

## Out of this page

| Screen | Why it is separate |
| --- | --- |
| Add Meter | Create form at `/master-data/meters/add-meter` |
| Edit Meter | Opened by MMD-008, then tested on its own page |
| Consumer Data Ledger upload | `/master-data/consumers`, covered in `docs/consumer-master-data-test-coverage.md` |
| DTR Data | `/master-data/dtrs` |

## Coverage checklist

1. MMD-001: route, title, breadcrumb, first page, `isActive=true`, `mappingStatus=mapped`.
2. MMD-002: search, trimmed `q`, single match, no match, clear, filters kept.
3. MMD-003: hierarchy, connection, communication, badge count, apply, reset.
4. MMD-004: footer total equals `data.total` for the unfiltered list and each filter.
5. MMD-005: pages 10, 20, and 50, serial numbers, last page remainder.
6. MMD-006: filtered download and selected download, disabled states, failure text.
7. MMD-007: template download, file rejection, every column rule, Merge and Override, no import POST on a rejected file.
8. MMD-008: select, edit route, delete confirm cancelled.
9. MMD-009: missing permission, missing create, failed list.
10. MMD-090 to MMD-099: bad query values, empty total, one row, page size reset, oversized file, non-xlsx file.
