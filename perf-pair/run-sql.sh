set -eu
exec psql -X -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" -f "$1"
