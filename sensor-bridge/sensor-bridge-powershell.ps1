# Alternative simple bridge for Windows PowerShell. Best for CPU/RAM and NVIDIA GPU via nvidia-smi.
# Temperatures from motherboard/CPU generally require HWiNFO/LibreHardwareMonitor or a Node bridge/library.
$port = 17377
Add-Type -AssemblyName System.Web
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()
Write-Host "Hamburg System HUD PowerShell bridge: http://127.0.0.1:$port/stats"
function JsonResponse($ctx, $obj, $status=200){
  $json = $obj | ConvertTo-Json -Depth 8
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = 'application/json'
  $ctx.Response.Headers.Add('Access-Control-Allow-Origin','*')
  $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
  $ctx.Response.Close()
}
while($listener.IsListening){
  $ctx = $listener.GetContext()
  if($ctx.Request.HttpMethod -eq 'OPTIONS'){ $ctx.Response.Headers.Add('Access-Control-Allow-Origin','*'); $ctx.Response.StatusCode=204; $ctx.Response.Close(); continue }
  if($ctx.Request.Url.AbsolutePath -ne '/stats'){ JsonResponse $ctx @{error='not found'} 404; continue }
  $cpuLoad = (Get-Counter '\Processor(_Total)\% Processor Time').CounterSamples.CookedValue
  $os = Get-CimInstance Win32_OperatingSystem
  $totalGb = [math]::Round($os.TotalVisibleMemorySize/1MB,1)
  $freeGb = [math]::Round($os.FreePhysicalMemory/1MB,1)
  $gpuName = 'GPU'; $gpuUse = 0; $vramUsed = $null; $vramTotal = $null; $gpuTemp = $null
  $nvsmi = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
  if($nvsmi){
    $line = & nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits 2>$null | Select-Object -First 1
    if($line){ $p = $line -split ',\s*'; $gpuName=$p[0]; $gpuUse=[double]$p[1]; $vramUsed=[math]::Round([double]$p[2]/1024,1); $vramTotal=[math]::Round([double]$p[3]/1024,1); $gpuTemp=[double]$p[4] }
  }
  JsonResponse $ctx @{
    timestamp=(Get-Date).ToString('o')
    cpu=@{name=(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name); usage=[math]::Round($cpuLoad,1); temp=$null}
    gpu=@{name=$gpuName; usage=$gpuUse; temp=$gpuTemp; memoryUsedGB=$vramUsed; memoryTotalGB=$vramTotal}
    ram=@{usedGB=[math]::Round($totalGb-$freeGb,1); totalGB=$totalGb}
    motherboard=@{name='Motherboard'; temp=$null}
  }
}
