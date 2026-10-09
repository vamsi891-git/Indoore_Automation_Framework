# DTR Overview — web test coverage

Page under test: `/dtr/dashboard`.
Heading: **DTR Overview**. Section: **DTR Management**. Breadcrumb: **Dashboard / DTR Overview**.

Open it from **DTR Management**. Scope every locator to `main`. Do not hard-code live counts. Read the JSON the page itself receives for the month under test. Unwrap `{ success: true, data }` before reading fields. The worked example is **October 2025** with both chart periods on **Daily**. Counts from that capture are in `docs/dtr-overview.md`.

The API checks are in `docs/dtr-overview-api-test-coverage.md`. The UI-against-API checks are in `docs/dtr-overview-e2e-test-coverage.md`.

## Controls

| What | Role | Name |
| --- | --- | --- |
| Month | button | DTR dashboard month and year |
| Power period | button | Power Status period |
| Energy period | button | Energy Consumption period |
| Total DTRs | button | name contains Total DTRs |
| DTRs ON | button | name contains DTRs ON |
| DTRs OFF | button | name contains DTRs OFF |
| Active Alerts | button | name contains Active Alerts |
| Communicating | button | Open Communicating details |
| Non-Communicating | button | Open Non-Communicating details |
| Loading bands | button | Open Critical details, Open High Load details, Open Normal details, Open Under Utilized details |
| Energy series | button | kWh, kVAh, kVARh |
| Load and Voltage slices | button | Open Severe details, Open Moderate details, Open Balanced details, scoped to that widget |
| Widget download | button | Download, scoped to that widget |

There is no button named **DTR overview period**. Hourly is not a choice.

## DOW-001 DTR Management opens DTR Overview

1. Sign in with a user who has `DTRS_VIEW`.
2. Open **DTR Management**.

Expected:

- URL path is `/dtr/dashboard`.
- Heading is **DTR Overview**. Breadcrumb is **Dashboard / DTR Overview**.
- **DTR Management** is selected. Water, DG, and Gas stay disabled.
- The month button's accessible name is **DTR dashboard month and year**.
- **Power Status period** and **Energy Consumption period** both read **Daily**.
- No control is named **DTR overview period**.

## DOW-002 First paint requests

While DOW-001 loads, capture the page's own GET responses.

On the checked session the current month was October 2026. The first paint sent:

| Request | Query |
| --- | --- |
| `GET /dashboard/dtr/summary` | `period=daily&monthYear=2026-10` |
| `GET /dashboard/dtr/power-status` | `period=daily&monthYear=2026-10` |
| `GET /dashboard/dtr/consumption` | `period=daily&monthYear=2026-10` |
| `GET /dashboard/dtr/communication-status` | no query |
| `GET /dashboard/dtr/load-unbalance` | no query |
| `GET /dashboard/dtr/voltage-unbalance` | no query |
| `GET /dashboard/dtr/percentage-loading` | no query |

Expected: each returns HTTP 200 and `success: true`.

## DOW-003 October 2025 refreshes every widget read

1. Open **DTR dashboard month and year**.
2. Choose **Oct 2025**.

Expected:

- Jan 2025 through May 2025 are disabled. Jun 2025 is the first enabled month. **Previous year** is disabled on 2025. **Clear** is present. **Oct** is pressed.
- The button text is **October 2025**.
- These seven calls are sent again, each with `monthYear=2025-10`. Summary, Power Status, and Energy Consumption also keep `period=daily`.

| Widget | Request |
| --- | --- |
| Four cards | `GET /dashboard/dtr/summary?period=daily&monthYear=2025-10` |
| Power Status | `GET /dashboard/dtr/power-status?period=daily&monthYear=2025-10` |
| Energy Consumption | `GET /dashboard/dtr/consumption?period=daily&monthYear=2025-10` |
| Communication Status | `GET /dashboard/dtr/communication-status?monthYear=2025-10` |
| Percentage Loading | `GET /dashboard/dtr/percentage-loading?monthYear=2025-10` |
| Load Unbalance | `GET /dashboard/dtr/load-unbalance?monthYear=2025-10` |
| Voltage Unbalance | `GET /dashboard/dtr/voltage-unbalance?monthYear=2025-10` |

