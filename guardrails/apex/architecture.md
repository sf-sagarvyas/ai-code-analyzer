
# Apex Architecture Rules

These rules cover the structural concerns that keep an Apex codebase
reviewable, testable,

and extensible over multi-year horizons: trigger-handler separation, the

selector/service/domain layering popularized by the fflib Apex
Enterprise Patterns library,

recursion control, exception handling, and dependency direction.

---

## RULE APEX-ARCH-001: One trigger per SObject; logic lives in a handler
class

**Severity:** high

**Category:** architecture

**Applies to:** apex-trigger, apex-class

**Rationale:** When an SObject has multiple triggers, Salesforce does
not guarantee the

execution order between them, leading to brittle, environment-dependent
behavior. The

"one trigger per object" pattern delegates all events to a single
handler class that

dispatches by `Trigger.operationType`. Business logic in the trigger
body itself is also

harder to unit-test (you cannot construct a fake `Trigger` context) and
cannot be reused

from anonymous Apex, scheduled jobs, or platform-event subscribers.

**Detection signals:**

- More than one `.trigger` file declaring `trigger ... on <SObject>`.

- A trigger body that contains any logic beyond a single static method
call to a handler.

- A trigger body that contains `SELECT`/DML/`if`/`for` directly.

**Bad example:**

```apex

trigger ContactTrigger on Contact (before insert, before update) {

for (Contact c : Trigger.new) {

if (c.Email != null) { c.Email = c.Email.toLowerCase(); }

if (Trigger.isInsert) {

// ... a lot of insert-specific logic

}

}

}

```

**Good example:**

```apex

trigger ContactTrigger on Contact (before insert, before update,

after insert, after update,

before delete, after delete, after undelete) {

new ContactTriggerHandler().run();

}

public with sharing class ContactTriggerHandler extends TriggerHandler {

public override void beforeInsert() { normalizeEmails((List<Contact>)
Trigger.new); }

public override void beforeUpdate() { normalizeEmails((List<Contact>)
Trigger.new); }

private void normalizeEmails(List<Contact> contacts) {

for (Contact c : contacts) {

if (c.Email != null) { c.Email = c.Email.toLowerCase(); }

}

}

}

```

**References:**
https://www.salesforceben.com/the-salesforce-trigger-handler-framework/,
https://www.apexhours.com/trigger-handler-pattern-in-salesforce/,
https://pmd.github.io/pmd/pmd_rules_apex.html#avoidlogicintrigger

---

## RULE APEX-ARCH-002: Guard triggers against recursion

**Severity:** high

**Category:** architecture

**Applies to:** apex-class, apex-trigger

**Rationale:** An `after update` trigger that issues `update` on the
same object refires

the trigger, often causing infinite recursion until governor limits
abort the transaction.

A static boolean flag (or a dedicated recursion-guard utility) tracks
first-pass execution

per transaction. The guard must be set before the DML and respected on
subsequent passes,

and tests must explicitly reset it.

**Detection signals:**

- A trigger handler that performs DML on the same SObject it triggers
on, with no static

`alreadyRun` / `runOnce` / `processed` flag.

- A handler `run()` method that does not check or set a recursion
control variable.

- Triggers on parent and child objects that update each other without
coordination.

**Bad example:**

```apex

public with sharing class AccountTriggerHandler extends TriggerHandler {

public override void afterUpdate() {

List<Account> toFlag = new List<Account>();

for (Account a : (List<Account>) Trigger.new) { toFlag.add(new
Account(Id=a.Id, Audited__c=true)); }

update toFlag; // refires the trigger -> infinite recursion

}

}

```

**Good example:**

```apex

public with sharing class AccountTriggerHandler extends TriggerHandler {

private static Boolean hasRun = false;

public override void afterUpdate() {

if (hasRun) { return; }

hasRun = true;

List<Account> toFlag = new List<Account>();

for (Account a : (List<Account>) Trigger.new) { toFlag.add(new
Account(Id=a.Id, Audited__c=true)); }

update toFlag;

}

}

```

