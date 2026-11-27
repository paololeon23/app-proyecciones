$ErrorActionPreference = 'Stop'
$base = 'https://script.google.com/macros/s/AKfycbxxLAKdchGStfg2IIkaeJKgDdsRgTf9-s-jg3cYz6k2dgZcaJj-54CFLgwPled2fr24/exec'

Write-Host '===== POST placeTipoColumn ====='
$body = '{"action":"placeTipoColumn"}'
$t0 = Get-Date
$r = Invoke-WebRequest -Uri $base -Method POST -Body $body -ContentType 'text/plain;charset=utf-8' -UseBasicParsing
$ms = [int]((Get-Date) - $t0).TotalMilliseconds
Write-Host ("ms=$ms")
Write-Host $r.Content

Write-Host ''
Write-Host '===== GET verify headers ====='
$r2 = Invoke-WebRequest -Uri "$base`?action=proyecciones&limit=1" -UseBasicParsing
$j2 = $r2.Content | ConvertFrom-Json
$i = 0
$obs = -1
$tipo = -1
foreach ($h in @($j2.headers)) {
  if ($i -ge 15 -and $i -le 22) { Write-Host ("{0}|{1}" -f $i, $h) }
  if ($h -eq 'Observación') { $obs = $i }
  if ($h -eq 'Tipo') { $tipo = $i }
  $i++
}
Write-Host ("Observacion=$obs Tipo=$tipo okDespues=" + ($tipo -eq ($obs + 1)))
