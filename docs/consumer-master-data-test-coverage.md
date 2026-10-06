# Consumer Master Data — test coverage

Page under test: `/master-data/consumers`.
Title: **Consumer Data**. Breadcrumb: **Master Data / Consumer Data**.
The same page is also mounted at `/master-data/consumer`.

Open it from **Master Data** in the sidebar, or from a Consumer Overview drill-down. Do not hard-code live counts. Read the list response the page itself receives. Unwrap `{ success: true, data }` before reading `items` and `total`.

This file covers the list, search, filters, paging, export, Ledger, bulk upload, and the empty, denied, and failed states. Add Consumer (`/master-data/consumers/add-consumer`) and the consumer profile (`/consumers/{id}`) are separate pages. They are covered here only as the result of a button or a row click.

## List request

`GET /master-data/consumer-master-data`

| Query | When it is sent |
| --- | --- |
| `page` | Current page. Page 1 is omitted from the address bar. |
| `limit` | Page size. Default **10**. Choices are **10**, **20**, and **50**. A stored size is clamped to 1–100. |
| `q` | Search text after debounce, trimmed. Blank search is omitted. |
| `organisationLookupId` | Applied organisation scope. |
| `networkLookupId` | Applied network scope. |
| `connectionStatusTblRefId` | Connection status filter, positive id only. |
| `categoryTblRefId` | Category filter, positive id only. |
| `meterCategory` | Non-blank category text. |
| `meterPhase` | Non-blank phase text. |
| `servicePointMeterPhaseTblRefId` | Phase filter, positive id only. |
| `deviceManufacturerTblRefId` | OEM filter, positive id only. |
| `paymentContractTblRefId` | Payment contract filter, positive id only. |
| `isNetMeter` | `true` or `false` only. |
| `meterType` | Always sent. `all` unless **Meter Type** is **Live Meters** (`live`) or **Test Meters** (`test`). |
| `communicationStatus` | Sent only for **Online** (`communicating`) or **Offline** (`non-communicating`). **All** omits it. |
| `fromDate` and `toDate` | Sent only together. One date without the other is dropped. |

The address bar uses the same names. `page` is removed when it is 1. Unknown `communicationStatus`, `meterType`, and `isNetMeter` values are ignored. Non-positive ids are ignored.

Dashboard clicks must land with the matching query still applied: `paymentContractTblRefId`, `isNetMeter=true`, `communicationStatus`, `deviceManufacturerTblRefId`, `connectionStatusTblRefId`, or `servicePointMeterPhaseTblRefId`. The toolbar then shows **Advanced Filters · N Applied**.

## Columns

Serial **S.No** is the row number on the page. It is not an API field.

The grid can show: Circle, Division, Zone, Feeder Name, Feeder Code, DTR Code, New DTR Code, DTR Capacity, Consumer Name, Consumer Address, Mobile No, Category, Sanctioned Load kW, IVRS No, Meter SL No, Meter Make, Phase, MF, Installation Date, Latitude, Longitude, Connected to DCU, and Actions.

**Consumer Name** and **Actions** cannot be hidden. **Actions** stays in the last column. A new column returned by the API is added to the visible set without dropping the columns the user already chose.

## CMD-001 Page opens

1. Sign in with `CONSUMERS_VIEW`.
2. Open **Master Data**, then **Consumer Data**.

Expected:

- URL path is `/master-data/consumers`.
- Title is **Consumer Data**.
- Breadcrumb is **Master Data / Consumer Data**.
- Search placeholder is **Search Consumers**.
- The first list call is HTTP 200, `meterType=all`, default `limit=10`, and no `q`.
- Footer is **Showing 1–10 of N** when N is at least 1, and N equals `data.total`.
- **S.No** starts at 1.

## CMD-002 Search

1. Type a consumer number, meter number, or name.
2. Wait for the debounced request.
3. Clear the search with **Clear Search**.

Expected:

