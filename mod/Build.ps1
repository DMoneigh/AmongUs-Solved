<#
.SYNOPSIS
Builds an actual BepInEx IL2CPP plugin without starting Among Us.
.DESCRIPTION
Requires Windows x64, .NET SDK 8 or newer, and Internet on first build.
Extracts only native code and metadata for analysis into the ignored project cache.
Use -GameDirectory instead of -GameArchive to read a legally installed matching game.
No loader or plugin is installed into the game by this script.
#>
[CmdletBinding()]
param(
    [string] $GameArchive,
    [string] $GameDirectory
)
. (Join-Path $PSScriptRoot 'Common.ps1')
if ($GameDirectory -and $GameArchive) { throw 'Specify GameDirectory or GameArchive, not both.' }
$dotnet = (Get-Command dotnet -ErrorAction Stop).Source
if (!(@(& $dotnet --list-sdks) | Where-Object { $_ -match '^(8|9|[1-9][0-9])\.' })) { throw '.NET SDK 8 or newer is required.' }
New-Item -ItemType Directory -Path $script:Cache -Force | Out-Null
$gameCache = Join-Path $script:Cache 'game'
New-Item -ItemType Directory -Path $gameCache -Force | Out-Null
$native = Join-Path $gameCache 'GameAssembly.dll'
$metadata = Join-Path $gameCache 'global-metadata.dat'
if ($GameDirectory) {
    $game = Assert-Game $GameDirectory
    Copy-Item -LiteralPath (Join-Path $game 'GameAssembly.dll') -Destination $native -Force
    Copy-Item -LiteralPath (Join-Path $game 'Among Us_Data\il2cpp_data\Metadata\global-metadata.dat') -Destination $metadata -Force
}
else {
    if (!$GameArchive) { $GameArchive = Join-Path $script:ProjectRoot 'uploads\514f1991-4890-4f15-90cf-307a9bf9831d.zip' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $GameArchive).Path)
    try {
        foreach ($spec in @(
            @{ Suffix = '/GameAssembly.dll'; Destination = $native },
            @{ Suffix = '/Among Us_Data/il2cpp_data/Metadata/global-metadata.dat'; Destination = $metadata }
        )) {
            $entries = @($zip.Entries | Where-Object { $_.FullName.Replace('\', '/').EndsWith($spec.Suffix, [StringComparison]::OrdinalIgnoreCase) })
            if ($entries.Count -ne 1) { throw "Archive must contain exactly one $($spec.Suffix)." }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entries[0], $spec.Destination, $true)
        }
    }
    finally { $zip.Dispose() }
}
Assert-Hash $native $script:Dependencies.gameAssemblySha256
Assert-Hash $metadata $script:Dependencies.metadataSha256
$loader = Expand-VerifiedDependency 'loader' $script:Dependencies.loader
$unity = Expand-VerifiedDependency 'unity' $script:Dependencies.unity
$toolProject = Join-Path $PSScriptRoot 'tools\InteropTool\InteropTool.csproj'
& $dotnet build $toolProject -c Release --nologo -v minimal
if ($LASTEXITCODE -ne 0) { throw 'Interop tool compilation failed.' }
$tool = Join-Path $PSScriptRoot 'tools\InteropTool\bin\Release\net8.0\InteropTool.dll'
$dummy = Join-Path $script:Cache 'cpp2il'
$interop = Join-Path $script:Cache 'interop'
foreach ($folder in @($dummy, $interop)) {
    if (Test-Path -LiteralPath $folder) { Remove-Item -LiteralPath $folder -Recurse -Force }
}
& $dotnet $tool cpp2il $native $metadata $dummy
if ($LASTEXITCODE -ne 0) { throw 'Pinned loader Cpp2IL rejected this game. Nothing was installed.' }
& $dotnet $tool generate $dummy $interop $unity $native
if ($LASTEXITCODE -ne 0) { throw 'Interop generation failed. Nothing was installed.' }
& $dotnet build (Join-Path $PSScriptRoot 'PrivateLab\PrivateLab.csproj') -c Release --nologo -v minimal
if ($LASTEXITCODE -ne 0) { throw 'Plugin compilation failed.' }
$output = Join-Path $PSScriptRoot 'artifacts'
New-Item -ItemType Directory -Path $output -Force | Out-Null
$plugin = Join-Path $output 'AmongUs.PrivateLab.dll'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'PrivateLab\bin\Release\net6.0\AmongUs.PrivateLab.dll') -Destination $plugin -Force
@{
    buildGuid = $script:Dependencies.buildGuid
    gameAssemblySha256 = $script:Dependencies.gameAssemblySha256
    metadataSha256 = $script:Dependencies.metadataSha256
    pluginSha256 = (Get-FileHash -LiteralPath $plugin -Algorithm SHA256).Hash
    loaderSha256 = $script:Dependencies.loader.sha256
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $output 'build.json') -Encoding UTF8
Write-Host "Built $plugin"
Write-Host 'Verified: offline Cpp2IL + interop generation and compilation against this exact game. Live runtime NOT tested.'
