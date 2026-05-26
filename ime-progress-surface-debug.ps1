$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$tsxBin = Join-Path $scriptDir "node_modules/.bin/tsx.cmd"
if (-not (Test-Path -LiteralPath $tsxBin)) {
	throw "tsx not found at $tsxBin. Run npm install from the repo root first."
}

$noLog = $false
$scenario = $null
$scenarioList = $null
$exitAfterMs = $null
$autoCycleMs = $null
foreach ($arg in $args) {
	if ($arg -eq "--no-log") {
		$noLog = $true
	}
}

for ($index = 0; $index -lt $args.Count; $index++) {
	$arg = $args[$index]
	if ($arg -eq "--scenario" -and $index + 1 -lt $args.Count) {
		$scenario = $args[$index + 1]
		$index++
		continue
	}
	if ($arg -eq "--scenario-list" -and $index + 1 -lt $args.Count) {
		$scenarioList = $args[$index + 1]
		$index++
		continue
	}
	if ($arg -eq "--exit-after-ms" -and $index + 1 -lt $args.Count) {
		$exitAfterMs = $args[$index + 1]
		$index++
		continue
	}
	if ($arg -eq "--auto-cycle-ms" -and $index + 1 -lt $args.Count) {
		$autoCycleMs = $args[$index + 1]
		$index++
	}
}

$logDir = Join-Path $scriptDir ".tmp"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logPath = Join-Path $logDir "ime-progress-surface-debug-ansi.log"

$env:PI_HARDWARE_CURSOR = "1"
if ($noLog) {
	Remove-Item Env:PI_TUI_WRITE_LOG -ErrorAction SilentlyContinue
} else {
	$env:PI_TUI_WRITE_LOG = $logPath
}

Write-Host "Starting IME progress surface debug harness..."
if ($noLog) {
	Write-Host "ANSI write log: disabled"
} else {
	Write-Host "ANSI write log: $logPath"
}
if ($scenario) {
	Write-Host "Initial scenario: $scenario"
}
if ($scenarioList) {
	Write-Host "Scenario list: $scenarioList"
	if ($scenarioList -eq "critical") {
		Write-Host "Scenario alias 'critical' => approval,ask-user,retry,reconnect,parallel,bash,branch-summary,complete"
	}
}
if ($exitAfterMs) {
	Write-Host "Auto exit after: $exitAfterMs ms"
}
if ($autoCycleMs) {
	Write-Host "Auto cycle every: $autoCycleMs ms"
}
Write-Host "Tips:"
Write-Host "  - 切到中文输入法后，在不同场景里输入拼音观察候选窗是否闪到正文/任务栏/footer"
Write-Host "  - Ctrl+N 切换场景，Ctrl+P 暂停/恢复动画，Ctrl+R 清零终端写入计数，Ctrl+C 退出"

$tsxArgs = @((Join-Path $scriptDir "packages/coding-agent/test/ime-progress-surface-debug.ts"))
if ($scenario) {
	$tsxArgs += @("--scenario", $scenario)
}
if ($scenarioList) {
	$tsxArgs += @("--scenario-list", $scenarioList)
}
if ($exitAfterMs) {
	$tsxArgs += @("--exit-after-ms", $exitAfterMs)
}
if ($autoCycleMs) {
	$tsxArgs += @("--auto-cycle-ms", $autoCycleMs)
}

& $tsxBin @tsxArgs
$exitCode = $LASTEXITCODE
if (-not $noLog) {
	Write-Host "ANSI write log saved at: $logPath"
}
if ($exitCode -ne 0) {
	exit $exitCode
}
