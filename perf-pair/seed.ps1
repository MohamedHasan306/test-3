$ErrorActionPreference = 'Stop'
function Load-Sql($service, $file) {
  docker compose cp "$PSScriptRoot/run-sql.sh" "${service}:/tmp/req3-run.sh"
  if ($LASTEXITCODE) { throw "Cannot copy SQL runner to $service" }
  docker compose cp "$PSScriptRoot/$file" "${service}:/tmp/$file"
  if ($LASTEXITCODE) { throw "Cannot copy $file" }
  docker compose exec -T $service sh /tmp/req3-run.sh "/tmp/$file"
  if ($LASTEXITCODE) { throw "SQL failed in $service" }
}
Load-Sql db store.sql
Load-Sql inventory-db inventory.sql
Load-Sql db plan.sql | Tee-Object (Join-Path $PSScriptRoot 'explain-before.txt')
