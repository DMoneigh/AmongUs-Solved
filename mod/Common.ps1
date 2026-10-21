Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:ProjectRoot = Split-Path $PSScriptRoot -Parent
$script:Cache = Join-Path $script:ProjectRoot '.mod-cache'
$script:Dependencies = Get-Content (Join-Path $PSScriptRoot 'dependencies.json') -Raw | ConvertFrom-Json

function Assert-Hash([string] $Path, [string] $Expected) {
    if (!(Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Missing file: $Path" }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $Expected) {
        throw "Unverified or changed file: $Path. Only the supplied exact game build and pinned dependencies are supported."
    }
}

function Assert-Game([string] $Directory) {
    $root = (Resolve-Path -LiteralPath $Directory).Path
    foreach ($relative in @('Among Us.exe', 'UnityPlayer.dll', 'Among Us_Data\app.info')) {
        if (!(Test-Path -LiteralPath (Join-Path $root $relative) -PathType Leaf)) { throw "Not a complete Windows Among Us directory: missing $relative" }
    }
    $info = @(Get-Content -LiteralPath (Join-Path $root 'Among Us_Data\app.info'))
    if ($info.Count -lt 2 -or $info[0] -ne 'Innersloth' -or $info[1] -ne 'Among Us') { throw 'Game identity does not match Innersloth / Among Us.' }
    Assert-Hash (Join-Path $root 'GameAssembly.dll') $script:Dependencies.gameAssemblySha256
    Assert-Hash (Join-Path $root 'Among Us_Data\il2cpp_data\Metadata\global-metadata.dat') $script:Dependencies.metadataSha256
    return $root
}

function Assert-GameStopped([string] $Directory) {
    $exe = Join-Path $Directory 'Among Us.exe'
    foreach ($process in @(Get-Process -ErrorAction SilentlyContinue)) {
        $path = $null
        try { $path = $process.Path } catch { continue }
        if ($path -and [string]::Equals($path, $exe, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Close this game first (PID $($process.Id)). No process will be attached to or stopped."
        }
    }
}

function Get-VerifiedArchive([string] $Name, $Dependency) {
    New-Item -ItemType Directory -Path $script:Cache -Force | Out-Null
    $path = Join-Path $script:Cache "$Name.zip"
    if (!(Test-Path -LiteralPath $path)) {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $partial = "$path.download"
        try {
            Invoke-WebRequest -Uri $Dependency.url -OutFile $partial -UseBasicParsing
            Assert-Hash $partial $Dependency.sha256
            Move-Item -LiteralPath $partial -Destination $path
        }
        finally {
            if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
        }
    }
    Assert-Hash $path $Dependency.sha256
    return $path
}

function Expand-VerifiedDependency([string] $Name, $Dependency) {
    $archive = Get-VerifiedArchive $Name $Dependency
    $output = Join-Path $script:Cache $Name
    # Re-extract the hash-verified ZIP: do not trust previously extracted executable dependencies.
    if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Recurse -Force }
    Expand-Archive -LiteralPath $archive -DestinationPath $output
    return $output
}

function Get-ManagedPath([string] $Directory, [string] $Relative) {
    if ([IO.Path]::IsPathRooted($Relative)) { throw 'Install manifest contains a rooted path.' }
    $prefix = [IO.Path]::GetFullPath($Directory).TrimEnd('\') + '\'
    $full = [IO.Path]::GetFullPath((Join-Path $Directory $Relative))
    if (!$full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Install manifest path escapes game directory.' }
    return $full
}

function Remove-EmptyLoaderDirectories([string] $Directory) {
    foreach ($name in @('BepInEx', 'dotnet')) {
        $root = Join-Path $Directory $name
        if (!(Test-Path -LiteralPath $root -PathType Container)) { continue }
        foreach ($folder in @(Get-ChildItem -LiteralPath $root -Directory -Recurse -Force |
            Sort-Object { $_.FullName.Length } -Descending)) {
            if (@(Get-ChildItem -LiteralPath $folder.FullName -Force).Count -eq 0) { Remove-Item -LiteralPath $folder.FullName -Force }
        }
        if (@(Get-ChildItem -LiteralPath $root -Force).Count -eq 0) { Remove-Item -LiteralPath $root -Force }
    }
}
