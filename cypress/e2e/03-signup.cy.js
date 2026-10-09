const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("Sign Up system tests", () => {
  // Pending registrations created by this run: one to approve, one to reject.
  const pendingOrganization = () =>
    cy.ensureOrganization("pending", "Pending", { industry: "Finance" });
  const organizationToReject = () =>
    cy.ensureOrganization("rejected", "Reject");

  const findSignUp = (org) => {
    cy.visit("/sign-ups");
    cy.searchTable(org.name);
  };

  const openDialog = (org, button) => {
    cy.armCall("openModal");
    cy.rowFor(org.name).contains("button", button).click();
    cy.waitCall("openModal");
  };

  const dialogValues = () =>
    cy
      .get("dialog[open] input")
      .then(($inputs) => [...$inputs].map((input) => input.value));

  beforeEach(() => cy.login());

  // ---------------------------------------------------------------- list

  tc("SUP-001", () => {
    cy.visit("/sign-ups");
    ["Company", "Date Registered", "Status", "Actions"].forEach((column) =>
      cy.contains("th", column).should("be.visible"),
    );
    cy.tableRows().then((rows) => {
      expect(rows.length).to.be.greaterThan(0);
      rows.forEach((row) => {
        expect(row.cells[2], "status").to.equal("Pending");
        expect(row.cells[3], "actions").to.equal("Contact Review");
      });
    });
  });

  tc("SUP-002", () => {
    pendingOrganization().then((org) => {
      cy.visit("/organizations");
      cy.searchTable(org.name);
      cy.tableRows().then((rows) => {
        expect(rows).to.have.length(1);
        expect(rows[0].cells[5], "status in Organizations").to.equal("Pending");
      });
      findSignUp(org);
      cy.tableRows().should("have.length", 1);
    });
  });

  tc("SUP-003", () => {
    pendingOrganization().then((org) => {
      cy.visit("/sign-ups");
      cy.searchTable("QAMC Pending");
      cy.tableRows().then((rows) => {
        expect(rows.length).to.be.greaterThan(0);
        rows.forEach((row) => expect(row.cells[0]).to.include("QAMC PENDING"));
        expect(rows.map((row) => row.cells[0]).join(" ")).to.include(
          org.name.toUpperCase(),
        );
      });
    });
  });

  tc("SUP-004", () => {
    cy.visit("/sign-ups");
    cy.searchTable("zzzz-no-such-company-qqqq");
    cy.tableRows().should("have.length", 0);
    cy.seeText(/No (sign[\s-]?ups?|companies|organizations|records|results) found/i);
  });

  tc("SUP-005", () => {
    cy.visit("/sign-ups");
    cy.tableRows().then((firstPage) => {
      cy.sortBy("Oldest");
      cy.tableRows().then((rows) => {
        const dates = rows.map((row) => Date.parse(row.cells[1]));
        expect(dates, "registration dates").to.deep.equal(
          [...dates].sort((a, b) => a - b),
        );
      });
      cy.visit("/sign-ups");
      cy.get('button[aria-label="Go to page 2"]').first().click({ force: true });
      cy.location("search").should("include", "page=2");
      cy.tableRows().then((secondPage) => {
        expect(secondPage.length).to.be.greaterThan(0);
        expect(secondPage.map((row) => row.text)).to.not.deep.equal(
          firstPage.map((row) => row.text),
        );
      });
    });
  });

  tc("SUP-015", () => {
    cy.visit("/sign-ups");
    cy.contains("button", /Sort by/).should("contain", "Newest");
    cy.contains("button", /Sort by/).click();
    cy.contains("li", /^\s*Newest\s*$/).click({ force: true });
    cy.wait(2000);
    cy.contains("button", /Sort by/).then(($button) => {
      expect(
        $button.text().replace(/\s+/g, " ").trim(),
        "label after choosing 'Newest'",
      ).to.equal("Sort by:Newest");
    });
  });

  // ---------------------------------------------------------------- emails

  tc("SUP-006", () => {
    pendingOrganization().then((org) => {
      cy.waitForEmails(org.name, 2).then((emails) => {
        const sent = emails.map((e) => `${e.subject} -> ${e.to}`);
        cy.log(sent.join(" | "));
        expect(
          sent.some((s) => /Your Application Has Been Received/.test(s)),
          "'application received' email",
        ).to.equal(true);
        const premature = sent.filter((s) =>
          /Welcome to KrystalHR|Admin Account Created/.test(s),
        );
        expect(premature, "onboarding emails sent before approval").to.deep.equal(
          [],
        );
      });
    });
  });

  // ---------------------------------------------------------------- contact

  tc("SUP-007", () => {
    pendingOrganization().then((org) => {
      findSignUp(org);
      openDialog(org, "Contact");
      cy.seeText(/Contact Organization/);
      cy.armCall("contactOrganization");
      cy.get('button[wire\\:click="contactOrganization"]').click({ force: true });
      cy.waitCall("contactOrganization").then(({ errors }) => {
        expect(Object.keys(errors)).to.have.members([
          "contact.title",
          "contact.message",
        ]);
      });
      cy.seeText(/message field is required/);
      cy.seeText(/title field is required/, { timeout: 6000 });
    });
  });

  const sendContactMessage = (org, title) => {
    findSignUp(org);
    openDialog(org, "Contact");
    cy.get('input[wire\\:model="contact.title"]').clear({ force: true }).type(title, { force: true });
    cy.get('textarea[wire\\:model="contact.message"]')
      .clear({ force: true })
      .type("Hello, please confirm your registration details.", { force: true });
    cy.armCall("contactOrganization");
    cy.get('button[wire\\:click="contactOrganization"]').click({ force: true });
    return cy.waitCall("contactOrganization");
  };

  tc("SUP-008", () => {
    pendingOrganization().then((org) => {
      const title = `QAMC contact ${Date.now()}`;
      sendContactMessage(org, title).then(({ errors, toasts }) => {
        expect(errors).to.deep.equal({});
        expect(toasts).to.include(`Message sent to ${org.name} successfully!`);
      });
      cy.waitForEmails(title).then((emails) => {
        expect(emails, "emails with the contact title").to.have.length(1);
        expect(emails[0].subject).to.equal(title);
        expect(emails[0].to).to.equal(org.adminEmail);
        expect(emails[0].text).to.include("please confirm your registration details");
      });
    });
  });

  tc("SUP-009", () => {
    pendingOrganization().then((org) => {
      const title = `QAMC contact ${Date.now()}`;
      sendContactMessage(org, title).then(({ errors }) => {
        expect(errors).to.deep.equal({});
      });
      openDialog(org, "Contact");
      cy.get('input[wire\\:model="contact.title"]').should(($input) => {
        expect($input.val(), "Title when the dialog is reopened").to.equal("");
      });
    });
  });

  // ---------------------------------------------------------------- review

  tc("SUP-010", () => {
    pendingOrganization().then((org) => {
      findSignUp(org);
      openDialog(org, "Review");
      cy.seeText(/Review Organization/);
      dialogValues().then((values) => {
        expect(values).to.include.members([
          org.name,
          org.email,
          org.phone,
          org.address,
          org.employees,
          `${org.adminFirstName} ${org.adminLastName}`,
          org.adminEmail,
          "Free",
        ]);
      });
      cy.contains("button", "Reject").should("exist");
      cy.contains("button", "Approve").should("exist");
    });
  });

  tc("SUP-011", () => {
    pendingOrganization().then((org) => {
      findSignUp(org);
      openDialog(org, "Review");
      dialogValues().then((values) => {
        expect(values, "Review dialog values").to.include(org.industry);
      });
    });
  });

  tc("SUP-012", () => {
    organizationToReject().then((org) => {
      findSignUp(org);
      openDialog(org, "Review");
      cy.contains("dialog[open] button", "Reject").click({ force: true });
      cy.wait(3000);
      findSignUp(org);
      cy.tableRows().then((rows) => {
        expect(
          rows.map((row) => row.cells[0]),
          "pending sign-ups still listed after Reject",
        ).to.deep.equal([]);
      });
    });
  });

  tc("SUP-013", () => {
    pendingOrganization().then((org) => {
      cy.emails(org.name).then((before) => {
        cy.task("setContext", { emailsBeforeApproval: before.length });
      });
      findSignUp(org);
      openDialog(org, "Review");
      cy.armCall("approveSignup");
      cy.get('button[wire\\:click="approveSignup"]').click({ force: true });
      cy.waitCall("approveSignup").then(({ toasts }) => {
        expect(toasts).to.include(`${org.name} approved successfully!`);
      });
      findSignUp(org);
      cy.tableRows().should("have.length", 0);
      cy.visit("/organizations");
      cy.searchTable(org.name);
      cy.tableRows().then((rows) => {
        expect(rows[0].cells[5], "status in Organizations").to.equal("Active");
      });
    });
  });

  tc("SUP-014", () => {
    cy.task("getContext").then((context) => {
      expect(
        context.emailsBeforeApproval,
        "SUP-013 must approve the sign-up first",
      ).to.be.a("number");
      const org = context.pending;
      cy.waitForEmails(org.name, context.emailsBeforeApproval + 2).then(
        (emails) => {
          const atApproval = emails
            .slice(0, emails.length - context.emailsBeforeApproval)
            .map((e) => e.subject);
          cy.log(atApproval.join(" | "));
          const count = (pattern) =>
            atApproval.filter((subject) => pattern.test(subject)).length;
          expect(
            {
              welcome: count(/Welcome to KrystalHR/),
              adminAccount: count(/Admin Account Created/),
            },
            "emails sent by the approval",
          ).to.deep.equal({ welcome: 1, adminAccount: 1 });
        },
      );
    });
  });
});
