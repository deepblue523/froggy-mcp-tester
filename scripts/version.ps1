# Dot-source from other scripts in this folder. Not intended to run directly.

function Invoke-NpmSemverBump {
    param(
        [Parameter(Mandatory)]
        [ValidateSet('major', 'minor', 'patch')]
        [string]$Kind,

        [Parameter(Mandatory)]
        [string]$RepoRoot,

        [switch]$DryRun,
        [switch]$NoCommit,
        [string]$CommitMessage
    )

    Push-Location $RepoRoot
    try {
        if ($DryRun) {
            Write-Host "Would run: npm version $Kind --no-git-tag-version"
            if (-not $NoCommit) {
                $hint = if ($CommitMessage) { $CommitMessage } else {
                    switch ($Kind) {
                        'patch' { 'chore: release vX.Y.Z' }
                        'minor' { 'chore: bump minor version to X.Y.Z' }
                        'major' { 'chore: bump major version to X.Y.Z' }
                    }
                }
                Write-Host "Would commit: $hint"
            }
            return $null
        }

        npm version $Kind --no-git-tag-version
        if ($LASTEXITCODE -ne 0) { throw "npm version $Kind failed." }

        $v = (Get-Content -LiteralPath (Join-Path $RepoRoot 'package.json') -Raw | ConvertFrom-Json).version
        if (-not $NoCommit) {
            if (-not $CommitMessage) {
                $CommitMessage = switch ($Kind) {
                    'patch' { "chore: release v$v" }
                    'minor' { "chore: bump minor version to $v" }
                    'major' { "chore: bump major version to $v" }
                }
            }
            git add package.json package-lock.json
            git commit -m $CommitMessage
            if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }
        }
        return $v
    }
    finally {
        Pop-Location
    }
}
