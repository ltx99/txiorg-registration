/*
  Site settings. This is the only file besides events.json you should need to edit.
  See README.md for where each value comes from.
*/
window.TXIORG_CONFIG = {
  orgName: "Texas IORG",
  orgFullName: "Grand Assembly of Texas, International Order of the Rainbow for Girls",
  mainSite: "https://www.txiorg.org/",

  // Shown on every page and in confirmation emails.
  contactEmail: "txiorgtlt@kantex.net",

  // The Google Apps Script web app URL (ends in /exec).
  // Leave empty to run in demo mode: nothing is saved and payments are simulated.
  endpoint: "",

  // PayPal REST app Client ID (public, safe to put here). The secret goes in Apps Script, never here.
  paypalClientId: "",
  currency: "USD",

  // Shown when someone chooses to pay by check.
  check: {
    payableTo: "Grand Assembly of Texas IORG",
    mailTo: "Mailing address goes here\nCity, TX 00000",
    note: "Write your confirmation number on the memo line."
  }
};
