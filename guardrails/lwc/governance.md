
# LWC Governance Rules

LWC governance covers the long-term concerns specific to client-side
code on the

Salesforce platform: meta XML version pinning, target placement, public
API stability,

and avoiding patterns that lock you out of platform improvements.

---

## RULE LWC-GOV-001: Pin every LWC bundle to a recent `apiVersion` in
`-meta.xml`

**Severity:** high

**Category:** governance

**Applies to:** lwc-meta

**Rationale:** The `apiVersion` in `<component>.js-meta.xml` controls
which LWC engine

features and base-component versions the component compiles against. Old
versions miss

runtime improvements (the modern `lwc:if` family is only available at
v55+; many wire

adapter improvements ship per release) and slowly become incompatible
with new patterns.

Standardize on a recent version.

**Detection signals:**

- A `*.js-meta.xml` with `<apiVersion>` below v60.0.

- Mixed `apiVersion` values across the LWC folder.

- New components added at the lowest version the team has historically
used.

**Bad example:**

```xml

<?xml version="1.0" encoding="UTF-8"?>

<LightningComponentBundle
xmlns="http://soap.sforce.com/2006/04/metadata">

<apiVersion>49.0</apiVersion>

<isExposed>true</isExposed>

</LightningComponentBundle>

```

**Good example:**

```xml

<?xml version="1.0" encoding="UTF-8"?>

<LightningComponentBundle
xmlns="http://soap.sforce.com/2006/04/metadata">

<apiVersion>62.0</apiVersion>

<isExposed>true</isExposed>

</LightningComponentBundle>

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/reference-configuration-tags.html

---

## RULE LWC-GOV-002: Restrict component exposure with explicit `targets`

**Severity:** medium

**Category:** governance

**Applies to:** lwc-meta

**Rationale:** A component marked `<isExposed>true</isExposed>` with no
`<targets>` is

exposed everywhere it could possibly be placed — App Builder, Experience
Cloud, Quick

Actions, Communities, Flow Screens. That maximizes the surface area on
which the

component must work (and be supported). Listing only the targets you
actually support

reduces support burden and prevents admins from placing the component in
unsuitable

contexts.

**Detection signals:**

- `<isExposed>true</isExposed>` with no `<targets>` element.

- `<targets>` that lists every available target without justification.

- A community-only component exposed in `lightning__RecordPage` (where
it lacks `recordId`

handling).

**Bad example:**

```xml

<LightningComponentBundle>

<apiVersion>62.0</apiVersion>

<isExposed>true</isExposed>

</LightningComponentBundle>

```

**Good example:**

```xml

<LightningComponentBundle>

<apiVersion>62.0</apiVersion>

<isExposed>true</isExposed>

<targets>

<target>lightning__RecordPage</target>

</targets>

<targetConfigs>

<targetConfig targets="lightning__RecordPage">

<objects>

<object>Account</object>

<object>Opportunity</object>

</objects>

</targetConfig>

</targetConfigs>

</LightningComponentBundle>

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/reference-configuration-tags.html

---

## RULE LWC-GOV-003: `@api` properties form a public contract — version
their shape

**Severity:** medium

**Category:** governance

**Applies to:** lwc-js

**Rationale:** `@api` properties are the public API of an LWC. Other
components, Flow

designers, and admin App Builder pages bind to them. Renaming or
removing one breaks

consumers silently — there is no Apex-style `@Deprecated` warning at
design time. Treat

`@api` changes as semver-major and document them with JSDoc.

**Detection signals:**

- `@api` property renamed in a single commit with no deprecation period.

- `@api` property type changed (e.g., string -> array) without a
parallel new property.

- An `@api` property with no JSDoc describing accepted values.

**Bad example:**

```javascript

import { LightningElement, api } from 'lwc';

export default class StatusPill extends LightningElement {

@api state; // was 'status' last release - all consumers now broken

}

```

**Good example:**

```javascript

import { LightningElement, api } from 'lwc';

export default class StatusPill extends LightningElement {

/**

* Display label for the pill.

* Accepted values: 'success', 'warning', 'error', 'info'.

* @api

*/

@api status;

/** @deprecated Use `status`. Will be removed in 2027.01. */

@api set state(v) { this.status = v; }

get state() { return this.status; }

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/js-props-public.html

---

## RULE LWC-GOV-004: Don't ship LWC labels as string literals — use
Custom Labels

**Severity:** medium

**Category:** governance

**Applies to:** lwc-js, lwc-html

**Rationale:** Hardcoded user-facing strings can't be translated and
can't be tweaked

without a redeploy. Salesforce Custom Labels (referenced via
`@salesforce/label/...`)

are translatable per org-supported language and editable by admins. Even
monolingual

orgs benefit because copy edits become metadata-only changes.

**Detection signals:**

- A `lightning-button` whose `label="Save"` is a literal rather than
`{labels.save}`.

- Strings like `'Please enter a valid email'` embedded in `.js` files
instead of imported

from `@salesforce/label/...`.

- Templates with sentences in English rather than label expressions.

**Bad example:**

```html

<lightning-button label="Save and continue"
onclick={handleSave}></lightning-button>

```

```javascript

