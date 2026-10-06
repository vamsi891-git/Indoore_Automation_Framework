# Dashboard defect report

Checked on 5 October 2026 against:

- UI: `https://mdm.mppkvvcl.bestinfra.app`
- API: `https://api.mdm.mppkvvcl.bestinfra.app`

Consumer Overview is `/consumers`. DTR Overview is `/dtr/dashboard`. Each item below was seen in the browser. The API lines are the calls the page actually sent.

## DEF-01 Consumer meter status omits the current month

**Screen:** Consumer Overview, Default Dashboard, month left on October 2026.

**Expected:** `monthYear=2026-10` on the meter-status call, together with the date range.

**Actual call:**

`GET /dashboard/consumer/meter-status?fromDate=2026-10-01&toDate=2026-10-05`

`monthYear` is not in the query. `fromDate` is the first day of October and `toDate` is 5 October 2026, so this is the current month.

## DEF-02 Consumer meter status keeps October dates for another month

**Screen:** Consumer Overview. September 2025 was selected, then the month was returned to October 2026.

**Expected:** `fromDate` and `toDate` match the selected month. For September 2025 that is a September range and `monthYear=2025-09`. For the current month, `monthYear=2026-10`.

**Actual call for September 2025:**

`GET /dashboard/consumer/meter-status?fromDate=2026-10-01&toDate=2026-10-05&monthYear=2025-09`

`monthYear` is September 2025. `fromDate` and `toDate` are still 1 October 2026 through 5 October 2026.

**Actual call after returning to October 2026:**

`GET /dashboard/consumer/meter-status?fromDate=2026-10-01&toDate=2026-10-05`

The request is sent again. `monthYear` is missing. The October date range did not change between the two calls.

## DEF-03 Energy Consumption sends the current month; Summary and Power Status do not

**Screen:** DTR Overview. Month left on October 2026. Period left on Daily.

**Expected:** all three calls are `period=daily` with no `monthYear`, because October 2026 is the current month.

**Actual calls:**

| Widget | Call |
| --- | --- |
| Summary | `GET /dashboard/dtr/summary?period=daily` |
| Power Status | `GET /dashboard/dtr/power-status?period=daily` |
| Energy Consumption | `GET /dashboard/dtr/consumption?period=daily&monthYear=2026-10` |

Summary and Power Status omit `monthYear`. Consumption sends `monthYear=2026-10`.

## DEF-04 Weekly charts do not follow October 2025

**Screen:** DTR Overview. Month set to October 2025. Period set to Weekly.

**Expected:** both charts use October 2025 and a weekly grouping.

**Actual:**

- Energy Consumption subtitle: **Energy usage · Weekly · Oct 2025**. The axis is **1 Oct, 2 Oct, … 31 Oct**, one bar per day.
- Power Status subtitle: **ON and OFF status for the last 8 weeks · 17 Aug 2026 – 5 Oct 2026 · 8 weeks**. That range ends on 5 October 2026. It is not October 2025.

A small **Oct 2025** caption sits above Power Status. The chart range under it is still August–October 2026.

## DEF-05 Detail pages use the long label as both title and breadcrumb

**Screen:** pages opened from DTR Overview widgets.

**Expected:** big title **DTR Overview Details**. The breadcrumb is the short name only: **Power Status**, **Communication**, or **Consumption**.

**Actual:** the big title and the trail above it are the same long label.

| Opened from | Trail above the title | Big title | List footer |
| --- | --- | --- | --- |
| Power Status, On, 1 Oct | DTR Overview / Power Status - On (1 Oct) | Power Status - On (1 Oct) | Showing 1–10 of 1067 |
| Communication, Communicating | DTR Overview / Communication Status - Communicating | Communication Status - Communicating | Showing 1–1 of 1 |
| Energy Consumption, kWh | DTR Overview / Energy Consumption - kWh | Energy Consumption - KWh | Showing 0 of 0 |

The kWh details page opened with **Showing 0 of 0** and an empty table.

## DEF-06 Active Alerts count does not match the list

**Screen:** DTR Overview, **Active Alerts** card, then the page that card opens.

**Expected:** the list total equals the number on the card.

**Actual:** the card shows **20**. The opened page is **DTR Data**, trail **Master Data / DTR Data**. The footer is **Showing 1–1 of 1**. The only row is DTR code **TEST1234**, Citi Control Room. The list is short by 19.

## DEF-07 Linkwell Telesystems count does not match the consumer list

**Screen:** Consumer Overview, OEM Distribution, then the consumer list for Linkwell Telesystems.

**Expected:** the list total equals the OEM count.

**Actual:** the donut center at rest is **Total Meters 126,741**. The legend is L&T **111,655** (88.1%) and Linkwell Telesystems **15,086** (11.9%). Those two counts add up to 126,741.

Clicking Linkwell Telesystems opens **Consumer Data**, trail **Master Data / Consumer Data**, with **Advanced Filters · 1 Applied**. The footer is **Showing 1–10 of 15087**. The list has one more record than the chart.

## Checked and not a defect

- **OEM center.** With the pointer off the chart, the hole says **Total Meters** and **126,741**. Hovering a slice replaces that center with the slice name. That hover change is expected.
- **DTR period button name.** The button text is **Daily** or **Weekly**. Its accessible name is `aria-label="DTR overview period"`.

## Not checked

The period menu was not opened, so **Hourly** was not confirmed. **Weekly** is present because the button was set to Weekly. **Monthly** and **Yearly** were not seen.
