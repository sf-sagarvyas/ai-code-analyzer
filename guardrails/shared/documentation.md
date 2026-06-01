
# Shared Documentation Rules

These rules apply across Apex and LWC and govern the human-facing
artifacts of the code:

class-level docs, method-level docs, complex-block comments, and
changelog discipline.

The bar is "a new engineer can read the doc and understand the code's
purpose and

contract without reading the implementation."

---

## RULE SHARED-DOC-001: Document every public class and method with
ApexDoc/JSDoc

**Severity:** medium

**Category:** documentation

**Applies to:** apex-class, apex-trigger, lwc-js

**Rationale:** Public/global Apex classes and `@api`/`@AuraEnabled`
methods are part of

the codebase's contract. A reader (or AI reviewer) needs to know
intended behavior,

parameter constraints, return values, and exceptions thrown without
reading the body.

ApexDoc (`/** ... */` with `@description`, `@param`, `@return`,
`@throws`) and JSDoc

are the platform-standard formats and feed documentation generators and
IDE tooltips.

**Detection signals:**

- A `public` or `global` class with no class-level `/** */` block.

- A `public`/`global`/`@AuraEnabled` method with no preceding doc block.

- An `@api` LWC property with no JSDoc explaining accepted values.

**Bad example:**

```apex

public with sharing class AccountService {

public static Id create(String name, Id ownerId) {

Account a = new Account(Name = name, OwnerId = ownerId);

insert a; return a.Id;

}

}

```

**Good example:**

```apex

/**

* Service layer for Account lifecycle operations.

*/

public with sharing class AccountService {

/**

* @description Creates an Account with the given name and owner.

* @param name Display name, must be non-null and ≤255 chars.

* @param ownerId User or queue Id who will own the record.

* @return The Id of the newly inserted Account.

* @throws DmlException if the running user lacks Account create
permission.

*/

public static Id create(String name, Id ownerId) {

Account a = new Account(Name = name, OwnerId = ownerId);

insert a; return a.Id;

}

}

```

**References:** https://github.com/SalesforceFoundation/ApexDoc,
https://pmd.github.io/pmd/pmd_rules_apex.html#apexdoc,
https://jsdoc.app/

---

## RULE SHARED-DOC-002: Explain non-obvious logic with intent comments,
not narration

**Severity:** low

**Category:** documentation

**Applies to:** apex-class, apex-trigger, lwc-js

**Rationale:** Comments that restate what the code already says (`i++;
// increment i`)

add noise. Comments that explain WHY a non-obvious decision was made (a
workaround for a

platform bug, a deliberate divergence from the obvious approach, a
performance trade-off)

preserve context that future readers cannot recover from the diff alone.

**Detection signals:**

- Comments paraphrasing the next line of code.

- Magic numbers/strings with no explanatory comment.

- Workarounds for platform behavior with no link to the relevant
Salesforce known-issue or

release note.

**Bad example:**

```apex

// loop over accounts

for (Account a : accounts) {

// set name to upper

a.Name = a.Name.toUpperCase();

}

Integer chunkSize = 200; // chunk size

```

**Good example:**

```apex

// Normalize before downstream system matching: the partner API does
case-sensitive

// equality checks (-2034, observed 2026-02-10).

for (Account a : accounts) { a.Name = a.Name.toUpperCase(); }

// 200 keeps each callout batch under the 100-callouts-per-transaction
cap with

// 50% headroom for re-entrant Apex (see APEX-PERF-013 in guardrails).

Integer chunkSize = 200;

```

**References:**
https://www.apexhours.com/salesforce-code-comments-best-practices/

---

## RULE SHARED-DOC-003: Reference the issue tracker for non-trivial bug
fixes

**Severity:** low

**Category:** documentation

**Applies to:** apex-class, apex-trigger, lwc-js, lwc-html

**Rationale:** Six months after a fix lands, a reader looking at "weird"
code in `git

blame` benefits enormously from a comment that says "fixes -1234:
race in batch

finish when chunk size > 50". Without it, the temptation to "clean up"
the workaround

and regress the original bug is high.

**Detection signals:**

- A workaround pattern (defensive null check, unusual ordering, retry
loop) with no

ticket reference.

- A PR description that references a ticket, but the code itself has no
marker.

- A commented-out line with no explanation.

**Bad example:**

```apex

// Sometimes returns null even though we just inserted

if (newId == null) { newId = [SELECT Id FROM Account WHERE Name = :name
LIMIT 1].Id; }

```

**Good example:**

```apex

// -1820: Database.insert occasionally returns a SaveResult with
success=true

// but Id=null when the trigger refires; lookup as fallback. Salesforce
W-8932112.

if (newId == null) { newId = [SELECT Id FROM Account WHERE Name = :name
LIMIT 1].Id; }

```

**References:**
https://www.apexhours.com/salesforce-code-comments-best-practices/

---

## RULE SHARED-DOC-004: Keep comments and code in sync — delete stale
comments

**Severity:** low

**Category:** documentation

**Applies to:** apex-class, apex-trigger, lwc-js, lwc-html

**Rationale:** A comment that contradicts the code below it is worse
than no comment —

it actively misleads. When you change behavior, either update the
comment or delete it.

Stale comments are an underestimated source of bugs because reviewers
tend to trust

them.

**Detection signals:**

- A comment describing a behavior or parameter that does not match the
implementation.

- A `// TODO: handle bulk` left in place after the code was bulkified.

- A method-level `@param` referencing a parameter that no longer exists.

**Bad example:**

```apex

/**

* @description Charges a single Account.

* @param accountId Account to charge.

*/

public static void chargeAll(List<Id> accountIds) {

for (Id id : accountIds) { /* ... */ }

}

```

**Good example:**

```apex

/**

* @description Charges all given accounts in a single batch.

* @param accountIds Ids of accounts to charge.

*/

public static void chargeAll(List<Id> accountIds) {

for (Id id : accountIds) { /* ... */ }

}

```

**References:**
https://www.apexhours.com/salesforce-code-comments-best-practices/

---

