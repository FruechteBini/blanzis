param([string]$SourceArchive)

$ErrorActionPreference = 'Stop'
$release = '2.93.0'
$sourceHash = '8e7f9de005346e96d6a55a309fb32632670e5489948a31384046958c93dcc987'
$revision = '6a703e29f19b7d6e5a1a337724a5cf5833c63a55-blanzis-4'
$sourceUrl = "https://codeload.github.com/ulsklyc/yuvomi/tar.gz/refs/tags/v$release"
$output = Join-Path $PSScriptRoot 'frontend.tar.gz'
$tempRoot = (Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).Path.TrimEnd('\', '/')
$buildName = 'blanzis-frontend-' + [guid]::NewGuid().ToString('N')
$buildRoot = Join-Path $tempRoot $buildName

function Invoke-BuildCommand {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Program exited with code $LASTEXITCODE"
    }
}

New-Item -ItemType Directory -Path $buildRoot | Out-Null
$previousRevision = $env:APP_BUILD_REVISION
try {
    if ($SourceArchive) {
        $archive = (Resolve-Path -LiteralPath $SourceArchive).Path
    } else {
        $archive = Join-Path $buildRoot 'source.tar.gz'
        Invoke-BuildCommand curl.exe @('--fail', '--silent', '--show-error', '--location', '--retry', '2', '--output', $archive, $sourceUrl)
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $sourceHash) {
        throw "Source archive checksum does not match Yuvomi $release"
    }

    Invoke-BuildCommand tar.exe @('-xzf', $archive, '-C', $buildRoot)
    Push-Location (Join-Path $buildRoot "yuvomi-$release")
    try {
        Invoke-BuildCommand node @((Join-Path $PSScriptRoot 'apply-note-features.mjs'))
        Invoke-BuildCommand node @((Join-Path $PSScriptRoot 'apply-calendar-layout.mjs'))
        Invoke-BuildCommand node @((Join-Path $PSScriptRoot 'apply-branding.mjs'), 'frontend')
        Invoke-BuildCommand npm.cmd @('ci', '--ignore-scripts', '--no-audit', '--no-fund')
        $env:APP_BUILD_REVISION = $revision
        $bundle = Join-Path $buildRoot 'frontend.tar.gz'
        Invoke-BuildCommand npm.cmd @('run', 'build')
        Invoke-BuildCommand tar.exe @('-czf', $bundle, 'dist', 'public/locales', 'public/utils/blanzis-note-links.js',
            'server/openapi/schemas.js', 'server/routes/notes.js', 'server/services/blanzis-notes-media.js', 'server/services/subscription-logo.js')
        Move-Item -LiteralPath $bundle -Destination $output -Force
    } finally {
        Pop-Location
    }
    Write-Host "Build archive: $output"
} finally {
    $env:APP_BUILD_REVISION = $previousRevision
    $resolvedBuild = Get-Item -LiteralPath $buildRoot
    if ($resolvedBuild.Parent.FullName.TrimEnd('\', '/') -eq $tempRoot -and $resolvedBuild.Name -eq $buildName -and -not ($resolvedBuild.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        Remove-Item -LiteralPath $resolvedBuild.FullName -Recurse -Force
    }
}
