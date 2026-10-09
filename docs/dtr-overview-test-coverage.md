# DTR Overview — test coverage

Superseded by the October 2025 capture. Use these files instead:

- Page: `docs/dtr-overview.md`
- Web: `docs/dtr-overview-web-test-coverage.md`
- API: `docs/dtr-overview-api-test-coverage.md`
- E2E: `docs/dtr-overview-e2e-test-coverage.md`

This file still describes a page-level period named **DTR overview period**, an Hourly choice, and widgets that ignore the month. That is not what the live page does.

Page under test: `/dtr/dashboard` after sign-in.
Heading: **DTR Overview**. Section tab: **DTR Management**.

Open it from the **DTR Management** tab (`/dtr/dashboard`). Scope every locator to `main`. Do not hard-code live counts. Read the JSON the page itself receives. Unwrap `{ success: true, data }` before reading fields.

This file covers the positive path, the negative path, and the edge cases for every widget on this page. Detail screens are covered only as the result of a click from this page. Consumers, Water, DG, and Gas are not executed here.

The sample DTR table spec (`tests/web/dashboard/dtr-table.web.spec.ts`) is a different screen. It does not cover this page.

## Comparison rules

| Rule | How to assert |
| --- | --- |
| Thousands separators | Strip commas. `12,450` equals `12450`. |
| Counts | Round half away from the displayed integer, then clamp below `0` to `0`. The screen uses that rounded value. |
| Percents | Compare as numbers. `0%` equals `0`. `88.1%` equals `88.1`. |
| Empty value | `—` is empty. Do not treat it as `0`. A successful count of `0` stays `0`. |
| Failed request | That widget must not show a number taken from the failed body. |
| Card footer | Present only when `trends` has at least two finite values. Delta is the last value minus the one before it, then rounded. |
| Footer wording | `0` is `No Change` and has no number pill. A positive delta is `Increase by`, a pill `+N`, then the compare label. A negative delta is `Decrease by`, a pill with the signed number, then the compare label. |
| Compare label | Hourly is `vs Last Hour`. Daily is `vs Yesterday`. Weekly is `vs Last Week`. The page opens on **Daily**. |
| Donut percent | `count / center total * 100`. Do not use a raw API percentage string when the center is recomputed. |
| Power bars | Off is drawn downward. Values inside ±2% are stretched on the chart. Assert the tooltip or the series value, not the bar pixel height. |
| Month | Time zone is `Asia/Kolkata`. The current month omits `monthYear`. An earlier month sends `monthYear={YYYY-MM}`. |

## Requests the page sends

All calls use the bearer token. Summary, Power Status, and Energy Consumption send `period` (`hourly`, `daily`, or `weekly`). They send `monthYear` only when the selected month is not the current month. Load Unbalance and Voltage Unbalance send `monthYear` on the same rule and do not send `period`. Communication Status and Percentage Loading send neither.

| Widget | Request |
| --- | --- |
| Four KPI cards | `GET /dashboard/dtr/summary?period={period}` |
| Power Status | `GET /dashboard/dtr/power-status?period={period}` |
| Energy Consumption | `GET /dashboard/dtr/consumption?period={period}` |
| Communication Status | `GET /dashboard/dtr/communication-status` |
| Percentage Loading | `GET /dashboard/dtr/percentage-loading` |
| Load Unbalance | `GET /dashboard/dtr/load-unbalance` |
| Voltage Unbalance | `GET /dashboard/dtr/voltage-unbalance` |
| Card click | `GET /master-data/dtr-master-data?...` on `/master-data/dtrs` |
| Power slice click | `GET /dashboard/dtr/power-status-details?...` on `/dtr/dashboard/power-status` |
| Communication slice click | `GET /dashboard/dtr/communication-details?...` on `/dtr/dashboard/communication` |
| Percentage Loading slice click | `GET /dashboard/dtr/percentage-loading-details?...` on `/dtr/dashboard/percentage-loading` |
| Consumption series click | `GET /dashboard/dtr/consumption-details?...` on `/dtr/dashboard/consumption` |
| Load Unbalance slice click | `GET /dashboard/dtr/load-unbalance-details?...` on `/dtr/dashboard/load-unbalance` |
| Voltage Unbalance slice click | `GET /dashboard/dtr/voltage-unbalance-details?...` on `/dtr/dashboard/voltage-unbalance` |

