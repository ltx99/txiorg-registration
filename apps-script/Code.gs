/**
 * Texas IORG event registration – backend (Google Apps Script, bound to a Google Sheet).
 *
 * What it does
 *   register    – checks the request against events.json, recomputes the total, writes the
 *                 registration + one row per attendee to the sheet, emails a confirmation.
 *   createOrder – creates a PayPal order for the amount stored in the sheet (never the browser's number).
 *   capture     – captures the PayPal payment, marks the registration Paid, emails a receipt.
 *
 * Script properties (Project Settings > Script properties):
 *   EVENTS_URL       https://txiorg.com/events.json   (the live events file)
 *   PAYPAL_CLIENT_ID from developer.paypal.com > Apps & Credentials
 *   PAYPAL_SECRET    same place – keep this secret, it only lives here
 *   PAYPAL_ENV       sandbox  or  live
 *   NOTIFY_EMAIL     optional – gets a copy of every confirmation (comma-separate several)
 *   REPLY_TO         optional – reply-to address on emails, e.g. registrations@txiorg.com
 *   ORG_NAME         optional – defaults to "Texas IORG"
 *   CURRENCY         optional – defaults to USD
 */

var REG_SHEET = 'Registrations';
var ATT_SHEET = 'Attendees';
var REG_HEADERS = ['Submitted', 'Confirmation #', 'Event ID', 'Event', 'Event date', 'Registrant',
  'Email', 'Phone', 'Assembly', 'People', 'Amount due', 'Payment method', 'Status',
  'PayPal order ID', 'PayPal capture ID', 'Amount paid', 'Paid at', 'Payer email', 'Waiver accepted', 'Notes'];
var ATT_HEADERS = ['Confirmation #', 'Event', 'First name', 'Last name', 'Registering as', 'Price',
  'Guardian name', 'Guardian phone', 'Details', 'Registrant email', 'Assembly'];

// Column numbers in the Registrations sheet (1-based)
var COL = {};
REG_HEADERS.forEach(function (h, i) { COL[h] = i + 1; });

function prop(name, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(name);
  return v == null || v === '' ? fallback : v;
}

function doGet() {
  return json({ ok: true, service: 'txiorg-registration' });
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.website) return json({ ok: true, ref: 'TX-000000', total: 0 }); // spam honeypot filled in
    switch (body.action) {
      case 'register': return json(register(body));
      case 'createOrder': return json(createOrder(String(body.ref || '')));
      case 'capture': return json(capture(String(body.ref || ''), String(body.orderId || '')));
      default: throw new Error('Unknown request.');
    }
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- register

