param(
  [Parameter(Mandatory=$true)][string]$LanAddress,
  [Parameter(Mandatory=$true)][string]$InterfaceAlias,
  [Parameter(Mandatory=$true)][string]$NodePath,
  [int]$Port = 5174
)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$resultFile = Join-Path $taskRoot '.server-runtime\lan-firewall-result.txt'
try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Windows Administrator permission is required to add the LAN firewall rule.' }
  $ip = [System.Net.IPAddress]::Parse($LanAddress)
  if ($ip.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or $Port -ne 5174) { throw 'Use the IPv4 LAN address and Sephora port 5174.' }
  $address = Get-NetIPAddress -InterfaceAlias $InterfaceAlias -AddressFamily IPv4 | Where-Object { $_.IPAddress -eq $LanAddress }
  if (-not $address) { throw 'That IP does not belong to the selected local network interface.' }
  $nodePath = (Resolve-Path -LiteralPath $NodePath).Path
  if ((Split-Path -Leaf $nodePath) -ne 'node.exe') { throw 'Use the Node executable that runs the application.' }
  $ruleName = 'SephoraScreenControl-LAN-5174'
  $settings = @{ Direction='Inbound'; Action='Allow'; Enabled='True'; Profile='Any'; Protocol='TCP'; LocalPort=$Port; LocalAddress=$LanAddress; RemoteAddress='LocalSubnet'; InterfaceAlias=$InterfaceAlias; Program=$nodePath; EdgeTraversalPolicy='Block' }
  if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) {
    Set-NetFirewallRule -Name $ruleName @settings | Out-Null
  } else {
    New-NetFirewallRule -Name $ruleName -DisplayName 'Sephora Screen Control - local network only (5174)' @settings | Out-Null
  }
  "SUCCESS: TCP $Port allowed on $LanAddress ($InterfaceAlias), local subnet only." | Set-Content -LiteralPath $resultFile
} catch {
  "FAILED: $($_.Exception.Message)" | Set-Content -LiteralPath $resultFile
  throw
}
