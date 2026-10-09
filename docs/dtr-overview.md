# DTR Overview

Page: `https://mdm.mppkvvcl.bestinfra.app/dtr/dashboard` after sign-in.
Heading: **DTR Overview**. Selected section: **DTR Management**. Breadcrumb: **Dashboard / DTR Overview**.

This file is the live page, captured with the month set to **October 2025** and both chart periods left on **Daily**.

Coverage written from this capture:

- Web: `docs/dtr-overview-web-test-coverage.md`
- API: `docs/dtr-overview-api-test-coverage.md`
- E2E: `docs/dtr-overview-e2e-test-coverage.md`

`docs/dtr-overview-test-coverage.md` and `tests/web/dashboard/dtr-overview.web.spec.ts` still describe a page-level period named **DTR overview period**, an Hourly choice, and widgets that ignore the month. Those rules do not match this page.

Do not hard-code the counts below. Read the JSON the page receives for the month under test. The numbers are one capture for `monthYear=2025-10` on 9 Oct 2026.

Scope every locator to `main`.

## Month

The control is a month picker, not a from-date / to-date range.

| What | Value on this capture |
| --- | --- |
| Button accessible name | DTR dashboard month and year |
| Button text | October 2025 |
| Selected cell | Oct 2025 (`pressed`) |
| Earliest enabled month | Jun 2025 |
| Disabled in 2025 | Jan, Feb, Mar, Apr, May |
| Previous year | disabled on 2025 |
| Next year | enabled (2026 is reachable) |
| Clear | present |

Choosing **October 2025** sends `monthYear=2025-10` on all seven dashboard reads:

| Widget | Request after October 2025 |
| --- | --- |
| Four KPI cards | `GET /dashboard/dtr/summary?period=daily&monthYear=2025-10` |
| Power Status | `GET /dashboard/dtr/power-status?period=daily&monthYear=2025-10` |
| Energy Consumption | `GET /dashboard/dtr/consumption?period=daily&monthYear=2025-10` |
| Communication Status | `GET /dashboard/dtr/communication-status?monthYear=2025-10` |
| Percentage Loading | `GET /dashboard/dtr/percentage-loading?monthYear=2025-10` |
| Load Unbalance | `GET /dashboard/dtr/load-unbalance?monthYear=2025-10` |
| Voltage Unbalance | `GET /dashboard/dtr/voltage-unbalance?monthYear=2025-10` |

The first paint of the current month (October 2026) sent `monthYear=2026-10` only on summary, power-status, and consumption. Communication, percentage loading, load unbalance, and voltage unbalance were called with no query on that first paint. After October 2025 was chosen, those four calls were sent again with `monthYear=2025-10`.

Month caption **Oct 2025** is shown above Power Status, Energy Consumption, Load Unbalance, and Voltage Unbalance. Communication Status and Percentage Loading have no month caption. Communication Status still reads **Current status of active Meters**.

## Period

There is no page-level period button. Power Status and Energy Consumption each have their own control. The KPI cards stay on Daily: every footer says **vs Yesterday**.

| Control | Accessible name | Open choices | Selected |
| --- | --- | --- | --- |
| Power Status | Power Status period | Daily, Weekly | Daily |
| Energy Consumption | Energy Consumption period | Daily, Weekly | Daily |

Hourly is not in either menu. Communication Status, Percentage Loading, Load Unbalance, and Voltage Unbalance have no period control.

Daily Power Status subtitle: **ON and OFF status for 1 Oct–31 Oct 2025**. The chart axis lists every day from **1 Oct** through **31 Oct**.

Daily Energy Consumption subtitle: **Energy usage · Daily · 1 Oct–31 Oct 2025**. The chart axis lists the same 31 days. Series toggles are **kWh**, **kVAh**, and **kVARh**, all visible.

## Layout

Top to bottom inside `main`:

1. Heading **DTR Overview**, breadcrumb, month button **October 2025**.
2. Four cards: **Total DTRs**, **DTRs ON**, **DTRs OFF**, **Active Alerts**.
3. **Power Status**, full width, with its own period and **Download**.
4. **Communication Status** beside **Percentage Loading**. Each has **Download**.
5. **Energy Consumption**, full width, with its own period, **Download**, and the three series toggles.
6. **Load Unbalance** beside **Voltage Unbalance**. Each has **Download**.

Water, DG, and Gas stay disabled. These widgets have no search box.

