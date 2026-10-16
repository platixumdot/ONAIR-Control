$ErrorActionPreference = 'Stop'

$airplayRoot = $PSScriptRoot
$projectRoot = (Resolve-Path (Join-Path $airplayRoot '..\..')).Path
$msysRoot = if ($env:MSYS2_ROOT) { $env:MSYS2_ROOT } else { 'C:\msys64' }
$bash = Join-Path $msysRoot 'usr\bin\bash.exe'
$mingwRoot = Join-Path $msysRoot 'mingw64'
$uxplaySource = Join-Path $airplayRoot 'source\uxplay'

if (-not (Test-Path $bash)) {
  throw "MSYS2 wurde nicht gefunden unter '$msysRoot'. Installiere MSYS2 oder setze MSYS2_ROOT."
}
if (-not (Test-Path (Join-Path $uxplaySource 'CMakeLists.txt'))) {
  throw 'UxPlay-Quellcode fehlt unter native\airplay\source\uxplay.'
}

$env:MSYSTEM = 'MINGW64'
$requiredPackages = @(
  'mingw-w64-x86_64-gcc',
  'mingw-w64-x86_64-cmake',
  'mingw-w64-x86_64-ninja',
  'mingw-w64-x86_64-pkgconf',
  'mingw-w64-x86_64-meson',
  'mingw-w64-x86_64-gstreamer',
  'mingw-w64-x86_64-gst-plugins-base',
  'mingw-w64-x86_64-gst-plugins-good',
  'mingw-w64-x86_64-gst-plugins-bad-libs',
  'mingw-w64-x86_64-gst-libav',
  'mingw-w64-x86_64-openssl',
  'mingw-w64-x86_64-libplist'
)
& $bash -lc "pacman -S --needed --noconfirm $($requiredPackages -join ' ')"
if ($LASTEXITCODE -ne 0) { throw 'MSYS2 konnte die AirPlay-Build-Abhängigkeiten nicht installieren.' }

