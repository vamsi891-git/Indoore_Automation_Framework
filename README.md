# Indore MDMS automation framework

Playwright + TypeScript framework for the MPPKVVCL Indore meter data system: API, web, and end-to-end regression. Configuration, endpoints, secrets, and JSON datasets live outside the tests.

The local environment starts a sample Indore app (`demo/`) that speaks the same `/indore/...` paths as the product. The `qa` environment points at the live hosts and does not start that sample:

- UI: `https://mdm.mppkvvcl.bestinfra.app`
- API: `https://api.mdm.mppkvvcl.bestinfra.app`

That API host has no `/indore` prefix, so `qa.json` sets `stripPathPrefix` to `indore`. Profile paths stay canonical (`indore/auth/login` becomes `auth/login` on QA).

## Requirements mapping

| Need | How it is implemented |
| --- | --- |
| API, web, and end-to-end | `tests/api`, `tests/web`, `tests/e2e` are separate Playwright projects |
| JSON datasets | `data/**/*.json`, loaded by `DataStore` |
| Endpoints, keys, and config | `config/manifest.json`, `config/environments`, `config/apps` |
| Scale to a similar app | Register another app profile. Pages and components read routes and accessible element queries from that profile |
| Faster execution | Parallel workers, API tests use the request client (no browser), targeted waits, trace only on retry, video off |
| Reusable components | `FormComponent`, `NavigationComponent`, `TableComponent`, `ChartComponent` |
| Multiple browsers | `execution.webBrowsers` drives Chromium, Firefox, and WebKit projects |
| Page object model | `src/pages` |
| Regression grouped by functionality | Spec folders plus `@auth`, `@assets`, `@dashboard`, `@charts`, `@schema`, `@monitoring` |
| Web charts | `ChartComponent` reads SVG, Chart.js, or Highcharts |
| API schema and data types | JSON Schema (Ajv) and Zod, plus JSON type assertions |

## Layout

```text
config/          environments, app profiles, JSON Schemas
data/            JSON users, DTRs, metrics, chart cases, type assertions
demo/            sample app used by the local environment
src/core         config, API client, schema validation, fixtures, components
src/pages        page objects
tests/api        API regression by functionality
tests/web        UI regression by functionality
tests/e2e        cross-layer journeys
```

## Setup

```powershell
npm install
npx playwright install
npm test
```

Useful filters:

```powershell
npm run test:api
npm run test:web
npm run test:e2e
npm run test:smoke
npm run test:regression
npm run test:charts
npm run test:schema
npm run report
```

`@smoke` is the short suite. `@regression` is the full set. A tag on a `test.describe` title applies to every test in that group, for example `npx playwright test --grep @assets`.

HTML report annotations include the functionality name (`Authentication`, `Charts`, `Schema`, and so on).

## Configuration

`config/manifest.json` is the entry point. It selects the default environment and app.

- `ENV` chooses `config/environments/<name>.json` (`local` or `qa`).
- `APP_ID` chooses an app registered in the manifest.
- `BASE_URL` and `API_BASE_URL` override the environment file.
- Secret **names** live in the app profile under `keys`. The values come from the environment, for example `INDOOR_API_KEY`.
- Dataset strings can use `{{env.NAME}}` or `{{env.NAME|fallback}}`.

```powershell
$env:ENV = "qa"
$env:APP_ID = "indore"
npm test
```

`local` starts the sample server. `qa` does not. Copy `.env.example` to `.env` when you want overrides stored locally. `.env` is gitignored.

The sample operator is `operator@indore-mdms.local` / `admin123`. Set `EMAIL` and `PASSWORD` to replace them. Do not put real passwords in JSON; use the placeholder form on `validAdmin`. Accounts in `data/auth/users.json` are accepted by the sample app. Rejected sign-in attempts live in `data/auth/invalid-logins.json`. Login uses email and returns `{ success, data: { accessToken } }`, matching Indore auth.

## Adding another application

1. Copy `config/apps/facility.template.json` to `config/apps/<id>.json`.
2. Set routes, endpoints, header names, storage keys, feature flags, element queries, and browsers.
3. Add `config/apps/<id>/schemas/*.schema.json`. Each file's `$id` must match its file name (`dtr.schema.json` → `"dtr"`).
4. Register the profile in `config/manifest.json`.
5. Add an environment file, or override `BASE_URL` / `API_BASE_URL`.
6. Add JSON datasets under `data/`.
7. Reuse the page objects when the screens match. Add a page object when they do not. Keep using the shared components.
8. Put new specs in the functionality folder: `tests/web/<functionality>/<name>.web.spec.ts`.

Turn a feature off per app with `features` in the profile. Specs call `requireFeature(app, 'charts')` and skip when that app does not have the feature.

## Writing a test

```typescript
import { expect, functionality, test } from '../../../src/core/fixtures/test.fixtures';

test.describe('DTR assets @assets @regression', () => {
  functionality('Assets');

  test('lists DTRs', async ({ api, data }) => {
    await api.authenticate(data.user('validAdmin'));
    const body = await api.get('dtrs');
    expect(body.body).toMatchJsonSchema('dtr-list');
  });
});
```

Fixtures:

- `app`, `env` — active profile and environment
- `data` — JSON datasets
- `api` — endpoint keys from the app profile (`dtrs`, `dtrById`, `metrics`, `login`, …)
- `schema` — direct Ajv access for negative contract cases
- `loginPage`, `dashboardPage` — page objects. `dashboardPage` signs in through the API and injects the configured storage key

`expect(value).toMatchJsonSchema('dtr')` checks the JSON Schema for the active app. `expect(value).toMatchDataTypes(assertions)` checks the JSON type rules (string, number, integer, boolean, array, object, enum, range, ISO date-time). Zod schemas in `src/core/api/models.ts` parse responses into TypeScript types. Keep those Zod schemas aligned with the JSON Schema files; the live contract tests fail when a response drifts from either one.

## Charts

`ChartComponent` tries these sources, in order:

1. Chart.js (`Chart.getChart` on a canvas inside the chart root)
2. Highcharts (`Highcharts.charts` whose `renderTo` is inside the root)
3. The SVG contract below

SVG contract inside the chart root:

- `[data-chart-title]`
- `[data-chart-unit]`
- `[data-chart-legend] button` whose accessible name is the series
- `[data-chart-svg] > [data-series]` with `data-visible="true|false"`
- `circle[data-x][data-y]` for each point
- `[data-axis="x|y"]` for axis labels
- `[data-chart-tooltip]` updated on point hover

Chart cases live in `data/dashboard/charts.json`. Add a metric and an element key there, and expose that key from `ui.elements` in the app profile, to cover another chart without a new spec.

## Execution speed

- API projects never need a browser.
- Web and end-to-end projects are generated from config, so end-to-end stays on Chromium while UI coverage still runs every configured browser.
- Workers default to Playwright's machine default locally (`workers.local: 0` means "do not override"). CI uses `workers.ci`.
- Waits target a row, a chart point, or a control. They do not wait for `networkidle`.
- Table and chart reads use one `page.evaluate` each.
- Traces are captured on the first retry. Video is off.

Set `CI=true` to pick up the CI retry and worker counts.
