# Consumer Overview — UI vs API

Page: `http://localhost:5173/consumers` after sign-in.
Heading: **Consumer Overview**. Selected section tab: **Consumers**. Selected inner tab: **Default Dashboard**.

Capture the JSON the page itself receives (Vite proxy to `VITE_DEV_API_PROXY_TARGET`). Unwrap `{ success: true, data }` before reading fields. Do not hard-code live counts such as `126,742`.

## Prompt

```text
Write Playwright web tests for Consumer Overview at /consumers.

Sign in with the existing LoginPage and validAdmin user. Stay on Default Dashboard (not Live Communication). Scope every locator to the main area so the sidebar is not matched.

Listen to the page's own GET responses. For every card and every donut row, read the visible text, compare it to the API field in docs/consumers-overview-ui-vs-api.md, then click it. On the page that opens, the table footer "Showing a–b of N" must have N equal to the number you clicked, and the list response total must equal that same N. Go back to /consumers before the next click.

Rules:
- Strip commas before comparing. "126,742" equals 126742.
- Compare percents as numbers. "0.00%" equals 0. "88.1%" equals 88.1.
- Consumers card footer is "Active consumers decreased by" or "increased by" or "No Change", then the signed delta, then "vs Last Month". The other three cards use the same wording without the "Active consumers" prefix. Past tense: Decreased / Increased. Delta is the last trends bucket minus the one before it. Zero shows "No Change" and pill 0.
- Meter Status percents come from the meter-status API (2 decimal places). Relay, OEM, and Phase percents are count / visible center total, not the raw API percentage string.
- Relay Status hides Permanently Disconnected. Its center total is Connected + Disconnected only.
- Category percents are recomputed from counts. Do not assert the API percentage string.
- An empty value is "—". Do not treat it as 0.
- If a request fails, assert the error or empty state. Do not assert a number from that response.
```

## Locators

Use these accessible names. `exact: false` means the accessible name contains that text.

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

Donut center text is not a separate control. Read it from the widget that contains the title **Meter Status**, **OEM Distribution**, **Relay Status Overview**, **Phase Distribution**, or **Category Distribution**.

## Requests the page sends

| Widget | Request |
| --- | --- |
| Four KPI cards, OEM, Relay, Phase, Category | `GET /dashboard/consumer/metrics?view=consumer` |
| Meter Status | `GET /dashboard/consumer/meter-status?fromDate={date}&toDate={date}&monthYear={YYYY-MM}` |
| Card click, Meter Status click, OEM click, Relay click, Phase click | `GET /master-data/consumer-master-data?...` |
| Category click | `GET /dashboard/consumer/category-distribution?category={name}` |

The metrics call may also send `organisationLookupId` or `networkLookupId` for the signed-in scope. Use the query string the browser actually sent.

## Cards

Source: `data.consumerType` on the metrics response. The visible count is `count` with thousands separators.

| Card | API field | Click opens |
| --- | --- | --- |
| Consumers | `consumerType.totalConsumers` | `/master-data/consumers` |
| Postpaid Connections | `consumerType.postpaid` | `/master-data/consumers?paymentContractTblRefId={postpaid.paymentContractTblRefId}` |
| Prepaid Connections | `consumerType.prepaid` | `/master-data/consumers?paymentContractTblRefId={prepaid.paymentContractTblRefId}` |
| Net Metering Consumers | `consumerType.netMeter` | `/master-data/consumers?isNetMeter=true` |

Footer number = last `trends` value minus the previous `trends` value.

On the master-data page, `data.total` (pagination total) and the footer `of N` both equal that card's `count`.

## Meter Status

Source: meter-status response.

| On screen | API field |
| --- | --- |
| Center **Total** | `totalConsumerMeters` |
| Communicating count | `communicatedConsumerMeters` |
| Communicating % | `communicatedPercentage` (2 decimals) |
| Non-Communicating count | `nonCommunicatedConsumerMeters` |
| Non-Communicating % | `nonCommunicatedPercentage` (2 decimals) |

Communicating + Non-Communicating = Total.

