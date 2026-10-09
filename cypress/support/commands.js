const LIVEWIRE_UPDATE = "**/livewire-*/update";

// The industries offered by the Add Organization form, in option order.
export const CREATE_INDUSTRIES = [
  "Technology",
  "Fashion",
  "Healthcare",
  "Finance",
  "Manufacturing",
  "Retail",
  "Food & Beverage",
  "Real Estate",
  "Education",
  "Transportation",
  "Entertainment",
  "Energy",
  "Telecommunications",
  "Agriculture",
  "Construction",
];

// ------------------------------------------------------------------ session

Cypress.Commands.add("typeCredentials", (email, password) => {
  cy.visit("/auth/login");
  if (email) cy.get('input[type="email"]').clear().type(email);
  if (password) {
    cy.get('input[type="password"]').clear().type(password, { log: false });
  }
  cy.get('button[type="submit"]').click();
});

Cypress.Commands.add("login", (email, password) => {
  const targetEmail =
    email || Cypress.env("QA_EMAIL") || "tester@krystalhr.com";
  const targetPassword = password || Cypress.env("QA_PASSWORD") || "pass0403";

  cy.session(
    targetEmail,
    () => {
      cy.typeCredentials(targetEmail, targetPassword);
      cy.location("pathname", { timeout: 30000 }).should(
        "not.match",
        /\/auth\/login/,
      );
    },
    { cacheAcrossSpecs: true },
  );
});

// ------------------------------------------------------------------ page text

const visibleText = () => Cypress.$("body")[0].innerText;

// innerText only contains rendered text, which makes these reliable for
// content inside Flux dialogs where Cypress' own visibility check is not.
Cypress.Commands.add("seeText", (pattern, options = {}) => {
  cy.get("body", { timeout: options.timeout || 10000 }).should(() => {
    if (!pattern.test(visibleText())) {
      throw new Error(`Expected the page to show text matching ${pattern}`);
    }
  });
});

Cypress.Commands.add("dontSeeText", (pattern) => {
  cy.get("body").should(() => {
    const match = visibleText().match(pattern);
    if (match) {
      throw new Error(`Expected the page not to show "${match[0]}"`);
    }
  });
});

Cypress.Commands.add("pageText", () => cy.then(() => visibleText()));

// ------------------------------------------------------------------ Livewire

// Tag the next Livewire request that calls `method` so the test can wait for
// it and read what the server answered (validation errors, toasts, redirect).
// Each arm tags exactly one request under its own alias, so arming the same
// method twice in a test never hands a stale response to the second wait.
let aliasCounter = 0;
const armed = {};
const armOnce = (key, matches) => {
  aliasCounter += 1;
  const alias = `lw_${key}_${aliasCounter}`;
  let used = false;
  armed[key] = alias;
  cy.intercept("POST", LIVEWIRE_UPDATE, (req) => {
    if (used) return;
    const body =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (matches(body)) {
      used = true;
      req.alias = alias;
    }
  });
};

Cypress.Commands.add("armCall", (method) => {
  armOnce(method, (body) => body.includes(`"method":"${method}"`));
});

Cypress.Commands.add("waitCall", (method) => {
  cy.wait(`@${armed[method]}`, { timeout: 60000 }).then(({ response }) => {
    const errors = {};
    const toasts = [];
    let redirect = null;
    for (const component of response.body.components || []) {
      const memo = JSON.parse(component.snapshot).memo;
      if (memo.errors && !Array.isArray(memo.errors)) {
        Object.assign(errors, memo.errors);
      }
      for (const dispatch of component.effects.dispatches || []) {
        if (dispatch.name !== "show-toast") continue;
        const params = Array.isArray(dispatch.params)
          ? dispatch.params[0]
          : dispatch.params;
        if (params?.message) toasts.push(params.message);
      }
      if (component.effects.redirect) redirect = component.effects.redirect;
    }
    return { status: response.statusCode, errors, toasts, redirect };
  });
});

// ------------------------------------------------------------------ tables

// Replace the content of a debounced Livewire input in one keystroke burst
// (so exactly one request is sent) and wait for the server to answer it.
const typeAndWait = (selector, property, text) => {
  cy.get(selector).then(($input) => {
    if ($input.val() === text) {
      cy.wait(1000); // nothing to send; let any pending re-render settle
      return;
    }
    const pattern = new RegExp(`"updates":\\{[^{}]*"${property}"`);
    armOnce(`set_${property}`, (body) => pattern.test(body));
    cy.get(selector).type(
      `{selectall}{backspace}${text.replace(/{/g, "{{}")}`,
      { delay: 0, force: true },
    );
    cy.then(() => cy.wait(`@${armed[`set_${property}`]}`, { timeout: 60000 }));
    cy.wait(700); // let Livewire morph the table
  });
};

Cypress.Commands.add("searchTable", (text) => {
  typeAndWait("#default-search", "search", text || "");
});

Cypress.Commands.add("searchRecipients", (text) => {
  typeAndWait(
    'input[placeholder="Search organizations..."]',
    "organizationSearch",
    text,
  );
});