- **Oct 2025** is shown above Power Status, Energy Consumption, Load Unbalance, and Voltage Unbalance.
- Communication Status and Percentage Loading have no month caption. Communication Status still reads **Current status of active Meters**.
- Card footers still say **vs Yesterday**.
- Power Status subtitle is **ON and OFF status for 1 Oct–31 Oct 2025**, and the axis lists **1 Oct** through **31 Oct**.
- Energy Consumption subtitle is **Energy usage · Daily · 1 Oct–31 Oct 2025**, with the same 31 days.
- A month after the current `Asia/Kolkata` month cannot be chosen.

## DOW-004 Period menus are Daily and Weekly, and they are separate

1. Open **Power Status period**.
2. Close it without changing the choice.
3. Open **Energy Consumption period**.

Expected:

- Each menu offers **Daily** and **Weekly** only.
- Choosing **Weekly** on Power Status refetches `GET /dashboard/dtr/power-status` with `period=weekly` and the selected `monthYear`. It does not change the Energy Consumption button.
- Choosing **Weekly** on Energy Consumption refetches `GET /dashboard/dtr/consumption` with `period=weekly` and the selected `monthYear`. It does not change the Power Status button.
- The four cards keep **vs Yesterday** unless their own summary request changes. Communication Status, Percentage Loading, Load Unbalance, and Voltage Unbalance have no period control.

## DOW-005 Cards match the summary response

Source: the summary response for the selected month.

| Card | Field |
| --- | --- |
| Total DTRs | `totalDtrs.count` |
| DTRs ON | `dtrsOn.count` |
| DTRs OFF | `dtrsOff.count` |
| Active Alerts | `activeAlerts.count` |

Expected:

- The visible count equals that field after stripping commas and rounding half away from zero. A negative count renders `0`.
- A footer is present only when `trends` has at least two finite values. Delta is the last value minus the one before it, then rounded. `0` is **No Change** and has no number pill. A positive delta is **Increase by**, a pill `+N`, then **vs Yesterday** on Daily. A negative delta is **Decrease by**, a signed pill, then **vs Yesterday**.
- Do not require DTRs ON plus DTRs OFF to equal Total DTRs.
- `—` is empty. Do not treat it as `0`.

## DOW-006 Card clicks open the DTR list

Click each card, then go back to `/dtr/dashboard`. The month and both period buttons stay as they were.

| Card | List |
| --- | --- |
| Total DTRs | `/master-data/dtrs` with no `metric` and no `selectedIds`. `GET /master-data/dtr-master-data` total equals the card count. |
| DTRs ON | `metric=DTRs ON`. `selectedIds` is not sent. List total equals the card count. |
| DTRs OFF | `selectedIds` from `dtrsOff.meterLookupIds`, positive integers only. List total equals the card count. |
| Active Alerts | `selectedIds` from `activeAlerts.meterLookupIds`, positive integers only. List total equals the card count. |

## DOW-007 Power Status

Source: `GET /dashboard/dtr/power-status` for the selected period and month.

Expected:

- Title **Power Status**. Y axis **DTR Availability (%)** runs from -100% to 100%.
- **DTR On** values equal `onPercentage`. **DTR Off** values equal the absolute `offPercentage` and are drawn at or below zero.
- For October 2025 Daily, every returned day in that month is on the axis. Do not trim the series to 12 points.
- Clicking a **DTR On** point opens `/dtr/dashboard/power-status` with `status=on`, `period` equal to the Power Status period, `bucket` equal to that point's label, and `monthYear` when a month is selected. `GET /dashboard/dtr/power-status-details` uses the same query. Its total equals that point's `dtrsOn`.
- **DTR Off** uses `status=off` and `dtrsOff`.
- A point whose percentage is `0` does not open a details page.
- **Download** stays on `/dtr/dashboard`. The file prefix is `dtr-power-status`. Columns are **DTR On** and **DTR Off** only.

