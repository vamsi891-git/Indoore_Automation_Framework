# DTR Overview — API test coverage

Host observed: `https://api.mdm.mppkvvcl.bestinfra.app`.
Page that triggered the calls: `/dtr/dashboard`, with **October 2025** selected and both chart periods on **Daily**.

Every path in the table below is an API this page uses. The API suite must call each one. A path marked **not fired** was not clicked in this pass. It is still required, because it is the next call that widget makes. Do not invent counts. Read them from the response you just received.

JSON calls use bearer auth and `Accept: application/json`. A success body is `{ success: true, data }`. A failure body is `{ success: false, error: { code, message } }`.

The UI checks are in `docs/dtr-overview-web-test-coverage.md`. The page capture is in `docs/dtr-overview.md`.

`GET /dashboard/dtr/consumption-details` is not in `config/apps/indore.json`. Add endpoint key `dtrConsumptionDetails` with path `dashboard/dtr/consumption-details` before the API suite can call it. The current file `tests/api/dashboard/dtr-overview-api.spec.ts` does not call that path, does not send `monthYear=2025-10` on communication or percentage loading, and still expects a Daily series of at most 12 points.

## Calls on this page

| When | Method and path | Seen with October 2025 |
| --- | --- | --- |
| Four KPI cards | `GET /dashboard/dtr/summary` | 200, `period=daily&monthYear=2025-10` |
| Power Status | `GET /dashboard/dtr/power-status` | 200, `period=daily&monthYear=2025-10` |
| Energy Consumption | `GET /dashboard/dtr/consumption` | 200, `period=daily&monthYear=2025-10` |
| Communication Status | `GET /dashboard/dtr/communication-status` | 200, `monthYear=2025-10` |
| Percentage Loading | `GET /dashboard/dtr/percentage-loading` | 200, `monthYear=2025-10` |
| Load Unbalance | `GET /dashboard/dtr/load-unbalance` | 200, `monthYear=2025-10` |
| Voltage Unbalance | `GET /dashboard/dtr/voltage-unbalance` | 200, `monthYear=2025-10` |
| Total DTRs, DTRs ON, DTRs OFF, Active Alerts click | `GET /master-data/dtr-master-data` | not fired in this pass |
| DTR On or DTR Off point click | `GET /dashboard/dtr/power-status-details` | not fired in this pass |
| Communicating or Non-Communicating click | `GET /dashboard/dtr/communication-details` | not fired in this pass |
| Critical, High Load, Normal, Under Utilized click | `GET /dashboard/dtr/percentage-loading-details` | not fired in this pass |
| kWh, kVAh, or kVARh point click | `GET /dashboard/dtr/consumption-details` | not fired in this pass |
| Load Unbalance slice click | `GET /dashboard/dtr/load-unbalance-details` | not fired in this pass |
| Voltage Unbalance slice click | `GET /dashboard/dtr/voltage-unbalance-details` | not fired in this pass |

Widget **Download** is built in the browser from the chart response. It is not a fifteenth API.

The first paint of the current month, before October 2025 was chosen, sent `monthYear=2026-10` and `period=daily` on summary, power-status, and consumption only. Communication, load unbalance, voltage unbalance, and percentage loading had no query on that first paint. Cover both shapes.

## DOA-001 Summary

`GET /dashboard/dtr/summary?period=daily&monthYear=2025-10`

Also call the current-month shape the page sent: `period=daily&monthYear={current YYYY-MM}`.

`200` body:

```text
success: true
data.totalDtrs.count
data.dtrsOn.count
data.dtrsOff.count
data.activeAlerts.count
data.*.trends when the card shows a footer
```

Expected:

- Status 200 and `success` is true.
- Each present `count` is a finite number. The UI clamps a negative count to `0`. The API may still return the raw number.
- Do not require `dtrsOn.count + dtrsOff.count` to equal `totalDtrs.count`.
- `period=weekly&monthYear=2025-10` also returns 200 and the same card fields.
- `period=hourly` is not a choice on this page. Do not treat a 200 from Hourly as page coverage.
- `period=bogus` and `monthYear=2026-13` return 400 with `success: false`.

## DOA-002 Power Status

`GET /dashboard/dtr/power-status?period=daily&monthYear=2025-10`

`200` body:

```text
success: true
data.points[]: label, onPercentage or on_percentage, offPercentage or off_percentage, dtrsOn or dtrs_on, dtrsOff or dtrs_off
```

Expected:

- Status 200.
- For `monthYear=2025-10` and `period=daily`, the labels cover the days the chart draws, **1 Oct** through **31 Oct**. Do not fail a response that has more than 12 points.
- Each `onPercentage` and `dtrsOn` is finite and at least `0`. `offPercentage` may be negative. `dtrsOff` is at least `0`.
- `period=weekly&monthYear=2025-10` returns 200 and a `points` array.

## DOA-003 Energy Consumption

`GET /dashboard/dtr/consumption?period=daily&monthYear=2025-10`

`200` body:

```text
success: true
data.points[]: label, kwh, kvah, kvarh
```

Expected:

- Status 200.
- For October 2025 Daily, the labels cover **1 Oct** through **31 Oct**. Do not cap the array at 12.
- `kwh`, `kvah`, and `kvarh` are finite. A missing series value is not treated as a passing `0` unless the field is present and `0`.
- `period=weekly&monthYear=2025-10` returns 200 and a `points` array.
- The checked tooltip on **5 Oct** showed **kVAh: 438,265.1**. Re-read the point. Do not freeze that number.

## DOA-004 Communication Status

`GET /dashboard/dtr/communication-status?monthYear=2025-10`

Also call it once with no query, which is the current-month first paint.

Expected:

