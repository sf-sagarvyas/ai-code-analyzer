
# LWC Security Rules

Even with Lightning Web Security (LWS) enabled, custom LWCs can still
leak data, inject

unsafe content, or expose features unsafely. These rules target the
client-side

vulnerabilities most likely to slip past automated scanners.

---

## RULE LWC-SEC-001: Never assign user-controlled content to `innerHTML`

**Severity:** critical

**Category:** security

**Applies to:** lwc-js

**Rationale:** Setting `innerHTML` from a value that came from an API
response, URL

parameter, or user input executes any `<script>` and `on*` attributes it
contains —

classic DOM-based XSS. LWS distorts some sinks but does not make
`innerHTML`

unconditionally safe. Use template interpolation (`{value}`) so LWC
auto-escapes, or

sanitize via a vetted library (DOMPurify is the de-facto standard) when
raw HTML is

genuinely required.

**Detection signals:**

- `element.innerHTML = ...` where the right-hand side includes a method
parameter, an

`@api` property, or any expression not a string literal.

- `outerHTML`, `insertAdjacentHTML` similarly.

- `lightning-formatted-rich-text value={raw}` where `raw` comes from
untrusted input

without sanitization.

**Bad example:**

```javascript

renderedCallback() {

this.template.querySelector('.preview').innerHTML = this.bodyHtml; //
XSS sink

}

```

**Good example:**

```html

<template>

<!-- template interpolation auto-escapes -->

<div class="preview">{bodyText}</div>

<!-- for rich text, use the base component which sanitizes by allow-list
-->

<lightning-formatted-rich-text
value={sanitizedHtml}></lightning-formatted-rich-text>

</template>

```

**References:**
https://developer.salesforce.com/docs/platform/lightning-components-security/guide/lws-distortions.html,
https://trailhead.salesforce.com/content/learn/modules/secure-clientside-development

---

## RULE LWC-SEC-002: Never use `eval`, `Function`, or
`setTimeout(string)`

**Severity:** critical

**Category:** security

**Applies to:** lwc-js

**Rationale:** Dynamic code execution defeats LWS sandboxing and is a
top-tier injection

vector. Even when LWS distorts the global `eval` to throw, in-string
code (e.g.,

`setTimeout("doStuff()", 100)`) is harder to spot and equally dangerous.
There is no

legitimate need for dynamic code execution in modern LWC.

**Detection signals:**

- `eval(`, `new Function(`, `Function(` calls.

- `setTimeout(stringArg, ...)` where the first arg is a string (not a
function).

- `setInterval(stringArg, ...)` similarly.

**Bad example:**

```javascript

handleFormula(e) {

this.result = eval(e.target.value);

}

setTimeout('this.refresh()', 1000);

```

**Good example:**

```javascript

import { safeEvaluate } from 'c/formulaEvaluator';

handleFormula(e) {

this.result = safeEvaluate(e.target.value); // explicit, validated
parser

}

setTimeout(() => this.refresh(), 1000);

```

**References:**
https://developer.salesforce.com/docs/platform/lightning-components-security/guide/lws-intro.html

---

## RULE LWC-SEC-003: Don't expose sensitive data via composed+bubbling
custom events

**Severity:** high

**Category:** security

**Applies to:** lwc-js

**Rationale:** A `CustomEvent` with both `bubbles: true` and `composed:
true` crosses

every shadow boundary up to the document root. Any component anywhere in
the page can

intercept it and read the `detail` payload. For internal parent-child
communication, use

the default (`bubbles: false, composed: false`); only opt into both when
the event is

deliberately part of a public component contract and the payload is
non-sensitive.

**Detection signals:**

- `new CustomEvent('name', { bubbles: true, composed: true, detail:
{...} })` carrying

ids, names, emails, financial info.

- A pattern of dispatching all events with both flags true by default.

- `detail` containing whole record objects when only an id is needed.

**Bad example:**

```javascript

this.dispatchEvent(new CustomEvent('recordselect', {

bubbles: true, composed: true,

detail: { record: this.fullRecord, secrets: this.tokens } // leaks to
whole page

}));

```

**Good example:**

```javascript

this.dispatchEvent(new CustomEvent('recordselect', {

detail: { recordId: this.fullRecord.Id }

}));

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/events-propagation.html,
https://developer.salesforce.com/docs/platform/lwc/guide/events-best-practices.html

---

## RULE LWC-SEC-004: Don't load scripts from untrusted CDNs; use Static
Resources

**Severity:** high

**Category:** security

**Applies to:** lwc-js

**Rationale:** A `<script src="https://cdn.somewhere.com/lib.js">`
execution is

controlled by the CDN. A breach there injects code into your org.
Salesforce Static

Resources are versioned, immutable, and served from the Salesforce CDN;
combined with

`loadScript` from `lightning/platformResourceLoader` they are the only
sanctioned way

to include third-party JS.

**Detection signals:**

- `<script src="https://..."/>` in an LWC template (also disallowed by
LWS).

- `loadScript(this, 'https://...')` with an absolute external URL.

- An npm package imported directly into LWC source without packaging
through Static

Resources.

**Bad example:**

```javascript