**References:**
https://sfdcprep.com/salesforce-apex-trigger-handler-recursion-guards-best-practices/,
https://www.apexhours.com/trigger-framework-in-salesforce/

---

## RULE APEX-ARCH-003: Encapsulate queries in a selector layer

**Severity:** medium

**Category:** architecture

**Applies to:** apex-class

**Rationale:** Scattering SOQL across triggers, handlers, controllers,
and batch classes

makes it impossible to audit field usage, enforce consistent FLS
handling, or refactor a

field rename in one place. The selector pattern concentrates all queries
for one SObject

in one class (e.g., `AccountsSelector`), which becomes the single point
where access

modes, field lists, and ORDER BY/LIMIT defaults are defined.

**Detection signals:**

- Multiple classes containing SOQL against the same SObject.

- Inline `[SELECT ...]` in a controller, queueable, or batch class
rather than via a

selector method.

- No `<Object>sSelector` class for an SObject that is queried from more
than two places.

**Bad example:**

```apex

public with sharing class AccountController {

@AuraEnabled(cacheable=true)

public static List<Account> getTopAccounts() {

return [SELECT Id, Name, AnnualRevenue FROM Account ORDER BY
AnnualRevenue DESC LIMIT 10];

}

}

public with sharing class AccountReport {

public static List<Account> topAccounts() {

return [SELECT Id, Name, AnnualRevenue FROM Account ORDER BY
AnnualRevenue DESC LIMIT 10];

}

}

```

**Good example:**

```apex

public with sharing class AccountsSelector {

public List<Account> selectTopByRevenue(Integer limitN) {

return [

SELECT Id, Name, AnnualRevenue

FROM Account

WITH USER_MODE

ORDER BY AnnualRevenue DESC NULLS LAST

LIMIT :limitN

];

}

}

public with sharing class AccountController {

@AuraEnabled(cacheable=true)

public static List<Account> getTopAccounts() {

return new AccountsSelector().selectTopByRevenue(10);

}

}

```

**References:**
https://trailhead.salesforce.com/content/learn/modules/apex_patterns_dsl/apex_patterns_dsl_learn_selector_l_principles,
https://fflib.dev/docs,
https://github.com/apex-enterprise-patterns/fflib-apex-common

---

## RULE APEX-ARCH-004: Push business logic into a service layer, not
into controllers

**Severity:** medium

**Category:** architecture

**Applies to:** apex-class

**Rationale:** Apex controllers, REST endpoints, and trigger handlers
are entry points,

not business logic homes. When the same operation needs to run from an
LWC, a REST API,

and a batch job, logic embedded in any one entry point cannot be reused
without copy-paste.

A pure service class (no `@AuraEnabled`, no Visualforce, no DML on
`Trigger.new` in place)

is reusable, transaction-agnostic, and unit-testable.

**Detection signals:**

- An `@AuraEnabled` method that is more than ~20 lines and contains DML,
SOQL, and

branching logic.

- Duplicate logic across a controller and a batch class.

- A REST resource that owns business rules instead of delegating to a
service.

**Bad example:**

```apex

public with sharing class CaseController {

@AuraEnabled

public static void closeCase(Id caseId, String resolution) {

Case c = [SELECT Id, Status FROM Case WHERE Id = :caseId WITH USER_MODE
LIMIT 1];

if (c.Status == 'Closed') { throw new AuraHandledException('Already
closed'); }

c.Status = 'Closed';

c.Resolution__c = resolution;

update c;

// ...also publish a platform event, write an audit row, etc.

}

}

```

**Good example:**

```apex

public with sharing class CaseController {

@AuraEnabled

public static void closeCase(Id caseId, String resolution) {

CaseService.close(new Set<Id>{ caseId }, resolution);

}

}

public with sharing class CaseService {

public static void close(Set<Id> caseIds, String resolution) {

// bulk-safe service logic, reusable from any entry point

}

}

```

**References:**
https://trailhead.salesforce.com/content/learn/modules/apex_patterns_sl,
https://fflib.dev/docs

