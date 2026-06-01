
# LWC Reactivity Rules

Reactivity is how LWC decides when to re-render. Misuse — mutating
fields without

triggering rerender, abusing `@track`, or chaining stale `@wire` calls —
produces UIs

that look fine in isolation and fail in production under realistic state
changes. These

rules enforce the modern LWC reactivity contract.

---

## RULE LWC-REACT-001: Use `lwc:if`/`lwc:elseif`/`lwc:else` for
conditional rendering

**Severity:** medium

**Category:** reactivity

**Applies to:** lwc-html

**Rationale:** The legacy `if:true`/`if:false` directives are no longer
recommended and

Salesforce has announced they may be removed in a future release. The
modern `lwc:if`

family evaluates getters only once per instance, supports `lwc:elseif`
and `lwc:else`,

and matches JavaScript control-flow semantics. They are also more
performant for chained

conditions.

**Detection signals:**

- `if:true={...}` or `if:false={...}` directives in template files.

- Chains of sibling `if:true`/`if:false` that should be `lwc:elseif`.

- Mixing of `if:true` and `lwc:if` on adjacent elements (not allowed in
one template).

**Bad example:**

```html

<template>

<template if:true={isLoading}><div>Loading...</div></template>

<template if:false={isLoading}><div>{data}</div></template>

</template>

```

**Good example:**

```html

<template>

<template lwc:if={isLoading}><div>Loading...</div></template>

<template lwc:else><div>{data}</div></template>

</template>

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/reference-directives.html,
https://developer.salesforce.com/docs/platform/lwc/guide/create-conditional.html

---

## RULE LWC-REACT-002: Prefer getters over @track for derived state

**Severity:** medium

**Category:** reactivity

**Applies to:** lwc-js

**Rationale:** LWC tracks reads of class fields automatically; you do
not need `@track`

unless the field holds an object whose internal properties (not the
reference itself)

change. For derived values (`fullName` from `firstName + lastName`), a
getter recomputes

on each render and stays in sync with the source fields automatically.
Storing derived

state in a separate field forces manual recomputation and invites drift.

**Detection signals:**

- `@track` on a primitive field (string, number, boolean) — primitive
reactivity is

automatic without `@track`.

- Two `@track` fields where one is computed from the other.

- `setX()` helper methods that exist solely to keep two fields in sync.

**Bad example:**

```javascript

import { LightningElement, track } from 'lwc';

export default class NameCard extends LightningElement {

@track firstName = '';

@track lastName = '';

@track fullName = '';

handleFirst(e) { this.firstName = e.target.value; this.updateFull(); }

handleLast(e) { this.lastName = e.target.value; this.updateFull(); }

updateFull() { this.fullName = `${this.firstName}
${this.lastName}`.trim(); }

}

```

**Good example:**

```javascript

import { LightningElement } from 'lwc';

