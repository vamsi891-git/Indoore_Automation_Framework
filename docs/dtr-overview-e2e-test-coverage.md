# DTR Overview — e2e test coverage

Page: `/dtr/dashboard`. Month under test: **October 2025**. Chart periods: **Daily**.

These cases sign in through the UI, read the response the page just received, and compare that body to the widget. They do not re-check status codes, schemas, or 401s. Those belong in `docs/dtr-overview-api-test-coverage.md`. Locator and menu rules belong in `docs/dtr-overview-web-test-coverage.md`.

There is no e2e spec for this page yet. `tests/e2e/` covers master data and communication only.

Do not hard-code the October 2025 counts. Strip commas before comparing. Compare percents as numbers. `—` is empty and is not `0`.

## DOE-001 October 2025 widgets match the seven reads

1. Sign in with the existing LoginPage and `validAdmin`.
2. Open **DTR Management**.
3. Choose **Oct 2025** on **DTR dashboard month and year**.
4. Leave **Power Status period** and **Energy Consumption period** on **Daily**.
5. Keep the seven GET bodies the page receives after that choice.

| Widget | Response to compare |
| --- | --- |
| Total DTRs, DTRs ON, DTRs OFF, Active Alerts | `GET /dashboard/dtr/summary?period=daily&monthYear=2025-10` |
| Power Status | `GET /dashboard/dtr/power-status?period=daily&monthYear=2025-10` |
| Energy Consumption | `GET /dashboard/dtr/consumption?period=daily&monthYear=2025-10` |
| Communication Status | `GET /dashboard/dtr/communication-status?monthYear=2025-10` |
| Percentage Loading | `GET /dashboard/dtr/percentage-loading?monthYear=2025-10` |
| Load Unbalance | `GET /dashboard/dtr/load-unbalance?monthYear=2025-10` |
| Voltage Unbalance | `GET /dashboard/dtr/voltage-unbalance?monthYear=2025-10` |

Expected:

- Each card count equals that card's `count`.
- Each card footer matches the rounded trend delta and **vs Yesterday**.
- Power Status categories equal the point labels, in order, including every October 2025 day the response returned. **DTR On** equals `onPercentage`. **DTR Off** equals the absolute `offPercentage`.
- Energy Consumption categories equal the point labels. **kWh**, **kVAh**, and **kVARh** equal `kwh`, `kvah`, and `kvarh`.
- Communication center equals Communicating plus Non-Communicating. Each percent is `count / center * 100`.
- Percentage Loading, Load Unbalance, and Voltage Unbalance use the API `total` as the center when it is greater than `0`, otherwise the sum of the items. Each percent is `value / center * 100`.
- The URL stays `/dtr/dashboard`.

## DOE-002 Each card click matches the DTR list total

From the October 2025 page, click one card at a time and go back before the next click.

| Card | UI opens | List call |
| --- | --- | --- |
| Total DTRs | `/master-data/dtrs` | `GET /master-data/dtr-master-data` with no `metric` and no `selectedIds` |
| DTRs ON | `/master-data/dtrs?metric=DTRs ON` | same path, `metric=DTRs ON` |
| DTRs OFF | `/master-data/dtrs` with `selectedIds` | same path, `selectedIds` from `dtrsOff.meterLookupIds` |
| Active Alerts | `/master-data/dtrs` with `selectedIds` | same path, `selectedIds` from `activeAlerts.meterLookupIds` |

Expected:

- The list response `pagination.total` equals the card count.
- The footer **of N** equals that same total.
- Back on `/dtr/dashboard`, the month is still **October 2025** and both periods are still **Daily**.

## DOE-003 Power, Communication, Loading, Load, and Voltage clicks match the details total

From the October 2025 Daily page, click one slice or one non-zero point, then go back.

| Click | Details call | Total must equal |
| --- | --- | --- |
| One **DTR On** point | `GET /dashboard/dtr/power-status-details?status=on&period=daily&bucket={label}&monthYear=2025-10` | that point's `dtrsOn` |
| One **DTR Off** point | `status=off` and the same period, bucket, and month | that point's `dtrsOff` |
| Communicating | `GET /dashboard/dtr/communication-details?status=communicated&monthYear=2025-10` | Communicating count |
| Non-Communicating | `status=non-communicated&monthYear=2025-10` | Non-Communicating count |
| Critical, High Load, Normal, Under Utilized | `GET /dashboard/dtr/percentage-loading-details?band={band}&monthYear=2025-10` | that band's count |
| Severe, Moderate, Balanced on Load Unbalance | `GET /dashboard/dtr/load-unbalance-details?severity={severity}&monthYear=2025-10` | that slice's count |
| Severe, Moderate, Balanced on Voltage Unbalance | `GET /dashboard/dtr/voltage-unbalance-details?severity={severity}&monthYear=2025-10` | that slice's count |

Expected:

- The details page shows that same total.
- Query `monthYear` is `2025-10`.
- After back, the overview month and both Daily periods are unchanged.

## DOE-004 Energy point opens consumption details

1. On October 2025 Daily, click one **kWh**, one **kVAh**, and one **kVARh** point.
2. Read `GET /dashboard/dtr/consumption-details`.

Expected:

- The details URL carries `kind=kwh`, `kind=kvah`, or `kind=kvarh`, and `monthYear=2025-10`.
- The details response is HTTP 200 with `success: true`.
- The bar value is energy. Do not require the details total to equal that kWh, kVAh, or kVARh figure.
- The overview is unchanged after back.
