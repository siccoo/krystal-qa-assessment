const { defineConfig } = require("cypress");
const fs = require("fs");
const path = require("path");

module.exports = defineConfig({
  e2e: {
    baseUrl:
      process.env.CYPRESS_BASE_URL || "https://admin.krystalhrsite.kdns.site",
    supportFile: "cypress/support/e2e.js",
    video: false,
    // Every test saves an end-state screenshot from the afterEach hook in
    // support/e2e.js, so the automatic failure screenshot would be a duplicate.
    screenshotOnRunFailure: false,
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 15000,
    pageLoadTimeout: 60000,
    requestTimeout: 15000,
    responseTimeout: 30000,
    // Known defects are expected to fail; retrying them only slows the run.
    retries: 0,
    env: {
      QA_EMAIL: "tester@krystalhr.com",
      QA_PASSWORD: "pass0403",
    },
    setupNodeEvents(on, config) {
      const artifactsDir = path.join(config.projectRoot, "artifacts");
      const resultsDir = path.join(artifactsDir, "results");
      const contextFile = path.join(artifactsDir, "run-context.json");
      fs.mkdirSync(resultsDir, { recursive: true });

      const readContext = () =>
        fs.existsSync(contextFile)
          ? JSON.parse(fs.readFileSync(contextFile, "utf8"))
          : {};

      on("task", {
        // Test data shared between specs (the organizations a run creates).
        getContext() {
          return readContext();
        },
        setContext(patch) {
          const next = { ...readContext(), ...patch };
          fs.writeFileSync(contextFile, JSON.stringify(next, null, 2));
          return next;
        },
        clearDownloads() {
          const dir = path.join(config.projectRoot, "cypress", "downloads");
          if (fs.existsSync(dir)) {
            for (const file of fs.readdirSync(dir)) {
              fs.unlinkSync(path.join(dir, file));
            }
          }
          return null;
        },
        appendFinding(finding) {
          fs.appendFileSync(
            path.join(artifactsDir, "observations.jsonl"),
            JSON.stringify({
              timestamp: new Date().toISOString(),
              ...finding,
            }) + "\n",
          );
          return null;
        },
      });

      // A full run starts from a clean slate so the report never mixes runs.
      on("before:run", () => {
        for (const file of fs.readdirSync(resultsDir)) {
          fs.unlinkSync(path.join(resultsDir, file));
        }
        if (fs.existsSync(contextFile)) fs.unlinkSync(contextFile);
      });

      // One result file per spec; generate-excel-report.js reads these.
      on("after:spec", (spec, results) => {
        if (!results) return;
        const tests = (results.tests || []).map((test) => {
          const title = test.title[test.title.length - 1];
          const [id] = title.split(" | ");
          return {
            id: id.trim(),
            title,
            state: test.state,
            duration: test.duration,
            error: test.displayError
              ? test.displayError.split("\n    at ")[0].trim()
              : null,
          };
        });
        fs.writeFileSync(
          path.join(resultsDir, `${path.basename(spec.name)}.json`),
          JSON.stringify(
            {
              spec: spec.name,
              browser: `${config.browser?.displayName || "Chrome"} ${config.browser?.majorVersion || ""}`.trim(),
              cypress: config.version,
              baseUrl: config.baseUrl,
              startedAt: results.stats?.startedAt,
              endedAt: results.stats?.endedAt,
              tests,
            },
            null,
            2,
          ),
        );
      });

      return config;
    },
  },
});
