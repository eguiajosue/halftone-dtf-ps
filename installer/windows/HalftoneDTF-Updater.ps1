#requires -Version 5.1
<#
Independent Windows updater. Adobe Creative Cloud must be installed and signed in.
Runs as the current user; never elevates, kills Photoshop, edits Adobe plugin folders,
or downloads/executes a replacement updater. Only validated stable CCX releases.
#>
[CmdletBinding()]
param([ValidateSet('Install','Check','Enable','Disable','Status')][string]$Mode='Status')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$script:Repo='eguiajosue/halftone-dtf-ps'
$script:PluginId='com.josueeguia.halftonedtf'
$script:TaskName='Halftone DTF - actualizaciones'
$script:DataDir=Join-Path $env:LOCALAPPDATA 'HalftoneDTFUpdater'

function Get-Version([string]$Value) {
    if ($Value -notmatch '^\d+\.\d+\.\d+$') { throw 'Version invalida.' }
    return [version]$Value
}
function Write-AtomicJson([string]$Path, $Value) {
    $temporary=$Path+'.tmp'
    $Value | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination $Path -Force
}
function Write-Log([string]$Message) {
    $log=Join-Path $script:DataDir 'updater.log'
    if ((Test-Path -LiteralPath $log) -and (Get-Item -LiteralPath $log).Length -gt 1048576) {
        Move-Item -LiteralPath $log -Destination ($log+'.previous') -Force
    }
    Add-Content -LiteralPath $log -Encoding UTF8 -Value ((Get-Date -Format o)+' '+$Message)
    Write-Host $Message
}
function Find-Upia {
    $bases=@($env:CommonProgramFiles, ${env:CommonProgramFiles(x86)}) | Where-Object { $_ }
    foreach ($base in $bases) {
        $path=Join-Path $base 'Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe'
        if (Test-Path -LiteralPath $path) {
            $signature=Get-AuthenticodeSignature -LiteralPath $path
            if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Adobe') {
                throw 'La firma de Adobe UPIA no es valida. Reinstala Creative Cloud.'
            }
            return $path
        }
    }
    throw 'No se encontro Adobe UPIA. Instala/actualiza Creative Cloud y abre Photoshop una vez.'
}
function Get-Asset($Release,[string]$Name) {
    $assets=@($Release.assets | Where-Object { $_.name -ceq $Name })
    if ($assets.Count -ne 1) { throw ('Archivo ausente o duplicado: '+$Name) }
    $asset=$assets[0]
    $expected='https://github.com/'+$script:Repo+'/releases/download/'+$Release.tag_name+'/'+$Name
    if ($asset.browser_download_url -cne $expected -or $asset.size -le 0) { throw 'Origen de descarga no permitido.' }
    return $asset
}
function Test-Release($Release,$Meta) {
    if ($Release.draft -or $Release.prerelease) { throw 'Solo se admiten releases estables publicados.' }
    $null=Get-Version $Meta.version
    $null=Get-Version $Meta.minPhotoshop
    if ($Meta.schema -cne 'halftone-update-v1' -or $Meta.channel -cne 'independent' -or $Meta.pluginId -cne $script:PluginId) { throw 'Identidad o canal incompatible.' }
    if ($Release.tag_name -cne ('v'+$Meta.version) -or $Meta.packaging -cne 'adobe-udt' -or $Meta.nativeValidated -isnot [bool] -or !$Meta.nativeValidated) { throw 'Paquete no validado.' }
    if ($Meta.ccx.name -cne ('Halftone-DTF-'+$Meta.version+'.ccx') -or $Meta.ccx.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $Meta.ccx.size -le 0 -or $Meta.ccx.size -gt 52428800) { throw 'Metadatos invalidos.' }
    $asset=Get-Asset $Release $Meta.ccx.name
    if ($asset.size -ne $Meta.ccx.size) { throw 'Tamano inconsistente.' }
    return $asset
}
function Get-LatestPackage {
    [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
    $headers=@{'User-Agent'='Halftone-DTF-Updater';'Accept'='application/vnd.github+json'}
    try { $release=Invoke-RestMethod -UseBasicParsing -Uri ('https://api.github.com/repos/'+$script:Repo+'/releases/latest') -Headers $headers -TimeoutSec 20 }
    catch {
        $response=$_.Exception.PSObject.Properties['Response']
        if ($response -and $response.Value -and [int]$response.Value.StatusCode -eq 404) { throw 'Aun no hay release estable. No se instalara un candidato.' }
        throw
    }
    $asset=Get-Asset $release 'halftone-update.json'
    if ($asset.size -gt 16384) { throw 'Metadatos demasiado grandes.' }
    $response=Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -Headers @{'User-Agent'='Halftone-DTF-Updater'} -TimeoutSec 20
    $meta=$response.Content | ConvertFrom-Json
    $ccx=Test-Release $release $meta
    return @{Release=$release;Meta=$meta;Asset=$ccx}
}
function Test-Package([string]$Path,$Meta) {
    $file=Get-Item -LiteralPath $Path
    if ($file.Length -ne $Meta.ccx.size) { throw 'La descarga esta incompleta.' }
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Meta.ccx.sha256) { throw 'Checksum incorrecto. Instalacion cancelada.' }
    Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
    $zip=[IO.Compression.ZipFile]::OpenRead($Path)
    try {
        $entries=@($zip.Entries | Where-Object { $_.FullName -ceq 'manifest.json' })
        if ($entries.Count -ne 1 -or $entries[0].Length -gt 65536) { throw 'Manifest ausente o invalido.' }
        $reader=[IO.StreamReader]::new($entries[0].Open())
        try { $manifest=$reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        if ($manifest.id -cne $script:PluginId -or $manifest.version -cne $Meta.version -or $manifest.manifestVersion -ne 5 -or $manifest.host.app -cne 'PS' -or $manifest.host.minVersion -cne $Meta.minPhotoshop -or $manifest.host.data.apiVersion -ne 2) { throw 'El manifest no coincide con la actualizacion.' }
        $names=@{}
        foreach ($entry in $zip.Entries) {
            if ($entry.FullName -match '(^[/\\]|(^|[/\\])\.\.([/\\]|$)|:)' -or $names.ContainsKey($entry.FullName)) { throw 'Archivo CCX inseguro o ambiguo.' }
            $names[$entry.FullName]=$true
        }
    } finally { $zip.Dispose() }
}
function Read-State {
    $path=Join-Path $script:DataDir 'state.json'
    if (Test-Path -LiteralPath $path) { return Get-Content -LiteralPath $path -Raw | ConvertFrom-Json }
    return $null
}
function Invoke-Install([bool]$Initial) {
    if (Get-Process -Name Photoshop -ErrorAction SilentlyContinue) {
        Write-Log 'Aplazado: Photoshop esta abierto. Se reintentara en la siguiente consulta.'
        return $false
    }
    $state=Read-State
    if (!$Initial -and !$state) { throw 'Instala el plugin una vez con Instalar-y-activar.cmd.' }
    $latest=Get-LatestPackage
    $meta=$latest.Meta
    if ($state -and (Get-Version $meta.version) -lt (Get-Version $state.version)) { Write-Log 'Se omitio una version anterior a la registrada.';return $true }
    if (!$Initial -and $state -and (Get-Version $meta.version) -eq (Get-Version $state.version)) { Write-Log ('Sin cambios. Version registrada: '+$state.version);return $true }
    $upia=Find-Upia
    $cache=Join-Path $script:DataDir 'packages'
    $null=New-Item -ItemType Directory -Path $cache -Force
    $path=Join-Path $cache $meta.ccx.name
    $partial=$path+'.partial'
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $latest.Asset.browser_download_url -Headers @{'User-Agent'='Halftone-DTF-Updater'} -OutFile $partial -TimeoutSec 180
        Test-Package $partial $meta
        Move-Item -LiteralPath $partial -Destination $path -Force
    } finally { if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force } }
    # Recheck after downloading: a user may have opened Photoshop in the meantime.
    if (Get-Process -Name Photoshop -ErrorAction SilentlyContinue) { Write-Log 'Descarga validada. Instalacion aplazada porque Photoshop se abrio.';return $false }
    $output=& $upia /install $path 2>&1
    $code=$LASTEXITCODE
    Write-Log ('UPIA: '+($output -join ' '))
    if ($code -ne 0) { throw ('Adobe UPIA devolvio '+$code+'. No se modifico el registro de version. Consulta Creative Cloud y updater.log; puede requerir permisos del administrador.') }
    # Keep the previous receipt/package for an explicit, user-controlled recovery.
    if ($state) { Write-AtomicJson (Join-Path $script:DataDir 'previous-state.json') $state }
    Write-AtomicJson (Join-Path $script:DataDir 'state.json') @{schema='halftone-updater-state-v1';version=$meta.version;sha256=$meta.ccx.sha256;installedAt=(Get-Date -Format o);package=$path}
    Write-Log ('Adobe UPIA completo la instalacion de '+$meta.version+'. Abre Photoshop y comprueba la version en el menu del panel.')
    return $true
}
function Enable-Updates {
    if (!(Read-State)) { throw 'Primero completa una instalacion validada.' }
    $source=$PSCommandPath
    $destination=Join-Path $script:DataDir 'HalftoneDTF-Updater.ps1'
    if ($source -ne $destination) { Copy-Item -LiteralPath $source -Destination $destination -Force }
    $user=[Security.Principal.WindowsIdentity]::GetCurrent().Name
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $taskName=$script:TaskName+' - '+$sid
    $executable=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    # Use the signed/download-trusted local script. Never bypass machine execution policy.
    $action=New-ScheduledTaskAction -Execute $executable -Argument ('-NoProfile -NonInteractive -File "'+$destination+'" -Mode Check')
    $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1)
    $principal=New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $task=New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Actualiza Halftone DTF desde releases estables de GitHub mediante Adobe UPIA con Photoshop cerrado.'
    $null=Register-ScheduledTask -TaskName $taskName -TaskPath '\' -InputObject $task -Force
    Write-Log 'Actualizaciones activadas cada hora mientras el usuario tiene sesion iniciada. El actualizador no se cambia a si mismo.'
}
function Disable-Updates {
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $null=Unregister-ScheduledTask -TaskName ($script:TaskName+' - '+$sid) -TaskPath '\' -Confirm:$false -ErrorAction SilentlyContinue
    Write-Log 'Actualizaciones automaticas desactivadas. El plugin y tus recetas se conservan.'
}
function Invoke-Main([string]$SelectedMode) {
    $null=New-Item -ItemType Directory -Path $script:DataDir -Force
    # Exclusive per-user lock also covers manual launches, not just scheduled tasks.
    $lock=$null
    try {
        try { $lock=[IO.File]::Open((Join-Path $script:DataDir 'updater.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None) }
        catch { Write-Host 'Otra comprobacion esta en curso.';return }
        switch ($SelectedMode) {
            'Install' { if (Invoke-Install $true) { Enable-Updates } else { throw 'Cierra Photoshop y vuelve a ejecutar el instalador.' } }
            'Check' { $null=Invoke-Install $false }
            'Enable' { Enable-Updates }
            'Disable' { Disable-Updates }
            'Status' { $state=Read-State; if ($state) { $state | Format-List } else { Write-Host 'Sin instalacion registrada por este actualizador.' };Write-Host ('Registro: '+(Join-Path $script:DataDir 'updater.log')) }
        }
    } catch { Write-Log ('ERROR: '+$_.Exception.Message);throw }
    finally { if ($lock) { $lock.Dispose() } }
}
if ($MyInvocation.InvocationName -ne '.') {
    try { Invoke-Main $Mode } catch { Write-Error $_ -ErrorAction Continue;exit 1 }
}
