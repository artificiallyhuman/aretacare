# Breach Response Plan

What AretaCare does if health information may have been exposed. AretaCare is not covered
by HIPAA; its breach duties come from the **FTC Health Breach Notification Rule**
(16 CFR Part 318, as amended in 2024), which applies to vendors of personal health records
such as AretaCare, and from **state breach-notification laws**. Some state deadlines are
shorter than the FTC's, so this plan works to the shortest one.

This is a procedure, not legal advice. Before sending any notice, check the current rule
text and, if possible, have a lawyer review the notice. Vulnerability reports from outside
researchers follow [`SECURITY.md`](../SECURITY.md); this plan starts once there is reason
to think data actually left our control.

## Roles

- **Incident lead:** the owner of AretaCare LLC, or the person they name for this incident.
  Makes every decision below and keeps the incident log.
- **Responders:** whoever has access to Render, AWS, Cloudflare, OpenAI and the database.

Keep one dated incident log (a private document, **not** in this public repository) from
the first minute: what was seen, what was done, by whom, and when.

## What counts as a breach

Under the FTC rule a breach is any acquisition of identifiable health information **without
the person's authorization**. That includes:

- an attacker getting into the database, S3, a server, or an admin account;
- a bug that shows one user's care session to someone who isn't a member of it;
- **disclosure we caused:** health data sent to a service, log, analytics tool or person that
  users never authorized. A hack is not required.

Unauthorized *access* is presumed to be acquisition unless there is reliable evidence that
the data was not actually viewed or taken (for example, server logs proving no response
body was ever returned).

The clock starts at **discovery**: the first day the breach was known, or reasonably should
have been known.

## First 24 hours

1. **Contain.** Close the hole: revert the deploy, disable the route, revoke the credential.
   For a leaked secret, rotate it:
   - `SECRET_KEY`, which logs everyone out, since all access and refresh tokens are signed with it;
   - `OPENAI_API_KEY`, AWS keys, `REVENUECAT_SECRET_API_KEY`, the SMTP password, the APNs key;
   - database credentials in Render.
2. **Stop log deletion.** Logs are deleted on a schedule. Raise these in Render until the investigation is over:
   - `API_LOG_RETENTION_DAYS` and `ERROR_LOG_RETENTION_DAYS` (30 days by default);
   - `SECURITY_LOG_RETENTION_DAYS` and `AUDIT_LOG_RETENTION_DAYS` (90).
3. **Preserve evidence.** Export copies to private storage:
   - the relevant rows of `security_logs`, `api_logs`, `error_logs` and `admin_audit_logs`;
   - Render service logs;
   - Cloudflare security events and firewall logs;
   - AWS CloudTrail and S3 access logs, where enabled;
   - Sentry issues.
4. **Tell the vendor** if the breach involves its system (Render, AWS, Cloudflare, OpenAI).

## Work out who is affected

List the account holders whose data was in scope. For specific care sessions:

```sql
-- Everyone who owns or is a member of the affected care sessions.
SELECT DISTINCT u.id, u.name, u.email
FROM users u
WHERE u.id IN (
    SELECT owner_id FROM sessions WHERE id IN ('<care-session-id>', '<care-session-id>')
    UNION
    SELECT user_id FROM session_collaborators WHERE session_id IN ('<care-session-id>', '<care-session-id>')
);
```

For a whole-database breach, it's every row in `users`. Also record:

- **what was exposed:** which tables and fields, which S3 prefixes, and whether files, transcripts or only metadata;
- **the window:** first and last moment of exposure;
- **who got it**, if known;
- **states of residence.** AretaCare doesn't store addresses, so treat the breach as affecting residents of every state and apply the strictest deadlines below.

A care session often holds information about a patient who isn't an account holder. Notify
the account holders and ask them to pass the notice on to the person they care for.

## Who to notify, and when

| Who | When | Rule |
|---|---|---|
| **Affected users** | Without unreasonable delay. **Aim for 30 days:** several states (e.g. Washington, Colorado, Florida) require it, and the FTC's outer limit is 60 days | FTC rule + state laws |
| **FTC**, 500+ people affected | At the same time as the user notices, using the FTC's online Health Breach Notification form | FTC rule |
| **FTC**, fewer than 500 | Keep a log and submit it within 60 days after the end of the calendar year | FTC rule |
| **Media**, 500+ residents of one state | Prominent media in that state, within 60 days | FTC rule |
| **State attorneys general** | Many states require AG notice above a threshold (often 250–500 residents), some within 30 days. Check each state on the list | State laws |

Law-enforcement delay: if police or a federal agency asks in writing for notice to be
delayed because it would impede an investigation, delay for the period they specify and
log the request.

## What the notice must say

Plain language, and at least:

1. What happened, the date of the breach and the date it was discovered.
2. What kinds of health information were involved (for example: chat messages, journal entries, uploaded documents, audio recordings, Health Profile).
3. Who acquired the information, if known (the name of the third party, or a description if it's a private person).
4. What the person can do to protect themselves.
5. What AretaCare is doing: to investigate, to limit the harm, and to prevent it happening again.
6. How to reach us, by at least **two** of:
   - email: privacy@aretacare.com;
   - a web page about the incident;
   - in-app messaging;
   - a postal address;
   - a toll-free number.

### Template

> **Subject: Important notice about your AretaCare information**
>
> On [date of discovery] we learned that [what happened, in one or two sentences]. It
> happened between [start] and [end].
>
> The information involved was [types of information] in [the care sessions you own or are
> a member of / your account]. [Who acquired it, if known.]
>
> What you can do: [steps, e.g. watch for messages that use details from your care, change
> your password, review who has access to your care sessions in AretaCare].
>
> What we're doing: [containment, investigation, changes made].
>
> If you look after someone whose information is in AretaCare, please share this notice
> with them.
>
> Questions: privacy@aretacare.com or [incident web page].

## Notice channels

The FTC rule allows email instead of postal mail only for people who have chosen email as
their primary contact method, and only when it is paired with **a second electronic
channel**: a text message, an in-app message, or an electronic banner.

- **Email:** every account has a verified address; send through the existing SMTP setup.
- **Second channel: the in-app notice.** In the admin console, open **In-App Notice**, write
  a short plain-text summary (title up to 120 characters, message up to 2,000), link it to
  the incident page, review, and publish. It needs MFA step-up.
  - Every signed-in user sees it: a banner on the web, and a banner that opens the full text
    in the iOS app (version 2.0.0 and later). It also shows before AI consent and on the iOS
    paywall, so people without a subscription see it too.
  - The link must be an `https://` page on aretacare.com, so put the full notice on an
    incident page there.
  - Users can dismiss it. Publishing a new notice replaces the old one and shows to
    everyone again. End it from the same page once it has run its course.
  - Every notice is kept in the `app_notices` table, with who published and ended it and
    when, and each action is in the admin audit log. Export those rows into the incident log.
  - Also send iOS push notifications where they are enabled (`PUSH_NOTIFICATIONS_ENABLED`).
    Older iOS builds don't show the notice, and push reaches people who don't open the app.
- **Substitute notice:** if contact details are out of date for 10 or more people, post a
  conspicuous notice on the homepage for 90 days (or use major print or broadcast media
  where they live), with a toll-free number that stays active for at least 90 days.

## Afterwards

- Fix the root cause and add a test that would have caught it.
- Write a short post-incident review in the private incident log: timeline, cause,
  what worked, what to change in this plan.
- Restore the log-retention settings changed during containment.
- Keep the incident log, the evidence and copies of every notice sent for at least six years.