Add `&monthYear={YYYY-MM}` to the first three dashboard calls, and to Load Unbalance and Voltage Unbalance, when a past month is selected.

## Locators

| What | Role | Name |
| --- | --- | --- |
| Page heading | text | DTR Overview |
| Section tab | tab | DTR Management |
| Month control | button | DTR dashboard month and year |
| Period control | button | DTR overview period |
| Total DTRs card | the card whose name contains Total DTRs | Total DTRs |
| DTRs ON card | the card whose name contains DTRs ON | DTRs ON |
| DTRs OFF card | the card whose name contains DTRs OFF | DTRs OFF |
| Active Alerts card | the card whose name contains Active Alerts | Active Alerts |
| Power Status | widget title | Power Status |
| Communication Status | widget title | Communication Status |
| Percentage Loading | widget title | Percentage Loading |
| Energy Consumption | widget title | Energy Consumption |
| Load Unbalance | widget title | Load Unbalance |
| Voltage Unbalance | widget title | Voltage Unbalance |
| Widget download | button | Download, scoped to that widget |

## Layout

Top to bottom, inside `main`:

1. Heading, month control, period control.
2. Four cards in this order: **Total DTRs**, **DTRs ON**, **DTRs OFF**, **Active Alerts**.
3. **Power Status**, full width.
4. **Communication Status** beside **Percentage Loading**.
5. **Energy Consumption**, full width.
6. **Load Unbalance** beside **Voltage Unbalance**.

---

## A. Page shell

### DO-001 DTR Management opens DTR Overview

Priority: smoke.

1. Sign in with a user who has `DTRS_VIEW`.
2. Open **DTR Management**.

Expected:

- URL path is `/dtr/dashboard`.
- Heading is **DTR Overview**.
- **DTR Management** is the selected section.
- The period button reads **Daily** and its accessible name is **DTR overview period**.
- The month button's accessible name is **DTR dashboard month and year**. It shows the current month in `Asia/Kolkata` and has no clear control.

### DO-002 Every widget request succeeds on first paint

While DO-001 loads, capture the page's own GET responses.

Expected: each request in the table above returns HTTP 200 and `success: true`. Summary, Power Status, and Consumption use `period=daily` and omit `monthYear`.

### DO-003 Period choices

1. Open **DTR overview period**.

Expected: the only choices are **Hourly**, **Daily**, and **Weekly**. Monthly and Yearly are not offered. Choosing one closes the menu, the button shows that label, and Summary, Power Status, and Consumption are requested again with that `period`. Communication Status and Percentage Loading are not requested again for the period change.

### DO-004 Month bounds

1. Open **DTR dashboard month and year**.

Expected:

- Months before `2025-06` cannot be chosen.
- Months after the current `Asia/Kolkata` month cannot be chosen.
- There is no control that clears the month.
- Choosing the current month leaves `monthYear` off the requests.
- Choosing an earlier allowed month sends `monthYear={YYYY-MM}` on Summary, Power Status, Consumption, Load Unbalance, and Voltage Unbalance.
- Power Status, Energy Consumption, Load Unbalance, and Voltage Unbalance show that month caption.
- Communication Status and Percentage Loading show a **Current** badge and keep the unfiltered responses.

### DO-005 Return after every drill-down

After each click case, go back.

Expected: the URL is `/dtr/dashboard`, the heading is **DTR Overview**, and the period and month are unchanged.

### DO-006 Widget download

