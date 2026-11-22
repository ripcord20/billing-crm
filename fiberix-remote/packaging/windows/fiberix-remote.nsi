Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"

Name "Fiberix Remote"
BrandingText "Skynet"
OutFile "..\..\dist\FiberixRemote-Setup.exe"
InstallDir "$PROGRAMFILES64\Fiberix Remote"
InstallDirRegKey HKLM "Software\FiberixRemote" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
SetOverwrite on

VIProductVersion "1.0.1.0"
VIAddVersionKey /LANG=1033 "ProductName" "Fiberix Remote"
VIAddVersionKey /LANG=1033 "CompanyName" "Skynet"
VIAddVersionKey /LANG=1033 "FileDescription" "Fiberix Remote Host Setup"
VIAddVersionKey /LANG=1033 "FileVersion" "1.0.1"
VIAddVersionKey /LANG=1033 "ProductVersion" "1.0.1"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Copyright (C) Skynet"
VIAddVersionKey /LANG=1033 "OriginalFilename" "FiberixRemote-Setup.exe"

!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\orange-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\orange-uninstall.ico"
!define MUI_FINISHPAGE_RUN "$INSTDIR\FiberixRemote.vbs"
!define MUI_FINISHPAGE_RUN_TEXT "Buka Fiberix Remote"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Indonesian"
!insertmacro MUI_LANGUAGE "English"

!macro StopRunningHost
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "stop-fiberix.cmd"
  nsExec::ExecToLog '"$PLUGINSDIR\stop-fiberix.cmd"'
  Sleep 1500
!macroend

Function .onInit
  !insertmacro StopRunningHost
FunctionEnd

Section "Host" SecHost
  !insertmacro StopRunningHost

  SetOutPath "$INSTDIR\runtime"
  File "..\..\dist\win\runtime\node.exe"

  SetOutPath "$INSTDIR\host"
  File "..\..\host\agent.js"
  File "..\..\host\ui.html"
  File "..\..\host\capture.ps1"
  File "..\..\host\input.ps1"

  SetOutPath "$INSTDIR\lib"
  File "..\..\lib\relayUrl.js"
  File "..\..\lib\defaultRelay.js"

  SetOutPath "$INSTDIR\server"
  File "..\..\server\index.js"
  File "..\..\server\sessions.js"

  SetOutPath "$INSTDIR\viewer"
  File "..\..\viewer\relayUrl.js"
  File "..\..\viewer\defaultRelay.js"
  File "..\..\viewer\index.html"
  File "..\..\viewer\app.js"
  File "..\..\viewer\app.css"
  File "..\..\viewer\manifest.webmanifest"
  File "..\..\viewer\icon.svg"

  SetOutPath "$INSTDIR\node_modules"
  File /r "..\..\dist\win\stage\node_modules\ws"

  SetOutPath "$INSTDIR"
  File "..\..\host\FiberixRemote.vbs"

  CreateDirectory "$SMPROGRAMS\Fiberix Remote"
  CreateShortCut "$SMPROGRAMS\Fiberix Remote\Fiberix Remote.lnk" "$INSTDIR\FiberixRemote.vbs" "" "$INSTDIR\runtime\node.exe" 0
  CreateShortCut "$DESKTOP\Fiberix Remote.lnk" "$INSTDIR\FiberixRemote.vbs" "" "$INSTDIR\runtime\node.exe" 0

  WriteRegStr HKLM "Software\FiberixRemote" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\FiberixRemote" "DisplayName" "Fiberix Remote"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\FiberixRemote" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\FiberixRemote" "DisplayVersion" "1.0.1"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\FiberixRemote" "Publisher" "Skynet"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  !insertmacro StopRunningHost
  Delete "$DESKTOP\Fiberix Remote.lnk"
  Delete "$SMPROGRAMS\Fiberix Remote\Fiberix Remote.lnk"
  RMDir "$SMPROGRAMS\Fiberix Remote"
  RMDir /r "$INSTDIR"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "FiberixRemote"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\FiberixRemote"
  DeleteRegKey HKLM "Software\FiberixRemote"
SectionEnd
