# Q Berries · Proyecciones — test rápido GET / POST / DELETE
$ErrorActionPreference = 'Stop'
$base = 'https://script.google.com/macros/s/AKfycbxxLAKdchGStfg2IIkaeJKgDdsRgTf9-s-jg3cYz6k2dgZcaJj-54CFLgwPled2fr24/exec'
$dni = '62749305'
$nombre = 'ARANDA SOLIS VALERIA YAMILET'
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$fecha = Get-Date -Format 'yyyy-MM-dd'
$lote = "CRUD$stamp"
$results = [System.Collections.Generic.List[object]]::new()

function Invoke-Get([string]$qs) {
  $t0 = Get-Date
  $r = Invoke-WebRequest -Uri "$base`?$qs" -Method GET -UseBasicParsing -MaximumRedirection 5
  $ms = [int]((Get-Date) - $t0).TotalMilliseconds
  $parsed = $null
  try { $parsed = $r.Content | ConvertFrom-Json } catch {}
  return @{ status = $r.StatusCode; ms = $ms; json = $parsed; raw = $r.Content }
}

function Invoke-Post($body) {
  $t0 = Get-Date
  $json = $body | ConvertTo-Json -Depth 12 -Compress
  $r = Invoke-WebRequest -Uri $base -Method POST -Body $json -ContentType 'text/plain;charset=utf-8' -UseBasicParsing -MaximumRedirection 5
  $ms = [int]((Get-Date) - $t0).TotalMilliseconds
  $parsed = $null
  try { $parsed = $r.Content | ConvertFrom-Json } catch {}
  return @{ status = $r.StatusCode; ms = $ms; json = $parsed; raw = $r.Content }
}

function Add-Result($step, $ok, $ms, $detail) {
  $results.Add([pscustomobject]@{ step = $step; ok = [bool]$ok; ms = $ms; detail = $detail })
  $mark = if ($ok) { 'OK' } else { 'FAIL' }
  Write-Host ("[{0}] {1}  {2}ms  {3}" -f $mark, $step, $ms, $detail)
}

Write-Host "`n===== 1) GET ping ====="
$g1 = Invoke-Get 'action=ping'
Add-Result 'GET ping' ($g1.json.ok -eq $true) $g1.ms ("api=$($g1.json.api) v=$($g1.json.version)")

Write-Host "`n===== 2) GET evaluadores ====="
$g2 = Invoke-Get 'action=evaluadores&soloActivos=1'
$evN = 0
if ($g2.json.evaluadores) { $evN = @($g2.json.evaluadores).Count }
Add-Result 'GET evaluadores' ($g2.json.ok -eq $true -and $evN -gt 0) $g2.ms "n=$evN"

Write-Host "`n===== 3) GET proyecciones (limit) ====="
$g3 = Invoke-Get "action=proyecciones&limit=5&desde=$fecha&hasta=$fecha"
$regN = 0
if ($g3.json.registros) { $regN = @($g3.json.registros).Count }
Add-Result 'GET proyecciones' ($g3.json.ok -eq $true) $g3.ms "page=$regN total=$($g3.json.total)"

Write-Host "`n===== 4) POST save (2 muestras) ====="
$clientId = "crud-test-$stamp"
$rows = @(
  [ordered]@{
    'Lote' = $lote; 'Fecha' = $fecha; 'DNI' = $dni; 'Nombre' = $nombre
    'N° Muestra' = 1; 'N° Ramas' = 2; 'Yemas Cerradas' = 1; 'Yema Abierta' = 1
    'Yemas Muertas' = 0; 'Botón Floral' = 2; 'Flor' = 1; 'Cuaja' = 0
    'E1 (Verde)' = 3; 'E2 (Rosado)' = 1; 'E3 (Guinda)' = 0; 'E4 (50%-70%)' = 0; 'E5 (Maduro)' = 2
    'Tipo' = 'Fenología'; 'Observación' = "CRUD $stamp"; 'Modulo' = 'M1'; 'Turno' = 1; 'Lotes' = 3
    'Semana' = 48; 'Etapa' = 'Licapa I'; 'Variedad' = 'Sekoya Pop'; 'Area' = 0.5; 'Campaña' = '2026'
  },
  [ordered]@{
    'Lote' = $lote; 'Fecha' = $fecha; 'DNI' = $dni; 'Nombre' = $nombre
    'N° Muestra' = 2; 'N° Ramas' = 2; 'Yemas Cerradas' = 0; 'Yema Abierta' = 2
    'Yemas Muertas' = 0; 'Botón Floral' = 1; 'Flor' = 2; 'Cuaja' = 1
    'E1 (Verde)' = 2; 'E2 (Rosado)' = 2; 'E3 (Guinda)' = 1; 'E4 (50%-70%)' = 0; 'E5 (Maduro)' = 1
    'Tipo' = 'Fenología'; 'Observación' = "CRUD $stamp"; 'Modulo' = 'M1'; 'Turno' = 1; 'Lotes' = 3
    'Semana' = 48; 'Etapa' = 'Licapa I'; 'Variedad' = 'Sekoya Pop'; 'Area' = 0.5; 'Campaña' = '2026'
  }
)
$postBody = @{
  action = 'save'
  clientId = $clientId
  data = @{
    fecha = $fecha; evaluadorId = $dni; nombre = $nombre; modulo = 'M1'
    turno = '1'; lote = $lote; loteNum = '3'; etapa = 'Licapa I'
    variedad = 'Sekoya Pop'; area = 0.5; campana = '2026'; sampleCount = 2
    tipo = 'Fenología'; tipoLabel = 'Fenología'
  }
  rows = $rows
  submittedAt = (Get-Date).ToUniversalTime().ToString('o')
}
$p1 = Invoke-Post $postBody
Add-Result 'POST save' (($p1.json.ok -eq $true) -and ($p1.json.created -eq $true) -and ([int]$p1.json.rowsWritten -eq 2)) $p1.ms ("rows=$($p1.json.rowsWritten) row=$($p1.json.row)")

