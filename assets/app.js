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
    n = Number(n || 0);
    return n.toLocaleString("en-US", { style: "currency", currency: CURRENCY, minimumFractionDigits: n % 1 ? 2 : 0 });
  }
  function moneyExact(n) {
    return Number(n || 0).toLocaleString("en-US", { style: "currency", currency: CURRENCY });
  }
  function parseDay(iso) { return new Date(iso + "T12:00:00"); }
  function fmtDate(iso) {
    return parseDay(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  function fmtShort(iso) {
    return parseDay(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });
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
    var prices = ev.tickets.map(function (t) { return Number(t.price || 0); });
    if (prices.every(function (p) { return p === prices[0]; })) return money(prices[0]) + " per person";
    return ev.tickets.map(function (t) { return t.label + ", " + (t.price ? money(t.price) : "free"); }).join("<br>");
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

  // ---------- the ticket ----------
  function stub(ev) {
    var d = parseDay(ev.date);
    return '<div class="stub">' +
      '<span class="day">' + d.getDate() + "</span>" +
      '<span class="md"><span class="month">' + esc(d.toLocaleDateString("en-US", { month: "long" })) + "</span>" +
      '<span class="weekday">' + esc(d.toLocaleDateString("en-US", { weekday: "long" })) + ", " + d.getFullYear() + "</span></span>" +
    "</div>";
  }

  function details(ev) {
    var where = "";
    if (ev.location) where += "<strong>" + esc(ev.location) + "</strong>";
    if (ev.address) {
      where += (where ? "<br>" : "") + esc(ev.address).replace(/\n/g, "<br>");
      var q = [ev.location, String(ev.address).replace(/\n/g, ", ")].filter(Boolean).join(", ");
      where += '<br><a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q) + '" target="_blank" rel="noopener">Get directions</a>';
    }
    return '<dl class="details">' +
      "<dt>When</dt><dd>" + esc(fmtDate(ev.date)) + (ev.time ? "<br>" + esc(ev.time) : "") + "</dd>" +
      (where ? "<dt>Where</dt><dd>" + where + "</dd>" : "") +
      "<dt>Cost</dt><dd>" + priceText(ev) + "</dd>" +
    "</dl>";
  }

  function ticket(ev, opts) {
    opts = opts || {};
    var open = isOpen(ev);
    var heading = opts.page ? "h1" : "h2";
    var foot = "";
    if (opts.page) {
      foot = ev.deadline ? '<p class="closes">Registration closes ' + esc(fmtShort(ev.deadline)) + ".</p>" : "";
    } else {
      foot = '<div class="ticket-foot">' +
        (open
          ? '<a class="btn" href="register.html?event=' + encodeURIComponent(ev.id) + '">Register</a>' +
            (ev.deadline ? '<span class="closes">Closes ' + esc(fmtShort(ev.deadline)) + "</span>" : "")
          : '<span class="closed">Registration is closed</span>') +
      "</div>";
    }
    return '<article class="ticket">' + stub(ev) +
      '<div class="ticket-body">' +
        "<" + heading + ">" + esc(ev.title) + "</" + heading + ">" +
        (ev.summary ? '<p class="summary">' + esc(ev.summary) + "</p>" : "") +
        details(ev) +
        (opts.page && ev.description ? "<p>" + esc(ev.description) + "</p>" : "") +
        foot +
      "</div></article>";
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
        list.innerHTML = '<div class="panel"><p>No events are open for registration right now. New events are posted here as soon as dates are set.</p></div>';
        return;
      }
      list.innerHTML = upcoming.map(function (ev) { return ticket(ev); }).join("");
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
      if (!ev) { showError(app, "That event isn't on the list. Go back to all events and pick one."); return; }
      state.ev = ev;
      document.title = "Register: " + ev.title + " | " + (C.orgName || "Texas IORG");
      if (!isOpen(ev)) {
        app.innerHTML = ticket(ev, { page: true }) + '<div class="panel"><p>Registration for this event is closed.' +
          (C.contactEmail ? ' Email <a href="mailto:' + esc(C.contactEmail) + '">' + esc(C.contactEmail) + "</a> if you need help." : "") + "</p></div>";
        return;
      }
      app.innerHTML = ticket(ev, { page: true }) + formHtml(ev);
      wireForm(ev);
    }).catch(function (err) { showError(app, err.message); });
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
      '<div class="full" id="assembly-other-wrap" hidden><label for="f-assemblyOther">Which group? <span class="req" aria-hidden="true">*</span></label>' +
      '<input id="f-assemblyOther" type="text" name="assemblyOther"></div>';
  }

  function stepHead(n, title) {
    return '<div class="step-head"><span class="step-n" aria-hidden="true">' + n + "</span><h2>" + esc(title) + "</h2></div>";
  }

  function formHtml(ev) {
    var paid = !isFree(ev);
    var max = ev.maxAttendees || 25;
    return '<form id="reg-form" class="sheet" novalidate>' +
      '<fieldset class="step">' + stepHead(1, "Your contact information") +
        '<p class="step-note">The confirmation goes to this email. If you are registering girls from your assembly, use your own name here.</p>' +
        '<div class="grid">' +
          field("firstName", "First name", "text", { required: true, autocomplete: "given-name" }) +
          field("lastName", "Last name", "text", { required: true, autocomplete: "family-name" }) +
          field("email", "Email", "email", { required: true, autocomplete: "email" }) +
          field("phone", "Mobile phone", "tel", { required: true, autocomplete: "tel" }) +
          (ev.askAssembly !== false ? assemblyField() : "") +
        "</div>" +
      "</fieldset>" +

      '<fieldset class="step">' + stepHead(2, "Who is coming?") +
        '<p class="step-note">Add each girl and adult you are registering, up to ' + max + ".</p>" +
        '<div id="attendees"></div>' +
        '<button type="button" class="btn secondary" id="add-attendee">Add another person</button>' +
        '<div class="grid">' + field("notes", "Notes for the event team", "textarea", { full: true }) + "</div>" +
        (ev.waiver ? '<label class="choice"><input type="checkbox" name="waiver" required> <span>' + esc(ev.waiver) + ' <span class="req">*</span></span></label>' : "") +
        '<div class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
      "</fieldset>" +

      (paid
        ? '<fieldset class="step">' + stepHead(3, "How will you pay?") +
            '<label class="choice"><input type="radio" name="method" value="online" checked> <span><strong>Online now</strong> with a debit or credit card, or PayPal</span></label>' +
            (ev.allowCheck ? '<label class="choice"><input type="radio" name="method" value="check"> <span><strong>By check</strong>, mailed so it arrives by ' + esc(fmtShort(ev.deadline || ev.date)) + "</span></label>" : "") +
          "</fieldset>"
        : "") +

      '<aside class="receipt" aria-live="polite"><h3>Your registration</h3><div id="receipt-lines"></div></aside>' +
      '<div class="form-actions"><div id="form-error"></div>' +
        '<button type="submit" class="btn" id="submit-btn">' + (paid ? "Continue to payment" : "Register") + "</button>" +
      "</div>" +
    "</form>";
  }

  function attendeeHtml(ev, n) {
    var p = "a" + n + "_";
    var ticketOpts = ev.tickets.map(function (t) {
      return { value: t.id, label: t.label + (t.price ? ", " + money(t.price) : (isFree(ev) ? "" : ", free")) };
    });
    var extras = (ev.attendeeFields || []).map(function (f) {
      var html;
      if (f.type === "derived") {
        html = '<p class="derived"><strong>' + esc(f.label) + ':</strong> <span class="derived-value">Choose her age above</span></p>';
      } else if (f.type === "checkbox") {
        html = '<label class="choice"><input type="checkbox" name="' + esc(p + "x_" + f.id) + '" value="Yes"> <span>' + esc(f.label) + "</span></label>";
      } else {
        html = field(p + "x_" + f.id, f.label, f.type || "text", { required: !!f.required, options: f.options || [], hint: f.hint });
      }
      var cond = f.tickets || f.showWhen;
      return '<div class="extra' + (f.type === "checkbox" || f.full ? " full" : "") + '" data-field="' + esc(f.id) + '"' +
        (f.tickets ? ' data-tickets="' + esc(f.tickets.join(",")) + '"' : "") +
        (f.showWhen ? ' data-show-when="' + esc(f.showWhen) + '"' : "") +
        (f.required ? ' data-required="1"' : "") + (cond ? " hidden" : "") + ">" +
        html.replace(/^<div class="[^"]*">/, "").replace(/<\/div>$/, "") + "</div>";
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

  // e.g. division from age: { "from": "age", "ranges": [{ "label": "Junior", "min": 11, "max": 15 }] }
  function derive(f, card) {
    var src = card.querySelector("[name='a" + card.getAttribute("data-n") + "_x_" + f.from + "']");
    var n = src ? Number(src.value) : NaN;
    if (!src || src.value === "" || isNaN(n)) return "";
    var r = (f.ranges || []).find(function (x) { return n >= x.min && n <= x.max; });
    return r ? r.label + " (ages " + r.min + "–" + r.max + ")" : "";
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
      updateReceipt();
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
      syncExtras(card);
    }

    // Show per-person questions only for the right registration type,
    // and follow-up questions only when their checkbox is ticked.
    function syncExtras(card) {
      var ticketId = $("select[name$='_ticket']", card).value;
      var p = "a" + card.getAttribute("data-n") + "_x_";
      $all(".extra", card).forEach(function (wrap) {
        var show = true;
        var tk = wrap.getAttribute("data-tickets");
        if (tk) show = tk.split(",").indexOf(ticketId) >= 0;
        var dep = wrap.getAttribute("data-show-when");
        if (show && dep) {
          var box = card.querySelector("[name='" + p + dep + "']");
          var depWrap = box && box.closest(".extra");
          show = !!(box && box.checked && !(depWrap && depWrap.hidden));
        }
        wrap.hidden = !show;
        var f = (ev.attendeeFields || []).find(function (x) { return x.id === wrap.getAttribute("data-field"); });
        if (f && f.type === "derived") {
          var val = derive(f, card);
          $(".derived-value", wrap).textContent = val || "Choose her age above";
        }
        $all("input, select, textarea", wrap).forEach(function (el) {
          if (el.type !== "checkbox") el.required = show && wrap.getAttribute("data-required") === "1";
          if (!show) { if (el.type === "checkbox") el.checked = false; else el.value = ""; }
        });
      });
    }

    box.addEventListener("change", function (e) {
      if (e.target.name && /_ticket$/.test(e.target.name)) syncGuardian(e.target.closest(".attendee"));
      else if (e.target.closest(".extra")) syncExtras(e.target.closest(".attendee"));
      updateReceipt();
    });
    box.addEventListener("input", function (e) {
      if (e.target.name && /_(firstName|lastName)$/.test(e.target.name)) updateReceipt();
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
      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Saving your registration…";
      data._total = data.total; // used by demo mode only; the server recomputes the total
      api("register", data).then(function (res) {
        afterRegister(ev, data, res);
      }).catch(function (err) {
        errBox.innerHTML = '<div class="notice error"><p>Your registration was not saved: ' + esc(err.message) +
          " Try again, or email " + esc(C.contactEmail || "the event team") + ".</p></div>";
        btn.disabled = false;
        btn.textContent = label;
      });
    });
  }

  function currentLines() {
    var ev = state.ev;
    return $all(".attendee").map(function (card, i) {
      var p = "a" + card.getAttribute("data-n") + "_";
      var name = [$("[name='" + p + "firstName']", card).value, $("[name='" + p + "lastName']", card).value].join(" ").trim();
      var t = ev.tickets.find(function (x) { return x.id === $("[name='" + p + "ticket']", card).value; });
      return { name: name || "Person " + (i + 1), label: t ? t.label : "", price: t ? Number(t.price || 0) : null };
    });
  }

  function receiptHtml(lines, total) {
    var picked = lines.filter(function (l) { return l.price !== null; });
    if (!picked.length) return '<p class="empty">Choose who each person is registering as to see the total.</p>';
    return "<ul>" + picked.map(function (l) {
      return "<li><span>" + esc(l.name) + (l.label ? ", " + esc(l.label) : "") + "</span><span>" + moneyExact(l.price) + "</span></li>";
    }).join("") + '</ul><div class="total"><span>Total</span><span>' + moneyExact(total) + "</span></div>";
  }

  function updateReceipt() {
    var lines = currentLines();
    var total = lines.reduce(function (s, l) { return s + (l.price || 0); }, 0);
    var el = $("#receipt-lines");
    if (el) el.innerHTML = receiptHtml(lines, total);
    return total;
  }

  function collect(ev) {
    var form = $("#reg-form");
    var v = function (n) { var el = form.elements[n]; return el ? String(el.value || "").trim() : ""; };
    var attendees = $all(".attendee").map(function (card) {
      var p = "a" + card.getAttribute("data-n") + "_";
      var t = ev.tickets.find(function (x) { return x.id === v(p + "ticket"); });
      var extra = {};
      (ev.attendeeFields || []).forEach(function (f) {
        var wrap = card.querySelector(".extra[data-field='" + f.id + "']");
        if (wrap && wrap.hidden) return;
        var el = form.elements[p + "x_" + f.id];
        if (f.type === "derived") { var d = derive(f, card); extra[f.label] = d.split(" (")[0]; return; }
        extra[f.label] = f.type === "checkbox" ? (el && el.checked ? "Yes" : "No") : v(p + "x_" + f.id);
      });
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

  function dataLines(data) {
    return data.attendees.map(function (a) { return { name: a.firstName + " " + a.lastName, label: a.ticketLabel, price: a.price }; });
  }

  // Admission-ticket style confirmation
  function admitTicket(ev, data, ref, headline, extra) {
    var n = data.attendees.length;
    return '<article class="ticket admit">' +
      '<div class="stub"><span class="md"><span class="month">Admit</span></span>' +
        '<span class="day">' + n + "</span>" +
        '<span class="md"><span class="weekday">' + (n === 1 ? "person" : "people") + "</span></span></div>" +
      '<div class="ticket-body">' +
        "<h1>" + esc(headline) + "</h1>" +
        "<p>" + esc(ev.title) + ", " + esc(fmtDate(ev.date)) + "</p>" +
        '<p>Confirmation number<br><span class="ref">' + esc(ref) + "</span></p>" +
        (extra || "") +
      "</div></article>" +
      '<div class="panel">' +
        '<div class="receipt">' + receiptHtml(dataLines(data), data.total) + "</div>" +
        '<div class="panel-actions"><button type="button" class="btn secondary" onclick="window.print()">Print this page</button>' +
        '<a href="index.html">Back to all events</a></div>' +
      "</div>";
  }

  function afterRegister(ev, data, res) {
    var app = $("#app");
    var total = typeof res.total === "number" ? res.total : data.total;
    data.total = total;
    window.scrollTo(0, 0);
    var email = '<p class="muted">A confirmation email is on its way to ' + esc(data.registrant.email) + ".</p>";

    if (total === 0) {
      app.innerHTML = admitTicket(ev, data, res.ref, "You're registered", email);
      return;
    }
    if (data.method === "check") {
      var ch = C.check || {};
      app.innerHTML = admitTicket(ev, data, res.ref, "Your places are held", email) +
        '<div class="panel"><h2>Mail your check</h2>' +
          "<p>Make a check for <strong>" + moneyExact(total) + "</strong> payable to <strong>" + esc(ch.payableTo || "") + "</strong>.</p>" +
          '<p class="pre">' + esc(ch.mailTo || "") + "</p>" +
          (ch.note ? "<p>" + esc(ch.note) + "</p>" : "") +
          (ev.deadline ? "<p>It needs to arrive by " + esc(fmtShort(ev.deadline)) + ". Your registration is complete once it does.</p>" : "") +
        "</div>";
      return;
    }

    app.innerHTML = ticket(ev, { page: true }) +
      '<div class="panel"><h2>Pay ' + moneyExact(total) + "</h2>" +
        '<p>Your registration is saved under <strong>' + esc(res.ref) + "</strong>. It is complete once payment goes through.</p>" +
        '<div class="receipt">' + receiptHtml(dataLines(data), total) + "</div>" +
        "<p>Pay with PayPal, or choose <strong>Debit or Credit Card</strong> if you don't have a PayPal account.</p>" +
        '<div id="pay-status"></div>' +
        '<div id="paypal-buttons"></div>' +
      "</div>";
    mountPayPal(ev, data, res.ref);
  }

  function mountPayPal(ev, data, ref) {
    var holder = $("#paypal-buttons");
    var status = $("#pay-status");

    function paid() {
      $("#app").innerHTML = admitTicket(ev, data, ref, "Payment received",
        '<p class="muted">A receipt is on its way to ' + esc(data.registrant.email) + ".</p>");
      window.scrollTo(0, 0);
    }

    if (DEMO || !C.paypalClientId) {
      holder.innerHTML = '<div class="notice warn"><p>Online payment isn\'t set up yet' + (DEMO ? " (demo mode)" : "") + ".</p></div>" +
        (DEMO ? '<button type="button" class="btn" id="fake-pay">Simulate a ' + moneyExact(data.total) + " payment</button>" : "");
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
          status.innerHTML = '<div class="notice warn"><p>Payment canceled. Your registration is still saved under ' + esc(ref) + ". Pay below when you're ready.</p></div>";
        },
        onError: function (err) {
          status.innerHTML = '<div class="notice error"><p>The payment didn\'t go through: ' + esc((err && err.message) || "unknown error") + ". Try again, or use a different card.</p></div>";
        }
      }).render("#paypal-buttons");
    };
    s.onerror = function () { holder.innerHTML = '<div class="notice error"><p>PayPal didn\'t load. Check your connection and refresh the page.</p></div>'; };
    document.head.appendChild(s);
  }

  window.TXIORG = { renderEventList: renderEventList, renderRegistration: renderRegistration };
})();
