# Edge functions

The deployed source of the project's Supabase edge functions. Deploy from the
Supabase dashboard (Edge Functions → the function → paste and deploy) or with
the Supabase CLI; the copy here is the record of what is live.

| Function | What it does |
| --- | --- |
| `ingest` | Anonymous match upload from the desktop app. Validates, dedupes, rate-shapes, and quarantines implausible games. |
| `review` | Approve/deny quarantined games — one at a time from a digest email link, or in bulk from the review queue page. |
| `quarantine-digest` | Every 6 hours, emails up to 20 pending games with per-game approve/deny links. |
| `delete-contributions` | Erases one contributor token's games on request. |

## Minting a review-queue link

The review queue at `/review/queue/` is for clearing a backlog the digest
would take weeks to walk 20 games at a time. It authenticates with a key
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