import { loadScript } from 'lightning/platformResourceLoader';

connectedCallback() {

loadScript(this, 'https://unpkg.com/chart.js@4/dist/chart.umd.js');

}

```

**Good example:**

```javascript

import { loadScript } from 'lightning/platformResourceLoader';

import CHART_JS from '@salesforce/resourceUrl/chartjs_4';

connectedCallback() {

loadScript(this, CHART_JS);

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/js-third-party-library.html,
https://developer.salesforce.com/docs/platform/lightning-components-security/guide/lws-intro.html

---

## RULE LWC-SEC-005: Trust no client-side validation; always re-check in
Apex

**Severity:** high

**Category:** security

**Applies to:** lwc-js, apex-class

**Rationale:** A user can bypass your LWC entirely (browser dev tools,
`apex.callMethod`

directly, an alternate Aura/LWC consumer of the same Apex method). The
Apex method must

re-validate every constraint the UI enforced. Treat LWC validation as
UX, not security.

**Detection signals:**

- An LWC that validates required/length/range before calling Apex, and
the Apex method

has no equivalent validation.

- An Apex `@AuraEnabled` method that accepts a `Boolean adminOverride`
parameter from the

client.

- A "trust me" comment in Apex referring to a client check.

**Bad example:**

```javascript

// LWC

if (amount > 0) { saveAmount({ value: amount }); } // amount validated
only here

```

```apex

@AuraEnabled public static void saveAmount(Decimal value) {

insert new Payment__c(Amount__c = value);

}

```

**Good example:**

```javascript

if (amount > 0) { saveAmount({ value: amount }); }

```

```apex

@AuraEnabled public static void saveAmount(Decimal value) {

if (value == null || value <= 0) {

throw new AuraHandledException('Amount must be positive');

}

insert new Payment__c(Amount__c = value);

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/apex-security.html,
https://trailhead.salesforce.com/content/learn/modules/secure-serverside-development

---

## RULE LWC-SEC-006: Don't log PII/secret payloads to `console`

**Severity:** medium

**Category:** security

**Applies to:** lwc-js

**Rationale:** `console.log` writes to the browser console — visible to
anyone with dev

tools open, captured by some browser extensions, and persisted in screen
recordings sent

to support. Logging an Account record, OAuth token, or PII field is a
quiet data

exfiltration vector. Either redact before logging or remove the log
before commit.

**Detection signals:**

- `console.log(record)`, `console.log(JSON.stringify(record))`.

- `console.log(this.userInfo)`, `console.log(token)`,
`console.log(response)` where the

response is from a non-trivial Apex call.

- `console.debug`/`console.info`/`console.warn`/`console.error` with
sensitive payloads.

**Bad example:**

```javascript

const result = await getAccount({ id: this.recordId });

console.log('account', result);

```

**Good example:**

```javascript

const result = await getAccount({ id: this.recordId });

// no console.log in production code, or:

console.debug('account loaded', { id: result.Id }); // log only
non-sensitive keys

```

**References:**
https://trailhead.salesforce.com/content/learn/modules/secure-clientside-development

---

## RULE LWC-SEC-007: Reject untrusted URLs in href/src/window.open

**Severity:** high

**Category:** security

**Applies to:** lwc-js, lwc-html

**Rationale:** A `<a href={userUrl}>` or `window.open(userUrl)` where
`userUrl` includes

`javascript:` runs arbitrary script (XSS). A `data:text/html;base64,...`
URL similarly

loads attacker-controlled HTML in a same-origin frame. Validate that the
URL is `http(s)`

or a relative Salesforce path before assigning.

**Detection signals:**

- `href={prop}` or `src={prop}` where `prop` is set from external input.

- `window.open(value, ...)` where `value` is user-controlled.

- `<a target="_blank">` without `rel="noopener noreferrer"` (lesser
issue but related).

**Bad example:**

```html

<a href={profileUrl}>Profile</a>

```

```javascript

openLink() { window.open(this.suppliedUrl); }

```

**Good example:**

```javascript

get safeProfileUrl() {

const u = this.profileUrl || '';

return /^https?:\/\//i.test(u) || u.startsWith('/') ? u : '#';

}

openLink() {

if (/^https?:\/\//i.test(this.suppliedUrl)) {

window.open(this.suppliedUrl, '_blank', 'noopener,noreferrer');

}

}

```

**References:**
https://developer.salesforce.com/docs/platform/lightning-components-security/guide/lws-intro.html,
https://owasp.org/www-community/attacks/xss/

---

