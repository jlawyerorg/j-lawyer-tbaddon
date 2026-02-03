{
  /* j-Lawyer Thunderbird Extension - saves Messages to j-Lawyer Server Cases.
Copyright (C) 2023, Maximilian Steinert

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published
by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>. */
}

let currentSelectedCase = null; // Speichert den aktuell ausgewählten Case
let caseMetaData = {}; // Speichert die Metadaten des aktuell ausgewählten Cases
let caseFolders = {}; // Speichert die Ordner des aktuell ausgewählten Cases
let selectedCaseFolderID = null; // Speichert den aktuell ausgewählten Ordner des aktuell ausgewählten Cases
let emailTemplatesNames = {}; // Speichert die Email-Templates

// Tastaturnavigation durch Suchergebnisse
let selectedIndex = -1;

document.addEventListener("keydown", function (event) {
  const resultsElements = document.querySelectorAll(".resultItem");
  if (resultsElements.length === 0) return;

  if (event.key === "ArrowDown") {
    if (selectedIndex >= 0) {
      resultsElements[selectedIndex].classList.remove("selected");
    }
    selectedIndex = (selectedIndex + 1) % resultsElements.length;
    resultsElements[selectedIndex].classList.add("selected");
  } else if (event.key === "ArrowUp") {
    if (selectedIndex >= 0) {
      resultsElements[selectedIndex].classList.remove("selected");
    }
    selectedIndex =
      (selectedIndex - 1 + resultsElements.length) % resultsElements.length;
    resultsElements[selectedIndex].classList.add("selected");
  } else if (event.key === "Enter" && selectedIndex >= 0) {
    resultsElements[selectedIndex].click();
  }
});

// Debug-Check für AttachmentImageProcessor
console.log(
  "popup.js loaded, AttachmentImageProcessor available:",
  !!window.AttachmentImageProcessor,
);

// Fenstergröße speichern bei Änderung
function saveWindowSize() {
  const width = window.outerWidth;
  const height = window.outerHeight;
  if (width > 0 && height > 0) {
    browser.storage.local.set({
      popupWindowSize: { width, height },
    });
  }
}

// Debounced resize handler
let resizeTimeout;
window.addEventListener("resize", function () {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(saveWindowSize, 500);
});

// Speichere auch beim Schließen
window.addEventListener("beforeunload", saveWindowSize);

