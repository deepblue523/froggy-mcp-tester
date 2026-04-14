#Requires -Version 5.1
<#
.SYNOPSIS
  Bump the major version in package.json (and package-lock.json) using npm semver rules.

.DESCRIPTION
  Runs `npm version major --no-git-tag-version`, then commits the two files unless -NoCommit is set.
  Requires a clean working tree unless -AllowDirty is passed.

.PARAMETER NoCommit
  Update version files only; do not create a git commit.

.PARAMETER DryRun
  Print actions only.

.PARAMETER AllowDirty
  Skip the clean working tree check.
#>
param(
    [switch]$NoCommit,
    [switch]$DryRun,
    [switch]$AllowDirty
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'git is required on PATH.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm is required on PATH.'
}

if (-not $DryRun -and -not $AllowDirty) {
    $dirty = git status --porcelain
    if ($dirty) {
        throw "Working tree is not clean. Commit or stash changes, or pass -AllowDirty.`n$dirty"
    }
}

. "$PSScriptRoot\version.ps1"
$v = Invoke-NpmSemverBump -Kind major -RepoRoot $repoRoot -DryRun:$DryRun -NoCommit:$NoCommit
if (-not $DryRun) {
    Write-Host "Major version is now $v."
}
