# KrystalHR Staging QA Assessment

System test of the **KrystalHR Super Admin** staging environment
(`https://admin.krystalhrsite.kdns.site`) covering the four modules named in the
assessment brief: **Dashboard, Organization, Sign Up, Announcements**.

The deliverable is **`KrystalHR_QA_Assessment_Report.xlsx`**. It is generated
from an actual run of the Cypress suite in this repository, so every PASS / FAIL
in the workbook can be reproduced.

## The report

| Sheet | Content |
| --- | --- |
| Summary | Environment, totals, result per module, defects per severity, Critical / High defects |
| Test Cases | Every test case: steps, expected result, actual result, status, linked defect |
| Defect Log | Every defect: severity, priority, preconditions, steps, expected vs actual, evidence |
| Successes | What was verified to work, per module |
| Evidence | Screenshot of each failed test, grouped by defect |
| Scope & Notes | Scope, approach, severity scale, test data, recommended fix order |

## Running it

```bash
npm install
npm run cy:run     # full suite against staging, about 12 minutes
npm run report     # rebuilds KrystalHR_QA_Assessment_Report.xlsx
npm test           # both
```

- Tests that fail are **expected to fail**: each one reproduces a defect listed
  in the Defect Log. `npm run cy:run` therefore exits with a non-zero code.
- Run the **whole** suite before `npm run report`. A run clears the previous
  results, so a single-spec run produces a partial report.
- Credentials default to the assessment account; override with
  `CYPRESS_QA_EMAIL`, `CYPRESS_QA_PASSWORD`, `CYPRESS_BASE_URL`.
- The scripts unset `ELECTRON_RUN_AS_NODE`, which some editor terminals export
  and which stops Cypress from starting.

## What a run does to staging

Staging is shared and has no delete function, so the suite keeps its footprint
small and never acts on other people's records:

- creates **three organizations** per run (`QAMC Active …`, `QAMC Pending …`,
  `QAMC Reject …`, `@mailinator.com` addresses) and one extra admin;
- suspends / re-activates, edits and approves **only those** organizations;
- sends **two announcements** and two contact messages, to its own organization.

Emails are not delivered on staging. The suite checks them the way the brief
describes: in `/log-viewer`, file `laravel-{date}.log`.

## Layout

```text
krystal-qa-assessment/
├── qa/
│   ├── test-cases.js                # Test case catalogue (ID, steps, expected result)
│   └── defects.js                   # Defect catalogue, linked to test case IDs
├── cypress/
│   ├── e2e/
│   │   ├── 00-authentication.cy.js  # Login, logout, access control
│   │   ├── 01-dashboard.cy.js       # KPI cards, chart, Action Required, companies table
│   │   ├── 02-organization.cy.js    # List, Add Organization, Manage, CSV, emails
│   │   ├── 03-signup.cy.js          # Sign-up list, Contact, Review (approve / reject)
│   │   ├── 04-announcements.cy.js   # List, create, send, details
│   │   └── 05-cross-module.cy.js    # Smoke and security checks across modules
│   ├── fixtures/                    # Logo image and a non-image file for upload tests
│   └── support/
│       ├── commands.js              # login, Livewire helpers, table helpers, email log
│       └── e2e.js                   # tc() test declaration, evidence screenshots
├── artifacts/
│   ├── results/                     # One JSON result file per spec (input of the report)
│   └── run-context.json             # Test data created by the last run
├── cypress.config.js
├── generate-excel-report.js         # Builds the workbook
└── KrystalHR_QA_Assessment_Report.xlsx
```

## How the pieces fit

- A test is declared with `tc("ORG-010", () => { … })`. Its title, steps and
  expected result come from `qa/test-cases.js`.
- A test asserts what the application **should** do. When the application does
  not, the test fails and the report shows the linked defect from
  `qa/defects.js` as the actual result.
- After each test a screenshot is saved as
  `cypress/screenshots/<spec>/evidence/<TEST-ID>.png`.
- To add a check: add the case to `qa/test-cases.js`, write the `tc()` in the
  matching spec, and, if it reveals a defect, add it to `qa/defects.js` with the
  test ID in `tests`.
