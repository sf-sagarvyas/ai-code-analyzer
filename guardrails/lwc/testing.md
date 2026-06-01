
# LWC Testing Rules

LWC tests use Jest via the `@salesforce/sfdx-lwc-jest` runner. Quality
LWC tests cover

rendering, user interaction, event emission, and async data flow. These
rules push

beyond "the component mounts" toward genuine behavioral coverage.

---

## RULE LWC-TEST-001: Co-locate Jest tests in `__tests__` alongside the
component

**Severity:** low

**Category:** testing

**Applies to:** lwc-js

**Rationale:** `sfdx-lwc-jest` discovers tests in a `__tests__` folder
inside each

component directory and uses the filename pattern `<component>.test.js`.
Mis-located or

mis-named tests are silently skipped — coverage looks fine, but real
bugs leak. Keeping

tests next to source also makes coupling between SUT and test obvious
during review.

**Detection signals:**

- A Jest test file outside of any `__tests__` folder.

- A test file named `<component>.spec.js` or `test_<component>.js`
(won't be picked up

by default config).

- A component folder with no `__tests__` at all.

**Bad example:**

```

force-app/main/default/lwc/myComponent/

myComponent.js

myComponent.html

myComponentTest.js // not discovered

```

**Good example:**

```

force-app/main/default/lwc/myComponent/

myComponent.js

myComponent.html

__tests__/

myComponent.test.js

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/unit-testing-using-jest-create-tests.html,
https://github.com/salesforce/sfdx-lwc-jest

---

## RULE LWC-TEST-002: Reset the DOM in `afterEach`

**Severity:** medium

**Category:** testing

**Applies to:** lwc-js

**Rationale:** A single `jsdom` instance is shared by all tests in a
file. If a test

inserts an element into `document.body` and doesn't remove it, the next
test sees that

stale element and may pass/fail nondeterministically. The standard
pattern is to remove

all children of `document.body` in `afterEach`.

**Detection signals:**

- A Jest file that creates elements via `createElement` and appends them
to `document.body`

with no `afterEach` cleanup.

- Tests that intermittently pass/fail (an indicator the harness has
leakage).

- Tests that rely on state created by an earlier test in the same file.

**Bad example:**

```javascript

import { createElement } from 'lwc';

import MyCard from 'c/myCard';

describe('c-my-card', () => {

it('renders 1', () => {

const el = createElement('c-my-card', { is: MyCard });

document.body.appendChild(el);

expect(el.shadowRoot).toBeTruthy();

});

it('renders 2', () => { /* sees the previous element still attached */
});

});

```

**Good example:**

```javascript

import { createElement } from 'lwc';

import MyCard from 'c/myCard';

describe('c-my-card', () => {

afterEach(() => {

while (document.body.firstChild)
document.body.removeChild(document.body.firstChild);

jest.clearAllMocks();

});

it('renders 1', () => { /* ... */ });

it('renders 2', () => { /* ... */ });

});

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/unit-testing-using-jest-create-tests.html,
https://developer.salesforce.com/docs/platform/lwc/guide/unit-testing-using-jest-patterns.html

---

## RULE LWC-TEST-003: Wait for DOM updates with `await
Promise.resolve()` or microtask

**Severity:** high

**Category:** testing

**Applies to:** lwc-js

**Rationale:** LWC re-renders asynchronously after a state change.
Asserting on the DOM

immediately after `el.someProp = 'X'` reads the pre-render DOM and
produces a flaky test.

Returning a resolved promise (or `await Promise.resolve()`) yields the
microtask queue

so the rerender completes before assertions.

**Detection signals:**

- A test that sets a reactive property and then assertions on the DOM in
the same tick.

- Tests with `setTimeout` of N ms used to "wait for render" (race
condition).

- Missing `return Promise.resolve().then(...)` or `await` keyword after
the trigger.

**Bad example:**

```javascript

it('updates label on input', () => {

const el = createElement('c-my-card', { is: MyCard });

document.body.appendChild(el);

el.label = 'New';

expect(el.shadowRoot.querySelector('span').textContent).toBe('New'); //
flaky

});

```

**Good example:**

```javascript

it('updates label on input', async () => {

const el = createElement('c-my-card', { is: MyCard });

document.body.appendChild(el);

el.label = 'New';

await Promise.resolve();

expect(el.shadowRoot.querySelector('span').textContent).toBe('New');

});

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/unit-testing-using-jest-patterns.html

---

## RULE LWC-TEST-004: Mock `@salesforce/apex/...` imports with
`jest.mock`

**Severity:** high

**Category:** testing

**Applies to:** lwc-js

**Rationale:** Jest tests don't connect to a real org, so
`@salesforce/apex/X.Y` must be

mocked. `sfdx-lwc-jest` ships with default mocks but providing your own
per-test mock

implementations is how you simulate success, error, and edge-case
responses for the

component under test.

**Detection signals:**

- A test for a component that imports `@salesforce/apex/...` but has no
`jest.mock`/

`jest.fn()` setup, relying on the default empty stub.

- Tests that never exercise the error branch of an imperative apex call.

- A `__mocks__` folder absent for components that import wired adapters
with custom

return shape.

**Bad example:**

```javascript

import { createElement } from 'lwc';

import MyList from 'c/myList';

it('renders list', async () => {

const el = createElement('c-my-list', { is: MyList });

document.body.appendChild(el);

await Promise.resolve(); // default mock returns undefined - hard to
assert

});

```