## October 2025, Daily — visible values

Strip commas before comparing. Compare percents as numbers. `—` is empty and is not `0`.

### Cards

Source: `GET /dashboard/dtr/summary?period=daily&monthYear=2025-10`.

| Card | Visible count | Footer |
| --- | --- | --- |
| Total DTRs | 1,202 | No Change vs Yesterday |
| DTRs ON | 334 | Decrease by, pill -287, vs Yesterday |
| DTRs OFF | 742 | Increase by, pill +287, vs Yesterday |
| Active Alerts | 800 | Increase by, pill +800, vs Yesterday |

Each card is a button. DTRs ON plus DTRs OFF is 1,076. That equals the Communication Status center on this capture. It does not equal Total DTRs. Do not require ON + OFF = Total DTRs.

### Power Status

Source: `GET /dashboard/dtr/power-status?period=daily&monthYear=2025-10`.

- Title **Power Status**.
- Y axis **DTR Availability (%)** from -100% to 100%.
- Green bars are DTR On, above zero. Red bars are DTR Off, below zero.
- All 31 days of October 2025 are on the axis.

### Communication Status

Source: `GET /dashboard/dtr/communication-status?monthYear=2025-10`.

| Slice | Count | Percent | Button |
| --- | --- | --- | --- |
| Center, Total Meters | 1,076 | | |
| Communicating | 743 | 69.1% | Open Communicating details |
| Non-Communicating | 333 | 30.9% | Open Non-Communicating details |

743 + 333 = 1,076. 743 / 1,076 = 69.1%. 333 / 1,076 = 30.9%.

### Percentage Loading

Source: `GET /dashboard/dtr/percentage-loading?monthYear=2025-10`.

Subtitle: **Transformer utilization distribution**. Center title: **Analyzed meters**.

| Slice | Count | Percent | Button |
| --- | --- | --- | --- |
| Center | 805 | | |
| Critical | 136 | 16.9% | Open Critical details |
| High Load | 360 | 44.7% | Open High Load details |
| Normal | 197 | 24.5% | Open Normal details |
| Under Utilized | 112 | 13.9% | Open Under Utilized details |

136 + 360 + 197 + 112 = 805.

### Energy Consumption

Source: `GET /dashboard/dtr/consumption?period=daily&monthYear=2025-10`.

A visible tooltip on **5 Oct** read **kVAh: 438,265.1**. The bar value is energy, not a DTR count.

### Load Unbalance

Source: `GET /dashboard/dtr/load-unbalance?monthYear=2025-10`.

Subtitle: **Phase load imbalance distribution across DTRs**. Center title: **Analyzed meters**.

| Slice | Count | Percent | Button |
| --- | --- | --- | --- |
| Center | 797 | | |
| Severe | 708 | 88.8% | Open Severe details |
| Moderate | 57 | 7.2% | Open Moderate details |
| Balanced | 32 | 4.0% | Open Balanced details |

708 + 57 + 32 = 797.

### Voltage Unbalance

Source: `GET /dashboard/dtr/voltage-unbalance?monthYear=2025-10`.

Subtitle: **Phase voltage imbalance distribution across DTRs**. Center title: **Analyzed meters**.

| Slice | Count | Percent | Button |
| --- | --- | --- | --- |
| Center | 797 | | |
| Severe | 217 | 27.2% | Open Severe details |
| Moderate | 13 | 1.6% | Open Moderate details |
| Balanced | 567 | 71.1% | Open Balanced details |

217 + 13 + 567 = 797. Scope each **Open Severe details**, **Open Moderate details**, and **Open Balanced details** button to its widget. The same names exist on both donuts.

## What the current suite still asserts

| Live page | Current suite |
| --- | --- |
| Period buttons are **Power Status period** and **Energy Consumption period** | Expects one button named **DTR overview period** |
| Choices are Daily and Weekly | Expects Hourly, Daily, and Weekly |
| October 2025 adds `monthYear=2025-10` to all seven reads | Expects Communication Status and Percentage Loading to ignore the month |
| Power Status and Energy Consumption plot all 31 days of October 2025 | Expects a 12-point Daily window |
| Month picker has **Clear**. Jan–May 2025 are disabled. Jun 2025 is the first enabled month | Expects no clear control |
| Current month first paint sent `monthYear=2026-10` on summary, power, and consumption | Expects the current month to omit `monthYear` |
