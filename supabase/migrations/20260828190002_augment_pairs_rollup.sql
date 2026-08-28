-- Which augments work together.
--
-- match_participant_augments stores every augment with its slot and its
-- participant, which means every combination a player actually ran together
-- is already recorded with the win attached. Nothing computed it. Nobody else
-- collects Mayhem augments at this grain, so this is the one thing here that
-- cannot be got anywhere else.
--
-- Pairs only, deliberately. With roughly 640 augments the pair space is about
-- 200,000 combinations before any champion breakdown, and triples would be
-- tens of millions of mostly-empty cells. Pairs are the largest grain that
-- can be sampled at this volume.
--
-- The per-patch floor below is not the display floor. It exists to keep the
-- long tail out of the rollup - a pair seen twice on one patch is storage,
-- not a finding - while staying low enough that summing a pair across three
-- patches can still carry it over the much stricter floor the UI applies.
--
-- Created WITH NO DATA on purpose. The build is a self-join over five million
-- rows and does not finish inside a client timeout; stats.refresh_all() finds
-- it by catalog lookup and populates it on its next pass, using a plain
-- refresh while it is unpopulated and concurrent ones after that.

create materialized view stats.augment_pairs as
select m.game_version                        as patch,
       m.queue_id,
       least(a.augment_id, b.augment_id)     as augment_a,
       greatest(a.augment_id, b.augment_id)  as augment_b,
       count(*)::bigint                      as picks,
       count(*) filter (where a.win)::bigint as wins
  from public.match_participant_augments a
  join public.match_participant_augments b
    on b.platform       = a.platform
   and b.game_id        = a.game_id
   and b.participant_id = a.participant_id
   -- Each unordered pair once: slots are unique per participant, so this is
   -- the cheapest way to say "a different augment on the same player"
   and b.slot           > a.slot
  join public.matches m
    on m.platform = a.platform
   and m.game_id  = a.game_id
 group by 1, 2, 3, 4
having count(*) >= 10
with no data;

-- refresh_all() refreshes concurrently once a view is populated, which needs
-- a unique index, and this is also the order the API pages on.
create unique index augment_pairs_key
  on stats.augment_pairs (patch, queue_id, augment_a, augment_b);

-- The read the UI makes: everything one augment appears in. The pair is
-- stored with the lower id first, so an augment can be on either side and
-- both need to be findable.
create index augment_pairs_by_a on stats.augment_pairs (augment_a, patch, queue_id);
create index augment_pairs_by_b on stats.augment_pairs (augment_b, patch, queue_id);

create view public.augment_pairs as select * from stats.augment_pairs;
grant select on public.augment_pairs to anon, authenticated, service_role;
