# Activity Logs — test coverage

Page under test: `/master-data/audit-logs`.
Heading: **Activity Logs**. Breadcrumb: **Master Data / Activity Logs**.

Open it from **Master Data** in the sidebar, then **Activity Logs**. Do not hard-code live counts or the role list. Read the list response the page itself receives. Unwrap `{ success: true, data }` before reading `logs`, `columns`, `total`, `page`, `limit`, `totalPages`, and `actionFilterOptions`. The footer **of N** must equal `data.total`.

This file covers the list, search, role, action, date range, paging, the log written by every master-data change, and the empty, denied, and failed states. User Management **Audit logs** (`/user-management/audit`) is a different page and is not covered here. Add, edit, delete, and bulk upload stay on Consumer Data, DTR Data, and Meter Data. They are covered here only as the activity row those actions must leave behind.

Checked on `https://mdm.mppkvvcl.bestinfra.app` while signed in. On that session the default range was **7 October 2026 - 7 October 2026**, the grid headers were **S.No**, **Time**, **User**, **Role**, **Action**, **Details**, **IP**, and the body was **No data available** / **No activity log entries match your filters.** Those dates and headers will move. Use them only as a worked example.

## List request

`GET /master-data/audit-logs`

| Query | When it is sent |
| --- | --- |
| `page` | Current page. Default **1**. The address bar does not store `page`. |
| `limit` | Page size. Default **20**. Choices are **10**, **20**, and **50**. The builder clamps the size to 1–100. This page does not remember the size after a refresh. |
| `search` | Search text after a 300 ms debounce, trimmed. Blank search is omitted. The name is `search`, not `q`. |
| `role` | Actor role name from the role menu. **All Roles** omits it. The value `all` is never sent. |
| `action` | Action code from the action menu, such as `consumer.created`. **All Actions** omits it. The label is not sent. |
| `from` | Start of the earlier selected day, `YYYY-MM-DDT00:00:00+05:30`. Sent only together with `to`. |
| `to` | End of the later selected day, `YYYY-MM-DDT23:59:59.999+05:30`. Sent only together with `from`. |
| `sort` | The builder can send it. This page never does. |

The address bar stays `/master-data/audit-logs`. Refresh restores today, **All Roles**, **All Actions**, page 1, page size 20, and an empty search. A shared link cannot carry a filter.

Roles come from `GET /permissions/roles`, unwrapped to `data.roles`. Each option label is `name`. The log request uses that name, not the role id.

Both dates are required on the request. If either selected date is blank, `from` and `to` are both omitted. If the start day is after the end day, the request swaps them and still covers the inclusive India range. The offset is always `+05:30`, including when the browser timezone is not India. The calendar day on the button is the day that gets that offset.

## Columns

Serial **S.No** is the row number on the page. It is not an API field. It is `(page - 1) × limit + row index + 1`.

Every other column comes from `data.columns`. A column with a blank `key` is dropped. A blank `header` falls back to the key. A new column returned by the API is shown. The checked session showed **Time**, **User**, **Role**, **Action**, **Details**, **IP** after **S.No**.

There is no column chooser, no row selection, no row action, no download, and no bulk upload.

Cell text:

| Value | Shown as |
| --- | --- |
| `null`, blank, or a string of spaces | **—** |
| `true` / `false` | **Yes** / **No** |
| Finite number | The number as text |
| Date, or a string the page recognises as a date | India time, `Asia/Kolkata`, such as `7 Oct 2026, 3:04 PM` |
| One text line | That line, trimmed |
| A list of text lines | Each line on its own row. A blank entry in the list is skipped. |
| Any other object | **—** |

**Details** is the column that must stay readable. If the API sends the change as an object, the cell becomes **—** and the row no longer explains what changed. Treat that as a failure of this page, not as an empty detail.

## Actions the page can filter

The menu is built from `data.actionFilterOptions`, then kept only when the value is one of the codes below. The label on the menu is the label in this table, even when the API sends a different label. An option with a blank value or a blank label is dropped. Duplicate values are dropped.

If the response has no options, or none of its values are in this table, the menu falls back to the full table. If the response has a subset, only that subset is shown.