---

## RULE APEX-ARCH-005: Never swallow exceptions silently

**Severity:** high

**Category:** architecture

**Applies to:** apex-class, apex-trigger

**Rationale:** An empty `catch` block discards diagnostic information
and turns runtime

errors into silent data corruption. Even worse: in production it makes
incidents

unobservable. Re-throw, log via your platform logger, or convert to a
`AuraHandledException`

with a sanitized message — but never `catch (Exception e) { }`.

**Detection signals:**

- `catch (...) { }` with an empty body.

- `catch` blocks containing only `System.debug(e)` (debug logs are not
durable observability).

- `catch (Exception e)` that does not rethrow and does not call a
logger.

**Bad example:**

```apex

try {

update accounts;

} catch (DmlException e) {

// ignored

}

```

**Good example:**

```apex

try {

update accounts;

} catch (DmlException e) {

Logger.error('Account update failed', e, new Map<String, Object>{'count'
=> accounts.size()});

throw new AccountServiceException('Could not update accounts', e);

}

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#emptycatchblock,
https://architect.salesforce.com/well-architected/trusted/reliable

---

## RULE APEX-ARCH-006: Never hardcode record Ids

**Severity:** high

**Category:** architecture

**Applies to:** apex-class, apex-trigger

**Rationale:** Record Ids (RecordTypeIds, queue Ids, user Ids, profile
Ids, custom metadata

Ids) differ between sandbox and production and across managed-package
installations.

Hardcoded Ids cause deployment failures, NullPointerExceptions in
different orgs, and

emergency hotfixes. Look the Id up dynamically (DeveloperName for record
types, Custom

Metadata Type for configuration) and cache the result.

**Detection signals:**

- A string literal that parses as a 15- or 18-character Salesforce Id
(`/^[a-zA-Z0-9]{15,18}$/`).

- `Id rt = '012XXXXXXXXXXXXXXX';` or similar in code or test fixtures.

- `Schema.SObjectType.X.getRecordTypeInfosById().get('012...').`

**Bad example:**

```apex

public class CaseRouter {

private static final Id ESCALATION_QUEUE = '00G3X000000abcdEAA';

public static void route(List<Case> cases) {

for (Case c : cases) { c.OwnerId = ESCALATION_QUEUE; }

}

}

```

**Good example:**

```apex

public class CaseRouter {

public static void route(List<Case> cases) {

Id queueId = [

SELECT Id FROM Group WHERE Type = 'Queue' AND DeveloperName =
'Escalation_Queue'

LIMIT 1

].Id;

for (Case c : cases) { c.OwnerId = queueId; }

}

}

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#avoidhardcodingid,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_naming_conventions.htm

---

## RULE APEX-ARCH-007: Avoid `global` access outside managed-package
APIs

**Severity:** medium

**Category:** architecture

**Applies to:** apex-class

**Rationale:** `global` methods and classes become part of a managed
package's permanent

API surface — they cannot be deleted, renamed, or have their signatures
changed without

breaking subscriber code. In a customer org (non-packaged code),
`global` is almost never

correct; `public` provides the same accessibility within the org.
Reserve `global` for

genuine package boundary contracts.

**Detection signals:**

- A `global` class or method in a non-packaged repository (no
`package.xml` namespace).

- New code using `global` when no existing caller depended on it.

- `global with sharing class` named like an internal helper.

**Bad example:**

```apex

global with sharing class AccountHelper {

global static String formatName(Account a) {

return a.Name + ' (' + a.Industry + ')';

}

}

```

**Good example:**

