@echo off
rem Starts n8n on Node 24 (n8n's add-ons don't build on Node 26).
rem Node 24 lives in the fnm folder; on this PC Windows stored it under the Claude app's LocalCache.
set "NODE24=%APPDATA%\fnm\node-versions\v24.22.3\installation"
if not exist "%NODE24%\n8n.cmd" set "NODE24=%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\fnm\node-versions\v24.22.3\installation"
if not exist "%NODE24%\n8n.cmd" (
  echo Could not find Node 24 with n8n. Reinstall with: fnm install 24, then npm install -g n8n
  exit /b 1
)
set "PATH=%NODE24%;%PATH%"
rem Use Philippine time for timestamps like received_at.
set "GENERIC_TIMEZONE=Asia/Manila"
set "TZ=Asia/Manila"
call "%NODE24%\n8n.cmd" start
