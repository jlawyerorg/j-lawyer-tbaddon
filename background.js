{/* j-Lawyer Thunderbird Extension - saves Messages to j-Lawyer Server Cases.
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
along with this program.  If not, see <https://www.gnu.org/licenses/>. */}


let documentUploadedId = null;
let documentIdsToTag = [];
let lastMessageData = null;
let extensionUsed = false;
let selectedCaseFolderID = null;
let selectedCaseFolderIDAfterSend = null;
let currentSelectedCase = null;
let documentToAddToMessage = null;
let documentsInSelectedCase = [];
let IdOfDocumentToAddToMail = null;
let isMenuClickListenerRegistered = false;

// Initial beim Laden der Erweiterung
createMenuEntries();

async function sendEmailToServer(caseId, username, password, serverAddress) {

    console.log("Case ID: " + caseId);
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/document/create';

    const messageData = await getDisplayedMessageFromActiveTab();
    console.log("Message Id: " + messageData.id);

    let rawMessage = await messenger.messages.getRaw(messageData.id, { decrypt: true });

    // Der Inhalt der Message wird zu Base64 codiert
    const emailContentBase64 = await messageToBase64(rawMessage);

    // get date and time from message header
    let date = new Date(messageData.date);
    let dateString = formatDate(date);
    console.log("DateString: " + dateString);

    // Dateinamen erstellen
    let fileName = dateString + "_" + messageData.author + messageData.subject + ".eml";
    fileName = fileName.replace(/[\/\\:*?"<>|@]/g, '_');

    let fileNamesArray = [];

    try {
        fileNamesArray = await getFilesInCase(caseId, username, password, serverAddress);
        console.log("Empfangene Dateinamen: ", fileNamesArray);
    } catch (error) {
        console.error("Ein Fehler ist aufgetreten: ", error);
    }
    
    // check if fileName already exists
    if (fileNamesArray.includes(fileName)) {
        console.log("Datei existiert schon in der Akte");
        browser.runtime.sendMessage({ type: "error", content: "Datei existiert schon in der Akte" });
        return;
    } else {

        // den Payload erstellen
        const payload = {
            base64content: emailContentBase64,
            caseId: caseId,
            fileName: fileName,
            folderId: selectedCaseFolderID,
            id: "",
            version: 0
        };
        
        const headers = new Headers();
        const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
        headers.append('Authorization', 'Basic ' + loginBase64Encoded);
        headers.append('Content-Type', 'application/json');

        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Datei existiert eventuell schon');
            }

            const data = await response.json();
            documentUploadedId = data.id;
            console.log("Dokument ID: " + data.id);

            await updateDocumentFolder(username, password, serverAddress, selectedCaseFolderID);
            await logActivity("sendEmailToServer", 'Email gespeichert: ' + fileName);

            browser.runtime.sendMessage({ type: "success" });

            // Der Nachricht wird der Tag "veraktet" hinzugefügt
            await addTagToMessage(messageData, 'veraktet', '#000080');

            const result = await browser.storage.local.get(["username", "password", "serverAddress", "selectedTags"]);
            // Überprüfen, ob selectedTags nicht leer ist
            if (result.selectedTags && result.selectedTags.length > 0) {
                for (let documentTag of result.selectedTags) {
                    await setDocumentTag(result.username, result.password, result.serverAddress, documentTag);
                    await logActivity("sendEmailToServer", "Tag hinzugefügt: " + documentTag);
                }
            }

            // Überprüfen, ob die Option "Email nach Zuordnung in Papierkorb verschieben" gesetzt ist
            const moveToTrashResult = await browser.storage.local.get("moveToTrash");
            if (moveToTrashResult.moveToTrash) {
                await browser.messages.delete([messageData.id]);
                await logActivity("sendEmailToServer", "Email in Papierkorb verschoben");
            }

            await browser.storage.local.remove("selectedTags");
            const selectedTagsResult = await browser.storage.local.get("selectedTags");
            console.log("selectedTags: " + selectedTagsResult.selectedTags);

        } catch (error) {
            console.log('Error:', error);
            browser.runtime.sendMessage({ type: "error", content: error.message });
        }
    }
    logActivity("sendEmailToServer", { caseId, fileName});
}