- `q` on the request equals the trimmed text.
- Page returns to 1, and any selected rows are cleared.
- Each returned row matches the text in name, consumer id, or meter number.
- A search with no match shows title **No results found** and the description that says to search by consumer number, meter number, or name.
- Clearing search removes `q` and reloads the unfiltered first page.
- Spaces-only input does not send `q`.

## CMD-003 Advanced filters

Turn **Advanced Filters** on. The panel shows these controls, in this order:

| Control | Default label on the screen |
| --- | --- |
| Hierarchy Type | Hierarchy Type |
| First hierarchy level | Select Hierarchy |
| Second hierarchy level | Select Hierarchy |
| Meter Type | Meter Type |
| Meter phase | All Meter Phases |
| Connection Status | Connection Status |
| Category | All Categories |
| Device Manufacturer | Device Manufacturer |
| Payment Contract | Payment Contract |
| Communication | **All**, **Online**, **Offline**. **All** is selected. |

The panel actions are **Reset Filters** and **Apply Filters**.

1. Apply one filter at a time with **Apply Filters**.
2. After each apply, read the request and the footer.
3. Choose **Reset Filters**, then **Clear All Filters** on the page.

Expected:

- Nothing changes until **Apply Filters**. Closing the panel, or editing a dropdown and not applying, leaves the current list and the current request.
- After apply, the request contains only that filter’s query from the table above, and `data.total` equals the footer **of N**.
- The applied-count badge matches the number of applied advanced filters.
- **Meter Type** → **Live Meters** sends `meterType=live`. **Test Meters** sends `meterType=test`. The untouched control sends `meterType=all`.
- **All** sends no `communicationStatus`. **Online** sends `communicationStatus=communicating`. **Offline** sends `communicationStatus=non-communicating`.
- **Payment Contract** → **Net Meter** sends `isNetMeter=true` and does not send a payment-contract id.
- Hierarchy Type is **Organisation** or **Network**. The two **Select Hierarchy** controls stay empty until a type is chosen, and the second stays empty until the first level is chosen. A user allowed only one type sees that type disabled.
- **Reset Filters** returns the panel to the defaults above, including **All**.
- **Clear All Filters** removes every filter query, leaves `meterType=all`, and returns to page 1.
- A filter with no rows shows **No data available** and tells the user to choose different filters.
- Lookups still loading disable the filter controls. A lookup failure is shown on the hierarchy control and does not invent filter options.

## CMD-004 Drill-down from Consumer Overview

Open Consumer Data from each Consumer Overview click: all consumers, postpaid, prepaid, net metering, communicating, non-communicating, one OEM, one relay slice, and one phase slice.

Expected: the address-bar query matches that click, the same query is on `consumer-master-data`, and the footer total equals the number that was clicked. This is the check that failed for Linkwell Telesystems when the chart showed 15,086 and the footer showed 15,087.

## CMD-005 Paging and page size

1. Go to page 2.
2. Change page size to 20, then 50.
3. Open a URL with `page` greater than the last page.
4. Open a URL with `page=0` and with a negative page.

Expected:

- Page 2 sends `page=2`. The address bar contains `page=2`. **S.No** continues from the previous page.
- Page size 20 sends `limit=20` and shows **20 / page**. Size 50 sends `limit=50`. The control reads **10 / page** on the default size.
- The last page number is the total divided by the page size, rounded up. On page size 10, a total of 126741 ends on page 12675, and that page shows the remaining 1 row.
- Changing page size returns to page 1.
- A page past the end is replaced by the last valid page.
- `page=0` and a negative page are ignored.
- The page-size menu offers only 10, 20, and 50.

## CMD-006 Columns

1. Open **Manage Table Columns**.
2. Hide Circle, then **Apply**.
3. Open the dialog again and choose **Cancel** after moving another column.
4. Choose **Reset defaults**, then **Apply**.

Expected:

