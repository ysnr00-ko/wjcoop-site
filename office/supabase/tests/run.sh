#!/usr/bin/env bash
# 빈 테스트 데이터베이스를 만들어 마이그레이션을 적용하고 권한 테스트를 돌린다.
# 사용: PGHOST=... PGPORT=... PGUSER=postgres ./run.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=office_test
dropdb --if-exists "$DB" >/dev/null
# 역할(anon 등)은 데이터베이스 바깥에 있으므로 남아 있으면 지운다
psql -q -d postgres -c "drop role if exists anon; drop role if exists authenticated; drop role if exists service_role;" >/dev/null
createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase_stub.sql >/dev/null
for f in ../migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" >/dev/null
done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f stage0_rls_test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