**Good example:**

```javascript

import { createElement } from 'lwc';

import MyList from 'c/myList';

import getRows from '@salesforce/apex/AccountController.getRows';

jest.mock('@salesforce/apex/AccountController.getRows',

() => ({ default: jest.fn() }),

{ virtual: true });

it('renders rows from apex', async () => {

getRows.mockResolvedValue([{ Id: '001', Name: 'Acme' }]);

const el = createElement('c-my-list', { is: MyList });

document.body.appendChild(el);

await Promise.resolve();

expect(el.shadowRoot.querySelectorAll('li')).toHaveLength(1);

});

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/unit-testing-using-jest-mock-apex.html,
https://github.com/salesforce/sfdx-lwc-jest

---

## RULE LWC-TEST-005: Use `@salesforce/sfdx-lwc-jest`'s wire adapters
for `@wire` tests

**Severity:** high

**Category:** testing

**Applies to:** lwc-js

**Rationale:** Wired data flows through an adapter interface; to test
how a component

reacts to wire data and errors, emit values into the adapter from the
test. The

`@salesforce/sfdx-lwc-jest` package provides test wire adapters
(`createApexTestWireAdapter`,

`getRecordWireAdapter`, etc.) for this purpose. Without them you cannot
drive the wire

state.

**Detection signals:**

- A component with `@wire(...)` whose tests never call `.emit(...)` on
the adapter.

- Tests that mock the underlying Apex import but not the wire adapter.

- A component whose loading/error states are never asserted.

**Bad example:**

```javascript

// no wire emission - the component never sees data

it('renders', () => {

const el = createElement('c-my-card', { is: MyCard });

document.body.appendChild(el);

});

```

**Good example:**

```javascript

import { createElement } from 'lwc';

import MyCard from 'c/myCard';

import getRow from '@salesforce/apex/AccountController.getRow';

import { createApexTestWireAdapter } from '@salesforce/sfdx-lwc-jest';

jest.mock('@salesforce/apex/AccountController.getRow',

() => ({ default: createApexTestWireAdapter(jest.fn()) }),

{ virtual: true });

it('shows row when wire emits data', async () => {

const el = createElement('c-my-card', { is: MyCard });

document.body.appendChild(el);

getRow.emit({ Id: '001', Name: 'Acme' });

await Promise.resolve();

expect(el.shadowRoot.querySelector('.name').textContent).toBe('Acme');

});

it('shows error when wire emits error', async () => {

const el = createElement('c-my-card', { is: MyCard });

document.body.appendChild(el);

getRow.error({ body: { message: 'nope' } }, 500);

await Promise.resolve();

expect(el.shadowRoot.querySelector('.error')).not.toBeNull();

});

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/unit-testing-using-jest-wire.html,
https://github.com/salesforce/sfdx-lwc-jest

---

## RULE LWC-TEST-006: Assert on custom event dispatch with a Jest
listener

**Severity:** medium

**Category:** testing

**Applies to:** lwc-js

**Rationale:** Components communicate upward via `CustomEvent`. Tests
should verify both

that the right event fires and that its `detail` payload is correct.
Attaching a

`jest.fn()` as an event listener captures invocation, type, and detail
in one assertion.

**Detection signals:**

- A component that dispatches custom events but no test attaches a
listener.

- Tests that assert on internal state changes instead of the event
contract.

- A listener attached but only the call count is asserted, not the
payload.

**Bad example:**

```javascript

it('records user action', () => {

const el = createElement('c-my-btn', { is: MyBtn });

document.body.appendChild(el);

el.shadowRoot.querySelector('button').click();

// no assertion on event - false confidence

});

```

**Good example:**

```javascript

it('dispatches saved with the new id', async () => {

const el = createElement('c-my-btn', { is: MyBtn });

document.body.appendChild(el);

const handler = jest.fn();

el.addEventListener('saved', handler);

el.shadowRoot.querySelector('button').click();

await Promise.resolve();

expect(handler).toHaveBeenCalledTimes(1);

expect(handler.mock.calls[0][0].detail).toEqual({ id: '001' });

});

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/unit-testing-using-jest-patterns.html

---

## RULE LWC-TEST-007: Cover error and empty states, not just the happy
path

**Severity:** medium

**Category:** testing

**Applies to:** lwc-js

**Rationale:** Components have three states: loading, success, error.
Tests that only

cover success let regressions slip in for "no data" placeholders and
error toasts —

states users see most when systems are stressed. For every `@wire`,
exercise data,

error, and undefined (loading) cases.

**Detection signals:**

- Test file with no test referencing `error`, `empty`, or `loading`.

- Wire adapter mocks that only call `.emit(data)`, never `.error(...)`.

- A "show empty state when list is empty" requirement with no test.

**Bad example:**

```javascript

it('renders rows', async () => { /* happy path only */ });

```

**Good example:**

```javascript

describe('c-account-list', () => {

it('renders loading state while wire is pending', () => { /* assert
spinner */ });

it('renders empty state when wire returns []', async () => { /* ... */
});

it('renders rows when wire returns data', async () => { /* ... */ });

it('renders error message when wire emits error', async () => { /* ...
*/ });

});

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/unit-testing-using-jest-patterns.html

---

