const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RECIPIENT_OPTION = 'input[wire\\:model\\.live="selectedOrganizationIds"]';

describe("Announcements system tests", () => {
  // Announcements are only ever sent to the organization this run created.
  const recipient = () =>
    cy.ensureOrganization("active", "Active", {
      active: true,
      logo: "cypress/fixtures/logo.png",
    });

  const openCreate = () => {
    cy.visit("/announcements/create");
    cy.contains("button", "Send Announcement").should("be.visible");
  };

  const searchRecipient = (text) => {
    cy.get("body").then(($body) => {
      if (!$body.find('input[placeholder="Search organizations..."]:visible').length) {
        cy.contains("span", "Select Recipient").click({ force: true });
      }
    });
    cy.searchRecipients(text);
  };

  const selectRecipient = (org) => {
    searchRecipient(org.name);
    cy.get(RECIPIENT_OPTION).should("have.length", 1).check({ force: true });
    cy.seeText(/Remove/);
  };

  const typeBody = (text) =>
    cy.get('[contenteditable="true"]').type(text, { delay: 0, force: true });

  const send = () => {
    cy.armCall("createAnnouncement");
    cy.contains("button", "Send Announcement").click({ force: true });
    return cy.waitCall("createAnnouncement");
  };

  const openDetails = (title) => {
    cy.visit("/announcements");
    cy.searchTable(title);
    cy.rowFor(title).contains("a", "View Details").click();
    cy.location("pathname").should("match", /\/announcements\/\d+$/);
  };

  beforeEach(() => cy.login());

  // ---------------------------------------------------------------- list

  tc("ANN-001", () => {
    cy.visit("/announcements");
    ["Title", "Sender", "Recipients", "Date Sent", "Actions"].forEach((column) =>
      cy.contains("th", column).should("exist"),
    );
    cy.contains("a", "Send Email").should("have.attr", "href").and("match", /\/announcements\/create$/);
    cy.get("#default-search").should("be.visible");
    cy.tableRows().then((rows) => {
      expect(rows.length).to.be.greaterThan(0);
      rows.forEach((row) => expect(row.cells[4]).to.equal("View Details"));
    });
  });

  tc("ANN-019", () => {
    // Look through the first pages for an announcement with a long title and
    // check the layout of the page it is on.
    const longestTitle = () =>
      Math.max(
        ...[...Cypress.$("tbody tr td:first-child")].map(
          (td) => td.innerText.trim().length,
        ),
      );
    const check = (page) => {
      cy.visit(`/announcements?page=${page}`);
      cy.tableRows().should("have.length.greaterThan", 0);
      cy.then(() => {
        const longest = longestTitle();
        if (longest < 120 && page < 6) return check(page + 1);
        const viewport = Cypress.config("viewportWidth");
        const offScreen = [...Cypress.$("thead th")]
          .filter((th) => th.getBoundingClientRect().left >= viewport)
          .map((th) => th.innerText.trim());
        cy.log(`Page ${page}: longest title is ${longest} characters`);
        expect(
          offScreen,
          `columns pushed outside the ${viewport}px viewport on page ${page} (longest title: ${longest} characters)`,
        ).to.deep.equal([]);
      });
    };
    check(1);
  });

  tc("ANN-002", () => {
    cy.visit("/announcements");
    cy.tableRows().then((rows) => {
      const title = rows[0].cells[0];
      cy.searchTable(title);
      cy.tableRows().then((filtered) => {
        expect(filtered.length).to.be.greaterThan(0);
        filtered.forEach((row) =>
          expect(row.cells[0].toLowerCase()).to.include(title.toLowerCase()),
        );
      });
    });
    cy.searchTable("zzzz-no-such-announcement-qqqq");
    cy.seeText(/No announcements found\./);
  });

  tc("ANN-003", () => {
    cy.visit("/announcements");
    cy.tableRows().then((rows) => {
      const sender = rows.map((row) => row.cells[1]).find((s) => /@/.test(s));
      cy.searchTable(sender);
      cy.tableRows().then((filtered) => {
        expect(
          filtered.length,
          `announcements found when searching "${sender}"`,
        ).to.be.greaterThan(0);
      });
    });
  });

  tc("ANN-004", () => {
    cy.visit("/announcements");
    cy.sortBy("Title");
    cy.tableRows().should("have.length.greaterThan", 0);
    cy.sortBy("Oldest");
    cy.tableRows().then((rows) => {
      const dates = rows.map((row) => Date.parse(row.cells[3]));
      expect(dates, "dates sent").to.deep.equal(
        [...dates].sort((a, b) => a - b),
      );
    });
  });

  // ---------------------------------------------------------------- validation

  tc("ANN-005", () => {
    openCreate();
    send().then(({ errors }) => {
      expect(Object.keys(errors)).to.include.members([
        "title",
        "message",
        "selectedOrganizationIds",
      ]);
    });
    cy.seeText(/Select at least one organization or enable all organizations\./);
    cy.seeText(/The title field is required\./);
    cy.seeText(/The message field is required\./);
  });

  tc("ANN-006", () => {
    recipient().then((org) => {
      openCreate();
      cy.get('select[wire\\:model="senderEmail"]').select("");
      selectRecipient(org);
      cy.get('input[wire\\:model="title"]').type("QAMC no sender", { force: true });
      typeBody("Body text");
      send().then(({ errors }) => {
        expect(Object.keys(errors)).to.deep.equal(["senderEmail"]);
      });
      cy.seeText(/The sender email field is required\./);
    });
  });

  tc("ANN-007", () => {
    recipient().then((org) => {
      openCreate();
      selectRecipient(org);
      cy.get('input[wire\\:model="title"]')
        .invoke("val", `QAMC ${"L".repeat(300)}`)
        .trigger("input", { force: true })
        .trigger("change", { force: true });
      typeBody("Body text");
      send().then(({ errors }) => {
        expect(Object.keys(errors)).to.deep.equal(["title"]);
      });
      cy.seeText(/The title field must not be greater than 255 characters\./);
    });
  });

  // ---------------------------------------------------------------- recipients

  tc("ANN-008", () => {
    recipient().then((org) => {
      openCreate();
      selectRecipient(org);
      cy.seeText(new RegExp(escapeRegExp(org.name)));
      cy.contains("Remove").click({ force: true });
      cy.seeText(/Select Recipient/);
    });
  });

  tc("ANN-009", () => {
    openCreate();
    searchRecipient("zzzz-no-such-company-qqqq");
    cy.get(RECIPIENT_OPTION).should("have.length", 0);
    cy.seeText(/No (organizations?|companies|results|matches) (found|match)/i, {
      timeout: 6000,
    });
  });

  tc("ANN-010", () => {
    openCreate();
    cy.get('input[wire\\:model\\.live="sendToAllOrganizations"]').check({ force: true });
    cy.seeText(/All Organizations Selected/);
    cy.get('input[wire\\:model\\.live="sendToAllOrganizations"]').uncheck({ force: true });
    cy.seeText(/Select Recipient/);
  });

  tc("ANN-011", () => {
    cy.visit("/sign-ups");
    cy.tableRows().then((rows) => {
      // "<initials> <NAME>" of a registration that is still awaiting approval.
      const candidate = rows
        .map((row) => row.cells[0].replace(/^\S+\s/, ""))
        .find((name) => /^[A-Z0-9 ]+$/.test(name));
      expect(candidate, "a pending registration to look up").to.exist;
      openCreate();
      searchRecipient(candidate);
      cy.get("body").then(($body) => {
        const offered = $body.find(RECIPIENT_OPTION).length;
        expect(
          offered,
          `recipient options offered for pending organization "${candidate}"`,
        ).to.equal(0);
      });
    });
  });

  // ---------------------------------------------------------------- send

  tc("ANN-012", () => {
    recipient().then((org) => {
      const stamp = Date.now();
      const announcement = {
        title: `QAMC Announcement ${stamp}`,
        body: `Hello team, this is the QA announcement body ${stamp}.`,
        sender: "product@krystalhr.com",
      };
      openCreate();
      cy.get('select[wire\\:model="senderEmail"]').select(announcement.sender);
      selectRecipient(org);
      cy.get('input[wire\\:model="title"]').type(announcement.title, { force: true });
      typeBody(announcement.body);
      send().then(({ errors, redirect }) => {
        expect(errors).to.deep.equal({});
        expect(redirect).to.match(/\/announcements$/);
      });
      cy.location("pathname", { timeout: 20000 }).should("eq", "/announcements");
      cy.tableRows().should("have.length.greaterThan", 0);
      // Remember whether the page confirmed the action (checked by ANN-013).
      cy.wait(1500);
      cy.pageText().then((text) => {
        cy.task("setContext", {
          announcement: {
            ...announcement,
            confirmationShown: /Announcement sent successfully/i.test(text),
          },
        });
      });
      cy.tableRows().then((rows) => {
        expect(rows[0].cells[0]).to.equal(announcement.title.toUpperCase());
        expect(rows[0].cells[1]).to.equal(announcement.sender);
        expect(rows[0].cells[2]).to.equal("1 Org");
      });
    });
  });

  const sentAnnouncement = () =>
    cy.task("getContext").then((context) => {
      expect(context.announcement, "ANN-012 must send the announcement first").to
        .exist;
      return context.announcement;
    });

  tc("ANN-013", () => {
    sentAnnouncement().then((announcement) => {
      expect(
        announcement.confirmationShown,
        "a success message was shown after 'Send Announcement'",
      ).to.equal(true);
    });
  });

  tc("ANN-014", () => {
    recipient().then((org) => {
      sentAnnouncement().then((announcement) => {
        cy.waitForEmails(announcement.title).then((emails) => {
          expect(emails, "emails with the announcement title").to.have.length(1);
          expect(emails[0].subject).to.equal(announcement.title);
          expect(emails[0].from).to.include(announcement.sender);
          expect(emails[0].to).to.equal(org.email);
          expect(emails[0].text).to.include(announcement.body);
        });
      });
    });
  });

  tc("ANN-015", () => {
    recipient().then((org) => {
      sentAnnouncement().then((announcement) => {
        openDetails(announcement.title);
        cy.shownValues().then((values) => {
          expect(values).to.include.members([
            announcement.sender,
            announcement.title,
          ]);
        });
        cy.seeText(new RegExp(escapeRegExp(announcement.body)));
        cy.contains("tr", org.email).then(($row) => {
          const text = $row[0].innerText;
          expect(text).to.include(org.name);
          expect(text).to.include("Sent");
        });
      });
    });
  });

  tc("ANN-016", () => {
    cy.visit("/announcements");
    cy.contains("a", "View Details").first().click();
    cy.location("pathname").should("match", /\/announcements\/\d+$/);
    cy.seeText(/Recipients/);
    cy.dontSeeText(/^Send Announcement$/m);
  });

  tc("ANN-017", () => {
    recipient().then((org) => {
      const title = `QAMC HTML ${Date.now()}`;
      openCreate();
      selectRecipient(org);
      cy.get('input[wire\\:model="title"]').type(title, { force: true });
      cy.get('[contenteditable="true"]').then(($editor) => {
        $editor[0].innerHTML =
          'safe text <img src="x" onerror="window.__qamcXss = 1">' +
          '<a id="qamc-link" href="javascript:window.__qamcXss = 1">link</a>';
        $editor[0].dispatchEvent(new Event("input", { bubbles: true }));
      });
      cy.wait(1000);
      send().then(({ errors }) => expect(errors).to.deep.equal({}));
      cy.location("pathname", { timeout: 20000 }).should("eq", "/announcements");
      openDetails(title);
      cy.seeText(/safe text/);
      cy.wait(1000);
      cy.window().then((win) => {
        expect(win.__qamcXss, "injected handler ran").to.equal(undefined);
      });
      cy.get('img[src="x"]').should("not.exist");
      cy.get('a[href^="javascript:"]').should("not.exist");
    });
  });

  tc("ANN-018", () => {
    const title = `QAMC cancelled ${Date.now()}`;
    openCreate();
    cy.get('input[wire\\:model="title"]').type(title, { force: true });
    cy.contains("a", "Cancel").click();
    cy.location("pathname").should("eq", "/announcements");
    cy.searchTable(title);
    cy.seeText(/No announcements found\./);
  });
});
