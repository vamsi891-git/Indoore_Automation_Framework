# Consumer Overview — test coverage

Page under test: `/consumers` after sign-in.
Heading: **Consumer Overview**. Section tab: **Consumers**. Inner tab: **Default Dashboard**.

This file is the case list for that screen. Every widget, click, and comparison rule on Default Dashboard is a case. Live Communication, DTR Management, and Water / DG / Gas are listed only as chrome that must not steal this page. They are not executed here.

Do not hard-code live counts. Read the JSON the page itself receives (Vite proxy to `VITE_DEV_API_PROXY_TARGET`). Unwrap `{ success: true, data }` before reading fields. Scope every locator to `main` so the sidebar is not matched.

## Comparison rules

Apply these on every case that reads a number.

| Rule | How to assert |
| --- | --- |
| Thousands separators | Strip commas. `126,742` equals `126742`. |
| Percents | Compare as numbers. `0.00%` equals `0`. `88.1%` equals `88.1`. |
| Empty value | `—` is empty. Do not treat it as `0`. |
| Failed request | Assert the error or empty state for that widget. Do not assert a number from that response. |
| Card footer, Consumers | `Active consumers decreased by` or `increased by` or `No Change`, then the signed delta, then `vs Last Month`. Past tense: Decreased / Increased. |
| Card footer, other three cards | Same wording without the `Active consumers` prefix. |
| Delta | Last `trends` value minus the value before it. Zero is `No Change` and pill `0`. |
| Meter Status percent | From the meter-status API, 2 decimal places. |
| Relay, OEM, Phase, Category percent | `count / visible center total * 100`. Do not use the raw API `percentage` string. Category percents are recomputed from displayed counts. |
| Relay center | Connected + Disconnected only. Permanently Disconnected is hidden. Center is not `connectionStatus.totalMeterCount` when that slice is hidden. |
| List proof | Table footer `Showing a–b of N` and the list response `total` both equal the number that was clicked. |
| Return | After every drill-down, go back to `/consumers`. Default Dashboard is still selected before the next click. |

## Requests

| Widget | Request the page sends |
| --- | --- |
| Four KPI cards, OEM, Relay, Phase, Category | `GET /dashboard/consumer/metrics?view=consumer` |
| Meter Status | `GET /dashboard/consumer/meter-status?fromDate={date}&toDate={date}&monthYear={YYYY-MM}` |
| Card, Meter Status, OEM, Relay, Phase click | `GET /master-data/consumer-master-data?...` |
| Category click | `GET /dashboard/consumer/category-distribution?category={name}` |

The metrics call may also send `organisationLookupId` or `networkLookupId` for the signed-in scope. Use the query string the browser actually sent.

## Locators

`exact: false` means the accessible name contains that text.

| What | Role | Name |
| --- | --- | --- |
| Page heading | text | Consumer Overview |
| Section tab | tab | Consumers |
| DTR section | tab | DTR Management |
| Disabled sections | tab | Water, DG, Gas |
| Month control | button | Consumer dashboard month and year |
| Inner tab | tab | Default Dashboard |
| Live tab | tab | Live Communication |
| Consumers card | link | Consumers |
| Postpaid card | link | Postpaid Connections |
| Prepaid card | link | Prepaid Connections |
| Net metering card | link | Net Metering Consumers |
| Meter Status slice | button | Open Communicating details, Open Non-Communicating details |
| OEM slice | button | Open {OEM name} details |
| Relay slice | button | Open Connected details, Open Disconnected details |
| Phase slice | button | Open 1 PH details, Open 3 PH WC details, Open 3 PH 4 CT details |
| Category row | link | Open {category name} category distribution details |
| Widget download | button | Download (scope it to that widget; several exist) |
| Header search | button | Open search |
| Theme | button | Switch to dark theme |
| Notifications | button | Open notifications |
| Profile | button | Open profile menu |

Donut center text is not a separate control. Read it from the widget that contains **Meter Status**, **OEM Distribution**, **Relay Status Overview**, **Phase Distribution**, or **Category Distribution**.

## Already automated

| Case | Spec |
| --- | --- |
| CO-001 page ready, heading, URL | `tests/web/dashboard/consumers-overview.web.spec.ts` — shows Consumer Overview after sign-in |
| CO-010 to CO-013 card count and master-data `of N` | same file — card count matches Consumer Data total |
| CO-030, CO-040, CO-050, CO-060 donut centers and slices | same file — each donut total equals its own slices |
| CO-070 category counts, order, percents | same file — category distribution counts match merged metrics |
| API metrics 200, prepaid + postpaid = total, OEM sum = phase sum, category sum = total consumers, relay slices = `totalMeterCount` | `tests/api/dashboard/consumer-overview-api.spec.ts` |
| Metrics without a token is 401 | same API spec |

