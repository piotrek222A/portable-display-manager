param(
  [string]$RemoteUrl = ""
)

# Uruchom w katalogu projektu (gdzie jest package.json)
Write-Output "Inicjalizacja repozytorium git w $(Get-Location)"

if (-not (Test-Path ".git")) {
  git init
  if ($LASTEXITCODE -ne 0) { Write-Error "git init nie powiodło się"; exit 1 }
  Write-Output "Utworzono repozytorium git."
} else {
  Write-Output "Repozytorium git już istnieje."
}

# Dodaj .gitignore (jeśli istnieje, nadal dodamy)
git add .gitignore
git add -A
git commit -m "Initial commit" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Output "Brak zmian do commita lub commit nieudany. Kontynuuję."
} else {
  Write-Output "Stworzono pierwszy commit."
}

if ($RemoteUrl) {
  git remote remove origin 2>$null
  git remote add origin $RemoteUrl
  git branch -M main
  Write-Output "Dodano remote origin: $RemoteUrl"
  Write-Output "Wysyłam na origin/main..."
  git push -u origin main
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "git push nie powiódł się. Sprawdź uprawnienia (użyj PAT dla HTTPS) lub konfigurację SSH."
  } else {
    Write-Output "Push zakończony."
  }
} else {
  Write-Output "Nie podano RemoteUrl. Aby dodać remote: git remote add origin <URL> ; git push -u origin main"
}