// The table row that shows `text`. Row actions are always clicked inside the
// named row: this environment is shared with other testers' records.
Cypress.Commands.add("rowFor", (text) => {
  cy.contains("tbody tr", text, { matchCase: false });
});

// Rows of the visible table as { id, text, cells }.
Cypress.Commands.add("tableRows", () => {
  cy.get("tbody").then(($tbody) =>
    [...$tbody.find("tr")]
      .map((tr) => ({
        id: (tr.querySelector('a[href*="/manage/"]')?.href || "")
          .split("/")
          .pop(),
        text: tr.innerText.replace(/\s+/g, " ").trim(),
        cells: [...tr.querySelectorAll("td")].map((td) =>
          td.innerText.replace(/\s+/g, " ").trim(),
        ),
      }))
      .filter((row) => row.cells.length > 1),
  );
});

Cypress.Commands.add("sortBy", (label) => {
  cy.contains("button", /Sort by/).click();
  cy.contains("a, li", new RegExp(`^\\s*${label}\\s*$`)).click({ force: true });
  cy.contains("button", /Sort by/).should("contain", label);
  cy.wait(1500);
});

// Number of records in a paginated list = full pages + rows on the last page.
Cypress.Commands.add("countRecords", (path) => {
  cy.visit(path);
  cy.get("tbody tr").should("have.length.greaterThan", 0);
  cy.get("body").then(($body) => {
    const pages = [...$body.find('button[aria-label^="Go to page"]')].map((b) =>
      Number(b.getAttribute("aria-label").replace(/\D/g, "")),
    );
    const lastPage = pages.length ? Math.max(...pages) : 1;
    if (lastPage === 1) {
      return cy.tableRows().then((rows) => rows.length);
    }
    cy.visit(`${path}?page=${lastPage}`);
    cy.get("tbody tr").should("have.length.greaterThan", 0);
    return cy.tableRows().then((rows) => (lastPage - 1) * 10 + rows.length);
  });
});

// The KPI cards on the dashboard as numbers.
Cypress.Commands.add("dashboardStats", () => {
  cy.visit("/dashboard");
  cy.contains("Total Organizations").should("be.visible");
  cy.pageText().then((text) => {
    const read = (label) =>
      Number(
        (text.match(new RegExp(`${label}\\s+([\\d,]+)`)) || [])[1]?.replace(
          /,/g,
          "",
        ),
      );
    return {
      total: read("Total Organizations"),
      pending: read("Pending Organizations"),
      users: read("Total Users"),
    };
  });
});

// ------------------------------------------------------------------ organizations

const setField = (name, value) => {
  if (value === undefined) return;
  cy.get(`input[name="${name}"]`).first().clear({ force: true });
  if (value !== "") {
    cy.get(`input[name="${name}"]`)
      .first()
      .type(value, { delay: 0, force: true, parseSpecialCharSequences: false });
  }
};

Cypress.Commands.add("openAddOrganization", (path = "/organizations") => {
  cy.visit(path);
  cy.contains("button", "Add Organization").click();
  cy.seeText(/Add New Organization/);
});

Cypress.Commands.add("fillOrganization", (org) => {
  setField("organization.name", org.name);
  setField("organization.email", org.email);
  setField("organization.domain", org.domain);
  setField("organization.id_prefix", org.idPrefix);
  setField("organization.phone", org.phone);
  if (org.industry) {
    cy.get('select[name="organization.industry"]').select(org.industry, {
      force: true,
    });
  }
  setField("organization.main_office_address", org.address);
  setField("organization.number_of_employees", org.employees);
  setField("admin.first_name", org.adminFirstName);
  setField("admin.last_name", org.adminLastName);
  setField("admin.email", org.adminEmail);
  setField("admin.phone", org.adminPhone);
  if (org.active) {
    cy.get('ui-switch[wire\\:model\\.live="organization.status"]').click({
      force: true,
    });
    cy.get('ui-switch[wire\\:model\\.live="organization.status"]').should(
      "have.attr",
      "aria-checked",
      "true",
    );
  }
  if (org.logo) {
    cy.armCall("_finishUpload");
    cy.get('input[type="file"][wire\\:model="organization.logo"]').selectFile(
      org.logo,
      { force: true },
    );
    cy.waitCall("_finishUpload");
  }
  if (org.consent !== false) {
    cy.get("ui-checkbox#disclaimer").click({ force: true });
  }
});

// Click "Save changes" and yield what the server answered.
Cypress.Commands.add("saveOrganization", () => {
  cy.armCall("addOrganization");
  cy.get('button[wire\\:click="addOrganization"]').click({ force: true });
  cy.waitCall("addOrganization");
});

