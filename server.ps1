# Static file server for 手柄控制 (Windows PowerShell, no dependencies)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 8765
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")
try { $listener.Start() } catch {
  Write-Host "Port $port is busy. Close other instances and retry."
  Read-Host "Press Enter to exit"
  exit 1
}

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
}

Write-Host "Serving $root on http://127.0.0.1:$port/"
Write-Host "Close this window to stop."

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.LocalPath
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    $rel = $path.TrimStart('/').Replace('/', '\')
    $file = Join-Path $root $rel
    if ((Test-Path $file -PathType Leaf)) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      if ($types.ContainsKey($ext)) { $ctx.Response.ContentType = $types[$ext] }
      $ctx.Response.Headers.Add('Cache-Control', 'no-store')
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.Close()
  } catch {
    # ignore request errors
  }
}
