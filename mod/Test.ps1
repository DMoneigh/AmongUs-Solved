<#
.SYNOPSIS
Runs offline policy, PowerShell syntax and install/uninstall fixture checks.
.DESCRIPTION
Run Build.ps1 first. Never launches a game or loads native game code.
The install fixture has placeholder EXE/UnityPlayer files and copies only the
hash-verified analysis inputs into the ignored project cache.
#>
[CmdletBinding()]
param()
. (Join-Path $PSScriptRoot 'Common.ps1')
foreach ($script in @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' -File)) {
    $tokens = $null
    $errors = $null
    [Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref] $tokens, [ref] $errors) | Out-Null
    if ($errors.Count) { throw "PowerShell syntax errors in $($script.Name): $errors" }
}
& dotnet run --project (Join-Path $PSScriptRoot 'tests\PolicyTests.csproj') -c Release
if ($LASTEXITCODE -ne 0) { throw 'Policy tests failed.' }
$fixture = Join-Path $script:Cache ('install-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $fixture 'Among Us_Data\il2cpp_data\Metadata') -Force | Out-Null
try {
    Set-Content -LiteralPath (Join-Path $fixture 'Among Us.exe') -Value 'Not executable. Offline install fixture only.'
    Set-Content -LiteralPath (Join-Path $fixture 'UnityPlayer.dll') -Value 'Not a DLL. Offline install fixture only.'
    [IO.File]::WriteAllText((Join-Path $fixture 'Among Us_Data\app.info'), "Innersloth`nAmong Us")
    Copy-Item -LiteralPath (Join-Path $script:Cache 'game\GameAssembly.dll') -Destination (Join-Path $fixture 'GameAssembly.dll')
    $fixtureMetadata = Join-Path $fixture 'Among Us_Data\il2cpp_data\Metadata\global-metadata.dat'
    Copy-Item -LiteralPath (Join-Path $script:Cache 'game\global-metadata.dat') -Destination $fixtureMetadata
    & (Join-Path $PSScriptRoot 'Install.ps1') -GameDirectory $fixture -CheckOnly
    if (Test-Path -LiteralPath (Join-Path $fixture 'winhttp.dll')) { throw 'CheckOnly wrote a loader.' }
    & (Join-Path $PSScriptRoot 'Install.ps1') -GameDirectory $fixture -WhatIf
    if (Test-Path -LiteralPath (Join-Path $fixture 'winhttp.dll')) { throw 'WhatIf wrote a loader.' }
    & (Join-Path $PSScriptRoot 'Install.ps1') -GameDirectory $fixture
    & (Join-Path $PSScriptRoot 'Launch.ps1') -GameDirectory $fixture -CheckOnly
    $rejected = $false
    try { & (Join-Path $PSScriptRoot 'Install.ps1') -GameDirectory $fixture -CheckOnly }
    catch { $rejected = $true }
    if (!$rejected) { throw 'An existing loader was not rejected.' }
    $config = Join-Path $fixture 'BepInEx\config\retain.cfg'
    New-Item -ItemType Directory -Path (Split-Path $config -Parent) -Force | Out-Null
    Set-Content -LiteralPath $config -Value 'preserve generated config'
    $modified = Join-Path $fixture 'doorstop_config.ini'
    Add-Content -LiteralPath $modified -Value '# fixture modification must survive uninstall'
    & (Join-Path $PSScriptRoot 'Uninstall.ps1') -GameDirectory $fixture -Confirm:$false -WarningAction SilentlyContinue | Out-Null
    if (Test-Path -LiteralPath (Join-Path $fixture 'winhttp.dll')) { throw 'Loader was not uninstalled.' }
    if (!(Test-Path -LiteralPath $config)) { throw 'Generated/unowned file was removed.' }
    if (!(Test-Path -LiteralPath $modified)) { throw 'Modified loader configuration was removed.' }
    Copy-Item -LiteralPath (Join-Path $script:Cache 'loader\doorstop_config.ini') -Destination $modified -Force
    & (Join-Path $PSScriptRoot 'Uninstall.ps1') -GameDirectory $fixture -Confirm:$false | Out-Null
    if (Test-Path -LiteralPath (Join-Path $fixture '.privatelab-install.json')) { throw 'Completed uninstall retained its manifest.' }
    Assert-Hash (Join-Path $fixture 'GameAssembly.dll') $script:Dependencies.gameAssemblySha256
    Assert-Hash $fixtureMetadata $script:Dependencies.metadataSha256
    Remove-Item -LiteralPath (Join-Path $fixture 'BepInEx') -Recurse -Force
    [IO.File]::WriteAllText($fixtureMetadata, 'wrong metadata')
    $rejected = $false
    try { & (Join-Path $PSScriptRoot 'Install.ps1') -GameDirectory $fixture -CheckOnly }
    catch { $rejected = $true }
    if (!$rejected) { throw 'An unverified game was not rejected.' }
    $escaped = $false
    try { Get-ManagedPath $fixture '..\escape.dll' | Out-Null } catch { $escaped = $true }
    if (!$escaped) { throw 'Manifest path traversal was not rejected.' }
    Write-Host 'Passed script syntax, no-write preflights, real loader install/uninstall fixture, conflict/hash/path guards and game-file preservation.'
}
finally {
    if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}