For each widget that shows **Download** (Power Status, Communication Status, Percentage Loading, Energy Consumption, Load Unbalance, Voltage Unbalance):

1. Click **Download** inside that widget.

Expected:

- A file download starts. Power Status uses prefix `dtr-power-status`. Communication uses `dtr-communication-status`. Percentage Loading uses `dtr-percentage-loading`. Consumption uses `dtr-energy-consumption`. Load Unbalance uses `dtr-load-unbalance`. Voltage Unbalance uses `dtr-voltage-unbalance`.
- The page stays on `/dtr/dashboard`.
- The Power Status file lists **DTR On** and **DTR Off** only. The invisible gap series is not a column.
- **Download** is disabled when every plotted value is `0`.
- **Download** is absent when that widget is in the unavailable state.

These widgets do not show search or filter.

---

## B. KPI cards

Source: summary response. Each card count is `count` on `totalDtrs`, `dtrsOn`, `dtrsOff`, or `activeAlerts`. When the response instead sends `trends.points`, the count is the top-level total and the sparkline is `points[].totalDtrs`, `points[].dtrsOn`, `points[].dtrsOff`, or `points[].activeAlerts`.

| ID | Card | Field | Click |
| --- | --- | --- | --- |
| DO-010 | Total DTRs | `totalDtrs` | `/master-data/dtrs` with no `selectedIds` and no `metric` |
| DO-011 | DTRs ON | `dtrsOn` | `/master-data/dtrs` and `metric=DTRs ON`. `selectedIds` is not sent |
| DO-012 | DTRs OFF | `dtrsOff` | `/master-data/dtrs` and `selectedIds` from `dtrsOff.meterLookupIds` |
| DO-013 | Active Alerts | `activeAlerts` | `/master-data/dtrs` and `selectedIds` from `activeAlerts.meterLookupIds` |

### DO-010 to DO-013 Count, footer, and list

Run once per row.

1. Read the card value and footer.
2. Click the card.
3. Wait for `GET /master-data/dtr-master-data`.
4. Read the list total.
5. Return to `/dtr/dashboard`.

Expected:

- The card value equals that field's rounded `count`.
- The footer matches the delta rules. It is omitted when `trends` has fewer than two finite numbers.
- List path is `/master-data/dtrs`.
- The query string matches the table. An empty `meterLookupIds` list on DTRs OFF or Active Alerts sends `selectedIds=` with an empty value. Non-integer and non-positive ids are dropped before the request.
- List `total` equals the card count.

### DO-014 Zero delta

When the rounded delta is `0`:

Expected: the footer is `No Change vs Yesterday` on Daily (or the compare label for the selected period). There is no `0` pill.

### DO-015 One trend point

When `trends` has a single finite value:

Expected: the count still matches, and the footer is absent.

### DO-016 Unavailable coverage on ON and OFF

When summary `coverage` is `unavailable`:

Expected:

- **DTRs ON** and **DTRs OFF** show `—` and the text **Data unavailable for selected period**. They have no sparkline and no footer.
- **Total DTRs** and **Active Alerts** still show their counts and footers.
- Clicking ON or OFF is not asserted as a count match while they show `—`.

### DO-017 ON plus OFF is not forced to equal Total

Expected: the test does not require `dtrsOn + dtrsOff = totalDtrs`. Each card is checked against its own field.

### DO-018 Negative and blank counts

Expected: a negative API count renders `0`. A missing count renders `0` when the request succeeded. A null card value renders `—` only in the unavailable and empty states in DO-016 and section J.

---

## C. Power Status

Source: `GET /dashboard/dtr/power-status`. Each `points[]` entry has `label`, `onPercentage` (or `on_percentage`), `offPercentage` (or `off_percentage`), `dtrsOn` (or `dtrs_on`), and `dtrsOff` (or `dtrs_off`).

