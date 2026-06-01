
# LWC Accessibility Rules

Salesforce platform components conform to WCAG 2.1 AA out of the box.
Custom LWCs can

introduce regressions: missing labels, broken focus flow, color-only
state, illegal ARIA.

These rules catch the highest-impact accessibility issues in custom
component code.

---

## RULE LWC-A11Y-001: Every form input must have a programmatic label

**Severity:** high

**Category:** accessibility

**Applies to:** lwc-html

**Rationale:** Screen readers announce a control by reading its
accessible name. A

`lightning-input` with no `label` or `aria-label` is announced as "edit"
or "combo box"

with no context. Visible labels (`label="..."`) are preferred; if the
design hides the

text label, use `variant="label-hidden"` so the label is still in the
accessibility tree.

**Detection signals:**

- `lightning-input`, `lightning-combobox`, `lightning-textarea`,
`lightning-checkbox` with

no `label` attribute.

- Native `<input>`, `<select>`, `<textarea>` with no associated `<label
for="...">` and

no `aria-label`/`aria-labelledby`.

- `label=""` (empty string).

**Bad example:**

```html

<template>

<lightning-input type="text" value={name}></lightning-input>

<input type="email" value={email} onchange={handleEmail}>

</template>

```

**Good example:**

```html

<template>

<lightning-input label="Account name" type="text"
value={name}></lightning-input>

<label for="email-input">Contact email</label>

<input id="email-input" type="email" value={email}
onchange={handleEmail}>

</template>

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/create-components-accessibility.html,
https://www.lightningdesignsystem.com/accessibility/overview/

---

## RULE LWC-A11Y-002: Use semantic HTML elements before reaching for
ARIA

**Severity:** medium

**Category:** accessibility

**Applies to:** lwc-html

**Rationale:** A `<button>` is keyboard-operable, has correct ARIA role,
fires `click` on

Enter/Space, and works with screen readers out of the box. A `<div
onclick>` with

`role="button"` and `tabindex="0"` reimplements those behaviors poorly.
The first rule of

ARIA is "don't use ARIA when a native element will do." This avoids
regressions when the

LWC runtime updates ARIA handling.

**Detection signals:**

- `<div>`, `<span>`, or `<a>` elements with an `onclick` handler that
should be a

`<button>` or `<lightning-button>`.

- `role="button"` paired with a non-button element.

- `tabindex="0"` on a `<div>` that captures keyboard input.

**Bad example:**

```html

<div class="my-btn" onclick={handleSave} role="button"
tabindex="0">Save</div>

```

**Good example:**

```html

<lightning-button label="Save" onclick={handleSave}></lightning-button>

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/create-components-accessibility-attributes.html,
https://www.lightningdesignsystem.com/accessibility/overview/

---

## RULE LWC-A11Y-003: Don't communicate state through color alone

**Severity:** medium

**Category:** accessibility

**Applies to:** lwc-html, lwc-js

**Rationale:** WCAG 1.4.1 ("Use of Color") requires that color not be
the only means of

conveying information. A "red" row signalling error is invisible to
color-blind users

and screen readers. Pair color with a text label, icon, or hidden helper
text.

**Detection signals:**

- `class="error-row"` or similar on a row with no text/icon indicator.

- `style="color:red"` on a span that is the only error indicator.

- Status pill components (`lightning-badge`) where only the color
variant differs.

**Bad example:**

```html

<template for:each={rows} for:item="r">

<li key={r.id} class={r.statusClass}>{r.name}</li>

</template>

```

**Good example:**

```html

<template for:each={rows} for:item="r">

<li key={r.id} class={r.statusClass}>

<lightning-icon icon-name={r.iconName} alternative-text={r.statusLabel}
size="x-small"></lightning-icon>

{r.name} <span class="slds-assistive-text">({r.statusLabel})</span>

</li>

</template>

```

**References:** https://www.w3.org/TR/WCAG21/#use-of-color,
https://www.lightningdesignsystem.com/accessibility/overview/

---

