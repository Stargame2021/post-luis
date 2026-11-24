Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Obtener la carpeta real donde reside este script
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)
batPath = currentDir & "\iniciar-pos-dev.bat"
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

desktopPath = WshShell.SpecialFolders("Desktop")
shortcutDesktop = desktopPath & "\Tienda Express POS (Modo Dev).lnk"

Set oLinkDesktop = WshShell.CreateShortcut(shortcutDesktop)
oLinkDesktop.TargetPath = cmdPath
oLinkDesktop.Arguments = "/c """ & batPath & """"
oLinkDesktop.WorkingDirectory = currentDir
oLinkDesktop.Description = "Iniciar Tienda Express POS en Modo Desarrollo (npm run dev)"
oLinkDesktop.WindowStyle = 1
If iconPath <> "" Then oLinkDesktop.IconLocation = iconPath
oLinkDesktop.Save

shortcutFolder = currentDir & "\Tienda Express POS (Modo Dev).lnk"
Set oLinkFolder = WshShell.CreateShortcut(shortcutFolder)
oLinkFolder.TargetPath = cmdPath
oLinkFolder.Arguments = "/c """ & batPath & """"
oLinkFolder.WorkingDirectory = currentDir
oLinkFolder.Description = "Iniciar Tienda Express POS en Modo Desarrollo (npm run dev)"
oLinkFolder.WindowStyle = 1
If iconPath <> "" Then oLinkFolder.IconLocation = iconPath
oLinkFolder.Save

WScript.Echo "Acceso directo de Modo Dev creado exitosamente en el Escritorio."