Cases below that are not in that table are still required. A donut total test does not replace a drill-down.

---

## A. Page shell

### CO-001 Sign-in lands on Consumer Overview

Priority: smoke.

1. Sign in with `validAdmin` through `LoginPage`.
2. Wait until the URL is `/consumers`.

Expected:

- URL path is `/consumers`.
- Main heading is **Consumer Overview**.
- **Consumers** tab is selected.
- **Default Dashboard** tab is selected.
- **Live Communication** is present and not selected.

### CO-002 Metrics and meter-status load with the page

1. While CO-001 loads, capture the page's own GET responses.

Expected:

- `GET /dashboard/consumer/metrics?view=consumer` is HTTP 200 and `success: true`.
- `GET /dashboard/consumer/meter-status` is HTTP 200 for the month shown on **Consumer dashboard month and year**.
- `monthYear` on that request matches the period button.

### CO-003 Main-area Consumers card is not the sidebar link

1. Resolve the **Consumers** link inside `main`.

Expected: the match is the KPI card, not a navigation item outside `main`.

### CO-004 Section tabs that are not this dashboard

1. Read **DTR Management**, **Water**, **DG**, and **Gas**.

Expected:

- **DTR Management** is present. This case does not open it.
- **Water**, **DG**, and **Gas** are disabled and do not navigate.

### CO-005 Header controls stay on this dashboard

For each button — **Open search**, **Switch to dark theme**, **Open notifications**, **Open profile menu**:

1. Click the button.
2. Close the surface it opens.

Expected: the URL is still `/consumers`, **Default Dashboard** is still selected, and the four KPI cards are still visible. Theme toggle changes the theme and can be switched back.

### CO-006 Each widget download stays on the dashboard

Scope **Download** to each widget that has one: the four cards if present, Meter Status, OEM Distribution, Relay Status Overview, Phase Distribution, Category Distribution.

1. Click that widget's **Download**.

Expected: a download starts, the page does not navigate, and **Default Dashboard** stays selected.

---

## B. KPI cards

Source: `data.consumerType`. Visible count is `count` with thousands separators. Footer number is the last `trends` value minus the previous one.

| ID | Card | API field | Click opens |
| --- | --- | --- | --- |
| CO-010 | Consumers | `consumerType.totalConsumers` | `/master-data/consumers` |
| CO-011 | Postpaid Connections | `consumerType.postpaid` | `/master-data/consumers?paymentContractTblRefId={postpaid.paymentContractTblRefId}` |
| CO-012 | Prepaid Connections | `consumerType.prepaid` | `/master-data/consumers?paymentContractTblRefId={prepaid.paymentContractTblRefId}` |
| CO-013 | Net Metering Consumers | `consumerType.netMeter` | `/master-data/consumers?isNetMeter=true` |

### CO-010 to CO-013 Count, footer, and drill-down

Run once per row.

1. Read the card count and footer in `main`.
2. Click the card.
3. Wait for `GET /master-data/consumer-master-data`.
4. Read `Showing a–b of N` and `data.total`.
5. Return to `/consumers` and confirm **Default Dashboard**.

Expected:

- Card count equals that field's `count`.
- Footer matches the delta wording in Comparison rules. Consumers includes the `Active consumers` prefix. The other three do not.
- Path is `/master-data/consumers`.
- Postpaid and Prepaid put `paymentContractTblRefId` on the query string, equal to that slice's id.
- Net Metering sets `isNetMeter=true`.
- Consumers card adds no payment or net-meter filter.
- Footer `of N` and list `total` both equal the card count.
- After return, heading **Consumer Overview** and **Default Dashboard** are selected.

### CO-014 Zero delta

When the computed delta is `0`:

Expected: footer text is **No Change**, the pill shows `0`, and the phrase still ends with `vs Last Month`.

### CO-015 API identity used by the cards

On the same metrics body:

Expected: `prepaid.count + postpaid.count` equals `totalConsumers.count`. Net metering is not added into that sum.

---

## C. Meter Status

Source: meter-status response.

| On screen | API field |
| --- | --- |
| Center **Total** | `totalConsumerMeters` |
| Communicating count | `communicatedConsumerMeters` |
| Communicating % | `communicatedPercentage` (2 decimals) |
| Non-Communicating count | `nonCommunicatedConsumerMeters` |
| Non-Communicating % | `nonCommunicatedPercentage` (2 decimals) |

### CO-020 Center and both slices

1. Read the Meter Status widget.

Expected:

