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

let messagesToSaveIds = null;
let messagesToSaveObjects = null;
let menu_documentUploadedId = null;
let menu_lastMessageData = null;
let documentsToTag = null;
let documentCounter = 0;
let selectedCaseFolderID_bundle = null;
let bundleSaveWindowId = null;

//  ************************* ZUORDNEN MENU *************************

// Erstellt/gewährleistet den Kontextmenüeintrag für ausgewählte Nachrichten
async function ensureMessageListMenu() {
  try {
    await browser.menus.create({
      id: "mehrere_messages_zuordnen",
      title: "Nachrichten an j-Lawyer senden...",
      contexts: ["message_list"],
      icons: {
        16: "icons/icon-16.png",
        24: "icons/icon-24.png",
        32: "icons/icon-32.png",
      },
    });
  } catch (e) {
    // Duplicate ID ist ok, ansonsten loggen
    if (!(e && String(e).toLowerCase().includes("duplicate"))) {
      console.error("Fehler beim Erstellen des message_list-Menüs:", e);
    }
  } finally {
    try {
      await browser.menus.refresh();
    } catch (e) {
      /* ignore */
    }
  }
}

ensureMessageListMenu();

browser.runtime.onInstalled.addListener(() => {
  ensureMessageListMenu();
});
browser.runtime.onStartup.addListener(() => {
  ensureMessageListMenu();
});

// Setze bundleSaveWindowId zurück wenn das Fenster geschlossen wird
browser.windows.onRemoved.addListener((windowId) => {
  if (windowId === bundleSaveWindowId) {
    bundleSaveWindowId = null;
  }
});

// Fügt einen Event-Listener hinzu, der ausgelöst wird, wenn der Menüeintrag angeklickt wird
browser.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "mehrere_messages_zuordnen") return;

  try {
    // Prüfe ob bereits ein Fenster offen ist
    if (bundleSaveWindowId !== null) {
      try {
        // Versuche das existierende Fenster zu fokussieren
        await browser.windows.update(bundleSaveWindowId, { focused: true });
        return;
      } catch (e) {
        // Fenster existiert nicht mehr, zurücksetzen
        bundleSaveWindowId = null;
      }
    }

    // Lade gespeicherte Fenstergröße oder verwende Standardwerte
    const savedSize = await browser.storage.local.get("bundleSaveWindowSize");
    const width = savedSize.bundleSaveWindowSize?.width || 700;
    const height = savedSize.bundleSaveWindowSize?.height || 650;

    const newWindow = await browser.windows.create({
      url: browser.runtime.getURL("popup_menu_bundle_save.html"),
      type: "popup",
      width: width,
      height: height,
    });

    bundleSaveWindowId = newWindow.id;

    // Nachrichten bestimmen: bevorzugt info.selectedMessages, sonst via mailTabId, sonst aktiver Mail-Tab
    let selection = info.selectedMessages;
    if (!selection) {
      const mailTabId = info.mailTabId ?? tab?.id;
      if (mailTabId) {
        selection = await browser.mailTabs.getSelectedMessages(mailTabId);
      } else {
        const mailTabs = await browser.mailTabs.query({
          active: true,
          currentWindow: true,
        });
        if (mailTabs && mailTabs[0]) {
          selection = await browser.mailTabs.getSelectedMessages(
            mailTabs[0].id,
          );
        }
      }
    }

    if (!selection || !selection.messages || selection.messages.length === 0) {
      console.warn("Keine ausgewählten Nachrichten gefunden.");
      return;
    }

    console.log("Ausgewählte Nachrichten:", selection);
    messagesToSaveObjects = selection;

    let meta = selection.messages.map((message) => ({
      id: message.id,
      subject: message.subject,
    }));
    console.log(meta);

    messagesToSaveIds = selection.messages.map((message) => ({
      id: message.id,
    }));
    console.log(messagesToSaveIds);
  } catch (e) {
    console.error("Fehler beim Verarbeiten des Menü-Klicks:", e);
  }
});

//  **************************************************

