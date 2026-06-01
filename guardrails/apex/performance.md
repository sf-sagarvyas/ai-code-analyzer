
# Apex Performance & Scalability Rules

Rules in this file address the highest-impact production failure mode in
Apex: code that

works fine at 10 records and blows up at 10,000. The focus is
bulkification, SOQL/DML

efficiency, governor-limit-aware async patterns, selective queries
against Large Data

Volumes (LDV), and CPU/heap discipline.

Reference limits used in these rules (current as of API v62 / Spring
'26):

- SOQL queries per transaction: 100 sync / 200 async

- SOQL rows returned: 50,000 (both)

- DML statements: 150 per transaction

- DML rows: 10,000 per transaction

- CPU time: 10,000 ms sync / 60,000 ms async

- Heap: 6 MB sync / 12 MB async

- Callouts: 100 per transaction; cumulative timeout 120 s

- Future calls: 50 per Apex invocation

- Queued Apex jobs (`enqueueJob` + batch): 50 per transaction

- Batch Apex query locator: 50 million rows

---

## RULE APEX-PERF-001: No SOQL inside a for/while/do-while loop

**Severity:** critical

**Category:** performance

**Applies to:** apex-class, apex-trigger

**Rationale:** SOQL has a hard ceiling of 100 queries per synchronous
transaction (200 in

async). A query inside a loop hits this limit at 100 iterations
regardless of how small

each query is. Even before the limit is hit, every iteration adds
roughly one round-trip

of latency to the database tier. Refactor to a single bulk query keyed
on a `Set<Id>` or

similar collection, then iterate over the in-memory result.

**Detection signals:**

- `[SELECT ... FROM ...]` or
`Database.query(`/`Database.getQueryLocator(` whose enclosing

scope chain contains a `for (...)`, `while (...)`, or `do { ... } while
(...)` loop.

- Same as above when the loop iterates over `Trigger.new`, a method
parameter that is a

collection, or a query result.

**Bad example:**

```apex

public with sharing class OpportunityRollup {

public static void recalc(List<Opportunity> opps) {

for (Opportunity o : opps) {

// SOQL-in-loop: 1 query per Opportunity

List<OpportunityLineItem> lines = [

SELECT Quantity, UnitPrice FROM OpportunityLineItem

WHERE OpportunityId = :o.Id WITH USER_MODE

];

Decimal total = 0;

for (OpportunityLineItem li : lines) { total += li.Quantity *
li.UnitPrice; }

o.Amount = total;

}

update opps;

}

}

```

**Good example:**

```apex

public with sharing class OpportunityRollup {

public static void recalc(List<Opportunity> opps) {

Set<Id> oppIds = new Map<Id, Opportunity>(opps).keySet();

Map<Id, Decimal> totalsByOpp = new Map<Id, Decimal>();

for (OpportunityLineItem li : [

SELECT OpportunityId, Quantity, UnitPrice

FROM OpportunityLineItem

WHERE OpportunityId IN :oppIds WITH USER_MODE

]) {

Decimal current = totalsByOpp.get(li.OpportunityId);

totalsByOpp.put(li.OpportunityId,

(current == null ? 0 : current) + li.Quantity * li.UnitPrice);

}

for (Opportunity o : opps) {

o.Amount = totalsByOpp.containsKey(o.Id) ? totalsByOpp.get(o.Id) : 0;

}

update opps;

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_gov_limits.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#operationwithlimitsinloop,
https://www.apexhours.com/governor-limits-in-salesforce/

---

## RULE APEX-PERF-002: No DML inside a for/while/do-while loop

**Severity:** critical

**Category:** performance

**Applies to:** apex-class, apex-trigger

**Rationale:** The DML statement limit is 150 per transaction. A `update
record;` call

inside a loop processing more than 150 records throws `LimitException`
and the entire

transaction rolls back. Collect modified records into a `List` and
execute one DML

statement per SObject type outside the loop.

**Detection signals:**

- `insert`, `update`, `upsert`, `delete`, `merge` statements, or
`Database.insert`,

`Database.update`, `Database.upsert`, `Database.delete`,
`Database.merge` calls

inside a loop body.

- `System.enqueueJob(`, `Database.executeBatch(`, `System.schedule(`
inside a loop body.

- `Messaging.sendEmail(` inside a loop body (also subject to a
10/transaction email limit).

**Bad example:**

```apex

public with sharing class ContactDeactivator {

public static void deactivate(List<Contact> contacts) {

for (Contact c : contacts) {

c.Status__c = 'Inactive';

update c; // 1 DML per record - fails at 151 records

}

}

}

```

**Good example:**

```apex

public with sharing class ContactDeactivator {

public static void deactivate(List<Contact> contacts) {

for (Contact c : contacts) { c.Status__c = 'Inactive'; }

update contacts; // single DML, processes up to 10,000 records

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_gov_limits.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#operationwithlimitsinloop

---

## RULE APEX-PERF-003: Triggers must operate on collections (bulk-safe)

**Severity:** critical

**Category:** performance

**Applies to:** apex-trigger, apex-class

**Rationale:** Triggers fire in batches of up to 200 records (Data
Loader, API, flow bulk).

A trigger that treats `Trigger.new[0]` as "the record" or hard-codes any
single-record

assumption fails as soon as the org receives a bulk update. Trigger
handlers must accept

`List<SObject>` / `Map<Id,SObject>` and use set-based logic throughout.

**Detection signals:**

- `Trigger.new[0]` or `Trigger.old[0]` followed by logic that does not
iterate over the

rest of `Trigger.new`.

- A handler method whose signature is `handle(SObject record)` instead
of

`handle(List<SObject> records)`.

- Single-record SOQL `WHERE Id = :Trigger.new[0].Id` or similar.

**Bad example:**

```apex

trigger AccountTrigger on Account (before insert) {

Account a = Trigger.new[0];

a.Description = 'Created by trigger ' + Datetime.now();

}

```

**Good example:**

```apex

trigger AccountTrigger on Account (before insert) {

AccountTriggerHandler.beforeInsert(Trigger.new);

}

public with sharing class AccountTriggerHandler {

public static void beforeInsert(List<Account> accounts) {

Datetime now = Datetime.now();

for (Account a : accounts) {

a.Description = 'Created by trigger ' + now;

}

}

}

```

**References:**
https://trailhead.salesforce.com/content/learn/modules/apex_triggers/bulk_apex_triggers,
https://pmd.github.io/pmd/pmd_rules_apex.html#avoidlogicintrigger

---

## RULE APEX-PERF-004: SOQL filters must be selective against indexed
fields for LDV

**Severity:** high

**Category:** performance

**Applies to:** apex-class, apex-trigger

**Rationale:** Salesforce's query optimizer uses an index only when the
predicate is

"selective" (returns less than ~10% of the table for a standard index,
with stricter

thresholds for very large tables). A non-selective query against a
multi-million-row

object table-scans and triggers `QueryException: Non-selective query
against large object

type`. Always include a filter on an indexed field (`Id`, `Name` where
indexed, lookup

foreign keys, `CreatedDate`, `SystemModstamp`, `LastModifiedDate`,
External Id, Unique

fields, custom indexed fields).

**Detection signals:**

- SOQL with no `WHERE` clause against `Account`, `Contact`,
`Opportunity`, `Case`, `Task`,

`Event`, custom big-object-likely tables.

- `WHERE` predicates that begin with `NOT`, `!=`, `LIKE '%...'`, or
compare an indexed

field to `null`.

- Boolean field used as the only filter when the field has poor
cardinality.

**Bad example:**

```apex

public with sharing class CaseScanner {

public static List<Case> findOpen() {

// No WHERE on indexed field; non-selective on large Case tables

return [SELECT Id, Subject FROM Case WHERE IsClosed = false WITH
USER_MODE];

}

}

```

**Good example:**

```apex

public with sharing class CaseScanner {

public static List<Case> findOpen(Datetime since) {

return [

SELECT Id, Subject

FROM Case

WHERE IsClosed = false

AND LastModifiedDate >= :since // indexed audit field

AND OwnerId IN :ownerScope()

WITH USER_MODE

LIMIT 5000

];

}

private static Set<Id> ownerScope() { /* ... */ return new Set<Id>(); }

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.salesforce_large_data_volumes_bp.meta/salesforce_large_data_volumes_bp/,
https://www.apexhours.com/how-salesforce-query-optimizer-works-for-ldv/,
https://pmd.github.io/pmd/pmd_rules_apex.html#avoidnonrestrictivequeries

---

## RULE APEX-PERF-005: Use SOQL FOR loops for large result sets to bound
heap

**Severity:** high

**Category:** performance

**Applies to:** apex-class

**Rationale:** Assigning a SOQL result to a `List<SObject>` loads every
record into heap

at once; with a 6 MB synchronous heap budget you hit `LimitException:
Apex heap size too

large` long before the 50,000-row SOQL ceiling. A SOQL `for` loop chunks
the result into

batches of 200 (singular form: 1) internally, keeping heap consumption
flat regardless of

result size.

**Detection signals:**

- `List<SObject> rows = [SELECT ... FROM ... WHERE ...];` followed by a
`for` loop that

only reads the rows once and could process them in chunks.

- Code that selects more than ~10,000 rows for in-memory processing.

- Heap-heavy operations (string concatenation, JSON serialization)
inside a loop over a

fully-materialized list.

**Bad example:**

```apex

public with sharing class BigExport {

public static String exportCsv() {

List<Account> rows = [SELECT Id, Name, Industry FROM Account WITH
USER_MODE];

String csv = '';

for (Account a : rows) { csv += a.Id + ',' + a.Name + ',' + a.Industry +
'\n'; }

return csv;

}

}

```

**Good example:**

```apex

public with sharing class BigExport {

public static String exportCsv() {

// Chunked iteration keeps heap bounded

List<String> rowStrings = new List<String>();

for (Account a : [

SELECT Id, Name, Industry FROM Account WITH USER_MODE

]) {

rowStrings.add(a.Id + ',' + a.Name + ',' + a.Industry);

}

return String.join(rowStrings, '\n');

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/langCon_apex_SOQL_VLSQ.htm,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_gov_limits.htm

---

## RULE APEX-PERF-006: SELECT only the fields you use

**Severity:** medium

**Category:** performance

**Applies to:** apex-class, apex-trigger

**Rationale:** Wide queries (every field on a heavily-extended Account)
consume heap,

serialize more bytes between the database and Apex, and force FLS checks
across all

selected fields. They also break silently when a field is later marked
sensitive and

filtered by FLS. List explicit fields, and review the list when
refactoring callers.

**Detection signals:**

- Use of `Schema.SObjectType.X.fields.getMap()` to build a SELECT
*-equivalent.

- Selecting more than 25 fields when the calling method only reads 2-3.

- Selecting fields you never reference in subsequent code (dead-field
detection).

**Bad example:**

```apex

public with sharing class AccountHeader {

public static String displayName(Id accountId) {

Account a = [

SELECT FIELDS(ALL)

FROM Account WHERE Id = :accountId WITH USER_MODE LIMIT 1

];

return a.Name;

}

}

```

**Good example:**

```apex

public with sharing class AccountHeader {

public static String displayName(Id accountId) {

return [

SELECT Name FROM Account WHERE Id = :accountId WITH USER_MODE LIMIT 1

].Name;

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_SOQL.htm,
https://www.apexhours.com/soql-best-practices/

---

## RULE APEX-PERF-007: Use Limits.* to short-circuit before hitting a
governor limit

**Severity:** high

**Category:** performance

**Applies to:** apex-class

**Rationale:** Code that processes a variable-sized workload (chained
queueable, batch

ascending into a complex transaction, recursive trigger logic) should
check

`Limits.getQueries()` / `Limits.getDmlStatements()` /
`Limits.getCpuTime()` against

`Limits.getLimitX()` before doing more expensive work. Hitting the limit
produces an

uncatchable `System.LimitException` that rolls back the entire
transaction; pre-emptive

checks let you commit partial progress and re-queue.

**Detection signals:**

- A long-running method (heavy SOQL, DML, callouts) with no `Limits.*`
guard.

- Recursive Apex (queueable enqueuing itself, batch chaining batch)
without limit checks.

- Loops over external data of unknown size with no early-exit on
remaining budget.

**Bad example:**

```apex

public class TaskBackfill implements Queueable {

public void execute(QueueableContext ctx) {

for (Task t : [SELECT Id, Status FROM Task WHERE Status__c = null WITH
USER_MODE]) {

t.Status__c = 'New';

update t; // unbounded; will hit DML/CPU limit

}

}

}

```

**Good example:**

```apex

public class TaskBackfill implements Queueable {

public void execute(QueueableContext ctx) {

List<Task> toUpdate = new List<Task>();

for (Task t : [SELECT Id, Status__c FROM Task WHERE Status__c = null
WITH USER_MODE LIMIT 5000]) {

if (Limits.getCpuTime() > Limits.getLimitCpuTime() - 5000) { break; }

t.Status__c = 'New';

toUpdate.add(t);

}

update toUpdate;

if (!toUpdate.isEmpty() && !Test.isRunningTest()) {

System.enqueueJob(new TaskBackfill()); // continue in next transaction

}

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexref.meta/apexref/apex_class_System_Limits.htm,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_limits_tips.htm

---

## RULE APEX-PERF-008: Use Queueable + Finalizer instead of @future for
new async work

**Severity:** medium

**Category:** performance

**Applies to:** apex-class

**Rationale:** `@future` predates Queueable and has well-known
limitations: no chaining,

no parameter types beyond primitives and primitive collections, no
failure callback, and

a hard cap of 50 calls per Apex invocation. Queueable supports object
parameters, chaining,

and as of recent releases pairs with `System.Finalizer` so that retries,
logging, and

cleanup run even when the queueable fails or hits a limit.

**Detection signals:**

- `@future` annotation in newly authored code.

- A `@future(callout=true)` callout that cannot be retried on failure
(no Finalizer).

- A Queueable that does not attach a Finalizer despite performing
callouts or critical

side effects.

**Bad example:**

```apex

public class CalloutWorker {

@future(callout=true)

public static void send(Id recordId) {

// No retry, no failure hook

new Http().send(buildRequest(recordId));

}

private static HttpRequest buildRequest(Id id) { return new
HttpRequest(); }

}

```

**Good example:**

```apex

public class CalloutWorker implements Queueable, Database.AllowsCallouts
{

private Id recordId;

public CalloutWorker(Id recordId) { this.recordId = recordId; }

public void execute(QueueableContext ctx) {

System.attachFinalizer(new CalloutFinalizer(recordId));

new Http().send(buildRequest(recordId));

}

private HttpRequest buildRequest(Id id) { return new HttpRequest(); }

}

public class CalloutFinalizer implements System.Finalizer {

private Id recordId;

public CalloutFinalizer(Id id) { this.recordId = id; }

public void execute(FinalizerContext ctx) {

if (ctx.getResult() == ParentJobResult.UNHANDLED_EXCEPTION) {

// log and re-enqueue with backoff

}

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_transaction_finalizers.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#avoidfutureannotation,
https://pmd.github.io/pmd/pmd_rules_apex.html#queueablewithoutfinalizer

---

## RULE APEX-PERF-009: Batch Apex must use a selective `getQueryLocator`

**Severity:** high

**Category:** performance

**Applies to:** apex-class

**Rationale:** `Database.Batchable.start` returns a
`Database.QueryLocator` capable of

processing up to 50 million rows, but the locator is only efficient when
the underlying

SOQL is selective. A non-selective locator times out (120 s per query)
or hits the

`QueryException: Non-selective` ceiling. Batch start methods that return
a `List` skip the

locator path entirely and are capped at 50,000 rows.

**Detection signals:**

- `start(Database.BatchableContext bc)` that returns

`Database.getQueryLocator('SELECT ... FROM big_object')` with no WHERE
filter on an

indexed field.

- `start` returning `List<SObject>` for an object likely to exceed 50k
rows.

- `executeBatch(new MyBatch(), 200)` with `200` chosen for a heavy
callout-per-record

workload (callout limit per batch chunk is 100).

**Bad example:**

```apex

public class AccountBackfillBatch implements Database.Batchable<SObject>
{

public Database.QueryLocator start(Database.BatchableContext bc) {

return Database.getQueryLocator('SELECT Id FROM Account');

}

public void execute(Database.BatchableContext bc, List<Account> scope) {
/* ... */ }

public void finish(Database.BatchableContext bc) { }

}

```

**Good example:**

```apex

public class AccountBackfillBatch implements Database.Batchable<SObject>
{

public Database.QueryLocator start(Database.BatchableContext bc) {

return Database.getQueryLocator([

SELECT Id FROM Account

WHERE Backfill_Needed__c = true AND LastModifiedDate >= LAST_N_DAYS:30

WITH USER_MODE

]);

}

public void execute(Database.BatchableContext bc, List<Account> scope) {
/* ... */ }

public void finish(Database.BatchableContext bc) { }

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_batch_interface.htm,
https://developer.salesforce.com/docs/atlas.en-us.salesforce_large_data_volumes_bp.meta/salesforce_large_data_volumes_bp/

---

## RULE APEX-PERF-010: Aggregate with COUNT/SUM/AVG instead of looping
over rows

**Severity:** medium

**Category:** performance

**Applies to:** apex-class

**Rationale:** Performing aggregation in Apex requires loading every row
into heap and

running CPU cycles on them. Pushing the aggregation to the SOQL engine
via

`COUNT()`/`SUM()`/`AVG()`/`MAX()`/`MIN()` and `GROUP BY` returns one (or
N-group) rows,

typically 10-100x faster and well clear of heap and CPU limits.

**Detection signals:**

- `for (X x : [SELECT ... FROM X])` immediately followed by `count++` or
`total += x.Field`.

- Selecting an entire object just to do `rows.size()` for a count.

- Looping a result set to build a `Map<Id, Decimal>` of per-group
totals.

**Bad example:**

```apex

public static Integer countOpenCasesFor(Id accountId) {

Integer count = 0;

for (Case c : [

SELECT Id FROM Case WHERE AccountId = :accountId AND IsClosed = false
WITH USER_MODE

]) { count++; }

return count;

}

```

**Good example:**

```apex

public static Integer countOpenCasesFor(Id accountId) {

return [

SELECT COUNT() FROM Case

WHERE AccountId = :accountId AND IsClosed = false WITH USER_MODE

];

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.soql_sosl.meta/soql_sosl/sforce_api_calls_soql_select_agg_functions.htm

---

## RULE APEX-PERF-011: Avoid System.debug in production paths; use log
levels

**Severity:** low

**Category:** performance

**Applies to:** apex-class, apex-trigger

**Rationale:** `System.debug` writes to the debug log; every call
lengthens the transaction

and consumes CPU. The cost is small individually but cumulative inside
loops or hot paths.

Use `System.debug(LoggingLevel.FINE, ...)` so log capture stays opt-in
via trace flag, or

delete debug calls entirely after development.

**Detection signals:**

- `System.debug(<msg>);` without a `LoggingLevel` argument.

- `System.debug` inside a loop body.

- `System.debug(JSON.serialize(<largeObject>))` which is expensive even
when log capture is off.

**Bad example:**

```apex

for (Account a : accounts) {

System.debug('processing ' + JSON.serialize(a));

// ...

}

```

**Good example:**

```apex

for (Account a : accounts) {

System.debug(LoggingLevel.FINE, () => 'processing ' + a.Id); // computed
lazily

// ...

}

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#avoiddebugstatements,
https://pmd.github.io/pmd/pmd_rules_apex.html#debugsshouldsuselogginglevel

---

## RULE APEX-PERF-012: Cache describe results; do not call
DescribeSObjectResult in loops

**Severity:** medium

**Category:** performance

**Applies to:** apex-class

**Rationale:** `Schema.getGlobalDescribe()`,
`SObjectType.getDescribe()`, and

`SObjectField.getDescribe()` are expensive — each call traverses the
schema and counts

against CPU time. Calling them inside a loop or every method invocation
is a known CPU

sink. Cache the describe in a static map keyed by SObject name or field.

**Detection signals:**

- `Schema.getGlobalDescribe()` called inside a loop.

- `.getDescribe()` chained on a `SObjectType` inside a loop or
per-record helper.

- No static cache in a utility class that resolves field metadata for
many fields.

**Bad example:**

```apex

public class FieldUtils {

public static Boolean isCreateable(String sObjName, String fieldName) {

return Schema.getGlobalDescribe()

.get(sObjName).getDescribe().fields.getMap()

.get(fieldName).getDescribe().isCreateable();

}

}

```

**Good example:**

```apex

public class FieldUtils {

private static final Map<String, Schema.DescribeSObjectResult> CACHE

= new Map<String, Schema.DescribeSObjectResult>();

public static Boolean isCreateable(String sObjName, String fieldName) {

Schema.DescribeSObjectResult d = CACHE.get(sObjName);

if (d == null) {

d = Schema.getGlobalDescribe().get(sObjName).getDescribe();

CACHE.put(sObjName, d);

}

Schema.DescribeFieldResult f =
d.fields.getMap().get(fieldName).getDescribe();

return f.isCreateable();

}

}

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#eagerlyloadeddescribesobjectresult,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_dynamic_describe_objects_understanding.htm

---

## RULE APEX-PERF-013: Respect the queueable chain-depth and
one-job-per-context limits

**Severity:** high

**Category:** performance

**Applies to:** apex-class

**Rationale:** Inside a queueable execution, you may enqueue at most 1
additional queueable

job and 50 future calls. In Developer Edition orgs the chain depth is
capped at 5; in

production it is effectively unlimited but observable in logs and easy
to runaway. A loop

calling `System.enqueueJob` more than once per execution throws
`LimitException`.

**Detection signals:**

- `System.enqueueJob` called inside a loop in a class that `implements
Queueable`.

- Multiple unconditional `System.enqueueJob` calls in the same
`execute(QueueableContext)`.

- No exit condition for a self-chained queueable.

**Bad example:**

```apex

public class FanOut implements Queueable {

public void execute(QueueableContext ctx) {

for (Id id : someIds) {

System.enqueueJob(new ChildJob(id)); // throws on iteration 2

}

}

}

```

**Good example:**

```apex

public class FanOut implements Queueable {

private List<Id> remaining;

public FanOut(List<Id> ids) { this.remaining = ids; }

public void execute(QueueableContext ctx) {

// process current batch

Integer chunkSize = 200;

List<Id> next = new List<Id>();

for (Integer i = chunkSize; i < remaining.size(); i++) {
next.add(remaining[i]); }

// process first chunk inline...

if (!next.isEmpty()) { System.enqueueJob(new FanOut(next)); }

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_queueing_jobs.htm,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_gov_limits.htm

---

## RULE APEX-PERF-014: Use Platform Cache or static caching for org-wide
constants

**Severity:** medium

**Category:** performance

**Applies to:** apex-class

**Rationale:** Frequently-read configuration (custom metadata records,
custom settings,

named credential lookups) re-queried on every transaction wastes SOQL
queries and CPU.

Static class variables persist for the transaction; Platform Cache (Org
or Session

partition) persists across transactions. Cache invalidation must be
considered, but the

performance win on read-heavy paths is large.

**Detection signals:**

- A SOQL query against a Custom Metadata Type or Custom Setting executed
every method

call rather than once per transaction.

- Repeated reads from the same configuration object inside a request
handler.

- No invalidation hook (platform-event subscriber, scheduled refresh)
for cached config

that changes infrequently.

**Bad example:**

```apex

public class FeatureFlags {

public static Boolean isEnabled(String name) {

return [SELECT Enabled__c FROM Feature_Flag__mdt

WHERE DeveloperName = :name WITH USER_MODE LIMIT 1].Enabled__c;

}

}

```

**Good example:**

```apex

public class FeatureFlags {

private static Map<String, Boolean> cache;

public static Boolean isEnabled(String name) {

if (cache == null) {

cache = new Map<String, Boolean>();

for (Feature_Flag__mdt f : [

SELECT DeveloperName, Enabled__c FROM Feature_Flag__mdt

]) { cache.put(f.DeveloperName, f.Enabled__c); }

}

return cache.containsKey(name) && cache.get(name);

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_cache_namespace_overview.htm,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_limits_tips.htm

---

## RULE APEX-PERF-015: Avoid expensive method calls inside loops

**Severity:** medium

**Category:** performance

**Applies to:** apex-class, apex-trigger

**Rationale:** Methods that perform DML, SOQL, describe operations, JSON
parsing, or

regex compilation are expensive. Calling them per iteration multiplies
the cost linearly

in the worst case and quadratically when the called method itself
iterates. Hoist

invariant work out of the loop.

**Detection signals:**

- Method calls inside a loop whose argument does not depend on the loop
variable.

- Repeated
`JSON.deserialize`/`Pattern.compile`/`Schema.*Describe*`/`UserInfo.*`

invocations inside a loop body.

- `getRecordTypeInfosByDeveloperName()` called per record.

**Bad example:**

```apex

for (Account a : accounts) {

Schema.RecordTypeInfo rt = Schema.SObjectType.Account

.getRecordTypeInfosByDeveloperName().get('Partner');

a.RecordTypeId = rt.getRecordTypeId();

}

```

**Good example:**

```apex

Id partnerRtId = Schema.SObjectType.Account

.getRecordTypeInfosByDeveloperName().get('Partner').getRecordTypeId();

for (Account a : accounts) { a.RecordTypeId = partnerRtId; }

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#operationwithhighcostinloop

---

