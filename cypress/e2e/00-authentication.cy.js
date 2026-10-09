describe("Authentication / access baseline", () => {
  const email = Cypress.env("QA_EMAIL");
  const password = Cypress.env("QA_PASSWORD");
  const GENERIC_ERROR = /These credentials do not match our records\./;

  tc("AUTH-001", () => {
    cy.visit("/auth/login");
    cy.get('input[type="email"]').should("be.visible");
    cy.get('input[type="password"]').should("be.visible");
    cy.contains("Remember me").should("be.visible");
    cy.contains("a", "Forgot your password?").should("be.visible");
    cy.contains("button", "Log in").should("be.visible");
  });

  tc("AUTH-002", () => {
    cy.typeCredentials(email, password);
    cy.location("pathname", { timeout: 30000 }).should("eq", "/dashboard");
    cy.contains("a", "Organizations").should("be.visible");
  });

  tc("AUTH-003", () => {
    cy.typeCredentials(email, "wrong-password-1");
    cy.seeText(GENERIC_ERROR);
    cy.location("pathname").should("eq", "/auth/login");
  });

  tc("AUTH-004", () => {
    cy.typeCredentials("nobody.qamc@mailinator.com", "whatever123");
    cy.seeText(GENERIC_ERROR);
    cy.location("pathname").should("eq", "/auth/login");
  });

  tc("AUTH-005", () => {
    cy.visit("/auth/login");
    cy.get('button[type="submit"]').click();
    cy.location("pathname").should("eq", "/auth/login");
    cy.get('input[type="email"]').then(($input) => {
      expect($input[0].required, "email is required").to.equal(true);
      expect($input[0].checkValidity(), "email passes validation").to.equal(
        false,
      );
    });
  });

  tc("AUTH-006", () => {
    const pages = [
      "/dashboard",
      "/organizations",
      "/sign-ups",
      "/announcements",
      "/announcements/create",
    ];
    pages.forEach((page) => {
      cy.request({ url: page, followRedirect: false }).then((response) => {
        expect(response.status, page).to.equal(302);
        expect(response.redirectedToUrl, page).to.match(/\/auth\/login$/);
      });
    });
  });

  tc("AUTH-007", () => {
    cy.typeCredentials(email, password);
    cy.location("pathname", { timeout: 30000 }).should("eq", "/dashboard");
    cy.get("button[data-flux-profile]").first().click({ force: true });
    cy.contains("button", "Log Out").first().click({ force: true });
    cy.location("pathname", { timeout: 15000 }).should("eq", "/auth/login");
    cy.visit("/dashboard");
    cy.location("pathname").should("eq", "/auth/login");
  });

  tc("AUTH-008", () => {
    const NEUTRAL = /A reset link will be sent if the account exists\./;
    ["nobody.qamc@mailinator.com", email].forEach((address) => {
      cy.visit("/auth/forgot-password");
      cy.get('input[type="email"]').type(address);
      cy.get('button[type="submit"]').click();
      cy.seeText(NEUTRAL);
    });
  });
});
