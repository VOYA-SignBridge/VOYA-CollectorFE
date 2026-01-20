<#
dev.ps1 - Windows helper for VOYA-CollectorFE

Usage:
  .\dev.ps1            # start dev server (default)
  .\dev.ps1 dev
  .\dev.ps1 install    # install dependencies (npm ci)
  .\dev.ps1 build      # build production bundle
  .\dev.ps1 preview    # preview production build
  .\dev.ps1 help       # show this help

This script will:
- check for Node.js
- copy .env.example -> .env if .env is missing
- install dependencies if node_modules is missing or you run 'install'
- run the requested npm script
#>

param(
    [ValidateSet("dev","install","build","preview","help")]
    [string]$Action = "dev"
)

Set-StrictMode -Version Latest

function Show-Help {
    Write-Host "dev.ps1 - Helper script for VOYA-CollectorFE" -ForegroundColor Cyan
    Write-Host "`nUsage:`n  .\dev.ps1 [dev|install|build|preview|help]`n"
    Write-Host "Commands:`n  dev       Start development server (npm run dev)"
    Write-Host "  install   Install dependencies (npm ci)"
    Write-Host "  build     Build production bundle (npm run build)"
    Write-Host "  preview   Preview production build (npm run preview)"
    Write-Host "  help      Show this help message`n"
}

function Ensure-Node {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Error "Node.js not found in PATH. Please install Node.js (LTS) and try again."
        exit 1
    }
}

function Ensure-Env {
    if (-not (Test-Path -Path .env)) {
        if (Test-Path -Path .env.example) {
            Copy-Item -Path .env.example -Destination .env -Force
            Write-Host "Copied .env.example -> .env"
        } else {
            Write-Warning "No .env or .env.example found. Create .env manually if needed."
        }
    }
}

function Ensure-Dependencies {
    if (-not (Test-Path -Path node_modules)) {
        Write-Host "node_modules not found. Installing dependencies (npm ci)..." -ForegroundColor Yellow
        npm ci
    } else {
        Write-Host "node_modules found. Skipping install." -ForegroundColor Green
    }
}

# Main
switch ($Action) {
    'help' { Show-Help; break }
    'install' {
        Ensure-Node
        npm ci
        break
    }
    'dev' {
        Ensure-Node
        Ensure-Env
        Ensure-Dependencies
        Write-Host "Starting dev server... (npm run dev)" -ForegroundColor Cyan
        npm run dev
        break
    }
    'build' {
        Ensure-Node
        Ensure-Env
        Ensure-Dependencies
        Write-Host "Building production bundle... (npm run build)" -ForegroundColor Cyan
        npm run build
        break
    }
    'preview' {
        Ensure-Node
        Write-Host "Previewing production build... (npm run preview)" -ForegroundColor Cyan
        npm run preview
        break
    }
    default { Show-Help }
}
