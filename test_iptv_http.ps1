try {
    $r = Invoke-WebRequest -Uri "http://10.0.101.254/" -TimeoutSec 5 -UseBasicParsing
    Write-Host "Status: $($r.StatusCode)"
    $len = $r.Content.Length
    if ($len -gt 2000) { $len = 2000 }
    Write-Host $r.Content.Substring(0, $len)
} catch {
    Write-Host "Error: $($_.Exception.Message)"
}
