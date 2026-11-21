# Blanzis

Blanzis ist unsere Familien-App auf Basis von [Yuvomi](https://github.com/ulsklyc/yuvomi). Das Repository enthält unsere Anpassungen für die Instanz unter [familie.korbsta.com](https://familie.korbsta.com/).

Die erste Version `v2.93.0-blanzis.1` verwendet Yuvomi `v2.93.0` und das Docker-Image `blanzis:2.93.0-1`. Der Build ändert den sichtbaren Namen in der Oberfläche, in Benachrichtigungen sowie im Web-App-Manifest. Der Manifest-Pfad und die Installations-ID bleiben für bestehende Web-App-Installationen erhalten. Yuvomi ist MIT-lizenziert. Die Lizenz und die Hinweise zu den verwendeten Bibliotheken bleiben im Image enthalten.

`v2.93.0-blanzis.2` ergänzt Notizen um Bildanhänge, Linkkarten sowie persönliche und gemeinsame Projekte. Eine Projektliste bündelt Notizen und deren Checklisten. Bilder und Projektzuordnungen liegen in der vorhandenen Datenbank und sind Teil ihrer Backups.

`v2.93.0-blanzis.3` zeigt auf dem Handy standardmäßig Termintitel in der Monatsansicht. Mehrtägige Termine laufen als Balken über mehrere Tageskacheln. Ein Tipp auf einen Tag aktualisiert die Liste darunter.

`v2.93.0-blanzis.4` zeigt die erste Linkvorschau bereits in der Notizübersicht. Über **Linkvorschau** lässt sich zwischen Karten und einfachen anklickbaren Links wechseln. Die Einstellung wird auf dem Gerät gespeichert.

`v2.93.0-blanzis.5` zeigt in der Notizübersicht standardmäßig mehr Text, angehängte Bilder und Linkkarten. Das Augensymbol an der Filterleiste wechselt zwischen Vorschau und kompakter Ansicht.

`v2.93.0-blanzis.6` startet die Monatsansicht mit der laufenden und den drei folgenden Wochen. Beim Antippen rückt die Tagesliste nach oben. Aufgaben lassen sich im Termin neu anlegen oder verknüpfen. **Küche** öffnet Korbstas Kochwelt, **Mehr** lässt die Navigation bedienbar, und Bilder in Notizen öffnen sich in einer Vollbildansicht mit Zurück-Navigation.

`v2.93.0-blanzis.7` bietet unter **API-Zugriff** beim Anlegen eines Tokens den Schalter **Vollzugriff**. Der Token übernimmt die Rechte des ausgewählten Kontos für API und MCP.

## Frontend bauen

Unter Windows mit Node.js 24 und npm aus dem Projektverzeichnis ausführen. Das Skript lädt den festgelegten Upstream-Release und prüft seine SHA-256-Prüfsumme. Mit `-SourceArchive` kann ein vorhandenes Archiv desselben Releases verwendet werden.

```powershell
.\branding\build-frontend.ps1
```

Das Ergebnis liegt unter `branding/frontend.tar.gz` und enthält die gebaute Oberfläche und die für Blanzis angepassten Serverdateien. Der Vite-Build läuft auf dem Windows-Rechner, weil das native Build-Werkzeug auf der DS224+ beim Test mit einem Prozessorfehler abgebrochen ist. Auf der NAS wird das Archiv mit dem festgelegten Yuvomi-Image kombiniert.

## Installation auf BlanziNAS aktualisieren

Die Betriebsdateien liegen unter `/volume1/docker/yuvomi`. Das Image wird auf der NAS gebaut. Die vorhandene Compose-Datei definiert Volumes, Umgebungsvariablen und das Cloudflare-Tunnelnetz.

1. Übertrage `branding/Dockerfile`, `branding/apply-branding.mjs`, `branding/.dockerignore` und `branding/frontend.tar.gz` nach `/volume1/docker/yuvomi/branding/`.
2. Baue dort das Image mit `/usr/local/bin/docker build --tag blanzis:2.93.0-7 .` mit den üblichen Docker-Rechten.
3. Setze im vorhandenen Compose-Projekt den gewünschten Image-Tag und aktualisiere den Dienst mit `/usr/local/bin/docker compose up -d --no-build --pull never --wait`.
4. Prüfe den Containerstatus sowie `/health` und `/manifest.webmanifest` auf der öffentlichen Domain. Das Manifest soll `Blanzis` als `name` und `short_name` liefern.

Bei einem neuen Upstream-Release werden Archivversion, Prüfsumme, Basisimage-Digest, Build-Revision und Image-Tag gemeinsam aktualisiert. Beim Wechsel auf einen neuen Upstream-Release vorab ein Yuvomi-Backup erstellen und die Release-Hinweise auf Datenbankmigrationen prüfen.

## Umzugsmodul

Das Modul unter `modules/umzug` erscheint in Blanzis unter `/m/umzug`. Es nutzt gemeinsame Notizkategorien als Räume, speichert Links und Ideen als Notizen und ordnet Aufgaben mit dem Tag `umzugraum-<Kategorie-ID>` zu. Die Inhalte liegen in den bestehenden Blanzis-Backups. Für die Ersteinrichtung die Raumkategorien mit `modules/seed-umzug.mjs` im laufenden Container anlegen. Das Skript nimmt seinen Quelltext über die Standardeingabe von `node --import ./server/utils/load-secrets-readonly.js --input-type=module` entgegen. Anschließend den Ordner `umzug` als `/app/modules/umzug` im persistenten Modulvolume bereitstellen. Bei einer Installation über die Oberfläche das Modul unter **Aktive Module** einschalten.