this.errorMessage = 'Please enter a valid email address';

```

**Good example:**

```html

<lightning-button label={labels.saveAndContinue}
onclick={handleSave}></lightning-button>

```

```javascript

import SAVE_AND_CONTINUE from '@salesforce/label/c.Save_And_Continue';

import INVALID_EMAIL from '@salesforce/label/c.Invalid_Email';

export default class Form extends LightningElement {

labels = { saveAndContinue: SAVE_AND_CONTINUE };

validate(email) { if (!/.+@.+/.test(email)) { this.errorMessage =
INVALID_EMAIL; } }

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/create-labels.html

---

## RULE LWC-GOV-005: Document component owner and entry points in a
header comment

**Severity:** low

**Category:** governance

**Applies to:** lwc-js

**Rationale:** When a customer reports that the "Account 360" tile is
broken, the on-call

engineer needs to find the right component fast and know which team to
page. A small

JSDoc header at the top of `<component>.js` with the owner, entry
points, and tracking

docs makes triage minutes shorter.

**Detection signals:**

- Top of `<component>.js` is `import { LightningElement } from 'lwc';`
with no

preceding comment.

- Components exposed in App Builder (`<isExposed>true</isExposed>`) with
no public

documentation reference.

- A component the team can't identify the owner of from the file alone.

**Bad example:**

```javascript

import { LightningElement, api } from 'lwc';

export default class AccountSummary extends LightningElement { /* ... */
}

```

**Good example:**

```javascript

/**

* Renders the Account 360 summary tile on Account record pages.

*

* @owner Customer-Insights Squad (#ci-eng)

* @targets lightning__RecordPage (Account)

* @runbook https://confluence..com/x/account-360

*/

import { LightningElement, api } from 'lwc';

export default class AccountSummary extends LightningElement { /* ... */
}

```

**References:**
https://architect.salesforce.com/docs/architect/well-architected/guide/easy/maintainable

---

## RULE LWC-GOV-006: Don't use the legacy Aura pubsub pattern for
cross-DOM communication

**Severity:** medium

**Category:** governance

**Applies to:** lwc-js

**Rationale:** The `pubsub.js` Aura-era utility was an unofficial
workaround when LWC

lacked cross-DOM messaging. Lightning Message Service (LMS) is the
platform-supported

replacement: typed channels, security via permission sets, and full LWS
compatibility.

New code should use `lightning/messageService`; the legacy pubsub should
be migrated.

**Detection signals:**

- An LWC importing from `c/pubsub` or a local `pubsub.js`.

- `firePubSub`/`registerListener` calls.

- No `*.messageChannel-meta.xml` file in a codebase that does
cross-component messaging.

**Bad example:**

```javascript

import { fireEvent, registerListener } from 'c/pubsub';

connectedCallback() {

registerListener('accountSelected', this.handleSelect, this);

}

selectAccount(id) { fireEvent(this.pageRef, 'accountSelected', id); }

```

**Good example:**

```javascript

import { subscribe, publish, MessageContext } from
'lightning/messageService';

import ACCOUNT_SELECTED from
'@salesforce/messageChannel/AccountSelected__c';

import { wire } from 'lwc';

@wire(MessageContext) messageContext;

connectedCallback() {

this.subscription = subscribe(this.messageContext, ACCOUNT_SELECTED, msg
=> this.handle(msg));

}

selectAccount(id) { publish(this.messageContext, ACCOUNT_SELECTED, {
recordId: id }); }

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/use-message-channel.html

---

## RULE LWC-GOV-007: Verify Lightning Web Security (LWS) compatibility
for third-party libraries

**Severity:** medium

**Category:** governance

**Applies to:** lwc-js

**Rationale:** Lightning Web Security replaced Lightning Locker as the
default JS

sandbox; some libraries that worked under Locker break under LWS (and
vice versa).

Pulling a new library into the codebase without LWS compatibility
verification produces

runtime errors that only show up after the customer org enables LWS. The
Salesforce LWS

console shows compatibility status; the team must check before adoption.

**Detection signals:**

- A new Static Resource added for a third-party library with no LWS
compatibility note in

the PR.

- Libraries known to be Locker-only (older versions of d3, jQuery
plugins that touch

globals) still in use.

- `eval`/`Function` usage by the library (a strong hint it will fail
under LWS).

**Bad example:**

```javascript

// New PR introduces a Static Resource 'esoteric_lib_v1.js' with no LWS
check

import { loadScript } from 'lightning/platformResourceLoader';

import LIB from '@salesforce/resourceUrl/esoteric_lib_v1';

connectedCallback() { loadScript(this, LIB); }

```

**Good example:**

```javascript

// chart.js v4 is documented LWS-compatible per Salesforce LWS console

import { loadScript } from 'lightning/platformResourceLoader';

import CHART from '@salesforce/resourceUrl/chartjs_4';

// LWS-tested: chartjs 4.4.x verified against LWS console on 2026-04-01

connectedCallback() { loadScript(this, CHART); }

```

**References:**
https://developer.salesforce.com/docs/platform/lightning-components-security/guide/lws-intro.html,
https://developer.salesforce.com/docs/platform/lightning-components-security/guide/lws-third-party.html

---