async function sendOnlyMessageToServer(caseId, username, password, serverAddress) {
    console.log("Case ID: " + caseId);
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/document/create';

    const messageData = await getDisplayedMessageFromActiveTab();
    console.log("Message Id: " + messageData.id);

   
    let rawMessage = await messenger.messages.getRaw(messageData.id, { decrypt: true });

    // let message = rawMessage.message;

    let message;
    try {
        message = removeAttachmentsFromRFC2822(rawMessage);
    } catch (error) {
        console.error("Fehler beim Entfernen der Anhänge:", error);
        message = rawMessage;
    }

    //message = await removeAttachmentsFromMessage(deineMessageId); // neue API-Methode


    // Der Inhalt der Message wird zu Base64 codiert
    const emailContentBase64 = await messageToBase64(message);

    // get date and time from message header
    let date = new Date(messageData.date);
    let dateString = formatDate(date);
    console.log("DateString: " + dateString);

    // Dateinamen erstellen
    fileName = dateString + "_" + messageData.author + messageData.subject + ".eml";
    fileName = fileName.replace(/[\/\\:*?"<>|@]/g, '_');

    // get documents in case
    let fileNamesArray = [];

    try {
        fileNamesArray = await getFilesInCase(caseId, username, password, serverAddress);
        console.log("Empfangene Dateinamen: ", fileNamesArray);
    } catch (error) {
        console.error("Ein Fehler ist aufgetreten: ", error);
    }
    
    // check if fileName already exists
    if (fileNamesArray.includes(fileName)) {
        console.log("Datei existiert schon in der Akte");
        browser.runtime.sendMessage({ type: "error", content: "Datei existiert schon in der Akte" });
        return;
    } else {

        // den Payload erstellen
        const payload = {
            base64content: emailContentBase64,
            caseId: caseId,
            fileName: fileName,
            folderId: selectedCaseFolderID,
            id: "",
            version: 0
        };
        
        const headers = new Headers();
        const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
        headers.append('Authorization', 'Basic ' + loginBase64Encoded);
        // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
        headers.append('Content-Type', 'application/json');

        try {
            const response = await fetch(url, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Datei existiert eventuell schon');
            }

            const data = await response.json();
            documentUploadedId = data.id;
            console.log("Dokument ID: " + data.id);

            await updateDocumentFolder(username, password, serverAddress, selectedCaseFolderID);
            await logActivity("sendOnlyMessageToServer", 'Email gespeichert: ' + fileName);

            browser.runtime.sendMessage({ type: "success" });

            // Der Nachricht wird der Tag "veraktet" hinzugefügt
            await addTagToMessage(messageData, 'veraktet', '#000080');

            const result = await browser.storage.local.get(["username", "password", "serverAddress", "selectedTags"]);
            // Überprüfen, ob selectedTags nicht leer ist
            if (result.selectedTags && result.selectedTags.length > 0) {
                for (let documentTag of result.selectedTags) {
                    await setDocumentTag(result.username, result.password, result.serverAddress, documentTag);
                    await logActivity("sendOnlyMessageToServer", "Tag hinzugefügt: " + documentTag);
                }
            }

            // Überprüfen, ob die Option "Email nach Zuordnung in Papierkorb verschieben" gesetzt ist
            // const moveToTrashResult = await browser.storage.local.get("moveToTrash");
            // if (moveToTrashResult.moveToTrash) {
            //     await browser.messages.delete([messageData.id]);
            //     await logActivity("sendOnlyMessageToServer", "Email in Papierkorb verschoben");
            // }

            await browser.storage.local.remove("selectedTags");
            const selectedTagsResult = await browser.storage.local.get("selectedTags");
            console.log("selectedTags: " + selectedTagsResult.selectedTags);

        } catch (error) {
            console.log('Error:', error);
            browser.runtime.sendMessage({ type: "error", content: error.message });
        }
    }
    logActivity("sendOnlyMessageToServer", { caseId, fileName });
}


async function sendAttachmentsToServer(caseId, username, password, serverAddress) {
    console.log("Case ID: " + caseId);
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/document/create';

    // Nachrichteninhalt abrufen
    const messageData = await getDisplayedMessageFromActiveTab();
    console.log("Message Id: " + messageData.id);

    // Attachments holen
    let attachments = await browser.messages.listAttachments(messageData.id);
    console.log("Attachments gefunden:", attachments.length);

    // Überprüfen, ob Attachments vorhanden sind
    if (attachments.length === 0) {
        console.log("Keine Attachments in der Nachricht vorhanden.");
        browser.runtime.sendMessage({ type: "error", content: "Keine Attachments in der Nachricht vorhanden." });
        return;
    }

    // Datum und Zeit einmal für alle Attachments generieren
    let date = new Date(messageData.date);
    let dateString = formatDate(date);
    console.log("DateString: " + dateString);

    // Dateinamen-Liste einmal für alle Attachments abrufen
    let fileNamesArray = [];
    try {
        fileNamesArray = await getFilesInCase(caseId, username, password, serverAddress);
        console.log("Empfangene Dateinamen:", fileNamesArray.length, "Dateien");
    } catch (error) {
        console.error("Fehler beim Abrufen der Dateinamen:", error);
        browser.runtime.sendMessage({ type: "error", content: "Fehler beim Abrufen der vorhandenen Dateien" });
        return;
    }

    // Tracking für Verarbeitung
    const processedFiles = [];
    const errors = [];
    let attachmentCounter = 0;

    // Headers einmal erstellen
    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    headers.append('Content-Type', 'application/json');

    for (let att of attachments) {
        attachmentCounter++;
        console.log(`Verarbeite Attachment ${attachmentCounter}/${attachments.length}: ${att.name}`);

        try {
            // Attachment-Datei abrufen
            let file = await browser.messages.getAttachmentFile(
                messageData.id,
                att.partName
            );
            
            console.log(`ContentType für ${att.name}: ${att.contentType}`);

            // Nur arrayBuffer() verwenden, text() wird nicht benötigt
            let buffer = await file.arrayBuffer();
            let uint8Array = new Uint8Array(buffer);
            const emailContentBase64 = uint8ArrayToBase64(uint8Array);

            // Eindeutigen Dateinamen erstellen
            let fileName = dateString + "_" + att.name;
            fileName = fileName.replace(/[\/\\:*?"<>|@]/g, '_');

            // Bei Duplikaten Counter hinzufügen
            let finalFileName = fileName;
            let duplicateCounter = 1;
            while (fileNamesArray.includes(finalFileName) || processedFiles.includes(finalFileName)) {
                const nameParts = fileName.split('.');
                if (nameParts.length > 1) {
                    const extension = nameParts.pop();
                    const baseName = nameParts.join('.');
                    finalFileName = `${baseName}_${duplicateCounter}.${extension}`;
                } else {
                    finalFileName = `${fileName}_${duplicateCounter}`;
                }
                duplicateCounter++;
            }

            if (finalFileName !== fileName) {
                console.log(`Dateiname geändert von "${fileName}" zu "${finalFileName}" wegen Duplikat`);
            }

            console.log(`CasefolderID für Attachment "${finalFileName}": ${selectedCaseFolderID}`);

            // Payload erstellen
            const payload = {
                base64content: emailContentBase64,
                caseId: caseId,
                fileName: finalFileName,
                folderId: selectedCaseFolderID,
                id: "",
                version: 0
            };

            // Upload versuchen
            const response = await fetch(url, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Datei existiert ggfs. schon');
            }

            const data = await response.json();
            console.log(`Dokument ID für "${finalFileName}": ${data.id}`);

            // Erfolg vermerken
            documentIdsToTag.push(data.id);
            processedFiles.push(finalFileName);

        } catch (error) {
            console.error(`Fehler beim Verarbeiten von Attachment "${att.name}":`, error);
            errors.push({
                fileName: att.name,
                error: error.message
            });
        }
    }

    // Ergebnis-Summary
    console.log(`Attachment-Verarbeitung abgeschlossen: ${processedFiles.length}/${attachments.length} erfolgreich`);
    
    if (errors.length > 0) {
        console.error("Fehler bei folgenden Attachments:", errors);
        const errorMessage = `${errors.length} von ${attachments.length} Attachments konnten nicht hochgeladen werden: ${errors.map(e => e.fileName).join(', ')}`;
        browser.runtime.sendMessage({ type: "error", content: errorMessage });
    }

    // Nur Success-Message senden wenn mindestens ein Attachment erfolgreich war
    if (processedFiles.length > 0) {
        browser.runtime.sendMessage({ type: "success", content: `${processedFiles.length} Attachment(s) erfolgreich hochgeladen` });
        
        // Tags und Ordner setzen
        await setDocumentTagsAndFolderForAttachments();
    }

    // Zusätzlich alle MIME-Parts durchsuchen (für inline Attachments)
    // Übergebe bereits verarbeitete Dateien um Duplikate zu vermeiden
    await sendAllMimePartsToServer(caseId, username, password, serverAddress, processedFiles);

    // Logging mit allen verarbeiteten Dateien
    await logActivity("sendAttachmentsToServer", { 
        caseId, 
        processedFiles: processedFiles,
        totalAttachments: attachments.length,
        successCount: processedFiles.length,
        errorCount: errors.length
    });
}


async function sendEmailToServerAfterSend(caseIdToSaveToAfterSend, selectedCaseFolderIDAfterSend, username, password, serverAddress) {
    console.log("Es wird versucht, die Email in der Akte zu speichern");
    console.log("selectedCaseFolderIDAfterSend: " + selectedCaseFolderIDAfterSend);
    selectedCaseFolderID = selectedCaseFolderIDAfterSend;

    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/document/create';

    rawMessage = await messenger.messages.getRaw(lastMessageData.messages[0].id, { decrypt: true });

    addTagToMessage(lastMessageData.messages[0], 'veraktet', '#000080');

    // Der Inhalt der Message wird zu Base64 codiert
    const emailContentBase64 = await messageToBase64(rawMessage);

    // Erhalte das aktuelle Datum und die Uhrzeit
    let date = new Date();

    let year = date.getFullYear();
    let month = ("0" + (date.getMonth() + 1)).slice(-2); 
    let day = ("0" + date.getDate()).slice(-2);
    let hours = ("0" + date.getHours()).slice(-2);
    let minutes = ("0" + date.getMinutes()).slice(-2);

    let dateString = `${year}-${month}-${day}_${hours}-${minutes}`;

    console.log(dateString); // Gibt das Datum und die Uhrzeit im Format YYYY-MM-DD_HH-MM aus

    // Dateinamen erstellen
    fileName = dateString + "_" + lastMessageData.messages[0].subject + ".eml";
    fileName = fileName.replace(/[\/\\:*?"<>|@]/g, '_');

    // den Payload erstellen
    const payload = {
        base64content: emailContentBase64,
        caseId: caseIdToSaveToAfterSend,
        fileName: fileName,
        folderId: selectedCaseFolderID,
        id: "",
        version: 0
    };

    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
    headers.append('Content-Type', 'application/json');

    fetch(url, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(payload)
    }).then(response => {
        if (!response.ok) {
            throw new Error('Datei existiert eventuell schon');
        }
        return response.json();
    }).then(data => {
        documentUploadedId = data.id;
        console.log("Dokument ID: " + data.id);

        updateDocumentFolder(username, password, serverAddress, selectedCaseFolderID);

        console.log("E-Mail wurde erfolgreich gespeichert");

        browser.storage.local.get(["username", "password", "serverAddress", "selectedTags"]).then(result => {
            // Überprüfen, ob documentTags nicht leer ist
            if (result.selectedTags && result.selectedTags.length > 0) {
                for (let documentTag of result.selectedTags) {
                    setDocumentTag(result.username, result.password, result.serverAddress, documentTag); // 
                }
            }
            else {
                console.log("Keine Tags ausgewählt");
            }
        });
        browser.storage.local.remove("selectedTags");
        browser.storage.local.get("selectedTags").then(result => {
            console.log("selectedTags: " + result.selectedTags);
        }
        );

    }).catch(error => {
        console.log('Error:', error);
        browser.runtime.sendMessage({ type: "error", content: error.message });
    });
    browser.storage.local.remove(caseIdToSaveToAfterSend);
    console.log("caseIdToSaveToAfterSend wurde gelöscht");
    extensionUsed = false;
    console.log("extensionUsed wurde wieder auf false gesetzt");
    logActivity("sendEmailToServerAfterSend", { caseIdToSaveToAfterSend, fileName });
}


function getDisplayedMessageFromActiveTab() {
    return browser.mailTabs.query({ active: true, currentWindow: true })
        .then((tabs) => {
            if (tabs.length === 0) {
                // Wenn kein aktiver mailTab gefunden wird, den aktiven Tab im Fenster abrufen
                return browser.tabs.query({ active: true, currentWindow: true });
            }
            return tabs;
        })
        .then((tabs) => {
            if (tabs.length === 0) {
                throw new Error("Kein aktiver Tab gefunden.");
            }
            let currentTabId = tabs[0].id;
            return browser.messageDisplay.getDisplayedMessage(currentTabId);
        })
        .then((message) => {
            if (!message) {
                throw new Error("Keine Nachricht im aktiven Tab angezeigt.");
            }
            return message;
        });
}



async function getCases(username, password, serverAddress) {
    const storageKey = 'casesList';
    const cachedData = await browser.storage.local.get(storageKey);

    if (cachedData[storageKey]) {
        console.log('Verwende zwischengespeicherte Daten für Fälle');
        return cachedData[storageKey];
    }

    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/list';
    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    headers.append('Content-Type', 'application/json');

    const response = await fetch(url, {
        method: 'GET',
        headers: headers
    });

    if (!response.ok) {
        throw new Error('Network response was not ok');
    }

    const data = await response.json();
    await browser.storage.local.set({ [storageKey]: data });
    console.log('Fälle im Speicher gespeichert');
    return data;
}

async function getStoredCases() {
    const storageKey = 'cases';
    const cachedData = await browser.storage.local.get(storageKey);

    if (cachedData[storageKey]) {
        console.log('Verwende zwischengespeicherte Daten für Fälle');
        // console.log(cachedData[storageKey]);
        return cachedData[storageKey];
    } else {
        console.log('Keine zwischengespeicherten Daten gefunden');
        return null;
    }
}


async function getFilesInCase(caseId, username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/' + caseId + '/documents';

    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
    headers.append('Content-Type', 'application/json');

    return fetch(url, {
        method: 'GET',
        headers: headers
    }).then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        const valuesArray = data.map(item => item.name);
        return valuesArray;
    });
}

async function getFilesInCaseToDownload(caseId, username, password, serverAddress) {
    const url = `${serverAddress}/j-lawyer-io/rest/v1/cases/${caseId}/documents`;

    try {
        const headers = new Headers();
        const loginBase64Encoded = btoa(`${username}:${password}`);
        headers.append('Authorization', 'Basic ' + loginBase64Encoded);
        headers.append('Content-Type', 'application/json');

        // HTTP GET Request ausführen
        const response = await fetch(url, {
            method: 'GET',
            headers: headers,
        });

        // Überprüfen, ob der Response erfolgreich war
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        // JSON-Daten aus der Antwort extrahieren
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching documents:', error);
        throw error; // Fehler weitergeben, falls die aufrufende Funktion ihn behandeln möchte
    }
}

async function getFileByIdToDownload(fileId, username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/document/' + fileId + '/content';

    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
    headers.append('Content-Type', 'application/json');

    return fetch(url, {
        method: 'GET',
        headers: headers
    }).then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        return data;
    });
}


async function findIdByFileNumber(data, fileNumber) {
    for (let item of data) {
        if (item.fileNumber === fileNumber) {
            console.log("ID gefunden: " + item.id + " für Dateinummer: " + fileNumber);
            return item.id;
        }
    }
    return null;
}



function findCaseBySubject(data, subject) {
    for (let item of data) {
        if (item.fileNumber === subject) {
            return item.name;
        }
    }
    return null;
}



// zu base64 codiert, inkl. utf8
async function messageToBase64(rawMessage) {
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
                let base64Message = event.target.result.split(',')[1];
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


function formatDate(input) {
    const date = new Date(input);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}`;
}


async function setDocumentTag(username, password, serverAddress, documentTag) {

    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
    headers.append('Content-Type', 'application/json');

    const id = documentUploadedId;

    const url = serverAddress + "/j-lawyer-io/rest/v5/cases/documents/" + id + "/tags";

    // den Payload erstellen
    const payload = {
        name: documentTag
    };

    fetch(url, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(payload)
    }).then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    });
}

async function setDocumentTagsAndFolderForAttachments() {
    console.log("setDocumentTags aufgerufen");

    try {
        let result = await browser.storage.local.get(["username", "password", "serverAddress", "selectedTags"]);
        try {
            console.log("selectedTags im Speicher: ", result.selectedTags);
        } catch (error) {
            console.error("Fehler beim Lesen des Speichers oder keine Etiketten ausgewählt: ", error);
        }

        const headers = new Headers();
        const loginBase64Encoded = btoa(unescape(encodeURIComponent(result.username + ':' + result.password)));

        headers.append('Authorization', 'Basic ' + loginBase64Encoded);
        headers.append('Content-Type', 'application/json');

        // only if selectedTags is not empty
        if (result.selectedTags && result.selectedTags.length > 0) {
            for (let documentTag of result.selectedTags) {
                for (let documentId of documentIdsToTag) {
                    
                    console.log("Das Dokument mit der ID " + documentId + " wird mit dem Tag " + documentTag + " an " + result.serverAddress + " gesendet");
                    
                    const url = result.serverAddress + "/j-lawyer-io/rest/v5/cases/documents/" + documentId + "/tags";
                    const payload = { name: documentTag };

                    const response = await fetch(url, {
                        method: 'PUT',
                        headers: headers,
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        throw new Error(`Network response was not ok for document ID ${documentId}`);
                    }

                    
                }
            }
        } else {
            console.log("Keine Tags ausgewählt");
        }
        
    } catch (error) {
        console.error("Error in setDocumentTags:", error);
    }
    await browser.storage.local.remove("selectedTags");

    // set Folders for attachments
    try {
        let result = await browser.storage.local.get(["username", "password", "serverAddress"]);
        try {
            console.log("selectedCaseFolderID: ", selectedCaseFolderID);
        } catch (error) {
            console.error("Fehler beim Lesen des ausgewählten Ordners: ", error);
        }

        const headers = new Headers();
        const loginBase64Encoded = btoa(unescape(encodeURIComponent(result.username + ':' + result.password)));

        headers.append('Authorization', 'Basic ' + loginBase64Encoded);
        headers.append('Content-Type', 'application/json');

        
        if (selectedCaseFolderID && selectedCaseFolderID.length > 0) {
            for (let documentId of documentIdsToTag) {
                
                    
                const url = result.serverAddress + "/j-lawyer-io/rest/v1/cases/document/update";

                // den Payload erstellen
                const payload = {
                    id: documentId,
                    folderId: selectedCaseFolderID
                };

                const response = await fetch(url, {
                    method: 'PUT',
                    headers: headers,
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`Network response was not ok for document ID ${documentId}`);
                }
            }
        } else {
            console.log("Kein Ordner ausgewählt");
        }
        
    } catch (error) {
        console.error("Fehler in setDocumentTagsAndFolderForAttachments ", error);
    }


}

// set document folder for messages and attachments
async function updateDocumentFolder(username, password, serverAddress, selectedCaseFolderID) {
    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
    headers.append('Content-Type', 'application/json');

    const url = serverAddress + "/j-lawyer-io/rest/v1/cases/document/update";

    // den Payload erstellen
    const payload = {
        id: documentUploadedId,
        folderId: selectedCaseFolderID
    };

    fetch(url, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(payload)
    }).then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    });
}

// comment: https://stackoverflow.com/questions/21797299/convert-base64-string-to-arraybuffer
function uint8ArrayToBase64(uint8Array) {
    let binaryString = '';
    uint8Array.forEach(byte => {
        binaryString += String.fromCharCode(byte);
    });
    return btoa(binaryString);
}


async function addTagToMessage(message, tagName, tagColor) {
    // Alle vorhandenen Tags abrufen
    const existingTags = await browser.messages.listTags();

    // Überprüfen, ob der Tag bereits existiert
    let tag = existingTags.find(t => t.tag === tagName);

    // Wenn der Tag nicht existiert, wird er erstellt
    if (!tag) {
        tag = await browser.messages.createTag(tagName, tagName, tagColor);
    }

    // Tag wird der Nachricht hinzugefügt
    await browser.messages.update(message.id, { tags: [tag.key] });
}

// TODO: remove or refactor when alternative in API is available
function removeAttachmentsFromRFC2822(message) {
    // Extract the boundary from the Content-Type header
    const boundaryMatch = message.match(/boundary=("[^"]+"|'[^']+'|[^;\s]+)/);
    const boundary = boundaryMatch ? boundaryMatch[1].slice(1, -1) : null;
  
    if (!boundary) {
      throw new Error('Boundary not found in Content-Type header.');
    }
  
    // Split the message into parts using the boundary
    const parts = message.split(`--${boundary}`);
  
    // Iterate through parts and modify attachment bodies
    const modifiedParts = parts.map(part => {
      const lines = part.split('\r\n\r\n'); // Split header and body
      const header = lines[0];
  
      if (header.includes('Content-Disposition: attachment')) {
        // Replace the body of attachments
        return `${header}\r\n\r\nThis attachment has been removed\r\n\r\n`;
      } else {
        // Keep non-attachment parts unchanged
        return part;
      }
});
  
    // Join the modified parts back together
    const updatedMessage = modifiedParts.join(`--${boundary}`);
  
    return updatedMessage;
  }

// async function removeAttachmentsFromMessage(messageId) {
//     try {
//         // Liste der Anhänge abrufen
//         const attachments = await browser.messages.listAttachments(messageId);
        
//         // Alle Anhänge durchlaufen und partNames sammeln
//         const partNames = attachments.map(att => att.partName);
        
//         // Anhänge löschen und durch Platzhalter ersetzen
//         await browser.messages.deleteAttachments(messageId, partNames);
        
//         console.log("Anhänge wurden entfernt und durch Platzhalter ersetzt.");
//     } catch (error) {
//         console.error("Fehler beim Entfernen der Anhänge:", error);
//     }
// }



// Empfangen der Nachrichten vom Popup
browser.runtime.onMessage.addListener((message) => {
    if ((message.type === "fileNumber" || message.type === "case") && (message.source === "popup")) {
        console.log("Das gewählte Aktenzeichen: " + message.content);
        selectedCaseFolderID = message.selectedCaseFolderID;
    
        browser.storage.local.get(["username", "password", "serverAddress"]).then(async result => {
            const fileNumber = String(message.content);
    
            let cases = await getStoredCases();
            console.log("Die gespeicherten Fälle lauten: ", cases);
            
            if (!cases) {
                cases = await getCases(result.username, result.password, result.serverAddress);
            }
            
            
            const caseId = await findIdByFileNumber(cases, fileNumber);
            console.log("Die ID des gefundenen Aktenzeichens lautet: " + caseId);
    
            if (caseId) {
                sendEmailToServer(caseId, result.username, result.password, result.serverAddress);
                
                // TODO: Move to Trash - add option in options page
                
                /* try {
                    // Nachrichten-ID des gesendeten E-Mail-Headers abrufen
                    const messageId = sendInfo.messages[0].id;
        
                    // Das Konto und den Ordner der gesendeten Nachricht abrufen
                    const message = await browser.messages.get(messageId);
                    const accountId = message.folder.accountId;
        
                    // Den Papierkorb-Ordner des Kontos abrufen
                    const trashFolder = await browser.folders.getTrash(accountId);
                    
                    // Nachricht in den Papierkorb verschieben
                    await browser.messages.move([messageId], trashFolder);
                    console.log("Nachricht in den Papierkorb verschoben.");
                } catch (error) {
                    console.error("Fehler beim Verschieben der Nachricht in den Papierkorb:", error);
                } */
            } else {
                console.log('Keine übereinstimmende ID gefunden');
            }
        });
    }

    if ((message.type === "saveMessageOnly") && (message.source === "popup")) {
        console.log("Das eingegebene Aktenzeichen: " + message.content);
        selectedCaseFolderID = message.selectedCaseFolderID;
    
        browser.storage.local.get(["username", "password", "serverAddress"]).then(async result => {
            const fileNumber = String(message.content);
    
            let cases = await getStoredCases();
            
            if (!cases) {
                cases = await getCases(result.username, result.password, result.serverAddress);
            }
    
            const caseId = await findIdByFileNumber(cases, fileNumber);
    
            if (caseId) {
                await sendOnlyMessageToServer(caseId, result.username, result.password, result.serverAddress);
            } else {
                console.log('Keine übereinstimmende ID gefunden');
            }
        });
    }

    if ((message.type === "saveAttachments") && (message.source === "popup")) {
        console.log("Das eingegebene Aktenzeichen: " + message.content);
        selectedCaseFolderID = message.selectedCaseFolderID;
    
        browser.storage.local.get(["username", "password", "serverAddress", "selectedTags"]).then(async result => {
            const fileNumber = String(message.content);
    
            let cases = await getStoredCases();
            
            if (!cases) {
                cases = await getCases(result.username, result.password, result.serverAddress);
            }
    
            const caseId = await findIdByFileNumber(cases, fileNumber);
    
            if (caseId) {
                await sendAttachmentsToServer(caseId, result.username, result.password, result.serverAddress);
            } else {
                console.log('Keine übereinstimmende ID gefunden');
            }
        });
    }

    // Neue Message-Handler für Bildbearbeitung - Storage-basierte Kommunikation
    if (message.type === "overlay-ready") {
        console.log("Background: overlay-ready message received - using storage-based communication");
        return;
    }

    if (message.type === "load-image") {
        console.log("Background: load-image message received - using storage-based communication");
        return;
    }

    if (message.type === "image-cropped") {
        console.log("Background: image-cropped message received - using storage-based communication");
        return;
    }

    if (message.type === "skip-image") {
        console.log("Background: skip-image message received - using storage-based communication");
        return;
    }

    if (message.type === "finish-editing") {
        console.log("Background: finish-editing message received - using storage-based communication");
        return;
    }

    if (message.type === "cancel-editing") {
        console.log("Background: cancel-editing message received - using storage-based communication");
        return;
    }

    if (message.type === "show-finish-options") {
        console.log("Background: show-finish-options message received - using storage-based communication");
        return;
    }

    if ((message.type === "saveToCaseAfterSend") && (message.source === "popup_compose")) {
        extensionUsed = true; // Nachricht soll nur gespeichert werden, wenn Extension genutzt
        let documentsInSelectedCase = [];
    
        console.log("Aktenzeichen: " + message.content);
    
        selectedCaseFolderID = message.selectedCaseFolderID;
        currentSelectedCase = message.currentSelectedCase;

        (async () => {
            try {
                const loginData = await browser.storage.local.get(["username", "password", "serverAddress"]);
                const documents = await getFilesInCaseToDownload(currentSelectedCase.id, loginData.username, loginData.password, loginData.serverAddress);
                console.log("Empfangene Dateinamen für den neuen Fall:", documents);
    
                // Speichern der Dokumente und Aktualisieren des Menüs
                documentsInSelectedCase = documents;
                await browser.storage.local.set({ documentsInSelectedCase: documents });
                createMenuEntries(); // Menü mit den neuen Dokumenten aktualisieren
            } catch (error) {
                console.error("Fehler beim Laden der Dokumente für den ausgewählten Fall:", error);
            }
    
            // Aktualisieren oder Erstellen der caseIdToSaveToAfterSend im Storage
            const fileNumber = String(message.content);
            let cases = await getStoredCases();
    
            if (!cases) {
                cases = await getCases(loginData.username, loginData.password, loginData.serverAddress);
            }
    
            const caseIdToSaveToAfterSend = await findIdByFileNumber(cases, fileNumber);
            await browser.storage.local.set({ caseIdToSaveToAfterSend: caseIdToSaveToAfterSend });
            console.log("caseIdToSaveToAfterSend gesetzt auf: ", caseIdToSaveToAfterSend);
        })(); // Sofortige Ausführung der async-Funktion
    }
});



// Das Speichern von Nachrichten, die gesendet wurden
messenger.compose.onAfterSend.addListener(async (tab, sendInfo) => {

    if (extensionUsed == false) {
        console.log("jLawyer-Extension wurde nicht genutzt")
        return;
    }
    else {

        console.log("Nachricht SendInfo:", sendInfo);
        console.log("Nachricht wurde gesendet");

        lastMessageData = sendInfo;

        // Nachrichten-ID abrufen
        console.log("Nachrichten-Id:", sendInfo.messages[0].id);
        lastSentMessageId = sendInfo.messages[0].id;

        // speichert E-Mail nach dem Senden in der Akte
        await browser.storage.local.get(["caseIdToSaveToAfterSend", "selectedCaseFolderIDAfterSend", "username", "password", "serverAddress"]).then(result => {
            sendEmailToServerAfterSend(result.caseIdToSaveToAfterSend, result.selectedCaseFolderIDAfterSend, result.username, result.password, result.serverAddress);
        });
    }
});



async function createMenuEntries() {
    try {
        // Erst alle existierenden Menüeinträge löschen
        await browser.menus.removeAll();

        // Templates und Dokumente aus dem Storage holen
        const data = await browser.storage.local.get(["emailTemplates", "documentsInSelectedCase"]);
        const emailTemplates = data.emailTemplates || [];
        const documentsInSelectedCase = data.documentsInSelectedCase || [];

        // Menüeinträge für Vorlagen erstellen, falls vorhanden
        if (emailTemplates.length > 0) {
            try {
                await browser.menus.create({
                    id: "vorlagen-menu",
                    title: "Vorlagen",
                    contexts: ["compose_action"],
                    type: "normal"
                });
            } catch (e) {
                console.error("Fehler beim Erstellen des Vorlagen-Menüs:", e);
            }

            for (const template of emailTemplates) {
                try {
                    const displayName = template.name.replace(/\.xml$/, '');
                    await browser.menus.create({
                        id: `vorlage-${template.id}`,
                        parentId: "vorlagen-menu",
                        title: `${displayName} einfügen`,
                        contexts: ["compose_action"],
                        type: "normal"
                    });
                } catch (e) {
                    console.error("Fehler beim Erstellen eines Vorlagen-Menüeintrags:", e, template);
                }
            }
        } else {
            console.log("Keine Email-Templates gefunden");
        }

        // Dokumente nach Name sortieren (umgekehrt)
        documentsInSelectedCase.sort((a, b) => b.name.localeCompare(a.name));

        // Ordnerstruktur holen
        let folders = [];
        try {
            const { username, password, serverAddress } = await browser.storage.local.get(["username", "password", "serverAddress"]);
            const folderData = await getCaseFolders(currentSelectedCase?.id, username, password, serverAddress);
            folders = folderData ? buildFolderTree(folderData) : [];
        } catch (e) {
            console.log("Fehler beim Laden der Ordnerstruktur:", e);
        }

        // Dokumente nach Ordner gruppieren
        const docsByFolder = {};
        for (const doc of documentsInSelectedCase) {
            const folderId = doc.folderId || "root";
            if (!docsByFolder[folderId]) docsByFolder[folderId] = [];
            docsByFolder[folderId].push(doc);
        }

        // Icons für Dateitypen als Emoji-Workaround
        const fileTypeEmojis = {
            pdf: "📄",
            odt: "📝",
            ods: "📊",
            docx: "📃",
            jpg: "🖼️",
            jpeg: "🖼️",
            png: "🖼️",
            html: "🌐",
            eml: "✉️"
        };
        function getEmojiForFile(name) {
            const ext = name.split('.').pop().toLowerCase();
            return fileTypeEmojis[ext] || "📁";
        }

        // Hilfsfunktion: prüft, ob ein Ordner (rekursiv) Dokumente oder Unterordner mit Dokumenten enthält
        function folderHasDocsOrNonEmptyChildren(folder) {
            const docs = docsByFolder[folder.id] || [];
            if (docs.length > 0) return true;
            if (folder.children && Array.isArray(folder.children)) {
                return folder.children.some(child => child && folderHasDocsOrNonEmptyChildren(child));
            }
            return false;
        }

        // Menüeinträge für Dokumente/Ordner rekursiv erstellen (nur nicht-leere Ordner)
        async function createFolderMenu(folder, parentId) {
            if (!folderHasDocsOrNonEmptyChildren(folder)) return; // Leere Ordner überspringen

            const id = folder.id || "root";
            await browser.menus.create({
                id: `dokumente-folder-${id}`,
                parentId,
                title: folder.name || "Dokumente",
                contexts: ["compose_action"],
                type: "normal"
            });

            // Dateien in diesem Ordner (umgekehrt sortiert)
            const docs = (docsByFolder[id] || []).sort((a, b) => b.name.localeCompare(a.name));
            for (const doc of docs) {
                await browser.menus.create({
                    id: `dokument-${doc.id}`,
                    parentId: `dokumente-folder-${id}`,
                    title: `${getEmojiForFile(doc.name)} ${doc.name}`,
                    contexts: ["compose_action"],
                    type: "normal"
                });
            }

            // Unterordner (sortiert nach Name)
            if (folder.children && Array.isArray(folder.children)) {
                const sortedChildren = folder.children
                    .filter(child => child && folderHasDocsOrNonEmptyChildren(child))
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                for (const child of sortedChildren) {
                    await createFolderMenu(child, `dokumente-folder-${id}`);
                }
            }
        }

        // Hauptmenü für Dokumente
        if (documentsInSelectedCase.length > 0) {
            try {
                await browser.menus.create({
                    id: "dokumente-menu",
                    title: "Dokumente",
                    contexts: ["compose_action"],
                    type: "normal"
                });
            } catch (e) {
                console.error("Fehler beim Erstellen des Dokumente-Menüs:", e);
            }

            // Ordner oben, Dateien im Wurzelverzeichnis darunter
            if (folders && folders.id) {
                // 1. Alle direkten Unterordner des Wurzel-Ordners anzeigen (nicht nur die, die Dokumente enthalten)
                if (folders.children && Array.isArray(folders.children)) {
                    // Sortiere alle direkten Unterordner nach Name
                    const sortedFolders = folders.children
                        .filter(child => child && child.id && child.name)
                        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    for (const folder of sortedFolders) {
                        // Nur anzeigen, wenn der Ordner oder seine Unterordner Dokumente enthalten
                        if (folderHasDocsOrNonEmptyChildren(folder)) {
                            await createFolderMenu(folder, "dokumente-menu");
                        }
                    }
                }
                // 2. Dateien im Wurzelverzeichnis (umgekehrt sortiert)
                const rootFolderIds = [null, undefined, "", "root", folders.id];
                const rootDocs = documentsInSelectedCase.filter(
                    doc => rootFolderIds.includes(doc.folderId)
                ).sort((a, b) => b.name.localeCompare(a.name));
                for (const doc of rootDocs) {
                    await browser.menus.create({
                        id: `dokument-${doc.id}`,
                        parentId: "dokumente-menu",
                        title: `${getEmojiForFile(doc.name)} ${doc.name}`,
                        contexts: ["compose_action"],
                        type: "normal"
                    });
                }
            } else {
                // Fallback: alles unter "Dokumente"
                for (const doc of documentsInSelectedCase) {
                    await browser.menus.create({
                        id: `dokument-${doc.id}`,
                        parentId: "dokumente-menu",
                        title: `${getEmojiForFile(doc.name)} ${doc.name}`,
                        contexts: ["compose_action"],
                        type: "normal"
                    });
                }
            }
        } else {
            console.log("Keine Dokumente in documentsInSelectedCase gefunden.");
        }

        // Click-Handler nur einmal hinzufügen
        if (!isMenuClickListenerRegistered) {
            browser.menus.onClicked.addListener(async (info, tab) => {
                try {
                    if (info.menuItemId === "vorlagen-menu" || info.menuItemId === "dokumente-menu") {
                        return;
                    }

                    // Templates und Dokumente neu laden, um sicherzugehen, dass wir die aktuellen Daten haben
                    const currentData = await browser.storage.local.get(["emailTemplates", "documentsInSelectedCase"]);
                    const currentTemplates = currentData.emailTemplates || [];
                    const currentDocuments = currentData.documentsInSelectedCase || [];

                    const clickedTemplate = currentTemplates.find((template) => `vorlage-${template.id}` === info.menuItemId);
                    const clickedDocument = currentDocuments.find((document) => `dokument-${document.id}` === info.menuItemId);

                    if (clickedTemplate) {
                        const clickedTemplateNameEncoded = encodeURIComponent(clickedTemplate.name);
                        try {
                            const result = await browser.storage.local.get(["username", "password", "serverAddress", "selectedTags"]);
                            if (!currentSelectedCase) {
                                console.log("Keine Akte ausgewählt");
                                return;
                            }

                            const content = await getTemplateWithPlaceholders(
                                result.username,
                                result.password,
                                result.serverAddress,
                                clickedTemplateNameEncoded,
                                currentSelectedCase.id
                            );

                            if (content && content.body) {
                                insertTemplate(tab.id, content, content.mimeType);
                            } else {
                                console.error("Vorlage hat keinen gültigen Inhalt.");
                            }
                        } catch (error) {
                            console.error("Fehler beim Abrufen der Daten oder beim Einfügen der Vorlage: ", error);
                        }
                    } else if (clickedDocument) {
                        IdOfDocumentToAddToMail = clickedDocument.id;
                        console.log("Dokument-ID gespeichert:", IdOfDocumentToAddToMail);
                        const loginData = await browser.storage.local.get(["username", "password", "serverAddress"]);
                        let downloadedFile = await getFileByIdToDownload(IdOfDocumentToAddToMail, loginData.username, loginData.password, loginData.serverAddress);
                        console.log("Downloaded File: ", downloadedFile);
                        const fileData = {
                            base64content: downloadedFile.base64content,
                            fileName: clickedDocument.name
                        };
                        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
                        if (tabs.length > 0) {
                            const tabId = tabs[0].id;
                            await attachFileToComposeWindow(tabId, fileData);
                            IdOfDocumentToAddToMail = null;
                        }
                    } else {
                        console.log("Kein passender Menüeintrag gefunden für ID:", info.menuItemId);
                    }
                } catch (e) {
                    console.error("Fehler im Menü-Click-Handler:", e);
                }
            });

            isMenuClickListenerRegistered = true;
        }
    } catch (err) {
        console.error("Fehler in createMenuEntries:", err);
    }
}

// Hilfsfunktion: baue Ordnerbaum aus getCaseFolders-Response
function buildFolderTree(folderObj) {
    // folderObj: { id, name, parentId, children }
    if (!folderObj) return null;
    // children kann null oder Array sein
    const children = Array.isArray(folderObj.children)
        ? folderObj.children.filter(Boolean).map(buildFolderTree)
        : [];
    return { ...folderObj, children };
}



// Storage-Listener für Änderungen an den Templates
browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.emailTemplates) {
        createMenuEntries();
    }
});



  
function getTemplateWithPlaceholders(username, password, serverAddress, templateName, caseId) {
    const url = serverAddress + '/j-lawyer-io/rest/v6/templates/email/'+ templateName + '/' + caseId;
    //console.log("URL: " + url);
    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    headers.append('Content-Type', 'application/json');

    return fetch(url, {
        method: 'GET',
        headers: headers
    }).then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        // console.log(response.json)
        return response.json();
    });
}

function insertTemplate(tabId, content, mimetype) {
    browser.compose.getComposeDetails(tabId).then((details) => {
        let signature = "";
        const signatureSeparator = "-- ";
        
        // Signatur aus aktuellem Body extrahieren, falls vorhanden
        if (details.body) {
            const signatureIndex = details.body.indexOf(signatureSeparator);
            if (signatureIndex !== -1) {
                signature = details.body.slice(signatureIndex);
            }
        }

        let newBody = content.body.replace(/\s*{{CURSOR}}\s*/g, "");
        
        if (details.isPlainText) {
            // Compose-Fenster ist im Plaintext-Modus
            if (mimetype === "text/plain") {
                // Stellen Sie sicher, dass literale '\n' korrekt interpretiert werden
                newBody = newBody
                    .replace(/\\n/g, '\n')  // Ersetze \n durch echte Zeilenumbrüche
                    .replace(/\r\n/g, '\n') // Normalisiere Windows Zeilenumbrüche
                    .replace(/\r/g, '\n');  // Normalisiere alte Mac Zeilenumbrüche
                
                newBody += signature ? "\n\n" + signature : "";
            } else {
                // HTML zu Plaintext Konvertierung
                newBody = newBody
                    .replace(/<br\s*\/?>/gi, '\n')  // Ersetze <br> Tags
                    .replace(/<\/p>/gi, '\n\n')     // Füge Leerzeilen nach Paragraphen ein
                    .replace(/<[^>]+>/g, '')        // Entferne alle anderen HTML Tags
                    .trim();
                    
                newBody += signature ? "\n\n" + signature : "";
            }
        } else {
            // Compose-Fenster ist im HTML-Modus
            if (mimetype === "text/plain") {
                // Konvertiere Plaintext zu HTML
                newBody = newBody
                    .replace(/\\n/g, '\n')          // Erst literale \n ersetzen
                    .replace(/\n/g, '<br>')         // Dann Zeilenumbrüche zu <br> konvertieren
                    .replace(/  /g, '&nbsp;&nbsp;') // Behalte multiple Leerzeichen
                    .trim();
                    
                newBody += signature ? "<br><br>" + signature : "";
            } else {
                // HTML bleibt HTML
                newBody += signature ? "<br><br>" + signature : "";
            }
        }

        return browser.compose.setComposeDetails(tabId, {
            subject: content.subject,
            body: newBody
        });
    }).catch(error => {
        console.error("Error inserting template:", error);
    });
}



async function attachFileToComposeWindow(tabId, fileData) {
    // Extrahiere den Base64-Inhalt und den Dateinamen aus den übergebenen Daten
    const base64Content = fileData.base64content;
    const fileName = fileData.fileName;

    // Base64-Inhalt in ein Blob konvertieren
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length).fill().map((_, i) => byteCharacters.charCodeAt(i));
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray]);

    // Blob in eine Datei umwandeln
    const file = new File([blob], fileName, { type: "application/octet-stream" });

    // Anhang hinzufügen
    await browser.compose.addAttachment(tabId, { file: file, name: fileName });
    console.log(`Datei ${fileName} wurde erfolgreich angehängt.`);
}

async function getCaseFolders(caseId, username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v3/cases/' + caseId + '/folders';
  
    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
    headers.append('Content-Type', 'application/json');
    return fetch(url, {
        method: 'GET',
        headers: headers
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        console.log("Folders des Case " + caseId + " heruntergeladen: ", data);
        return data;
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


/**
 * Extrahiert Base64-kodierten Anhang-Inhalt aus der Raw-E-Mail-Nachricht
 * @param {number} messageId - ID der E-Mail-Nachricht
 * @param {Object} mimePart - MIME-Part Objekt mit Anhang-Informationen
 * @param {string} partPath - Pfad zum MIME-Part (z.B. "1.2")
 * @returns {string|null} Base64-kodierte Anhang-Daten oder null bei Fehler
 */
async function extractAttachmentFromRawMessage(messageId, mimePart, partPath) {
    try {
        console.log(`Starte Raw-Message Extraktion für Part: ${partPath}, Name: ${mimePart.name || 'unbekannt'}`);
        
        // Raw-Message holen
        const rawMessage = await browser.messages.getRaw(messageId, { decrypt: true });
        if (!rawMessage) {
            console.warn(`Keine Raw-Message erhalten für messageId: ${messageId}`);
            return null;
        }
        
        console.log(`Raw-Message erhalten: ${rawMessage.length} Zeichen`);
        
        // MIME-Grenzen finden
        const boundaryMatch = rawMessage.match(/boundary=["']?([^"';\s]+)["']?/i);
        if (!boundaryMatch) {
            console.warn(`Keine MIME-Boundary in Raw-Message gefunden`);
            return await extractSinglePartAttachment(rawMessage, mimePart);
        }
        
        const boundary = boundaryMatch[1];
        console.log(`MIME-Boundary gefunden: ${boundary}`);
        
        // MIME-Parts aufteilen
        const parts = rawMessage.split(`--${boundary}`);
        console.log(`${parts.length} MIME-Parts gefunden`);
        
        // Ziel-Part suchen
        let targetPart = null;
        
        // Strategie 1: Nach partPath suchen (falls verfügbar)
        if (partPath && partPath !== '1') {
            console.log(`Suche nach partPath: ${partPath}`);
            // Hier würde eine komplexere Logik für verschachtelte MIME-Parts stehen
            // Vereinfacht: nehme den Part basierend auf der Position
            const pathParts = partPath.split('.');
            const partIndex = parseInt(pathParts[pathParts.length - 1]) - 1;
            if (partIndex < parts.length && partIndex >= 0) {
                targetPart = parts[partIndex + 1]; // +1 wegen Offset durch Boundary-Split
                console.log(`Part nach partPath gefunden: Index ${partIndex}`);
            }
        }
        
        // Strategie 2: Nach Content-Disposition oder Dateinamen suchen
        if (!targetPart && mimePart.name) {
            console.log(`Suche nach Dateinamen: ${mimePart.name}`);
            for (let i = 1; i < parts.length - 1; i++) { // Erste und letzte sind leer/Epilog
                const part = parts[i];
                if (part.includes(`filename="${mimePart.name}"`) || 
                    part.includes(`filename=${mimePart.name}`) ||
                    part.includes(`name="${mimePart.name}"`) ||
                    part.includes(`name=${mimePart.name}`)) {
                    targetPart = part;
                    console.log(`Part nach Dateinamen gefunden: Index ${i}`);
                    break;
                }
            }
        }
        
        // Strategie 3: Nach Content-Type suchen
        if (!targetPart && mimePart.contentType) {
            console.log(`Suche nach Content-Type: ${mimePart.contentType}`);
            for (let i = 1; i < parts.length - 1; i++) {
                const part = parts[i];
                if (part.includes(mimePart.contentType)) {
                    // Prüfe, ob es ein Attachment ist (nicht der Haupt-Body)
                    if (part.includes('Content-Disposition:') && 
                        (part.includes('attachment') || part.includes('filename'))) {
                        targetPart = part;
                        console.log(`Part nach Content-Type gefunden: Index ${i}`);
                        break;
                    }
                }
            }
        }
        
        if (!targetPart) {
            console.warn(`Kein passender MIME-Part gefunden`);
            return null;
        }
        
        console.log(`Ziel-Part gefunden, analysiere Inhalt...`);
        
        // Base64-kodierten Inhalt extrahieren
        return extractBase64FromMimePart(targetPart);
        
    } catch (error) {
        console.error(`Fehler bei Raw-Message Extraktion:`, error);
        return null;
    }
}

/**
 * Extrahiert Base64-Daten aus einem einzelnen MIME-Part (für einfache E-Mails ohne Multipart)
 */
async function extractSinglePartAttachment(rawMessage, mimePart) {
    try {
        console.log(`Versuche Single-Part Extraktion für: ${mimePart.name || 'unbekannt'}`);
        
        // Prüfe ob die gesamte Message base64-kodiert ist
        if (rawMessage.includes('Content-Transfer-Encoding: base64')) {
            const lines = rawMessage.split('\n');
            let inBase64Section = false;
            let base64Content = '';
            
            for (const line of lines) {
                if (line.trim() === '' && !inBase64Section) {
                    inBase64Section = true; // Leere Zeile nach Headers
                    continue;
                }
                
                if (inBase64Section) {
                    // Base64-Zeile (normalerweise nur A-Z, a-z, 0-9, +, /, =)
                    if (/^[A-Za-z0-9+/=\s]*$/.test(line.trim()) && line.trim().length > 0) {
                        base64Content += line.trim();
                    }
                }
            }
            
            if (base64Content) {
                console.log(`Single-Part Base64-Inhalt extrahiert: ${base64Content.length} Zeichen`);
                return base64Content;
            }
        }
        
        return null;
    } catch (error) {
        console.error(`Fehler bei Single-Part Extraktion:`, error);
        return null;
    }
}

/**
 * Extrahiert Base64-kodierten Inhalt aus einem MIME-Part
 */
function extractBase64FromMimePart(mimePart) {
    try {
        const lines = mimePart.split('\n');
        let inContentSection = false;
        let base64Content = '';
        let encoding = 'base64'; // Standard-Annahme
        
        // Headers analysieren
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (trimmedLine.toLowerCase().includes('content-transfer-encoding:')) {
                const encodingMatch = trimmedLine.match(/content-transfer-encoding:\s*(.+)/i);
                if (encodingMatch) {
                    encoding = encodingMatch[1].trim().toLowerCase();
                    console.log(`Content-Transfer-Encoding gefunden: ${encoding}`);
                }
            }
            
            // Leere Zeile markiert Ende der Headers
            if (trimmedLine === '' && !inContentSection) {
                inContentSection = true;
                continue;
            }
            
            // Content sammeln
            if (inContentSection && trimmedLine.length > 0) {
                if (encoding === 'base64') {
                    // Nur gültige Base64-Zeichen
                    if (/^[A-Za-z0-9+/=]*$/.test(trimmedLine)) {
                        base64Content += trimmedLine;
                    }
                } else if (encoding === 'quoted-printable') {
                    // Quoted-Printable zu Base64 konvertieren
                    const decoded = decodeQuotedPrintable(trimmedLine);
                    base64Content += btoa(decoded);
                } else {
                    // Plain text oder andere Kodierung
                    base64Content += btoa(trimmedLine);
                }
            }
        }
        
        if (base64Content) {
            console.log(`Base64-Inhalt aus MIME-Part extrahiert: ${base64Content.length} Zeichen (Encoding: ${encoding})`);
            return base64Content;
        }
        
        console.warn(`Kein Base64-Inhalt in MIME-Part gefunden`);
        return null;
        
    } catch (error) {
        console.error(`Fehler bei Base64-Extraktion aus MIME-Part:`, error);
        return null;
    }
}

/**
 * Dekodiert Quoted-Printable Text
 */
function decodeQuotedPrintable(str) {
    return str.replace(/=([0-9A-F]{2})/g, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
    }).replace(/=\r?\n/g, '');
}

async function sendAllMimePartsToServer(caseId, username, password, serverAddress, alreadyProcessedFiles = []) {
    console.log("Case ID für MIME-Parts: " + caseId);
    console.log("Bereits verarbeitete Dateien:", alreadyProcessedFiles.length);
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/document/create';

    // Nachrichteninhalt abrufen
    const messageData = await getDisplayedMessageFromActiveTab();
    console.log("Message Id für MIME-Parts: " + messageData.id);

    // Vollständige MIME-Struktur abrufen
    let fullMessage;
    try {
        fullMessage = await browser.messages.getFull(messageData.id, { decrypt: true });
        console.log("MIME-Struktur erfolgreich abgerufen");
    } catch (error) {
        console.error("Fehler beim Abrufen der MIME-Struktur:", error);
        browser.runtime.sendMessage({ type: "error", content: "Fehler beim Analysieren der E-Mail-Struktur" });
        return;
    }

    // Datum und Zeit einmal generieren
    let date = new Date(messageData.date);
    let dateString = formatDate(date);

    // Dateinamen-Liste abrufen
    let fileNamesArray = [];
    try {
        fileNamesArray = await getFilesInCase(caseId, username, password, serverAddress);
        console.log("Dateinamen für MIME-Parts abgerufen:", fileNamesArray.length, "Dateien");
    } catch (error) {
        console.error("Fehler beim Abrufen der Dateinamen für MIME-Parts:", error);
        browser.runtime.sendMessage({ type: "error", content: "Fehler beim Abrufen der vorhandenen Dateien" });
        return;
    }

    // Tracking für Verarbeitung
    const processedFiles = [];
    const errors = [];
    let mimePartCounter = 0;

    // Headers einmal erstellen
    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    headers.append('Content-Type', 'application/json');

    // Rekursive Funktion zum Durchsuchen aller MIME-Parts
    async function processMimePart(part, partPath = '') {
        if (!part) return;

        // Prüfen ob es sich um einen echten Attachment handelt
        const hasAttachmentDisposition = part.headers && part.headers['content-disposition'] && 
                                        part.headers['content-disposition'].some(disp => disp.toLowerCase().includes('attachment'));
        
        const hasInlineDisposition = part.headers && part.headers['content-disposition'] && 
                                   part.headers['content-disposition'].some(disp => disp.toLowerCase().includes('inline'));
        
        // Prüfen auf Content-Disposition mit Dateinamen (auch ungewöhnliche Formate)
        const hasContentDispositionWithFilename = part.headers && part.headers['content-disposition'] && 
                                                 part.headers['content-disposition'].some(disp => 
                                                     disp.toLowerCase().includes('filename='));
        
        // Haupttext der E-Mail erkennen und ausschließen
        const contentType = part.contentType || '';
        const isTextContent = contentType.includes('text/plain') || contentType.includes('text/html');
        const hasFileName = part.name && part.name.trim() !== '';
        
        // Der Haupttext der E-Mail ist typischerweise:
        // - text/plain oder text/html
        // - ohne Dateinamen
        // - ohne explizite "attachment" Disposition
        // - ohne Content-Disposition mit filename
        // - oft bei partPath '0' oder '1' (erste Parts der E-Mail)
        const isMainEmailContent = isTextContent && 
                                 !hasFileName && 
                                 !hasAttachmentDisposition &&
                                 !hasContentDispositionWithFilename &&
                                 (partPath === '' || partPath === '0' || partPath === '1' || 
                                  partPath.split('.').length <= 2);

        // Nur echte Attachments verarbeiten:
        // - Muss einen Dateinamen haben ODER explizit als "attachment" markiert sein
        // - ODER Content-Disposition mit filename (auch ungewöhnliche Formate wie "filename.pdf; filename=...")
        // - ODER inline Content mit Dateinamen (z.B. eingebettete Bilder)
        // - ODER PDFs und andere Binärdateien (auch ohne explizite Markierung)
        const isBinaryContent = contentType.includes('application/') || contentType.includes('image/') || 
                               contentType.includes('audio/') || contentType.includes('video/');
        
        const isRealAttachment = hasFileName || hasAttachmentDisposition || 
                                hasContentDispositionWithFilename ||
                                (hasInlineDisposition && hasFileName) ||
                                (isBinaryContent && !isTextContent);

        // Debug-Ausgabe für übersprungene Parts
        if (!isRealAttachment || isMainEmailContent) {
            const contentDisposition = part.headers && part.headers['content-disposition'] ? 
                                      part.headers['content-disposition'].join('; ') : 'keine';
            console.log(`MIME-Part übersprungen - PartPath: ${partPath}, Name: ${part.name || 'ohne'}, ContentType: ${contentType}, Content-Disposition: ${contentDisposition}, Grund: ${
                isMainEmailContent ? 'Haupttext der E-Mail' : 'kein echter Anhang'
            }`);
        } else {
            // Debug-Ausgabe für verarbeitete Parts
            const contentDisposition = part.headers && part.headers['content-disposition'] ? 
                                      part.headers['content-disposition'].join('; ') : 'keine';
            console.log(`MIME-Part wird verarbeitet - PartPath: ${partPath}, Name: ${part.name || 'ohne'}, ContentType: ${contentType}, Content-Disposition: ${contentDisposition}`);
        }

        // Attachments verarbeiten (aber NICHT den Haupttext der E-Mail)
        if (isRealAttachment && !isMainEmailContent) {
            // Prüfen ob dieser MIME-Part bereits als regulärer Anhang verarbeitet wurde
            // Dies passiert wenn part.partName existiert und über listAttachments() gefunden wurde
            if (part.partName && alreadyProcessedFiles.length > 0) {
                // Generiere temporären Dateinamen um zu prüfen ob bereits verarbeitet
                let tempAttachmentName = part.name;
                if (!tempAttachmentName && part.headers && part.headers['content-disposition']) {
                    // Versuche Dateinamen aus Content-Disposition zu extrahieren
                    for (let disp of part.headers['content-disposition']) {
                        let filenameMatch = disp.match(/filename=["']?([^"';]+)["']?/i);
                        if (filenameMatch) {
                            tempAttachmentName = filenameMatch[1];
                            break;
                        }
                    }
                }
                
                if (tempAttachmentName) {
                    // Prüfe ob ein Anhang mit diesem Namen bereits verarbeitet wurde
                    const alreadyProcessed = alreadyProcessedFiles.some(processedFile => {
                        // Entferne Datum-Prefix und vergleiche Basis-Namen
                        const baseName = processedFile.replace(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}_/, '').replace(/_\d+(\.[^.]+)?$/, '$1');
                        return baseName === tempAttachmentName || processedFile.includes(tempAttachmentName);
                    });
                    
                    if (alreadyProcessed) {
                        console.log(`MIME-Part übersprungen - bereits als regulärer Anhang verarbeitet: ${tempAttachmentName} (partName: ${part.partName})`);
                        return; // Diesen Part überspringen
                    }
                }
            }
            
            // Prüfen ob part.body existiert - wenn nicht, versuche trotzdem zu verarbeiten
            if (!part.body) {
                console.warn(`MIME-Part hat keinen Body, versuche trotzdem zu verarbeiten: PartPath ${partPath}, Name: ${part.name || 'ohne'}`);
            }
            mimePartCounter++;
            const partName = part.partName || `${partPath}.${mimePartCounter}`;
            console.log(`Verarbeite MIME-Part ${mimePartCounter}: ${part.name} (${partName})`);

            try {
                // Robuste Anhang-Extraktion: Mehrere Methoden versuchen
                let emailContentBase64 = null;
                
                // Methode 1: Standard WebExtension API (für normale Attachments)
                if (part.partName) {
                    try {
                        console.log(`Versuche Standard-API für partName: ${part.partName}`);
                        const attachmentData = await browser.messages.getAttachmentFile(messageData.id, part.partName);
                        if (attachmentData) {
                            const arrayBuffer = await attachmentData.arrayBuffer();
                            const uint8Array = new Uint8Array(arrayBuffer);
                            emailContentBase64 = uint8ArrayToBase64(uint8Array);
                            console.log(`Standard-API erfolgreich: ${emailContentBase64.length} Zeichen Base64`);
                        }
                    } catch (apiError) {
                        console.warn(`Standard-API fehlgeschlagen für ${part.partName}: ${apiError.message}`);
                    }
                }
                
                // Methode 2: Extraktion aus Raw-Message (für problematische Attachments)
                if (!emailContentBase64) {
                    console.log(`Versuche Raw-Message Extraktion für MIME-Part ${mimePartCounter}`);
                    try {
                        emailContentBase64 = await extractAttachmentFromRawMessage(messageData.id, part, partPath);
                        if (emailContentBase64) {
                            console.log(`Raw-Message Extraktion erfolgreich: ${emailContentBase64.length} Zeichen Base64`);
                        }
                    } catch (rawError) {
                        console.warn(`Raw-Message Extraktion fehlgeschlagen: ${rawError.message}`);
                    }
                }
                
                // Methode 3: part.body als Fallback (für inline/text Attachments)
                if (!emailContentBase64 && part.body && part.body.trim() !== '') {
                    console.log(`Verwende part.body als Fallback für MIME-Part ${mimePartCounter}`);
                    try {
                        emailContentBase64 = btoa(unescape(encodeURIComponent(part.body)));
                        console.log(`part.body erfolgreich kodiert: ${emailContentBase64.length} Zeichen Base64`);
                    } catch (bodyError) {
                        console.warn(`part.body Kodierung fehlgeschlagen: ${bodyError.message}`);
                    }
                }
                
                // Letzter Fallback: Informativer Platzhalter
                if (!emailContentBase64) {
                    console.warn(`Alle Extraktionsmethoden fehlgeschlagen für MIME-Part ${mimePartCounter} - erstelle Platzhalter`);
                    const attachmentInfo = `Anhang erkannt aber Inhalt nicht verfügbar

Dateiname: ${part.name || 'unbekannt'}
Content-Type: ${part.contentType || 'unbekannt'}
Content-Disposition: ${part.headers?.['content-disposition']?.join('; ') || 'keine'}
PartName: ${part.partName || 'unbekannt'}
PartPath: ${partPath}

Versuchte Extraktionsmethoden:
- Standard WebExtension API: ${part.partName ? 'versucht' : 'nicht verfügbar'}
- Raw-Message Parsing: versucht
- Part Body: ${part.body ? 'versucht' : 'nicht verfügbar'}

Dies ist ein Platzhalter für einen erkannten Anhang, dessen Inhalt 
nicht über verfügbare Methoden extrahiert werden konnte.`;
                    
                    emailContentBase64 = btoa(unescape(encodeURIComponent(attachmentInfo)));
                    console.log(`Informativer Platzhalter für MIME-Part ${mimePartCounter} erstellt`);
                }

                // Dateinamen generieren falls keiner vorhanden
                let attachmentName = part.name;
                if (!attachmentName) {
                    // Versuche Dateinamen aus Content-Disposition zu extrahieren
                    if (part.headers && part.headers['content-disposition']) {
                        for (let disp of part.headers['content-disposition']) {
                            console.log(`Analysiere Content-Disposition: "${disp}"`);
                            
                            // Standard filename= Pattern
                            let filenameMatch = disp.match(/filename=["']?([^"';]+)["']?/i);
                            if (filenameMatch) {
                                attachmentName = filenameMatch[1];
                                console.log(`Dateiname aus filename= extrahiert: ${attachmentName}`);
                                break;
                            }
                            
                            // Alternative: Dateiname am Anfang der Content-Disposition
                            // Für Fälle wie "LVM_Unternehmenssignatur.pdf; filename=..."
                            filenameMatch = disp.match(/^([^;]+\.[a-zA-Z0-9]+)/);
                            if (filenameMatch && !filenameMatch[1].toLowerCase().includes('attachment') && !filenameMatch[1].toLowerCase().includes('inline')) {
                                attachmentName = filenameMatch[1].trim();
                                console.log(`Dateiname vom Anfang der Content-Disposition extrahiert: ${attachmentName}`);
                                break;
                            }
                        }
                    }
                }
                
                if (!attachmentName) {
                    // Fallback-Namen generieren basierend auf Content-Type
                    const contentType = part.contentType || 'unknown';
                    if (contentType.includes('text/plain')) {
                        attachmentName = 'inline_text.txt';
                    } else if (contentType.includes('text/html')) {
                        attachmentName = 'inline_content.html';
                    } else if (contentType.includes('image/')) {
                        const ext = contentType.split('/')[1] || 'img';
                        attachmentName = `inline_image.${ext}`;
                    } else {
                        attachmentName = `inline_attachment_${mimePartCounter}`;
                    }
                    console.log(`Generierter Dateiname für unbenannten Part: ${attachmentName}`);
                }

                // Eindeutigen Dateinamen erstellen
                let fileName = dateString + "_" + attachmentName;
                fileName = fileName.replace(/[\/\\:*?"<>|@]/g, '_');

                // Bei Duplikaten Counter hinzufügen (inkl. bereits verarbeitete Dateien)
                let finalFileName = fileName;
                let duplicateCounter = 1;
                while (fileNamesArray.includes(finalFileName) || 
                       processedFiles.includes(finalFileName) || 
                       alreadyProcessedFiles.includes(finalFileName)) {
                    const nameParts = fileName.split('.');
                    if (nameParts.length > 1) {
                        const extension = nameParts.pop();
                        const baseName = nameParts.join('.');
                        finalFileName = `${baseName}_${duplicateCounter}.${extension}`;
                    } else {
                        finalFileName = `${fileName}_${duplicateCounter}`;
                    }
                    duplicateCounter++;
                }

                if (finalFileName !== fileName) {
                    console.log(`MIME-Part Dateiname geändert von "${fileName}" zu "${finalFileName}" wegen Duplikat`);
                }

                console.log(`CasefolderID für MIME-Part "${finalFileName}": ${selectedCaseFolderID}`);

                // Payload erstellen
                const payload = {
                    base64content: emailContentBase64,
                    caseId: caseId,
                    fileName: finalFileName,
                    folderId: selectedCaseFolderID,
                    id: "",
                    version: 0
                };

                console.log(`Beginne Upload für MIME-Part "${finalFileName}" mit ${emailContentBase64.length} Zeichen Base64-Content`);

                // Upload versuchen
                const response = await fetch(url, {
                    method: 'PUT',
                    headers: headers,
                    body: JSON.stringify(payload)
                });

                console.log(`Upload-Response Status für MIME-Part "${finalFileName}": ${response.status} ${response.statusText}`);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`MIME-Part Upload fehlgeschlagen für "${finalFileName}": ${response.status} - ${errorText}`);
                    throw new Error(`MIME-Part Upload fehlgeschlagen: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                console.log(`MIME-Part Dokument ID für "${finalFileName}": ${data.id}`);

                // Erfolg vermerken
                documentIdsToTag.push(data.id);
                processedFiles.push(finalFileName);

            } catch (error) {
                console.error(`Fehler beim Verarbeiten von MIME-Part "${attachmentName || 'unbekannt'}":`, error);
                errors.push({
                    fileName: attachmentName || 'unbekannt',
                    error: error.message
                });
            }
        }

        // Rekursiv durch Sub-Parts gehen
        if (part.parts && Array.isArray(part.parts)) {
            for (let i = 0; i < part.parts.length; i++) {
                await processMimePart(part.parts[i], partPath ? `${partPath}.${i}` : `${i}`);
            }
        }
    }

    // MIME-Parts verarbeiten
    await processMimePart(fullMessage, '0');

    // Ergebnis-Summary
    console.log(`MIME-Parts Verarbeitung abgeschlossen: ${processedFiles.length} Parts erfolgreich`);
    
    if (errors.length > 0) {
        console.error("Fehler bei folgenden MIME-Parts:", errors);
        const errorMessage = `${errors.length} MIME-Parts konnten nicht hochgeladen werden: ${errors.map(e => e.fileName).join(', ')}`;
        browser.runtime.sendMessage({ type: "error", content: errorMessage });
    }

    // Success-Message senden wenn MIME-Parts erfolgreich waren
    if (processedFiles.length > 0) {
        browser.runtime.sendMessage({ type: "success", content: `${processedFiles.length} zusätzliche MIME-Part(s) erfolgreich hochgeladen` });
        
        // Tags und Ordner setzen
        await setDocumentTagsAndFolderForAttachments();
    }

    // Logging mit allen verarbeiteten MIME-Parts
    await logActivity("sendAllMimePartsToServer", { 
        caseId, 
        processedFiles: processedFiles,
        totalMimeParts: mimePartCounter,
        successCount: processedFiles.length,
        errorCount: errors.length
    });
}