## DOW-008 Communication Status

Source: `GET /dashboard/dtr/communication-status` for the selected month.

Expected:

- Subtitle **Current status of active Meters**. Center title **Total Meters**.
- Center equals Communicating plus Non-Communicating.
- Each percent is `count / center * 100`. A center of `0` yields `0%`.
- **Open Communicating details** opens `/dtr/dashboard/communication?status=communicated`. `GET /dashboard/dtr/communication-details` total equals the Communicating count. For October 2025 the details call also sends `monthYear=2025-10` when the page put that month on the chart request.
- **Open Non-Communicating details** uses `status=non-communicated`.
- **Download** prefix is `dtr-communication-status`.

## DOW-009 Percentage Loading

Source: `GET /dashboard/dtr/percentage-loading` for the selected month.

Subtitle **Transformer utilization distribution**. Center title **Analyzed meters**.

| On screen | Query `band` |
| --- | --- |
| Critical | `critical` |
| High Load | `high-load` |
| Normal | `normal` |
| Under Utilized | `under-utilized` |

Expected:

- Center is the API `total` when that total is greater than `0`. Otherwise it is the sum of the item values.
- Percent is `value / center * 100`.
- Each slice opens `/dtr/dashboard/percentage-loading?band={band}`. `GET /dashboard/dtr/percentage-loading-details` total equals the clicked count. Send `monthYear` when the chart request sent it.
- **Download** prefix is `dtr-percentage-loading`.

## DOW-010 Energy Consumption

Source: `GET /dashboard/dtr/consumption` for the Energy Consumption period and the selected month.

Expected:

- Subtitle is `Energy usage · {Daily|Weekly} · {range}`.
- Series toggles **kWh**, **kVAh**, and **kVARh** are visible. Point values match `kwh`, `kvah`, and `kvarh`.
- For October 2025 Daily, the axis lists **1 Oct** through **31 Oct**. Do not trim the series to 12 points.
- Clicking a point opens `/dtr/dashboard/consumption` with `kind=kwh`, `kind=kvah`, or `kind=kvarh`, plus `monthYear` when a month is selected. `GET /dashboard/dtr/consumption-details` uses the same query. The clicked value is energy, so the details total is not required to equal the bar.
- **Download** prefix is `dtr-energy-consumption`.

## DOW-011 Load Unbalance and Voltage Unbalance

| Widget | Request | Subtitle |
| --- | --- | --- |
| Load Unbalance | `GET /dashboard/dtr/load-unbalance` | Phase load imbalance distribution across DTRs |
| Voltage Unbalance | `GET /dashboard/dtr/voltage-unbalance` | Phase voltage imbalance distribution across DTRs |

Center title is **Analyzed meters**. Slices are **Severe**, **Moderate**, and **Balanced**.

| Slice | Query |
| --- | --- |
| Severe | `severity=severe` |
| Moderate | `severity=moderate` |
| Balanced | `severity=balanced` |

Expected:

- Center and percents follow the same total rule as DOW-009.
- Scope each slice button to its widget. The accessible names are shared.
- Load Unbalance opens `/dtr/dashboard/load-unbalance`. Voltage Unbalance opens `/dtr/dashboard/voltage-unbalance`.
- `GET /dashboard/dtr/load-unbalance-details` and `GET /dashboard/dtr/voltage-unbalance-details` use the same `severity` and the same `monthYear` as the chart request. Each total equals the clicked count.
- Download prefixes are `dtr-load-unbalance` and `dtr-voltage-unbalance`.

## DOW-012 Return, failure, and signed out

- After every click in DOW-006 through DOW-011, going back returns to `/dtr/dashboard` with the same month and the same two period labels.
- A failed summary does not paint a count from the error body.
- Opening `/dtr/dashboard` with no token returns to login. **DTR Overview** is not shown.
- **Download** is absent when that widget is in the unavailable state, and disabled when every plotted value is `0`.
