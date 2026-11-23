# 10 POSTs de rendimiento — Proyecciones
$ErrorActionPreference = 'Stop'
$base = 'https://script.google.com/macros/s/AKfycbxxLAKdchGStfg2IIkaeJKgDdsRgTf9-s-jg3cYz6k2dgZcaJj-54CFLgwPled2fr24/exec'
$dni = '62749305'
$nombre = 'ARANDA SOLIS VALERIA YAMILET'
$stamp = Get-Date -Format 'yyyyMMddHHmmss'
$fecha = Get-Date -Format 'yyyy-MM-dd'
$times = @()

function New-Cartilla($clientId, $sampleCount) {
  $rows = @()
  for ($i = 1; $i -le $sampleCount; $i++) {
    $rows += [ordered]@{
      'Lote' = "SPD$stamp"
      'Fecha' = $fecha
      'DNI' = $dni
      'Nombre' = $nombre
      'N° Muestra' = $i
      'N° Ramas' = 2
      'Yema Productiva' = 1
      'Yema Abierta' = 1
      'Yemas Cerradas' = 0
      'Yemas Muertas' = 0
      'Botón Floral' = 0
      'Flor' = 0
      'Cuaja' = 0
      'E1 (Verde)' = 1
      'E2 (Rosado)' = 0
      'E3 (Guinda)' = 0
      'E4 (50%-70%)' = 0
      'E5 (Maduro)' = (1 + ($i % 3))
      'Observación' = "speed-test $stamp m$i"
      'Modulo' = 'M1'
      'Turno' = 3
      'Lotes' = 12
      'Semana' = 48
      'Etapa' = 'Licapa I'
      'Variedad' = 'Sekoya Pop'
      'Area' = 0.99
      'Campaña' = '2026'
      'Anexo' = ''
      'Hora subida' = ''
    }
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
      lote = "SPD$stamp"
      loteNum = '12'
      etapa = 'Licapa I'
      variedad = 'Sekoya Pop'
      area = 0.99
      campana = '2026'
      sampleCount = $sampleCount
    }
    rows = $rows
    photos = @()
    submittedAt = (Get-Date).ToUniversalTime().ToString('o')
  }
}

Write-Host "=== 10 POST save (1 muestra c/u) ==="
for ($i = 1; $i -le 10; $i++) {
  $cid = "speed-$stamp-$i"
  $body = New-Cartilla $cid 1
  $json = $body | ConvertTo-Json -Depth 12 -Compress
  $t0 = Get-Date
  $r = Invoke-WebRequest -Uri $base -Method POST -Body $json -ContentType 'text/plain;charset=utf-8' -UseBasicParsing -MaximumRedirection 5
  $ms = [int]((Get-Date) - $t0).TotalMilliseconds
  $j = $null
  try { $j = $r.Content | ConvertFrom-Json } catch {}
  $ok = ($j.ok -eq $true) -and (($j.created -eq $true) -or ($j.duplicate -eq $true))
  $times += $ms
  Write-Host ("POST {0,2}/10  ok={1} created={2} rows={3}  {4} ms" -f $i, $j.ok, $j.created, $j.rowsWritten, $ms)
  if (-not $ok) { Write-Host $r.Content; exit 1 }
}

# Batch de 4 en 1 request
Write-Host "`n=== 1 batchSave x4 ==="
$batch = @()
for ($i = 1; $i -le 4; $i++) { $batch += (New-Cartilla "speed-$stamp-batch-$i" 1) }
$bj = @{ action = 'batchSave'; records = $batch } | ConvertTo-Json -Depth 12 -Compress
$t0 = Get-Date
$br = Invoke-WebRequest -Uri $base -Method POST -Body $bj -ContentType 'text/plain;charset=utf-8' -UseBasicParsing -MaximumRedirection 5
$bms = [int]((Get-Date) - $t0).TotalMilliseconds
$bp = $br.Content | ConvertFrom-Json
$confirmed = 0
foreach ($x in @($bp.results)) { if ($x.ok -eq $true) { $confirmed++ } }
Write-Host ("batch ok={0} confirmed={1}/4  {2} ms  (~{3} ms/item)" -f $bp.ok, $confirmed, $bms, [int]($bms / 4))

$avg = [int](($times | Measure-Object -Average).Average)
$min = ($times | Measure-Object -Minimum).Minimum
$max = ($times | Measure-Object -Maximum).Maximum
Write-Host "`n=== RESUMEN 10 POST ==="
Write-Host ("avg={0} ms  min={1} ms  max={2} ms  total={3} ms" -f $avg, $min, $max, ($times | Measure-Object -Sum).Sum)
$times | ConvertTo-Json | Set-Content (Join-Path $PSScriptRoot 'test-post-10-times.json') -Encoding UTF8
