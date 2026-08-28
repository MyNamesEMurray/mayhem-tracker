# Migrations

Thirteen migrations have been applied to the community stats project. Until
2026-08-28 only six of them were in this repository, and the seven missing ones
included the base schema: every table, every foreign key, the row level
security posture, and the withdrawal function. They existed only inside the
Supabase project's own history.

They have now been recovered by reading
`supabase_migrations.schema_migrations` out of the live database, and are
committed here verbatim except where noted below.

## Two things to know before running anything

**The recovered files carry their real applied versions; the six that were
already here do not.** They were renumbered at some point, so the timestamps in
their filenames do not match the versions the database recorded:

| File in this directory                              | Version the database recorded  |
| --------------------------------------------------- | ------------------------------ |
| `20260824000000_materialize_stats_aggregates.sql`   | `20260824073838`               |
| `20260824020000_stats_rollups.sql`                  | (folded into `20260824075624`) |
| `20260824120000_materialize_stats_rollups.sql`      | `20260824075624`               |
| `20260824120100_serve_stats_from_rollups.sql`       | `20260824075945`               |
| `20260824120200_restrict_refresh_stats_execute.sql` | `20260824080854`               |
| `20260824120300_drop_duplicate_stats_mv.sql`        | `20260824081514`               |

They are also longer than what the database stored, because they were
rewritten with fuller comments. The SQL is equivalent; the prose is better
here.

The consequence is that `supabase db push` would try to apply those six again,
since it matches on version. Reconcile with `supabase migration repair
--status applied <version>` for each, rather than by renaming files, because
repair is what updates the database's own ledger.

**`supabase db pull` will write secrets into a file.** The
`quarantine_review_pipeline` migration seeded `admin_config` with live values
inline: the review secret that authorises approve and deny links, the cron
secret, an API key and a personal email address. Those values are in the
project's migration history and will come straight out into your working tree.

The copy committed here has them removed, and explains what to seed instead.
If you pull, diff before you commit.

## Rebuilding from scratch

Applying these in filename order against an empty project reproduces the
schema, minus the `admin_config` rows, which are seeded out of band per the
comment in `20260809222856`. The digest function returns quietly when they are
absent, so an unseeded environment simply never sends a digest.
