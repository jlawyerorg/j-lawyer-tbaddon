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

//  ************************* ZUORDNEN DIALOG *************************

let currentSelectedCase = null; // Speichert den aktuell ausgewählten Case
let selectedIndex = -1; // Tastaturnavigation durch Suchergebnisse
let currentMessageToSaveID = null; // Speichert die ID der Nachricht, die gespeichert werden soll
let caseFolders = {}; // Speichert die Ordner des aktuell ausgewählten Cases
let selectedCaseFolderID = null; // Speichert den aktuell ausgewählten Ordner des aktuell ausgewählten Cases
let emailTemplatesNames = {}; // Speichert die Email-Templates

// Fenstergröße speichern bei Änderung
function saveWindowSize() {
  const width = window.outerWidth;
  const height = window.outerHeight;
  if (width > 0 && height > 0) {
    browser.storage.local.set({
      bundleSaveWindowSize: { width, height },
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

document.addEventListener("DOMContentLoaded", async function () {
  const recommendCaseButton = document.getElementById("recommendCaseButton");
  const feedback = document.getElementById("feedback");
  const customizableLabel = document.getElementById("customizableLabel");
  const updateDataButton = document.getElementById("updateDataButton");
  const progressBar = document.getElementById("progressBar");

  await fillTagsList();

  // Setzt den Fokus auf das Suchfeld
  document.getElementById("searchInput").focus();

  // Überprüfen, ob der Code heute bereits ausgeführt wurde
  const today = new Date().toISOString().split("T")[0];
  const lastUpdate = await browser.storage.local.get("lastUpdate");
  if (lastUpdate.lastUpdate !== today) {
    updateData(feedback, progressBar);
    logActivity("sendEmailToServer", "Daten aktualisiert");
  }

  // Code für den recommendCaseButton
  if (recommendCaseButton && customizableLabel) {
    recommendCaseButton.addEventListener("click", function () {
      if (!currentSelectedCase) {
        feedback.textContent = "Kein passendes Aktenzeichen gefunden!";
        feedback.style.color = "red";
        return;
      }

      browser.storage.local
        .get(["username", "password", "serverAddress"])
        .then((result) => {
          browser.runtime.sendMessage({
            type: "case",
            source: "popup_menu_bundle_save",
            content: currentSelectedCase.fileNumber,
            selectedCaseFolderID: selectedCaseFolderID,
            username: result.username,
            password: result.password,
            serverAddress: result.serverAddress,
          });

          // Setzt Feedback zurück, während auf eine Antwort gewartet wird
          feedback.textContent = "Speichern...";
          feedback.style.color = "blue";
        });
      feedback.textContent = "An empfohlene Akte gesendet!";
      feedback.style.color = "green";
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

  // Code, um die options.html in einem neuen Tab zu öffnen
  const settingsButton = document.getElementById("settingsButton");
  if (settingsButton) {
    settingsButton.addEventListener("click", function () {
      browser.tabs.create({ url: "options.html" });
    });
  }
});

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

// Event-Listener für die Tastaturnavigation durch Suchergebnisse
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
      browser.storage.local.set({ documentTags: valuesArray });
      return valuesArray;
    });
}

// Debounce-Timer für die Suche
let searchDebounceTimer = null;

// Event-Listener für die Suche
document.getElementById("searchInput").addEventListener("input", function () {
  const query = this.value.trim();

  // Debounce: Warte 300ms nach letzter Eingabe bevor API-Call
  clearTimeout(searchDebounceTimer);

  if (query && query.length >= 3) {
    searchDebounceTimer = setTimeout(() => {
      searchCases(query);
    }, 300);
  } else if (query.length > 0 && query.length < 3) {
    // Zeige Hinweis bei weniger als 3 Zeichen
    const resultsListElement = document.getElementById("resultsList");
    resultsListElement.style.display = "block";
    resultsListElement.innerHTML =
      '<div class="resultItem" style="color: #666; font-style: italic;">Mindestens 3 Zeichen eingeben...</div>';
  } else {
    document.getElementById("resultsList").textContent = "";
    document.getElementById("resultsList").style.display = "none";
  }
});

// Funktion zum Suchen von Fällen (via API)
async function searchCases(query) {
  const resultsListElement = document.getElementById("resultsList");
  resultsListElement.style.display = "block";

  // Lade-Anzeige
  resultsListElement.innerHTML =
    '<div class="resultItem" style="color: #666; font-style: italic;">Suche...</div>';

  let loginData = await browser.storage.local.get([
    "username",
    "password",
    "serverAddress",
  ]);

  try {
    // API-Suche durchführen
    const results = await searchCasesApi(
      loginData.username,
      loginData.password,
      loginData.serverAddress,
      query,
    );

    // Ergebnisliste leeren
    while (resultsListElement.firstChild) {
      resultsListElement.removeChild(resultsListElement.firstChild);
    }

    if (results.length === 0) {
      resultsListElement.innerHTML =
        '<div class="resultItem" style="color: #666; font-style: italic;">Keine Ergebnisse gefunden</div>';
      return;
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

        const caseMetaData = await getCaseMetaData(
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
        const customizableLabel = document.getElementById("customizableLabel");
        customizableLabel.textContent = `${currentSelectedCase.fileNumber}: ${currentSelectedCase.name} (${caseMetaData.reason} - ${caseMetaData.lawyer})`;
      });
    });
  } catch (error) {
    console.error("Fehler bei der Suche:", error);
    resultsListElement.innerHTML =
      '<div class="resultItem" style="color: red;">Fehler bei der Suche</div>';
  }
}

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
      timeOut: 10000,
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
    const totalTasks = 4; // Reduziert von 5 auf 4 (Cases werden jetzt per API gesucht)

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
    // Hinweis: Cases werden nicht mehr heruntergeladen, sondern per API gesucht
    await Promise.all([
      (async () => {
        await getTags(username, password, serverAddress);
        fillTagsList();
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

// Funktion zum Suchen von Fällen via API
async function searchCasesApi(
  username,
  password,
  serverAddress,
  searchString,
  includeArchived = false,
) {
  // API erfordert mindestens 3 Zeichen
  if (!searchString || searchString.length < 3) {
    return [];
  }

  const url =
    serverAddress +
    "/j-lawyer-io/rest/v7/cases/search" +
    "?searchString=" +
    encodeURIComponent(searchString) +
    "&includeArchived=" +
    includeArchived;

  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  headers.append("Content-Type", "application/json");

  const response = await fetch(url, {
    method: "GET",
    headers: headers,
  });

  if (!response.ok) {
    throw new Error("Network response was not ok");
  }

  return response.json();
}

async function logActivity(action, details) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, action, details };

  let activityLog = await browser.storage.local.get("activityLog");
  activityLog = activityLog.activityLog || [];
  activityLog.push(logEntry);

  await browser.storage.local.set({ activityLog });
}
