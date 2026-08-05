-- أساس التعرّف على الوجه (طُبّق على القاعدة عبر Supabase)
create extension if not exists vector;

alter table members add column if not exists face_consent boolean not null default false;
alter table members add column if not exists face_consent_at timestamptz;

create table if not exists face_embeddings (
  member_id uuid primary key references members(id) on delete cascade,
  embedding vector(128) not null,
  updated_at timestamptz not null default now()
);
create index if not exists face_embeddings_hnsw on face_embeddings using hnsw (embedding vector_l2_ops);
alter table face_embeddings enable row level security;

create policy "member inserts own face embedding" on face_embeddings for insert to authenticated
  with check (member_id in (select id from members where user_account_id = auth.uid() and face_consent = true));
create policy "member updates own face embedding" on face_embeddings for update to authenticated
  using (member_id in (select id from members where user_account_id = auth.uid()))
  with check (member_id in (select id from members where user_account_id = auth.uid() and face_consent = true));
create policy "member deletes own face embedding" on face_embeddings for delete to authenticated
  using (member_id in (select id from members where user_account_id = auth.uid()));

create or replace function match_faces(query_embedding vector(128), match_count int default 3, max_distance float default 0.6)
returns table (member_id uuid, distance float)
language sql stable security definer set search_path = public as $$
  select fe.member_id, (fe.embedding <-> query_embedding) as distance
  from face_embeddings fe
  join members m on m.id = fe.member_id
  where m.face_consent = true and (fe.embedding <-> query_embedding) <= max_distance
  order by fe.embedding <-> query_embedding
  limit match_count;
$$;
revoke execute on function match_faces(vector, int, float) from anon;
grant execute on function match_faces(vector, int, float) to authenticated;
