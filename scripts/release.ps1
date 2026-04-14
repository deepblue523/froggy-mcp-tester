#Requires -Version 5.1
<#
.SYNOPSIS
  Build a Windows installer (EXE), create a version tag, push it, and publish a GitHub release with artifacts.

.DESCRIPTION
  By default bumps the patch version (`npm version patch --no-git-tag-version`), commits package.json and
  package-lock.json as "chore: release vX.Y.Z", then installs dependencies, runs electron-builder, creates an
  annotated tag v<version>, pushes the tag to origin, and runs `gh release create` with the EXE(s) in dist/.

  Use .\scripts\bump-minor.ps1 or .\scripts\bump-major.ps1 when you need a minor or major bump; releases after
  that continue to auto-increment patch.

  Prerequisites: Node.js, npm, git, GitHub CLI (`gh`) authenticated (`gh auth login`), and a remote named `origin`.

.PARAMETER DryRun
  Print the steps without running builds, git writes, pushes, or `gh`.

.PARAMETER AllowDirty
  Allow a dirty working tree (default: require clean index except untracked files optional - we check git status --porcelain)

.PARAMETER SkipVersionBump
  Do not run patch bump or version commit; release using the version already in package.json.

.PARAMETER SkipInstall
  Skip `npm ci`.

.PARAMETER SkipBuild
  Skip `npm run release:build`; dist/*.exe must already exist.

.PARAMETER PushBranch
  Run `git push origin HEAD` before creating the tag (use when your release commit is not yet on the remote).
#>
param(
    [switch]$DryRun,
    [switch]$AllowDirty,
    [switch]$SkipVersionBump,
    [switch]$SkipInstall,
    [switch]$SkipBuild,
    [switch]$PushBranch
)

$ErrorActionPreference = 'Stop'

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found on PATH: $Name"
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

Require-Command 'git'
Require-Command 'gh'
Require-Command 'npm'
Require-Command 'node'

$pkgPath = Join-Path $repoRoot 'package.json'
if (-not (Test-Path -LiteralPath $pkgPath)) {
    throw "package.json not found at $pkgPath"
}

$dist = Join-Path $repoRoot 'dist'

if ($DryRun) {
    $pkgPreview = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
    $cur = [string]$pkgPreview.version
    Write-Host "Dry run: release from $repoRoot (current package version: $cur)"
    if (-not $SkipVersionBump) {
        Write-Host '  npm version patch --no-git-tag-version'
        Write-Host '  git commit package.json + package-lock.json (chore: release v...)'
    }
    else {
        Write-Host "  (no patch bump; tag would be v$cur)"
    }
    if (-not $SkipInstall) { Write-Host '  npm ci' }
    if (-not $SkipBuild) { Write-Host '  npm run release:build' }
    if ($PushBranch) { Write-Host '  git push origin HEAD' }
    Write-Host '  git tag -a v<version> -m "Release v<version>"'
    Write-Host '  git push origin v<version>'
    Write-Host '  gh release create v<version> --verify-tag --generate-notes (EXE + latest.yml + .blockmap)'
    exit 0
}

if (-not $AllowDirty) {
    $dirty = git status --porcelain
    if ($dirty) {
        throw "Working tree is not clean. Commit or stash changes, or pass -AllowDirty.`n$dirty"
    }
}

. "$PSScriptRoot\version.ps1"
if (-not $SkipVersionBump) {
    Invoke-NpmSemverBump -Kind patch -RepoRoot $repoRoot
}

$pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
$ver = [string]$pkg.version
if ([string]::IsNullOrWhiteSpace($ver)) {
    throw 'package.json is missing a non-empty "version" field.'
}

$tag = "v$ver"

$head = git rev-parse HEAD
$null = git rev-parse '@{u}' 2>$null
if ($LASTEXITCODE -eq 0) {
    $upstream = git rev-parse '@{u}'
    if ($head -ne $upstream) {
        Write-Warning "HEAD ($head) differs from upstream tracking commit ($upstream). Ensure you intend to tag this commit."
    }
}

if (-not $SkipInstall) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
}

if (-not $SkipBuild) {
    npm run release:build
    if ($LASTEXITCODE -ne 0) { throw 'npm run release:build failed.' }
}

$exes = @(Get-ChildItem -LiteralPath $dist -Filter '*.exe' -File -ErrorAction SilentlyContinue)
if ($exes.Count -eq 0) {
    throw "No .exe files found under $dist. Build the app or omit -SkipBuild."
}

$extraAssets = @()
$latestYml = Join-Path $dist 'latest.yml'
if (Test-Path -LiteralPath $latestYml) {
    $extraAssets += $latestYml
}
else {
    Write-Warning "dist/latest.yml missing — auto-update will not work until electron-builder publish config is present and you rebuild."
}
$extraAssets += @(Get-ChildItem -LiteralPath $dist -Filter '*.blockmap' -File -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })

if ($PushBranch) {
    git push origin HEAD
    if ($LASTEXITCODE -ne 0) { throw 'git push origin HEAD failed.' }
}

$existing = git tag -l $tag
if ($existing) {
    throw "Tag $tag already exists locally. Delete it or bump version in package.json."
}

git tag -a $tag -m "Release $tag"
if ($LASTEXITCODE -ne 0) { throw "git tag failed." }

git push origin $tag
if ($LASTEXITCODE -ne 0) { throw "git push origin $tag failed." }

$ghArgs = @(
    'release', 'create', $tag,
    '--verify-tag',
    '--title', "Froggy MCP Tester $tag",
    '--generate-notes'
) + ($exes | ForEach-Object { $_.FullName }) + $extraAssets

gh @ghArgs
if ($LASTEXITCODE -ne 0) { throw 'gh release create failed.' }

$assetCount = $exes.Count + $extraAssets.Count
Write-Host "Release $tag published with $assetCount artifact(s) (includes updater metadata when latest.yml is present)."