## RULE LWC-A11Y-004: Maintain a logical focus order and visible focus

**Severity:** medium

**Category:** accessibility

**Applies to:** lwc-html, lwc-js

**Rationale:** Keyboard users navigate by Tab order. Custom `tabindex`
values (especially

positive ones) override the natural order and produce confusing flows.
Removing the

default focus outline (`outline: none`) makes the focused element
invisible to keyboard

users. Either preserve the default outline or replace it with an
equivalent visible

indicator.

**Detection signals:**

- `tabindex="1"` (or any positive value) — only `0` and `-1` should
appear.

- CSS `outline: none` on focusable elements without a replacement style.

- A modal that does not move focus into itself on open.

**Bad example:**

```html

<button tabindex="3" onclick={save}>Save</button>

<button tabindex="1" onclick={cancel}>Cancel</button>

```

```css

.my-btn:focus { outline: none; }

```

**Good example:**

```html

<button onclick={save}>Save</button>

<button onclick={cancel}>Cancel</button>

```

```css

.my-btn:focus { outline: 2px solid var(--lwc-brandPrimary);
outline-offset: 2px; }

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/create-components-accessibility.html,
https://www.lightningdesignsystem.com/accessibility/overview/

---

## RULE LWC-A11Y-005: Provide alt text for decorative vs informative
images

**Severity:** medium

**Category:** accessibility

**Applies to:** lwc-html

**Rationale:** Informative images need descriptive `alt` text;
decorative images need

`alt=""` (empty) so screen readers skip them. `lightning-icon` uses
`alternative-text`

to mark whether the icon is informative; if it is purely decorative,
omit

`alternative-text` (or set it to empty) so screen readers ignore it.

**Detection signals:**

- `<img>` tag without `alt` attribute.

- `<img alt={someExpression}>` where the expression can be
null/undefined.

- `lightning-icon` representing meaningful state with no
`alternative-text`.

**Bad example:**

```html

<img src="/img/logo.png">

<lightning-icon icon-name="utility:warning"></lightning-icon>

```

**Good example:**

```html

<img src="/img/logo.png" alt=""> <!-- decorative; immediately followed
by text -->

<lightning-icon icon-name="utility:warning"

alternative-text="Action required: review the form"></lightning-icon>

```

**References:**
https://developer.salesforce.com/docs/component-library/bundle/lightning-icon/documentation,
https://www.lightningdesignsystem.com/accessibility/overview/

---

## RULE LWC-A11Y-006: Test accessibility automatically with @sa11y/jest

**Severity:** medium

**Category:** accessibility

**Applies to:** lwc-js

**Rationale:** Salesforce open-sourced `@sa11y/jest`, a Jest matcher
that runs `axe-core`

against rendered LWCs. Adding `await expect(element).toBeAccessible();`
to component

tests catches missing labels, color contrast issues, and broken ARIA at
commit time —

much cheaper than retrofitting after a customer complaint.

**Detection signals:**

- A Jest test file that renders the component and exercises behavior but
never calls

`toBeAccessible()`.

- A component that renders forms or interactive widgets with no a11y
test at all.

- A `package.json` that does not depend on `@sa11y/jest`.

**Bad example:**

```javascript

import { createElement } from 'lwc';

import MyForm from 'c/myForm';

describe('MyForm', () => {

it('renders the form', () => {

const el = createElement('c-my-form', { is: MyForm });

document.body.appendChild(el);

expect(el.shadowRoot.querySelector('lightning-input')).not.toBeNull();

});

});

```

**Good example:**

```javascript

import { createElement } from 'lwc';

import MyForm from 'c/myForm';

import { setSa11yConfig } from '@sa11y/jest';

describe('MyForm', () => {

it('renders and is accessible', async () => {

const el = createElement('c-my-form', { is: MyForm });

document.body.appendChild(el);

await expect(el).toBeAccessible();

});

});

```

**References:**
https://developer.salesforce.com/blogs/2020/10/automated-accessibility-testing-with-sa11y,
https://github.com/salesforce/sa11y

---