export default class NameCard extends LightningElement {

firstName = '';

lastName = '';

get fullName() { return `${this.firstName} ${this.lastName}`.trim(); }

handleFirst(e) { this.firstName = e.target.value; }

handleLast(e) { this.lastName = e.target.value; }

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/reactivity-track.html,
https://developer.salesforce.com/docs/platform/lwc/guide/js-props-fields.html

---

## RULE LWC-REACT-003: Apply `@track` only when mutating object/array
internals

**Severity:** medium

**Category:** reactivity

**Applies to:** lwc-js

**Rationale:** Mutating a property inside an object (`this.user.name =
'X'`) does not

trigger a re-render unless the field is annotated with `@track` or you
replace the

reference (`this.user = { ...this.user, name: 'X' }`). The modern,
idiomatic pattern is

to treat state as immutable and reassign, which works without `@track`.
Use `@track`

deliberately when the data structure is large and reassignment is
impractical.

**Detection signals:**

- `this.something.nested = value;` patterns when `something` is not
`@track`-ed and not

reassigned.

- Heavy use of `@track` on every field (suggests the author copied a
pattern without

understanding it).

- `array.push(...)`/`array.splice(...)` on a non-tracked array.

**Bad example:**

```javascript

import { LightningElement } from 'lwc';

export default class TodoList extends LightningElement {

items = [];

addItem(text) {

this.items.push({ id: Date.now(), text }); // no re-render

}

}

```

**Good example:**

```javascript

import { LightningElement } from 'lwc';

export default class TodoList extends LightningElement {

items = [];

addItem(text) {

// Reassigning the reference triggers reactivity

this.items = [...this.items, { id: Date.now(), text }];

}

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/reactivity-track.html

---

## RULE LWC-REACT-004: `@wire` Apex methods must be cacheable; mutations
go imperative

**Severity:** high

**Category:** reactivity

**Applies to:** lwc-js, apex-class

**Rationale:** `@wire` requires `@AuraEnabled(cacheable=true)` on the
Apex method, which

makes the method read-only on the server. Trying to wire a method that
performs DML

either fails to compile (cacheable=true blocks DML) or produces stale UI
because the

client cache returns yesterday's value. Mutations (create/update/delete)
must use

imperative calls, and after the mutation the component should refresh
via

`refreshApex(wiredResult)` or `notifyRecordUpdateAvailable`.

**Detection signals:**

- An LWC `@wire(apexMethod)` referencing an Apex method without
`cacheable=true`.

- An `@AuraEnabled(cacheable=true)` method that performs DML or
callouts.

- A component that wires data but never calls `refreshApex` after a
related mutation.

**Bad example:**

```javascript

// LWC

import { LightningElement, wire } from 'lwc';

import save from '@salesforce/apex/AccountController.save';

export default class AccountEditor extends LightningElement {

@wire(save, { name: '$name' }) result; // wires a DML method - wrong

}

```

```apex

public with sharing class AccountController {

@AuraEnabled(cacheable=true)

public static Id save(String name) { // cacheable=true forbids DML

Account a = new Account(Name = name);

insert a;

return a.Id;

}

}

```

**Good example:**

```javascript

import { LightningElement, wire } from 'lwc';

import { refreshApex } from '@salesforce/apex';

import getRecent from '@salesforce/apex/AccountController.getRecent';

import save from '@salesforce/apex/AccountController.save';

export default class AccountEditor extends LightningElement {

@wire(getRecent) wiredAccounts;

async handleSave(event) {

await save({ name: event.detail.name });

await refreshApex(this.wiredAccounts);

}

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/apex-result-caching.html,
https://developer.salesforce.com/docs/platform/lwc/guide/apex-wire-method.html

---

## RULE LWC-REACT-005: Use Lightning Data Service when reading single
records

**Severity:** medium

**Category:** reactivity

**Applies to:** lwc-js

**Rationale:** `getRecord`/`getRecords`/`updateRecord` from
`lightning/uiRecordApi` are

the preferred way to read and write single records. They participate in
a shared

client-side cache that other components see automatically, enforce FLS
on the client

without custom Apex, and benefit from automatic cache invalidation when
the record

changes via any path. Custom `@AuraEnabled` Apex for a single-record
read is more code

and weaker semantics.

**Detection signals:**

- A custom `@AuraEnabled(cacheable=true)` Apex method that returns
`[SELECT ... FROM X WHERE Id = :recordId LIMIT 1]`.

- A component reading one field of one record via custom Apex instead of
`getRecord`.

- Manual cache invalidation logic that `getRecord` would handle
automatically.

**Bad example:**

```javascript

import { LightningElement, api, wire } from 'lwc';

import getAcct from '@salesforce/apex/AccountController.getAcct';

export default class AccountName extends LightningElement {

@api recordId;

@wire(getAcct, { id: '$recordId' }) acct;

}

```

**Good example:**

```javascript

import { LightningElement, api, wire } from 'lwc';

import { getRecord, getFieldValue } from 'lightning/uiRecordApi';

import NAME_FIELD from '@salesforce/schema/Account.Name';

export default class AccountName extends LightningElement {

@api recordId;

@wire(getRecord, { recordId: '$recordId', fields: [NAME_FIELD] })
record;

get name() { return getFieldValue(this.record.data, NAME_FIELD); }

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/data-ui-api.html,
https://developer.salesforce.com/docs/platform/lwc/guide/data-wire-service-about.html

---

## RULE LWC-REACT-006: Don't mutate wired data; copy first

**Severity:** high

**Category:** reactivity

**Applies to:** lwc-js

**Rationale:** Data returned to a `@wire` is read-only frozen. Trying to
mutate it

throws in strict mode ("Cannot assign to read only property") or
silently fails in

older runtimes. Components that want to display a transformed view must
copy the data

into local state.

**Detection signals:**

- Direct property writes to `this.wiredX.data` or items returned by the
wire adapter.

- `wiredResult.data.forEach(r => r.x = ...)`.

- Spread copy missing for derived display (`this.rows =
this.wiredAccounts.data` instead

of `this.rows = [...this.wiredAccounts.data]`).

**Bad example:**

```javascript

@wire(getAccounts) wiredAccounts;

get rows() {

this.wiredAccounts.data.forEach(a => { a.label = a.Name.toUpperCase();
}); // throws

return this.wiredAccounts.data;

}

```

**Good example:**

```javascript

@wire(getAccounts) wiredAccounts;

get rows() {

return (this.wiredAccounts.data || []).map(a => ({ ...a, label:
a.Name.toUpperCase() }));

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/apex-wire-method.html,
https://developer.salesforce.com/docs/platform/lwc/guide/data-immutable.html

---

## RULE LWC-REACT-007: Use reactive parameters (`$prop`) in `@wire` for
parameter changes

**Severity:** medium

**Category:** reactivity

**Applies to:** lwc-js

**Rationale:** A `@wire` with hard-coded parameters fires once. To
re-fire when an `@api`

property or local field changes, prefix the parameter name with `$`. A
common bug is

wiring on initial load and then wondering why the data does not update
when the user

selects a different value — the parameter was not reactive.

**Detection signals:**

- `@wire(apexMethod, { id: this.recordId })` — `this.recordId` evaluates
once at

declaration time.

- `@wire(getX, { type: 'static-string' })` paired with code that calls
`refreshApex`

when the type changes (could be `'$type'`).

- An `@api` setter that manually calls a non-wire imperative apex on
every change.

**Bad example:**

```javascript

@api accountId;

@wire(getOpps, { accountId: this.accountId }) opps; // fires once with
undefined

```

**Good example:**

```javascript

@api accountId;

@wire(getOpps, { accountId: '$accountId' }) opps; // re-fires when
accountId changes

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/data-wire-config.html,
https://developer.salesforce.com/docs/platform/lwc/guide/apex-wire-method.html

---

## RULE LWC-REACT-008: Use `connectedCallback`, not constructor, for
data fetching

**Severity:** medium

**Category:** reactivity

**Applies to:** lwc-js

**Rationale:** The constructor runs before the element is inserted into
the DOM and

before `@api` properties are set. Fetching data there leads to calls
with `undefined`

parameters and (since the component is not yet connected) makes it
impossible to

dispatch events. `connectedCallback` runs after insertion and after
`@api` properties

are set on first render.

**Detection signals:**

- `constructor()` body containing `import`-ed function invocations
(other than `super()`).

- Imperative Apex calls or `fetch()` calls in the constructor.

- Side-effecting initialization in the constructor that depends on
`@api` props.

**Bad example:**

```javascript

import { LightningElement, api } from 'lwc';

import load from '@salesforce/apex/X.load';

export default class C extends LightningElement {

@api recordId;

constructor() {

super();

load({ id: this.recordId }); // recordId is undefined here

}

}

```

**Good example:**

```javascript

import { LightningElement, api } from 'lwc';

import load from '@salesforce/apex/X.load';

export default class C extends LightningElement {

@api recordId;

data;

connectedCallback() {

load({ id: this.recordId }).then(r => { this.data = r; });

}

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/create-lifecycle-hooks-dom.html,
https://developer.salesforce.com/docs/platform/lwc/guide/create-lifecycle-hooks.html

---

## RULE LWC-REACT-009: Don't set reactive state inside renderedCallback

**Severity:** high

**Category:** reactivity

**Applies to:** lwc-js

**Rationale:** `renderedCallback` runs after every render. Mutating a
reactive field

inside it re-triggers render, which calls `renderedCallback` again — an
infinite loop

that pegs the user's CPU. If you must do post-render work that depends
on reactive

state, guard it with a flag that you only flip back on a real external
trigger.

**Detection signals:**

- `renderedCallback() { this.x = ...; }` setting any field referenced in
the template.

- A boolean `hasRendered` flag that is set on first call but missing —
the canonical

guard pattern.

- `querySelector` inside `renderedCallback` whose result is then stored
on `this.`.

**Bad example:**

```javascript

renderedCallback() {

this.height = this.template.querySelector('.box').offsetHeight; //
infinite loop

}

```

**Good example:**

```javascript

hasMeasured = false;

renderedCallback() {

if (this.hasMeasured) return;

const box = this.template.querySelector('.box');

if (box) {

this.height = box.offsetHeight;

this.hasMeasured = true;

}

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/create-lifecycle-hooks.html

---

## RULE LWC-REACT-010: Clean up subscriptions and listeners in
disconnectedCallback

**Severity:** high

**Category:** reactivity

**Applies to:** lwc-js

**Rationale:** A component that subscribes to a platform event, a
Lightning Message

Service channel, or `window`/`document` listener but does not
unsubscribe leaks memory

and continues firing handlers after the component is gone — sometimes
invoking methods

on a disposed component, which throws. `disconnectedCallback` is the
mirror of

`connectedCallback` and must release everything connected acquired.

**Detection signals:**

- `subscribe(...)` from `lightning/empApi`, `lightning/messageService`,
or `pubsub` with

no matching `unsubscribe` in `disconnectedCallback`.

- `window.addEventListener` / `document.addEventListener` with no
`removeEventListener`.

- `setInterval` / `setTimeout` retained in instance state with no
`clearInterval`.

**Bad example:**

```javascript

connectedCallback() {

this.handler = e => this.onResize(e);

window.addEventListener('resize', this.handler);

}

```

**Good example:**

```javascript

connectedCallback() {

this.handler = e => this.onResize(e);

window.addEventListener('resize', this.handler);

}

disconnectedCallback() {

window.removeEventListener('resize', this.handler);

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/create-lifecycle-hooks-dom.html,
https://developer.salesforce.com/docs/platform/lwc/guide/use-events-pubsub.html

---

