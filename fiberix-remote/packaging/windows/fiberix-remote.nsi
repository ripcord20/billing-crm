Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

Name "Fiberix Remote"
OutFile "..\..\dist\FiberixRemote-Setup.exe"
InstallDir "$PROGRAMFILES64\Fiberix Remote"
InstallDirRegKey HKLM "Software\FiberixRemote" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\orange-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\orange-uninstall.ico"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Indonesian"
!insertmacro MUI_LANGUAGE "English"

Section "Host" SecHost
  SetOutPath "$INSTDIR"
  File "..\..\dist\win\FiberixRemote.exe"
  File "..\..\host\capture.ps1"
  File "..\..\host\input.ps1"
  File "..\..\host\ui.html"

  CreateDirectory "$SMPROGRAMS\Fiberix Remote"
  CreateShortCut "$SMPROGRAMS\Fiberix Remote\Fiberix Remote.lnk" "$INSTDIR\FiberixRemote.exe"
  CreateShortCut "$DESKTOP\Fiberix Remote.lnk" "$INSTDIR\FiberixRemote.exe"

  WriteRegStr HKLM "Software\FiberixRemote" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\FiberixRemote" "DisplayName" "Fiberix Remote"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\FiberixRemote" "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\FiberixRemote" "DisplayVersion" "1.0.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\FiberixRemote" "Publisher" "Fiberix"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\Fiberix Remote.lnk"
  Delete "$SMPROGRAMS\Fiberix Remote\Fiberix Remote.lnk"
  RMDir "$SMPROGRAMS\Fiberix Remote"
  Delete "$INSTDIR\FiberixRemote.exe"
  Delete "$INSTDIR\capture.ps1"
  Delete "$INSTDIR\input.ps1"
  Delete "$INSTDIR\ui.html"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\FiberixRemote"
  DeleteRegKey HKLM "Software\FiberixRemote"
SectionEnd
