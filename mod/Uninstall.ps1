<#
.SYNOPSIS
Removes only unchanged files recorded by this install. Preserves game files and other mods.
.DESCRIPTION
Close the game first. Generated BepInEx logs/config/interop may remain. Removing winhttp.dll
disables this loader. Modified installed files are preserved and reported for manual review.
#>
[CmdletBinding(SupportsShouldProcess)]
param([Parameter(Mandatory)][string] $GameDirectory)
. (Join-Path $PSScriptRoot 'Common.ps1')
$game = (Resolve-Path -LiteralPath $GameDirectory).Path
Assert-GameStopped $game
$marker = Join-Path $game '.privatelab-install.json'
$manifest = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
if ($manifest.schema -ne 1 -or $manifest.buildGuid -ne $script:Dependencies.buildGuid) { throw 'Unrecognized installation manifest.' }
$changed = [Collections.Generic.List[string]]::new()
$remaining = [Collections.Generic.List[object]]::new()
foreach ($file in $manifest.files) {
    $path = Get-ManagedPath $game $file.relative
    if (!(Test-Path -LiteralPath $path)) { continue }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $file.sha256) {
        $changed.Add($file.relative)
        $remaining.Add($file)
        continue
    }
    if ($PSCmdlet.ShouldProcess($path, 'Remove installed unchanged file')) { Remove-Item -LiteralPath $path -Force }
    else { $remaining.Add($file) }
}
if ($changed.Count) { Write-Warning ("Preserved modified files: " + ($changed -join ', ')) }
if (!$WhatIfPreference) {
    if ($remaining.Count) {
        $manifest.files = @($remaining.ToArray())
        $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $marker -Encoding UTF8
    }
    else {
        Remove-Item -LiteralPath $marker -Force
        Remove-EmptyLoaderDirectories $game
    }
}
