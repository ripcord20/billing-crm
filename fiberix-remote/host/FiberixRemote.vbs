Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("Wscript.Shell")
If fso.FileExists(root & "\runtime\node.exe") Then
  sh.CurrentDirectory = root & "\host"
  sh.Run """" & root & "\runtime\node.exe"" """ & root & "\host\agent.js""", 0, False
ElseIf fso.FileExists(root & "\agent.js") Then
  sh.CurrentDirectory = root
  sh.Run "node """ & root & "\agent.js""", 0, False
End If
