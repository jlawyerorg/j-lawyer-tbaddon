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
            folderId: "",
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

            await updateDocumentFolder(username, password, serverAddress);
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
            folderId: "",
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

            await updateDocumentFolder(username, password, serverAddress);
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
    console.log("Attachments: " + attachments);

    // Überprüfen, ob Attachments vorhanden sind
    if (attachments.length === 0) {
        console.log("Keine Attachments in der Nachricht vorhanden.");
        browser.runtime.sendMessage({ type: "error", content: "Keine Attachments in der Nachricht vorhanden." });
        return;
    }

    for (let att of attachments) {
        let file = await browser.messages.getAttachmentFile(
            messageData.id,
            att.partName
        );
        let content = await file.text();
        console.log("ContentType: " + att.contentType);

        // Der Inhalt der Message wird zu Base64 codiert
        let buffer = await file.arrayBuffer();
        let uint8Array = new Uint8Array(buffer);
        const emailContentBase64 = uint8ArrayToBase64(uint8Array);

        // get date and time from message header
        let date = new Date(messageData.date);
        let dateString = formatDate(date);
        console.log("DateString: " + dateString);

        // Dateinamen erstellen
        let fileName = dateString + "_" + att.name;
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
            continue;
        } 

        console.log("Die CasefolderID für die Attachments lautet: " + selectedCaseFolderID + " und die Datei heißt: " + fileName);

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
                throw new Error('Datei existiert ggfs. schon');
            }
            const data = await response.json();
            console.log("Dokument ID: " + data.id);

            // add data.id to array documentIdsToTag
            documentIdsToTag.push(data.id);
           
            browser.runtime.sendMessage({ type: "success" });
            
        } catch (error) {
            console.log('Error:', error);
            browser.runtime.sendMessage({ type: "error", content: error.message });
        }
    }
    // set document tags and folder
    setDocumentTagsAndFolderForAttachments();
    logActivity("sendAttachmentsToServer", { caseId, fileName });
}


async function sendEmailToServerAfterSend(caseIdToSaveToAfterSend, username, password, serverAddress) {
    console.log("Es wird versucht, die Email in der Akte zu speichern");

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
        folderId: "",
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

        updateDocumentFolder(username, password, serverAddress);

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





// function getCases(username, password, serverAddress) {
//     const url = serverAddress + '/j-lawyer-io/rest/v1/cases/list';

//     const headers = new Headers();
//     const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
//     headers.append('Authorization', 'Basic ' + loginBase64Encoded);
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
async function updateDocumentFolder(username, password, serverAddress) {
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
        await browser.storage.local.get(["caseIdToSaveToAfterSend", "username", "password", "serverAddress"]).then(result => {
            sendEmailToServerAfterSend(result.caseIdToSaveToAfterSend, result.username, result.password, result.serverAddress);
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