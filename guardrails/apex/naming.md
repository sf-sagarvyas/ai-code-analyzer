
# Apex Naming Conventions

These rules promote a consistent surface across the codebase so
reviewers (human and AI)

can recognize intent at a glance. Conventions follow Salesforce's
published guidance for

Apex and the de-facto community standard (Java-style for classes,
camelCase for methods

and variables, UPPER_SNAKE for constants).

---

## RULE APEX-NAME-001: Classes use UpperCamelCase

**Severity:** low

**Category:** naming

**Applies to:** apex-class

**Rationale:** UpperCamelCase (also known as PascalCase) for Apex types
is the convention

in the Salesforce Apex Developer Guide and is enforced by PMD's
`ClassNamingConventions`.

A consistent type-name shape makes diffs easier to read and reduces
friction when grepping

the codebase.

**Detection signals:**

- Class names starting with a lowercase letter (`accountService`).

- Class names with underscores (`account_service`, `Account_Service`).

- ALL CAPS class names (`ACCOUNTSERVICE`).

**Bad example:**

```apex

public with sharing class account_service { }

public with sharing class accountHelper { }

```

**Good example:**

```apex

public with sharing class AccountService { }

public with sharing class AccountHelper { }

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_naming_conventions.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#classnamingconventions

---

## RULE APEX-NAME-002: Methods and local variables use lowerCamelCase

**Severity:** low

**Category:** naming

**Applies to:** apex-class, apex-trigger

**Rationale:** Method and variable names beginning with lowercase
letters and using camel

casing for word breaks match the Salesforce style guide. Mixed
conventions inside one

codebase slow review and increase the cognitive cost of every PR.

**Detection signals:**

- Method names starting with uppercase (`GetRecord`).

- Variables with underscores (`my_account`, `account_id`).

- Variable names with non-alphanumeric prefixes (`$account`, `_temp`).

**Bad example:**

```apex

public class AccountUtil {

public static Account Get_Account(Id account_id) {

Account my_account = [SELECT Id FROM Account WHERE Id = :account_id WITH
USER_MODE LIMIT 1];

return my_account;

}

}

```

**Good example:**

```apex