// Valid, unique organization data. `label` only makes the name readable.
export const buildOrganization = (label, overrides = {}) => {
  const stamp = String(Date.now()).slice(-7);
  const key = label.toLowerCase().replace(/[^a-z]/g, "").slice(0, 2);
  return {
    name: `QAMC ${label} ${stamp}`,
    email: `qamc.${key}.${stamp}@mailinator.com`,
    domain: `q${key}${stamp}`,
    idPrefix: "ZQX",
    phone: "08031234567",
    industry: "Technology",
    address: "12 Marina Road, Lagos",
    employees: "25",
    adminFirstName: "Ada",
    adminLastName: "Tester",
    adminEmail: `qamc.${key}.admin.${stamp}@mailinator.com`,
    adminPhone: "08031234568",
    active: false,
    ...overrides,
  };
};

Cypress.Commands.add("createOrganization", (org) => {
  cy.openAddOrganization();
  cy.fillOrganization(org);
  cy.saveOrganization().then((result) => {
    expect(result.errors, "server validation errors").to.deep.equal({});
    expect(result.toasts).to.include("Organization created successfully!");
  });
  cy.visit("/organizations");
  cy.searchTable(org.name);
  cy.tableRows().then((rows) => {
    expect(rows, `rows matching "${org.name}"`).to.have.length(1);
    return { ...org, id: rows[0].id, createdAt: Date.now() };
  });
});

// The organization a run uses for manage / announcement tests. Created once
// per run (as Active) and remembered in artifacts/run-context.json.
Cypress.Commands.add("ensureOrganization", (key, label, overrides = {}) => {
  cy.task("getContext").then((context) => {
    if (context[key]) return context[key];
    return cy
      .createOrganization(buildOrganization(label, overrides))
      .then((org) => cy.task("setContext", { [key]: org }).then(() => org));
  });
});

Cypress.Commands.add("openManage", (org) => {
  cy.visit(`/organizations/manage/${org.id}`);
  cy.contains("Organization Info").should("be.visible");
});

// Values of the enabled / disabled inputs currently shown on the page.
Cypress.Commands.add("shownValues", () => {
  cy.document().then((doc) =>
    [...doc.querySelectorAll("input, select, textarea")]
      .filter((el) => el.offsetWidth || el.offsetHeight)
      .map((el) =>
        el.tagName === "SELECT"
          ? (el.selectedOptions[0]?.text || "").trim()
          : el.value,
      ),
  );
});

// ------------------------------------------------------------------ email log

const header = (text, name) =>
  (text.match(new RegExp(`^${name}: (.*)$`, "m")) || [])[1]?.trim() || "";

// Quoted-printable -> text (also used for RFC 2047 "=?utf-8?Q?…?=" subjects).
const decodeQuotedPrintable = (text) =>
  text
    .replace(/=\r?\n/g, "")
    .replace(/((?:=[0-9A-F]{2})+)/g, (bytes) => {
      try {
        return decodeURIComponent(bytes.replace(/=/g, "%"));
      } catch (error) {
        return bytes;
      }
    });

const readable = (text) =>
  decodeQuotedPrintable(text)
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

const decodeSubject = (subject) =>
  subject.replace(/=\?utf-8\?Q\?(.*?)\?=/gi, (_, encoded) =>
    decodeQuotedPrintable(encoded.replace(/_/g, " ")),
  );

// Emails are not really sent on staging: they are written to
// laravel-{date}.log, readable through /log-viewer. Yields the logged emails
// that contain `query`, newest first.
Cypress.Commands.add("emails", (query, attempt = 0) => {
  cy.request({
    url: "/log-viewer/api/files",
    headers: { Accept: "application/json" },
  }).then(({ body }) => {
    const latest = body
      .filter((file) => /^laravel-\d{4}-\d{2}-\d{2}\.log$/.test(file.name))
      .sort((a, b) => b.name.localeCompare(a.name))[0];
    expect(latest, "laravel-{date}.log").to.exist;
    cy.request({
      url: "/log-viewer/api/logs",
      qs: { file: latest.identifier, query, per_page: 50, direction: "desc" },
      headers: { Accept: "application/json" },
      timeout: 60000,
    }).then((response) => {
      // The viewer scans large files in chunks: ask again until it is done.
      if (response.body.hasMoreResults && attempt < 8) {
        cy.wait(1500);
        return cy.emails(query, attempt + 1);
      }
      const seen = new Set();
      return response.body.logs
        .filter((log) => {
          // One log entry = one email; never count the same entry twice.
          const key = `${log.file_identifier}:${log.file_position}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((log) => ({ text: String(log.full_text || ""), at: log.datetime }))
        .filter(({ text }) => /^Subject: /m.test(text))
        .map(({ text, at }) => ({
          at,
          to: header(text, "To"),
          from: header(text, "From"),
          subject: decodeSubject(header(text, "Subject")),
          text: readable(text),
        }));
    });
  });
});

// Poll the log until at least `min` matching emails are there.
Cypress.Commands.add("waitForEmails", (query, min = 1, attempt = 0) => {
  cy.emails(query).then((emails) => {
    if (emails.length >= min || attempt >= 5) return emails;
    cy.wait(2000);
    return cy.waitForEmails(query, min, attempt + 1);
  });
});

Cypress.Commands.add("captureObservation", (observation) => {
  cy.task("appendFinding", observation);
});
