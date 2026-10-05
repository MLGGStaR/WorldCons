# Registers (or updates) the Windows scheduled task that runs the WorldCons daily refresh.
#   powershell -ExecutionPolicy Bypass -File pipeline\refresh\install-task.ps1 [-At 10:17]
# Runs as the signed-in user (so git and Claude Code use your saved logins), in a hidden
# console, once a day; if the PC was off or asleep at that time it runs as soon as it can.
# Remove it with: Unregister-ScheduledTask -TaskName 'WorldCons daily refresh' -Confirm:$false
param([string]$At = '10:17')

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $root 'pipeline\refresh\run.mjs'
$conhost = Join-Path $env:WINDIR 'System32\conhost.exe'

$action = New-ScheduledTaskAction -Execute $conhost -Argument "--headless `"$node`" `"$script`"" -WorkingDirectory $root
# The first run is the next $At that is at least three hours away (not minutes after install).
$first = [datetime]::Parse($At)
if ($first -lt (Get-Date).AddHours(3)) { $first = $first.AddDays(1) }
$trigger = New-ScheduledTaskTrigger -Daily -At $first
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4)
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName 'WorldCons daily refresh' -Description 'Re-checks every convention page, lets Claude agents update what changed, rebuilds and publishes the WorldCons site (Desktop\WorldCons, pipeline\refresh\run.mjs). Log: pipeline\logs.' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

$t = Get-ScheduledTask -TaskName 'WorldCons daily refresh'
$i = $t | Get-ScheduledTaskInfo
"Registered '$($t.TaskName)': $($t.State), next run $($i.NextRunTime)"
