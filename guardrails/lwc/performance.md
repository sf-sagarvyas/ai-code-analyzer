
# LWC Performance Rules

LWC runs in a constrained browser environment alongside other components
inside a

Lightning page. A single component that spawns 200 imperative Apex calls
or rerenders

on every keystroke degrades the whole page. These rules cover render
cost, network cost,

lazy loading, and template cost.

---

## RULE LWC-PERF-001: Don't perform expensive work in template-bound
getters

**Severity:** high

**Category:** performance

**Applies to:** lwc-js

**Rationale:** Getters referenced from the template are invoked on every
render — often

many times during a single user interaction. Sorting an array, mapping
over thousands of

rows, or serializing JSON inside a getter compounds into seconds of
jank. Cache the

result in a field that is only recomputed when its inputs change (in a
setter, in

`connectedCallback`, or when assigning to the source field).

**Detection signals:**

- A getter body containing `.sort(`, `.filter(`, `.map(`, `JSON.parse`,
`JSON.stringify`,

`new Date(`, or any loop that iterates more than a handful of times.

- A getter that returns a freshly-allocated array/object on each call
(causes downstream

iteration to think the value changed, triggering unnecessary rerender).

- A getter invoked from inside a `for:each` over many rows.

**Bad example:**

```javascript

import { LightningElement } from 'lwc';

export default class List extends LightningElement {

rawRows = []; // 2000 items

get sortedRows() {

return this.rawRows

.map(r => ({ ...r, label: r.name.toUpperCase() }))

.sort((a, b) => a.label.localeCompare(b.label));

}

}

```

**Good example:**

```javascript

import { LightningElement } from 'lwc';

export default class List extends LightningElement {

_rawRows = [];

sortedRows = [];

@api set rawRows(value) {

this._rawRows = value || [];

this.sortedRows = this._rawRows

.map(r => ({ ...r, label: r.name.toUpperCase() }))

.sort((a, b) => a.label.localeCompare(b.label));

}

get rawRows() { return this._rawRows; }

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/perf-best-practices.html

---

## RULE LWC-PERF-002: Prefer `@wire` over imperative Apex for cacheable
reads

**Severity:** medium

**Category:** performance

**Applies to:** lwc-js

**Rationale:** `@wire` automatically shares its result via the Lightning
Data Service

client-side cache: two components on the same page wiring the same
method with the same

parameters share one network call and one cached result. Imperative
`apex.callMethod()`

always hits the server (unless the method is `cacheable=true` and the
developer

explicitly opts into caching). For pure reads, wire is faster and
cheaper.

**Detection signals:**

- `connectedCallback` containing an imperative Apex call that returns
read-only data and

has no parameters that change post-load.

- Two components in a folder both calling the same imperative `getX()`
instead of wiring.

- A wire converted to imperative "for control" but with no mutation or
special parameter

flow.

**Bad example:**

```javascript

import { LightningElement } from 'lwc';

import getRecent from '@salesforce/apex/AccountController.getRecent';

export default class RecentList extends LightningElement {

rows;

connectedCallback() { getRecent().then(r => { this.rows = r; }); }

}

```

**Good example:**

```javascript

import { LightningElement, wire } from 'lwc';

import getRecent from '@salesforce/apex/AccountController.getRecent';