- Status 200 and `success` is true.
- The response exposes Communicating and Non-Communicating counts. Their sum is the **Total Meters** center.
- The October 2025 screen showed Communicating 743, Non-Communicating 333, and center 1,076. Re-read the live body. Do not freeze those numbers.
- This call takes no `period`.

## DOA-005 Percentage Loading

`GET /dashboard/dtr/percentage-loading?monthYear=2025-10`

Also call it once with no query.

Expected:

- Status 200.
- Items cover Critical, High Load, Normal, and Under Utilized, or the API labels that the UI renames to those four.
- When `data.total` is greater than `0`, that total is the center. Otherwise the center is the sum of the item values.
- Item values are at least `0`. The four October 2025 counts were 136, 360, 197, and 112, with center 805. Re-read them.
- This call takes no `period`.

## DOA-006 Load Unbalance

`GET /dashboard/dtr/load-unbalance?monthYear=2025-10`

Also call it once with no query.

Expected:

- Status 200.
- Items cover Severe, Moderate, and Balanced, or the API labels the UI renames to those three.
- Center follows the same total rule as DOA-005.
- The October 2025 screen showed Severe 708, Moderate 57, Balanced 32, and center 797. Re-read them.
- This call takes no `period`.

## DOA-007 Voltage Unbalance

`GET /dashboard/dtr/voltage-unbalance?monthYear=2025-10`

Also call it once with no query.

Expected:

- Status 200.
- Same three severities and the same center rule as DOA-006.
- The October 2025 screen showed Severe 217, Moderate 13, Balanced 567, and center 797. Re-read them.
- This call takes no `period`.

## DOA-008 DTR list behind the four cards

`GET /master-data/dtr-master-data`

Call it once per card, using the ids and metric from the October 2025 summary. Not fired in this browser pass.

| Card | Query |
| --- | --- |
| Total DTRs | page and limit only. No `metric`. No `selectedIds`. |
| DTRs ON | `metric=DTRs ON`. No `selectedIds`. |
| DTRs OFF | `selectedIds` from `dtrsOff.meterLookupIds`. Drop `0`, negatives, and non-integers. |
| Active Alerts | `selectedIds` from `activeAlerts.meterLookupIds`, with the same id rule. |

Expected:

- Status 200 and `success` is true.
- `data.pagination.total` equals that card's `count` from DOA-001.
- An empty id list is sent as `selectedIds` with an empty value, and the total still equals the card count.

## DOA-009 Power Status details

`GET /dashboard/dtr/power-status-details`

Not fired in this pass. Call both statuses for one October 2025 Daily point, and one Weekly point.

| Click | Query |
| --- | --- |
| DTR On | `status=on&period=daily&bucket={point label}&monthYear=2025-10` |
| DTR Off | `status=off&period=daily&bucket={point label}&monthYear=2025-10` |

Expected:

- Status 200.
- The details total equals `dtrsOn` or `dtrsOff` for that point.
- `status=bogus` returns 400.

## DOA-010 Communication details

`GET /dashboard/dtr/communication-details`

Not fired in this pass. Call both statuses with the same month the chart used.

| Click | Query |
| --- | --- |
| Communicating | `status=communicated&monthYear=2025-10` |
| Non-Communicating | `status=non-communicated&monthYear=2025-10` |

Expected:

- Status 200.
- Each total equals the matching count from DOA-004.
- `status=bogus` returns 400.

## DOA-011 Percentage Loading details

`GET /dashboard/dtr/percentage-loading-details?monthYear=2025-10`

Not fired in this pass. Call every band.

| Click | Query `band` |
| --- | --- |
| Critical | `critical` |
| High Load | `high-load` |
| Normal | `normal` |
| Under Utilized | `under-utilized` |

Expected:

- Status 200.
- Each total equals that band's count from DOA-005.
- `band=bogus` returns 400.

## DOA-012 Energy Consumption details

`GET /dashboard/dtr/consumption-details`

Not fired in this pass. This path is missing from `config/apps/indore.json` until `dtrConsumptionDetails` is added.

| Click | Query |
| --- | --- |
| kWh | `kind=kwh&period=daily&bucket={point label}&monthYear=2025-10` |
| kVAh | `kind=kvah&period=daily&bucket={point label}&monthYear=2025-10` |
| kVARh | `kind=kvarh&period=daily&bucket={point label}&monthYear=2025-10` |

Send `bucket` and `period` when the details URL the UI opens includes them. If the UI sends only `kind` and `monthYear`, assert that smaller query instead of adding parameters the page does not send.

Expected:

- Status 200 and `success` is true.
- The body has a total. That total is a details count, not the point's kWh, kVAh, or kVARh.
- A `kind` outside `kwh`, `kvah`, and `kvarh` returns 400.

## DOA-013 Load Unbalance details

`GET /dashboard/dtr/load-unbalance-details?monthYear=2025-10`

Not fired in this pass. Call every severity: `severe`, `moderate`, `balanced`.

Expected:

- Status 200.
- Each total equals that slice's count from DOA-006.
- `severity=bogus` returns 400.

## DOA-014 Voltage Unbalance details

`GET /dashboard/dtr/voltage-unbalance-details?monthYear=2025-10`

Not fired in this pass. Call `severe`, `moderate`, and `balanced`.

Expected:

- Status 200.
- Each total equals that slice's count from DOA-007.
- `severity=bogus` returns 400.

## DOA-015 Every read rejects a missing token and a bad bearer

Call each path in the table at the top of this file, including `consumption-details` and `dtr-master-data`.

Expected:

- No `Authorization` header returns 401.
- `Authorization: Bearer not-a-token` returns 401.
- The body is not a success payload and is not rendered as a card count.