- The dialog title is **Manage Table Columns**.
- **Show in Table** starts at **23** and **Hide in Table** starts at **0**.
- The left list is headed **Default Columns**. **Consumer Name** is locked and has no **Hide** action.
- Every other column in that list has **Hide**. Moving Circle to the right pane changes the badges to **Show in Table 22** and **Hide in Table 1**. The empty-pane text **Add Columns to Hide from the table.** is gone once a column is there.
- **Apply** removes Circle from the grid. The choice stays after reload.
- **Cancel** leaves the grid unchanged.
- **Reset defaults** restores 23 shown and 0 hidden.
- **Actions** stays the last column on the grid.
- Column cells match the same fields on that row in `data.items`. An empty field renders blank, not `0`.

## CMD-007 Row open and edit

1. Click a data row, not the checkbox and not Actions.
2. Go back.
3. Use the row **Edit** action.

Expected:

- The row opens `/consumers/{id}`. The id is the consumer id from the row, encoded in the path.
- A row with no id does not navigate.
- Edit opens `/consumers/{id}/edit`.
- Back returns to Consumer Data with the same search, filters, and page.

## CMD-008 Selection and view selected

1. Select two rows.
2. Choose **View Selected**.
3. Page through the selection.
4. Clear the selection.
5. Select every row on the page with the header checkbox, then clear it.

Expected:

- The selection count is 2.
- View Selected lists only those rows. Paging that mode does not send a new list request.
- The selection export uses the selected rows. The header **Download** still uses the filtered set.
- Clear removes the count and shows the full filtered list again.
- Changing search or a filter clears the selection.
- The header checkbox selects and clears the rows on the current page.

## CMD-009 Download

1. With no rows selected, click **Download**.
2. Select two rows and click the selection **Download**.
3. Repeat while the list request is still loading.

Expected:

- The button label is **Download**, then **Downloading...**, and it is disabled while the file is being built.
- The unselected download includes the current filters and search, not the current page only.
- Success message: **Consumer master data downloaded successfully.**
- A failed download says **Unable to download consumer data. Please try again.** A failed selected download uses the selected-download failure message.
- Download is disabled while the list is in error or still loading its first page.

## CMD-010 Ledger (Bulk Upload)

The page button is **Bulk Upload**. It opens the dialog titled **Ledger**. **Download Template** saves `Ledger Template.xlsx`. The file has one sheet, **Ledger**, and one header row. There are no dropdowns inside the workbook. Every check below runs when **Validate File** is clicked.

The template columns, in this order, are:

Circle, Division, Zone, Consumer No, Old Consumer No, Tariff Category, Tariff Code, Meter Phase, Sanctioned Load (In KW), Employee Number, Employee Company Name, Consumer Name, Address1, Mobile No, DTR Code, Feeder Name, Meter Make, Serial No, Latitude, Longitude, Service Date, MF.

**Consumer No** is the only required column. A blank optional cell is valid. **Validate File** does not insert or update consumer records. The list total stays the same after a successful validation.

### Dialog

- Title **Ledger**. Template row **Need a template?** and **Download Template**.
- **Compare mode** defaults to **Merge**: **Blank Ledger cells do not preview a change to existing master values.**
- **Override**: **Blank Ledger cells may preview as clearing nullable master fields.**
- Drop zone: **Upload Ledger Excel**, **Drag & drop or click to browse**, **.xlsx only • Maximum 200 MB**.
- Note: **Validate checks Ledger rows against current consumer master data. It does not insert or update records. A full Ledger (100,000+ rows) can take up to 30 minutes.**
- **Merge** and **Override** change the preview of blank cells only. They do not change which cells are rejected.

### File checks

| File | Result |
| --- | --- |
| Not `.xlsx`, or the workbook cannot be read | **Unable to read upload file. Use a valid .xlsx spreadsheet.** |
| Larger than 200 MB | Rejected before row checks. |
| Empty workbook | **Excel file is empty. A header row is required.** |
| No header row | **Header row is missing.** |
| Header row has no **Consumer No** column | File status **FAILED**. **Required header "Consumer No" is missing.** Code `INVALID_TEMPLATE`. |
| More than 200,000 data rows | Rejected. |
| More than 512 columns, or more than 40,000,000 cells | Rejected. |
| Unknown column name | Ignored. The file is not failed for that column. |
| Another known Ledger column added after the 22 | Accepted and checked under the extra-column rules below. |
| Blank data row | Skipped. It is not an error and it is not counted. |
| Header found in the first 30 rows that contains **Consumer No** | That row is the header, even when rows above it are titles. |
| Header text differs only by case or punctuation | `Consumer No` and `consumerno` are the same column. |

