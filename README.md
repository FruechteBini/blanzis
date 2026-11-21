# Blanzis

Blanzis ist unsere Familien-App auf Basis von [Yuvomi](https://github.com/ulsklyc/yuvomi). Das Repository enthält unsere Anpassungen für die Instanz unter [familie.korbsta.com](https://familie.korbsta.com/).

Die erste Version `v2.93.0-blanzis.1` verwendet Yuvomi `v2.93.0` und das Docker-Image `blanzis:2.93.0-1`. Der Build ändert den sichtbaren Namen in der Oberfläche, in Benachrichtigungen sowie im Web-App-Manifest. Der Manifest-Pfad und die Installations-ID bleiben für bestehende Web-App-Installationen erhalten. Yuvomi ist MIT-lizenziert. Die Lizenz und die Hinweise zu den verwendeten Bibliotheken bleiben im Image enthalten.

## Frontend bauen

Unter Windows mit Node.js 24 und npm aus dem Projektverzeichnis ausführen. Das Skript lädt den festgelegten Upstream-Release und prüft seine SHA-256-Prüfsumme. Mit `-SourceArchive` kann ein vorhandenes Archiv desselben Releases verwendet werden.

```powershell
.\branding\build-frontend.ps1
```

Das Ergebnis liegt unter `branding/frontend.tar.gz`. Der Vite-Build läuft auf dem Windows-Rechner, weil das native Build-Werkzeug auf der DS224+ beim Test mit einem Prozessorfehler abgebrochen ist. Auf der NAS wird das fertige Frontend mit dem festgelegten Yuvomi-Image kombiniert.

## Installation auf BlanziNAS aktualisieren

Die Betriebsdateien liegen unter `/volume1/docker/yuvomi`. Das Image wird auf der NAS gebaut. Die vorhandene Compose-Datei definiert Volumes, Umgebungsvariablen und das Cloudflare-Tunnelnetz.

1. Übertrage `branding/Dockerfile`, `branding/apply-branding.mjs`, `branding/.dockerignore` und `branding/frontend.tar.gz` nach `/volume1/docker/yuvomi/branding/`.
2. Baue dort das Image mit `/usr/local/bin/docker build --tag blanzis:2.93.0-1 .` mit den üblichen Docker-Rechten.
3. Setze im vorhandenen Compose-Projekt den gewünschten Image-Tag und aktualisiere den Dienst mit `/usr/local/bin/docker compose up -d --no-build --pull never --wait`.
4. Prüfe den Containerstatus sowie `/health` und `/manifest.webmanifest` auf der öffentlichen Domain. Das Manifest soll `Blanzis` als `name` und `short_name` liefern.

Bei einem neuen Upstream-Release werden Archivversion, Prüfsumme, Basisimage-Digest, Build-Revision und Image-Tag gemeinsam aktualisiert. Beim Wechsel auf einen neuen Upstream-Release vorab ein Yuvomi-Backup erstellen und die Release-Hinweise auf Datenbankmigrationen prüfen.
