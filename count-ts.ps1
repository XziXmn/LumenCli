$packages = @('packages/ai', 'packages/agent', 'packages/coding-agent', 'packages/tui')
$grandFiles = 0
$grandLines = 0

foreach ($pkg in $packages) {
    $files = Get-ChildItem -Path $pkg -Recurse -Filter '*.ts' -File |
        Where-Object { $_.FullName -notmatch '\\(node_modules|dist)\\' }
    $fileCount = $files.Count
    $lineCount = 0
    foreach ($f in $files) {
        $lineCount += (Get-Content $f.FullName).Count
    }
    Write-Output ('{0}: {1} files, {2} lines' -f $pkg, $fileCount, $lineCount)
    $grandFiles += $fileCount
    $grandLines += $lineCount
}
Write-Output '---'
Write-Output ('GRAND TOTAL: {0} files, {1} lines' -f $grandFiles, $grandLines)