async function sendEmailToServerFromSelection(
  singleMessageFromSelection,
  caseId,
  username,
  password,
  serverAddress,
) {
  /*
    This function sends an email to a server. It takes five parameters: a single message from a selection,
    a case ID, a username, a password, and a server address.
    First, the case ID is logged to the console. Then, the URL for the server request is created.
    The ID of the single message from the selection is retrieved, and the tag "veraktet" is added to the message.
    The raw data of the message is retrieved, and the content of the message is encoded to Base64.
    The current date is retrieved and used to create the filename. The filename consists of the current date,
    the author of the message, the subject of the message, and a document counter.
    Any unwanted characters in the filename are replaced with underscores.

    The document counter is incremented by one.The payload for the server request is created.
    It includes the encoded content of the message, the case ID, the filename, and some additional parameters.
    The headers for the server request are created.
    They include a Basic Authorization with the username and password, as well as the Content-Type.
    The server request is executed using the PUT method. The payload is sent as a JSON string in the body of the request.
    If the server response is not OK, an error is thrown. Otherwise, the response is returned as JSON.
    The ID of the uploaded document is retrieved and logged to the console.
    Then, the function updateDocumentFolderBundle is called.
    A message of type "success" is sent to the browser runtime.
    The selected tags are retrieved from local storage. If there are selected tags,
    the function setDocumentTagFromSelection is called for each tag.
    If an error occurs, it is logged to the console, and a message of type "error" is sent to the browser runtime.
    */

  console.log("Case ID: " + caseId);
  const url = `${serverAddress}/j-lawyer-io/rest/v1/cases/document/create`;

  try {
    const messageId = singleMessageFromSelection.id;

    // Nachricht im Rohformat abrufen
    const rawMessage = await messenger.messages.getRaw(messageId, {
      decrypt: true,
    });

    // Der Inhalt der Nachricht wird zu Base64 codiert
    const emailContentBase64 = await messageToBase64(rawMessage);

    // Datum und Zeit aus den Headern abrufen
    const date = new Date(singleMessageFromSelection.date);
    const dateString = formatDate(date);
    console.log("DateString: " + dateString);

    // Dateinamen erstellen
    let fileName = `${dateString}_${singleMessageFromSelection.author}_${singleMessageFromSelection.subject}_${documentCounter}.eml`;
    fileName = fileName.replace(/[\/\\:*?"<>|@]/g, "_");

    documentCounter++;

    // Payload erstellen
    const payload = {
      base64content: emailContentBase64,
      caseId: caseId,
      fileName: fileName,
      folderId: "",
      id: "",
      version: 0,
    };

    // Headers erstellen
    const headers = new Headers();
    const loginBase64Encoded = btoa(`${username}:${password}`);
    headers.append("Authorization", "Basic " + loginBase64Encoded);
    headers.append("Content-Type", "application/json");

    // Fetch-Request an den Server senden
    const response = await fetch(url, {
      method: "PUT",
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Datei existiert eventuell schon");
    }

    const data = await response.json();
    console.log("Dokument ID: " + data.id);
    menu_documentUploadedId = data.id;

    await updateDocumentFolderBundle(username, password, serverAddress);

    // creationDate auf das E-Mail-Datum setzen (nicht den Veraktungszeitpunkt)
    try {
      await updateDocumentCreationDate(
        data.id,
        date,
        caseId,
        username,
        password,
        serverAddress,
      );
      logActivity(
        "sendEmailToServerFromSelection",
        "creationDate gesetzt auf: " + date.toISOString(),
      );
    } catch (dateError) {
      console.error("Fehler beim Setzen des creationDate:", dateError);
      // Nicht abbrechen - das Dokument wurde bereits gespeichert
    }

    logActivity(
      "sendEmailToServerFromSelection",
      "Email gespeichert: " + fileName,
    );

    // Erfolgsnachricht senden
    await browser.runtime.sendMessage({ type: "success" });

    // Tags aus localStorage abrufen
    const { selectedTags } = await browser.storage.local.get(["selectedTags"]);
    if (selectedTags && selectedTags.length > 0) {
      for (const documentTag of selectedTags) {
        await setDocumentTagFromSelection(
          username,
          password,
          serverAddress,
          documentTag,
        );
        logActivity(
          "sendEmailToServerFromSelection",
          "Added Tag: " + documentTag,
        );
      }
    }

    // Nachricht taggen
    await addTagToMessageFromSelection(messageId, "veraktet", "#000080");
    logActivity("sendEmailToServerFromSelection", {
      "TAG veraktet hinzugefügt": fileName,
    });
  } catch (error) {
    console.error("Error:", error);
    await browser.runtime.sendMessage({
      type: "error",
      content: error.message,
    });
  }
}

// function getCasesFromSelection(username, password, serverAddress) {
//     /*
//     This function, `getCasesFromSelection`, is used to fetch a list of cases from a server.
//     It takes three parameters: a username, a password, and a server address.

//     First, it constructs the URL for the server request by appending '/j-lawyer-io/rest/v1/cases/list' to the server address.
//     It then creates a new Headers object. This object is used to set the headers for the server request.
//     The username and password are concatenated with a colon in between,
//     then encoded using the encodeURIComponent function to ensure that any special characters are properly escaped.
//     The resulting string is then unescaped and encoded to Base64 using the btoa function.
//     This Base64 encoded string is used for Basic Authorization in the headers.

//     The 'Authorization' header is set to 'Basic ' followed by the Base64 encoded login credentials.
//     The 'Content-Type' header is set to 'application/json' to indicate that the server should interpret
//     the request body as a JSON object.

//     A GET request is made to the server using the fetch API. The URL and headers are passed as parameters.

//     The fetch API returns a Promise that resolves to the Response object representing the response to the request.
//     This is then processed with a .then() block.

//     Inside the .then() block, the function checks if the response was ok (status in the range 200-299).
//     If it was not ok, it throws an error.

//     If the response was ok, it returns the response body parsed as JSON.
//     This will be a Promise that resolves to the actual data when it is ready.
//     */

//     const url = serverAddress + '/j-lawyer-io/rest/v1/cases/list';

//     const headers = new Headers();
//     const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
//     headers.append('Authorization', 'Basic ' + loginBase64Encoded);
//     // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
//     headers.append('Content-Type', 'application/json');

//     return fetch(url, {
//         method: 'GET',
//         headers: headers
//     }).then(response => {
//         if (!response.ok) {
//             throw new Error('Network response was not ok');
//         }
//         return response.json();
//     });
// }

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

// Funktion zum Finden einer Case-ID anhand des Aktenzeichens via API
async function findCaseIdByFileNumber(
  username,
  password,
  serverAddress,
  fileNumber,
) {
  if (!fileNumber || fileNumber.length < 3) {
    console.log("Aktenzeichen zu kurz für API-Suche: " + fileNumber);
    return null;
  }

  try {
    const results = await searchCasesApi(
      username,
      password,
      serverAddress,
      fileNumber,
    );

    // Suche exakten Match im Ergebnis
    for (const item of results) {
      if (item.fileNumber === fileNumber) {
        console.log(
          "ID gefunden via API: " +
            item.id +
            " für Aktenzeichen: " +
            fileNumber,
        );
        return item.id;
      }
    }

    console.log("Kein exakter Match für Aktenzeichen: " + fileNumber);
    return null;
  } catch (error) {
    console.error("Fehler bei API-Suche für Aktenzeichen:", fileNumber, error);
    return null;
  }
}

function findCaseBySubject(data, subject) {
  /*
    This function, `findCaseBySubject`, is used to find and return the name of an item in a data set based on a given subject.
    */

  for (let item of data) {
    if (item.fileNumber === subject) {
      return item.name;
    }
  }
  return null;
}

// zu base64 codiert, inkl. utf8
async function messageToBase64(rawMessage) {
  /*
    This function, `messageToBase64`, is used to convert the content of a message to a Base64 string.
    */

  try {
    // Den Nachrichteninhalt in Base64 codieren
    let bytes = new Uint8Array(rawMessage.length);
    for (let i = 0; i < rawMessage.length; i++) {
      bytes[i] = rawMessage.charCodeAt(i) & 0xff;
    }
    let file = new File([bytes], `message.eml`, { type: "message/rfc822" });

    // Datei als Base64 lesen
    return new Promise((resolve, reject) => {
      let reader = new FileReader();
      reader.onload = function (event) {
        // Base64-String ohne den Anfangsteil "data:..." extrahieren
        let base64Message = event.target.result.split(",")[1];
        console.log(base64Message);
        resolve(base64Message);
      };
      reader.onerror = function (error) {
        console.error("Fehler beim Lesen der Datei:", error);
        reject(error);
      };
      reader.readAsDataURL(file);
    });
  } catch (error) {
    console.error("Fehler beim Umwandeln der Nachricht in Base64:", error);
    throw error;
  }
}

// function getCurrentDateFormatted() {
//     /*
//     This function, `getCurrentDateFormatted`, is used to get the current date and time,
//     and format it in the pattern "YYYY-MM-DD HH:MM:SS".

//     First, it creates a new Date object, `currentDate`, which holds the current date and time.

//     It then extracts the year, month, and day from `currentDate`. The month is incremented
//     by 1 because JavaScript's getMonth() method returns a zero-based value (0-11).

//     If the month or day is less than 10, it prepends a '0' to ensure a two-digit format.

//     Similarly, it extracts the hours, minutes, and seconds from `currentDate`. If any of
//     these values are less than 10, it prepends a '0' to ensure a two-digit format.

//     Finally, it combines the date and time components into a single string in the format
//     "YYYY-MM-DD HH:MM:SS" and returns this string.
//     */

//     const currentDate = new Date();

//     const year = currentDate.getFullYear();

//     let month = currentDate.getMonth() + 1;
//     month = month < 10 ? '0' + month : month;

//     let day = currentDate.getDate();
//     day = day < 10 ? '0' + day : day;

//     // Ergänzung für die Uhrzeit
//     let hours = currentDate.getHours();
//     hours = hours < 10 ? '0' + hours : hours;

//     let minutes = currentDate.getMinutes();
//     minutes = minutes < 10 ? '0' + minutes : minutes;

//     let seconds = currentDate.getSeconds();
//     seconds = seconds < 10 ? '0' + seconds : seconds;

//     // Kombinieren von Datum und Uhrzeit im Format YYYY-MM-DD HH:MM:SS
//     return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
// }

function formatDate(input) {
  const date = new Date(input);
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${year}-${month}-${day}_${hours}-${minutes}`;
}

// adding Tag
function setDocumentTagFromSelection(
  username,
  password,
  serverAddress,
  documentTag,
) {
  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
  headers.append("Content-Type", "application/json");

  const id = menu_documentUploadedId;

  const url =
    serverAddress + "/j-lawyer-io/rest/v5/cases/documents/" + id + "/tags";

  // den Payload erstellen
  const payload = {
    name: documentTag,
  };

  fetch(url, {
    method: "PUT",
    headers: headers,
    body: JSON.stringify(payload),
  }).then((response) => {
    if (!response.ok) {
      throw new Error("Network error" + response.status + response.statusText);
    }
    return response.json();
  });
}

// puts document into case folder
async function updateDocumentFolderBundle(username, password, serverAddress) {
  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
  headers.append("Content-Type", "application/json");

  const url = serverAddress + "/j-lawyer-io/rest/v1/cases/document/update";

  // den Payload erstellen
  const payload = {
    id: menu_documentUploadedId,
    folderId: selectedCaseFolderID_bundle,
  };

  fetch(url, {
    method: "PUT",
    headers: headers,
    body: JSON.stringify(payload),
  }).then((response) => {
    if (!response.ok) {
      throw new Error("Network response was not ok");
    }
    return response.json();
  });
}

// Holt die Dokument-Metadaten vom Server
async function getDocumentMetadata(
  documentId,
  username,
  password,
  serverAddress,
) {
  const headers = new Headers();
  const loginBase64Encoded = btoa(
    unescape(encodeURIComponent(username + ":" + password)),
  );
  headers.append("Authorization", "Basic " + loginBase64Encoded);
  headers.append("Content-Type", "application/json");

  const url = `${serverAddress}/j-lawyer-io/rest/v1/cases/document/${documentId}/content`;

  const response = await fetch(url, {
    method: "GET",
    headers: headers,
  });

  if (!response.ok) {
    throw new Error(
      "Fehler beim Abrufen der Dokument-Metadaten: " + response.status,
    );
  }

  return response.json();
}

// Aktualisiert das creationDate eines Dokuments auf das E-Mail-Datum
async function updateDocumentCreationDate(
  documentId,
  emailDate,
  caseId,
  username,
  password,
  serverAddress,
) {
  try {
    // Zuerst die aktuellen Metadaten des Dokuments abrufen
    const docMetadata = await getDocumentMetadata(
      documentId,
      username,
      password,
      serverAddress,
    );
    console.log("Dokument-Metadaten abgerufen:", docMetadata);

    const headers = new Headers();
    const loginBase64Encoded = btoa(
      unescape(encodeURIComponent(username + ":" + password)),
    );
    headers.append("Authorization", "Basic " + loginBase64Encoded);
    headers.append("Content-Type", "application/json");

    const url = `${serverAddress}/j-lawyer-io/rest/v1/cases/document/update-metadata`;

    // E-Mail-Datum als ISO-String formatieren
    const emailDateISO = emailDate.toISOString();
    const currentDateISO = new Date().toISOString();

    // Payload mit allen erforderlichen Feldern erstellen
    // basierend auf dem Muster aus jLClient-JS
    const payload = {
      caseId: caseId,
      changeDate: currentDateISO,
      creationDate: emailDateISO,
      externalId: docMetadata.externalId || null,
      favorite: docMetadata.favorite || false,
      folderId: docMetadata.folderId || selectedCaseFolderID_bundle || null,
      highlight1:
        docMetadata.highlight1 !== undefined
          ? docMetadata.highlight1
          : -2147483648,
      highlight2:
        docMetadata.highlight2 !== undefined
          ? docMetadata.highlight2
          : -2147483648,
      id: documentId,
      name: docMetadata.name,
      size: docMetadata.size || 0,
      version: (docMetadata.version || 0) + 1,
    };

    console.log("Update-Metadata Payload:", payload);

    const response = await fetch(url, {
      method: "PUT",
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        "Fehler beim Aktualisieren des creationDate: " +
          response.status +
          " " +
          errorText,
      );
    }

    const result = await response.json();
    console.log("creationDate erfolgreich aktualisiert auf:", emailDateISO);
    return result;
  } catch (error) {
    console.error("Fehler in updateDocumentCreationDate:", error);
    throw error;
  }
}

// comment: https://stackoverflow.com/questions/21797299/convert-base64-string-to-arraybuffer
function uint8ArrayToBase64(uint8Array) {
  let binaryString = "";
  uint8Array.forEach((byte) => {
    binaryString += String.fromCharCode(byte);
  });
  return btoa(binaryString);
}

// adds thunderbird tag to selected message - until TB 115
async function addTagToMessageFromSelection(messageId, tagName, tagColor) {
  // Alle vorhandenen Tags abrufen
  const existingTags = await browser.messages.listTags();

  // Überprüfen, ob der Tag bereits existiert
  let tag = existingTags.find((t) => t.tag === tagName);

  // Wenn der Tag nicht existiert, wird er erstellt
  if (!tag) {
    tag = await browser.messages.createTag(tagName, tagName, tagColor);
  }

  // Tag wird der Nachricht hinzugefügt
  await browser.messages.update(messageId, { tags: [tag.key] });
}

/* // Adds a Thunderbird tag to a selected message - from TB 121
async function addTagToMessageFromSelection(messageId, tagName, tagColor) {
    // Alle vorhandenen Tags abrufen
    const existingTags = await browser.messages.tags.list();

    // Überprüfen, ob der Tag bereits existiert
    let tag = existingTags.find(t => t.tag === tagName);

    // Wenn der Tag nicht existiert, wird er erstellt
    if (!tag) {
        const tagKey = tagName.toLowerCase();  // Erstellen eines eindeutigen Schlüssels
        tag = await browser.messages.tags.create(tagKey, tagName, tagColor);
    }

    // Nachricht abrufen, um die aktuellen Tags zu erhalten
    let message = await browser.messages.get(messageId);

    // Bestehende Tags abrufen und neuen Tag hinzufügen
    let tags = message.tags || [];
    if (!tags.includes(tag.key)) {
        tags.push(tag.key);
    }

    // Nachricht aktualisieren mit neuen Tags
    await browser.messages.update(messageId, { tags: tags });
} */

// Empfangen der Nachrichten vom Popup
browser.runtime.onMessage.addListener((message) => {
  if (
    (message.type === "fileNumber" || message.type === "case") &&
    message.source === "popup_menu_bundle_save"
  ) {
    selectedCaseFolderID_bundle = message.selectedCaseFolderID;

    for (const key in messagesToSaveObjects.messages) {
      browser.storage.local
        .get(["username", "password", "serverAddress"])
        .then(async (result) => {
          const fileNumber = String(message.content);
          console.log(
            "Single Selected Message Key:",
            key,
            "Value:",
            messagesToSaveObjects.messages[key].id,
          );

          const caseId = await findCaseIdByFileNumber(
            result.username,
            result.password,
            result.serverAddress,
            fileNumber,
          );

          if (caseId) {
            singleMessageFromSelection = messagesToSaveObjects.messages[key];
            sendEmailToServerFromSelection(
              singleMessageFromSelection,
              caseId,
              result.username,
              result.password,
              result.serverAddress,
            );
          } else {
            console.log("Keine übereinstimmende ID gefunden");
          }
        });
    }
    documentCounter = 0;
  }
});

async function logActivity(action, details) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, action, details };

  let activityLog = await browser.storage.local.get("activityLog");
  activityLog = activityLog.activityLog || [];
  activityLog.push(logEntry);

  await browser.storage.local.set({ activityLog });
}
