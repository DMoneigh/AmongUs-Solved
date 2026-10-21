<#
.SYNOPSIS
Launches only the explicitly selected installed game; never injects/attaches.
.DESCRIPTION
-CheckOnly checks paths without starting the game.
-Unmodded disables Doorstop for this child process, without editing game files.
If Steam/Epic authentication requires its launcher, launch there normally after installation.
#>
[CmdletBinding(SupportsShouldProcess)]
param([Parameter(Mandatory)][string] $GameDirectory, [switch] $CheckOnly, [switch] $Unmodded)
. (Join-Path $PSScriptRoot 'Common.ps1')
$game = Assert-Game $GameDirectory
Assert-GameStopped $game
if (!$Unmodded) {
    $manifest = Get-Content (Join-Path $game '.privatelab-install.json') -Raw | ConvertFrom-Json
    foreach ($file in $manifest.files) { Assert-Hash (Get-ManagedPath $game $file.relative) $file.sha256 }
}
if ($CheckOnly) { Write-Host 'Launch preflight passed. Game was NOT started.'; return }
if (!$PSCmdlet.ShouldProcess((Join-Path $game 'Among Us.exe'), 'Start selected game')) { return }
$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = Join-Path $game 'Among Us.exe'
$start.WorkingDirectory = $game
$start.UseShellExecute = $false
if ($Unmodded) { $start.EnvironmentVariables['DOORSTOP_DISABLE'] = '1' }
else { $start.EnvironmentVariables['DOORSTOP_DISABLE'] = '0' }
$process = [Diagnostics.Process]::Start($start)
Start-Sleep -Seconds 3
if ($process.HasExited) { throw "Game exited during startup (code $($process.ExitCode)). Check platform launcher and BepInEx\LogOutput.log." }
Write-Host "Started selected game (PID $($process.Id)). Loader log: $(Join-Path $game 'BepInEx\LogOutput.log')"
Write-Host 'F6: Private Lab. Freeplay/private consenting hosted test sessions only.'
