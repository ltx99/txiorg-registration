/* Texas IORG event registration – front end.
   Talks to the Google Apps Script backend (config.endpoint).
   With no endpoint set, runs in demo mode so the pages can be previewed. */
(function () {
  "use strict";

  var C = window.TXIORG_CONFIG || {};
  var DEMO = !C.endpoint;
  var CURRENCY = C.currency || "USD";

  // ---------- helpers ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) {
    return Number(n || 0).toLocaleString("en-US", { style: "currency", currency: CURRENCY });
  }
  function parseDay(iso) { return new Date(iso + "T12:00:00"); }
  function fmtDate(iso) {
    return parseDay(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  function fmtShort(iso) {
    return parseDay(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }

  function isOpen(ev) {
    if (ev.open === false) return false;
    if (ev.deadline && new Date() > new Date(ev.deadline + "T23:59:59")) return false;
    if (parseDay(ev.date) < today()) return false;
    return true;
  }
  function isFree(ev) { return ev.tickets.every(function (t) { return !t.price; }); }
  function priceText(ev) {
    if (isFree(ev)) return "Free";
    return ev.tickets.map(function (t) { return t.label + " " + (t.price ? money(t.price) : "free"); }).join(" · ");
  }

  function metaList(ev) {
    var where = "";
    if (ev.location) where += "<strong>" + esc(ev.location) + "</strong>";
    if (ev.address) {
      where += (where ? "<br>" : "") + esc(ev.address).replace(/\n/g, "<br>");
      var q = [ev.location, String(ev.address).replace(/\n/g, ", ")].filter(Boolean).join(", ");
      where += '<br><a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) + '" target="_blank" rel="noopener">Get directions</a>';
    }
    return '<dl class="event-meta">' +
      "<dt>When</dt><dd>" + esc(fmtDate(ev.date)) + (ev.time ? "<br>" + esc(ev.time) : "") + "</dd>" +
      (where ? "<dt>Where</dt><dd>" + where + "</dd>" : "") +
      "<dt>Cost</dt><dd>" + esc(priceText(ev)) + "</dd>" +
      (ev.deadline ? "<dt>Register by</dt><dd>" + esc(fmtShort(ev.deadline)) + "</dd>" : "") +
    "</dl>";
  }

  function loadEvents() {
    return fetch("events.json", { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("Could not load events.json");
      return r.json();
    });
  }

  function api(action, payload) {
    var body = Object.assign({ action: action }, payload || {});
    if (DEMO) return demoApi(body);
    // text/plain keeps this a "simple" request, so Apps Script doesn't need CORS preflight.
    return fetch(C.endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (!res.ok) throw new Error(res.error || "Something went wrong.");
      return res;
    });
  }

  function demoApi(body) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (body.action === "register") {
          var ref = "TX-" + Math.random().toString(36).slice(2, 8).toUpperCase();
          try {
            var all = JSON.parse(localStorage.getItem("txiorg-demo") || "[]");
            all.push(Object.assign({ ref: ref, at: new Date().toISOString() }, body));
            localStorage.setItem("txiorg-demo", JSON.stringify(all));
          } catch (e) { /* storage may be blocked; fine for a demo */ }
          resolve({ ok: true, ref: ref, total: body._total, status: body._total ? "Awaiting payment" : "Complete" });
        } else {
          resolve({ ok: true, status: "Paid" });
        }
      }, 400);
    });
  }

  function footer() {
    var el = $("#footer");
    if (!el) return;
    el.innerHTML =
      "<p>" + esc(C.orgFullName || C.orgName) + "</p>" +
      (C.contactEmail ? '<p>Questions? Email <a href="mailto:' + esc(C.contactEmail) + '">' + esc(C.contactEmail) + "</a></p>" : "") +
      '<p><a href="' + esc(C.mainSite) + '">Visit the main Texas IORG site</a></p>';
    var link = $("#main-site-link");
    if (link && C.mainSite) link.href = C.mainSite;
  }

  function demoBanner() {
    if (!DEMO) return;
    var el = $("#demo-banner");
    if (el) el.innerHTML = '<div class="notice warn"><p><strong>Demo mode.</strong> No backend is set in config.js, so registrations are not saved and payments are simulated.</p></div>';
  }

  function showError(container, msg) {
    container.innerHTML = '<div class="notice error"><p>' + esc(msg) + "</p></div>";
  }

  // ---------- event list page ----------
  function renderEventList() {
    footer(); demoBanner();
    var list = $("#event-list");
    loadEvents().then(function (events) {
      var upcoming = events
        .filter(function (ev) { return parseDay(ev.date) >= today(); })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (!upcoming.length) {
        list.innerHTML = '<div class="panel"><p>No events are open right now. Check back soon.</p></div>';
        return;
      }
      list.innerHTML = upcoming.map(function (ev) {
        var open = isOpen(ev);
        return '<article class="panel event-card">' +
          "<h2>" + esc(ev.title) + "</h2>" +
          (ev.summary ? "<p>" + esc(ev.summary) + "</p>" : "") +
          metaList(ev) +
          '<div class="actions">' +
            (open
              ? '<a class="btn" href="register.html?event=' + encodeURIComponent(ev.id) + '">Register</a>'
              : '<span class="tag closed">Registration closed</span>') +
          "</div>" +
        "</article>";
      }).join("");
    }).catch(function (err) { showError(list, err.message + " If you opened this file directly, serve the folder from a web server instead."); });
  }

  // ---------- registration page ----------
  var state = { ev: null, count: 0 };

  function renderRegistration() {
    footer(); demoBanner();
    var app = $("#app");
    var id = new URLSearchParams(location.search).get("event");
    loadEvents().then(function (events) {
      var ev = events.find(function (e) { return e.id === id; });
      if (!ev) { showError(app, "We couldn't find that event. Go back to the event list and pick one."); return; }
      state.ev = ev;
      document.title = "Register: " + ev.title + " | " + (C.orgName || "Texas IORG");
      if (!isOpen(ev)) {
        app.innerHTML = eventPanel(ev) + '<div class="notice warn"><p>Registration for this event is closed.' +
          (C.contactEmail ? ' Email <a href="mailto:' + esc(C.contactEmail) + '">' + esc(C.contactEmail) + "</a> if you need help." : "") + "</p></div>";
        return;
      }
      app.innerHTML = eventPanel(ev) + formHtml(ev);
      wireForm(ev);
    }).catch(function (err) { showError(app, err.message); });
  }

  function eventPanel(ev) {
    return '<section class="panel event-card">' +
      "<h1>" + esc(ev.title) + "</h1>" +
      metaList(ev) +
      (ev.description ? "<p>" + esc(ev.description) + "</p>" : "") +
    "</section>";
  }

  function field(name, label, type, opts) {
    opts = opts || {};
    var req = opts.required ? " required" : "";
    var star = opts.required ? ' <span class="req" aria-hidden="true">*</span>' : "";
    var idAttr = "f-" + name.replace(/[^a-z0-9]/gi, "-");
    var hint = opts.hint ? ' <span class="hint">' + esc(opts.hint) + "</span>" : "";
    var input;
    if (type === "select") {
      input = '<select id="' + idAttr + '" name="' + esc(name) + '"' + req + '><option value="">Choose…</option>' +
        opts.options.map(function (o) {
          var v = typeof o === "object" ? o.value : o, l = typeof o === "object" ? o.label : o;
          return '<option value="' + esc(v) + '">' + esc(l) + "</option>";
        }).join("") + "</select>";
    } else if (type === "textarea") {
      input = '<textarea id="' + idAttr + '" name="' + esc(name) + '"' + req + "></textarea>";
    } else {
      input = '<input id="' + idAttr + '" type="' + type + '" name="' + esc(name) + '"' + req +
        (opts.autocomplete ? ' autocomplete="' + opts.autocomplete + '"' : "") + ">";
    }
    return '<div class="' + (opts.full ? "full" : "") + '"><label for="' + idAttr + '">' + esc(label) + star + hint + "</label>" + input + "</div>";
  }

  function assemblyField() {
    var groups = C.assemblies;
    if (!groups) return field("assembly", "Assembly name and number", "text", { required: true, full: true, hint: "(for example, Austin #5)" });
    var opts = Object.keys(groups).map(function (area) {
      return '<optgroup label="' + esc(area) + '">' + groups[area].map(function (n) {
        return '<option value="' + esc(n) + '">' + esc(n) + "</option>";
      }).join("") + "</optgroup>";
    }).join("");
    return '<div class="full"><label for="f-assembly">Assembly <span class="req" aria-hidden="true">*</span></label>' +
      '<select id="f-assembly" name="assembly" required><option value="">Choose your assembly…</option>' + opts +
      '<option value="__other">Other (pledge group, Grand officer, guest)</option></select></div>' +
      '<div class="full" id="assembly-other-wrap" hidden><label for="f-assemblyOther">Tell us which group <span class="req" aria-hidden="true">*</span></label>' +
      '<input id="f-assemblyOther" type="text" name="assemblyOther"></div>';
  }

  function formHtml(ev) {
    var paid = !isFree(ev);
    var max = ev.maxAttendees || 25;
    return '<form id="reg-form" novalidate>' +
      '<section class="panel"><fieldset><legend><h2>Your contact information</h2></legend>' +
        '<p class="muted">We send the confirmation here. If you are registering girls from your assembly, use your own name.</p>' +
        '<div class="grid">' +
          field("firstName", "First name", "text", { required: true, autocomplete: "given-name" }) +
          field("lastName", "Last name", "text", { required: true, autocomplete: "family-name" }) +
          field("email", "Email", "email", { required: true, autocomplete: "email" }) +
          field("phone", "Mobile phone", "tel", { required: true, autocomplete: "tel" }) +
          (ev.askAssembly !== false ? assemblyField() : "") +
        "</div>" +
      "</fieldset></section>" +

      '<section class="panel"><h2>Who is attending?</h2>' +
        '<p class="muted">Add everyone you are registering, up to ' + max + ".</p>" +
        '<div id="attendees"></div>' +
        '<button type="button" class="btn secondary" id="add-attendee">+ Add another person</button>' +
      "</section>" +

      '<section class="panel"><h2>Anything else?</h2><div class="grid">' +
        field("notes", "Notes for the event team", "textarea", { full: true }) +
      "</div>" +
      (ev.waiver ? '<label class="choice" style="margin-top:1rem"><input type="checkbox" name="waiver" required> <span>' + esc(ev.waiver) + ' <span class="req">*</span></span></label>' : "") +
      '<div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
      "</section>" +

      (paid
        ? '<section class="panel"><h2>How will you pay?</h2>' +
            '<label class="choice"><input type="radio" name="method" value="online" checked> <span><strong>Online now</strong> by debit/credit card or PayPal</span></label>' +
            (ev.allowCheck ? '<label class="choice"><input type="radio" name="method" value="check"> <span><strong>By check</strong>, mailed before the deadline</span></label>' : "") +
          "</section>"
        : "") +

      '<div class="total-bar"><span>Total</span><span class="amount" id="total">' + money(0) + "</span></div>" +
      '<div id="form-error"></div>' +
      '<button type="submit" class="btn" id="submit-btn">' + (paid ? "Continue" : "Submit registration") + "</button>" +
    "</form>";
  }

  function attendeeHtml(ev, n) {
    var p = "a" + n + "_";
    var ticketOpts = ev.tickets.map(function (t) {
      return { value: t.id, label: t.label + (t.price ? " – " + money(t.price) : (isFree(ev) ? "" : " – free")) };
    });
    var extras = (ev.attendeeFields || []).map(function (f) {
      return field(p + "x_" + f.id, f.label, f.type || "text", { required: !!f.required, options: f.options || [] });
    }).join("");
    return '<div class="attendee" data-n="' + n + '">' +
      '<div class="attendee-head"><h3>Person <span class="num"></span></h3>' +
        '<button type="button" class="btn link remove">Remove</button></div>' +
      '<div class="grid">' +
        field(p + "firstName", "First name", "text", { required: true }) +
        field(p + "lastName", "Last name", "text", { required: true }) +
        field(p + "ticket", "Registering as", "select", { required: true, full: true, options: ticketOpts }) +
        '<div class="guardian" hidden><p>Parent or guardian</p>' +
          field(p + "guardianName", "Name", "text", {}) +
          field(p + "guardianPhone", "Phone", "tel", {}) +
        "</div>" +
        extras +
      "</div></div>";
  }

  function wireForm(ev) {
    var form = $("#reg-form");
    var box = $("#attendees");
    var max = ev.maxAttendees || 25;

    function renumber() {
      var cards = $all(".attendee", box);
      cards.forEach(function (c, i) {
        $(".num", c).textContent = i + 1;
        $(".remove", c).hidden = cards.length === 1;
      });
      $("#add-attendee").hidden = cards.length >= max;
      updateTotal();
    }

    function addAttendee() {
      state.count += 1;
      box.insertAdjacentHTML("beforeend", attendeeHtml(ev, state.count));
      var card = box.lastElementChild;
      if (ev.tickets.length === 1) $("select[name$='_ticket']", card).value = ev.tickets[0].id;
      syncGuardian(card);
      renumber();
      return card;
    }

    function syncGuardian(card) {
      var sel = $("select[name$='_ticket']", card);
      var t = ev.tickets.find(function (x) { return x.id === sel.value; });
      var g = $(".guardian", card);
      var minor = !!(t && t.minor);
      g.hidden = !minor;
      $all("input", g).forEach(function (i) { i.required = minor; });
    }

    box.addEventListener("change", function (e) {
      if (e.target.name && /_ticket$/.test(e.target.name)) {
        syncGuardian(e.target.closest(".attendee"));
        updateTotal();
      }
    });
    box.addEventListener("click", function (e) {
      if (e.target.classList.contains("remove")) {
        e.target.closest(".attendee").remove();
        renumber();
      }
    });
    $("#add-attendee").addEventListener("click", function () {
      var card = addAttendee();
      $("input", card).focus();
    });

    addAttendee();

    var asm = form.elements.assembly;
    if (asm && asm.tagName === "SELECT") {
      asm.addEventListener("change", function () {
        var other = asm.value === "__other";
        $("#assembly-other-wrap").hidden = !other;
        form.elements.assemblyOther.required = other;
        if (other) form.elements.assemblyOther.focus();
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var errBox = $("#form-error");
      errBox.innerHTML = "";
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      var data = collect(ev);
      var btn = $("#submit-btn");
      btn.disabled = true;
      btn.textContent = "Saving…";
      data._total = data.total; // used by demo mode only; the server recomputes the total
      api("register", data).then(function (res) {
        afterRegister(ev, data, res);
      }).catch(function (err) {
        errBox.innerHTML = '<div class="notice error"><p>' + esc(err.message) + " Please try again, or email " + esc(C.contactEmail || "us") + ".</p></div>";
        btn.disabled = false;
        btn.textContent = isFree(ev) ? "Submit registration" : "Continue";
      });
    });
  }

  function updateTotal() {
    var ev = state.ev, sum = 0;
    $all("select[name$='_ticket']").forEach(function (s) {
      var t = ev.tickets.find(function (x) { return x.id === s.value; });
      if (t) sum += Number(t.price || 0);
    });
    var el = $("#total");
    if (el) el.textContent = money(sum);
    return sum;
  }

  function collect(ev) {
    var form = $("#reg-form");
    var v = function (n) { var el = form.elements[n]; return el ? String(el.value || "").trim() : ""; };
    var attendees = $all(".attendee").map(function (card) {
      var p = "a" + card.getAttribute("data-n") + "_";
      var t = ev.tickets.find(function (x) { return x.id === v(p + "ticket"); });
      var extra = {};
      (ev.attendeeFields || []).forEach(function (f) { extra[f.label] = v(p + "x_" + f.id); });
      return {
        firstName: v(p + "firstName"),
        lastName: v(p + "lastName"),
        ticketId: t.id,
        ticketLabel: t.label,
        price: Number(t.price || 0),
        guardianName: t.minor ? v(p + "guardianName") : "",
        guardianPhone: t.minor ? v(p + "guardianPhone") : "",
        extra: extra
      };
    });
    var total = attendees.reduce(function (s, a) { return s + a.price; }, 0);
    var methodEl = form.querySelector("input[name=method]:checked");
    return {
      eventId: ev.id,
      registrant: {
        firstName: v("firstName"), lastName: v("lastName"),
        email: v("email"), phone: v("phone"),
        assembly: v("assembly") === "__other" ? "Other: " + v("assemblyOther") : v("assembly")
      },
      attendees: attendees,
      notes: v("notes"),
      waiverAccepted: !!(form.elements.waiver && form.elements.waiver.checked),
      method: total === 0 ? "none" : (methodEl ? methodEl.value : "online"),
      website: v("website"),
      total: total
    };
  }

  function summaryTable(data) {
    return '<table class="summary-table"><thead><tr><th>Name</th><th>Registration</th><th class="num">Amount</th></tr></thead><tbody>' +
      data.attendees.map(function (a) {
        return "<tr><td>" + esc(a.firstName + " " + a.lastName) + "</td><td>" + esc(a.ticketLabel) + '</td><td class="num">' + money(a.price) + "</td></tr>";
      }).join("") +
      '</tbody><tfoot><tr><td colspan="2">Total</td><td class="num">' + money(data.total) + "</td></tr></tfoot></table>";
  }

  function afterRegister(ev, data, res) {
    var app = $("#app");
    var total = typeof res.total === "number" ? res.total : data.total;
    data.total = total;
    window.scrollTo(0, 0);

    var head = eventPanel(ev);
    if (total === 0) {
      app.innerHTML = head + done(data, res.ref, "You're registered. A confirmation email is on its way to " + data.registrant.email + ".");
      return;
    }
    if (data.method === "check") {
      var ch = C.check || {};
      app.innerHTML = head + done(data, res.ref, "Your spots are held. Please mail a check to finish registering.") +
        '<section class="panel"><h2>Mail your check</h2>' +
          "<p><strong>Amount:</strong> " + money(total) + "<br><strong>Payable to:</strong> " + esc(ch.payableTo || "") + "</p>" +
          '<p class="pre"><strong>Mail to:</strong>\n' + esc(ch.mailTo || "") + "</p>" +
          (ch.note ? "<p>" + esc(ch.note) + "</p>" : "") +
          (ev.deadline ? "<p>It needs to arrive by " + esc(fmtShort(ev.deadline)) + ".</p>" : "") +
        "</section>";
      return;
    }

    app.innerHTML = head +
      '<section class="panel"><h2>Review and pay</h2>' +
        '<p>Confirmation number: <span class="ref">' + esc(res.ref) + "</span></p>" +
        summaryTable(data) +
        "<p>Your registration is saved but not complete until payment goes through. Pay with PayPal, or choose <strong>Debit or Credit Card</strong> to pay without a PayPal account.</p>" +
        '<div id="pay-status"></div>' +
        '<div id="paypal-buttons"></div>' +
      "</section>";

    mountPayPal(ev, data, res.ref);
  }

  function done(data, ref, message) {
    return '<div class="notice ok"><p><strong>' + esc(message) + "</strong></p></div>" +
      '<section class="panel"><h2>Confirmation</h2>' +
        '<p>Confirmation number: <span class="ref">' + esc(ref) + "</span></p>" +
        summaryTable(data) +
        '<p class="muted">Keep this number. You can print this page for your records.</p>' +
        '<button type="button" class="btn secondary" onclick="window.print()">Print</button> ' +
        '<a class="btn link" href="index.html">Back to all events</a>' +
      "</section>";
  }

  function mountPayPal(ev, data, ref) {
    var holder = $("#paypal-buttons");
    var status = $("#pay-status");

    function paid() {
      $("#app").innerHTML = eventPanel(ev) +
        done(data, ref, "Payment received. You're registered, and a receipt is on its way to " + data.registrant.email + ".");
      window.scrollTo(0, 0);
    }

    if (DEMO || !C.paypalClientId) {
      holder.innerHTML = '<div class="notice warn"><p>PayPal isn\'t set up yet' + (DEMO ? " (demo mode)" : "") + ".</p></div>" +
        (DEMO ? '<button type="button" class="btn" id="fake-pay">Simulate a ' + money(data.total) + " payment</button>" : "");
      var fake = $("#fake-pay");
      if (fake) fake.addEventListener("click", function () { api("capture", { ref: ref, orderId: "DEMO" }).then(paid); });
      return;
    }

    holder.innerHTML = '<p class="muted">Loading payment options…</p>';
    var s = document.createElement("script");
    s.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(C.paypalClientId) +
      "&currency=" + encodeURIComponent(CURRENCY) + "&intent=capture&components=buttons";
    s.onload = function () {
      holder.innerHTML = "";
      window.paypal.Buttons({
        style: { layout: "vertical", label: "pay", height: 48 },
        createOrder: function () {
          status.innerHTML = "";
          return api("createOrder", { ref: ref }).then(function (r) { return r.orderId; });
        },
        onApprove: function (d) {
          status.innerHTML = '<div class="notice warn"><p>Finishing your payment…</p></div>';
          return api("capture", { ref: ref, orderId: d.orderID }).then(paid).catch(function (err) {
            status.innerHTML = '<div class="notice error"><p>' + esc(err.message) + " Your confirmation number is " + esc(ref) + ".</p></div>";
          });
        },
        onCancel: function () {
          status.innerHTML = '<div class="notice warn"><p>Payment was canceled. Your spot is saved under ' + esc(ref) + "; you can try again below.</p></div>";
        },
        onError: function (err) {
          status.innerHTML = '<div class="notice error"><p>Payment didn\'t go through: ' + esc((err && err.message) || "unknown error") + ". Please try again.</p></div>";
        }
      }).render("#paypal-buttons");
    };
    s.onerror = function () { holder.innerHTML = '<div class="notice error"><p>Couldn\'t load PayPal. Check your connection and refresh the page.</p></div>'; };
    document.head.appendChild(s);
  }

  window.TXIORG = { renderEventList: renderEventList, renderRegistration: renderRegistration };
})();