```apex

public with sharing class AccountHelper {

public static String formatName(Account a) {

return a.Name + ' (' + a.Industry + ')';

}

}

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#avoidglobalmodifier,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_keywords_modifiers.htm

---

## RULE APEX-ARCH-008: Keep method and class complexity within
reviewable limits

**Severity:** medium

**Category:** architecture

**Applies to:** apex-class

**Rationale:** PMD's `CognitiveComplexity` and `CyclomaticComplexity`
rules flag methods

with more than ~15 decision points and classes with more than ~1000
lines. Beyond these

thresholds, code is statistically more bug-prone and code review
degenerates to "looks

fine, ship it." Break large methods into named helpers; extract
responsibilities into

collaborator classes.

**Detection signals:**

- A method with cyclomatic complexity > 15 (more than ~15 branching
constructs).

- A class with more than 1000 lines of code or more than 25 methods.

- A method with more than 7 parameters (refactor to a parameter object).

**Bad example:**

```apex

public static String classify(Case c) {

if (c.Priority == 'High') {

if (c.Type == 'Outage') {

if (c.Account.IsEnterprise__c) { return 'P0'; }

else if (c.IsEscalated) { return 'P1'; }

else { return 'P2'; }

} else if (c.Type == 'Question') { /* etc., 30 more lines */ }

// ... cyclomatic complexity > 20

}

return 'P4';

}

```

**Good example:**

```apex

public static String classify(Case c) {

if (c.Priority == 'High') { return classifyHigh(c); }

if (c.Priority == 'Medium') { return classifyMedium(c); }

return 'P4';

}

private static String classifyHigh(Case c) { /* ... */ return 'P0'; }

private static String classifyMedium(Case c) { /* ... */ return 'P2'; }

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#cognitivecomplexity,
https://pmd.github.io/pmd/pmd_rules_apex.html#cyclomaticcomplexity

---

## RULE APEX-ARCH-009: Use custom exception types for service-layer
failures

**Severity:** medium

**Category:** architecture

**Applies to:** apex-class

**Rationale:** Catching `Exception` matches everything including
`LimitException` (which

should never be caught), `NullPointerException`, and `DmlException` —
losing the ability

to handle each appropriately. Custom exception classes (`extends
Exception`) make

service-layer failures explicit, allow per-type recovery, and produce
better stack

traces and observability.

**Detection signals:**

- `throw new DmlException(...)` / `throw new Exception(...)` from a
service method.

- `catch (Exception e)` blocks where a specific subtype would suffice.

- No `*Exception` classes alongside `*Service` classes.

**Bad example:**

```apex

public with sharing class OrderService {

public static void place(Order__c o) {

if (o.Amount__c <= 0) { throw new Exception('Bad amount'); }

insert o;

}

}

```

**Good example:**

```apex

public class OrderException extends Exception { }

public with sharing class OrderService {

public static void place(Order__c o) {

if (o.Amount__c <= 0) { throw new OrderException('Amount must be
positive'); }

insert o;

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_exception_statements.htm

---

## RULE APEX-ARCH-010: Avoid direct mutation of Trigger.new/Trigger.old
maps

**Severity:** medium

**Category:** architecture

**Applies to:** apex-class, apex-trigger

**Rationale:** `Trigger.new` is modifiable in `before` triggers
(intentionally — that is

how you set field defaults) but writes to `Trigger.old`,
`Trigger.newMap`, and any context

list in `after` triggers either throw or behave non-obviously. Passing
these collections

around can also obscure where data is being mutated. Copy to a local
list and operate on

the copy if you need to mutate after the trigger context.

**Detection signals:**

- `Trigger.new[i].Field = ...` inside an `after` trigger.

- `Trigger.newMap.put(...)` or `Trigger.oldMap.put(...)`.

- Passing `Trigger.new` directly to a method that calls DML on it.

**Bad example:**

```apex

trigger AccountTrigger on Account (after update) {

for (Account a : Trigger.new) {

a.LastReviewed__c = Datetime.now(); // throws: cannot modify Trigger.new
in after

}

}

```

**Good example:**

```apex

trigger AccountTrigger on Account (after update) {

List<Account> toUpdate = new List<Account>();

for (Account a : Trigger.new) {

toUpdate.add(new Account(Id = a.Id, LastReviewed__c = Datetime.now()));

}

update toUpdate;

}

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#avoiddirectaccesstriggermap,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_triggers_context_variables.htm

---