- Title is **Meter Status**. Center label is **Total**.
- Communicating + Non-Communicating equals the center total and equals `totalConsumerMeters`.
- Both counts and both percents match the fields above.
- Slice buttons are **Open Communicating details** and **Open Non-Communicating details**.

### CO-021 Communicating drill-down

1. Click **Open Communicating details**.
2. Read the master-data list.
3. Return to `/consumers`.

Expected:

- URL is `/master-data/consumers?communicationStatus=communicating`.
- List `total` and `of N` equal `communicatedConsumerMeters`.

### CO-022 Non-Communicating drill-down

Same steps with **Open Non-Communicating details**.

Expected:

- URL contains `communicationStatus=non-communicating`.
- List `total` and `of N` equal `nonCommunicatedConsumerMeters`.

### CO-023 Month with no coverage

When the selected month has no meter-status coverage:

Expected: both slice clicks are absent, and `data-testid="consumer-meter-status-data-unavailable"` is visible. Do not assert communicating counts.

### CO-024 Change the dashboard month

1. Open **Consumer dashboard month and year**.
2. Choose a different month that has coverage.
3. Capture the new meter-status request.

Expected:

- The period button shows the selected month.
- The new request's `monthYear`, `fromDate`, and `toDate` match that month.
- Meter Status counts follow that response, not the previous month.
- KPI metrics stay on `view=consumer` for the signed-in scope.

---

## D. OEM Distribution

Source: `data.oemWiseConsumer`. Each entry's `label` (or the object key) is the OEM name. `count` is the meter count. `deviceManufacturerTblRefId` is the click filter.

### CO-030 Center, names, counts, percents

1. Read every legend row.

Expected:

- Title is **OEM Distribution**. Center label is **Total Meters**.
- Center total equals the sum of OEM `count` values.
- Every API OEM name is on screen with its `count`.
- Percent is `count / center total * 100`, 1 decimal. Ignore the API `percentage` string.
- Each row's button name is **Open {name} details**.

### CO-031 One drill-down per OEM

For every OEM entry:

1. Click **Open {name} details**.
2. Read the master-data list.
3. Return to `/consumers`.

Expected:

- URL contains `deviceManufacturerTblRefId` from that entry.
- List `total` and `of N` equal that OEM `count`.

### CO-032 OEM sum matches phase sum

On the same metrics body: sum of `oemWiseConsumer` counts equals sum of `phaseWiseConsumer` counts.

---

## E. Relay Status Overview

Source: `data.connectionStatus`.

| Slice | API field | Click filter |
| --- | --- | --- |
| Connected | `cd.count`, label `cd.label` | `connectionStatusTblRefId={cd.connectionStatusTblRefId}` |
| Disconnected | `td.count`, label `td.label` | `connectionStatusTblRefId={td.connectionStatusTblRefId}` |
| Permanently Disconnected | `pd.count` | Not shown |

### CO-040 Visible slices and center

1. Read the relay widget.

Expected:

- Title is **Relay Status Overview**. Center label is **Total Meters**.
- Only Connected and Disconnected are shown. Permanently Disconnected has no slice and no **Open Permanently Disconnected details** button.
- Center total equals Connected count + Disconnected count.
- It does not equal `connectionStatus.totalMeterCount` when `pd.count` is greater than 0.
- Each percent is `slice / center * 100`, 1 decimal.

### CO-041 Connected drill-down

1. Click **Open Connected details** (use `cd.label` when the API label differs).
2. Read the list. Return to `/consumers`.

Expected: URL contains `connectionStatusTblRefId` from `cd`. List `total` and `of N` equal `cd.count`.

### CO-042 Disconnected drill-down

Same steps for `td` / **Open Disconnected details**.

Expected: filter id is `td.connectionStatusTblRefId`. List `total` and `of N` equal `td.count`.

### CO-043 API still accounts for the hidden slice

`cd.count + td.count + pd.count` equals `connectionStatus.totalMeterCount`. The donut center does not include `pd`.

---

## F. Phase Distribution

Source: `data.phaseWiseConsumer`. Each entry has `label`, `count`, `servicePointMeterPhaseTblRefId`.

Labels when the API returns them: **1 PH**, **3 PH WC**, **3 PH 4 CT**. Include **HT** only when the API returns it. Do not require a label the response omitted.

### CO-050 Center and slices

Expected:

- Title is **Phase Distribution**. Center label is **Total Meters**.
- Center total equals the sum of phase `count` values.
- Every returned label and count is on screen.
- Percent is `count / center total * 100`.

### CO-051 One drill-down per phase

For each entry, including HT when present:

1. Click **Open {label} details**.
2. Read the master-data list.
3. Return to `/consumers`.

Expected:

- URL contains `servicePointMeterPhaseTblRefId` from that entry.
- List `total` and `of N` equal that phase `count`.

---

## G. Category Distribution

Source: `data.categoryWiseConsumer`, merged onto this fixed order. Aliases such as Bhagya Jyothi fold into SCH. Temporary is not Unknown.

| Order | Code | Name | Aliases folded into this row |
| --- | --- | --- | --- |
| 1 | RES | Residential | residential |
| 2 | COM | Commercial | commercial |
| 3 | IND | Industrial | industrial |
| 4 | AGRI | Agriculture | agriculture, agricultural |
| 5 | SCH | School | school, bhagya jyothi, bhagyajyothi, bhagya-jyothi |
| 6 | SLIGHT | Street Light | street light, streetlight, street-light |
| 7 | TEMP | Temporary | temporary |
| 8 | EV | Electric Vehicle | electric vehicle, electric-vehicle, electric vehicle charging station |
| 9 | UNKNOWN | Unknown | unknown |

### CO-060 Nine rows, order, counts, percents

1. Read every category row.

Expected:

- Title is **Category Distribution**.
- All nine rows are present in the order above.
- Row text is `{CODE} - {Name} ({count})`.
- Count is the merged total for that code, including aliases.
- Percent is `count / sum of displayed counts * 100`. Ignore the API `percentage` string.
- Sum of the nine counts equals `consumerType.totalConsumers.count`.
- An API category that matches none of the nine rows fails the test. It must not be dropped.
- Link name is **Open {Name} category distribution details**.

### CO-061 to CO-069 One drill-down per category

| ID | Name |
| --- | --- |
| CO-061 | Residential |
| CO-062 | Commercial |
| CO-063 | Industrial |
| CO-064 | Agriculture |
| CO-065 | School |
| CO-066 | Street Light |
| CO-067 | Temporary |
| CO-068 | Electric Vehicle |
| CO-069 | Unknown |

For that row:

1. Click **Open {Name} category distribution details**.
2. Wait for `GET /dashboard/consumer/category-distribution?category={Name}`.
3. Read the list footer.
4. Return to `/consumers`.

Expected:

- URL is `/consumers/dashboard/category-distribution?category={Name}`.
- Page title is **Category Distribution**.
- Response `total` and footer `of N` equal the count in parentheses on the row that was clicked.
- Back on `/consumers`, **Default Dashboard** is selected.

---

## H. Empty and failure

### CO-080 Empty metric renders an em dash

When a card, slice, or category value is null or blank:

Expected: the screen shows `—`. The test does not compare that cell to `0`.

### CO-081 Metrics request fails

When `GET /dashboard/consumer/metrics?view=consumer` fails:

Expected: the cards, OEM, Relay, Phase, and Category widgets show their error or empty state. No count from that body is asserted.

### CO-082 Meter-status request fails

When `GET /dashboard/consumer/meter-status` fails:

Expected: Meter Status shows its error or empty state. Communicating and Non-Communicating are not asserted from that body. The other widgets may still assert the metrics response.

### CO-083 Master-data list fails after a click

When `GET /master-data/consumer-master-data` fails after a card or donut click:

Expected: the list page shows its error or empty state. Do not treat a missing footer as `of 0` matching a real count.

### CO-084 Category list fails

When `GET /dashboard/consumer/category-distribution` fails:

Expected: the category page shows its error or empty state. `of N` is not taken from a failed body.

---

## I. What this file does not execute

These sit on the same shell. Opening them is a different coverage file.

| Control | Why it is out of this run |
| --- | --- |
| **Live Communication** | Separate inner dashboard |
| **DTR Management** | Separate section |
| **Water**, **DG**, **Gas** | Disabled. CO-004 only checks they do not navigate |

## Coverage checklist

1. CO-001 and CO-002: `/consumers`, heading, Consumers selected, Default Dashboard selected, both GETs are 200.
2. CO-010 to CO-015: four card counts and footers, then each click's filter and `of N`.
3. CO-020 to CO-024: Meter Status center, both percents, both clicks, unavailable month, month change.
4. CO-030 to CO-032: OEM center is the sum, every name and percent, every OEM click.
5. CO-040 to CO-043: Relay shows Connected and Disconnected only, both clicks, hidden Permanently Disconnected.
6. CO-050 and CO-051: Phase center is the sum, every phase click, HT only if returned.
7. CO-060 to CO-069: nine categories in order, every category click.
8. CO-080 to CO-084: em dash and failed requests.
9. After every click, the next case starts again on `/consumers` with Default Dashboard selected.