| Menu label | `action` query |
| --- | --- |
| Consumer Created | `consumer.created` |
| Consumer Updated | `consumer.updated` |
| Consumer Deleted | `consumer.deleted` |
| Consumer Bulk Created | `consumer.bulk_created` |
| Consumer Activation Change | `consumer.activation_change` |
| DTR Created | `dtr.created` |
| DTR Updated | `dtr.updated` |
| DTR Deleted | `dtr.deleted` |
| DTR Bulk Created | `dtr.bulk_created` |
| Meter Created | `meter.created` |
| Meter Updated | `meter.updated` |
| Meter Deleted | `meter.deleted` |
| Meter Bulk Created | `meter.bulk_created` |
| Upload Validated | `master_data.upload.validated` |
| Upload Approved | `master_data.upload.approved` |
| Upload Rejected | `master_data.upload.rejected` |

## ALD-001 Page opens

1. Sign in with any one of `consumers.view`, `dtrs.view`, or `meters.view`.
2. Open **Master Data**, then **Activity Logs**.

Expected:

- URL path is `/master-data/audit-logs`.
- Heading is **Activity Logs**.
- Breadcrumb is **Master Data / Activity Logs**.
- The date button is named **Select activity log date range** and shows today twice, for example **7 October 2026 - 7 October 2026**.
- Search placeholder is **Search**. The accessible name is **Search master data activity logs**. The field name is `master-data-audit-search`.
- Role control name is **Filter master data activity log by actor role**. It reads **All Roles**.
- Action control name is **Filter master data activity log by action**. It reads **All Actions**.
- The first list call is HTTP 200 with `page=1`, `limit=20`, `from` at today `T00:00:00+05:30`, `to` at today `T23:59:59.999+05:30`, and no `search`, `role`, `action`, or `sort`.
- A separate call loads `GET /permissions/roles`. The log list does not wait for that call.
- While the first list has no data yet, the search, role, action, and date controls are disabled, and the grid shows skeleton rows. The skeleton count equals the page size, 20 on first open.
- When `data.total` is at least 1, the footer is **Showing 1–20 of N** for the default size, and N equals `data.total`. **S.No** starts at 1.
- When `data.total` is 0, the footer is hidden. It is not **Showing 0 of 0**. The title is **No data available** and the description is **No activity log entries match your filters.**
- The grid is named **Master data activity logs**. The pager, when shown, is named **Master data activity log pages**.

## ALD-002 Search

1. Type a value that appears in **User**, **Role**, **Action**, **Details**, or **IP** on the current result.
2. Wait for the debounced request.
3. Clear the search.

Expected:

- Nothing is sent for the first 300 ms of typing. One paused search sends one request.
- `search` equals the trimmed text. Page returns to 1. Role, action, and the date range stay on the request.
- The footer total equals `data.total`.
- Each returned row shows the searched text in at least one visible cell. Product has not confirmed which fields the server searches. Until it is confirmed, a row that matches none of the visible cells is logged as **ISSUE ALD-001** with the row id, and the check stays soft.
- A search with no match uses **No data available** and **No activity log entries match your filters.** The footer is hidden.
- Clearing search removes `search` and reloads page 1 with the role, action, and dates that are still applied.
- Spaces-only input does not send `search`.

## ALD-003 Role

1. Open the role menu after `permissions/roles` has returned.
2. Apply one role.
3. Return to **All Roles**.
4. Combine that role with a search and an action.

Expected:

- **All Roles** is the first option and is the default. Choosing it removes `role`.
- Each other option is a `name` from `data.roles`. The request sends `role` as that name, not the role id.
- The same name is not listed twice. A blank name is not listed. A name that is only spaces is not listed.
- The worked example on the checked session included **super admin**, **Manager**, **Admin**, **Zone Officer**, **sub_admin**, **field_officer**, **test_report_reader**, **Consumer**, **billing_clerk**, **Chief_vigilance_officer**, **Eenltmt**, **Smp**, **test**, and **test32**. New roles appear without a client release. Removed roles disappear. Do not fail a run only because this example list changed.
- Every returned row’s **Role** cell is that role. A different role is a defect, not a soft check.
- **All Roles** does not mean the sum of the role totals. A row with a blank role, or a role that is not in the menu, can exist only in **All Roles**.
- A failed role request leaves the log list usable. The menu stays on **All Roles** and does not invent role names. The log error alert is not shown for a role-list failure.

