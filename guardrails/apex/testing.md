
# Apex Testing Rules

Apex tests are required for deployment (75% org-level coverage minimum)
but coverage alone

is a poor quality signal. These rules push tests toward genuine
behavioral validation:

real assertions, bulk inputs, isolation from org data, and use of the
Stub API or

dependency injection for mocking external systems.

---

## RULE APEX-TEST-001: Every test method must contain at least one
assertion

**Severity:** high

**Category:** testing

**Applies to:** apex-class

**Rationale:** A test without assertions covers code (and counts toward
the 75% deployment

gate) but verifies nothing. A regression that changes behavior — wrong
field, wrong value,

silent exception — will pass an assertion-free test. PMD's
`ApexUnitTestClassShouldHaveAsserts`

flags this; the platform itself does not.

**Detection signals:**

- An `@isTest` method whose body contains no `System.assert`,
`System.assertEquals`,

`System.assertNotEquals`, `Assert.areEqual`, `Assert.fail`, or similar.

- A test method that only exercises the SUT and reads its return value
into a variable

without comparison.

- A test that ends with `Test.stopTest()` and nothing afterward.

**Bad example:**

```apex

@isTest

private class AccountServiceTest {

@isTest static void itCreatesAccount() {

Test.startTest();

AccountService.create('Acme');

Test.stopTest();

}

}

```

**Good example:**