// Event Listener für Buttons
document.addEventListener("DOMContentLoaded", async function () {
  const recommendCaseButton = document.getElementById("recommendCaseButton");
  const saveOnlyMessageButton = document.getElementById(
    "saveOnlyMessageButton",
  );
  const feedback = document.getElementById("feedback");
  const customizableLabel = document.getElementById("customizableLabel");
  const updateDataButton = document.getElementById("updateDataButton");
  const saveAttachmentsButton = document.getElementById(
    "saveAttachmentsButton",
  );
  const progressBar = document.getElementById("progressBar");
  const imageEditToggle = document.getElementById("imageEditToggle");

  browser.storage.local.remove("selectedTags");
  await fillTagsList();

  // Bildbearbeitung Toggle laden
  const toggleState = await browser.storage.local.get("imageEditEnabled");
  imageEditToggle.checked = toggleState.imageEditEnabled || false;

  // Event Listener für Bildbearbeitung Toggle
  imageEditToggle.addEventListener("change", async function () {
    await browser.storage.local.set({ imageEditEnabled: this.checked });
    console.log("Image edit toggle set to:", this.checked);
  });

  findFileNumberInRawMessage();

  // Setzt den Fokus auf das Suchfeld
  document.getElementById("searchInput").focus();

  // Überprüfen, ob der Code heute bereits ausgeführt wurde
  const today = new Date().toISOString().split("T")[0];
  const lastUpdate = await browser.storage.local.get("lastUpdate");
  if (lastUpdate.lastUpdate !== today) {
    updateData(feedback, progressBar);
  }

  // Code für den recommendCaseButton
  if (recommendCaseButton) {
    recommendCaseButton.addEventListener("click", async function () {
      if (!currentSelectedCase) {
        feedback.textContent = "Kein passendes Aktenzeichen gefunden!";
        feedback.style.color = "red";
        return;
      }

      // Prüfe, ob Umbenennen erlaubt ist
      const settings = await browser.storage.local.get([
        "username",
        "password",
        "serverAddress",
        "allowRename",
      ]);
      let customFilename = null;

      if (settings.allowRename) {
        // Zeige Rename-Dialog
        const messageData = await getDisplayedMessageFromActiveTab();
        const originalSubject = messageData.subject || "nachricht";
        const originalFilename = `${originalSubject}.eml`;

        customFilename = await showRenameDialog(originalFilename);

        if (customFilename === null) {
          // Benutzer hat abgebrochen
          feedback.textContent = "Speichern abgebrochen";
          feedback.style.color = "orange";
          return;
        }
      }

      browser.runtime.sendMessage({
        type: "case",
        source: "popup",
        content: currentSelectedCase.fileNumber,
        selectedCaseFolderID: selectedCaseFolderID,
        username: settings.username,
        password: settings.password,
        serverAddress: settings.serverAddress,
        customFilename: customFilename,
      });

      // Setzt Feedback zurück, während auf eine Antwort gewartet wird
      feedback.textContent = "Speichern...";
      feedback.style.color = "blue";
    });
  }

  // Code für den saveOnlyMessageButton
  if (saveOnlyMessageButton) {
    saveOnlyMessageButton.addEventListener("click", async function () {
      if (!currentSelectedCase) {
        feedback.textContent = "Kein passendes Aktenzeichen gefunden!";
        feedback.style.color = "red";
        return;
      }

      // Prüfe, ob Umbenennen erlaubt ist
      const settings = await browser.storage.local.get([
        "username",
        "password",
        "serverAddress",
        "allowRename",
      ]);
      let customFilename = null;

      if (settings.allowRename) {
        // Zeige Rename-Dialog
        const messageData = await getDisplayedMessageFromActiveTab();
        const originalSubject = messageData.subject || "nachricht";
        const originalFilename = `${originalSubject}.eml`;

        customFilename = await showRenameDialog(originalFilename);

        if (customFilename === null) {
          // Benutzer hat abgebrochen
          feedback.textContent = "Speichern abgebrochen";
          feedback.style.color = "orange";
          return;
        }
      }

      browser.runtime.sendMessage({
        type: "saveMessageOnly",
        source: "popup",
        content: currentSelectedCase.fileNumber,
        selectedCaseFolderID: selectedCaseFolderID,
        username: settings.username,
        password: settings.password,
        serverAddress: settings.serverAddress,
        customFilename: customFilename,
      });

      // Setzt Feedback zurück, während auf eine Antwort gewartet wird
      feedback.textContent = "Speichern...";
      feedback.style.color = "blue";
    });
  }

  // Event Listener für den 2. "Nur Anhänge speichern" Button
  if (saveAttachmentsButton) {
    saveAttachmentsButton.addEventListener("click", async function () {
      const feedback = document.getElementById("feedback");

      if (!currentSelectedCase) {
        feedback.textContent = "Kein passendes Aktenzeichen gefunden!";
        feedback.style.color = "red";
        return;
      }

      try {
        const settings = await browser.storage.local.get([
          "username",
          "password",
          "serverAddress",
        ]);
        const toggleState = await browser.storage.local.get("imageEditEnabled");

        if (toggleState.imageEditEnabled) {
          // Überprüfung auf Bildanhänge vor der Bildbearbeitungslogik
          feedback.textContent = "Überprüfe Anhänge...";
          feedback.style.color = "blue";

          const messageData = await getDisplayedMessageFromActiveTab();
          const attachments = await browser.messages.listAttachments(
            messageData.id,
          );

          // Filtert Bild- und Nicht-Bildanhänge
          const imageTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
            "image/bmp",
            "image/webp",
          ];
          const imageAttachments = attachments.filter(
            (attachment) =>
              imageTypes.includes(attachment.contentType.toLowerCase()) ||
              attachment.name
                .toLowerCase()
                .match(/\.(jpg|jpeg|png|gif|bmp|webp)$/),
          );
          const nonImageAttachments = attachments.filter(
            (attachment) =>
              !imageTypes.includes(attachment.contentType.toLowerCase()) &&
              !attachment.name
                .toLowerCase()
                .match(/\.(jpg|jpeg|png|gif|bmp|webp)$/),
          );

          if (imageAttachments.length === 0) {
            // Keine Bilder vorhanden - normale Attachment-Speicherung verwenden
            feedback.textContent =
              "Keine Bildanhänge gefunden. Speichere Anhänge normal...";
            feedback.style.color = "blue";

            // Normale Attachment-Speicherung wie bei deaktiviertem Toggle
            browser.runtime.sendMessage({
              type: "saveAttachments",
              source: "popup",
              content: currentSelectedCase.fileNumber,
              selectedCaseFolderID: selectedCaseFolderID,
              username: settings.username,
              password: settings.password,
              serverAddress: settings.serverAddress,
            });

            feedback.textContent = "Speichern...";
            feedback.style.color = "blue";
            return;
          }

          // Status-Update mit Anzahl der Dateien
          let statusText = `Bildbearbeitung wird gestartet... (${imageAttachments.length} Bild(er)`;
          if (nonImageAttachments.length > 0) {
            statusText += `, ${nonImageAttachments.length} weitere Datei(en)`;
          }
          statusText += `)`;
          feedback.textContent = statusText;
          feedback.style.color = "blue";

          // Warten bis AttachmentImageProcessor verfügbar ist
          let attempts = 0;
          while (!window.AttachmentImageProcessor && attempts < 50) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            attempts++;
          }

          if (!window.AttachmentImageProcessor) {
            throw new Error(
              "AttachmentImageProcessor konnte nicht geladen werden",
            );
          }

          const processor = new AttachmentImageProcessor();
          await processor.processWithImageEditing(
            currentSelectedCase,
            selectedCaseFolderID,
          );
        } else {
          // Bestehende Logik beibehalten
          browser.runtime.sendMessage({
            type: "saveAttachments",
            source: "popup",
            content: currentSelectedCase.fileNumber,
            selectedCaseFolderID: selectedCaseFolderID,
            username: settings.username,
            password: settings.password,
            serverAddress: settings.serverAddress,
          });

          // Setzt das Feedback zurück, während auf eine Antwort gewartet wird
          feedback.textContent = "Speichern...";
          feedback.style.color = "blue";
        }
      } catch (error) {
        console.error("Fehler beim Verarbeiten der Anhänge:", error);
        feedback.textContent = "Fehler: " + error.message;
        feedback.style.color = "red";
      }
    });
  }

  // Speichern der ausgewählten Etiketten in "selectedTags"
  const tagsSelect = document.getElementById("tagsSelect");
  let selectedTags = [];
  tagsSelect.addEventListener("change", function () {
    selectedTags = Array.from(tagsSelect.selectedOptions).map(
      (option) => option.value,
    );
    console.log("Ausgewählte Tags:", selectedTags);
    browser.storage.local.set({
      selectedTags: selectedTags,
    });
  });

  // Event Listener für den "Daten aktualisieren" Button
  if (updateDataButton) {
    updateDataButton.addEventListener("click", async function () {
      updateData(feedback, progressBar);
    });
  }

  // die options.html in einem neuen Tab öffnen
  const settingsButton = document.getElementById("settingsButton");
  if (settingsButton) {
    settingsButton.addEventListener("click", function () {
      browser.tabs.create({ url: "options.html" });
    });
  }
});

