import { buildOrganization, CREATE_INDUSTRIES } from "../support/commands";

const LOGO = "cypress/fixtures/logo.png";
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Minimal RFC 4180 parser: the export quotes every field.
const parseCsv = (content) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (quoted) {
      if (char === '"' && content[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...records] = rows;
  return records.map((record) =>
    Object.fromEntries(headers.map((name, i) => [name, record[i]])),
  );
};

const exportCsv = () => {
  cy.task("clearDownloads");
  cy.visit("/organizations");
  cy.contains("button", "Export CSV").click(); // Cypress accepts the confirm
  return cy
    .readFile("cypress/downloads/companies.csv", { timeout: 40000 })
    .then(parseCsv);
};

// WCAG relative luminance / contrast ratio of two "rgb(r, g, b)" colours.
const luminance = (rgb) => {
  const [r, g, b] = rgb
    .match(/\d+(\.\d+)?/g)
    .slice(0, 3)
    .map((value) => {
      const channel = Number(value) / 255;
      return channel <= 0.03928
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

describe("Organization system tests", () => {
  // The Active organization this run creates and then manages.
  const testOrganization = () =>
    cy.ensureOrganization("active", "Active", { active: true, logo: LOGO });

  beforeEach(() => cy.login());

  // ---------------------------------------------------------------- list

  tc("ORG-001", () => {
    cy.visit("/organizations");
    cy.contains("h3", "Companies").should("be.visible");
    ["Add Organization", "Export CSV", "Import CSV"].forEach((label) =>
      cy.contains("button", label).should("be.visible"),
    );
    cy.get("#default-search").should("be.visible");
    cy.contains("button", /Sort by/).should("be.visible");
    cy.tableRows().then((rows) => {
      expect(rows).to.have.length(10);
      rows.forEach((row) => {
        expect(row.id, "Manage link").to.match(/^\d+$/);
        expect(row.cells[5], "status").to.match(/^(Active|Pending|Suspended)$/);
        expect(row.cells[6], "actions").to.match(/(Activate|Suspend) Manage/);
      });
    });
    cy.get('button[aria-label="Go to page 2"]').should("exist");
  });

  // ---------------------------------------------------------------- add form

  tc("ORG-007", () => {
    cy.openAddOrganization();
    cy.saveOrganization().then(({ errors }) => {
      expect(Object.keys(errors)).to.include.members([
        "organization.name",
        "organization.email",
        "organization.id_prefix",
        "admin.first_name",
        "admin.last_name",
        "admin.email",
        "disclaimer",
      ]);
    });
    [
      /The organization name field is required\./,
      /The organization email field is required\./,
      /The ID prefix field is required\./,
      /The admin first name field is required\./,
      /The admin last name field is required\./,
      /The admin email field is required\./,
      /You must give consent to proceed\./,
    ].forEach((message) => cy.seeText(message));
  });

  tc("ORG-008", () => {
    cy.openAddOrganization();
    cy.fillOrganization({
      name: "A".repeat(300),
      email: "not-an-email",
      idPrefix: "!!! ###",
      phone: "abcdef",
      employees: "-5",
      adminFirstName: "Ada",
      adminLastName: "Tester",
      adminEmail: "bad@",
      logo: "cypress/fixtures/not-an-image.txt",
      consent: false,
    });
    cy.saveOrganization();
    [
      /organization logo field must be an image/,
      /organization name field must not be greater than 255 characters/,
      /organization email field must be a valid email address/,
      /ID prefix field must only contain letters/,
      /phone number field must be between 11 and 15 digits/,
      /number of employees field must be at least 1/,
      /admin email field must be a valid email address/,
    ].forEach((message) => cy.seeText(message));
  });

  tc("ORG-009", () => {
    cy.openAddOrganization();
    cy.seeText(/Organization Logo\*/);
    cy.saveOrganization();
    cy.seeText(/The organization name field is required\./);
    cy.seeText(/logo.*(required|must)/i);
  });

  tc("ORG-010", () => {
    const org = buildOrganization("Domain");
    cy.openAddOrganization();
    cy.fillOrganization({ ...org, domain: "qamcdomain123" });
    cy.saveOrganization().then(({ errors }) => {
      const messages = errors["organization.domain"];
      expect(messages, "server rejects the 13-character prefix").to.exist;
      cy.log(`Server said: ${messages.join(" ")}`);
      messages.forEach((message) =>
        cy.seeText(new RegExp(escapeRegExp(message)), { timeout: 6000 }),
      );
    });
  });

  tc("ORG-011", () => {
    cy.openAddOrganization();
    cy.get('ui-switch[wire\\:model\\.live="organization.status"]').should(
      "have.attr",
      "aria-checked",
      "false",
    );
    cy.dontSeeText(/Organization will be activated immediately[^\n]*/);
  });

  tc("ORG-012", () => {
    cy.openAddOrganization();
    cy.get('select[name="organization.subscription_plan"] option').then(
      ($options) => {
        const plans = [...$options].map((option) => option.text.trim());
        expect(plans).to.include.members(["Free", "Basic", "Premium"]);
      },
    );
  });

  tc("ORG-015", () => {
    cy.openAddOrganization();
    cy.fillOrganization({
      ...buildOrganization("Names"),
      adminFirstName: "1234",
      adminLastName: "<b>x</b>",
      consent: false, // keeps the form from being saved
    });
    cy.saveOrganization().then(({ errors }) => {
      expect(Object.keys(errors), "fields the server rejected").to.include(
        "disclaimer",
      );
      expect(Object.keys(errors), "fields the server rejected").to.include.members([
        "admin.first_name",
        "admin.last_name",
      ]);
    });
  });

  // ---------------------------------------------------------------- create

  tc("ORG-013", () => {
    cy.dashboardStats().then((before) => {
      testOrganization().then((org) => {
        cy.visit("/organizations");
        cy.searchTable(org.name);
        cy.tableRows().then((rows) => {
          expect(rows).to.have.length(1);
          expect(rows[0].cells[1], "plan").to.equal("Free");
          expect(rows[0].cells[3], "employees").to.equal(org.employees);
          expect(rows[0].cells[5], "status").to.equal("Active");
        });
        cy.visit("/sign-ups");
        cy.searchTable(org.name);
        cy.tableRows().should("have.length", 0);
        cy.dashboardStats().then((after) => {
          expect(after.total, "Total Organizations").to.be.at.least(
            before.total + 1,
          );
        });
      });
    });
  });

  tc("ORG-014", () => {
    testOrganization().then((org) => {
      cy.openAddOrganization();
      cy.fillOrganization({ ...buildOrganization("Dup"), email: org.email });
      cy.saveOrganization().then(({ errors }) => {
        expect(errors["organization.email"]).to.deep.equal([
          "The organization email has already been taken.",
        ]);
      });
      cy.seeText(/The organization email has already been taken\./);
    });
  });

  tc("ORG-016", () => {
    testOrganization().then((org) => {
      cy.waitForEmails(org.adminEmail).then((emails) => {
        const account = emails.find((e) => /Admin Account Created/.test(e.subject));
        expect(account, "'Admin Account Created' email").to.exist;
        const password = (account.text.match(/Password:\W*(\S+)/) || [])[1];
        const guessable =
          org.adminFirstName.toLowerCase() + org.adminPhone.slice(-4);
        cy.log(`Emailed password: ${password}`);
        expect(
          password === guessable,
          `emailed password "${password}" is the admin's first name + last 4 phone digits`,
        ).to.equal(false);
      });
    });
  });

  tc("ORG-017", () => {
    testOrganization().then((org) => {
      cy.waitForEmails(org.adminEmail).then((emails) => {
        const account = emails.find((e) => /Admin Account Created/.test(e.subject));
        expect(account, "'Admin Account Created' email").to.exist;
        const employeeId = (account.text.match(/Employee ID:\W*(\S+)/) || [])[1];
        expect(employeeId, "Employee ID").to.match(
          new RegExp(`^${org.idPrefix}`),
        );
      });
    });
  });

  tc("ORG-018", () => {
    testOrganization().then((org) => {
      cy.waitForEmails(org.name, 3).then((emails) => {
        const subjects = emails.map((e) => `${e.subject} -> ${e.to}`);
        cy.log(subjects.join(" | "));
        const unexpected = subjects.filter((s) =>
          /Application Has Been Received|Review Required/.test(s),
        );
        expect(unexpected, "emails meant for pending sign-ups").to.deep.equal(
          [],
        );
      });
    });
  });

  // ---------------------------------------------------------------- list behaviour

  tc("ORG-002", () => {
    testOrganization().then((org) => {
      cy.visit("/organizations");
      cy.searchTable(org.name.toLowerCase());
      cy.tableRows().then((rows) => {
        expect(rows).to.have.length(1);
        expect(rows[0].id).to.equal(org.id);
      });
      cy.searchTable("zzzz-no-such-company-qqqq");
      cy.seeText(/No companies found\./);
    });
  });

  tc("ORG-003", () => {
    testOrganization().then((org) => {
      cy.visit("/organizations");
      cy.searchTable(`  ${org.name}  `);
      cy.tableRows().then((rows) => {
        expect(rows.map((row) => row.id), "organizations found").to.deep.equal(
          [org.id],
        );
      });
    });
  });

  tc("ORG-004", () => {
    cy.visit("/organizations");
    cy.sortBy("Oldest");
    cy.tableRows().then((rows) => {
      const dates = rows.map((row) => Date.parse(row.cells[2]));
      expect(dates, "sign-up dates").to.deep.equal(
        [...dates].sort((a, b) => a - b),
      );
    });
  });

  tc("ORG-005", () => {
    cy.visit("/organizations");
    cy.sortBy("Name");
    cy.tableRows().then((rows) => {
      // Cell text is "<initials> <NAME>"; ignore names that start with a symbol.
      const names = rows
        .map((row) => row.cells[0].replace(/^\S+\s/, ""))
        .filter((name) => /^[A-Z]/i.test(name));
      expect(names, "names in displayed order").to.deep.equal(
        [...names].sort((a, b) => a.localeCompare(b)),
      );
    });
  });

  tc("ORG-006", () => {
    const pagesById = {};
    cy.wrap([1, 2, 3, 4])
      .each((page) => {
        cy.visit(`/organizations?page=${page}`);
        cy.tableRows().then((rows) => {
          expect(rows, `rows on page ${page}`).to.have.length(10);
          rows.forEach((row) => {
            pagesById[row.id] = [...(pagesById[row.id] || []), page];
          });
        });
      })
      .then(() => {
        const repeated = Object.entries(pagesById)
          .filter(([, pages]) => pages.length > 1)
          .map(([id, pages]) => `#${id} on pages ${pages.join(" & ")}`);
        expect(repeated, "records shown on more than one page").to.deep.equal(
          [],
        );
      });
  });

  // ---------------------------------------------------------------- status

  const changeStatus = (org, action, resultingStatus, nextAction) => {
    cy.visit("/organizations");
    cy.searchTable(org.name);
    cy.rowFor(org.name).contains("button", action).click();
    cy.seeText(
      new RegExp(`Are you sure you want to ${action.toLowerCase()} this company\\?`),
    );
    cy.armCall("performAction");
    cy.get('button[wire\\:click="performAction"]').click({ force: true });
    cy.waitCall("performAction");
    cy.searchTable(org.name);
    cy.tableRows().then((rows) => {
      expect(rows[0].cells[5], "status").to.equal(resultingStatus);
      expect(rows[0].cells[6], "row action").to.include(nextAction);
    });
  };

  tc("ORG-019", () => {
    testOrganization().then((org) =>
      changeStatus(org, "Suspend", "Suspended", "Activate"),
    );
  });

  tc("ORG-020", () => {
    testOrganization().then((org) =>
      changeStatus(org, "Activate", "Active", "Suspend"),
    );
  });

  // ---------------------------------------------------------------- manage

  tc("ORG-021", () => {
    testOrganization().then((org) => {
      cy.openManage(org);
      cy.seeText(new RegExp(escapeRegExp(org.name)));
      cy.seeText(new RegExp(escapeRegExp(org.email)));
      cy.shownValues().then((values) => {
        expect(values).to.include.members([
          org.name,
          org.email,
          org.phone,
          org.employees,
        ]);
      });
    });
  });

  tc("ORG-022", () => {
    testOrganization().then((org) => {
      cy.openManage(org);
      cy.shownValues().then((values) => {
        expect(values, "Organization Info values").to.include(org.industry);
      });
    });
  });

  tc("ORG-023", () => {
    testOrganization().then((org) => {
      cy.openManage(org);
      cy.contains("button", "Edit Info").click();
      cy.get('select[name="edit.industry"]').then(($select) => {
        const options = [...$select[0].options]
          .map((option) => option.text.trim())
          .filter((text) => !/^Choose/.test(text));
        expect(options, "Edit Info industries").to.include.members(
          CREATE_INDUSTRIES,
        );
        expect(
          $select[0].selectedOptions[0].text.trim(),
          "preselected industry",
        ).to.equal(org.industry);
      });
    });
  });

  tc("ORG-024", () => {
    testOrganization().then((org) => {
      cy.openManage(org);
      cy.contains("button", "Edit Info").click();
      cy.get('input[name="edit.name"]').clear({ force: true });
      cy.get('input[name="edit.email"]').clear({ force: true }).type("bad-email", { force: true });
      cy.get('input[name="edit.phone"]').clear({ force: true }).type("abc", { force: true });
      cy.get('input[name="edit.number_of_employees"]').clear({ force: true }).type("-9", { force: true });
      cy.armCall("save");
      cy.contains("button", /^\s*Save\s*$/).click();
      cy.waitCall("save").then(({ errors }) => {
        expect(Object.keys(errors)).to.have.members([
          "edit.name",
          "edit.email",
          "edit.phone",
          "edit.number_of_employees",
        ]);
      });
      [
        /Name is required/,
        /Email is invalid/,
        /Phone should be numeric only/,
        /number of employees field must be at least 1/,
      ].forEach((message) => cy.seeText(message));
    });
  });

  tc("ORG-025", () => {
    testOrganization().then((org) => {
      const address = `99 Edited Avenue ${Date.now()}`;
      cy.openManage(org);
      cy.contains("button", "Edit Info").click();
      cy.get('input[name="edit.main_office_address"]').clear({ force: true }).type(address, { force: true });
      cy.armCall("save");
      cy.contains("button", /^\s*Save\s*$/).click();
      cy.waitCall("save").then(({ errors, toasts }) => {
        expect(errors).to.deep.equal({});
        expect(toasts).to.include("Organization updated successfully!");
      });
      cy.openManage(org);
      cy.shownValues().should("include", address);

      cy.contains("button", "Edit Info").click();
      cy.get('input[name="edit.name"]').clear({ force: true }).type("SHOULD NOT BE SAVED", { force: true });
      cy.contains("button", "Cancel").click();
      cy.openManage(org);
      cy.shownValues().then((values) => {
        expect(values).to.include(org.name);
        expect(values).to.not.include("SHOULD NOT BE SAVED");
      });
    });
  });

  tc("ORG-026", () => {
    testOrganization().then((org) => {
      const adminEmail = `qamc.admin2.${Date.now()}@mailinator.com`;
      cy.openManage(org);
      cy.contains("button", "Admins").click();
      cy.seeText(new RegExp(escapeRegExp(org.adminEmail)));
      cy.contains("button", "Add New Admin").click();
      cy.armCall("addAdmin");
      cy.contains("button", "Create User").click({ force: true });
      cy.waitCall("addAdmin").then(({ errors }) => {
        expect(Object.keys(errors)).to.have.members([
          "admin.first_name",
          "admin.last_name",
          "admin.email",
          "admin.phone",
        ]);
      });
      cy.seeText(/first name field is required/);
      cy.get('input[name="admin.first_name"]').first().type("Grace", { force: true });
      cy.get('input[name="admin.last_name"]').first().type("Second", { force: true });
      cy.get('input[name="admin.email"]').first().type(adminEmail, { force: true });
      cy.get('input[name="admin.phone"]').first().type("08031234570", { force: true });
      cy.armCall("addAdmin");
      cy.contains("button", "Create User").click({ force: true });
      cy.waitCall("addAdmin").then(({ errors, toasts }) => {
        expect(errors).to.deep.equal({});
        expect(toasts).to.include("Admin added successfully");
      });
      cy.seeText(new RegExp(escapeRegExp(adminEmail)));
    });
  });

  tc("ORG-027", () => {
    testOrganization().then((org) => {
      cy.openManage(org);
      cy.contains("button", "Admins").click();
      cy.seeText(new RegExp(escapeRegExp(org.adminEmail)));
      cy.get("tbody a")
        .filter((_, link) => link.innerText.trim() === "Manage")
        .first()
        .then(($link) => {
          const href = $link.attr("href");
          expect(
            href === "#",
            `admin 'Manage' link points nowhere (href="${href}")`,
          ).to.equal(false);
        });
    });
  });

  tc("ORG-028", () => {
    testOrganization().then((org) => {
      cy.openManage(org);
      cy.contains("button", "Billing and Subscription").click();
      cy.contains("button", "Change Plan").click();
      cy.seeText(/Change Your Plan/);
      cy.get('input[name="plan"][value="1"]').check({ force: true });
      cy.contains("button", "Save changes").click({ force: true });
      cy.wait(3000);
      cy.visit("/organizations");
      cy.searchTable(org.name);
      cy.tableRows().then((rows) => {
        expect(rows[0].cells[1], "plan after choosing Basic").to.equal("Basic");
      });
    });
  });

  tc("ORG-029", () => {
    testOrganization().then((org) => {
      cy.openManage(org);
      cy.contains("button", "Billing and Subscription").click();
      cy.seeText(/Billing/);
      cy.dontSeeText(/[^\n]*DD - MM- YYYY[^\n]*/);
    });
  });

  tc("ORG-030", () => {
    testOrganization().then((org) => {
      cy.emails(org.adminEmail).then((before) => {
        cy.openManage(org);
        cy.armCall("resendDetails");
        cy.contains("button", "Resend Details").click();
        cy.waitCall("resendDetails").then(({ toasts }) => {
          expect(toasts).to.include("Organization details resent successfully!");
        });
        cy.waitForEmails(org.adminEmail, before.length + 1).then((after) => {
          expect(after.length, "emails logged for the admin").to.be.greaterThan(
            before.length,
          );
        });
      });
    });
  });

  tc("ORG-031", () => {
    testOrganization().then((org) => {
      cy.openManage(org);
      cy.contains("p", org.name).then(($name) => {
        const color = getComputedStyle($name[0]).color;
        let node = $name[0];
        let background = "rgb(255, 255, 255)";
        while (node) {
          const value = getComputedStyle(node).backgroundColor;
          if (!/rgba\(0, 0, 0, 0\)|transparent/.test(value)) {
            background = value;
            break;
          }
          node = node.parentElement;
        }
        const ratio = Number(contrast(color, background).toFixed(2));
        cy.log(`text ${color} on ${background} = ${ratio}:1`);
        expect(ratio, `contrast of ${color} on ${background}`).to.be.at.least(
          4.5,
        );
      });
    });
  });

  // ---------------------------------------------------------------- CSV

  tc("ORG-032", () => {
    cy.dashboardStats().then((before) => {
      exportCsv().then((records) => {
        cy.dashboardStats().then((after) => {
          expect(Object.keys(records[0])).to.include.members([
            "ID",
            "Company Name",
            "Email Address",
            "Status",
          ]);
          // Other testers share this environment, so allow for records
          // created while the file was being generated.
          expect(records.length, "exported rows").to.be.within(
            before.total,
            after.total,
          );
        });
      });
    });
  });

  tc("ORG-033", () => {
    testOrganization().then((org) => {
      exportCsv().then((records) => {
        const mine = records.find((record) => record.ID === org.id);
        expect(mine, "test organization in the export").to.exist;
        const withPlan = records.filter((record) => record.Plan.trim()).length;
        expect(
          withPlan,
          `rows with a Plan value out of ${records.length} exported`,
        ).to.be.greaterThan(0);
        expect(mine["ID prefix"], "ID prefix of the test organization").to.equal(
          org.idPrefix,
        );
      });
    });
  });

  tc("ORG-034", () => {
    cy.task("clearDownloads");
    cy.visit("/organizations");
    cy.contains("button", "Import CSV").click();
    cy.get('span[wire\\:click="downloadTemplate"]').click({ force: true });
    cy.readFile("cypress/downloads/krystalhr_organization_sample.csv", {
      timeout: 30000,
    }).then((content) => {
      const lines = content.trim().split("\n");
      expect(lines.length).to.be.at.least(2);
      expect(lines[0]).to.include("company_name");
      expect(lines[0]).to.include("email_address");
      expect(lines[0]).to.include("domain_prefix");
    });
  });

  tc("ORG-035", () => {
    cy.visit("/organizations");
    cy.tableRows().should("have.length", 10);
    cy.get("input#import").selectFile(LOGO, { force: true });
    cy.seeText(/import file field must be a file of type: csv, txt/i, {
      timeout: 20000,
    });
  });

  // ---------------------------------------------------------------- links

  tc("ORG-036", () => {
    testOrganization().then((org) => {
      cy.visit("/organizations");
      cy.searchTable(org.name);
      cy.rowFor(org.name)
        .find("a")
        .not('[href*="/manage/"]')
        .first()
        .then(($link) => {
          const url = $link.attr("href");
          expect(url).to.include(org.domain);
          cy.log(`Tenant URL: ${url}`);
          cy.request({ url, failOnStatusCode: false, timeout: 20000 })
            .its("status")
            .should("be.lessThan", 500);
        });
    });
  });

  tc("ORG-037", () => {
    cy.request({
      url: "/organizations/manage/99999999",
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 404);
  });
});
