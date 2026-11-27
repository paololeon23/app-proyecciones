$ErrorActionPreference = 'Stop'
$base = 'https://script.google.com/macros/s/AKfycbxxLAKdchGStfg2IIkaeJKgDdsRgTf9-s-jg3cYz6k2dgZcaJj-54CFLgwPled2fr24/exec'

Write-Host '===== PING (HEADERS del Code.gs, no de la hoja) ====='
$r = Invoke-WebRequest -Uri "$base`?action=ping" -UseBasicParsing
$j = $r.Content | ConvertFrom-Json
Write-Host ("version=" + $j.version)
Write-Host ("ping.hasTipo=" + (@($j.headers) -contains 'Tipo'))

Write-Host ''
Write-Host '===== GET proyecciones (HEADERS reales de la hoja) ====='
$r2 = Invoke-WebRequest -Uri "$base`?action=proyecciones&limit=1" -UseBasicParsing
$j2 = $r2.Content | ConvertFrom-Json
$i = 0
$tipoIdx = -1
$obsIdx = -1
foreach ($h in @($j2.headers)) {
  Write-Host ("{0}|{1}" -f $i, $h)
  if ($h -eq 'Tipo') { $tipoIdx = $i }
  if ($h -eq 'Observación') { $obsIdx = $i }
  $i++
}
Write-Host ("sheet.hasTipo=" + ($tipoIdx -ge 0) + " idx=" + $tipoIdx)
Write-Host ("sheet.ObservacionIdx=" + $obsIdx)
Write-Host ("TipoAntesDeObs=" + ($tipoIdx -ge 0 -and $tipoIdx -eq ($obsIdx - 1)))
