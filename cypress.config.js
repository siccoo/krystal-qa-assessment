const { defineConfig } = require("cypress");
const fs = require("fs");
const path = require("path");

module.exports = defineConfig({
  e2e: {
    baseUrl:
      process.env.CYPRESS_BASE_URL || "https://admin.krystalhrsite.kdns.site",
    supportFile: "cypress/support/e2e.js",
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    pageLoadTimeout: 30000,
    requestTimeout: 15000,
    responseTimeout: 30000,
    retries: { runMode: 1, openMode: 0 },
    env: {
      QA_EMAIL: "tester@krystalhr.com",
      QA_PASSWORD: "pass0403",
    },
    setupNodeEvents(on, config) {
      const resultsDir = path.join(config.projectRoot, "artifacts");
      fs.mkdirSync(resultsDir, { recursive: true });
      on("task", {
        appendFinding(finding) {
          const file = path.join(resultsDir, "observations.jsonl");
          fs.appendFileSync(
            file,
            JSON.stringify({
              timestamp: new Date().toISOString(),
              ...finding,
            }) + "\n",
          );
          return null;
        },
        writeRunSummary(summary) {
          fs.writeFileSync(
            path.join(resultsDir, "run-summary.json"),
            JSON.stringify(summary, null, 2),
          );
          return null;
        },
      });
      return config;
    },
  },
});