export default class RecentList extends LightningElement {

@wire(getRecent) wiredRows;

get rows() { return this.wiredRows.data; }

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/apex-result-caching.html,
https://developer.salesforce.com/docs/platform/lwc/guide/apex-wire-method.html

---

## RULE LWC-PERF-003: Lazy-load heavy components and static resources

**Severity:** medium

**Category:** performance

**Applies to:** lwc-js, lwc-html

**Rationale:** A component that always renders a chart library,
rich-text editor, or

modal that the user usually never sees pays the download and parse cost
on every load.

Gate heavy children behind a `lwc:if` that becomes true only when the
user opens the

relevant UI, and load static resources via `loadScript`/`loadStyle` from

`lightning/platformResourceLoader` inside the same gate.

**Detection signals:**

- A heavy third-party component referenced at the top of the template
(always rendered).

- `loadScript(this, RESOURCE_URL)` in `connectedCallback` for a library
used only on

user action.

- Charts, rich-text editors, file viewers always mounted regardless of
state.

**Bad example:**

```html

<template>

<c-rich-chart data={chartData}></c-rich-chart>

<c-rich-editor></c-rich-editor>

<lightning-button label="Edit" onclick={openEditor}></lightning-button>

</template>

```

**Good example:**

```html

<template>

<lightning-button label="View chart"
onclick={toggleChart}></lightning-button>

<template lwc:if={showChart}><c-rich-chart
data={chartData}></c-rich-chart></template>

<lightning-button label="Edit"
onclick={toggleEditor}></lightning-button>

<template lwc:if={showEditor}><c-rich-editor></c-rich-editor></template>

</template>

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/js-third-party-library.html,
https://developer.salesforce.com/docs/platform/lwc/guide/perf-best-practices.html

---

## RULE LWC-PERF-004: Use a stable `key` on `for:each` iterations

**Severity:** medium

**Category:** performance

**Applies to:** lwc-html

**Rationale:** Lightning Web Components require a `key` attribute on the
iterated element

in `for:each` so that the runtime can match items between renders and
avoid recreating

DOM nodes unnecessarily. A `key` derived from the array index makes
every reorder look

like a full replacement; a `key` derived from a stable identifier
(record Id) lets the

runtime move existing nodes.

**Detection signals:**

- `for:each` template directive without a `key` attribute (compile-time
error in modern

LWC, but legacy code can still slip).

- `key={index}` where `index` is `for:index` rather than a stable
record-level field.

- `key={item.timestamp}` or other values that change across renders for
the same logical

item.

**Bad example:**

```html

<template for:each={rows} for:item="row" for:index="i">

<li key={i}>{row.name}</li>

</template>

```

**Good example:**

```html

<template for:each={rows} for:item="row">

<li key={row.id}>{row.name}</li>

</template>

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/reference-directives.html,
https://developer.salesforce.com/docs/platform/lwc/guide/create-lists.html

---

## RULE LWC-PERF-005: Debounce input handlers that fire server calls or
expensive recompute

**Severity:** medium

**Category:** performance

**Applies to:** lwc-js

**Rationale:** A `change` or `input` handler on a `lightning-input`
fires on every

keystroke. If the handler triggers an Apex call or an expensive
transform, every

keystroke pays that cost — flooding the server and producing UI lag.
Debounce by waiting

~250–400 ms of inactivity before running the work.

**Detection signals:**

- `onchange={handleSearch}` whose `handleSearch` directly calls an Apex
method.

- Imperative Apex from `oninput` or `onkeyup` with no
`setTimeout`/`clearTimeout` guard.

- Recomputation of large derived state (sorting/filtering) on every
keystroke.

**Bad example:**

```javascript

import { LightningElement } from 'lwc';

import search from '@salesforce/apex/AccountController.search';

export default class Search extends LightningElement {

results;

handleInput(e) {

search({ term: e.target.value }).then(r => { this.results = r; });

}

}

```

**Good example:**

```javascript

import { LightningElement } from 'lwc';

import search from '@salesforce/apex/AccountController.search';

const WAIT_MS = 300;

export default class Search extends LightningElement {

results;

_timer;

handleInput(e) {

const term = e.target.value;

clearTimeout(this._timer);

this._timer = setTimeout(async () => {

this.results = await search({ term });

}, WAIT_MS);

}

disconnectedCallback() { clearTimeout(this._timer); }

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/perf-best-practices.html

---

## RULE LWC-PERF-006: Use `lightning-datatable` for tabular data over 50
rows

**Severity:** medium

**Category:** performance

**Applies to:** lwc-html, lwc-js

**Rationale:** A custom `<table>` rendered with `for:each` does not
virtualize: 500 rows

produce 500 row components and 500x the column DOM nodes, which slows
initial render and

scroll. `lightning-datatable` (and `lightning-tree-grid`) virtualize
rows and provide

keyboard, accessibility, and sorting out of the box. Reach for custom
HTML only when

datatable cannot meet a specific requirement.

**Detection signals:**

- A custom `<table>`/`<ul>` with `for:each` rendering more than ~50
rows.

- Manual sort/filter/pagination logic the component reimplements.

- Multiple custom inline-editable rows where `lightning-datatable` would
suffice.

**Bad example:**

```html

<table>

<tbody>

<template for:each={rows} for:item="r">

<tr key={r.id}><td>{r.name}</td><td>{r.amount}</td></tr>

</template>

</tbody>

</table>

```

**Good example:**

```html

<lightning-datatable

key-field="id"

data={rows}

columns={columns}>

</lightning-datatable>

```

**References:**
https://developer.salesforce.com/docs/component-library/bundle/lightning-datatable/documentation,
https://developer.salesforce.com/docs/platform/lwc/guide/perf-best-practices.html

---

## RULE LWC-PERF-007: Avoid `lwc:dom="manual"` and direct DOM
manipulation

**Severity:** medium

**Category:** performance

**Applies to:** lwc-js, lwc-html

**Rationale:** Manual DOM manipulation bypasses LWC's reactivity, breaks
under Lightning

Web Security (LWS) sandboxing, and creates accessibility and SSR
hazards. The framework

also re-renders portions of the template; manual nodes you inserted can
be wiped or

duplicated unexpectedly. The only legitimate uses are for third-party
libraries that own

their own subtree (e.g., a chart), and even then the manual subtree
should be small.

**Detection signals:**

- `lwc:dom="manual"` directive in a template.

- `template.querySelector(...).innerHTML = ...` or `appendChild` of a
freshly-created

element.

- `document.createElement(...)` followed by manual insertion into the
component.

**Bad example:**

```html

<template>

<div class="canvas" lwc:dom="manual"></div>

</template>

```

```javascript

renderedCallback() {

const c = this.template.querySelector('.canvas');

c.innerHTML = `<svg>${this.svgString}</svg>`; // bypass reactivity & LWS

}

```

**Good example:**

```html

<template>

<c-svg-chart data={chartData}></c-svg-chart>

</template>

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/reference-directives.html,
https://developer.salesforce.com/docs/platform/lightning-components-security/guide/lws-intro.html

---

## RULE LWC-PERF-008: Preload Apex with `cacheable=true` and reuse via
`getRecord` cache

**Severity:** low

**Category:** performance

**Applies to:** lwc-js, apex-class

**Rationale:** Apex methods used by multiple components on a page should
be marked

`cacheable=true` so the LDS cache shares the result. Without it, each
component fires

its own server call. Combined with `getRecord` for single-record
lookups, this can

reduce server traffic on a record page by an order of magnitude.

**Detection signals:**

- An Apex method called by more than one LWC that lacks `cacheable=true`
despite being a

pure read.

- Two LWCs on the same record page both querying the same field
directly.

- An imperative Apex call that could be a wire to `getRecord`.

**Bad example:**

```apex

@AuraEnabled

public static List<Account> getRecent() { return [SELECT Id, Name FROM
Account]; }

```

**Good example:**

```apex

@AuraEnabled(cacheable=true)

public static List<Account> getRecent() {

return [SELECT Id, Name FROM Account WITH USER_MODE ORDER BY CreatedDate
DESC LIMIT 50];

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/apex-result-caching.html

---

