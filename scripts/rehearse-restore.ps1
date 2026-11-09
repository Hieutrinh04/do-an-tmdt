param([string]$SourceProject = 'long-fish')
$ErrorActionPreference = 'Stop'
function Docker-Checked {
  & docker @args
  if ($LASTEXITCODE -ne 0) { throw 'Docker command failed.' }
}
$source = $SourceProject
$target = 'long-fish-restore-' + (Get-Date -Format 'yyyyMMddHHmmss')
$env:FRONTEND_PORT = '18082'
$env:N8N_PORT = '15682'
$env:MOCK_INTEGRATIONS = 'true'
$env:DATABASE_URL = 'file:/data/store.db'
$env:SEED_DEMO = 'true'
$artifact = New-Item -ItemType Directory -Force ('data/restore-' + $target)
$backupOutput = Docker-Checked compose -p $source exec -T -e BACKUP_DIR=/data/backups backend node dist/src/backup.js
$backup = [regex]::Match(($backupOutput -join "`n"), '/data/backups/long-fish-[\w.-]+\.db').Value
if (!$backup) { throw 'Backup path was not returned.' }
$uploadArchive = '/data/backups/restore-uploads-' + $target + '.tar'
Docker-Checked compose -p $source exec -T backend tar -C /uploads-data -cf $uploadArchive .
Docker-Checked compose -p $source cp ('backend:' + $backup) (Join-Path $artifact.FullName 'store.db')
Docker-Checked compose -p $source cp ('backend:' + $uploadArchive) (Join-Path $artifact.FullName 'uploads.tar')
$password = Docker-Checked compose -p $source exec -T backend node -e "process.stdout.write(process.env.ADMIN_PASSWORD || require('node:fs').readFileSync('/data/admin-password','utf8'))"
[IO.File]::WriteAllText((Join-Path $artifact.FullName 'admin-password'), ($password -join '').Trim())
foreach ($service in 'backend', 'frontend') {
  Docker-Checked tag ('long-fish-' + $service + ':latest') ($target + '-' + $service + ':latest')
}
$helper = (Docker-Checked compose -p $target run -d --no-deps --entrypoint sleep backend 600 | Select-Object -Last 1).Trim()
try {
  Docker-Checked cp (Join-Path $artifact.FullName 'store.db') ($helper + ':/data/store.db')
  Docker-Checked cp (Join-Path $artifact.FullName 'uploads.tar') ($helper + ':/tmp/uploads.tar')
  Docker-Checked cp (Join-Path $artifact.FullName 'admin-password') ($helper + ':/data/admin-password')
  Docker-Checked exec $helper tar -C /uploads-data -xf /tmp/uploads.tar
  $compare = "const {createHash}=require('node:crypto');const {db}=require('./dist/src/db.js');Promise.all([db.order.findMany({select:{id:true,code:true,status:true,total:true},orderBy:{id:'asc'}}),db.productVariant.findMany({select:{id:true,stock:true},orderBy:{id:'asc'}}),db.product.findMany({select:{id:true,images:true},orderBy:{id:'asc'}})]).then(xs=>console.log(JSON.stringify(xs.map(x=>({count:x.length,sha256:createHash('sha256').update(JSON.stringify(x)).digest('hex')}))))).finally(()=>db.`$disconnect())"
  $expected = Docker-Checked exec $helper node -e $compare
} finally {
  Docker-Checked rm -f $helper
}
Docker-Checked compose -p $target up -d --no-build --wait backend frontend
$restored = Docker-Checked compose -p $target exec -T backend node -e $compare
if (($expected -join '') -cne ($restored -join '')) { throw 'Order, stock or image manifest mismatch after startup.' }
$sourceFiles = Docker-Checked compose -p $source exec -T backend sh -c 'find /uploads-data -type f -name "*.webp" -exec sha256sum {} \; | sort'
$restoredFiles = Docker-Checked compose -p $target exec -T backend sh -c 'find /uploads-data -type f -name "*.webp" -exec sha256sum {} \; | sort'
if (($sourceFiles -join "`n") -cne ($restoredFiles -join "`n")) { throw 'Upload files differ.' }
$counts = ConvertFrom-Json ($restored -join '')
@{ project = $target; orders = $counts[0].count; variants = $counts[1].count; products = $counts[2].count; uploads = @($restoredFiles).Count; verified = $true } |
  ConvertTo-Json | Set-Content -Encoding utf8 docs/restore-rehearsal.json
npm.cmd run demo:reset -- --yes "--project=$target"
if ($LASTEXITCODE -ne 0) { throw 'Reset test failed.' }
Write-Output "Restore and reset verified on $target. Original stacks retained."
