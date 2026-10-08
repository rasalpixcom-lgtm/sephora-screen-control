# Testing from another PC or iPad

The current Wi-Fi address is **192.168.2.131**, port **5174**.

| Workspace | URL |
| --- | --- |
| Admin | http://192.168.2.131:5174/admin |
| Controller | http://192.168.2.131:5174/controller |
| Monitor | http://192.168.2.131:5174/monitor |
| Login | http://192.168.2.131:5174/login |

On the hosting PC, you can also use http://localhost:5174 or http://127.0.0.1:5174 with the same page paths. Other devices use the Wi-Fi IP above. Each browser/address signs in separately; existing account credentials still work. Both addresses use the same database and wall selection. Roles determine which pages each account can open. Keep this PC powered on, awake, connected to Wi-Fi, and the server running.

## Configuration

The ignored `.env.local` contains HOSTNAME=0.0.0.0, PORT=5174, AUTH_URL=http://192.168.2.131:5174, AUTH_ADDITIONAL_ORIGINS=http://localhost:5174,http://127.0.0.1:5174, and ALLOW_LAN_HTTP=true. The listener accepts local and network connections; authentication allows only these explicit addresses. No database password or signing secret was changed. PostgreSQL remains on loopback port 55432 and is not opened to LAN devices.

Windows Firewall rule **SephoraScreenControl-LAN-5174** allows inbound TCP 5174 for the running Node executable, on the WiFi interface/address only, from LocalSubnet. It applies across Windows network profiles; the network profile was not changed. No router port forwarding was configured.

Private IP HTTP access requires an explicit opt-in. Public HTTP origins remain rejected even with that flag enabled. For production/public server deployment, use HTTPS and set ALLOW_LAN_HTTP=false. HTTP is unencrypted; use this test setup on your trusted company LAN.

## Verification

The production build and lint pass. Twenty-four origin-policy tests confirm the private-IP exception, explicit local aliases, same-host writes, and rejection of public HTTP. All 112 server integration checks passed using both localhost and the actual Wi-Fi IP with a temporary test port and isolated PostgreSQL database, including login/cookies, roles, and shared wall selection across addresses. Windows previously confirmed creation of the scoped firewall rule. These are checks on the hosting PC; access from the physical iPad/other PC still needs confirmation there.

## If a device cannot connect

1. Check both devices are on the same LAN. Guest Wi-Fi or access-point client isolation may prevent communication.
2. Open http://192.168.2.131:5174/api/health on the other device. A healthy server returns `{"status":"ok"}`.
3. If the host PC works but another device cannot connect, ask IT to check network isolation and endpoint/network policies.
4. Repeated sign-in attempts may hit a shared five-attempts-per-minute limit during this direct LAN test. Wait a minute before retrying. Production IIS configuration provides trusted per-client addressing.
5. If DHCP changes this PC's IP, update AUTH_URL in `.env.local`, update the firewall rule, and restart the app. Keep HOSTNAME=0.0.0.0 and the localhost aliases unchanged. Ask IT to reserve this PC's LAN address for a stable URL.

To reapply the firewall rule after an IP change, run the included `deploy/windows/enable-lan-firewall.ps1` in Administrator PowerShell, with the actual LAN address, interface, and Node executable path. It updates only this application's named rule.
