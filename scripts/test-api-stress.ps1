# Stress test GET/POST Proyecciones — min 10 filas, 4 juntas + separadas + batch + dup
$ErrorActionPreference = 'Stop'
$base = 'https://script.google.com/macros/s/AKfycbxxLAKdchGStfg2IIkaeJKgDdsRgTf9-s-jg3cYz6k2dgZcaJj-54CFLgwPled2fr24/exec'
$dni = '62749305'
$nombre = 'ARANDA SOLIS VALERIA YAMILET'
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$fecha = Get-Date -Format 'yyyy-MM-dd'
$results = @()

function Invoke-Get([string]$qs) {
  $t0 = Get-Date
  $r = Invoke-WebRequest -Uri "$base`?$qs" -Method GET -UseBasicParsing -MaximumRedirection 5
  $ms = [int]((Get-Date) - $t0).TotalMilliseconds
  return @{ status = $r.StatusCode; ms = $ms; json = ($r.Content | ConvertFrom-Json); raw = $r.Content }
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

function New-SampleRow($n, $e5) {
  return [ordered]@{
    'Lote' = "TEST$stamp"
    'Fecha' = $fecha
    'DNI' = $dni
    'Nombre' = $nombre
    'N° Muestra' = $n
    'N° Ramas' = 3
    'Yemas Cerradas' = 1
    'Yema Abierta' = 1
    'Yemas Muertas' = 0
    'Botón Floral' = 0
    'Flor' = 0
    'Cuaja' = 0
    'E1 (Verde)' = 1
    'E2 (Rosado)' = 0
    'E3 (Guinda)' = 0
    'E4 (50%-70%)' = 0
    'E5 (Maduro)' = $e5
    'Observación' = "API-TEST $stamp m$n"
    'Modulo' = 'M1'
    'Turno' = 3
    'Lotes' = 12
    'Semana' = 48
    'Etapa' = 'Licapa I'
    'Variedad' = 'Sekoya Pop'
    'Area' = 0.99
    'Campaña' = '2026 - II'
  }
}

function New-Cartilla($clientId, $sampleCount) {
  $rows = @()
  for ($i = 1; $i -le $sampleCount; $i++) {
    $rows += (New-SampleRow $i (1 + ($i % 3)))
  }
  return @{
    action = 'save'
    type = 'proyecciones'
    sheet = 'Proyecciones'
    clientId = $clientId
    data = @{
      fecha = $fecha
      evaluador = "$dni — $nombre"
      evaluadorId = $dni
      nombre = $nombre
      modulo = 'M1'
      turno = '3'
      lote = "TEST$stamp"
      loteNum = '12'
      etapa = 'Licapa I'
      variedad = 'Sekoya Pop'
      area = 0.99
      campana = '2026 - II'
      sampleCount = $sampleCount
    }
    rows = $rows
    submittedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
}

Write-Host "`n======== GET TESTS ========"
$g1 = Invoke-Get 'action=ping'
Write-Host ("ping: ok={0} ms={1}" -f $g1.json.ok, $g1.ms)
$results += [pscustomobject]@{ step='GET ping'; ok=($g1.json.ok -eq $true); ms=$g1.ms; detail='api' }

$g2 = Invoke-Get "action=acceso&dni=$dni"
Write-Host ("acceso: activo={0} ms={1}" -f $g2.json.activo, $g2.ms)
$results += [pscustomobject]@{ step='GET acceso'; ok=($g2.json.activo -eq $true); ms=$g2.ms; detail=$g2.json.nombre }

$g3 = Invoke-Get 'action=evaluadores&soloActivos=1'
$evN = 0
if ($g3.json.evaluadores) { $evN = @($g3.json.evaluadores).Count }
elseif ($g3.json.items) { $evN = @($g3.json.items).Count }
elseif ($g3.json.data) { $evN = @($g3.json.data).Count }
Write-Host ("evaluadores: ok={0} n~{1} ms={2}" -f $g3.json.ok, $evN, $g3.ms)
$results += [pscustomobject]@{ step='GET evaluadores'; ok=($g3.json.ok -eq $true); ms=$g3.ms; detail="n=$evN" }

Write-Host "`n======== POST: 1 cartilla con 4 muestras juntas ========"
$id4 = "test-$stamp-4juntas"
$p4 = Invoke-Post (New-Cartilla $id4 4)
Write-Host ("4juntas: ok={0} created={1} rows={2} dup={3} ms={4}" -f $p4.json.ok, $p4.json.created, $p4.json.rowsWritten, $p4.json.duplicate, $p4.ms)
$results += [pscustomobject]@{ step='POST 4 muestras juntas'; ok=(($p4.json.ok -eq $true) -and ($p4.json.rowsWritten -eq 4)); ms=$p4.ms; detail=("rows={0}" -f $p4.json.rowsWritten) }

Write-Host "`n======== POST DUP check (mismo clientId) ========"
$pd = Invoke-Post (New-Cartilla $id4 4)
Write-Host ("dup: ok={0} duplicate={1} created={2} ms={3}" -f $pd.json.ok, $pd.json.duplicate, $pd.json.created, $pd.ms)
$results += [pscustomobject]@{ step='POST anti-duplicado'; ok=(($pd.json.ok -eq $true) -and ($pd.json.duplicate -eq $true)); ms=$pd.ms; detail=("dup={0}" -f $pd.json.duplicate) }

Write-Host "`n======== POST: 6 cartillas separadas (1 muestra c/u) ========"
$sepOk = 0
$sepMs = @()
for ($i = 1; $i -le 6; $i++) {
  $cid = "test-$stamp-sep-$i"
  $pr = Invoke-Post (New-Cartilla $cid 1)
  $ok = ($pr.json.ok -eq $true) -and ($pr.json.created -eq $true) -and ($pr.json.rowsWritten -eq 1)
  if ($ok) { $sepOk++ }
  $sepMs += $pr.ms
  Write-Host ("sep{0}: ok={1} rows={2} ms={3}" -f $i, $pr.json.ok, $pr.json.rowsWritten, $pr.ms)
  $results += [pscustomobject]@{ step=("POST separada $i"); ok=$ok; ms=$pr.ms; detail=("cid=$cid") }
}

Write-Host "`n======== POST batchSave: 3 cartillas en 1 request ========"
$batchRecords = @()
for ($i = 1; $i -le 3; $i++) {
  $batchRecords += (New-Cartilla "test-$stamp-batch-$i" 1)
}
$pb = Invoke-Post @{ action = 'batchSave'; records = $batchRecords }
$batchCreated = 0
if ($pb.json.results) {
  foreach ($r in @($pb.json.results)) {
    if ($r.ok -eq $true -and ($r.created -eq $true -or $r.duplicate -eq $true)) { $batchCreated++ }
  }
}
Write-Host ("batch: ok={0} confirmed={1}/3 ms={2}" -f $pb.json.ok, $batchCreated, $pb.ms)
$results += [pscustomobject]@{ step='POST batchSave x3'; ok=(($pb.json.ok -eq $true) -and ($batchCreated -eq 3)); ms=$pb.ms; detail=("confirmed=$batchCreated") }

Write-Host "`n======== RESUMEN ========"
$pass = @($results | Where-Object { $_.ok }).Count
$fail = @($results | Where-Object { -not $_.ok }).Count
$avg = [int](($results | Measure-Object -Property ms -Average).Average)
$rowsMin = 4 + 6 + 3  # 13 filas nuevas (dup no suma)
Write-Host ("PASS=$pass FAIL=$fail AVG_MS=$avg FILAS_ESPERADAS>=$rowsMin (4juntas+6sep+3batch)")
$results | Format-Table -AutoSize | Out-String | Write-Host
$outPath = Join-Path $PSScriptRoot "test-api-stress-result.json"
$results | ConvertTo-Json -Depth 4 | Set-Content -Path $outPath -Encoding UTF8
Write-Host "Saved $outPath"
if ($fail -gt 0) { exit 1 } else { exit 0 }