The chart keeps the latest window: 12 points for Hourly, 12 for Daily, 8 for Weekly. Y axis is `-100%` to `100%`.

### DO-020 Title, subtitle, and series

Expected:

- Title is **Power Status**.
- Subtitle starts with `ON and OFF status for` and includes the period window. On Daily with a past month it uses that month label.
- Categories equal the point labels, in order, for the visible window.
- **DTR On** values equal `onPercentage`. **DTR Off** values equal the absolute `offPercentage`, drawn negative.
- Tooltip for a point is `{dtrsOn} ({onPercentage}%)` or `{dtrsOff} ({offPercentage}%)`.
- The gap series between On and Off has no legend entry and does not navigate.

### DO-021 DTR On drill-down

1. Click a **DTR On** point.

Expected:

- URL is `/dtr/dashboard/power-status`.
- Query `status=on`.
- Query `period` is the selected period.
- Query `bucket` is that point's label. `June` becomes `Jun`, `Sept` becomes `Sep`, and `July` becomes `Jul`.
- `monthYear` is present only for a past month.
- Page title is **DTR Overview Details**. Breadcrumb is **Power Status**.
- `GET /dashboard/dtr/power-status-details` uses the same `status`, `period`, `bucket`, and `monthYear`. Its total equals `dtrsOn` for that point.

### DO-022 DTR Off drill-down

Same steps on **DTR Off**.

Expected: `status=off`, and the details total equals `dtrsOff` for that point.

### DO-023 Zero percent point

When a point's percentage is `0`:

Expected: the tooltip is empty for that series, and the click does not open a details page.

### DO-024 Power coverage unavailable

When `coverage` is `unavailable`:

Expected: `data-testid="dtr-power-status-data-unavailable"` is visible, the message is **Data unavailable for selected period**, and **Download** is absent. Points are not asserted.

---

## D. Communication Status

Source: `GET /dashboard/dtr/communication-status`. The donut uses the last point of the visible half window: 6 Hourly, 6 Daily, or 4 Weekly points. Series names **Communicating** and **Non-Communicating** accept the API names `communicated` and `non-communicated`.

### DO-030 Center and slices

Expected:

- Title is **Communication Status**.
- Subtitle is **Current status of active Meters**.
- Legend headers are **Status**, **Count**, and **%**.
- Center title is **Total Meters**.
- Center value equals Communicating plus Non-Communicating.
- Communicating count is the last finite `communicating` value, rounded and clamped at `0`. Same for Non-Communicating.
- Each percent is `count / center * 100`. A center of `0` yields `0%`.

### DO-031 Communicating drill-down

1. Click **Communicating**.

Expected:

- URL is `/dtr/dashboard/communication?status=communicated`.
- Page title is **DTR Overview Details**. Breadcrumb is **Communication**.
- `GET /dashboard/dtr/communication-details` uses `status=communicated`. Its total equals the Communicating count.

### DO-032 Non-Communicating drill-down

Expected: `status=non-communicated`, and the details total equals the Non-Communicating count.

### DO-033 Unknown communication label

A slice whose label is neither communicating nor non-communicating does not navigate.

### DO-034 Communication ignores the month

1. Select a past month.

Expected: the widget still shows **Current**, and `communication-status` is called without `monthYear`. The donut does not change to that month's body.

---

## E. Percentage Loading

Source: `GET /dashboard/dtr/percentage-loading`. It does not take `period` or `monthYear`.

Labels are renamed only when the response has exactly four items:

| API label | On screen | Click `band` |
| --- | --- | --- |
| critical, Critical | Critical | `critical` |
| high | Critical | `critical` |
| medium, high load, high-load | High Load | `high-load` |
| low, normal | Normal | `normal` |
| very low, under utilized, under-utilized | Under Utilized | `under-utilized` |

Any other label on a four-item response stays as returned, and a click still resolves to `critical`. A response whose length is not four is shown with the raw labels.

### DO-040 Center and four bands

Expected:

