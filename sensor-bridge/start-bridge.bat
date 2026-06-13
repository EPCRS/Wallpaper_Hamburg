@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing sensor bridge dependencies...
  npm install
)
npm start
pause
