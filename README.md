# j-Lawyer Thunderbird Extension

Dies ist eine Thunderbird-Erweiterung, die E-Mails an einen j-Lawyer-Server sendet und die E-Mails einschließlich ihrer Anhänge oder nur die Anhänge zur Akte speichert. 

Es können auch versandte Nachrichten an den Server übermittelt werden.

Die Nachrichten oder Anhänge können mit Etiketten versehen werden. 

Wichtig: Aktuell werden die Zugangsdaten lokal in in der Erweiterung bzw. in Thunderbird gespeichert. Zukünftig soll eine sichere Speichermöglichkeit implementiert werden. 

## Features

- **Fall suchen und Ergebnisliste**: Ein Suchfeld, um nach einem bestimmten Fall zu suchen. Die Suchergebnisse basierend auf dem eingegebenen Suchbegriff werden angezeigt.
- **Daten aktualisieren**: Button zum Aktualisieren der Daten, falls neue Akten angelegt seit letzter Nutzung der Extension.
- **Etiketten anbringen**: Eine oder mehrere Etiketten an dem Dokument anbringen.
- **Schlagwort/Tag an versandter und gespeicherter Message anbringen**: das Schlagwort "veraktet" wird angefügt. So ist direkt klar, welche Nachricht schon an den Server übermittelt wurde. 

## Installation
- Das letzte Release herunterladen (j-Lawyer-Thunderbird.xpi). 
- Thunderbird öffnen und Extension aus Datei installieren.

<img width="397" alt="Screen2" src="https://github.com/jlawyerorg/j-lawyer-tbaddon/assets/71747937/976805db-ff94-425e-a710-43c40f568fd8">

- Klick auf den Einstellungen Button im Add-On. Eingabe des Nutzernamens, Passwort und der Serveradresse (diese steht auch in der Titelleiste des j-Lawyer Clients). http:// oder https:// müssen ebenfalls Teil der Serveradresse sein! 

![Bildschirmfoto vom 2023-09-20 07-38-09](https://github.com/jlawyerorg/j-lawyer-tbaddon/assets/71747937/a2b2c2b4-bdec-4b14-b94a-ab15f33676e3)


- Daten vom Server laden - Klick auf das Pfeil Icon in der Erweiterung (dies ist vor der ersten Nutzung erforderlich, um eine Aktensuche zu ermöglichen und jedes Mal dann, wenn sicher der Aktenbestand geändert hat und neue E-Mails oder Anhänge zu "neuen Akten" gespeichert werden sollen)
  
![Bildschirmfoto vom 2023-09-19 11-29-54](https://github.com/jlawyerorg/j-lawyer-tbaddon/assets/71747937/43b2c296-bb85-4b62-9ddb-70355075aaf1)

- wird eine Verbindung zum Server per SSH hergestellt, ist noch eine Einstellung in Thunderbird vorzunehmen.

    - Menü "Bearbeiten" öffnen
    - Menüeintrag "Einstellungen" öffnen
    - Im Tab "Allgemein" ganz nach unten scrollen und den Button "Konfiguration bearbeiten" nutzen
    - In der Suche folgenden Wert eintragen: network.security.ports.banned.override    Unbedingt darauf achten, dass keine führenden oder abschließenden Leerzeichen enthalten sind
    - Anschließend "String" auswählen und den gewünschten Port eintragen (bei Verwendung eines SSH-Tunnels im j-lawyer.org Clientprofil ist es jener Port, der im dritten Eingabefeld (hinter "Port") steht
    - den Wert mit Klick auf den Haken speichern
    
    Ein Neustart von Thunderbird ist nicht notwendig.

## Disclaimer:
- Die Erweiterung kann noch Fehler enthalten. 
- Wer Lust hat, sich zu beteiligen, kann dies durch Testen und Melden von Bugs oder Anregungen tun. Bitte dazu das Ticket System nutzen.   
- Die Funktion "Nur Nachricht speichern" ist noch provisorisch und führt in einigen Fällen noch dazu, dass doch die komplette Nachricht samt Anhängen gespeichert wird. Es wird noch eine Änderung der Thunderbird Schnittstelle erwartet, die das Provisorium entbehrlich macht. Bis dahin gilt: wenn die Nachricht ohne Anhänge gespeichert wird, wird der eigentliche Anhang durch einen "leeren Dummy" ersetzt.