Duplicate **Consumer No**, **Serial No**, and **Meter Make** columns are kept as column `#1` and `#2`. Any other duplicate header that cannot be mapped fails with **Unable to map duplicate Ledger headers. Consumer No, Serial No, and Meter Make may appear more than once.**

**Serial No** is kept as text. Leading zeros stay. The value is not turned into a number.

### Template column checks

| Column | When the cell has a value |
| --- | --- |
| Circle | Compared with the connection circle. A difference is a correction in the preview. No format error. |
| Division | Compared with the connection division. A difference is a correction in the preview. No format error. |
| Zone | Accepted. Not compared and not written. |
| Consumer No | Required. Trimmed. No spaces. At most 32 characters. Blank: **Consumer No is required.** (`MISSING_REQUIRED_FIELD`). Spaces: **Consumer No must not contain spaces.** (`INVALID_FORMAT`). Longer than 32: **Consumer No must be at most 32 characters.** (`INVALID_LENGTH`). The same Consumer No on two data rows: **Duplicate Consumer No within upload file is not allowed.** (`DUPLICATE_IN_FILE`). A second Consumer No column must equal the first, or the row is **Consumer No #2 does not match Consumer No #1.** This is the only column whose failure blocks Validate and Approve by itself. |
| Old Consumer No | Optional. It is the current consumer id (`Consumer_CID`) used to find the consumer. IVRS versioning treats Old Consumer No as the current id and Consumer No as the new number. |
| Tariff Category | Must match one connection category by code, then by name, then by description. Unknown: **Tariff Category does not exist in M_Connection_Category.** Two matches: **Tariff Category matches more than one connection-category row and cannot be mapped uniquely.** |
| Tariff Code | Accepted. Not compared. |
| Meter Phase | Must match one meter-phase name or short name. `1PH`, `1 PH`, `1-PH`, `1P`, `1 P`, `1 Phase`, `Single Phase`, and `SinglePhase` map to **1 PH**. `3PH`, `3P`, `3 Phase`, `Three Phase`, and `ThreePh` fail as unmapped because **3PH WC** and **3PH 4CT** both exist. Unknown: **Meter Phase does not exist in M_ServicePoint_MeterPhase.** Ambiguous: **Meter Phase is ambiguous across M_ServicePoint_MeterPhase (for example 3PH WC vs 3PH 4CT).** |
| Sanctioned Load (In KW) | Must be a number greater than 0. Zero, a negative number, and text fail **Sanctioned Load (In KW) must be a positive number.** (`INVALID_DATA_TYPE`). It is always kilowatts. |
| Employee Number | Must be a finite number. Text fails **Employee Number must be a valid number.** Not compared. |
| Employee Company Name | Accepted as text. Not compared. |
| Consumer Name | At most 240 characters. Longer fails **Consumer Name must be at most 240 characters.** |
| Address1 | Accepted. Not compared. |
| Mobile No | Digits only, and exactly 10 digits. Letters or a wrong length fail **Mobile No must contain digits only (max 10).** or **Mobile No must be exactly 10 digits.** |
| DTR Code | Must match exactly one DTR by code, then by name, in the network lookup or DTR history. Match ignores case and repeated spaces. Unknown: **DTR Code does not exist in L_Network_Lookup or DTR_Master_Change_History.** Two matches: **DTR Code is ambiguous across DTR network rows.** |
| Feeder Name | Must match exactly one feeder by name, code, or new name. Unknown: **Feeder Name does not exist in L_Network_Lookup or feeder billing code.** Two matches: **Feeder Name is ambiguous across Feeder network rows.** |
| Meter Make | The first Meter Make column is compared with the manufacturer name. A second Meter Make column is not compared. |
| Serial No | The first Serial No is the current meter. No spaces. At most 32 characters. Spaces: **Serial No must not contain spaces.** Longer than 32: **Serial No must be at most 32 characters.** The same first serial on two data rows: **Duplicate Serial No within upload file is not allowed.** A second Serial No is the old meter. It is not the duplicate key, and leading zeros on both serials are preserved. |
| Latitude | Must be a finite number. Text fails **Latitude must be a valid number.** Not written on Approve. |
| Longitude | Must be a finite number. Text fails **Longitude must be a valid number.** Not written on Approve. |
| Service Date | `YYYY-MM-DD` or `DD-MM-YYYY`, a real calendar date, and not a future date. Anything else: **Service Date must use YYYY-MM-DD or DD-MM-YYYY.** A future date: **Service Date must not be a future date.** Not written on Approve. |
| MF | Must be a finite number. Text fails **MF must be a valid number.** Not written on Approve. |

