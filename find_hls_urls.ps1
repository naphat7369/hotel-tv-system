$base = "http://10.0.101.254"

# Wellav OMP120 specific paths
$paths = @(
    "/omp120/output",
    "/omp120/hls",
    "/omp120/stream",
    "/omp120/channels",
    "/omp120/sys_settings",
    "/omp120/input",
    "/omp120/output/hls",
    "/omp120/live",
    "/omp120/playlist",
    "/omp120/status"
)

Write-Host "=== Testing OMP120 API endpoints ==="
foreach ($p in $paths) {
    $url = "$base$p"
    try {
        $r = Invoke-WebRequest -Uri $url -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        Write-Host "FOUND [$($r.StatusCode)]: $url"
        $len = $r.Content.Length
        if ($len -gt 500) { $len = 500 }
        Write-Host $r.Content.Substring(0, $len)
        Write-Host "---"
    } catch {
        $code = ""
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
        }
        Write-Host "FAIL [$code]: $url"
    }
}

# Try different ports for HLS
Write-Host "`n=== Testing different ports for HLS ==="
$ports = @(8080, 8000, 8443, 554, 1935, 9981, 9982)
foreach ($port in $ports) {
    $url = "http://10.0.101.254:$port/"
    try {
        $r = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        Write-Host "OPEN [$($r.StatusCode)]: $url"
    } catch {
        $code = ""
        if ($_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
        }
        if ($code) {
            Write-Host "OPEN [$code]: $url"
        } else {
            Write-Host "CLOSED: port $port"
        }
    }
}