- Title is **Percentage Loading**.
- Subtitle is **Transformer utilization distribution**.
- Center title is **Analyzed meters**.
- When the API `total` is a finite number greater than `0`, the center is that total. Otherwise the center is the sum of the item values.
- Each item value is clamped at `0`. Blank labels and non-finite values are dropped.
- Percent is `value / center * 100`.
- Legend headers are **Severity**, **Count**, and **%**.

### DO-041 to DO-044 One drill-down per band

| ID | Band | Query |
| --- | --- | --- |
| DO-041 | Critical | `band=critical` |
| DO-042 | High Load | `band=high-load` |
| DO-043 | Normal | `band=normal` |
| DO-044 | Under Utilized | `band=under-utilized` |

Expected:

- URL is `/dtr/dashboard/percentage-loading?band={band}`.
- Page title is **DTR Overview Details**. Breadcrumb is **Percentage Loading**.
- `GET /dashboard/dtr/percentage-loading-details` uses that `band`. Its total equals the clicked count.

### DO-045 Empty percentage loading

When there are no finite items, or their sum is `0`:

Expected: the widget shows title **Data unavailable** and description **Percentage loading breakdown is not available from the API yet.** **Download** is absent. The zero stub rows are not asserted as real counts.

### DO-046 Percentage loading ignores month and period

Changing the month or the period does not send a new `percentage-loading` request and does not change the donut. The widget shows **Current**.

---

## F. Energy Consumption

Source: `GET /dashboard/dtr/consumption?period={period}`. Each point has `label`, `kwh`, `kvah`, and `kvarh`. Non-finite values become `0`.

Visible window: 12 Hourly, 12 Daily, 8 Weekly.

### DO-050 Series and subtitle

Expected:

- Title is **Energy Consumption**.
- Subtitle is `Energy usage · {Hourly|Daily|Weekly} · {month label}`.
- Categories equal the point labels in the visible window, in order.
- Series names are **kWh**, **kVAh**, and **kVARh**, and each point matches that field.
- Y axis starts at `0`. Values of `1000` and above may render as `{n}k` on the axis. The tooltip keeps one decimal.

### DO-051 to DO-053 Series drill-down

| ID | Series | Query `kind` |
| --- | --- | --- |
| DO-051 | kWh | `kwh` |
| DO-052 | kVAh | `kvah` |
| DO-053 | kVARh | `kvarh` |

1. Click a point on that series.

Expected:

- URL is `/dtr/dashboard/consumption?kind={kind}`.
- `monthYear` is present only for a past month.
- Page title is **DTR Overview Details**. Breadcrumb is **Consumption**.
- `GET /dashboard/dtr/consumption-details` uses the same `kind` and `monthYear`. Its total is the details total for that kind. The clicked point's value is energy, not a DTR count, so do not require the list total to equal the bar's kWh.

A series whose name is not `kwh`, `kvah`, or `kvarh` does not navigate.

### DO-054 Consumption coverage unavailable

When `coverage` is `unavailable`:

Expected: `data-testid="dtr-consumption-data-unavailable"` shows **Data unavailable for selected period**. **Download** is absent. Series values are not asserted.

---

## G. Load Unbalance

Source: `GET /dashboard/dtr/load-unbalance`. `monthYear` is sent only for a past month.

Labels are renamed only when the response has exactly three items:

| API label | On screen | Click `severity` |
| --- | --- | --- |
| high, severe | Severe | `severe` |
| medium, normal, moderate | Moderate | `moderate` |
| low, balanced | Balanced | `balanced` |

Any other three-item label stays as returned. A click on an unknown label still uses `severity=severe`. A response whose length is not three keeps raw labels.

### DO-060 Center and slices

Expected:

- Title is **Load Unbalance**.
- Subtitle is **Phase load imbalance distribution across DTRs**.
- Center title is **Analyzed meters**.
- Center uses API `total` when that total is greater than `0`. Otherwise it is the sum of the items.
- Percent is `value / center * 100`.

