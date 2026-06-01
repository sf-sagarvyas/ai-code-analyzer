
# Apex Security Rules

These rules cover CRUD/FLS enforcement, sharing semantics, injection
attacks, secret handling,

cryptography, and other security concerns for server-side Apex. The
rules align with

Salesforce platform security defaults (Apex compiled at API v67.0 and
above runs SOQL/DML in

user mode by default) but also handle legacy and explicit-mode code that
is still common in

brownfield orgs.

---

## RULE APEX-SEC-001: Enforce user mode for SOQL, SOSL, and DML

**Severity:** critical

**Category:** security

**Applies to:** apex-class, apex-trigger

**Rationale:** Apex runs in system context by default for code compiled
below API v67.0,

meaning queries and DML bypass the running user's object permissions,
field-level security

(FLS), and sharing rules. This produces silent data-exposure or
unauthorized-write bugs that

classic security review cannot catch by reading the class header alone.
From Spring '26

(API v67.0) onward, the platform default is user mode for plain
SOQL/DML, but legacy code,

older API versions, and explicit `Database.SYSTEM_MODE` calls keep the
risk live.

**Detection signals:**

- `[SELECT ... FROM ...]` inline SOQL or `Database.query(...)` calls in
classes whose API

version (in the `.cls-meta.xml`) is below 67.0 and which lack `WITH
USER_MODE`,

`WITH SECURITY_ENFORCED`, or `Security.stripInaccessible(...)`.

- `Database.insert(records)`, `Database.update`, `Database.upsert`,
`Database.delete`,

`Database.merge` called without `AccessLevel.USER_MODE`.

- `insert records;`/`update records;` etc. in a class compiled below API
v67.0.

- Explicit use of `AccessLevel.SYSTEM_MODE` outside a justified,
comment-explained block.

**Bad example:**

```apex

public with sharing class AccountReader {

@AuraEnabled(cacheable=true)

public static List<Account> getRecent() {

// API v62.0 class: defaults to system mode, FLS not enforced

return [SELECT Id, Name, AnnualRevenue FROM Account ORDER BY CreatedDate
DESC LIMIT 50];

}

}

```

**Good example:**

