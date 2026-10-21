<#
.SYNOPSIS
Explicitly installs the pinned Windows x64 BepInEx loader and Private Lab plugin.
.EXAMPLE
.\mod\Install.ps1 -GameDirectory 'C:\Games\Among Us' -CheckOnly
.DESCRIPTION
Build first with Build.ps1. Close the game. Refuses existing loaders to avoid
overwriting other mods. -CheckOnly and -WhatIf never write to the game.
#>
[CmdletBinding(SupportsShouldProcess)]
param([Parameter(Mandatory)][string] $GameDirectory, [switch] $CheckOnly)
. (Join-Path $PSScriptRoot 'Common.ps1')
$game = Assert-Game $GameDirectory
Assert-GameStopped $game
$marker = Join-Path $game '.privatelab-install.json'
foreach ($relative in @('BepInEx', 'dotnet', 'winhttp.dll', 'doorstop_config.ini', '.doorstop_version', '.privatelab-install.json')) {
    if (Test-Path -LiteralPath (Join-Path $game $relative)) {
        throw "Existing loader/install component: $relative. Use a clean game copy or uninstall this installation first. No files changed."
    }
}
$plugin = Join-Path $PSScriptRoot 'artifacts\AmongUs.PrivateLab.dll'
$build = Get-Content (Join-Path $PSScriptRoot 'artifacts\build.json') -Raw | ConvertFrom-Json
Assert-Hash $plugin $build.pluginSha256
if ($build.gameAssemblySha256 -ne $script:Dependencies.gameAssemblySha256 -or
    $build.metadataSha256 -ne $script:Dependencies.metadataSha256 -or
    $build.buildGuid -ne $script:Dependencies.buildGuid -or
    $build.loaderSha256 -ne $script:Dependencies.loader.sha256) { throw 'Build manifest does not match pinned dependencies. Rebuild.' }
if ($CheckOnly) { Write-Host 'Preflight passed: exact game, clean loader paths, compiled plugin. No game files changed.'; return }
if (!$PSCmdlet.ShouldProcess($game, 'Install pinned BepInEx IL2CPP loader and F6 Private Lab plugin')) { return }
$loader = Expand-VerifiedDependency 'loader' $script:Dependencies.loader
$files = [Collections.Generic.List[object]]::new()
foreach ($source in @(Get-ChildItem -LiteralPath $loader -File -Recurse -Force)) {
    $relative = $source.FullName.Substring($loader.Length).TrimStart('\')
    # Do not overwrite a game-owned generic changelog file.
    if ($relative -eq 'changelog.txt') { continue }
    $files.Add(@{ relative = $relative; source = $source.FullName; sha256 = (Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash })
}
$files.Add(@{ relative = 'BepInEx\plugins\PrivateLab\AmongUs.PrivateLab.dll'; source = $plugin; sha256 = $build.pluginSha256 })
foreach ($file in $files) {
    if (Test-Path -LiteralPath (Get-ManagedPath $game $file.relative)) { throw "Refusing to overwrite $($file.relative)." }
}
$copied = [Collections.Generic.List[object]]::new()
try {
    foreach ($file in $files) {
        $destination = Get-ManagedPath $game $file.relative
        New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
        # File.Copy with overwrite=false also protects against files appearing after preflight.
        [IO.File]::Copy($file.source, $destination, $false)
        $copied.Add($file)
    }
    @{
        schema = 1; buildGuid = $build.buildGuid
        files = @($files | ForEach-Object { @{ relative = $_.relative; sha256 = $_.sha256 } })
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $marker -Encoding UTF8
}
catch {
    foreach ($file in $copied) {
        $destination = Get-ManagedPath $game $file.relative
        if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -eq $file.sha256) {
            Remove-Item -LiteralPath $destination -Force
        }
    }
    if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker -Force }
    Remove-EmptyLoaderDirectories $game
    throw
}
Write-Host 'Installed. Launch normally or with Launch.ps1. First boot generates runtime interop; allow several minutes.'
Write-Host 'Press F6 in Freeplay, or privately host and explicitly arm the test lobby. Public sessions remain locked.'
