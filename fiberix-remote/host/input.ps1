param(
  [Parameter(Position=0)][string]$Kind,
  [Parameter(Position=1)][string]$A,
  [Parameter(Position=2)][string]$B,
  [Parameter(Position=3)][string]$C,
  [Parameter(Position=4)][string]$D
)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class FiberixInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, int dwFlags, UIntPtr dwExtraInfo);
  public const int MOUSEEVENTF_LEFTDOWN = 0x02;
  public const int MOUSEEVENTF_LEFTUP = 0x04;
  public const int MOUSEEVENTF_RIGHTDOWN = 0x08;
  public const int MOUSEEVENTF_RIGHTUP = 0x10;
  public const int MOUSEEVENTF_WHEEL = 0x0800;
  public const int KEYEVENTF_KEYUP = 0x0002;
}
"@

if ($Kind -eq 'mouse') {
  $action = $A
  $x = [int]$B
  $y = [int]$C
  $btn = $D
  [FiberixInput]::SetCursorPos($x, $y) | Out-Null
  if ($action -eq 'down' -or $action -eq 'click') {
    if ($btn -eq 'right') { [FiberixInput]::mouse_event([FiberixInput]::MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, [UIntPtr]::Zero) }
    else { [FiberixInput]::mouse_event([FiberixInput]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero) }
  }
  if ($action -eq 'up' -or $action -eq 'click') {
    if ($btn -eq 'right') { [FiberixInput]::mouse_event([FiberixInput]::MOUSEEVENTF_RIGHTUP, 0, 0, 0, [UIntPtr]::Zero) }
    else { [FiberixInput]::mouse_event([FiberixInput]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero) }
  }
}
elseif ($Kind -eq 'key') {
  $action = $A
  $vk = 0
  if (-not [int]::TryParse($B, [ref]$vk)) { return }
  if ($vk -lt 1 -or $vk -gt 254) { return }
  if ($action -eq 'down') { [FiberixInput]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero) }
  if ($action -eq 'up') { [FiberixInput]::keybd_event([byte]$vk, 0, [FiberixInput]::KEYEVENTF_KEYUP, [UIntPtr]::Zero) }
}