function register(b) {
  var ev = findEvent(b.eventId);
  if (!ev) throw new Error('That event was not found.');
  if (!eventOpen(ev)) throw new Error('Registration for this event is closed.');

  var r = b.registrant || {};
  ['firstName', 'lastName', 'email', 'phone'].forEach(function (k) {
    if (!clean(r[k])) throw new Error('Please fill in your contact information.');
  });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean(r.email))) throw new Error('Please check your email address.');
  if (ev.askAssembly !== false && !clean(r.assembly)) throw new Error('Please enter your assembly.');
  if (ev.waiver && !b.waiverAccepted) throw new Error('Please accept the permission statement.');

  var list = Array.isArray(b.attendees) ? b.attendees : [];
  var max = ev.maxAttendees || 25;
  if (!list.length) throw new Error('Add at least one person.');
  if (list.length > max) throw new Error('This event allows up to ' + max + ' people per registration.');

  // Recompute prices from events.json so the browser can't change them.
  var total = 0;
  var people = list.map(function (a) {
    var t = (ev.tickets || []).filter(function (x) { return x.id === a.ticketId; })[0];
    if (!t) throw new Error('Unknown registration type.');
    if (!clean(a.firstName) || !clean(a.lastName)) throw new Error('Every person needs a first and last name.');
    if (t.minor && (!clean(a.guardianName) || !clean(a.guardianPhone))) {
      throw new Error('Please add a parent or guardian for ' + clean(a.firstName) + '.');
    }
    var price = Number(t.price || 0);
    total += price;
    var details = [];
    var extra = a.extra || {};
    Object.keys(extra).forEach(function (k) { if (clean(extra[k])) details.push(k + ': ' + clean(extra[k])); });
    return {
      firstName: clean(a.firstName), lastName: clean(a.lastName), label: t.label, price: price,
      guardianName: t.minor ? clean(a.guardianName) : '', guardianPhone: t.minor ? clean(a.guardianPhone) : '',
      details: details.join('; ')
    };
  });
  total = Math.round(total * 100) / 100;

  var method = total === 0 ? 'None (free)' : (b.method === 'check' && ev.allowCheck ? 'Check' : 'Online');
  var status = total === 0 ? 'Complete' : (method === 'Check' ? 'Awaiting check' : 'Awaiting payment');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var reg = sheet(REG_SHEET, REG_HEADERS);
    var att = sheet(ATT_SHEET, ATT_HEADERS);
    var ref = newRef(reg);
    var name = clean(r.firstName) + ' ' + clean(r.lastName);
    var row = {};
    row['Submitted'] = new Date();
    row['Confirmation #'] = ref;
    row['Event ID'] = ev.id;
    row['Event'] = ev.title;
    row['Event date'] = ev.date;
    row['Registrant'] = name;
    row['Email'] = clean(r.email);
    row['Phone'] = clean(r.phone);
    row['Assembly'] = clean(r.assembly);
    row['People'] = people.length;
    row['Amount due'] = total;
    row['Payment method'] = method;
    row['Status'] = status;
    row['Waiver accepted'] = ev.waiver ? (b.waiverAccepted ? 'Yes' : 'No') : '';
    row['Notes'] = clean(b.notes).slice(0, 2000);
    reg.appendRow(REG_HEADERS.map(function (h) { return row[h] == null ? '' : safeCell(row[h]); }));

    var rows = people.map(function (p) {
      return [ref, ev.title, p.firstName, p.lastName, p.label, p.price, p.guardianName, p.guardianPhone,
        p.details, clean(r.email), clean(r.assembly)].map(safeCell);
    });
    att.getRange(att.getLastRow() + 1, 1, rows.length, ATT_HEADERS.length).setValues(rows);
    SpreadsheetApp.flush();

    if (status !== 'Awaiting payment') {
      sendConfirmation(ev, ref, name, clean(r.email), people, total, method, status);
    }
    return { ok: true, ref: ref, total: total, status: status };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- PayPal

function paypalBase() {
  return prop('PAYPAL_ENV', 'sandbox') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

function paypalToken() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('pp_token');
  if (cached) return cached;
  var id = prop('PAYPAL_CLIENT_ID'), secret = prop('PAYPAL_SECRET');
  if (!id || !secret) throw new Error('Online payment is not set up yet. Please contact the event team.');
  var res = UrlFetchApp.fetch(paypalBase() + '/v1/oauth2/token', {
    method: 'post',
    headers: { Authorization: 'Basic ' + Utilities.base64Encode(id + ':' + secret) },
    payload: { grant_type: 'client_credentials' },
    muteHttpExceptions: true
  });
  var data = JSON.parse(res.getContentText());
  if (!data.access_token) throw new Error('Could not connect to PayPal.');
  cache.put('pp_token', data.access_token, Math.max(60, Math.min(21600, (data.expires_in || 3600) - 120)));
  return data.access_token;
}

function paypal(method, path, payload) {
  var opts = {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + paypalToken(), Prefer: 'return=representation' },
    muteHttpExceptions: true
  };
  if (payload) opts.payload = JSON.stringify(payload);
  var res = UrlFetchApp.fetch(paypalBase() + path, opts);
  var text = res.getContentText();
  return { code: res.getResponseCode(), data: text ? JSON.parse(text) : {} };
}

function createOrder(ref) {
  var found = findReg(ref);
  if (!found) throw new Error('Registration not found.');
  var v = found.values;
  if (v[COL['Status'] - 1] === 'Paid') throw new Error('This registration is already paid.');
  var amount = Number(v[COL['Amount due'] - 1]);
  if (!(amount > 0)) throw new Error('Nothing is due for this registration.');

  var res = paypal('post', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: ref,
      invoice_id: ref,
      custom_id: ref,
      description: String(v[COL['Event'] - 1]).slice(0, 120) + ' (' + v[COL['People'] - 1] + ' people)',
      amount: { currency_code: prop('CURRENCY', 'USD'), value: amount.toFixed(2) }
    }],
    application_context: { shipping_preference: 'NO_SHIPPING', brand_name: prop('ORG_NAME', 'Texas IORG') }
  });
  if (res.code >= 300 || !res.data.id) {
    console.error(JSON.stringify(res.data));
    throw new Error('PayPal could not start the payment. Please try again.');
  }
  found.sheet.getRange(found.row, COL['PayPal order ID']).setValue(res.data.id);
  return { ok: true, orderId: res.data.id };
}

