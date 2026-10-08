# KrystalHR Staging QA Assessment Automation Suite

Automated End-to-End Regression & Sanity Test Suite built with **Cypress (JavaScript)** for the **KrystalHR Staging Environment** (`https://admin.krystalhrsite.kdns.site`).

---

## Project Structure & Test Suite Layout

```text
krystal-qa-assessment/
├── cypress/
│   ├── e2e/
│   │   ├── 00-authentication.cy.js      # Login & Credential Baseline
│   │   ├── 01-dashboard.cy.js           # Dashboard Metrics & Widget Checks
│   │   ├── 02-organization.cy.js        # Organizations Data Grid & CRUD
│   │   ├── 03-signup.cy.js              # Sign Up Queue & Form Validation
│   │   ├── 04-announcements.cy.js       # Announcements Workflow & Validation
│   │   └── 05-smoke-network.cy.js       # Cross-Module System Smoke Checks
│   └── support/
│       ├── commands.js                  # Custom Cypress Commands (login, openModule)
│       └── e2e.js                       # Global Exception Handlers & Intercepts
├── artifacts/                           # Output JSON observation logs
├── .env                                 # Environment credentials configuration
├── cypress.config.js                    # Cypress configuration & node tasks
├── generate-excel-report.js             # Automated Excel Report Generator script
└── README.md
```
