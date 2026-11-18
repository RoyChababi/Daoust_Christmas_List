-- =====================================================================
-- Automated checks for the database rules (requirements sections 6, 7, 9).
--
-- Run AFTER schema.sql, in Supabase > SQL Editor. It creates test people
-- named "zz Test …", runs the checks, then UNDOES everything.
--
-- Result: an error saying "ALL TESTS PASSED (all test data rolled back)"
-- means success. The error is on purpose: it is what rolls the test data
-- back. Any other message starting with "TEST FAILED" names the problem.
-- =====================================================================

do $tests$
declare
  alice bigint; bob bigint; carol bigint;
  ta text; tb text; tc text;      -- session tokens
  r jsonb;
  item_a bigint; item_b bigint; item_c bigint;
  n int;
  denied boolean;

begin
  -- ---------- setup ----------
  update settings set passcode_hash = extensions.crypt('test-passcode', extensions.gen_salt('bf')) where id = 1;
  insert into members (name) values ('zz Test Alice') returning id into alice;
  insert into members (name) values ('zz Test Bob')   returning id into bob;
  insert into members (name) values ('zz Test Carol') returning id into carol;

  -- passcode is not case sensitive; first login sets a PIN
  ta := public.set_pin('TEST-PASSCODE', alice, '1111')->>'token';
  tb := public.set_pin('test-passcode', bob,   '2222')->>'token';
  tc := public.set_pin('test-passcode', carol, '3333')->>'token';
  if ta is null or tb is null or tc is null then raise exception 'TEST FAILED: set_pin did not return tokens'; end if;

  -- ---------- login rules ----------
  begin
    perform public.set_pin('test-passcode', alice, '9999');
    raise exception 'TEST FAILED: set_pin allowed a second time';
  exception when others then
    if sqlerrm <> 'E_PIN_ALREADY_SET' then raise; end if;
  end;

  begin
    perform public.list_members('wrong');
    raise exception 'TEST FAILED: wrong passcode accepted';
  exception when others then
    if sqlerrm <> 'E_BAD_PASSCODE' then raise; end if;
  end;

  r := public.login('test-passcode', alice, '0000');
  if r->>'error' <> 'E_BAD_PIN' or (r->>'attempts_left')::int <> 4 then
    raise exception 'TEST FAILED: wrong PIN result %', r; end if;
  perform public.login('test-passcode', alice, '0000');
  perform public.login('test-passcode', alice, '0000');
  perform public.login('test-passcode', alice, '0000');
  r := public.login('test-passcode', alice, '0000');     -- 5th wrong try
  if r->>'error' <> 'E_LOCKED' then raise exception 'TEST FAILED: no lock after 5 wrong PINs: %', r; end if;
  r := public.login('test-passcode', alice, '1111');     -- right PIN, still locked
  if r->>'error' <> 'E_LOCKED' then raise exception 'TEST FAILED: right PIN accepted while locked'; end if;
  update members set locked_until = now() - interval '1 second' where id = alice;
  r := public.login('test-passcode', alice, '1111');
  if r->>'token' is null then raise exception 'TEST FAILED: login after lock expiry: %', r; end if;
  if (select pin_hash from members where id = alice) like '%1111%' then
    raise exception 'TEST FAILED: PIN stored in plain text'; end if;

  -- ---------- Alice builds her list by upload ----------
  r := public.upsert_my_list(ta, '[
    {"name":"Red Sweater","price":"49.99","size_color":"M / red","priority":"High"},
    {"name":"Lego Set","link":"lego.com/set","price":"24,99"},
    {"name":"Book","notes":"Any mystery"},
    {"name":"Scarf"}
  ]'::jsonb);
  if jsonb_array_length(r) <> 4 then raise exception 'TEST FAILED: initial upload gave % items', jsonb_array_length(r); end if;
  select id into item_a from items where owner_id = alice and name = 'Red Sweater';
  select id into item_b from items where owner_id = alice and name = 'Lego Set';
  select id into item_c from items where owner_id = alice and name = 'Book';
  if (select link from items where id = item_b) <> 'https://lego.com/set' then raise exception 'TEST FAILED: link not cleaned'; end if;
  if (select price from items where id = item_b) <> 24.99 then raise exception 'TEST FAILED: French decimal price'; end if;
  if (select priority from items where id = item_a) <> 'high' then raise exception 'TEST FAILED: priority not normalized'; end if;

  -- ---------- claims (section 7) ----------
  r := public.claim_item(tb, item_a);                      -- Bob claims Red Sweater
  if not (r->>'ok')::boolean then raise exception 'TEST FAILED: Bob claim: %', r; end if;
  r := public.claim_item(tc, item_a);                      -- Carol tries the same item
  if r->>'error' <> 'E_ALREADY_CLAIMED' or r->>'claimer_name' <> 'zz Test Bob' then
    raise exception 'TEST FAILED: second claim not rejected: %', r; end if;
  begin
    perform public.claim_item(ta, item_b);                 -- Alice claims own item
    raise exception 'TEST FAILED: owner could claim own item';
  exception when others then
    if sqlerrm <> 'E_OWN_ITEM' then raise; end if;
  end;
  begin
    perform public.unclaim_item(tc, item_a);               -- Carol unclaims Bob's claim
    raise exception 'TEST FAILED: non-claimer could unclaim';
  exception when others then
    if sqlerrm <> 'E_NOT_YOUR_CLAIM' then raise; end if;
  end;
  perform public.claim_item(tc, item_c);                   -- Carol claims Book

  -- ---------- privacy (section 9) ----------
  r := public.get_my_list(ta);
  if r::text ~* 'claim|zz Test Bob|zz Test Carol|removed' then
    raise exception 'TEST FAILED: owner list leaks claim info: %', r; end if;
  begin
    perform public.get_family_list(ta, alice);
    raise exception 'TEST FAILED: get_family_list allowed on own list';
  exception when others then
    if sqlerrm <> 'E_OWN_LIST' then raise; end if;
  end;
  if exists (select 1 from jsonb_array_elements(public.get_members(ta)) m where (m->>'id')::bigint = alice) then
    raise exception 'TEST FAILED: get_members includes the caller'; end if;
  r := public.get_family_list(tc, alice);
  if not exists (select 1 from jsonb_array_elements(r->'items') i
                  where (i->>'id')::bigint = item_a and i->>'claimer_name' = 'zz Test Bob') then
    raise exception 'TEST FAILED: Carol cannot see Bob''s claim'; end if;

  -- ---------- re-upload merge (section 6) ----------
  -- New file: "red  sweater!" matches Red Sweater (normalized), updates fields.
  -- Lego Set (unclaimed) missing -> deleted. Book (claimed by Carol) missing -> removed_by_owner.
  -- Scarf unchanged. Socks new.
  r := public.upsert_my_list(ta, '[
    {"name":"red  sweater!","price":"59","size_color":"L / green","priority":"low"},
    {"name":"Scarf"},
    {"name":"Socks"},
    {"name":"SOCKS"}
  ]'::jsonb);

  -- Row 1: match -> update fields, claim untouched
  if (select price from items where id = item_a) <> 59 or (select size_color from items where id = item_a) <> 'L / green' then
    raise exception 'TEST FAILED: [6.1] matched item not updated'; end if;
  if not exists (select 1 from claims where item_id = item_a and claimer_id = bob) then
    raise exception 'TEST FAILED: [6.1] claim lost on update'; end if;
  -- Row 2: no match -> insert unclaimed (and duplicate SOCKS row ignored)
  select count(*) into n from items where owner_id = alice and name_normalized = 'socks';
  if n <> 1 then raise exception 'TEST FAILED: [6.2] new item inserted % times', n; end if;
  if exists (select 1 from claims c join items i on i.id = c.item_id where i.owner_id = alice and i.name_normalized = 'socks') then
    raise exception 'TEST FAILED: [6.2] new item is claimed'; end if;
  -- Row 3: missing + unclaimed -> deleted
  if exists (select 1 from items where id = item_b) then raise exception 'TEST FAILED: [6.3] unclaimed missing item not deleted'; end if;
  -- Row 4: missing + claimed -> kept, removed_by_owner, hidden from owner, shown to claimer
  if not (select removed_by_owner from items where id = item_c) then
    raise exception 'TEST FAILED: [6.4] claimed missing item not flagged removed'; end if;
  if exists (select 1 from jsonb_array_elements(r) i where (i->>'id')::bigint = item_c) then
    raise exception 'TEST FAILED: [6.4] removed item still shown to owner'; end if;
  if jsonb_array_length(r) <> 3 then raise exception 'TEST FAILED: owner should see 3 items, sees %', jsonb_array_length(r); end if;
  if not exists (select 1 from jsonb_array_elements(public.get_family_list(tc, alice)->'items') i
                  where (i->>'id')::bigint = item_c and (i->>'removed')::boolean) then
    raise exception 'TEST FAILED: [6.4] claimer does not see removed item'; end if;
  if exists (select 1 from jsonb_array_elements(public.get_family_list(tb, alice)->'items') i
              where (i->>'id')::bigint = item_c) then
    raise exception 'TEST FAILED: [6.4] non-claimer sees removed item'; end if;
  if not exists (select 1 from jsonb_array_elements(public.get_my_claims(tc)) c
                  where (c->>'item_id')::bigint = item_c and (c->>'removed')::boolean) then
    raise exception 'TEST FAILED: [6.4] removed item missing from claimer''s My Claims'; end if;
  begin
    perform public.claim_item(tb, item_c);
    raise exception 'TEST FAILED: removed item could be claimed';
  exception when others then
    if sqlerrm <> 'E_NOT_FOUND' then raise; end if;
  end;

  -- Row 5: owner re-adds removed item -> restored, claim kept
  r := public.upsert_my_list(ta, '[{"name":"red sweater"},{"name":"Scarf"},{"name":"Socks"},{"name":"book"}]'::jsonb);
  if (select removed_by_owner from items where id = item_c) then raise exception 'TEST FAILED: [6.5] re-added item still removed'; end if;
  if not exists (select 1 from claims where item_id = item_c and claimer_id = carol) then
    raise exception 'TEST FAILED: [6.5] claim lost on re-add'; end if;
  if (select name from items where id = item_c) <> 'book' then raise exception 'TEST FAILED: [6.5] name not updated'; end if;
  if (select price from items where id = item_a) is not null then
    raise exception 'TEST FAILED: blank cell in upload should clear the field'; end if;

  -- ---------- same rules for single-item edits ----------
  perform public.delete_item(ta, item_c);                                 -- claimed -> flagged
  if not (select removed_by_owner from items where id = item_c) then raise exception 'TEST FAILED: delete_item on claimed item'; end if;
  perform public.add_item(ta, '{"name":"BOOK","notes":"again"}'::jsonb); -- re-add by hand -> restored
  if (select removed_by_owner from items where id = item_c) or not exists (select 1 from claims where item_id = item_c) then
    raise exception 'TEST FAILED: add_item re-add'; end if;
  begin
    perform public.add_item(ta, '{"name":"scarf"}'::jsonb);
    raise exception 'TEST FAILED: duplicate add allowed';
  exception when others then
    if sqlerrm <> 'E_DUPLICATE' then raise; end if;
  end;
  perform public.update_item(ta, item_a, '{"name":"Red Sweater XL","price":"70"}'::jsonb);
  if not exists (select 1 from claims where item_id = item_a and claimer_id = bob) then
    raise exception 'TEST FAILED: update_item lost claim'; end if;
  perform public.delete_item(ta, (select id from items where owner_id = alice and name_normalized = 'socks'));
  if exists (select 1 from items where owner_id = alice and name_normalized = 'socks') then
    raise exception 'TEST FAILED: delete_item on unclaimed item'; end if;
  -- rename into a removed item's name = re-add that item
  perform public.delete_item(ta, item_c);
  perform public.add_item(ta, '{"name":"Gloves"}'::jsonb);
  perform public.update_item(ta, (select id from items where owner_id = alice and name = 'Gloves'), '{"name":"Book"}'::jsonb);
  if (select removed_by_owner from items where id = item_c) or exists (select 1 from items where owner_id = alice and name = 'Gloves') then
    raise exception 'TEST FAILED: rename onto removed item'; end if;

  -- ---------- unclaim a removed item makes it disappear ----------
  perform public.delete_item(ta, item_c);
  perform public.unclaim_item(tc, item_c);
  if exists (select 1 from items where id = item_c) then raise exception 'TEST FAILED: removed item kept after unclaim'; end if;

  -- ---------- bought flag ----------
  perform public.set_bought(tb, (select id from claims where item_id = item_a), true);
  if not (select bought from claims where item_id = item_a) then raise exception 'TEST FAILED: set_bought'; end if;
  begin
    perform public.set_bought(tc, (select id from claims where item_id = item_a), false);
    raise exception 'TEST FAILED: other person changed bought flag';
  exception when others then
    if sqlerrm <> 'E_NOT_YOUR_CLAIM' then raise; end if;
  end;

  -- ---------- admin ----------
  begin
    perform public.admin_list_members(tb);
    raise exception 'TEST FAILED: non-admin used admin function';
  exception when others then
    if sqlerrm <> 'E_NOT_ADMIN' then raise; end if;
  end;
  update members set is_admin = true where id = carol;
  perform public.admin_clear_claim(tc, item_a);
  if exists (select 1 from claims where item_id = item_a) then raise exception 'TEST FAILED: admin_clear_claim'; end if;
  perform public.admin_reset_pin(tc, bob);
  begin
    perform public.get_my_list(tb);
    raise exception 'TEST FAILED: session survived PIN reset';
  exception when others then
    if sqlerrm <> 'E_SESSION' then raise; end if;
  end;
  if (select pin_hash from members where id = bob) is not null then raise exception 'TEST FAILED: admin_reset_pin'; end if;

  -- ---------- API role cannot touch tables or private helpers ----------
  set local role anon;
  denied := false;
  begin perform 1 from public.claims limit 1; exception when insufficient_privilege then denied := true; end;
  if not denied then reset role; raise exception 'TEST FAILED: anon can read claims table'; end if;
  denied := false;
  begin perform 1 from public.items limit 1; exception when insufficient_privilege then denied := true; end;
  if not denied then reset role; raise exception 'TEST FAILED: anon can read items table'; end if;
  denied := false;
  begin perform private.my_list(alice); exception when insufficient_privilege then denied := true; end;
  if not denied then reset role; raise exception 'TEST FAILED: anon can call private functions'; end if;
  -- ...but can use the API
  r := public.get_my_list(ta);
  reset role;

  raise exception 'ALL TESTS PASSED (all test data rolled back)';
end
$tests$;