function capture(ref, orderId) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var found = findReg(ref);
    if (!found) throw new Error('Registration not found.');
    var v = found.values;
    if (v[COL['Status'] - 1] === 'Paid') return { ok: true, status: 'Paid' };
    if (!orderId || String(v[COL['PayPal order ID'] - 1]) !== orderId) throw new Error('Payment does not match this registration.');

    var res = paypal('post', '/v2/checkout/orders/' + encodeURIComponent(orderId) + '/capture', {});
    var order = res.data;
    if (res.code >= 300) {
      // If it was already captured (double click, retry), read the order instead.
      var issue = order && order.details && order.details[0] && order.details[0].issue;
      if (issue === 'ORDER_ALREADY_CAPTURED') order = paypal('get', '/v2/checkout/orders/' + encodeURIComponent(orderId)).data;
      else if (issue === 'INSTRUMENT_DECLINED') throw new Error('The card or PayPal account was declined. Please try another payment method.');
      else { console.error(JSON.stringify(order)); throw new Error('PayPal could not complete the payment.'); }
    }

    var cap = order.purchase_units && order.purchase_units[0].payments && order.purchase_units[0].payments.captures &&
      order.purchase_units[0].payments.captures[0];
    if (order.status !== 'COMPLETED' || !cap || cap.status !== 'COMPLETED') {
      throw new Error('The payment is still pending with PayPal. We will email you once it clears.');
    }
    var paid = Number(cap.amount.value);
    var due = Number(v[COL['Amount due'] - 1]);
    var status = Math.abs(paid - due) < 0.005 ? 'Paid' : 'Check amount (paid ' + paid.toFixed(2) + ')';

    var s = found.sheet, r = found.row;
    s.getRange(r, COL['Status']).setValue(status);
    s.getRange(r, COL['PayPal capture ID']).setValue(cap.id);
    s.getRange(r, COL['Amount paid']).setValue(paid);
    s.getRange(r, COL['Paid at']).setValue(new Date());
    s.getRange(r, COL['Payer email']).setValue((order.payer && order.payer.email_address) || '');
    SpreadsheetApp.flush();

    var ev = findEvent(v[COL['Event ID'] - 1]) || { title: v[COL['Event'] - 1], date: v[COL['Event date'] - 1] };
    sendConfirmation(ev, ref, v[COL['Registrant'] - 1], v[COL['Email'] - 1], peopleFor(ref), paid, 'Online', 'Paid');
    return { ok: true, status: 'Paid' };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- email