// Funktion zum Aktualisieren der Daten
async function updateData(feedback, progressBar) {
  progressBar.value = 0;
  progressBar.style.display = "block";

  try {
    const { username, password, serverAddress } =
      await browser.storage.local.get([
        "username",
        "password",
        "serverAddress",
      ]);
    feedback.textContent = "Daten werden aktualisiert...";
    feedback.style.color = "blue";

    let tasksCompleted = 0;
    const totalTasks = 5;

    function updateProgress() {
      tasksCompleted++;
      progressBar.value = (tasksCompleted / totalTasks) * 100;
      if (tasksCompleted === totalTasks) {
        feedback.textContent = "Daten aktualisiert!";
        feedback.style.color = "green";
        const today = new Date().toISOString().split("T")[0];
        browser.storage.local.set({ lastUpdate: today });
      }
    }

    // Alle asynchronen Aufgaben parallel ausführen
    await Promise.all([
      (async () => {
        await getTags(username, password, serverAddress);
        fillTagsList();
        updateProgress();
      })(),

      (async () => {
        const casesRaw = await getCases(username, password, serverAddress);
        console.log("Anzahl der Fälle: " + casesRaw.length);

        await browser.storage.local.set({ cases: casesRaw });

        updateProgress();
      })(),

      (async () => {
        const calendarsRaw = await getCalendars(
          username,
          password,
          serverAddress,
        );
        await browser.storage.local.set({ calendars: calendarsRaw });

        // Kalenderdaten filtern und speichern
        const followUpCalendars = calendarsRaw
          .filter((calendar) => calendar.eventType === "FOLLOWUP")
          .map((calendar) => ({
            id: calendar.id,
            displayName: calendar.displayName,
          }));
        const respiteCalendars = calendarsRaw
          .filter((calendar) => calendar.eventType === "RESPITE")
          .map((calendar) => ({
            id: calendar.id,
            displayName: calendar.displayName,
          }));
        const eventCalendars = calendarsRaw
          .filter((calendar) => calendar.eventType === "EVENT")
          .map((calendar) => ({
            id: calendar.id,
            displayName: calendar.displayName,
          }));

        await browser.storage.local.set({
          followUpCalendars,
          respiteCalendars,
          eventCalendars,
        });

        console.log("Kalender heruntergeladen: " + calendarsRaw);
        updateProgress();
      })(),

      (async () => {
        const emailTemplates = (
          await getEmailTemplates(username, password, serverAddress)
        )
          .map((item, index) => ({ id: index + 1, name: item.name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        await browser.storage.local.set({
          emailTemplates,
          emailTemplatesNames: emailTemplates,
        });
        console.log("E-Mail-Vorlagen: ", emailTemplates);
        updateProgress();
      })(),

      (async () => {
        const users = (
          await getUsers(username, password, serverAddress)
        ).filter((user) => user.displayName);
        await browser.storage.local.set({
          users: users.map((user) => user.displayName),
        });
        console.log("Benutzer heruntergeladen: ", users);
        updateProgress();
      })(),
    ]);
  } catch (error) {
    console.error("Error during updateData:", error);
    feedback.textContent = "Fehler: " + error.message;
    feedback.style.color = "red";
  }
}

// Hört auf Antworten vom Hintergrund-Skript background.js
browser.runtime.onMessage.addListener((message) => {
  const feedback = document.getElementById("feedback");
  if (message.type === "success") {
    feedback.textContent = "Erfolgreich gesendet!";
    feedback.style.color = "green";
  } else if (message.type === "error") {
    feedback.textContent = "Fehler: " + message.content;
    feedback.style.color = "red";
  }
});

// Hilfsfunktion: Extrahiert Absender-Name und E-Mail aus From-Header
function parseSenderFromHeader(rawMessage) {
  const sender = {
    name: "",
    email: "",
    lastName: "",
  };

  try {
    // Suche From-Header im ersten Teil der Nachricht
    const fromMatch = rawMessage.substring(0, 5000).match(/^From:\s*(.*)$/im);

    if (fromMatch) {
      const fromValue = fromMatch[1].trim();

      // Format 1: "Max Mustermann" <max@example.com>
      const nameEmailMatch = fromValue.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
      if (nameEmailMatch) {
        sender.name = nameEmailMatch[1].trim();
        sender.email = nameEmailMatch[2].trim();

        // Extrahiere Nachnamen (letztes Wort des Namens)
        const nameParts = sender.name.split(/\s+/);
        sender.lastName = nameParts[nameParts.length - 1];
      } else {
        // Format 2: max@example.com (nur E-Mail)
        const emailOnlyMatch = fromValue.match(/([^\s<>]+@[^\s<>]+)/);
        if (emailOnlyMatch) {
          sender.email = emailOnlyMatch[1].trim();

          // Versuche Namen aus E-Mail zu extrahieren (vor @)
          const emailPrefix = sender.email.split("@")[0];
          // Ersetze Punkte/Unterstriche durch Leerzeichen
          sender.name = emailPrefix.replace(/[._-]/g, " ");
          sender.lastName = sender.name.split(/\s+/).pop();
        }
      }
    }
  } catch (error) {
    console.log("Fehler beim Parsen des From-Headers:", error);
  }

  return sender;
}

// Hilfsfunktion: Extrahiert Namen nach Slash (Edge-Case: /Name Format)
function extractSlashNames(text) {
  const slashPattern = /\/([A-Za-zÄÖÜäöüß]{3,})/g;
  const names = new Set();

  let match;
  while ((match = slashPattern.exec(text)) !== null) {
    names.add(match[1].toLowerCase());
  }

  return Array.from(names);
}

// Hilfsfunktion: Reverse-Suche - Findet Worte aus case.name im Text
function matchCaseNameInText(caseName, emailText) {
  if (!caseName || !emailText) return 0;

  // Extrahiere bedeutungsvolle Worte aus case.name (>3 Zeichen, keine Stopwords)
  const stopwords = [
    "und",
    "oder",
    "der",
    "die",
    "das",
    "gegen",
    "für",
    "mit",
    "von",
    "bei",
  ];
  const caseWords = caseName
    .split(/[\s\-_,;.()]+/)
    .filter(
      (word) => word.length > 3 && !stopwords.includes(word.toLowerCase()),
    )
    .map((word) => word.toLowerCase());

  if (caseWords.length === 0) return 0;

  const emailTextLower = emailText.toLowerCase();
  let matchedWords = 0;

  for (const word of caseWords) {
    if (emailTextLower.includes(word)) {
      matchedWords++;
    }
  }

  const matchRatio = matchedWords / caseWords.length;

  // Scoring basierend auf Match-Ratio
  if (matchRatio >= 1.0) {
    return 45; // Alle Worte gefunden
  } else if (matchRatio >= 0.5) {
    return 35; // Mindestens 50% der Worte
  } else if (matchRatio >= 0.3) {
    return 25; // 30-50% der Worte
  }

  return 0;
}

// Hilfsfunktion: Vergleicht Absender-Name mit case.name (Fuzzy-Matching)
function matchSenderWithCaseName(sender, caseName) {
  if (!sender.name && !sender.email) return 0;
  if (!caseName) return 0;

  const caseNameLower = caseName.toLowerCase();
  let score = 0;

  // Strategie 1: Nachname im case.name enthalten (höchste Priorität)
  if (sender.lastName && sender.lastName.length > 2) {
    const lastNameLower = sender.lastName.toLowerCase();
    if (caseNameLower.includes(lastNameLower)) {
      score = 40; // Starker Match
      console.log(
        `Absender-Match (Nachname): "${sender.lastName}" in "${caseName}"`,
      );
      return score;
    }
  }

  // Strategie 2: Vollständiger Name im case.name
  if (sender.name && sender.name.length > 3) {
    const nameLower = sender.name.toLowerCase();

    // Prüfe ob kompletter Name vorkommt
    if (caseNameLower.includes(nameLower)) {
      score = 45; // Sehr starker Match
      console.log(
        `Absender-Match (Voller Name): "${sender.name}" in "${caseName}"`,
      );
      return score;
    }

    // Prüfe einzelne Worte des Namens (mind. 3 Zeichen)
    const nameWords = sender.name
      .split(/\s+/)
      .filter((word) => word.length > 2);
    let matchedWords = 0;

    for (const word of nameWords) {
      if (caseNameLower.includes(word.toLowerCase())) {
        matchedWords++;
      }
    }

    // Wenn mindestens 50% der Worte matchen
    if (nameWords.length > 0 && matchedWords >= nameWords.length / 2) {
      score = 30; // Mittlerer Match
      console.log(
        `Absender-Match (Teil-Name): ${matchedWords}/${nameWords.length} Worte in "${caseName}"`,
      );
      return score;
    }
  }

  // Strategie 3: E-Mail-Prefix im case.name (z.B. "max.mustermann")
  if (sender.email) {
    const emailPrefix = sender.email.split("@")[0].toLowerCase();

    // Prüfe ob E-Mail-Prefix vorkommt (mind. 4 Zeichen)
    if (emailPrefix.length > 3 && caseNameLower.includes(emailPrefix)) {
      score = 25; // Schwacher Match
      console.log(
        `Absender-Match (E-Mail-Prefix): "${emailPrefix}" in "${caseName}"`,
      );
      return score;
    }

    // Prüfe Teile des E-Mail-Prefix (durch . oder _ getrennt)
    const emailParts = emailPrefix
      .split(/[._-]/)
      .filter((part) => part.length > 2);
    let matchedParts = 0;

    for (const part of emailParts) {
      if (caseNameLower.includes(part)) {
        matchedParts++;
      }
    }

    if (emailParts.length > 0 && matchedParts > 0) {
      score = 20; // Sehr schwacher Match
      console.log(
        `Absender-Match (E-Mail-Teile): ${matchedParts}/${emailParts.length} Teile in "${caseName}"`,
      );
      return score;
    }
  }

  return 0; // Kein Match
}

// Hilfsfunktion: Extrahiert potenzielle Aktenzeichen aus Text mit Regex-Mustern
function extractFileNumberPatterns(text) {
  const patterns = [
    // AZ: / Az.: / Aktenzeichen Präfixe mit verschiedenen Formaten
    /(?:AZ|Az|Aktenzeichen)[:\.\s]+([0-9]{1,4}[\/\-_][0-9]{1,6}(?:[\/\-_][A-Za-z0-9]+)?)/gi,
    // Bracket-Format: [2024/123] oder [2024-123-ABC]
    /\[([0-9]{1,4}[\/\-_][0-9]{1,6}(?:[\/\-_][A-Za-z0-9]+)?)\]/g,
    // Jahr/Nummer Format (häufigster Fall): 2024/123 oder 2024-123 etc.
    /\b([0-9]{2,4}[\/\-_][0-9]{1,6}(?:[\/\-_][A-Za-z0-9]+)?)\b/g,
  ];

  const extractedNumbers = new Set();

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Match kann in Gruppe 1 sein (bei Präfix-Patterns) oder Gruppe 0 (bei direkten Patterns)
      const fileNumber = match[1] || match[0];
      if (fileNumber && fileNumber.trim()) {
        extractedNumbers.add(fileNumber.trim());
      }
    }
  }

  return Array.from(extractedNumbers);
}

// Hilfsfunktion: Parst E-Mail in strukturierte Teile für Priorisierung
function parseEmailStructure(rawMessage) {
  const structure = {
    subject: "",
    subjectLower: "",
    headers: "",
    headersLower: "",
    bodyStart: "",
    bodyStartLower: "",
    bodyRest: "",
    bodyRestLower: "",
  };

  try {
    // Performance: Begrenze auf erste 10000 Zeichen (schließt Anhänge aus)
    // Aktenzeichen stehen praktisch immer im Header oder Body-Anfang
    const searchableContent = rawMessage.substring(0, 10000);

    // Suche nach Betreff-Header
    const subjectMatch = searchableContent.match(/^Subject:\s*(.*)$/im);
    if (subjectMatch) {
      structure.subject = subjectMatch[1];
      structure.subjectLower = subjectMatch[1].toLowerCase();
    }

    // Extrahiere Header-Bereich (bis zur ersten Leerzeile)
    const headerEndIndex = searchableContent.indexOf("\n\n");
    if (headerEndIndex > -1) {
      structure.headers = searchableContent.substring(0, headerEndIndex);
      structure.headersLower = structure.headers.toLowerCase();

      // Body nach den Headers (aus searchableContent)
      const bodyText = searchableContent.substring(headerEndIndex + 2);

      // Erste 500 Zeichen des Body (höhere Priorität)
      structure.bodyStart = bodyText.substring(0, 500);
      structure.bodyStartLower = structure.bodyStart.toLowerCase();

      // Rest des Body (aus searchableContent, nicht kompletter rawMessage!)
      structure.bodyRest = bodyText.substring(500);
      structure.bodyRestLower = structure.bodyRest.toLowerCase();
    } else {
      // Fallback: searchableContent als Body behandeln
      structure.bodyRest = searchableContent;
      structure.bodyRestLower = searchableContent.toLowerCase();
    }
  } catch (error) {
    console.log("Fehler beim Parsen der E-Mail-Struktur:", error);
    // Fallback: Erste 10000 Zeichen als bodyRest
    const searchableContent = rawMessage.substring(0, 10000);
    structure.bodyRest = searchableContent;
    structure.bodyRestLower = searchableContent.toLowerCase();
  }

  return structure;
}

// Hilfsfunktion: Berechnet Confidence-Prozent basierend auf Score
function calculateConfidence(score) {
  // Max Score: 100 (Betreff) + 15 (Absender-Bonus 30% von 45) = 115
  // Mapping Score → Confidence %
  if (score >= 100) return Math.min(100, Math.round(85 + (score - 100) * 1.5)); // 85-100%
  if (score >= 50) return Math.round(60 + (score - 50) * 0.5); // 60-85%
  if (score >= 25) return Math.round(40 + (score - 25) * 0.8); // 40-60%
  if (score >= 5) return Math.round(20 + (score - 5)); // 20-40%
  return Math.round(score * 4); // 0-20%
}

// Hilfsfunktion: Findet Top N Matches mit Scoring nach Fundort
function findBestMatchingCases(rawMessage, casesArray, maxResults = 3) {
  const emailStructure = parseEmailStructure(rawMessage);

  // Performance: Regex nur auf relevante Teile (Subject + Headers), nicht auf Body mit Anhängen
  const regexSearchContent =
    emailStructure.subject + "\n" + emailStructure.headers;
  let extractedNumbers = null; // Lazy loading - nur bei Bedarf extrahieren

  // Parse Absender einmal (Performance)
  const sender = parseSenderFromHeader(rawMessage);
  console.log("Parsed Sender:", sender);

  const allMatches = [];

  for (let item of casesArray) {
    const fileNumber = item.fileNumber;
    const fileNumberLower = fileNumber.toLowerCase();
    let score = 0;
    let foundLocation = "";
    let senderScore = 0;

    // Scoring nach Fundort (nutze vorberechnete toLowerCase-Varianten)
    if (emailStructure.subjectLower.includes(fileNumberLower)) {
      score = 100;
      foundLocation = "Betreff";
    } else if (emailStructure.headersLower.includes(fileNumberLower)) {
      score = 50;
      foundLocation = "Header";
    } else if (emailStructure.bodyStartLower.includes(fileNumberLower)) {
      score = 25;
      foundLocation = "Body (Anfang)";
    } else if (emailStructure.bodyRestLower.includes(fileNumberLower)) {
      score = 10;
      foundLocation = "Body";
    }

    // Wenn kein exakter Match, versuche Regex-Extraktion (lazy)
    if (score === 0) {
      // Extrahiere nur einmal, beim ersten Mal wenn benötigt
      if (extractedNumbers === null) {
        extractedNumbers = extractFileNumberPatterns(regexSearchContent);
      }

      for (const extracted of extractedNumbers) {
        // Case-insensitive Vergleich
        if (extracted.toLowerCase() === fileNumberLower) {
          // Bonus für Regex-Match, aber niedriger als exakte Matches
          score = 5;
          foundLocation = "Regex-Extraktion";
          break;
        }
      }
    }

    // Reverse-Suche: case.name im E-Mail-Text (Betreff + Headers)
    let caseNameScore = 0;
    if (score === 0) {
      // Nur wenn kein Aktenzeichen gefunden
      caseNameScore = matchCaseNameInText(item.name, regexSearchContent);
      if (caseNameScore > 0) {
        score = caseNameScore;
        foundLocation = "case.name im Text";
      }
    }

    // Edge-Case: /Name Format im Betreff
    let slashNameScore = 0;
    if (score === 0) {
      // Nur wenn noch kein Match
      const slashNames = extractSlashNames(emailStructure.subject);
      if (slashNames.length > 0) {
        // Prüfe ob einer der slash-Namen in case.name vorkommt
        for (const name of slashNames) {
          if (item.name.toLowerCase().includes(name)) {
            slashNameScore = 35;
            score = slashNameScore;
            foundLocation = "/Name Format";
            break;
          }
        }
      }
    }

    // Absender-Matching: Vergleiche mit case.name
    senderScore = matchSenderWithCaseName(sender, item.name);

    // Kombiniere Scores:
    // - Aktenzeichen (100-50): Höchste Priorität
    // - case.name Match (45-35): Mittlere Priorität
    // - Absender/Slash (40-35): Als Bonus oder Haupt-Score
    let finalScore = score;
    let matchType = foundLocation;

    if (score >= 50 && senderScore > 0) {
      // Aktenzeichen + Absender: Bonus
      finalScore = score + Math.round(senderScore * 0.3);
      matchType = foundLocation + " + Absender-Bonus";
    } else if (score > 0 && score < 50 && senderScore > 0) {
      // case.name/Regex + Absender: Addiere beide
      finalScore = score + senderScore;
      matchType = foundLocation + " + Absender";
    } else if (score === 0 && senderScore > 0) {
      // Nur Absender: Verwende Absender-Score
      finalScore = senderScore;
      matchType = "Absender-Match";
    }

    // Sammle alle Matches mit Score > 0
    if (finalScore > 0) {
      allMatches.push({
        item: item,
        score: finalScore,
        location: matchType,
        senderScore: senderScore,
        confidence: calculateConfidence(finalScore),
      });
    }
  }

  // Sortiere nach Score (höchster zuerst)
  allMatches.sort((a, b) => b.score - a.score);

  // Gib Top N zurück
  const topMatches = allMatches.slice(0, maxResults);

  console.log(
    `Gefundene Matches: ${allMatches.length}, Top ${maxResults}:`,
    topMatches,
  );

  return topMatches;
}

// Funktion: Wählt einen Vorschlag aus und lädt den Case
async function selectSuggestion(match, loginData) {
  const item = match.item;

  console.log("Vorschlag gewählt - ID: " + item.id);
  console.log("Vorschlag gewählt - Name: " + item.name);
  console.log(
    "Match Score: " + match.score + ", Confidence: " + match.confidence + "%",
  );

  currentSelectedCase = {
    id: item.id,
    name: item.name,
    fileNumber: item.fileNumber,
  };

  // Lade Case-Details
  caseMetaData = await getCaseMetaData(
    item.id,
    loginData.username,
    loginData.password,
    loginData.serverAddress,
  );
  console.log(
    "caseMetaData: " + caseMetaData.lawyer + " " + caseMetaData.reason,
  );

  caseFolders = await getCaseFolders(
    item.id,
    loginData.username,
    loginData.password,
    loginData.serverAddress,
  );
  console.log("caseFolders: " + caseFolders);

  displayTreeStructure(caseFolders);

  // Label aktualisieren
  const customizableLabel = document.getElementById("customizableLabel");
  if (customizableLabel) {
    customizableLabel.textContent = `${item.fileNumber}: ${item.name} (${caseMetaData.reason} - ${caseMetaData.lawyer})`;
  }

  return {
    id: item.id,
    name: item.name,
  };
}

// Funktion: Zeigt Top-N Vorschläge im UI an
async function displaySuggestions(matches, loginData) {
  const suggestionsContainer = document.getElementById("suggestionsContainer");
  const suggestionsList = document.getElementById("suggestionsList");

  // Clear existing suggestions
  suggestionsList.innerHTML = "";

  if (!matches || matches.length === 0) {
    suggestionsContainer.style.display = "block";
    suggestionsList.innerHTML =
      '<div class="suggestionItem noMatch">❌ Keine Vorschläge gefunden (bitte manuell suchen)</div>';
    return;
  }

  suggestionsContainer.style.display = "block";

  // Lade Metadata für alle Vorschläge parallel
  console.log("Lade Metadata für Top-3 Vorschläge...");
  const metadataPromises = matches.map((match) =>
    getCaseMetaData(
      match.item.id,
      loginData.username,
      loginData.password,
      loginData.serverAddress,
    ).catch((err) => {
      console.error(
        `Fehler beim Laden von Metadata für Case ${match.item.id}:`,
        err,
      );
      return { reason: "?", lawyer: "?" };
    }),
  );

  const metadataResults = await Promise.all(metadataPromises);

  matches.forEach((match, index) => {
    const item = match.item;
    const metadata = metadataResults[index];
    const div = document.createElement("div");
    div.className = "suggestionItem";

    // Confidence-Badge mit Farbe
    let confidenceClass = "confidence-low";
    if (match.confidence >= 85) confidenceClass = "confidence-high";
    else if (match.confidence >= 60) confidenceClass = "confidence-medium";

    // Format (zweizeilig):
    // CaseName (FileNumber)          [XX%]
    // Reason - Lawyer
    div.innerHTML = `
            <span class="caseInfo">
                <strong>${item.name}</strong> (${item.fileNumber})
                <span class="caseDetails">${metadata.reason || "?"} - ${metadata.lawyer || "?"}</span>
            </span>
            <span class="confidenceBadge ${confidenceClass}">${match.confidence}%</span>
        `;

    // Speichere metadata im match-Objekt für später
    match.metadata = metadata;

    // Click-Handler
    div.addEventListener("click", async function () {
      // Entferne vorherige Selektion
      document
        .querySelectorAll(".suggestionItem")
        .forEach((el) => el.classList.remove("selected"));
      // Markiere als ausgewählt
      div.classList.add("selected");

      // Lade Case (metadata bereits vorhanden)
      await selectSuggestion(match, loginData);
    });

    suggestionsList.appendChild(div);
  });

  // Auto-select first suggestion if confidence >= 85%
  if (matches.length > 0 && matches[0].confidence >= 85) {
    console.log("Auto-selecting top suggestion (confidence >= 85%)");
    setTimeout(() => {
      suggestionsList.firstChild.click();
    }, 100);
  }
}

// Funktion zum Suchen des Aktenzeichens in der Nachricht
// und Anzeige von Vorschlägen
async function findFileNumberInRawMessage() {
  // Nachrichteninhalt abrufen
  const messageData = await getDisplayedMessageFromActiveTab();
  console.log("Message Id: " + messageData.id);

  let rawMessage = await messenger.messages.getRaw(messageData.id);

  // die gespeicherte Daten aus browser.storage.local abrufen
  let storedData = await browser.storage.local.get("cases");
  let loginData = await browser.storage.local.get([
    "username",
    "password",
    "serverAddress",
  ]);

  // die gespeicherten Daten in einem Array namens 'cases'
  let casesArray = storedData.cases;

  // Verwende neue Matching-Funktion für Top 3 Vorschläge
  const topMatches = findBestMatchingCases(rawMessage, casesArray, 3);

  // Zeige Vorschläge im UI
  displaySuggestions(topMatches, loginData);

  // Gib Top-Match zurück (für Kompatibilität)
  if (topMatches.length > 0) {
    return {
      id: topMatches[0].item.id,
      name: topMatches[0].item.name,
    };
  }

  console.log("Keine Übereinstimmung gefunden");
  return null;
}

// Funktion zum Abrufen der Nachrichten-ID
// Prüft zuerst URL-Parameter (eigenständiges Fenster), dann aktiven Tab (Popup-Modus)
async function getDisplayedMessageFromActiveTab() {
  // Prüfe ob Message-ID als URL-Parameter übergeben wurde (eigenständiges Fenster)
  const urlParams = new URLSearchParams(window.location.search);
  const messageIdFromUrl = urlParams.get("messageId");

  if (messageIdFromUrl) {
    // Hole Nachricht direkt per ID
    const message = await browser.messages.get(parseInt(messageIdFromUrl));
    if (message) {
      return message;
    }
    throw new Error(
      "Nachricht mit ID " + messageIdFromUrl + " nicht gefunden.",
    );
  }

  // Fallback: Versuche vom aktiven Tab zu lesen (für Popup-Modus)
  const tabs = await browser.mailTabs.query({
    active: true,
    currentWindow: true,
  });
  let targetTabs = tabs;

  if (tabs.length === 0) {
    targetTabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
  }

  if (targetTabs.length === 0) {
    throw new Error("Kein aktiver Tab gefunden.");
  }

  const message = await browser.messageDisplay.getDisplayedMessage(
    targetTabs[0].id,
  );
  if (!message) {
    throw new Error("Keine Nachricht im aktiven Tab angezeigt.");
  }
  return message;
}

// Funktion zum Abrufen der Fälle / Akten
function getCases(username, password, serverAddress) {
  const url = serverAddress + "/j-lawyer-io/rest/v1/cases/list";

  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
  headers.append("Content-Type", "application/json");

  return fetch(url, {
    method: "GET",
    headers: headers,
    timeout: 30000,
  }).then((response) => {
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    return response.json();
  });
}

// Funktion zum Abrufen der am Server gespeicherten Dokumenten-Tags
async function getTags(username, password, serverAddress) {
  const url =
    serverAddress +
    "/j-lawyer-io/rest/v7/configuration/optiongroups/document.tags";

  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
  headers.append("Content-Type", "application/json");

  return fetch(url, {
    method: "GET",
    headers: headers,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      const valuesArray = data.map((item) => item.value);
      console.log("Tags heruntergeladen: " + valuesArray);
      // let tagsList = JSON.stringify(valuesArray)
      browser.storage.local.set({ documentTags: valuesArray });
      return valuesArray;
    });
}

// Funktion zum Abrufen der Metadaten eines Falls
async function getCaseMetaData(caseId, username, password, serverAddress) {
  const url = serverAddress + "/j-lawyer-io/rest/v1/cases/" + caseId;

  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
  headers.append("Content-Type", "application/json");

  return fetch(url, {
    method: "GET",
    headers: headers,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      let extractedData = {};

      if ("reason" in data && data.reason !== null) {
        extractedData.reason = data.reason;
      }

      if ("lawyer" in data && data.lawyer !== null) {
        extractedData.lawyer = data.lawyer;
      }
      extractedData;

      return extractedData;
    });
}

// Event-Listener für die Suche
document.getElementById("searchInput").addEventListener("input", function () {
  const query = this.value.trim();
  if (query) {
    searchCases(query);
  } else {
    document.getElementById("resultsList").textContent = "";
  }
});

// Funktion zum Suchen von Fällen
async function searchCases(query) {
  document.getElementById("resultsList").style.display = "block";
  let storedData = await browser.storage.local.get("cases");
  let casesArray = storedData.cases;
  let loginData = await browser.storage.local.get([
    "username",
    "password",
    "serverAddress",
  ]);

  query = query.toUpperCase();

  let results = casesArray.filter(
    (item) =>
      item.name.toUpperCase().includes(query) ||
      item.fileNumber.toUpperCase().includes(query) ||
      (item.reason && item.reason.toUpperCase().includes(query)), // Neue Bedingung für reason
  );

  // Ergebnisse bewerten und sortieren basierend auf Übereinstimmungslänge
  results = results
    .map((item) => {
      let nameMatchLength = getConsecutiveMatchCount(
        item.name.toUpperCase(),
        query,
      );
      let fileNumberMatchLength = getConsecutiveMatchCount(
        item.fileNumber.toUpperCase(),
        query,
      );
      let reasonMatchLength = item.reason
        ? getConsecutiveMatchCount(item.reason.toUpperCase(), query)
        : 0;

      return {
        ...item,
        matchLength: Math.max(
          nameMatchLength,
          fileNumberMatchLength,
          reasonMatchLength,
        ),
      };
    })
    .filter((item) => item.matchLength > 0)
    .sort((a, b) => b.matchLength - a.matchLength);

  const resultsListElement = document.getElementById("resultsList");
  while (resultsListElement.firstChild) {
    resultsListElement.removeChild(resultsListElement.firstChild);
  }

  results.forEach((item) => {
    const div = document.createElement("div");
    div.className = "resultItem";
    div.setAttribute("data-id", item.id);
    div.setAttribute("data-file-number", item.fileNumber);
    div.setAttribute("data-name", item.name);
    if (item.reason) {
      div.setAttribute("data-reason", item.reason);
    }
    div.textContent = `${item.name} (${item.fileNumber})`;
    if (item.reason) {
      div.textContent += ` - ${item.reason}`;
    }
    resultsListElement.appendChild(div);
  });

  // Event Handler für Suchergebnisse
  document.querySelectorAll(".resultItem").forEach((item) => {
    item.addEventListener("click", async function () {
      currentSelectedCase = {
        id: this.getAttribute("data-id"),
        name: this.getAttribute("data-name"),
        fileNumber: this.getAttribute("data-file-number"),
        reason: this.getAttribute("data-reason"),
      };

      caseMetaData = await getCaseMetaData(
        currentSelectedCase.id,
        loginData.username,
        loginData.password,
        loginData.serverAddress,
      );

      caseFolders = await getCaseFolders(
        currentSelectedCase.id,
        loginData.username,
        loginData.password,
        loginData.serverAddress,
      );
      console.log("caseFolders:", caseFolders);
      displayTreeStructure(caseFolders);

      document.getElementById("resultsList").style.display = "none";

      // Label aktualisieren
      customizableLabel.textContent = `${currentSelectedCase.fileNumber}: ${currentSelectedCase.name} (${caseMetaData.reason} - ${caseMetaData.lawyer})`;
    });
  });
}

// Funktion zum Ermitteln der Länge der längsten aufeinanderfolgenden Übereinstimmung
function getConsecutiveMatchCount(str, query) {
  let count = 0;
  let maxCount = 0;
  for (let i = 0, j = 0; i < str.length; i++) {
    if (str[i] === query[j]) {
      count++;
      j++;
      if (count > maxCount) {
        maxCount = count;
      }
    } else {
      count = 0;
      j = 0;
    }
  }
  return maxCount;
}

// Füllen der Tagsliste
async function fillTagsList() {
  try {
    const result = await browser.storage.local.get("documentTags");
    const tagsSelect = document.getElementById("tagsSelect");

    // Funktion, um zu prüfen, ob ein Tag bereits in der Liste vorhanden ist
    function isTagInList(tag) {
      for (let i = 0; i < tagsSelect.options.length; i++) {
        if (tagsSelect.options[i].value === tag) {
          return true;
        }
      }
      return false;
    }

    if (result.documentTags && result.documentTags.length > 0) {
      const sortedTags = result.documentTags.sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      ); // Tags alphabetisch sortieren (unabhängig von Groß- und Kleinschreibung)
      sortedTags.forEach((tag) => {
        // Nur hinzufügen, wenn der Tag noch nicht in der Liste ist
        if (!isTagInList(tag)) {
          const option = document.createElement("option");
          option.value = tag;
          option.text = tag;
          tagsSelect.appendChild(option);
        }
      });
    }
  } catch (error) {
    console.error("Fehler beim Befüllen der Tags-Liste:", error);
  }
}

