# Dashboard Overview — UI vs API

Page: `http://localhost:5173/dashboard` (title **Dashboard Overview**).
Sign-in lands on `/consumers`. Open this page from the **Dashboard** link in the main area.

The browser calls the API through the Vite proxy (`VITE_DEV_API_PROXY_TARGET`, default `http://127.0.0.1:3000`). Capture the responses the page itself receives. Do not call a different host and then compare.

## Prompt

```text
Write Playwright web tests for Dashboard Overview at /dashboard.

Sign in with the existing LoginPage and validAdmin user, then open the dashboard from the Consumers page (the main-area Dashboard link, href /dashboard). Listen to the page's own GET responses while it loads. Compare the rendered widgets to those JSON bodies. Do not hard-code live counts.

Rules:
- Unwrap `{ success: true, data }` before reading fields.
- Compare numbers after stripping commas and the % sign. "126,742" equals 126742. "95.87%" equals 95.87.
- A widget that shows "—" is an empty API value. Do not treat "—" as 0.
- Network KPI footer: delta 0 is "No Change" with pill 0; a negative delta is "Decrease by" plus that signed number; a positive delta is "Increase by" plus that number. The phrase ends with "vs Last Month".
- Chart categories must match the API category/month labels in order. Each series name on the chart must match the API series name, and each point must match the API value at that index.
- If a section request fails, that widget shows an error state. Do not assert a number from a failed response.
- Leave login, captcha, and credentials as they already are.

Cover every row in the mapping table in docs/dashboard-ui-vs-api.md.
```

## Mapping

| Widget on the page | Request the page sends | Field the widget uses |
| --- | --- | --- |
| Substations card | `GET /dashboard/consumer/metrics?view=network` | `data.networkDetails.substations.count`, trend delta |
| Feeders card | same | `data.networkDetails.feeders.count`, trend delta |
| DTRs card | same | `data.networkDetails.dtrs.count`, trend delta |
| Consumers card | same | `data.networkDetails.consumers.count`, trend delta |
| Billing Availability | `GET /dashboard/revenue-subsidy-pf` | `data.billingAvailability.amount` (shown in lac). Meters slot uses `meterCount` |
| Billing Efficiency | same | `data.billingEfficiency.amount`. Energy slot uses `energyLu` |
| Incentive PF > 0.85 | same | `data.incentivePf.amount`. Meter slot uses `meterCount` |
| Penalty PF < 0.80 | same | `data.penaltyPf.amount`. Meter slot uses `meterCount` |
| Revenue Gained (amount) | same | `data.revenueGainedRpu.amount` |
| Revenue Gained, Input (LU) | same | `data.revenueGainedRpu.inputLu` |
| Revenue Gained, RPU (₹) | same | `data.revenueGainedRpu.rpu` |
| Subsidy Amount | same | `data.subsidyAmount` |
| Overall Improvement | same | `data.overallImprovement` (crore) |
| Avg Improvement | same | `data.avgImprovement`. Bill count 0 renders "—" |
| Expected ROI | `GET /dashboard/overall-metrics` | `data.expectedRoi.value` (example shape: `28 Months`) |
| Load Enhanced | same | `data.loadEnhanced.value` (example shape: `35.32 MW`) |
| Meter Trends / Installation Summary | `GET /overall-dashboard/installation-summary` | Center total is `totalMeterCount`. Mapped Meters is `installedMeters.meterCount` and `sharePercent`. Unmapped Meters is `nonInstalledMeters.meterCount` and `sharePercent` |
| Communication Status | `GET /mis-dashboard/communication?fromDate={today}&toDate={today}` | `data.overall.total`. Comm Meters is `communicating.count` and `communicating.percentage`. Non-Comm Meters is `nonCommunicating.count` and `nonCommunicating.percentage`. The date stamp is today |
| Meter Status (last 6 months) | `GET /overall-dashboard/disconnection-details` | X labels are `months[].month` (or `label`). Disconnected Meters is `months[].disconnected`. Reconnected Meters is `months[].connected` |
| Disconnection Summary (Amount In Lac) | `GET /overall-dashboard/charts/disconnection-summary` | `data.categories` and `data.series[]` (`name`, `data[]`). Series names: Arrears, Reconn, RC/DC, ManPwr Saving |
| ATR Amount (In Lac) | `GET /overall-dashboard/charts/atr-amount` | `data.categories` and `data.series[]`. Series name: Amount |
| Billing Efficiency (In %) | `GET /overall-dashboard/charts/billing-efficiency` | `data.chart.categories`, `data.chart.series[]`, and `data.donut[]` (`label`, `value`, `percent`) |
| Benefits From Reported ATR Cases | `GET /overall-dashboard/charts/benefits-atr-cases` | `data.donut[]` (`label`, `value`, `percent`). Center total is the sum of `value` |

`revenue-subsidy-pf` may be called with `periodYear` and `periodMonth` for the selected month. Read the query string from the request the page made and use that same response.

## Checks

1. Each request above returns HTTP 200 and `success: true` while the dashboard is open.
2. Each card count equals the mapped field, with thousands separators allowed on screen.
3. Each card footer delta equals the API trend delta, using the Increase / Decrease / No Change wording above.
4. Installation Summary: mapped count + unmapped count = total meters. Each share percent matches `sharePercent`.
5. Communication Status: communicating count + non-communicating count is consistent with `overall.total` when `overall.total` is present. Percentages match the API strings.
6. Meter Status: six month labels, in API order, and both series match `disconnected` and `connected`.
7. Column and donut charts: legend names, axis labels, and point values match `categories` and `series` (or `donut`).
8. An empty commercial KPI shows "—" and is not compared as zero.

## Out of this page

The asset location map is a separate Asset Management widget. Do not compare its Online / Offline counts to the dashboard KPI APIs. Account-setup reminders (Verify your phone number) are not dashboard metrics.