### DO-061 to DO-063 One drill-down per severity

| ID | Slice | Query |
| --- | --- | --- |
| DO-061 | Severe | `severity=severe` |
| DO-062 | Moderate | `severity=moderate` |
| DO-063 | Balanced | `severity=balanced` |

Expected:

- URL is `/dtr/dashboard/load-unbalance?severity={severity}`.
- `monthYear` matches the selected past month and is omitted for the current month.
- Page title is **DTR Overview Details**. Breadcrumb is **Load Unbalance**.
- `GET /dashboard/dtr/load-unbalance-details` uses the same `severity` and `monthYear`. Its total equals the clicked count.

### DO-064 Load unbalance unavailable

When `coverage` is `unavailable`, or the items are missing, or their sum is `0`:

Expected: `data-testid="dtr-load-unbalance-data-unavailable"` is visible and **Download** is absent.

- `coverage=unavailable` shows **Data unavailable for selected period** and no extra description.
- A missing breakdown shows **Data unavailable** and **Load unbalance breakdown is not available from the API yet.**

---

## H. Voltage Unbalance

Source: `GET /dashboard/dtr/voltage-unbalance`. Same three-label rename and click mapping as Load Unbalance. `monthYear` follows the same rule.

### DO-070 Center and slices

Expected:

- Title is **Voltage Unbalance**.
- Subtitle is **Phase voltage imbalance distribution across DTRs**.
- Center title is **Analyzed meters**.
- Center and percents follow the same total rules as DO-060.

### DO-071 to DO-073 One drill-down per severity

| ID | Slice | Query |
| --- | --- | --- |
| DO-071 | Severe | `severity=severe` |
| DO-072 | Moderate | `severity=moderate` |
| DO-073 | Balanced | `severity=balanced` |

Expected:

- URL is `/dtr/dashboard/voltage-unbalance?severity={severity}`, plus `monthYear` only for a past month.
- Page title is **DTR Overview Details**. Breadcrumb is **Voltage Unbalance**.
- `GET /dashboard/dtr/voltage-unbalance-details` total equals the clicked count.

### DO-074 Voltage unbalance unavailable

Expected: `data-testid="dtr-voltage-unbalance-data-unavailable"`.

- `coverage=unavailable` shows **Data unavailable for selected period**.
- A missing breakdown shows **Data unavailable** and **Voltage unbalance breakdown is not available from the API yet.**

---

## I. Empty, failure, and access

### DO-080 Em dash is not zero

A card or chart that renders `—` is not compared to `0`. A successful `0` is not rendered as `—`.

### DO-081 Summary request fails

When `GET /dashboard/dtr/summary` fails after its single retry:

Expected: the four cards show `—` or their empty state. No card count is taken from the failed body. The other widgets may still assert their own successful responses.

### DO-082 One chart request fails

Fail Power Status, Consumption, Communication, Percentage Loading, Load Unbalance, and Voltage Unbalance one at a time.

Expected: only that widget leaves its number state. The other widgets still match their own responses. A failed chart does not download a file of zeros taken from the error body.

### DO-083 Details request fails

When the details call after a click fails:

Expected: the details page shows its error or empty state. A missing total is not treated as `0` matching the slice.

### DO-084 Master-data request fails

When `GET /master-data/dtr-master-data` fails after a card click:

Expected: the DTR list shows its error or empty state. The card count is not declared equal to a missing footer.

### DO-085 No DTRS_VIEW

Sign in as a user without `DTRS_VIEW` on `dtrDashboard`.

Expected: the dashboard requests are not sent. Widgets stay on the empty `—` state. Counts from another user's session are not shown.

### DO-086 Signed out

Open `/dtr/dashboard` with no token.

Expected: the app returns to login. No dashboard JSON is rendered.

### DO-087 Loading

While the requests are in flight:

