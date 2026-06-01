
# Apex Governance Rules

These rules cover the long-horizon concerns that make a Salesforce
codebase reviewable

and maintainable over years: API version policy, deprecation handling,
technical debt

visibility, observability, sharing-model evolution, and managed-package
boundaries.

Salesforce releases three times per year (Spring/Summer/Winter) and
retires API versions

on a rolling 3-year window. Code with a forgotten API version slowly
accumulates

inconsistencies; explicit governance keeps that drift bounded.

---

## RULE APEX-GOV-001: Pin classes to a recent, supported API version

**Severity:** high

**Category:** governance

**Applies to:** apex-class, apex-trigger

**Rationale:** Each Apex class has an API version set in its
`-meta.xml`, and that version

determines semantics: security defaults (user mode for v67+), available
syntax, behavior

of platform APIs. A class stuck at API v40 will silently differ from
neighboring v62

code, miss security defaults, and may eventually be retired (Salesforce
retired

API v21–30 in Summer '25). Standardize on a recent version (last three
releases) and

upgrade deliberately, not by accident.

**Detection signals:**

- A class `.cls-meta.xml` with `<apiVersion>` older than the latest
three releases (as of

this guide's writing, anything below v60.0 deserves scrutiny).

- API versions older than v31.0 (all such versions are retired or
deprecated).

- A mixed-version codebase where one folder is v45 and the next is v62 —
file an upgrade

task during the next release planning cycle.

**Bad example:**

```xml

<!-- AccountService.cls-meta.xml -->

<?xml version="1.0" encoding="UTF-8"?>

<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">

<apiVersion>40.0</apiVersion>

<status>Active</status>

</ApexClass>

```

**Good example:**

```xml

<!-- AccountService.cls-meta.xml -->

<?xml version="1.0" encoding="UTF-8"?>

<ApexClass xmlns="http://soap.sforce.com/2006/04/metadata">

<apiVersion>62.0</apiVersion>

<status>Active</status>

</ApexClass>

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/api_rest_eol.htm,
https://developer.salesforce.com/blogs/2024/10/new-tools-to-help-prepare-for-api-version-retirement

---

## RULE APEX-GOV-002: Mark deprecated public APIs with `@Deprecated` and
a migration note

**Severity:** medium

**Category:** governance

**Applies to:** apex-class

**Rationale:** Public methods accumulate callers that you cannot see
(managed package

consumers, integrations, anonymous Apex bookmarked by admins). Deleting
one breaks them

silently. The `@Deprecated` annotation signals intent without removal,
lets callers find

out at compile time, and pairs with an ApexDoc `@deprecated` note
explaining the

replacement.

**Detection signals:**

- A method commented as "do not use" or "use X instead" without the
`@Deprecated`

annotation.

- A method whose body delegates to another method and is no longer the
recommended path

but lacks `@Deprecated`.

- Removal of a `public`/`global` method without first marking it
deprecated for at least

one release.

**Bad example:**

```apex

public with sharing class AccountService {

// TODO: remove this, use createWithOwner instead

public static Id create(String name) {

return createWithOwner(name, UserInfo.getUserId());

}

public static Id createWithOwner(String name, Id ownerId) { /* ... */
return null; }

}

```

**Good example:**

```apex

public with sharing class AccountService {

/**

* @deprecated Use {@link #createWithOwner(String,Id)}. Will be removed
in 2027.01.

*/

@Deprecated

public static Id create(String name) {

return createWithOwner(name, UserInfo.getUserId());

}

public static Id createWithOwner(String name, Id ownerId) { /* ... */
return null; }

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_deprecated_annotation.htm

---

## RULE APEX-GOV-003: Tag technical debt with TODO/FIXME plus owner and
ticket

**Severity:** low

**Category:** governance

**Applies to:** apex-class, apex-trigger

**Rationale:** Bare `// TODO` comments rot. A comment that names the
owner and the

tracking ticket gives reviewers a clear handle to triage and the
codebase a reliable

inventory of debt. Forbidding tag-less TODOs forces the author to either
fix it or own

it.

**Detection signals:**

- `// TODO` or `// FIXME` without a JIRA/ADO ticket reference and an
owner handle.

- `// HACK` comments with no explanation of the underlying constraint.

- More than 50 untagged TODOs in the codebase (signal of debt drift).

**Bad example:**

```apex

// TODO refactor this

public static void process(List<Account> accounts) { /* ... */ }

```

**Good example:**

```apex

// TODO(svyas, -1234): refactor when SOQL cursor support reaches GA
in Summer '26

public static void process(List<Account> accounts) { /* ... */ }

```

**References:**
https://architect.salesforce.com/docs/architect/well-architected/guide/easy/intentional

---

## RULE APEX-GOV-004: Avoid `@InvocableMethod` without `label` and
`description`

**Severity:** medium

**Category:** governance

**Applies to:** apex-class

**Rationale:** Invocable methods become Flow actions and external
integration surfaces.

Without a `label` and `description`, admins building Flows see "Apex
Action: MyClass" with

no guidance and cannot tell what each action does. The labels are also
displayed in

deployment plans and support tickets — they are user-facing strings.

**Detection signals:**

- `@InvocableMethod` annotation with no parentheses or missing
`label`/`description`.

- `@InvocableVariable` fields without a `label`.

- An InvocableMethod class whose name is the only documentation.

**Bad example:**

```apex

public with sharing class SendEscalation {

@InvocableMethod

public static void run(List<Id> caseIds) { /* ... */ }

}

```

**Good example:**

```apex

public with sharing class SendEscalation {

@InvocableMethod(

label='Send Case Escalation Notification'

description='Notifies the escalation queue and logs an audit row for
each Case Id.'

category='Case Management'

)

public static void run(List<Id> caseIds) { /* ... */ }

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_annotation_InvocableMethod.htm

---

## RULE APEX-GOV-005: Document the sharing-model assumption on every
entry-point class

**Severity:** medium

**Category:** governance

**Applies to:** apex-class

**Rationale:** A reader of `public without sharing class FooService`
cannot tell from the

class header WHY it elevates privilege. Sharing-model decisions encode
security policy and

must be explained. An ApexDoc block on the class explaining the
elevation reason (and

linking to the design doc) makes the intent reviewable when the original
author has moved

on.

**Detection signals:**

- A `without sharing` class with no class-level comment explaining why.

- An `inherited sharing` class with no note on which callers it is meant
to inherit from.

- A class header with only the auto-generated stub comment.

**Bad example:**

```apex

public without sharing class AuditWriter {

public static void log(String event, Id userId) { /* ... */ }

}

```

**Good example:**

```apex

/**

* Writes immutable audit rows on behalf of any caller, including users
without

* Audit_Log__c create permission. Elevates because the audit trail must
not be

* suppressible by the actor. Reviewed by Security on 2026-04-12
(-1102).

*/

public without sharing class AuditWriter {

public static void log(String event, Id userId) { /* ... */ }

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_keywords_sharing.htm,
https://architect.salesforce.com/docs/architect/well-architected/guide/secure.html

---

## RULE APEX-GOV-006: Persist async-job failures to an observable log
object

**Severity:** high

**Category:** governance

**Applies to:** apex-class

**Rationale:** A failed queueable or batch job emits an email and a row
in `AsyncApexJob`

that is hard to monitor at scale. Production observability requires
writing failures to a

durable, queryable object (custom `Apex_Log__c`, Platform Event, or
third-party logger)

inside a `try/catch` in the `execute`/`finish` methods, or inside the
attached

`System.Finalizer`. Without this, on-call has no signal until a customer
reports symptoms.

**Detection signals:**

- A `Queueable.execute(...)` or `Database.Batchable.execute(...)` body
with no

`try/catch` and no attached Finalizer.

- A `finish` method that does not check `BatchableContext.getJobId()`
for errors.

- A queueable that swallows exceptions with `catch (Exception e) {
System.debug(e); }`

(debug logs are not durable).

**Bad example:**

```apex

public class NightlyRollup implements Database.Batchable<SObject> {

public Database.QueryLocator start(Database.BatchableContext bc) { /*
... */ return null; }

public void execute(Database.BatchableContext bc, List<SObject> scope) {

// hard work; exceptions surface only as silent batch failures

}

public void finish(Database.BatchableContext bc) {}

}

```

**Good example:**

```apex

public class NightlyRollup implements Database.Batchable<SObject> {

public Database.QueryLocator start(Database.BatchableContext bc) { /*
... */ return null; }

public void execute(Database.BatchableContext bc, List<SObject> scope) {

try { /* work */ }

catch (Exception e) {

Logger.error('NightlyRollup chunk failed', e,

new Map<String, Object>{'jobId' => bc.getJobId(), 'count' =>
scope.size()});

throw e; // let the chunk fail; finish() will summarize

}

}

public void finish(Database.BatchableContext bc) {

AsyncApexJob status = [SELECT Id, Status, NumberOfErrors,
JobItemsProcessed, TotalJobItems

FROM AsyncApexJob WHERE Id = :bc.getJobId() LIMIT 1];

if (status.NumberOfErrors > 0) { Logger.error('NightlyRollup batch had
failures', null,

new Map<String, Object>{'status' => status.Status, 'errors' =>
status.NumberOfErrors}); }

}

}

```

**References:**
https://architect.salesforce.com/docs/architect/well-architected/guide/reliable.html,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_async_monitoring.htm

---

## RULE APEX-GOV-007: Feature-flag risky changes via Custom Metadata

**Severity:** medium

**Category:** governance

**Applies to:** apex-class, apex-trigger

**Rationale:** New code paths in heavily-trafficked triggers and
services should be

introduced behind a Custom Metadata Type flag so the change can be
disabled without a

deploy if it misbehaves in production. Hard-coded `if (false)` toggles,
environment

sniffing, and "release in a sandbox first" are weaker controls — they
are not auditable

and not switchable at incident time.

**Detection signals:**

- A new conditional branch in a hot path with no associated
`Feature_Flag__mdt` lookup.

- `if (UserInfo.getOrganizationId() == '00DXXXXXXXXXXXX')`
environment-pinning.

- A `static Boolean ENABLED = true;` flag flipped only by code change.

**Bad example:**

```apex

public with sharing class CaseRouter {

public static void route(List<Case> cases) {

for (Case c : cases) {

if (c.Priority == 'High') { /* new logic, no kill switch */ }

}

}

}

```

**Good example:**

```apex

public with sharing class CaseRouter {

public static void route(List<Case> cases) {

Boolean newRouting =
FeatureFlags.isEnabled('Case_High_Priority_Routing_v2');

for (Case c : cases) {

if (newRouting && c.Priority == 'High') { /* new logic */ }

else if (c.Priority == 'High') { /* legacy */ }

}

}

}

```

**References:**
https://architect.salesforce.com/docs/architect/well-architected/guide/adaptable.html,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_metadata_intro.htm

---

## RULE APEX-GOV-008: Avoid managed-package-incompatible patterns in
unlocked packages

**Severity:** medium

**Category:** governance

**Applies to:** apex-class

**Rationale:** If the codebase is intended to ship as a 2GP
(second-generation) or unlocked

package, certain patterns prevent packaging or break installs:
`Schema.getGlobalDescribe`

references to non-packaged objects, hardcoded namespaces, queries
against `RecordType`

DeveloperName that include the namespace prefix in the literal. These
problems surface

only at package version creation time, often weeks into the release
cycle.

**Detection signals:**

- A literal containing a namespace prefix (`mynamespace__Object__c`)
when the namespace

is already implicit.

- A SOQL query against a metadata table that includes a hardcoded
namespace.

- References to objects/fields that exist only in a different package
without a managed

dependency declared.

**Bad example:**

```apex

public class Pricing {

public static List<SObject> rules() {

return [SELECT Id FROM __Pricing_Rule__c WITH USER_MODE];

}

}

```

**Good example:**

```apex

public class Pricing {

public static List<SObject> rules() {

// namespace inferred at packaging time

return [SELECT Id FROM Pricing_Rule__c WITH USER_MODE];

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.pkg2_dev.meta/pkg2_dev/sfdx_dev_dev2gp.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#avoidglobalmodifier

---

## RULE APEX-GOV-009: Schedule jobs from code via `System.schedule`, not
anonymous Apex

</br>**Severity:** medium

**Category:** governance

**Applies to:** apex-class

**Rationale:** Scheduled jobs created in anonymous Apex (via Developer
Console or one-time

deploys) have no source-of-truth in the repo. They survive sandbox
refreshes

unpredictably, cannot be reviewed in a PR, and the cron expression often
drifts from the

deployed code. A `SchedulableJobManager.scheduleAll()` method invoked
from post-install

or from CI provides a versioned, deployable, reviewable schedule.

**Detection signals:**

- A `Schedulable` class with no test that exercises `System.schedule`.

- A README that says "run `System.schedule(...)` in anonymous Apex after
deploy".

- Drift between `CronTrigger` records in production and the documented
schedule.

**Bad example:**

```apex

// README: After deploy, run this in Developer Console:

// System.schedule('Nightly', '0 0 2 * * ?', new NightlyRollup());

```

**Good example:**

```apex

public with sharing class ScheduleInstaller {

public static void scheduleAll() {

if (![SELECT Id FROM CronTrigger WHERE CronJobDetail.Name =
'NightlyRollup'].isEmpty()) {

return;

}

System.schedule('NightlyRollup', '0 0 2 * * ?', new NightlyRollup());

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_scheduler.htm,
https://architect.salesforce.com/docs/architect/well-architected/guide/easy/maintainable

---

## RULE APEX-GOV-010: Assign an explicit code owner via header comment
for critical classes

**Severity:** low

**Category:** governance

**Applies to:** apex-class

**Rationale:** Salesforce metadata does not have a built-in CODEOWNERS
file, but a header

comment naming the owning team makes triage faster. When a critical
service breaks at

2 am, the on-call engineer needs to know which team to page. A `@owner`
ApexDoc tag (or

equivalent comment block) costs nothing and avoids `git blame`
archaeology.

**Detection signals:**

- A trigger handler, batch class, or service class with no
`@owner`/`Team:` header.

- A class with an `@author` tag listing only the original author (long
since departed).

- More than three "primary" services with no team ownership.

**Bad example:**

```apex

public with sharing class BillingService {

public static void chargeAll(List<Id> accountIds) { /* critical path */
}

}

```

**Good example:**

```apex

/**

* Charges accounts in bulk against the external billing provider.

*

* @owner Customer-Money-Movement Squad (slack: #cmm-eng)

* @runbook https://confluence..com/x/abc123

*/

public with sharing class BillingService {

public static void chargeAll(List<Id> accountIds) { /* critical path */
}

}

```

**References:**
https://architect.salesforce.com/docs/architect/well-architected/guide/easy/maintainable,
https://github.com/SalesforceFoundation/ApexDoc

---