public class AccountUtil {

public static Account getAccount(Id accountId) {

Account account = [SELECT Id FROM Account WHERE Id = :accountId WITH
USER_MODE LIMIT 1];

return account;

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_naming_conventions.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#methodnamingconventions,
https://pmd.github.io/pmd/pmd_rules_apex.html#localvariablenamingconventions

---

## RULE APEX-NAME-003: Constants are UPPER_SNAKE_CASE

**Severity:** low

**Category:** naming

**Applies to:** apex-class

**Rationale:** `static final` constants are conventionally written in
all uppercase with

underscore word separators. This visually distinguishes immutable
references from mutable

state at the call site.

**Detection signals:**

- `static final Type name = ...;` declared in lowerCamelCase or
UpperCamelCase.

- `final` instance fields declared in lowerCamelCase that are never
assigned outside the

constructor (candidates for `static final`).

**Bad example:**

```apex

public class Constants {

public static final Integer MaxAttempts = 3;

public static final String defaultStatus = 'New';

}

```

**Good example:**

```apex

public class Constants {

public static final Integer MAX_ATTEMPTS = 3;

public static final String DEFAULT_STATUS = 'New';

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_naming_conventions.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#fieldnamingconventions

---

## RULE APEX-NAME-004: Test classes end with `Test` and live alongside
the production class

**Severity:** low

**Category:** naming

**Applies to:** apex-class

**Rationale:** A predictable naming scheme (`AccountService` +
`AccountServiceTest`) makes

it trivial to locate tests, jump between SUT (system under test) and
test in the IDE, and

configure coverage reports. PMD's `TestMethodsMustBeInTestClasses` flags
`@isTest`

methods scattered into production classes — this rule extends that to
the file name.

**Detection signals:**

- A class with `@isTest` on every method whose name does not end in
`Test` (`Tests`,

`_Test`, `TestClass`).

- A test class named `Test_AccountService` (prefix) instead of
`AccountServiceTest`.

- An `@isTest` method placed inside a non-test class.

**Bad example:**

```apex

@isTest

public class Test_AccountService {

@isTest static void itWorks() { /* ... */ }

}

```

**Good example:**

```apex

@isTest

private class AccountServiceTest {

@isTest static void itWorks() { /* ... */ }

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_naming_conventions.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#testmethodsmustbeintestclasses

---

## RULE APEX-NAME-005: Trigger files match the SObject and end with
`Trigger`

**Severity:** low

**Category:** naming

**Applies to:** apex-trigger

**Rationale:** The convention `<SObject>Trigger` (e.g.,
`AccountTrigger`) and its handler

`<SObject>TriggerHandler` make the one-trigger-per-object rule
self-documenting. It also

enables tooling to find a trigger from an SObject name.

**Detection signals:**

- A trigger named without the `Trigger` suffix.

- A trigger named after the action, not the object (`OnAccountInsert`).

- More than one trigger file referencing the same SObject (also violates
ARCH-001).

**Bad example:**

```apex

trigger OnAccountInsert on Account (before insert) { /* ... */ }

```

**Good example:**

```apex

trigger AccountTrigger on Account (before insert, before update,

after insert, after update,

before delete, after delete, after undelete) {

new AccountTriggerHandler().run();

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_naming_conventions.htm

---

## RULE APEX-NAME-006: Booleans read as predicates (`is*`, `has*`,
`should*`)

**Severity:** low

**Category:** naming

**Applies to:** apex-class, apex-trigger

**Rationale:** Boolean variables and methods named as nouns (`active`,
`escalation`) force

the reader to look at the type to know whether to read the name as a
question. Predicate-

style names (`isActive`, `hasEscalation`, `shouldRetry`) read naturally
at the call site

in `if (...)` conditions.

**Detection signals:**

- A `Boolean` field/parameter named as a noun.

- A method returning `Boolean` not named `is*`, `has*`, `should*`,
`can*`, or `was*`.

- Negative-form booleans (`isNotActive`) — prefer the positive form and
negate at the call

site.

**Bad example:**

```apex

public class CaseFlags {

public Boolean escalation;

public Boolean retry;

public Boolean check(Case c) { return c.IsClosed; }

}

```

**Good example:**

```apex

public class CaseFlags {

public Boolean hasEscalation;

public Boolean shouldRetry;

public Boolean isClosed(Case c) { return c.IsClosed; }

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_naming_conventions.htm

---

## RULE APEX-NAME-007: Selector/Service/Domain layer classes use
consistent suffixes

**Severity:** low

**Category:** naming

**Applies to:** apex-class

**Rationale:** When the codebase follows the layered architecture
pattern (see APEX-ARCH-003

and APEX-ARCH-004), consistent suffixes make the architectural role of
each class obvious

from its name alone: `AccountsSelector` (data access), `AccountsService`
(business logic),

`Accounts` or `AccountsDomain` (domain behavior on records). Mixing
`AccountQueryHelper`,

`AccountManager`, `AccountUtil` for the same role causes confusion and
duplicate code.

**Detection signals:**

- Query-only classes named `*Util`, `*Helper`, `*Manager`, or `*Query*`.

- Service classes without a `Service` suffix.

- Multiple suffixes for the same layer in the same module (e.g.,
`AccountService` and

`AccountManager` both exist).

**Bad example:**

```apex

public with sharing class AccountQueryHelper { /* SOQL */ }

public with sharing class AccountManager { /* business logic */ }

public with sharing class AccountUtil { /* mixed */ }

```

**Good example:**

```apex

public with sharing class AccountsSelector { /* SOQL only */ }

public with sharing class AccountsService { /* business logic only */ }

public with sharing class Accounts { /* domain behavior */ }

```

**References:**
https://trailhead.salesforce.com/content/learn/modules/apex_patterns_dsl,
https://fflib.dev/docs

---

## RULE APEX-NAME-008: Identifiers are descriptive, not abbreviated

**Severity:** medium

**Category:** naming

**Applies to:** apex-class, apex-trigger

**Rationale:** Cryptic identifiers (`gtCnt`, `mrkVip`, `lst`, `r`, `m`,
`d`) hide intent and force every reader to rebuild context from the
surrounding code. Salesforce code review standards and PMD's
`ShortVariable` and `ShortMethodName` rules treat names under 4
characters and abbreviation-heavy names as defects because they multiply
the cost of every future change. Single-letter names are acceptable only
for trivial loop counters (`for (Integer i = 0; i < n; i++)`) and
short-scope iteration aliases (`for (Account a : accounts)` where the
alias scope is a few lines).

**Detection signals:**

- Method names under 4 characters or built from abbreviations of common
domain words (`gt` for get, `mrk` for mark, `cnt` for count, `dlt` for
delete, `srch` for search, `calc` for calculate).

- Local variable names under 3 characters that are not a loop counter or
short-scope iteration alias.

- Removed-vowel names (`mrkVip`, `usrMgr`, `slctn`, `acctSvc`) — vowels
add negligible length but greatly improve readability.

- Class names that look like abbreviations (`usrMgr`, `acctSvc`,
`cntctHlp`).

- Method/variable names that require reading the body to understand
purpose.

**Bad example:**

```apex

public class usrMgr {

public static String mrkVip(List<String> ids) {

String r = '';

for (String i : ids) {

Contact c = [SELECT Id FROM Contact WHERE Id = :i];

r = r + c.Id + ',';

}

return r;

}

}

```

**Good example:**

```apex

public with sharing class ContactVipService {

public static String markContactsAsVip(List<String> contactIds) {

List<Id> updatedIds = new List<Id>();

for (Contact contact : [SELECT Id FROM Contact WHERE Id IN :contactIds])
{

updatedIds.add(contact.Id);

}

return String.join(updatedIds, ',');

}

}

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#shortvariable,
https://pmd.github.io/pmd/pmd_rules_apex.html#shortmethodname,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_naming_conventions.htm

---

