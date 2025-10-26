param(
  [string]$ExePath = "C:\Program Files\RemoteDisplay\RemoteDisplay 1.0.0.exe",
  [string]$KioskUser = "kiosk",
  [string]$Password = "KioskPass123!",
  [switch]$CreateUserIfMissing = $true,
  [switch]$EnableAutoLogon = $true
)

function Ensure-Admin {
  if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Error "Uruchom ten skrypt jako Administrator."
    exit 1
  }
}

function Create-LocalUserIfMissing {
  param($User, $Pass)
  $exists = (net user $User) 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Output "Tworzę konto lokalne: $User"
    net user $User $Pass /add /y
    # Dodaj do grupy Users (bez uprawnień admin)
    net localgroup "Users" $User /add 2>$null
  } else {
    Write-Output "Konto $User już istnieje"
  }
}

function Set-AutoLogon {
  param($User, $Pass)
  Write-Output "Ustawiam autologon dla $User (zapis hasła w rejestrze)."
  $regPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon"
  New-Item -Path $regPath -Force | Out-Null
  Set-ItemProperty -Path $regPath -Name "DefaultUserName" -Value $User -Force
  Set-ItemProperty -Path $regPath -Name "DefaultPassword" -Value $Pass -Force
  Set-ItemProperty -Path $regPath -Name "AutoAdminLogon" -Value "1" -Force
  # Opcjonalnie ustaw domyślny shell tylko jeśli chcesz zastąpić explorer.exe (ryzykowne)
}

function Create-StartupShortcut {
  param($User, $TargetExe)
  $startup = Join-Path -Path "C:\Users\$User\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup" -ChildPath ""
  if (-not (Test-Path $startup)) {
    Write-Output "Tworzę folder Autostart dla $User: $startup"
    New-Item -ItemType Directory -Path $startup -Force | Out-Null
  }
  $wsh = New-Object -ComObject WScript.Shell
  $lnkPath = Join-Path $startup "RemoteDisplay - Kiosk.lnk"
  $shortcut = $wsh.CreateShortcut($lnkPath)
  $shortcut.TargetPath = $TargetExe
  $shortcut.Arguments = ""  # dodaj np. --kiosk jeśli potrzebne
  $shortcut.WorkingDirectory = Split-Path $TargetExe
  $shortcut.WindowStyle = 1
  $shortcut.Save()
  Write-Output "Utworzono skrót autostartu: $lnkPath"
}

# Główna logika
Ensure-Admin

if (-not (Test-Path $ExePath)) {
  Write-Warning "Nie znaleziono pliku EXE: $ExePath"
  Write-Warning "Upewnij się, że podałeś poprawną ścieżkę. Przerwanie."
  exit 2
}

if ($CreateUserIfMissing) {
  Create-LocalUserIfMissing -User $KioskUser -Pass $Password
}

if ($EnableAutoLogon) {
  Set-AutoLogon -User $KioskUser -Pass $Password
}

Create-StartupShortcut -User $KioskUser -TargetExe $ExePath

Write-Output "Gotowe. Zrestartuj komputer, aby zastosować autologowanie i uruchomić aplikację w trybie kiosku."
Write-Output "Uwaga: autologon zapisuje hasło w rejestrze w postaci jawnej. Rozważ użycie Sysinternals Autologon lub Assigned Access (Windows Kiosk) dla bezpieczniejszej konfiguracji."