Expected: the cards show four shimmer placeholders, and each chart shows its skeleton. Numbers from the previous month are not asserted as the new month until the new response arrives.

### DO-088 Partial coverage

When `coverage` is `partial` or `complete`:

Expected: widgets render their numbers. Only `unavailable` uses the period message.

---

## J. Edges that must not be skipped

| ID | Condition | Expected |
| --- | --- | --- |
| DO-090 | `trends` length is 0 | Count renders. Footer is absent. |
| DO-091 | Delta is `0.4` | Footer uses `0` and **No Change**, because the card rounds the delta. |
| DO-092 | Delta is `0.6` | Footer uses `Increase by` and pill `+1`. |
| DO-093 | Delta is `-1.6` | Footer uses `Decrease by` and pill `-2`. |
| DO-094 | API count is `-3` | Card shows `0`. |
| DO-095 | `meterLookupIds` contains `0`, `-1`, or `1.5` | Those ids are omitted from `selectedIds`. |
| DO-096 | DTRs OFF `meterLookupIds` is `[]` | Request sends `selectedIds` with an empty value, and the list total equals the card count. |
| DO-097 | Hourly period | Compare label is `vs Last Hour`. Power and Consumption show 12 points or fewer. Communication uses the last 6. |
| DO-098 | Weekly period | Compare label is `vs Last Week`. Power and Consumption show 8 points or fewer. Communication uses the last 4. |
| DO-099 | Past month `2025-06` | `monthYear=2025-06` on Summary, Power, Consumption, Load Unbalance, and Voltage Unbalance. Communication and Percentage Loading stay **Current**. |
| DO-100 | Month label `June 2026` on a power point | Details query `bucket` is `Jun 2026`. |
| DO-101 | Month label `Sept 2026` | Details query `bucket` is `Sep 2026`. |
| DO-102 | Power gap series click | URL stays `/dtr/dashboard`. |
| DO-103 | Communication slice named `comm` | Treated as Communicating and opens `status=communicated`. |
| DO-104 | Percentage Loading returns one item | Label is not renamed. Center still follows the total rule. |
| DO-105 | Load Unbalance returns five items | Labels are not renamed. |
| DO-106 | Donut `total` is `0` and items sum to a positive number | Center equals the item sum. |
| DO-107 | Donut `total` is greater than `0` | Center equals that total even when it differs from the item sum. |
| DO-108 | All consumption points are `0` | Chart can render zeros. **Download** is disabled. |
| DO-109 | Selected period is kept across a card click and back | Period button still shows the period chosen before the click. |
| DO-110 | Selected past month is kept across back | Month caption and `monthYear` are unchanged. |

## Out of this page

| Screen | Why it is separate |
| --- | --- |
| Consumer Overview `/consumers` | Already covered in `docs/consumer-overview-test-coverage.md` |
| Live Communication | Different dashboard |
| Water, DG, Gas | Disabled sections |
| DTR feeder and DTR details pages that are not opened by a widget on this dashboard | Not a result of these clicks |

## Coverage checklist

1. DO-001 to DO-006: route, seven successful reads, period, month bounds, download, and return.
2. DO-010 to DO-018: four cards, footers, list filters, unavailable ON/OFF, and clamped counts.
3. DO-020 to DO-024: Power Status series, On click, Off click, zero point, unavailable month.
4. DO-030 to DO-034: Communication center, both clicks, unknown label, month ignored.
5. DO-040 to DO-046: four loading bands, each click, empty breakdown, month ignored.
6. DO-050 to DO-054: three energy series, each click, unavailable month.
7. DO-060 to DO-064 and DO-070 to DO-074: both unbalance donuts, each severity, both unavailable messages.
8. DO-080 to DO-088: em dash, each failed request, missing permission, signed out, loading, partial coverage.
9. DO-090 to DO-110: rounding, id filtering, windows, bucket names, and state kept after back.