// Funktion zum Abrufen der Ordner einer Akte
async function getCaseFolders(caseId, username, password, serverAddress) {
  const url =
    serverAddress + "/j-lawyer-io/rest/v3/cases/" + caseId + "/folders";

  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
  headers.append("Content-Type", "application/json");
  return fetch(url, {
    method: "GET",
    headers: headers,
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => {
      console.log("Folders des Case " + caseId + " heruntergeladen: ", data);
      return data;
    });
}

// Funktion zum Erstellen eines Ordnerbaums einer Akte
function createTreeElement(obj) {
  if (!obj) return null; // Behandlung von null-Werten

  const element = document.createElement("div");
  element.className = "treeItem";
  element.textContent = obj.name;
  element.style.paddingLeft = "20px";
  element.style.cursor = "pointer";
  element.onclick = function (event) {
    // Verhindern, dass das Klick-Event sich nach oben durch den Baum fortpflanzt
    event.stopPropagation();

    // Entfernen der Auswahl von allen anderen Elementen
    const selectedElements = document.querySelectorAll(
      ".treeItem.selectedItem",
    );
    selectedElements.forEach((el) => el.classList.remove("selectedItem"));

    // Hinzufügen der Auswahl zum aktuellen Element
    this.classList.add("selectedItem");

    selectedCaseFolderID = obj.id;
    console.log("Name des ausgewählten Ordners: " + obj.name);
    console.log("Id des ausgewählten Ordners: " + selectedCaseFolderID);
  };

  if (obj.children && obj.children.length > 0) {
    // Sortiert alphabetisch nach dem Namen
    obj.children.sort((a, b) => a.name.localeCompare(b.name));
    obj.children.forEach((child) => {
      const childElement = createTreeElement(child);
      if (childElement) {
        element.appendChild(childElement);
      }
    });
  }
  return element;
}

// Funktion zum Anzeigen der Ordnerstruktur einer Akte
function displayTreeStructure(folderData) {
  // Überprüfen Sie, ob folderData nicht null ist
  if (!folderData) {
    console.log("Keine Folder-Daten vorhanden.");
    return;
  }

  const treeRoot = createTreeElement(folderData);
  const treeContainer = document.getElementById("treeContainer");
  if (treeContainer) {
    treeContainer.innerHTML = ""; // Bestehenden Inhalt löschen
    treeContainer.appendChild(treeRoot);
  }
}

// Funktion zum Abrufen der Kalender vom Server
async function getCalendars(username, password, serverAddress) {
  const url = serverAddress + "/j-lawyer-io/rest/v4/calendars/list/" + username;
  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );

  headers.append("Authorization", "Basic " + loginBase64Encoded);
  headers.append("Content-Type", "application/json");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: headers,
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();

    data.forEach((calendar) => {
      console.log("Kalender ID:", calendar.id);
      console.log("Anzeigename: (displayName)", calendar.displayName);
      console.log("Hintergrund:", calendar.background);
      console.log("Cloud-Host:", calendar.cloudHost);
      console.log("Cloud-Pfad:", calendar.cloudPath);
      console.log("Cloud-Port:", calendar.cloudPort);
      console.log("Cloud-SSL:", calendar.cloudSsl);
      console.log(
        "Ereignistyp: (eventType - FOLLOWUP, RESPITE, EVENT)",
        calendar.eventType,
      );
      console.log("Href:", calendar.href);
      console.log("-----------------------------------");
    });
    return data;
  } catch (error) {
    console.error("Fehler beim Abrufen der Kalender:", error);
  }
}

