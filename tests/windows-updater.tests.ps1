# Offline integration tests. No Adobe executable, network, installation or real task.
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot '..\installer\windows\HalftoneDTF-Updater.ps1'
$tokens=$null;$errors=$null
$null=[Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
. $source
$testRoot=Join-Path $env:TEMP ('halftone-updater-test-'+[guid]::NewGuid())
$null=New-Item -ItemType Directory -Path $testRoot
$script:DataDir=Join-Path $testRoot 'data'
$null=New-Item -ItemType Directory -Path $script:DataDir
$script:TestsPassed=0
function Assert($Condition,[string]$Message) { if (!$Condition) { throw $Message } }
function Assert-Throws([scriptblock]$Action,[string]$Pattern) {
    $caught=$false
    try { & $Action | Out-Null } catch { $caught=$true;Assert ($_.Exception.Message -match $Pattern) ('Unexpected failure: '+$_.Exception.Message) }
    Assert $caught ('Expected rejection: '+$Pattern)
}
function Test([string]$Name,[scriptblock]$Body) { & $Body;$script:TestsPassed++;Write-Host ('PASS '+$Name) }
function Copy-Object($Value) { return $Value | ConvertTo-Json -Depth 12 | ConvertFrom-Json }
$meta=[pscustomobject]@{schema='halftone-update-v1';channel='independent';pluginId=$script:PluginId;version='0.7.0';minPhotoshop='25.0.0';packaging='adobe-udt';nativeValidated=$true;ccx=[pscustomobject]@{name='Halftone-DTF-0.7.0.ccx';sha256=('a'*64);size=1000}}
$release=[pscustomobject]@{tag_name='v0.7.0';draft=$false;prerelease=$false;assets=@([pscustomobject]@{name=$meta.ccx.name;size=1000;browser_download_url=('https://github.com/'+$script:Repo+'/releases/download/v0.7.0/'+$meta.ccx.name)})}
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
function New-Package([string]$Id=$script:PluginId,[bool]$Duplicate=$false,[string]$Version=$meta.version) {
    $path=Join-Path $testRoot ([guid]::NewGuid().ToString()+'.ccx')
    $zip=[IO.Compression.ZipFile]::Open($path,[IO.Compression.ZipArchiveMode]::Create)
    try {
        $entry=$zip.CreateEntry('manifest.json')
        $writer=[IO.StreamWriter]::new($entry.Open())
        $manifest=@{id=$Id;version=$Version;manifestVersion=5;host=@{app='PS';minVersion=$meta.minPhotoshop;data=@{apiVersion=2}}}
        try { $writer.Write(($manifest | ConvertTo-Json -Depth 6)) } finally { $writer.Dispose() }
        if ($Duplicate) { $null=$zip.CreateEntry('manifest.json') }
    } finally { $zip.Dispose() }
    return $path
}
function Package-Meta([string]$Path) {
    $m=Copy-Object $meta;$m.ccx.size=(Get-Item -LiteralPath $Path).Length;$m.ccx.sha256=(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant();return $m
}
try {
    Test 'numeric versions reject prereleases and traversal' {
        Assert ((Get-Version '0.10.0') -gt (Get-Version '0.9.9')) 'Numeric version comparison failed'
        Assert-Throws { Get-Version '1.0.0-rc.1' } 'invalida'
        Assert-Throws { Get-Version '1.0.0/../a' } 'invalida'
    }
    Test 'release identity, provenance, checksum, size and origin' {
        $null=Test-Release $release $meta
        $m=Copy-Object $meta;$m.nativeValidated=$false;Assert-Throws { Test-Release $release $m } 'validado'
        $m=Copy-Object $meta;$m.nativeValidated='true';Assert-Throws { Test-Release $release $m } 'validado'
        $m=Copy-Object $meta;$m.pluginId='other';Assert-Throws { Test-Release $release $m } 'Identidad'
        $m=Copy-Object $meta;$m.ccx.sha256='bad';Assert-Throws { Test-Release $release $m } 'Metadatos'
        $m=Copy-Object $meta;$m.ccx.size=2000;Assert-Throws { Test-Release $release $m } 'Tamano'
        $r=Copy-Object $release;$r.prerelease=$true;Assert-Throws { Test-Release $r $meta } 'estables'
        $r=Copy-Object $release;$r.draft=$true;Assert-Throws { Test-Release $r $meta } 'estables'
        $r=Copy-Object $release;$r.assets[0].browser_download_url='https://example.com/file.ccx';Assert-Throws { Test-Release $r $meta } 'Origen'
    }
    Test 'metadata assets parse UTF8 bytes and text without relying on content type' {
        $json=$meta | ConvertTo-Json -Depth 6
        Assert ((Convert-UpdateJson $json).version -eq '0.7.0') 'Text metadata failed'
        Assert ((Convert-UpdateJson ([Text.Encoding]::UTF8.GetBytes($json))).version -eq '0.7.0') 'Binary metadata failed'
        Assert-Throws { Convert-UpdateJson ('x'*16385) } 'invalido'
    }
    Test 'CCX verifies bytes, manifest identity and duplicate entries' {
        $p=New-Package;$m=Package-Meta $p;Test-Package $p $m
        $m.ccx.sha256='b'*64;Assert-Throws { Test-Package $p $m } 'Checksum'
        $p=New-Package 'foreign';$m=Package-Meta $p;Assert-Throws { Test-Package $p $m } 'manifest'
        $p=New-Package $script:PluginId $true;$m=Package-Meta $p;Assert-Throws { Test-Package $p $m } 'Manifest'
    }
    $script:PhotoshopOpen=$false
    function Get-Process { param($Name,$ErrorAction);if ($script:PhotoshopOpen) { return @{Name='Photoshop'} } }
    $script:PackageSource=New-Package
    $script:LatestMeta=Package-Meta $script:PackageSource
    function Get-LatestPackage { return @{Meta=$script:LatestMeta;Asset=@{browser_download_url='https://fixture.invalid/ccx'}} }
    function Invoke-WebRequest { param([switch]$UseBasicParsing,$Uri,$Headers,$OutFile,$TimeoutSec);Copy-Item -LiteralPath $script:PackageSource -Destination $OutFile }
    $script:FakeUpia=Join-Path $testRoot 'upia-fixture.cmd'
    function Find-Upia { return $script:FakeUpia }
    Set-Content -LiteralPath $script:FakeUpia -Encoding ASCII -Value '@exit /b 0'
    Test 'Photoshop-open defers before downloading and writing any receipt' {
        $script:PhotoshopOpen=$true
        Assert (!(Invoke-Install $true)) 'Installation should defer'
        Assert (!(Test-Path (Join-Path $script:DataDir 'state.json'))) 'Receipt was written on deferral'
        $script:PhotoshopOpen=$false
    }
    Test 'successful official installer writes receipt, repeated checks skip and downgrades skip' {
        Assert (Invoke-Install $true) 'Install did not succeed'
        $state=Read-State;Assert ($state.version -eq '0.7.0') 'Wrong installed version'
        Set-Content -LiteralPath $script:FakeUpia -Encoding ASCII -Value '@exit /b 9'
        Assert (Invoke-Install $false) 'Same-version check tried installing'
        $script:LatestMeta.version='0.6.0';Assert (Invoke-Install $false) 'Downgrade should skip'
        Assert ((Read-State).version -eq '0.7.0') 'Downgrade changed receipt'
        $script:LatestMeta.version='0.7.0'
    }
    Test 'UPIA failure never records a new installed version' {
        $script:PackageSource=New-Package -Version '0.8.0'
        $script:LatestMeta=Package-Meta $script:PackageSource
        $script:LatestMeta.version='0.8.0';$script:LatestMeta.ccx.name='Halftone-DTF-0.8.0.ccx'
        Assert-Throws { Invoke-Install $false } 'UPIA devolvio 9'
        Assert ((Read-State).version -eq '0.7.0') 'Failure changed state'
    }
    Test 'later successful upgrade preserves the previous receipt and package' {
        Set-Content -LiteralPath $script:FakeUpia -Encoding ASCII -Value '@exit /b 0'
        Assert (Invoke-Install $false) 'Upgrade failed'
        Assert ((Read-State).version -eq '0.8.0') 'Upgrade did not record the new version'
        $previous=Get-Content -LiteralPath (Join-Path $script:DataDir 'previous-state.json') -Raw | ConvertFrom-Json
        Assert ($previous.version -eq '0.7.0') 'Previous receipt was lost'
        Assert (Test-Path -LiteralPath $previous.package) 'Previous package was lost'
    }
    Test 'enable/disable use per-user limited task, no policy bypass and no real task registration' {
        $script:Registered=$null;$script:Removed=$false
        function Register-ScheduledTask { param($TaskName,$TaskPath,$InputObject,[switch]$Force);$script:Registered=@{Name=$TaskName;Path=$TaskPath;Task=$InputObject} }
        function Unregister-ScheduledTask { param($TaskName,$TaskPath,$Confirm,$ErrorAction);$script:Removed=$true }
        Enable-Updates
        Assert ($script:Registered.Name -match 'S-1-') 'Task is not scoped to the current user'
        Assert ($script:Registered.Task.Principal.RunLevel -eq 'Limited') 'Task requests elevation'
        Assert ($script:Registered.Task.Actions.Arguments -notmatch 'Bypass') 'Execution policy bypass requested'
        Assert ($script:Registered.Task.Actions.Arguments -match '-Mode Check') 'Task does not check updates'
        Disable-Updates;Assert $script:Removed 'Disable did not remove task'
    }
    Test 'concurrent manual invocation exits without running installation' {
        $lock=[IO.File]::Open((Join-Path $script:DataDir 'updater.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
        try { Invoke-Main 'Install' } finally { $lock.Dispose() }
    }
    Write-Host ($script:TestsPassed.ToString()+' updater tests passed. No Adobe installation or actual task was performed.')
} finally { Remove-Item -LiteralPath $testRoot -Recurse -Force }