### Extra columns that are checked only when the file includes them

These are not on the downloaded template. A file that adds one of them is still accepted, and the cell is checked:

| Column | Check |
| --- | --- |
| Email ID | Optional. At most 64 characters. When present it must match a normal email form, or **Email ID must be a valid email address.** |
| Connection Date | Same date rules as Service Date. |
| Consumer Status | Must match one connection status by name, short name (`CD`, `TD`, `PD`), or id. Connected, Disconnected, and Permanent Disconnection are the name forms. Unknown or more than one match fails. |
| Connection Type | `Permanent` and `Temporary` are billing labels and are not checked against payment contracts. Any other value must match one payment contract by code, name, or id, including Prepaid and Postpaid. |
| Connection Phase | Compared with the service-point connected phase. `1`, `1P`, `1PH`, and Single Phase mean 1-phase. `3`, `3P`, `3PH`, and Three Phase mean 3-phase. |
| Sanctioned Load | Positive number, same rule as Sanctioned Load (In KW). The unit column chooses KW, KVA, or HP. |
| Sanctioned Load Unit | `KW`, `KVA`, or `HP`. It is not stored as its own master column. |
| Contract Demand, Revenue Category, R15 Tariff Code, BPL Number | Must be a finite number when present. Not compared. |
| DTR Name | Same DTR lookup as DTR Code. |

Circle, Division, Tariff Category, Consumer Name, Mobile No, Email ID, Meter Make, and Sanctioned Load differences are corrections in the preview. Old Consumer No, Consumer Status, Connection Type, Connection Phase, DTR, Feeder, Meter Phase, and Serial No differences are business changes in the preview.

**Approve** writes IVRS (Consumer No) changes and physical meter replacements only. Invalid rows and correction-only rows are skipped. Name, load, and contact corrections shown in the preview are not written by Approve. The confirm text is **I confirm these IVRS and meter-replacement versions.**

## CMD-013 Consumer create upload

Visible only when the user has `CONSUMERS_CREATE`, and only if a separate **Bulk Upload Consumers** dialog is on the page. The **Bulk Upload** button on Consumer Data opens Ledger and downloads the 22-column template in CMD-010. Do not use these consumer-create headers for that file.

1. Click **Bulk Upload**.
2. Download the template.
3. Fill one valid row and upload that file. The **MSN** must be a meter serial number that already exists in the meter master data. Read it from the database or from Meter Data. Do not invent a meter number. Use a meter that is active and not already assigned to a consumer.
4. Upload a renamed column, a removed column, a reordered column, a duplicate header, an empty file, a non-xlsx file, and a file over 200 MB.

Expected:

- The button name is **Bulk upload**. The dialog title is **Bulk Upload Consumers**.
- The note says not to rename, remove, or reorder the template columns.
- The file rule is `.xlsx` only, maximum 200 MB.
- Template headers, in order, include the required fields: Zone, Sub Station, Feeder, DTR, Consumer ID, Nearest Acct. ID, Consumer Name, Consumer Category, Billing Cycle, Bill Day, Main/Sub Meter, MSN, Meter Phase, Date Of Service, SIM No., IMSI No., and Mobile No. (Meter). Optional headers include Circle, Division, Account ID, IVRS Number, Email ID, Mobile No., Address, Connection Type, Connection Status, Sanctioned Load (KW), TOD, Connected To DCU, and Is Net Meter.
- Validate rejects the wrong column count, duplicate names, an empty sheet, a non-xlsx file, and a file over 200 MB. It does not import those files.
- A valid file can be validated and imported. Its **MSN** is a meter number already stored in the database. After a successful import, the list reloads and the new consumer is found by search.
- An **MSN** for an inactive meter, or a meter already assigned to a consumer, is rejected and is not imported.
- A user without `CONSUMERS_CREATE` does not see **Bulk Upload**.

## CMD-011 Access and failures

| Condition | Expected |
| --- | --- |
| Consumers module disabled | Title **Consumer Data**. Message: **The Consumers module is disabled. Consumer master data is not available.** No list call is made. |
| User lacks `CONSUMERS_VIEW` | **Access denied**, names the `CONSUMERS_VIEW` permission, and offers a way back to `/dashboard`. No rows from another user are shown. |
| Permission request fails | **Unable to load your permissions. Try refreshing the page.** |
| Signed out | The app returns to login. |
| `consumer-master-data` fails | Alert **Unable to load consumer data.** The grid does not show rows from the failed body, and the footer is not **of 0** unless a successful body says total 0. |
| Scope update fails | **Access update unavailable**, with the failure text or the reload message. The grid is not shown as a normal empty list. |
| First load | Skeleton rows. Numbers from the previous filter are not shown as the new result. |

## CMD-012 Edges

| ID | Condition | Expected |
| --- | --- | --- |
| CMD-090 | `q` is `  meter  ` | Request `q` is `meter`. |
| CMD-091 | URL `communicationStatus=never-communicated` | The value is ignored. The request does not send it. |
| CMD-092 | URL `meterType=bogus` | The request sends `meterType=all`. |
| CMD-093 | URL `isNetMeter=1` | The value is ignored. Only `true` and `false` are kept. |
| CMD-094 | URL `deviceManufacturerTblRefId=0` or `-1` | The id is ignored. |
| CMD-095 | `fromDate` without `toDate` | Neither date is sent. |
| CMD-096 | Total is 0 on a successful response | Empty state for the current search or filter. Footer is not **Showing 1–10 of 0**. |
| CMD-097 | User changes organisation or network scope | Hierarchy filters clear, page returns to the first page, and the list reloads for the new scope. |
| CMD-098 | One row only | The row checkbox is still shown. |
| CMD-099 | Reload with `page=2` and an active filter | The same filter and page are requested again. |

## Out of this page

| Screen | Why it is separate |
| --- | --- |
| Add Consumer | Create form at `/master-data/consumers/add-consumer` |
| Consumer profile and edit | Opened by CMD-007, then tested on their own pages |
| DTR Data | `/master-data/dtrs` |
| Consumer Overview charts | Already covered in `docs/consumer-overview-test-coverage.md` |

## Coverage checklist

1. CMD-001: route, title, breadcrumb, first page, `meterType=all`.
2. CMD-002: search, trimmed `q`, no match, clear.
3. CMD-003: every advanced filter, badge count, clear.
4. CMD-004: each Consumer Overview drill-down total.
5. CMD-005: pages 10, 20, and 50, and an illegal page.
6. CMD-006: hide, lock Consumer Name and Actions, reload.
7. CMD-007: row opens the profile, edit opens edit, back keeps the list state.
8. CMD-008: select, view selected, clear.
9. CMD-009: filtered download and selected download.
10. CMD-010: Ledger template, every column validation, Merge and Override, validate without changing records.
11. CMD-013: bulk upload template, valid import using an existing database meter number, and each rejected file.
12. CMD-011: disabled module, missing permission, failed list, failed scope.
13. CMD-090 to CMD-099: bad query values, paired dates, empty total, scope change.
