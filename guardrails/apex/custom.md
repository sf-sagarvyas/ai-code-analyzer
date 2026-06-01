
# Custom Apex Rules

User-authored rules for apex code review. Rules added via the Guardrails
Configuration UI land here.

---

## RULE CUSTOM-NAME-001: Variable names express the data's meaning, not
just its type

**Severity:** medium

**Category:** naming

**Applies to:** apex-class, apex-trigger

**Rationale:** Variable names should describe what the value represents
in the business or technical domain, not merely repeat its data type or
act as a placeholder. Names like accs, i, str, lst, or acc1 force every
reader to scan the surrounding code to figure out the variable's role;
meaningful names like accountsToInsert, retryCount, parentAccount, or
anthropicApiKey convey intent at the call site. This becomes critical in
long methods, when reviewing diffs in PRs, and when debugging in
production — a log line reading accountsToInsert.size() > 200 tells a
different story than accs.size() > 200. Single-letter names are
acceptable only for trivial loop counters (Integer i in for-i loops) and
short-scope iteration aliases (for (Account a : accounts)) where the
alias scope is a few lines. Everything else should name the concept, not
the type.

**Bad example:**

```apex

public class AccountService {

public static void doIt(List<Account> accs) {

Integer i = 0;

for (Account a : accs) {

String str = a.Name;

if (str.contains('Test')) i++;

}

System.debug(i);

}

}

```

**Good example:**

```apex

public class AccountService {

public static void countTestAccounts(List<Account> candidateAccounts) {

Integer testAccountCount = 0;

for (Account candidateAccount : candidateAccounts) {

String accountName = candidateAccount.Name;

if (accountName.contains('Test')) testAccountCount++;

}

System.debug(testAccountCount);

}

}

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#shortvariable,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_naming_conventions.htm

---

