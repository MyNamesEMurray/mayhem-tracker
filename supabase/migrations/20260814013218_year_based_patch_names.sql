-- Switch stored patch names to Riot's year-based numbering ("16.16" ->
-- "26.16"). Ingest and review normalize inbound games the same way, so the
-- client-style range (majors 15-24) can never reappear.
update matches
set game_version = (split_part(game_version,'.',1)::int + 10)::text || '.' || split_part(game_version,'.',2)
where split_part(game_version,'.',1)::int between 15 and 24;