Write-Host "`n===== 5) POST anti-duplicado ====="
$p2 = Invoke-Post $postBody
Add-Result 'POST duplicate' (($p2.json.ok -eq $true) -and ($p2.json.duplicate -eq $true)) $p2.ms ("dup=$($p2.json.duplicate)")

Write-Host "`n===== 6) GET verify lote ====="
Start-Sleep -Milliseconds 800
$g4 = Invoke-Get ("action=proyecciones&lote={0}&limit=20&desde={1}&hasta={1}" -f [uri]::EscapeDataString($lote), $fecha)
$found = @()
if ($g4.json.registros) {
  $found = @($g4.json.registros | Where-Object {
    ([string]$_.Lote) -eq $lote -or ([string]($_.'Lote')) -eq $lote
  })
}
if (-not $found.Count -and $g4.json.registros) {
  $found = @($g4.json.registros | Where-Object {
    (($_ | ConvertTo-Json -Compress) -like "*$lote*")
  })
}
Add-Result 'GET verify POST' ($found.Count -ge 2) $g4.ms ("found=$($found.Count)")

Write-Host "`n===== 7) DELETE muestra 2 ====="
$delRow = $null
if ($found.Count) {
  $delRow = $found | Where-Object {
    $nm = $_.'N° Muestra'
    if ($null -eq $nm) { $nm = $_.PSObject.Properties['N° Muestra'].Value }
    [int]($nm) -eq 2
  } | Select-Object -First 1
}
if (-not $delRow -and $found.Count) { $delRow = $found[-1] }

$delBody = @{
  action = 'deleteRegistro'
  nombre = $nombre
  nMuestra = 2
  lote = $lote
  fecha = $fecha
  dni = $dni
}
if ($delRow -and $delRow._row) { $delBody.row = [int]$delRow._row }
elseif ($delRow -and $delRow.PSObject.Properties['_row']) { $delBody.row = [int]$delRow._row }

$d1 = Invoke-Post $delBody
Add-Result 'DELETE registro' ($d1.json.ok -eq $true -and $d1.json.deleted -eq $true) $d1.ms ("row=$($d1.json.row) n=$($d1.json.nMuestra)")

Write-Host "`n===== 8) DELETE muestra 1 (cleanup) ====="
$delBody2 = @{
  action = 'deleteRegistro'
  nombre = $nombre
  nMuestra = 1
  lote = $lote
  fecha = $fecha
  dni = $dni
}
$d2 = Invoke-Post $delBody2
Add-Result 'DELETE cleanup' ($d2.json.ok -eq $true -and $d2.json.deleted -eq $true) $d2.ms ("row=$($d2.json.row)")

Write-Host "`n===== RESUMEN ====="
$results | Format-Table -AutoSize
$fail = @($results | Where-Object { -not $_.ok })
$avg = [int](($results | Measure-Object -Property ms -Average).Average)
Write-Host ("Total: {0}  OK: {1}  FAIL: {2}  avgMs: {3}" -f $results.Count, ($results.Count - $fail.Count), $fail.Count, $avg)
if ($fail.Count) {
  Write-Host "FALLIDOS:" -ForegroundColor Red
  $fail | Format-Table -AutoSize
  exit 1
}
Write-Host "TODO PERFECTO" -ForegroundColor Green
exit 0
