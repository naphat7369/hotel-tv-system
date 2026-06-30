$client = New-Object System.Net.Sockets.UdpClient
$client.Client.SetSocketOption(
    [System.Net.Sockets.SocketOptionLevel]::Socket,
    [System.Net.Sockets.SocketOptionName]::ReuseAddress,
    $true
)
$client.Client.Bind(
    (New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 6000))
)
$mcast = [System.Net.IPAddress]::Parse("224.10.10.233")
$client.JoinMulticastGroup($mcast)
$client.Client.ReceiveTimeout = 5000

Write-Host "Listening for multicast on 224.10.10.233:6000 ..."
try {
    $ep = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
    $data = $client.Receive([ref]$ep)
    Write-Host "SUCCESS: Received $($data.Length) bytes from $($ep.Address):$($ep.Port)"
} catch {
    Write-Host "TIMEOUT: No multicast data received within 5 seconds"
} finally {
    $client.Close()
}