function ConvertTo-MsysPath([string]$windowsPath) {
  $fullPath = [System.IO.Path]::GetFullPath($windowsPath)
  $drive = $fullPath.Substring(0, 1).ToLowerInvariant()
  $rest = $fullPath.Substring(2).Replace('\', '/')
  return "/$drive$rest"
}

function Invoke-Msys([string]$command) {
  $output = & $bash -lc $command
  if ($LASTEXITCODE -ne 0) { throw "MSYS2-Befehl fehlgeschlagen: $command" }
  return $output
}

$gstreamerVersion = (Invoke-Msys 'pkg-config --modversion gstreamer-1.0' | Select-Object -Last 1).Trim()
$gstreamerSource = Join-Path $env:TEMP "gstreamer-$gstreamerVersion-src"
if (-not (Test-Path (Join-Path $gstreamerSource 'subprojects\gst-plugins-bad\meson.build'))) {
  if (Test-Path $gstreamerSource) { Remove-Item $gstreamerSource -Recurse -Force }
  git clone --depth 1 --branch $gstreamerVersion https://gitlab.freedesktop.org/gstreamer/gstreamer.git $gstreamerSource
  if ($LASTEXITCODE -ne 0) { throw "GStreamer $gstreamerVersion konnte nicht geladen werden." }
}

$gstBadSource = ConvertTo-MsysPath (Join-Path $gstreamerSource 'subprojects\gst-plugins-bad')
$gstBadBuild = ConvertTo-MsysPath (Join-Path $env:TEMP "onair-gst-bad-build-$gstreamerVersion")
$uxplaySourceMsys = ConvertTo-MsysPath $uxplaySource
$uxplayBuild = ConvertTo-MsysPath (Join-Path $env:TEMP 'onair-uxplay-build')
$gstBadBuildWindows = Join-Path $env:TEMP "onair-gst-bad-build-$gstreamerVersion"
$uxplayBuildWindows = Join-Path $env:TEMP 'onair-uxplay-build'

if (Test-Path (Join-Path $gstBadBuildWindows 'build.ninja')) {
  Invoke-Msys "meson setup --reconfigure '$gstBadBuild' '$gstBadSource' -Dauto_features=disabled -Dvideoparsers=enabled -Dd3d11=enabled -Dd3d11-wgc=disabled --wrap-mode=nofallback" | Out-Host
} else {
  Invoke-Msys "meson setup '$gstBadBuild' '$gstBadSource' -Dauto_features=disabled -Dvideoparsers=enabled -Dd3d11=enabled -Dd3d11-wgc=disabled --wrap-mode=nofallback" | Out-Host
}
Invoke-Msys "ninja -C '$gstBadBuild' gst/videoparsers/libgstvideoparsersbad.dll sys/d3d11/libgstd3d11.dll" | Out-Host

if (-not (Test-Path (Join-Path $uxplayBuildWindows 'build.ninja'))) {
  Invoke-Msys "cmake -S '$uxplaySourceMsys' -B '$uxplayBuild' -G Ninja -DCMAKE_BUILD_TYPE=Release -DNO_MARCH_NATIVE=ON" | Out-Host
}
Invoke-Msys "cmake --build '$uxplayBuild' --parallel" | Out-Host

$runtimeRoot = Join-Path $airplayRoot 'runtime'
$runtimeBin = Join-Path $runtimeRoot 'bin'
$runtimePlugins = Join-Path $runtimeRoot 'lib\gstreamer-1.0'
$runtimeScanner = Join-Path $runtimeRoot 'libexec\gstreamer-1.0'
$runtimeLicenses = Join-Path $runtimeRoot 'licenses'
New-Item -ItemType Directory -Force $runtimeBin,$runtimePlugins,$runtimeScanner,$runtimeLicenses | Out-Null
Copy-Item (Join-Path $uxplayBuildWindows 'uxplay.exe') (Join-Path $runtimeBin 'uxplay.exe') -Force

$pluginNames = @(
  'libgstapp.dll',
  'libgstlibav.dll',
  'libgstplayback.dll',
  'libgstautodetect.dll',
  'libgstcoreelements.dll',
  'libgsttypefindfunctions.dll',
  'libgstvideoconvertscale.dll',
  'libgstvideorate.dll',
  'libgstdirectsound.dll',
  'libgstaudioconvert.dll',
  'libgstaudioresample.dll',
  'libgstvolume.dll',
  'libgstvideofilter.dll',
  'libgstlevel.dll',
  'libgstaudiofx.dll'
)
$systemPlugins = Join-Path $mingwRoot 'lib\gstreamer-1.0'
foreach ($pluginName in $pluginNames) {
  $pluginPath = Join-Path $systemPlugins $pluginName
  if (-not (Test-Path $pluginPath)) { throw "Benötigtes GStreamer-Plugin fehlt: $pluginName" }
  Copy-Item $pluginPath $runtimePlugins -Force
}

$gstBadBuildWindows = Join-Path $env:TEMP "onair-gst-bad-build-$gstreamerVersion"
Copy-Item (Join-Path $gstBadBuildWindows 'gst\videoparsers\libgstvideoparsersbad.dll') $runtimePlugins -Force
Copy-Item (Join-Path $gstBadBuildWindows 'gst-libs\gst\codecparsers\libgstcodecparsers-1.0-0.dll') $runtimeBin -Force
Copy-Item (Join-Path $gstBadBuildWindows 'sys\d3d11\libgstd3d11.dll') $runtimePlugins -Force
Copy-Item (Join-Path $gstBadBuildWindows 'gst-libs\gst\d3d11\libgstd3d11-1.0-0.dll') $runtimeBin -Force
$scanner = Join-Path $mingwRoot 'libexec\gstreamer-1.0\gst-plugin-scanner.exe'
if (-not (Test-Path $scanner)) { throw 'GStreamer-Plug-in-Scanner fehlt in der MSYS2-Installation.' }
Copy-Item $scanner $runtimeScanner -Force

$pending = [System.Collections.Generic.Queue[string]]::new()
$seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$initialFiles = @(
  (Join-Path $runtimeBin 'uxplay.exe'),
  (Join-Path $runtimeBin 'libgstcodecparsers-1.0-0.dll'),
  (Join-Path $runtimeBin 'libgstd3d11-1.0-0.dll'),
  (Join-Path $runtimeScanner 'gst-plugin-scanner.exe')
) + (Get-ChildItem $runtimePlugins -Filter '*.dll' -File | Select-Object -ExpandProperty FullName)
foreach ($file in $initialFiles) { $pending.Enqueue($file) }

while ($pending.Count -gt 0) {
  $file = $pending.Dequeue()
  if (-not $seen.Add($file)) { continue }
  $msysFile = ConvertTo-MsysPath $file
  $dependencies = Invoke-Msys "ldd '$msysFile'"
  foreach ($line in $dependencies) {
    if ($line -match '=>\s+not found') { throw "Nicht auflösbare Laufzeitabhängigkeit in '$file': $line" }
    if ($line -match '=>\s+(/mingw64/bin/[^ ]+\.dll)') {
      $dependencyName = [System.IO.Path]::GetFileName($matches[1])
      $dependencyPath = Join-Path $mingwRoot "bin\$dependencyName"
      if (-not (Test-Path $dependencyPath)) { throw "Laufzeitbibliothek nicht gefunden: $dependencyName" }
      $bundledPath = Join-Path $runtimeBin $dependencyName
      if (-not (Test-Path $bundledPath)) {
        Copy-Item $dependencyPath $bundledPath
        $pending.Enqueue($bundledPath)
      }
    }
  }
}

Copy-Item (Join-Path $airplayRoot 'licenses\UXPLAY-GPL-3.0.txt') $runtimeLicenses -Force
Copy-Item (Join-Path $airplayRoot 'licenses\GSTREAMER-LGPL-2.1.txt') $runtimeLicenses -Force
Copy-Item (Join-Path $uxplaySource 'lib\llhttp\LICENSE-MIT') $runtimeLicenses -Force
Copy-Item (Join-Path $uxplaySource 'lib\playfair\LICENSE.md') $runtimeLicenses -Force
$msysLicenseRoot = Join-Path $mingwRoot 'share\licenses'
if (-not (Test-Path $msysLicenseRoot)) { throw 'MSYS2-Lizenzhinweise fehlen in mingw64\share\licenses.' }
$runtimeMsysLicenses = Join-Path $runtimeLicenses 'msys2'
New-Item -ItemType Directory -Force $runtimeMsysLicenses | Out-Null
Copy-Item (Join-Path $msysLicenseRoot '*') $runtimeMsysLicenses -Recurse -Force
$runtimeFiles = (Get-ChildItem $runtimeRoot -Recurse -File | Measure-Object).Count
Write-Output "AirPlay-Receiver erfolgreich gebaut und gebündelt: $runtimeFiles Dateien in $runtimeRoot"