```apex

public with sharing class AccountReader {

@AuraEnabled(cacheable=true)

public static List<Account> getRecent() {

return [

SELECT Id, Name, AnnualRevenue

FROM Account

WITH USER_MODE

ORDER BY CreatedDate DESC

LIMIT 50

];

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_with_security_enforced.htm,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_with_security_stripInaccessible.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#apexcrudviolation

---

## RULE APEX-SEC-002: Never concatenate user input into dynamic SOQL

**Severity:** critical

**Category:** security

**Applies to:** apex-class, apex-trigger

**Rationale:** String-concatenated SOQL is the canonical SOQL injection
vector. An attacker

who controls part of the query string can read records the running user
could not have

queried directly (`OR Id != null`), or pivot the query onto a different
object/field. Bind

variables in inline SOQL automatically escape input; for legitimate
dynamic SOQL, the only

safe patterns are bind variables in
`Database.queryWithBinds`/`Database.getQueryLocatorWithBinds`

or explicit `String.escapeSingleQuotes` plus type-cast/whitelist for
non-string inputs.

**Detection signals:**

- `Database.query(`, `Database.getQueryLocator(`,
`Database.countQuery(`,

`Search.query(` whose argument is built with the `+` operator and
includes a method

parameter, an `Aura`/`AuraEnabled` argument, a URL parameter
(`ApexPages.currentPage().getParameters()`),

or a value coming from an HTTP body.

- Variables interpolated into a query string with `String.format` where
the values are not

hard-coded literals.

- Use of `String.escapeSingleQuotes` on a value that is later
cast/parsed as a number,

date, or used in an `ORDER BY`/field-name position (escapeSingleQuotes
does not protect

these).

**Bad example:**

```apex

public with sharing class ContactSearch {

@AuraEnabled(cacheable=true)

public static List<Contact> search(String lastName) {

String soql = 'SELECT Id, Email FROM Contact WHERE LastName = \'' +
lastName + '\'';

return Database.query(soql);

}

}

```

**Good example:**

```apex

public with sharing class ContactSearch {

@AuraEnabled(cacheable=true)

public static List<Contact> search(String lastName) {

// Static SOQL with bind variable - injection-safe by construction

return [

SELECT Id, Email

FROM Contact

WHERE LastName = :lastName

WITH USER_MODE

LIMIT 200

];

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/pages_security_tips_soql_injection.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#apexsoqlinjection,
https://trailhead.salesforce.com/content/learn/modules/secure-serverside-development/mitigate-soql-injection

---

## RULE APEX-SEC-003: Declare explicit sharing posture on every Apex
class

**Severity:** high

**Category:** security

**Applies to:** apex-class

**Rationale:** A class without `with sharing`, `without sharing`, or
`inherited sharing`

runs without enforcing record-level sharing rules. The default behavior
depends on the

calling context, which makes the actual security posture invisible from
the class itself.

This is one of the most common patterns flagged in Salesforce security
reviews and

AppExchange security review failures.

**Detection signals:**

- A top-level class declaration that does not include one of `with
sharing`,

`without sharing`, or `inherited sharing`.

- Inner classes that perform DML or SOQL and rely on the outer class's
sharing keyword

without being explicit (acceptable, but call out if the outer class is
also missing).

- Trigger handler classes without sharing keyword.

**Bad example:**

```apex

public class AccountService {

public static List<Account> getAccountsForOwner(Id ownerId) {

return [SELECT Id, Name FROM Account WHERE OwnerId = :ownerId];

}

}

```

**Good example:**

```apex

public with sharing class AccountService {

public static List<Account> getAccountsForOwner(Id ownerId) {

return [

SELECT Id, Name

FROM Account

WHERE OwnerId = :ownerId

WITH USER_MODE

];

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_keywords_sharing.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#apexsharingviolations

---

## RULE APEX-SEC-004: Validate CRUD before DML in system-mode code paths

**Severity:** critical

**Category:** security

**Applies to:** apex-class, apex-trigger

**Rationale:** When code runs in system mode (e.g., `without sharing`
utility, a legacy

class below API v67.0, or `AccessLevel.SYSTEM_MODE` explicitly), the
platform will not

check that the user is allowed to create/update/delete the records.
Skipping CRUD checks

in this path is an authorization-bypass vulnerability.

**Detection signals:**

- `insert`/`update`/`delete`/`upsert` statements in a class that is
`without sharing` or

explicitly system-mode, where the SObject type is not first checked with

`Schema.SObjectType.X.isCreateable()`/`isUpdateable()`/`isDeletable()`
or wrapped in

`Security.stripInaccessible(AccessType.X, records)`.

- DML on records derived from user input (e.g., a `@AuraEnabled`
parameter) without any

permission check.

**Bad example:**

```apex

public without sharing class CaseEscalator {

@AuraEnabled

public static void escalate(List<Case> cases) {

for (Case c : cases) { c.Status = 'Escalated'; }

update cases; // no CRUD check, runs as system

}

}

```

**Good example:**

```apex

public without sharing class CaseEscalator {

@AuraEnabled

public static void escalate(List<Case> cases) {

SObjectAccessDecision decision = Security.stripInaccessible(

AccessType.UPDATABLE, cases

);

for (Case c : decision.getRecords()) { c.Status = 'Escalated'; }

update decision.getRecords();

}

}

```

**References:**
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_with_security_stripInaccessible.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#apexcrudviolation,
https://developer.salesforce.com/docs/atlas.en-us.apexcode.meta/apexcode/apex_classes_perms_enforcing.htm

---

## RULE APEX-SEC-005: Use Named Credentials for outbound callouts; never
hardcode secrets

**Severity:** critical

**Category:** security

**Applies to:** apex-class

**Rationale:** API keys, passwords, OAuth tokens, and connection strings
in source files

leak to source control, sandboxes, deployment logs, and managed-package
metadata. Named

Credentials (and the newer External Credentials/Permission-Set-based
credentials) keep

secrets out of code and rotate cleanly. They also make per-environment
credential

management trivial (sandbox vs prod) without code changes.

**Detection signals:**

- String literals matching `Bearer `, `Basic `, `Authorization:`,
`api_key=`, or 32+ char

hex/base64 tokens in `HttpRequest.setHeader` or `HttpRequest.setBody`
calls.

- `req.setEndpoint('https://...')` with an absolute URL pointing at a
non-Salesforce host

instead of `'callout:NamedCred/path'`.

- `setHeader('Authorization', '...')` instead of relying on the Named
Credential's

authentication.

**Bad example:**

```apex

public with sharing class BillingClient {

public static HttpResponse charge(Decimal amount) {

HttpRequest req = new HttpRequest();

req.setEndpoint('https://api.billing.example.com/v1/charge');

req.setHeader('Authorization', 'Bearer sk_live_AbC123XyZ987secrethere');

req.setMethod('POST');

return new Http().send(req);

}

}

```

**Good example:**

```apex

public with sharing class BillingClient {

public static HttpResponse charge(Decimal amount) {

HttpRequest req = new HttpRequest();

req.setEndpoint('callout:Billing_API/v1/charge'); // Named Credential

req.setMethod('POST');

return new Http().send(req);

}

}

```

**References:**
https://help.salesforce.com/s/articleView?id=sf.named_credentials_about.htm,
https://pmd.github.io/pmd/pmd_rules_apex.html#apexsuggestusingnamedcred

---

## RULE APEX-SEC-006: Require HTTPS endpoints for all outbound callouts

**Severity:** high

**Category:** security

**Applies to:** apex-class

**Rationale:** HTTP callouts transmit request and response bodies in
plaintext, exposing

session data, PII, and credentials to passive network observers.
Salesforce blocks HTTP

endpoints by default unless the admin explicitly added them to Remote
Site Settings, but

unblocked HTTP destinations and `mockHttpCallout` test artifacts still
slip through code

review.

**Detection signals:**

- `HttpRequest.setEndpoint(...)` whose argument starts with `'http://'`.

- Remote site settings or Named Credentials configured with `http://`
URLs (when the

metadata is also in scope for review).

- Test fixtures using `'http://'` endpoints that mirror production
patterns.

**Bad example:**

```apex

HttpRequest req = new HttpRequest();

req.setEndpoint('http://legacy.partner.example.com/lookup');

req.setMethod('GET');

```

**Good example:**

```apex

HttpRequest req = new HttpRequest();

req.setEndpoint('callout:Partner_Lookup'); // Named Credential uses
HTTPS

req.setMethod('GET');

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#apexinsecureendpoint

---

## RULE APEX-SEC-007: Never construct cryptographic keys or IVs from
constants

**Severity:** critical

**Category:** security

**Applies to:** apex-class

**Rationale:** A hardcoded AES key or IV makes every ciphertext
recoverable by anyone with

read access to the source. Equally dangerous: deriving a key from a
tenant-fixed value

(org Id, namespace, username) means anyone with the same input recreates
the key. Use

`Crypto.generateAesKey(256)` and a random per-message IV
(`Crypto.generateAesKey` returns

a fresh key; for IVs use `Crypto.generateRandomBytes(16)`).

**Detection signals:**

- `Blob.valueOf('...')` or `EncodingUtil.base64Decode('...')` passed as
the key argument

to `Crypto.encryptWithManagedIV`, `Crypto.encrypt`, `Crypto.decrypt`, or

`Crypto.decryptWithManagedIV`.

- Hex/base64 string literals near `Crypto.*` calls.

- Reuse of the same IV across multiple encrypt calls (variable assigned
once at class

scope and used in a loop).

**Bad example:**

```apex

public class TokenVault {

private static final Blob KEY =
EncodingUtil.base64Decode('YWJjZGVmZ2hpamtsbW5vcA==');

public static Blob encrypt(String plaintext) {

return Crypto.encryptWithManagedIV('AES256', KEY,
Blob.valueOf(plaintext));

}

}

```

**Good example:**

```apex

public class TokenVault {

// Key is stored encrypted in a Protected Custom Setting / External
Credential

public static Blob encrypt(String plaintext, Blob key) {

return Crypto.encryptWithManagedIV('AES256', key,
Blob.valueOf(plaintext));

}

public static Blob freshKey() {

return Crypto.generateAesKey(256);

}

}

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#apexbadcrypto,
https://developer.salesforce.com/docs/atlas.en-us.apexref.meta/apexref/apex_class_System_Crypto.htm

---

## RULE APEX-SEC-008: Sanitize URL parameters before reflecting them to
UI

**Severity:** high

**Category:** security

**Applies to:** apex-class

**Rationale:** Any value read from
`ApexPages.currentPage().getParameters()` or

`RestContext.request` and written into a Visualforce page, an `addError`
call, or an Aura/LWC

response can become a stored or reflected XSS vector.
`String.escapeHtml4` and Visualforce's

default escaping handle most cases; `addError(..., false)` and
`outputText escape="false"`

deliberately disable escaping and must be justified.

**Detection signals:**

- `ApexPages.currentPage().getParameters().get(...)` whose return value
flows into

`addError`, a Visualforce expression, or a String returned from an
`@AuraEnabled` method

without being escaped.

- `Trigger.new[i].addError(message, false)` where `message` is built
from external input.

- `<apex:outputText value="{!param}" escape="false"/>` with `param`
derived from query string.

**Bad example:**

```apex

public with sharing class WelcomeController {

public String greeting { get; private set; }

public WelcomeController() {

String name = ApexPages.currentPage().getParameters().get('name');

greeting = 'Hello, ' + name; // rendered with escape="false" in the page

}

}

```

**Good example:**

```apex

public with sharing class WelcomeController {

public String greeting { get; private set; }

public WelcomeController() {

String name = ApexPages.currentPage().getParameters().get('name');

greeting = 'Hello, ' + (name == null ? '' : name.escapeHtml4());

}

}

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#apexxssfromurlparam,
https://pmd.github.io/pmd/pmd_rules_apex.html#apexxssfromescapefalse

---

## RULE APEX-SEC-009: Never perform DML in class constructors or
initializers

**Severity:** high

**Category:** security

**Applies to:** apex-class

**Rationale:** A Visualforce page or LWC that instantiates a controller
can be navigated to

via a forged GET request from a different origin. DML inside the
constructor or a static

initializer fires on that GET, opening a Cross-Site Request Forgery
(CSRF) vector that

bypasses the platform's anti-CSRF token. The same logic moved into an
action method (POST)

benefits from the CSRF token automatically.

**Detection signals:**

- `insert`, `update`, `upsert`, `delete`, `merge`, or `Database.*` calls
inside a

constructor body.

- `insert`/`update` etc. inside a `static { ... }` initializer block.

- Trigger logic that writes records based on parameters obtained from

`ApexPages.currentPage().getParameters()` at construction time.

**Bad example:**

```apex

public with sharing class CaseAuditLogger {

public CaseAuditLogger() {

insert new Audit_Log__c(Source__c = 'PageLoad', UserId__c =
UserInfo.getUserId());

}

}

```

**Good example:**

```apex

public with sharing class CaseAuditLogger {

public CaseAuditLogger() { /* no DML here */ }

public PageReference logVisit() { // invoked by an action attribute on a
button (POST)

insert new Audit_Log__c(Source__c = 'PageLoad', UserId__c =
UserInfo.getUserId());

return null;

}

}

```

**References:** https://pmd.github.io/pmd/pmd_rules_apex.html#apexcsrf,
https://developer.salesforce.com/docs/atlas.en-us.securityImplGuide.meta/securityImplGuide/security_arch_csrf.htm

---

## RULE APEX-SEC-010: Avoid global open redirects from user-controlled
URLs

**Severity:** high

**Category:** security

**Applies to:** apex-class

**Rationale:** Returning a `PageReference` whose URL is built from a
request parameter

allows an attacker to craft a Salesforce link that bounces the victim to
an attacker-

controlled phishing site (open redirect). The mitigation is to validate
the target URL

against an allowlist of relative paths or known hosts before
redirecting.

**Detection signals:**

- `return new PageReference(<expr>)` or `Apex Redirect` where `<expr>`
contains a value

from `getParameters()`, `RestContext.request`, or a method parameter
without prior

validation.

- `PageReference pr = new PageReference(url); pr.setRedirect(true);
return pr;` where

`url` is externally controlled.

**Bad example:**

```apex

public PageReference goBack() {

String returnUrl =
ApexPages.currentPage().getParameters().get('retUrl');

return new PageReference(returnUrl); // open redirect

}

```

**Good example:**

```apex

public PageReference goBack() {

String returnUrl =
ApexPages.currentPage().getParameters().get('retUrl');

if (returnUrl == null || !returnUrl.startsWith('/')) {

returnUrl = '/lightning/o/Account/home';

}

return new PageReference(returnUrl);

}

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#apexopenredirect

---

## RULE APEX-SEC-011: Never call dangerous setPassword or system methods
from user code

**Severity:** critical

**Category:** security

**Applies to:** apex-class

**Rationale:** `System.setPassword`/`Site.passwordlessLogin`-style
methods change a user's

credentials. Exposing them through `@AuraEnabled` or a public webservice
without an

authorization check (running user must be an admin, target user must be
permitted, etc.)

creates an account-takeover vulnerability.

**Detection signals:**

- `System.setPassword(`, `Site.passwordlessLogin(`,
`Site.forgotPassword(`, or

`Auth.SessionManagement.setSessionLevel(` in a method that is
`@AuraEnabled`, `webservice`,

or invocable, without a preceding `if
(!FeatureManagement.checkPermission(...))` /

custom-permission gate.

- A class that is not `without sharing` admin-only delegating to these
methods.

**Bad example:**

```apex

@AuraEnabled

public static void resetPassword(Id userId, String newPwd) {

System.setPassword(userId, newPwd);

}

```

**Good example:**

```apex

@AuraEnabled

public static void resetPassword(Id userId, String newPwd) {

if (!FeatureManagement.checkPermission('Manage_User_Passwords')) {

throw new AuraHandledException('Not authorized');

}

System.setPassword(userId, newPwd);

}

```

**References:**
https://pmd.github.io/pmd/pmd_rules_apex.html#apexdangerousmethods,
https://developer.salesforce.com/docs/atlas.en-us.apexref.meta/apexref/apex_class_System_System.htm

---

## RULE APEX-SEC-012: Treat all `@AuraEnabled` and REST methods as
untrusted entry points

**Severity:** high

**Category:** security

**Applies to:** apex-class

**Rationale:** `@AuraEnabled` and `@RestResource` methods are externally
invokable. Any

guard a calling LWC performs in the browser does not protect the server.
Server-side

authorization (custom permission, profile check, record ownership) and
input validation

(type, length, allowed values) must be re-applied in the Apex method
itself.

**Detection signals:**

- `@AuraEnabled` or `@HttpGet`/`@HttpPost`/`@RestResource` method that
branches on a record

Id without confirming the running user has access to that record.

- Trust placed on a method parameter labelled `isAdmin`, `bypassCheck`,
`userType`, etc.

- Bulk operations (`List<Id>`) that loop over IDs and DML without
verifying ownership.

**Bad example:**

```apex

@AuraEnabled

public static Account getAccount(Id recordId, Boolean adminOverride) {

if (adminOverride) {

return [SELECT Id, Name, AnnualRevenue FROM Account WHERE Id =
:recordId];

}

return [SELECT Id, Name FROM Account WHERE Id = :recordId WITH
USER_MODE];

}

```

**Good example:**

```apex

@AuraEnabled

public static Account getAccount(Id recordId) {

List<Account> rows = [

SELECT Id, Name, AnnualRevenue

FROM Account WHERE Id = :recordId WITH USER_MODE LIMIT 1

];

if (rows.isEmpty()) {

throw new AuraHandledException('Record not accessible');

}

return rows[0];

}

```

**References:**
https://developer.salesforce.com/docs/platform/lwc/guide/apex-security.html,
https://pmd.github.io/pmd/pmd_rules_apex.html#inaccessibleauraenabledgetter

---