| Click | Opens | List filter |
| --- | --- | --- |
| Open Communicating details | `/master-data/consumers?communicationStatus=communicating` | `communicationStatus=communicating` |
| Open Non-Communicating details | `/master-data/consumers?communicationStatus=non-communicating` | `communicationStatus=non-communicating` |

List `total` and `of N` equal that slice's count. Clicks are absent when the selected month has no coverage; the widget then shows the unavailable-period message (`data-testid="consumer-meter-status-data-unavailable"`).

## OEM Distribution

Source: `data.oemWiseConsumer`. Each entry's `label` (or the object key) is the OEM name. `count` is the meter count. `deviceManufacturerTblRefId` is the click filter.

| On screen | Rule |
| --- | --- |
| Title | OEM Distribution |
| Center **Total Meters** | Sum of OEM `count` |
| Legend row | `{label}` and `count` |
| Percent | `count / center total * 100`, 1 decimal. Do not use the API `percentage` string |

Click **Open {name} details**. URL contains `deviceManufacturerTblRefId` from that entry. List `total` and `of N` equal that OEM `count`.

## Relay Status Overview

Source: `data.connectionStatus`.

| Slice | API field | Click filter |
| --- | --- | --- |
| Connected | `cd.count`, label `cd.label` | `connectionStatusTblRefId={cd.connectionStatusTblRefId}` |
| Disconnected | `td.count`, label `td.label` | `connectionStatusTblRefId={td.connectionStatusTblRefId}` |
| Permanently Disconnected | `pd.count` | Not shown on the donut |

Center **Total Meters** = Connected count + Disconnected count. It is not `connectionStatus.totalMeterCount` when Permanently Disconnected is hidden.

Percent = slice count / center total * 100, 1 decimal.

Click **Open Connected details** or **Open Disconnected details**. List `total` and `of N` equal that slice's count.

## Phase Distribution

Source: `data.phaseWiseConsumer`. Each entry: `label`, `count`, `servicePointMeterPhaseTblRefId`.

Expected labels when present: **1 PH**, **3 PH WC**, **3 PH 4 CT**. Include **HT** only if the API returns it.

| On screen | Rule |
| --- | --- |
| Title | Phase Distribution |
| Center **Total Meters** | Sum of phase `count` |
| Percent | `count / center total * 100` |

Click **Open {label} details**. URL contains `servicePointMeterPhaseTblRefId`. List `total` and `of N` equal that phase `count`.

## Category Distribution

Source: `data.categoryWiseConsumer`, merged onto this fixed order:

RES Residential, COM Commercial, IND Industrial, AGRI Agriculture, SCH School, SLIGHT Street Light, TEMP Temporary, EV Electric Vehicle, UNKNOWN Unknown.

Aliases such as Bhagya Jyothi fold into SCH. Temporary is not Unknown.

| On screen | Rule |
| --- | --- |
| Title | Category Distribution |
| Row text | `{CODE} - {Name} ({count})` |
| Percent | `count / sum of displayed counts * 100`. Ignore the API `percentage` string |
| Link name | Open {Name} category distribution details |

Click a row. URL is `/consumers/dashboard/category-distribution?category={Name}`. The page title is **Category Distribution**. Its list call is `GET /dashboard/consumer/category-distribution?category={Name}`. Response `total` and footer `of N` equal the count in parentheses on the row you clicked.

## Coverage checklist

1. Page is `/consumers`, heading Consumer Overview, Consumers tab selected, Default Dashboard selected.
2. Metrics request is 200. Meter-status request is 200 for the month on the period button.
3. All four card counts and footers match `consumerType`.
4. Each card click: master-data URL filters match the table above, and `of N` equals the card count.
5. Meter Status center, both slices, and both percents match meter-status. Both clicks match `of N`.
6. OEM center equals the sum of slices. Every OEM name, count, and percent matches. Every OEM click matches `of N`.
7. Relay shows Connected and Disconnected only. Center equals their sum. Both clicks match `of N`.
8. Phase center equals the sum of slices. Every phase click matches `of N`.
9. All nine category rows are present in order. Counts and percents match the merged metrics. Every category click matches `of N`.
10. Return to `/consumers` after each click. The Default Dashboard is still the one under test.

Live Communication, DTR Management, and the disabled Water / DG / Gas tabs are not part of this file.