## ALD-004 Action

1. Open the action menu on a successful list.
2. Apply one action from the table above.
3. Return to **All Actions**.
4. Repeat for each code that the menu actually offers.

Expected:

- **All Actions** is first and is the default. Choosing it removes `action`.
- The menu shows labels from the action table. It does not show a code as the label.
- Choosing **Consumer Created** sends `action=consumer.created`. The same pattern holds for every row in the action table.
- A returned row’s action is that code. If the cell shows the label instead of the code, the label must be the one in the table. Any other action is a defect.
- An API option outside the table is not shown. A partial API list shows only that partial list. An empty API list, or a list with no known codes, shows the full table.
- Applying an action returns to page 1 and keeps search, role, and dates.

## ALD-005 Date range

The control is a two-month range. **Next month** is disabled when that month is after the browser’s current month. A day after today cannot be selected. There is no earliest day. **Clear** is in the calendar footer.

The button text is `D Month YYYY - D Month YYYY`, for example **7 October 2026 - 7 October 2026**. An empty range shows **Select Range**.

1. Keep the default today-to-today range and read `from` and `to`.
2. Choose a start day and then an end day in the past.
3. Choose the end day first, then a start day after it.
4. Choose a single day by using that day as both ends.
5. Click **Clear**.
6. Open the calendar again and start a new range by clicking only the first day.

Expected:

- Today sends `from={today}T00:00:00+05:30` and `to={today}T23:59:59.999+05:30`.
- A row at `00:00:00.000` India time on the start day is inside the range. A row at `23:59:59.999` India time on the end day is inside the range. A row one millisecond later is outside it.
- `2026-10-06T18:30:00.000Z` is `2026-10-07 00:00` in India and belongs to 7 October. `2026-10-07T18:30:00.000Z` is `2026-10-08 00:00` in India and does not belong to 7 October.
- The request uses `+05:30` even when the machine timezone is not India. The calendar day on the button is the date inside `from` and `to`.
- An inverted selection is stored and sent in calendar order. The button shows the earlier day first.
- Both days are on the request only after both have a value. A range of one day sends that day as both `from` and `to`.
- **Clear** sets both days blank, the button reads **Select Range**, and the next request omits `from` and `to`. The page returns to page 1. If the API rejects a missing range, the alert in ALD-009 is shown. If the API accepts it, `data.total` is the total for every stored day and is greater than or equal to today’s total.
- The first click of a new start day clears the end day. Until the end day is chosen, the request omits `from` and `to`. The list must not keep showing the previous range as if it were still applied.
- Changing the range returns to page 1 and keeps search, role, and action.
- A day in the future is disabled. **Next month** is disabled on the current month.

## ALD-006 What a row must contain

Use a range that contains a known master-data change, or make one change and then open this page on that day. One save, one delete, or one upload decision produces one row. A second row appears only when the server actually performed a second change.

The request does not send a user id or a hierarchy id. A change made by another user is expected on this page. If the API later limits rows to the signed-in user or to a hierarchy, record that rule before treating a missing row as a pass.

For every action in the table above that the environment can perform:

| Change on the source page | Row that must appear |
| --- | --- |
| Add one consumer | **Consumer Created**. **Details** includes the new consumer identifier. |
| Edit one consumer | **Consumer Updated**. **Details** names the consumer and the field that changed. |
| Delete or deactivate one consumer | **Consumer Deleted**. The row exists even though the consumer leaves the active list. |
| Bulk create consumers | **Consumer Bulk Created**. **Details** includes how many records were accepted. One silent upload is a failure. |
| Change consumer activation | **Consumer Activation Change**. **Details** includes the consumer and the new state. |
| Add one DTR | **DTR Created**, with the DTR code. |
| Edit one DTR | **DTR Updated**, with the DTR code and the field that changed. |
| Delete or deactivate one DTR | **DTR Deleted**, with the DTR code. |
| Bulk create DTRs | **DTR Bulk Created**, with the accepted count. |
| Add one meter | **Meter Created**, with the meter serial. |
| Edit one meter | **Meter Updated**, with the meter serial and the field that changed. |
| Delete or deactivate one meter | **Meter Deleted**, with the meter serial. |
| Bulk create meters | **Meter Bulk Created**, with the accepted count. |
| Validate an upload | **Upload Validated**. This is not **Upload Approved**. |
| Approve an upload | **Upload Approved**. |
| Reject an upload | **Upload Rejected**. **Details** includes why it was rejected when the server has a reason. |