function sendConfirmation(ev, ref, name, email, people, total, method, status) {
  var org = prop('ORG_NAME', 'Texas IORG');
  var cur = prop('CURRENCY', 'USD');
  var fmt = function (n) { return '$' + Number(n).toFixed(2); };
  var lines = people.map(function (p) { return p.firstName + ' ' + p.lastName + ' – ' + p.label + (p.price ? ' (' + fmt(p.price) + ')' : ''); });

  var statusLine = status === 'Paid' ? 'Payment received: ' + fmt(total) + ' ' + cur + '. Thank you.'
    : status === 'Awaiting check' ? 'Amount due by check: ' + fmt(total) + '. Your registration is complete once the check arrives.'
    : 'You are registered.';

  var when = prettyDate(ev.date);
  var subject = (status === 'Paid' ? 'Receipt: ' : 'Registered: ') + ev.title + ' (' + ref + ')';
  var text = 'Hi ' + String(name).split(' ')[0] + ',\n\n' +
    'Thanks for registering for ' + ev.title + (when ? ' on ' + when : '') + '.\n\n' +
    'Confirmation number: ' + ref + '\n' + statusLine + '\n\n' +
    'Registered:\n' + lines.map(function (l) { return '  ' + l; }).join('\n') + '\n\n' +
    (ev.location ? 'Where: ' + ev.location + (ev.address ? ', ' + ev.address : '') + '\n' : '') +
    (ev.time ? 'Time: ' + ev.time + '\n' : '') +
    '\nReply to this email if anything needs to change.\n\n' + org;

  var html = '<div style="font-family:Verdana,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1e1a1b">' +
    '<p>Hi ' + h(String(name).split(' ')[0]) + ',</p>' +
    '<p>Thanks for registering for <strong>' + h(ev.title) + '</strong>' + (when ? ' on ' + h(when) : '') + '.</p>' +
    '<p style="font-size:18px">Confirmation number: <strong>' + h(ref) + '</strong><br>' + h(statusLine) + '</p>' +
    '<p><strong>Registered</strong><br>' + lines.map(h).join('<br>') + '</p>' +
    (ev.location ? '<p><strong>Where:</strong> ' + h(ev.location) + (ev.address ? ', ' + h(ev.address) : '') + '<br>' : '<p>') +
    (ev.time ? '<strong>Time:</strong> ' + h(ev.time) : '') + '</p>' +
    '<p>Reply to this email if anything needs to change.</p><p>' + h(org) + '</p></div>';

  var msg = { to: email, subject: subject, body: text, htmlBody: html, name: org };
  if (prop('REPLY_TO')) msg.replyTo = prop('REPLY_TO');
  if (prop('NOTIFY_EMAIL')) msg.bcc = prop('NOTIFY_EMAIL');
  try { MailApp.sendEmail(msg); } catch (err) { console.error('Email failed: ' + err); }
}

// ---------------------------------------------------------------- helpers

function findEvent(id) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get('events');
  if (!raw) {
    var url = prop('EVENTS_URL');
    if (!url) throw new Error('EVENTS_URL is not set in Script properties.');
    raw = UrlFetchApp.fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now()).getContentText();
    cache.put('events', raw, 300); // 5 minutes – edits to events.json show up quickly
  }
  return JSON.parse(raw).filter(function (e) { return e.id === id; })[0] || null;
}

function eventOpen(ev) {
  if (ev.open === false) return false;
  var tz = Session.getScriptTimeZone();
  var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  if (ev.deadline && todayStr > ev.deadline) return false;
  if (ev.date && todayStr > ev.date) return false;
  return true;
}

function sheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    s.setFrozenRows(1);
  }
  return s;
}

function findReg(ref) {
  if (!/^TX-[A-Z0-9]{6}$/.test(ref)) return null;
  var s = sheet(REG_SHEET, REG_HEADERS);
  var hit = s.getRange(1, COL['Confirmation #'], s.getLastRow(), 1).createTextFinder(ref).matchEntireCell(true).findNext();
  if (!hit) return null;
  var row = hit.getRow();
  return { sheet: s, row: row, values: s.getRange(row, 1, 1, REG_HEADERS.length).getValues()[0] };
}

function peopleFor(ref) {
  var s = sheet(ATT_SHEET, ATT_HEADERS);
  if (s.getLastRow() < 2) return [];
  return s.getRange(2, 1, s.getLastRow() - 1, ATT_HEADERS.length).getValues()
    .filter(function (r) { return r[0] === ref; })
    .map(function (r) { return { firstName: r[2], lastName: r[3], label: r[4], price: r[5] }; });
}

function newRef(s) {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var tries = 0; tries < 20; tries++) {
    var ref = 'TX-';
    for (var i = 0; i < 6; i++) ref += chars.charAt(Math.floor(Math.random() * chars.length));
    if (!findReg(ref)) return ref;
  }
  throw new Error('Could not create a confirmation number. Please try again.');
}

function prettyDate(d) {
  if (!d) return '';
  var dt = d instanceof Date ? d : new Date(String(d) + 'T12:00:00');
  if (isNaN(dt)) return String(d);
  return Utilities.formatDate(dt, Session.getScriptTimeZone(), 'EEEE, MMMM d, yyyy');
}

function clean(v) { return String(v == null ? '' : v).trim().slice(0, 500); }

// Stop spreadsheet formula injection from form text.
function safeCell(v) {
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function h(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/** Run once from the editor to create the sheets and approve permissions. */
function setup() {
  sheet(REG_SHEET, REG_HEADERS);
  sheet(ATT_SHEET, ATT_HEADERS);
  Logger.log('Sheets ready. Events URL: ' + prop('EVENTS_URL', '(not set)'));
}
