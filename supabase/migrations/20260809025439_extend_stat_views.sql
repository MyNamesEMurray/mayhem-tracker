-- Extend the public aggregate views with combat-stat sums so the website can
-- show KDA, damage, and multikills. Still aggregate-only: sums grouped by
-- patch/queue/champion/augment, nothing per-game or per-player. Sums (not
-- averages) so the client can merge rows across patches/queues exactly.

create or replace view public.champion_stats as
  select m.game_version as patch, m.queue_id, p.champion_id,
         count(*)::bigint as games,
         (count(*) filter (where p.win))::bigint as wins,
         sum(p.kills)::bigint as kills,
         sum(p.deaths)::bigint as deaths,
         sum(p.assists)::bigint as assists,
         sum(p.total_damage_dealt)::bigint as damage,
         sum(p.total_damage_taken)::bigint as damage_taken,
         sum(p.total_heal)::bigint as heal,
         sum(p.gold_earned)::bigint as gold,
         sum(p.penta_kills)::bigint as pentas
  from public.match_participants p
  join public.matches m on m.platform = p.platform and m.game_id = p.game_id
  group by m.game_version, m.queue_id, p.champion_id;

create or replace view public.augment_stats as
  select m.game_version as patch, m.queue_id, a.augment_id, a.champion_id,
         count(*)::bigint as picks,
         (count(*) filter (where a.win))::bigint as wins,
         sum(p.kills)::bigint as kills,
         sum(p.deaths)::bigint as deaths,
         sum(p.assists)::bigint as assists,
         sum(p.total_damage_dealt)::bigint as damage
  from public.match_participant_augments a
  join public.matches m on m.platform = a.platform and m.game_id = a.game_id
  join public.match_participants p
    on p.platform = a.platform and p.game_id = a.game_id and p.participant_id = a.participant_id
  group by m.game_version, m.queue_id, a.augment_id, a.champion_id;
