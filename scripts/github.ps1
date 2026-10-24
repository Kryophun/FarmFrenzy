[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = 'Stop'
if ($Arguments.Count -eq 0) {
    throw 'Pass a gh command, for example: .\scripts\github.ps1 api user --jq .login'
}

$previousToken = $env:GH_TOKEN
$previousHost = $env:GH_HOST
$previousRepo = $env:GH_REPO
$previousInteractive = $env:GCM_INTERACTIVE
$credential = @{}
$credentialLines = $null
$commandExitCode = 1

Push-Location (Split-Path $PSScriptRoot -Parent)
try {
    $env:GCM_INTERACTIVE = 'never'
    $credentialLines = "protocol=https`nhost=github.com`nusername=Kryophun`n`n" | git credential-manager get
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to retrieve the stored Kryophun credential.'
    }
    foreach ($line in $credentialLines) {
        $parts = $line -split '=', 2
        if ($parts.Count -eq 2) {
            $credential[$parts[0]] = $parts[1]
        }
    }
    if ($credential['username'] -ine 'Kryophun' -or -not $credential['password']) {
        throw 'A credential explicitly belonging to Kryophun is required.'
    }

    $env:GH_TOKEN = $credential['password']
    $env:GH_HOST = 'github.com'
    $env:GH_REPO = 'Kryophun/FarmFrenzy'
    $login = gh api user --jq .login
    if ($LASTEXITCODE -ne 0 -or $login -cne 'Kryophun') {
        throw 'Refusing GitHub operations: the authenticated account is not Kryophun.'
    }

    gh @Arguments
    $commandExitCode = $LASTEXITCODE
} finally {
    $env:GH_TOKEN = $previousToken
    $env:GH_HOST = $previousHost
    $env:GH_REPO = $previousRepo
    $env:GCM_INTERACTIVE = $previousInteractive
    $credential.Clear()
    $credentialLines = $null
    Pop-Location
}

exit $commandExitCode
