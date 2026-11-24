Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Obtener la carpeta real donde reside este script
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = currentDir & "\iniciar-pos-node.bat"
cmdPath = WshShell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\cmd.exe"

' Resolver icono existente en el repositorio
iconPath = ""
If fso.FileExists(currentDir & "\public\icono.ico") Then
    iconPath = currentDir & "\public\icono.ico, 0"
ElseIf fso.FileExists(currentDir & "\src\app\favicon.ico") Then
    iconPath = currentDir & "\src\app\favicon.ico, 0"
ElseIf fso.FileExists(currentDir & "\app.ico") Then
    iconPath = currentDir & "\app.ico, 0"
End If

' Ruta del Escritorio del usuario
desktopPath = WshShell.SpecialFolders("Desktop")
shortcutDesktop = desktopPath & "\Tienda Express POS (Node).lnk"

' Crear acceso directo en el Escritorio invocando cmd.exe /c "bat"
Set oLinkDesktop = WshShell.CreateShortcut(shortcutDesktop)
oLinkDesktop.TargetPath = cmdPath
oLinkDesktop.Arguments = "/c """ & batPath & """"
oLinkDesktop.WorkingDirectory = currentDir
oLinkDesktop.Description = "Iniciar Tienda Express POS con Node.js (Sin Docker)"
oLinkDesktop.WindowStyle = 1
If iconPath <> "" Then oLinkDesktop.IconLocation = iconPath
oLinkDesktop.Save

' Crear también un acceso directo dentro de la carpeta del proyecto actual
shortcutFolder = currentDir & "\Tienda Express POS (Node).lnk"
Set oLinkFolder = WshShell.CreateShortcut(shortcutFolder)
oLinkFolder.TargetPath = cmdPath
oLinkFolder.Arguments = "/c """ & batPath & """"
oLinkFolder.WorkingDirectory = currentDir
oLinkFolder.Description = "Iniciar Tienda Express POS con Node.js (Sin Docker)"
oLinkFolder.WindowStyle = 1
If iconPath <> "" Then oLinkFolder.IconLocation = iconPath
oLinkFolder.Save

WScript.Echo "Acceso directo actualizado exitosamente en el Escritorio."
