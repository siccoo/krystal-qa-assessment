describe("Dashboard system tests", () => {
  beforeEach(() => {
    cy.login();
    cy.visit("/dashboard");
    cy.contains("Total Organizations").should("be.visible");
  });

  tc("DSH-001", () => {
    cy.dashboardStats().then((stats) => {
      expect(stats.total, "Total Organizations").to.be.a("number").and.not.NaN;
      expect(stats.pending, "Pending Organizations").to.be.a("number").and.not
        .NaN;
      expect(stats.users, "Total Users").to.be.a("number").and.not.NaN;
      expect(stats.pending).to.be.at.most(stats.total);
    });
  });

  tc("DSH-002", () => {
    const menu = [
      ["Organizations", "/organizations"],
      ["Sign Ups", "/sign-ups"],
      ["Announcements", "/announcements"],
      ["Dashboard", "/dashboard"],
    ];
    menu.forEach(([label, path]) => {
      cy.get("a[data-flux-navlist-item]")
        .filter(":visible")
        .contains(label)
        .click();
      cy.location("pathname", { timeout: 15000 }).should("eq", path);
    });
  });

  tc("DSH-003", () => {
    cy.dashboardStats().then((stats) => {
      cy.countRecords("/organizations").then((records) => {
        expect(records, "records in the organization list").to.equal(
          stats.total,
        );
      });
    });
  });

  tc("DSH-004", () => {
    cy.dashboardStats().then((stats) => {
      cy.countRecords("/sign-ups").then((records) => {
        expect(records, "records in the sign-up list").to.equal(stats.pending);
      });
    });
  });

  tc("DSH-005", () => {
    cy.get("#status-chart").should("be.visible");
    cy.dashboardStats().then((stats) => {
      cy.document().then((doc) => {
        const script = [...doc.querySelectorAll("script:not([src])")]
          .map((s) => s.textContent)
          .find((s) => /let activePercent =/.test(s));
        const share = (name) =>
          Number(script.match(new RegExp(`let ${name}Percent = ([\\d.]+)`))[1]);
        const active = share("active");
        const pending = share("pending");
        const suspended = share("suspended");
        expect(active + pending + suspended, "sum of shares").to.be.closeTo(
          100,
          0.1,
        );
        expect(pending, "pending share").to.be.closeTo(
          (stats.pending / stats.total) * 100,
          0.1,
        );
      });
    });
  });

  tc("DSH-006", () => {
    cy.pageText().then((text) => {
      const badge = (label) =>
        (text.match(new RegExp(`${label}\\s+[\\d,]+\\s+(\\S+)`)) || [])[1];
      const total = badge("Total Organizations");
      const pending = badge("Pending Organizations");
      cy.log(`Total badge: ${total} | Pending badge: ${pending}`);
      expect(total, "Total Organizations trend badge").to.match(/%/);
      expect(pending, "Pending Organizations trend badge").to.match(/%/);
      expect(pending, "Pending badge vs Total badge").to.not.equal(total);
    });
  });

  tc("DSH-007", () => {
    cy.contains("h3", "Action Required")
      .parent()
      .parent()
      .then(($panel) => {
        const lines = $panel[0].innerText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        // Each alert is: priority, organization name, "Subscription expires…".
        const names = lines.filter((_, i) =>
          /^Subscription expires/.test(lines[i + 1] || ""),
        );
        expect(names, "alerts listed").to.have.length.greaterThan(0);
        const missing = [];
        cy.wrap(names)
          .each((name) => {
            cy.searchTable(name);
            cy.tableRows().then((rows) => {
              if (!rows.length) missing.push(name);
            });
          })
          .then(() => {
            expect(
              missing,
              "alert names that match no organization",
            ).to.deep.equal([]);
          });
      });
  });

  tc("DSH-008", () => {
    const alertCount = () =>
      Cypress.$("body")[0].innerText.match(/Subscription expires/g).length;
    cy.then(() => {
      const before = alertCount();
      cy.contains("button", "View all").click();
      cy.wait(2000);
      cy.location("pathname").then((pathname) => {
        const navigated = pathname !== "/dashboard";
        const dialogOpened = Cypress.$("dialog[open]").length > 0;
        const expanded = alertCount() > before;
        expect(
          navigated || dialogOpened || expanded,
          "'View all' navigated, opened a dialog or expanded the list",
        ).to.equal(true);
      });
    });
  });

  tc("DSH-009", () => {
    cy.contains("h3", "Companies").should("be.visible");
    [
      "Organizations",
      "Plan",
      "Sign Up Date",
      "Employees",
      "Date Updated",
      "Status",
      "Action",
    ].forEach((column) => cy.contains("th", column).should("exist"));
    cy.tableRows().should("have.length", 10);
    cy.get('button[aria-label="Go to page 2"]').should("exist");
  });

  tc("DSH-010", () => {
    cy.tableRows().then((rows) => {
      const name = rows[0].cells[0].replace(/^\S+\s/, "");
      cy.searchTable(name);
      cy.tableRows().then((filtered) => {
        expect(filtered.length).to.be.greaterThan(0);
        filtered.forEach((row) =>
          expect(row.text.toLowerCase()).to.include(name.toLowerCase()),
        );
      });
    });
    cy.searchTable("zzzz-no-such-company-qqqq");
    cy.seeText(/No companies found\./);
  });

  tc("DSH-011", () => {
    cy.get("ui-radio-group[x-model='$flux.appearance'] ui-radio").then(
      ($options) => {
        const option = (value) =>
          [...$options].find((el) => el.getAttribute("value") === value);
        cy.wrap(option("dark")).click({ force: true });
        cy.get("html").should("have.class", "dark");
        cy.wrap(option("light")).click({ force: true });
        cy.get("html").should("not.have.class", "dark");
      },
    );
  });

  tc("DSH-012", () => {
    cy.contains("button", "Add Organization").click();
    cy.seeText(/Add New Organization/);
    cy.seeText(/Organization Information/);
    cy.seeText(/Admin Contact/);
  });
});
