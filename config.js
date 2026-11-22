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
  endpoint: "https://script.google.com/macros/s/AKfycbzMGlqXmenEZdjmaDyyL0lYA4tJf0ReqtXQ5p2_PFK57ZmzDDIiyMiClh9nsKSorfbqZQ/exec",

  // PayPal REST app Client ID (public, safe to put here). The secret goes in Apps Script, never here.
  paypalClientId: "",
  currency: "USD",

  // Assembly dropdown on the registration form, grouped by area.
  // Taken from the Find An Assembly page on txiorg.org. "Other" is added automatically.
  assemblies: {
    "Dallas": ["Dallas #33", "Henderson Co. #369", "Kilgore #168", "North Texas #383", "Plano #320",
      "Richardson #291", "Roy Stanley #127", "Sunshine #375"],
    "Fort Worth": ["Alvarado #68", "Arlington #96", "Brazos River LT #385", "Burleson #374", "Fort Worth #15",
      "Heart of Texas #386", "Rose #382"],
    "Houston": ["Conroe #73", "Houston #8", "Melrose #167", "Mid County #159", "Pearland #337",
      "Trinity River #379", "West Side #233"],
    "San Antonio": ["Austin #5", "Liberty-Waco #18", "New Braunfels #277", "San Antonio #3", "Schertz #280"],
    "West Texas": ["Abilene #86", "Amarillo-Palo Duro", "El Paso #4", "Horizon #384"]
  },

  // Shown when someone chooses to pay by check.
  check: {
    payableTo: "Grand Assembly of Texas",
    mailTo: "Texas IORG Event Registration\nP.O. Box 104\nLeander, TX 78646",
    note: "Write your confirmation number on the memo line."
  }
};
