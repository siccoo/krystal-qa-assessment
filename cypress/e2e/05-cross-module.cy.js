describe("Cross-module smoke / security checks", () => {
  tc("SEC-001", () => {
    cy.login();
    const pages = [
      ["/dashboard", "Total Organizations"],
      ["/organizations", "Companies"],
      ["/sign-ups", "Date Registered"],
      ["/announcements", "Date Sent"],
    ];
    pages.forEach(([path, landmark]) => {
      cy.request(path).its("status").should("eq", 200);
      cy.visit(path);
      cy.contains(landmark).should("exist");
      cy.dontSeeText(/Server Error|Whoops|SQLSTATE|Stack trace/i);
    });
  });

  tc("SEC-002", () => {
    // No cy.login() here: the requests below carry no session cookie.
    cy.clearAllCookies();
    const anonymous = (url) =>
      cy.request({
        url,
        headers: { Accept: "application/json" },
        followRedirect: false,
        failOnStatusCode: false,
      });

    anonymous("/log-viewer/api/files").then((files) => {
      const exposed = [];
      if (files.status === 200) {
        exposed.push(`GET /log-viewer/api/files -> 200 (${files.body.length} log files listed)`);
        const laravel = files.body.find((file) => /^laravel-/.test(file.name));
        anonymous(`/log-viewer/api/logs?file=${laravel.identifier}&per_page=1`).then(
          (logs) => {
            if (logs.status === 200) {
              exposed.push(
                `GET /log-viewer/api/logs -> 200 (${logs.body.pagination.total} entries readable in ${laravel.name})`,
              );
            }
          },
        );
      }
      cy.then(() => {
        expect(exposed, "log viewer endpoints readable without a session").to.deep.equal(
          [],
        );
      });
    });
  });

  tc("SEC-003", () => {
    cy.login();
    cy.request({ url: "/this-page-does-not-exist", failOnStatusCode: false })
      .its("status")
      .should("eq", 404);
    cy.visit("/this-page-does-not-exist", { failOnStatusCode: false });
    cy.seeText(/404/);
    cy.seeText(/Not Found/i);
  });

  tc("SEC-004", () => {
    cy.login();
    cy.request({ url: "/announcements/99999999", failOnStatusCode: false })
      .its("status")
      .should("eq", 404);
  });

  tc("SEC-005", () => {
    cy.login();
    ["/organizations", "/sign-ups"].forEach((path) => {
      const alerts = [];
      cy.visit(path, {
        onBeforeLoad(win) {
          cy.stub(win, "alert").callsFake((message) => alerts.push(message));
        },
      });
      cy.searchTable("<script>");
      cy.get("tbody script, tbody img[onerror], tbody [onclick]").should(
        "not.exist",
      );
      cy.then(() => {
        expect(alerts, `dialogs triggered on ${path}`).to.deep.equal([]);
      });
    });
  });
});