On every one of those rows:

- **Time** is the change time in `Asia/Kolkata`, inside the selected range.
- **User** identifies the person who made the change.
- **Role** is that person’s role at the time of the change.
- **Action** matches the row in the table.
- **Details** is text a person can read. It is not **—** when the server stored a change description. It does not contain a password, token, cookie, or API key.
- **IP** is present for a change made from the web app. A missing IP is **—** only when the server stored no IP.
- The same action filtered from ALD-004 includes this row. A different action filter excludes it.
- A failed save, a cancelled delete, or a file rejected in the browser before upload does not add **Created**, **Updated**, **Deleted**, or **Approved**.
- Repeating the same list request returns the same ids in the same order. Page 2 does not repeat an id from page 1.

## ALD-007 Total and paging

1. Use a range whose total is greater than 50.
2. Go to page 2.
3. Change page size to 10, then 50, then back to 20.
4. Open a result whose total is 1.
5. Open a result whose total is 0.

Expected:

- `data.total` equals the footer **of N**.
- `data.page` is the page that was requested. `data.limit` is the size that was requested. `data.totalPages` is `total / limit`, rounded up, or 0 when the total is 0.
- Default size 20: page 1 is **Showing 1–20 of N** when N is at least 20. Page 2 is **Showing 21–40 of N** and **S.No** starts at 21.
- Size 10 sends `limit=10` and the control reads **10 / page**. Size 50 sends `limit=50` and reads **50 / page**. The default control reads **20 / page**.
- The menu offers only 10, 20, and 50.
- The footer, including the page-size control, is shown when `data.total` is at least 1, including a total of 1. A total of 1 reads **Showing 1–1 of 1**.
- Changing page size returns to page 1.
- **Previous page** is disabled on page 1. **Next page** is disabled on the last page. Both are disabled when the range fits on one page.
- A page past the end is replaced by the last valid page, and the request uses that page. When the total is 0, the pager is hidden and the page is not left showing an earlier page’s rows.
- `nextCursor` may be present. This page does not send it back. Paging uses `page` and `limit` only.
- Clicking a column header does not send `sort` and does not reorder the rows on the client.

## ALD-008 Access and failures

| Condition | Expected |
| --- | --- |
| User has `consumers.view` and neither DTR nor meter view | The page opens and the list loads. |
| User has only `dtrs.view` | The page opens and the list loads. |
| User has only `meters.view` | The page opens and the list loads. |
| User has none of those three | Heading **Activity Logs** stays. Title **Access denied**. Description **You need one of consumers.view, dtrs.view, or meters.view to view master data activity logs.** No list request is sent. Search and the filters are disabled. |
| Permission request fails | Alert **Unable to load your permissions. Try refreshing the page.** No list request is sent. |
| Signed out, or the token is expired | The app returns to login. The grid does not show another user’s rows from a stale response. |
| List returns HTTP 4xx or 5xx | Alert text is the server message. When the server sends no message, the alert is **Unable to load activity logs.** |
| List body is not JSON | Alert **Invalid JSON response**. |
| List body is JSON without `success: true` and `data` | Alert **Unexpected API response**. |
| List fails after a successful page was already shown | The previous rows stay, or the alert replaces them. They must not be replaced by **No activity log entries match your filters.** |
| List fails on the first load | The alert is visible. The empty description is not the only result, and the footer is not **Showing 0 of 0**. |
| `data.total` is 0 on HTTP 200 | Empty state from ALD-001. No error alert. |
| Role list fails | Log rows still load. The role menu does not show invented roles. |