```apex

@isTest

private class AccountServiceTest {

@isTest static void itCreatesAccount() {

Test.startTest();

Id created = AccountService.create('Acme');

Test.stopTest();

Account result = [SELECT Id, Name FROM Account WHERE Id = :created];

Assert.areEqual('Acme', result.Name, 'Expected account name to be set');

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_code_coverage_best_pract.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#apexunittestclassshouldhaveasserts

---

## RULE APEX-TEST-002: Assertions must include a message argument

**Severity:** medium

**Category:** testing

**Applies to:** apex-class

**Rationale:** When a test fails in CI, the failure message is the only
context the reader

has. `Assert.areEqual(5, count);` produces "Expected 5 but was 3" — the
reader has to dig

into the test code to understand what `count` represents.
`Assert.areEqual(5, count,

'Expected 5 escalated cases after running router');` makes the failure
self-explanatory.

**Detection signals:**

- `System.assert(`, `System.assertEquals(`, `System.assertNotEquals(`,
`Assert.areEqual(`,

`Assert.areNotEqual(`, `Assert.isTrue(`, `Assert.isFalse(`,
`Assert.isNull(`,

`Assert.isNotNull(` called with fewer arguments than the version that
includes a message.

**Bad example:**

```apex

Assert.areEqual(3, results.size());

Assert.isTrue(account.IsActive__c);

```

**Good example:**

```apex

Assert.areEqual(3, results.size(), 'Expected three open cases after
escalation run');

Assert.isTrue(account.IsActive__c, 'Account should remain active after
profile change');

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#apexassertionsshouldincludemessage,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_assert.htm

---

## RULE APEX-TEST-003: Do not use `@isTest(SeeAllData=true)`

**Severity:** high

**Category:** testing

**Applies to:** apex-class

**Rationale:** `SeeAllData=true` makes the test depend on whatever data
happens to exist

in the org. The test will pass in a fresh sandbox and fail in production
(or vice versa),

fail after data archival, fail after a refresh, and behave
non-deterministically when

multiple tests run in parallel. Tests must construct their own data.

**Detection signals:**

- `@isTest(SeeAllData=true)` on a class or method.

- `Test.setMock` or `Test.startTest` paired with queries that assume
specific live records

exist.

**Bad example:**

```apex

@isTest(SeeAllData=true)

private class ReportingTest {

@isTest static void itHandlesExistingAccounts() {

List<Account> existing = [SELECT Id FROM Account LIMIT 100];

Assert.isFalse(existing.isEmpty(), 'should have accounts');

}

}

```

**Good example:**

```apex

@isTest

private class ReportingTest {

@TestSetup static void setup() {

List<Account> accts = new List<Account>();

for (Integer i = 0; i < 5; i++) { accts.add(new Account(Name = 'Acct ' +
i)); }

insert accts;

}

@isTest static void itHandlesExistingAccounts() {

List<Account> existing = [SELECT Id FROM Account];

Assert.areEqual(5, existing.size(), 'expected five seeded accounts');

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_annotation_isTest.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#apexunittestshouldnotuseseealldatatrue

---

## RULE APEX-TEST-004: Use `Test.startTest()`/`Test.stopTest()` around
the SUT call

**Severity:** medium

**Category:** testing

**Applies to:** apex-class

**Rationale:** Code between `Test.startTest()` and `Test.stopTest()`
runs in a fresh

governor-limit context, allowing the test to provoke and observe
limit-boundary behavior

in async code. `Test.stopTest()` also synchronously executes queued
queueable, batch, and

future jobs, which is the only way to assert on their side effects in a
test.

**Detection signals:**

- A test method that enqueues a queueable or executes a batch without
`Test.startTest`/

`Test.stopTest` bracketing it.

- Setup data construction inside `Test.startTest`/`Test.stopTest`
(consumes the test's

fresh limits).

- Multiple `Test.startTest`/`Test.stopTest` pairs in a single method
(only one is allowed).

**Bad example:**

```apex

@isTest static void itRunsAsync() {

Account a = new Account(Name='X'); insert a;

System.enqueueJob(new AccountWorker(a.Id));

Account result = [SELECT Id, Status__c FROM Account WHERE Id = :a.Id];

Assert.areEqual('Processed', result.Status__c, 'worker should have set
status');

}

```

**Good example:**

```apex

@isTest static void itRunsAsync() {

Account a = new Account(Name='X'); insert a;

Test.startTest();

System.enqueueJob(new AccountWorker(a.Id));

Test.stopTest();

Account result = [SELECT Id, Status__c FROM Account WHERE Id = :a.Id];

Assert.areEqual('Processed', result.Status__c, 'worker should have set
status');

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_methods_system_test.htm

---

## RULE APEX-TEST-005: Test bulk operations with at least 200 records

**Severity:** high

**Category:** testing

**Applies to:** apex-class

**Rationale:** Triggers fire in chunks of 200; many bulk-safety bugs
only surface when

the chunk size matches or exceeds the bulkification mistake (SOQL/DML in
loop, untracked

state). Single-record tests pass while bulk inserts in production fail
with `LimitException`.

Salesforce's official Bulk Apex Triggers Trailhead recommends 200
records as the

de-minimis bulk test.

**Detection signals:**

- A test inserting/updating exactly one record before calling SUT code
that is documented

as bulk-safe.

- A test class with no method that processes 200+ records.

- A handler method covered only by single-record tests.

**Bad example:**

```apex

@isTest static void itProcessesAccounts() {

insert new Account(Name='One');

Test.startTest();

AccountService.process([SELECT Id FROM Account]);

Test.stopTest();

}

```

**Good example:**

```apex

@isTest static void itProcessesAccountsInBulk() {

List<Account> accts = new List<Account>();

for (Integer i = 0; i < 200; i++) { accts.add(new Account(Name='Acct ' +
i)); }

insert accts;

Test.startTest();

AccountService.process([SELECT Id FROM Account]);

Test.stopTest();

Assert.areEqual(200, [SELECT COUNT() FROM Account WHERE Processed__c =
true],

'expected all 200 accounts to be marked processed');

}

```

**References:**
https://trailhead.salesforce.com/content/learn/modules/apex_triggers/bulk_apex_triggers,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_code_coverage_best_pract.htm

---

## RULE APEX-TEST-006: Cover the negative path with `Assert.fail` +
`try/catch`

**Severity:** medium

**Category:** testing

**Applies to:** apex-class

**Rationale:** Tests that only cover the happy path miss failure modes:
validation errors,

permission denials, network timeouts. A negative-path test asserts that
the SUT throws

the expected exception type and contains a useful message —
`Assert.fail` placed in the

`try` block ensures the test fails loudly if the exception is not
thrown.

**Detection signals:**

- A service method that throws but has no test that triggers the throw
branch.

- `try { ... } catch (Exception e) {}` in a test with no assertions in
`catch`.

- A test class with only one method per service method (no negative
variants).

**Bad example:**

```apex

@isTest static void itValidatesPositiveAmount() {

try { OrderService.place(new Order__c(Amount__c = -1)); }

catch (Exception e) { /* swallowed */ }

}

```

**Good example:**

```apex

@isTest static void itRejectsNegativeAmount() {

try {

OrderService.place(new Order__c(Amount__c = -1));

Assert.fail('Expected OrderException for negative amount');

} catch (OrderException e) {

Assert.isTrue(e.getMessage().contains('positive'),

'Exception message should explain the rule, got: ' + e.getMessage());

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_assert.htm

---

## RULE APEX-TEST-007: Mock HTTP callouts via `Test.setMock` and
`HttpCalloutMock`

**Severity:** high

**Category:** testing

**Applies to:** apex-class

**Rationale:** Apex tests cannot make real callouts; the platform throws

`CalloutException: You have uncommitted work pending` or simply refuses.
A class

implementing `HttpCalloutMock` + `Test.setMock(HttpCalloutMock.class,
mock)` lets the

test drive deterministic responses including error codes. Avoid stubbing
only happy

responses — include 4xx, 5xx, and timeout cases.

**Detection signals:**

- A test method that exercises code calling `Http.send` without
registering a mock.

- A custom mock that only returns HTTP 200.

- `@TestVisible` static booleans like `isTestMode` used to short-circuit
the callout —

prefer a real mock so the request building is also tested.

**Bad example:**

```apex

@isTest static void itCallsApi() {

Test.startTest();

BillingClient.charge(10); // no mock registered: throws at runtime

Test.stopTest();

}

```

**Good example:**

```apex

@isTest static void itHandlesHttp500() {

Test.setMock(HttpCalloutMock.class, new BillingMock(500,
'{"error":"boom"}'));

Test.startTest();

try {

BillingClient.charge(10);

Assert.fail('Expected BillingException on 500');

} catch (BillingException e) {

Assert.isTrue(e.getMessage().contains('boom'), 'message preserves API
detail');

}

Test.stopTest();

}

private class BillingMock implements HttpCalloutMock {

Integer status; String body;

BillingMock(Integer s, String b) { status = s; body = b; }

public HttpResponse respond(HttpRequest req) {

HttpResponse r = new HttpResponse();

r.setStatusCode(status); r.setBody(body); return r;

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_callouts_http_testing_httpcalloutmock.htm

---

## RULE APEX-TEST-008: Use `Test.createStub` / Stub API to mock service
collaborators

**Severity:** medium

**Category:** testing

**Applies to:** apex-class

**Rationale:** Tests that exercise a service through its real
selector/queueable

collaborator must construct elaborate fixture data and become slow and
brittle. The Apex

Stub API (`System.StubProvider`, `Test.createStub`) returns a fake
implementation of any

non-final class, letting the test isolate the SUT. This is the standard
approach for unit

testing service logic in fflib-style architectures.

**Detection signals:**

- A test that inserts dozens of records and queries them back just to
provide input to a

service method.

- Static-method calls like `Selector.find(...)` with no seam for mocking
(selector should

be instance-method with `Test.createStub` mockability).

- Reliance on `@TestVisible` setters as a substitute for proper mocking.

**Bad example:**

```apex

@isTest static void itAggregates() {

// 50 lines of insert statements to set up state...

Test.startTest();

Decimal total = OpportunityService.summarize(new Set<Id>{ ...the
inserted ids... });

Test.stopTest();

Assert.areEqual(500, total, 'sum');

}

```

**Good example:**

```apex

@isTest static void itAggregates() {

OpportunitiesSelector mock = (OpportunitiesSelector) Test.createStub(

OpportunitiesSelector.class, new SelectorStub(new List<Opportunity>{

new Opportunity(Amount = 200), new Opportunity(Amount = 300)

})

);

Test.startTest();

Decimal total = new OpportunityService(mock).summarize(new Set<Id>{});

Test.stopTest();

Assert.areEqual(500, total, 'sum of mocked opps');

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_testing_stub_api.htm,
https://blog.beyondthecloud.dev/blog/salesforce-mock-in-apex-tests

---

## RULE APEX-TEST-009: Use `@TestSetup` to seed shared test data

**Severity:** medium

**Category:** testing

**Applies to:** apex-class

**Rationale:** A `@TestSetup` method runs once per test class and is
rolled back at the

end. Records inserted there are available to every test method without
re-running the

setup, making the class faster and more readable. Without it, every
method repeats the

same fixture construction, slowing the suite and inviting copy-paste
drift.

**Detection signals:**

- Multiple `@isTest` methods that each insert the same fixture records.

- A test class with no `@TestSetup` method but a clear setup pattern
repeated.

- A `private static void setupData()` helper called manually from each
test method.

**Bad example:**

```apex

@isTest private class CaseRouterTest {

@isTest static void it1() { Account a = new Account(Name='X'); insert a;
/* ... */ }

@isTest static void it2() { Account a = new Account(Name='X'); insert a;
/* ... */ }

@isTest static void it3() { Account a = new Account(Name='X'); insert a;
/* ... */ }

}

```

**Good example:**

```apex

@isTest private class CaseRouterTest {

@TestSetup static void seed() { insert new Account(Name='X'); }

@isTest static void it1() { Account a = [SELECT Id FROM Account LIMIT
1]; /* ... */ }

@isTest static void it2() { Account a = [SELECT Id FROM Account LIMIT
1]; /* ... */ }

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_testing_testsetup_using.htm

---

## RULE APEX-TEST-010: Run protected code as the right user via
`System.runAs`

**Severity:** medium

**Category:** testing

**Applies to:** apex-class

**Rationale:** Tests run as the system user by default, bypassing
sharing rules. Code

that depends on the running user's profile, permission set, or record
access must be

exercised in a `System.runAs(user)` block to validate that the access
checks actually

work. PMD's `ApexUnitTestClassShouldHaveRunAs` flags test classes that
never use `runAs`.

**Detection signals:**

- A test of a `with sharing` class that does not use `System.runAs`.

- A test that asserts a permission check works but only the system user
runs the code.

- No test users created at the top of the test class
(`UserBuilder.standardUser()` or

similar).

**Bad example:**

```apex

@isTest static void itEnforcesSharing() {

Account hidden = new Account(Name='Secret'); insert hidden;

List<Account> visible = AccountReader.getRecent();

Assert.areEqual(1, visible.size(), 'should see the account'); // runs as
system, misleading

}

```

**Good example:**

```apex

@isTest static void itEnforcesSharing() {

Account hidden = new Account(Name='Secret'); insert hidden;

User standard = TestUserFactory.standard();

System.runAs(standard) {

List<Account> visible = AccountReader.getRecent();

Assert.areEqual(0, visible.size(), 'standard user must not see the
secret account');

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_testing_tools_runas.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#apexunittestclassshouldhaverunas

---

## RULE APEX-TEST-011: Target ≥85% coverage on service and trigger code

**Severity:** medium

**Category:** testing

**Applies to:** apex-class

**Rationale:** Salesforce requires 75% org-wide coverage to deploy, but
coverage on

business-critical code (services, triggers, batch jobs) should be
substantially higher

because these are the paths where failures cause data corruption.
Coverage on simple

DTOs and wrapper classes is allowed to be lower. Aim for 100% on
services and triggers,

≥75% on everything else.

**Detection signals:**

- A service class with coverage below 85% (requires integration with
coverage results).

- A trigger or trigger handler with coverage below 95%.

- A test class with one method per public service method (rough proxy
for low branch

coverage).

**Bad example:**

```apex

// AccountService has six public methods; AccountServiceTest exercises
two of them.

```

**Good example:**

```apex

// AccountServiceTest has positive and negative tests for each public
service method,

// covering all branches and reaching 95%+ coverage.

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_code_coverage_best_pract.htm,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_code_coverage_intro.htm

---

## RULE APEX-TEST-012: Use `@isTest` annotation, not `testMethod`
keyword

**Severity:** low

**Category:** testing

**Applies to:** apex-class

**Rationale:** The `testMethod` keyword has been deprecated for many
releases in favor of

the `@isTest` annotation. New code using `testMethod` cannot be compiled
at higher API

versions and is harder to grep for. Convert any remaining `testMethod`
usage during

maintenance windows.

**Detection signals:**

- `static testMethod void` in the method signature.

- The `testMethod` keyword anywhere outside an `@isTest`-annotated
class.

**Bad example:**

```apex

@isTest

private class LegacyTest {

static testMethod void itWorks() { Assert.areEqual(1, 1, 'sanity'); }

}

```

**Good example:**

```apex

@isTest

private class LegacyTest {

@isTest static void itWorks() { Assert.areEqual(1, 1, 'sanity'); }

}

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#apexunittestmethodshouldhaveistestannotation,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_annotation_isTest.htm

---