// Funktion zum Abrufen der Benutzer vom Server
async function getUsers(username, password, serverAddress) {
  const url = serverAddress + "/j-lawyer-io/rest/v6/security/users";
  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );

  headers.append("Authorization", "Basic " + loginBase64Encoded);
  headers.append("Content-Type", "application/json");

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: headers,
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();

    return data;
  } catch (error) {
    console.error("Fehler beim Abrufen der User:", error);
  }
}

function getEmailTemplates(username, password, serverAddress) {
  const url = serverAddress + "/j-lawyer-io/rest/v6/templates/email";

  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  headers.append("Content-Type", "application/json");

  return fetch(url, {
    method: "GET",
    headers: headers,
  }).then((response) => {
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    return response.json();
  });
}

async function logActivity(action, details) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, action, details };

  let activityLog = await browser.storage.local.get("activityLog");
  activityLog = activityLog.activityLog || [];
  activityLog.push(logEntry);

  await browser.storage.local.set({ activityLog });
}

// Funktion zum Anzeigen des Rename-Dialogs
async function showRenameDialog(originalFilename) {
  return new Promise((resolve) => {
    const dialog = document.getElementById("renameDialog");
    const filenameInput = document.getElementById("filenameInput");
    const filenameSuggestion = document.getElementById("filenameSuggestion");
    const useSuggestionBtn = document.getElementById("useSuggestionBtn");
    const cancelRenameBtn = document.getElementById("cancelRenameBtn");
    const confirmRenameBtn = document.getElementById("confirmRenameBtn");

    // Zeitstempel-basierter Vorschlag
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;

    // Dateiendung beibehalten
    const lastDotIndex = originalFilename.lastIndexOf(".");
    const extension =
      lastDotIndex > 0 ? originalFilename.substring(lastDotIndex) : "";
    const nameWithoutExt =
      lastDotIndex > 0
        ? originalFilename.substring(0, lastDotIndex)
        : originalFilename;

    const suggestedFilename = `${timestamp}_${nameWithoutExt}${extension}`;

    // UI vorbereiten
    filenameInput.value = originalFilename;
    filenameSuggestion.textContent = suggestedFilename;
    dialog.style.display = "flex";
    filenameInput.focus();
    filenameInput.select();

    // Event Listener (einmalig)
    const cleanup = () => {
      dialog.style.display = "none";
      useSuggestionBtn.replaceWith(useSuggestionBtn.cloneNode(true));
      cancelRenameBtn.replaceWith(cancelRenameBtn.cloneNode(true));
      confirmRenameBtn.replaceWith(confirmRenameBtn.cloneNode(true));
    };

    // Vorschlag verwenden
    document.getElementById("useSuggestionBtn").addEventListener(
      "click",
      function () {
        cleanup();
        resolve(suggestedFilename);
      },
      { once: true },
    );

    // Abbrechen
    document.getElementById("cancelRenameBtn").addEventListener(
      "click",
      function () {
        cleanup();
        resolve(null); // null = abgebrochen
      },
      { once: true },
    );

    // Umbenennen bestätigen
    document.getElementById("confirmRenameBtn").addEventListener(
      "click",
      function () {
        const newFilename = filenameInput.value.trim();
        cleanup();
        resolve(newFilename || originalFilename);
      },
      { once: true },
    );

    // Enter-Taste
    filenameInput.addEventListener(
      "keypress",
      function (e) {
        if (e.key === "Enter") {
          const newFilename = filenameInput.value.trim();
          cleanup();
          resolve(newFilename || originalFilename);
        }
      },
      { once: true },
    );
  });
}
