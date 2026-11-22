# Texas IORG Event Registration

A small static site for txiorg.com that lists events, collects registrations, and takes payment.

- **Front end:** plain HTML, CSS and JavaScript. No build step. Host it anywhere.
- **Data:** a Google Sheet. Each registration is one row on `Registrations`, and each person is one row on `Attendees`.
- **Backend:** a Google Apps Script attached to that sheet. It saves registrations, sends confirmation emails, and talks to PayPal.
- **Payments:** PayPal Checkout. People can pay with a PayPal account or with a debit/credit card as a guest. The money goes to the same PayPal business account the Donate button already uses.

```
index.html          event list
register.html       registration form, payment, confirmation
config.js           site settings (backend URL, PayPal Client ID, check mailing address)
events.json         the events – edit this to add or change events
assets/styles.css
assets/app.js
apps-script/Code.gs paste into Apps Script
```

## How a registration works

1. Someone picks an event and fills in their contact info plus each person attending. Girls (any ticket marked `"minor": true`) require a parent/guardian name and phone.
2. The backend re-reads `events.json`, recomputes the total from its own prices, writes the rows, and returns a confirmation number like `TX-7KQ2MD`.
3. Free events, or "pay by check": done. A confirmation email goes out.
4. Online payment: the backend creates the PayPal order for the amount stored in the sheet, so the browser can't change the price. After the person pays, the backend captures the payment, marks the row **Paid**, and emails a receipt.

Rows with status **Awaiting payment** are people who started but didn't pay. **Awaiting check** rows get changed to Paid by hand when the check arrives.

## Setup

### 1. Google Sheet and Apps Script (about 10 minutes)

Use an organization Google account rather than a personal one so the data stays with TXIORG.

1. Create a new Google Sheet named something like "TXIORG Event Registrations".
2. **Extensions > Apps Script.** Delete the starter code and paste in all of `apps-script/Code.gs`. Save.
3. **Project Settings (gear) > Script properties**, add:

   | Property | Value |
   |---|---|
   | `EVENTS_URL` | `https://txiorg.com/events.json` |
   | `PAYPAL_CLIENT_ID` | from step 2 below |
   | `PAYPAL_SECRET` | from step 2 below |
   | `PAYPAL_ENV` | `sandbox` while testing, then `live` |
   | `REPLY_TO` | `txiorgtlt@kantex.net` (where replies to confirmation emails go) |
   | `NOTIFY_EMAIL` | address(es) that should get a copy of every confirmation (optional) |

   Also set the project time zone to America/Chicago (Project Settings) so deadlines close at the right time.
4. Back in the editor, pick `setup` from the function dropdown and click **Run**. Approve the permissions (Sheets, email, outside requests). This creates the two tabs.
5. **Deploy > New deployment > Web app.** Execute as: **Me**. Who has access: **Anyone**. Deploy and copy the URL ending in `/exec`.

When you change `Code.gs` later, use **Deploy > Manage deployments > Edit > New version** so the URL stays the same.

Emails send from the Google account that owns the script. Free Gmail accounts can send about 100 a day; Workspace accounts about 1,500.

### 2. PayPal credentials

1. Log in at developer.paypal.com with the TXIORG PayPal business account.
2. **Apps & Credentials.** Start on the **Sandbox** tab, create an app, and copy the Client ID and Secret.
3. Test the whole flow with a sandbox buyer account (Testing Tools > Sandbox Accounts).
4. When it works, switch to the **Live** tab, create a live app, and swap in the live Client ID and Secret, set `PAYPAL_ENV` to `live`, and put the live Client ID in `config.js`.

The Client ID is public and goes in `config.js`. The Secret only ever goes in Script properties.

### 3. config.js

Set `endpoint` to the `/exec` URL, `paypalClientId`, `contactEmail`, and the check mailing address. With `endpoint` empty the site runs in demo mode, which is handy for previewing changes.

### 4. Hosting on txiorg.com

Any static host works. Two free options:

- **Cloudflare Pages** – connect a GitHub repo (or drag the folder in), then add `txiorg.com` as a custom domain. Easiest if the domain's DNS is already on Cloudflare.
- **GitHub Pages** – push to a repo, turn on Pages, add a `CNAME` file containing `txiorg.com`, and point DNS at GitHub.

Or upload the folder to any existing web server. The pages need to be served over http(s); opening `index.html` straight from disk won't load events.

To test locally: `python3 -m http.server` in this folder, then open http://localhost:8000.

## Adding an event

Add an entry to `events.json` and redeploy the site. Fields:

| Field | Notes |
|---|---|
| `id` | unique, lowercase, no spaces – used in the link `register.html?event=id` |
| `title`, `summary`, `description` | text shown on the pages |
| `date` | `YYYY-MM-DD`. Events drop off the list after this date |
| `time`, `location` | display text. `location` is the venue name |
| `address` | street on the first line, city/state/ZIP on the second, separated by `\n`. A "Get directions" link is added automatically |
| `deadline` | `YYYY-MM-DD`. Registration closes after this day |
| `open` | set `false` to close registration early (full, cancelled) |
| `askAssembly` | ask for assembly name and number (default true) |
| `allowCheck` | offer "pay by check" |
| `maxAttendees` | most people on one registration (default 25) |
| `tickets` | list of `{ "id", "label", "price", "minor" }`. `price: 0` is free. `minor: true` asks for a parent/guardian |
| `attendeeFields` | extra questions per person: `{ "id", "label", "type": "text", "select" or "checkbox", "options": [...], "required": true }`. Add `"tickets": ["girl"]` to ask only for that registration type, and `"showWhen": "<checkbox id>"` to ask only when that box is checked. A `"date"` field can set `"ageMin"`/`"ageMax"` (checked against the event date). A `"derived"` field with `"display": false` is never shown but is saved: `"calc": "age", "from": "birthdate"` gives age on the event date, and adding `"ranges"` turns that age into a label such as Junior or Senior |
| `waiver` | permission statement they must check (optional) |

The three events in the file are samples with placeholder venues. Replace them before going live.

The backend caches `events.json` for 5 minutes, so a price or deadline change takes up to 5 minutes to reach it.

## Privacy

The sheet holds names and parent contact details for minors. Share it only with the people who run registration, and don't publish it or link to it from the site. Delete or archive old event rows once an event is over and the money is reconciled.

## Not included (easy to add later)

- Capacity limits per event (stop at 120 people)
- Refunds – handle these from the PayPal dashboard; the capture ID is on the sheet
- An optional "cover the card fee" line
