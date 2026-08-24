# Edge functions

The deployed source of the project's Supabase edge functions. Deploy from the
Supabase dashboard (Edge Functions → the function → paste and deploy) or with
the Supabase CLI; the copy here is the record of what is live.

| Function | What it does |
| --- | --- |
| `ingest` | Anonymous match upload from the desktop app. Validates, dedupes, rate-shapes, and quarantines implausible games. |
| `review` | Approve/deny quarantined games — one at a time from a digest email link, or in bulk from the review queue page. |
| `quarantine-digest` | Every 6 hours, emails a summary of what's pending with a link to the review queue — only when something new has arrived. |
| `delete-contributions` | Erases one contributor token's games on request. |

## The digest email

`quarantine-digest` sends a count, a breakdown of which plausibility limits
tripped, a warning if any contributor has hit the pending cap, and a button
into the review queue. It carries its own queue link, valid for 7 days, so
there is normally nothing to mint by hand.

It stays quiet unless something new has arrived since the last one: a backlog
does not need an identical reminder every six hours, and the queue page is
where a backlog gets worked.

To see the email without waiting for a real quarantine, POST it with
`preview: true` — it renders and returns the HTML instead of sending, and
marks nothing as notified.

## Minting a review-queue link

If you need a link outside the digest — the emailed one expired, or you want
a longer window — mint one. It authenticates with a key
derived from `review_secret`, bound to an expiry, and carried in the URL
fragment so it never reaches a server log or a `Referer` header.

Run this in the Supabase SQL editor and open the link it returns:

```sql
select 'https://mayhemstats.com/review/queue/#exp=' || e.exp || '&key=' ||
       encode(extensions.digest(c.value || ':admin:' || e.exp, 'sha256'), 'hex')
         as review_link
  from admin_config c,
       lateral (select extract(epoch from now() + interval '24 hours')::bigint as exp) e
 where c.key = 'review_secret';
```

Change the interval for a longer or shorter window. The function refuses a key
minted to live longer than 30 days, and refuses one whose expiry has passed.

Treat the link like a password: anyone holding it can approve or deny
quarantined games until it expires. To revoke every outstanding link at once,
change `review_secret` in `admin_config` — that also invalidates the approve
and deny links in any digest email already sent.
