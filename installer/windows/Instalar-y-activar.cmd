@echo off
setlocal
echo Cierra Photoshop. Creative Cloud debe estar instalado y con sesion iniciada.
powershell.exe -NoProfile -File "%~dp0HalftoneDTF-Updater.ps1" -Mode Install
if errorlevel 1 echo No se completo la instalacion. Revisa el mensaje anterior.
pause
