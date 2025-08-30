# j-lawyer.org Thunderbird Extension

Thunderbird-Erweiterung zum Speichern von Nachrichten und Anhängen in j-lawyer.org sowie zum Erstellen von Terminen/Fristen/Wiedervorlagen zu einer Akte. Zusätzlich unterstützt die Erweiterung das Arbeiten im Verfassen-Fenster (Vorlagen, Dokumente aus der Akte anhängen) und das Bearbeiten von Bildanhängen mit PDF-Zusammenfassung.

Wichtig: Zugangsdaten werden lokal und unverschlüsselt in Thunderbird gespeichert.

## Features

- E-Mails speichern: komplette Nachricht inkl. Anhänge, nur Nachricht oder nur Anhänge in eine Akte hochladen
- Bildanhänge bearbeiten: Bilder zuschneiden, Reihenfolge festlegen, umbenennen, als ein PDF zusammenfassen und speichern
- Etiketten setzen: beliebige Dokument-Tags beim Hochladen vergeben; gespeicherte Nachrichten werden zusätzlich mit dem Tag „veraktet“ versehen
- Ordnerwahl: Zielordner innerhalb der Akte auswählen (Ordnerbaum wird angezeigt)
- Kontextmenü für Mehrfachzuordnung: mehrere markierte Nachrichten per Rechtsklick an eine Akte senden
- Kalender: Termin, Frist oder Wiedervorlage für eine Akte und einen Nutzer anlegen (j-lawyer.org ≥ 2.6)
- Verfassen-Fenster: Akte wählen, Vorlagen mit Platzhaltern einfügen, Dokumente aus der Akte als Anhang hinzufügen; Aktenzeichen-Erkennung im Betreff
- Datenabgleich: Nutzer, Kalender, Akten, Ordner und Tags laden/aktualisieren (↺)
- Optional: E-Mail nach Zuordnung in Papierkorb verschieben/sofort löschen (abhängig von Kontoeinstellung)
- Protokoll: Log einsehen und löschen

## Voraussetzungen

- Thunderbird ab Version 125
- j-lawyer.org-Server erreichbar; für Kalenderfunktionen mindestens Version 2.6
- Server-URL inkl. Protokoll und Port, Benutzername und Passwort

## Installation

1) Aus dem Mozilla Hub für Thunderbird Erweiterungen herunterladen. Updates werden je nach Einstellung in TB automatisch installiert.
2) Letztes Release als `.xpi` herunterladen (j-Lawyer-Thunderbird.xpi). In Thunderbird: Add-ons öffnen und „Aus Datei installieren…“ wählen

   <img width="397" alt="Screen2" src="https://github.com/jlawyerorg/j-lawyer-tbaddon/assets/71747937/976805db-ff94-425e-a710-43c40f568fd8">

3) Einstellungen der Erweiterung öffnen und konfigurieren:
   - Serveradresse inkl. Protokoll und Port, z. B. `http://192.168.1.10:8080`
   - Benutzername und Passwort
   - Optional: „E-Mail nach Zuordnung in Papierkorb verschieben“ aktivieren

   ![Einstellungen](https://github.com/jlawyerorg/j-lawyer-tbaddon/assets/71747937/a2b2c2b4-bdec-4b14-b94a-ab15f33676e3)

4) Erster Datenabgleich wird bei bestehender Verbindung automatisch und dann jeden Tag vorgenommen. 
   Kann manuell ausgelöst werden. Sollte manuell ausgelöst werden bei neu angelegten Akten.

   ![Datenaktualisierung](https://github.com/jlawyerorg/j-lawyer-tbaddon/assets/71747937/43b2c296-bb85-4b62-9ddb-70355075aaf1)

5) SSH-Tunnel/Port: Falls der j-lawyer-Server via SSH-Port erreichbar ist, in Thunderbird den Port freigeben:
   - Menü „Bearbeiten“ → „Einstellungen“ → Tab „Allgemein“ → „Konfiguration bearbeiten…“
   - `network.security.ports.banned.override` als String anlegen/ändern (ohne Leerzeichen)
   - Den verwendeten Port eintragen (entspricht dem Port aus dem j-lawyer.org-Clientprofil)
   - Kein Thunderbird-Neustart erforderlich

## Benutzung – Beispiele

1) Nachricht inkl. Anhänge speichern
- Nachricht in Thunderbird öffnen
- Button der Erweiterung im Nachrichtenfenster anklicken → Popup
- Akte über Suche finden (Name, Aktenzeichen; Trefferliste klicken)
- Zielordner im Ordnerbaum auswählen (optional)
- Etiketten auswählen (optional)
- „Speichern“ klicken
- Ergebnis: Upload in die Akte, Nachricht wird mit „veraktet“ getaggt; optional Verschieben in Papierkorb

2) Nur Anhänge speichern (mit Bildbearbeitung)
- Im Popup „🖼️ Bildanhänge vor Speichern bearbeiten“ aktivieren (optional)
- „Nur Anhang“ klicken
- Für Bildanhänge erscheint ein Overlay: Bilder zuschneiden, Reihenfolge ändern, Dateien/PDF umbenennen, „Als PDF zusammenfassen“ möglich
- Nicht-Bildanhänge werden automatisch ohne Bearbeitung gespeichert

3) Nur Nachricht speichern (ohne Anhänge)
- „Nur Nachricht“ klicken → Nachricht als `.eml` in die Akte hochladen

4) Mehrere Nachrichten per Kontextmenü zuordnen
- In der Nachrichtenliste mehrere E-Mails markieren
- Rechtsklick → „Nachrichten an j-Lawyer senden…“
- Akte/Ordner wählen, optional Tags setzen → speichern

5) Kalendereintrag erstellen (Termin/Frist/Wiedervorlage)
- Toolbar-Symbol „Kalendereintrag erstellen“ öffnen
- Akte suchen und auswählen
- Kategorie wählen (Termin/Frist/Wiedervorlage), Verantwortlichen und Kalender wählen
- Datum/Zeit setzen; Ort/Beschreibung ergänzen → Speichern

   ![Kalender 1](https://github.com/jlawyerorg/j-lawyer-tbaddon/assets/71747937/686c4693-4e56-49d4-9bc0-21b0cb4beca6)
   
   ![Kalender 2](https://github.com/jlawyerorg/j-lawyer-tbaddon/assets/71747937/4531ba6d-f8ee-4ce5-8843-c748c2d5df87)

6) Arbeit im Verfassen-Fenster
- Beim Schreiben einer E-Mail das Erweiterungsmenü nutzen
- Akte wählen; Ordner und „Dokumente“ aus der Akte als Anhang hinzufügen
- E-Mail-Vorlagen mit Platzhaltern abrufen und einsetzen
- Betreff wird automatisch auf Aktenzeichen geprüft und für die Aktenauswahl verwendet

## Hinweise und Sicherheit

- Anmeldedaten werden lokal unverschlüsselt gespeichert
- Bei neuen/„jungen“ Akten vor Kalender-/Speicherfunktionen einmal ↺ ausführen, damit die Akte gefunden wird
- Bei Fehler „Datei existiert eventuell schon“ ggf. Dateiname ändern oder Zielordner prüfen

## Mitwirken

- Tests, Bugmeldungen und Funktionswünsche sind willkommen – bitte Issues im Repository nutzen

## Lizenz

AGPL-3.0 – siehe `LICENSE`