A failed list must not be reported as a successful total of 0. `total: 0` counts only when the unwrapped success body says 0.

## ALD-009 Edges

| ID | Condition | Expected |
| --- | --- | --- |
| ALD-090 | Search is `  meter-1001  ` | Request `search` is `meter-1001`. |
| ALD-091 | Search is spaces only | `search` is omitted. |
| ALD-092 | **All Roles** after a role was applied | `role` is omitted. The other filters stay. |
| ALD-093 | **All Actions** after an action was applied | `action` is omitted. The other filters stay. |
| ALD-094 | Role name with different casing from the menu | The menu sends the name exactly as `permissions/roles` returned it. A client-side title-case change is a defect. |
| ALD-095 | API returns an action code that is not in the table | That code is not in the menu. |
| ALD-096 | API returns no known action codes | The menu shows the full action table. |
| ALD-097 | Start day is after the end day | The request swaps them. `from` is the earlier midnight and `to` is the later end of day. |
| ALD-098 | **Clear** on the calendar | `from` and `to` are omitted. The button reads **Select Range**. |
| ALD-099 | Only the new start day has been clicked | `from` and `to` are omitted until the end day is clicked. |
| ALD-100 | A future day | The day is disabled. The request never uses a date after today. |
| ALD-101 | Refresh while a filter is applied | The address bar has no filter to restore. The page returns to today, **All Roles**, **All Actions**, page 1, and limit 20. |
| ALD-102 | Page size changed on page 2 | The next request is `page=1` with the new `limit`. |
| ALD-103 | Total is 1 | Footer **Showing 1–1 of 1**. Page size still offers 10, 20, and 50. |
| ALD-104 | Total is 0 | Footer hidden. Description **No activity log entries match your filters.** |
| ALD-105 | Two log rows with the same `id` | Both rows remain visible. One must not replace the other. |
| ALD-106 | A row with no `id` | The row still renders. It does not steal the identity of another row. |
| ALD-107 | **Details** is a list with two identical lines | Both lines are visible. |
| ALD-108 | **Details** is an object | The cell is **—**. Log **ISSUE ALD-002** with the row id, because the change text was dropped. |
| ALD-109 | A date cell | The clock is `Asia/Kolkata`, not the browser’s local zone. |
| ALD-110 | Header click | No `sort` query. Row order stays the server order. |
| ALD-111 | `limit` outside 10, 20, and 50 | The screen cannot ask for it. The builder would clamp a stored size to 1–100, but this screen has no stored size. |
| ALD-112 | Download, Bulk Upload, edit, or delete on this page | Those controls are absent. This page does not write master data. |

## Out of this page

| Screen | Why it is separate |
| --- | --- |
| User Management Audit logs | `/user-management/audit`, permission `user_management.view_audit_logs` |
| Consumer Data, including Ledger | `/master-data/consumers` |
| DTR Data | `/master-data/dtrs` |
| Meter Data | `/master-data/meters` |

A change made on those master-data screens is in scope here as the row in ALD-006. The form itself is not.

## Coverage checklist

1. ALD-001: route, heading, breadcrumb, today in India time, `page=1`, `limit=20`, no search, role, or action.
2. ALD-002: debounced `search`, trim, no match, clear, other filters kept.
3. ALD-003: every role name from `permissions/roles`, **All Roles**, no blank or duplicate names, role-list failure.
4. ALD-004: every action code the menu offers, labels, unknown codes dropped, empty list falls back to the full table.
5. ALD-005: inclusive `+05:30` bounds, swapped range, one day, **Clear**, half-chosen range, no future day.
6. ALD-006: one readable row for create, update, delete, bulk create, activation, and upload validate, approve, and reject, for consumer, DTR, and meter. No row for a cancelled or failed change.
7. ALD-007: footer total, sizes 10, 20, and 50, serial numbers, last page, total of 1, total of 0.
8. ALD-008: each of the three view permissions, missing permission, failed permissions, failed list, expired session.
9. ALD-090 to ALD-112: blank search, cleared filters, date edges, refresh, duplicate ids, object details, timezone, no sort, no write controls.
