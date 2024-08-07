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

    // Das Datum ermitteln, um es dem Dateinamen voranzustellen
    //const today = getCurrentDateFormatted();

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

            browser.runtime.sendMessage({ type: "success" });

            // Der Nachricht wird der Tag "veraktet" hinzugefügt
            addTagToMessage(messageData, 'veraktet', '#000080');

            browser.storage.local.get(["username", "password", "serverAddress", "selectedTags"]).then(result => {
                // Überprüfen, ob selectedTags nicht leer ist
                if (result.selectedTags && result.selectedTags.length > 0) {
                    for (let documentTag of result.selectedTags) {
                        setDocumentTag(result.username, result.password, result.serverAddress, documentTag); // 
                    }
                }
            });
            browser.storage.local.remove("selectedTags");
            browser.storage.local.get("selectedTags").then(result => {
                console.log("selectedTags: " + result.selectedTags);
            }
            );

        }).catch(error => {
            console.log('Error:', error);
            browser.runtime.sendMessage({ type: "error", content: error.messageData });
        });
    }
}

async function sendOnlyMessageToServer(caseId, username, password, serverAddress) {
    console.log("Case ID: " + caseId);
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/document/create';

    const messageData = await getDisplayedMessageFromActiveTab();
    console.log("Message Id: " + messageData.id);

   
    let rawMessage = await messenger.messages.getRaw(messageData.id, { decrypt: true });

    // let message = rawMessage.message;

    message = removeAttachmentsFromRFC2822(rawMessage);

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

            browser.runtime.sendMessage({ type: "success" });

            // Der Nachricht wird der Tag "veraktet" hinzugefügt
            addTagToMessage(messageData, 'veraktet', '#000080');

            browser.storage.local.get(["username", "password", "serverAddress", "selectedTags"]).then(result => {
                // Überprüfen, ob documentTags nicht leer ist
                if (result.selectedTags && result.selectedTags.length > 0) {
                    for (let documentTag of result.selectedTags) {
                        setDocumentTag(result.username, result.password, result.serverAddress, documentTag); // 
                    }
                }
            });
            browser.storage.local.remove("selectedTags");
            browser.storage.local.get("selectedTags").then(result => {
                console.log("selectedTags: " + result.selectedTags);
            }
            );

        }).catch(error => {
            console.log('Error:', error);
            browser.runtime.sendMessage({ type: "error", content: error.messageData });
        });
    }
}


async function sendAttachmentsToServer(caseId, username, password, serverAddress) {
    console.log("Case ID: " + caseId);
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/document/create';

    // Nachrichteninhalt abrufen
    const messageData = await getDisplayedMessageFromActiveTab();
    console.log("Message Id: " + messageData.id);

    // Attachments holen
    let attachments = await browser.messages.listAttachments(messageData.id);
    console.log("Attachments: " + attachments)
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





function getCases(username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/list';

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
        return response.json();
    });
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


function findIdByFileNumber(data, fileNumber) {
    for (let item of data) {
        if (item.fileNumber === fileNumber) {
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



// function getCurrentDateFormatted() {
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



// Empfangen der Nachrichten vom Popup
browser.runtime.onMessage.addListener(async (message) => {
    if ((message.type === "fileNumber" || message.type === "case") && (message.source === "popup")) {
        console.log("Das gewählte Aktenzeichen: " + message.content);
        selectedCaseFolderID = message.selectedCaseFolderID;

        browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
            const fileNumber = String(message.content);

            getCases(result.username, result.password, result.serverAddress).then(data => {
                const caseId = findIdByFileNumber(data, fileNumber);

                if (caseId) {
                    sendEmailToServer(caseId, result.username, result.password, result.serverAddress);
                } else {
                    console.log('Keine übereinstimmende ID gefunden');
                }
            });
        });
    }

    if ((message.type === "saveMessageOnly") && (message.source === "popup"))  {
        console.log("Das eingegebene Aktenzeichen: " + message.content);
        selectedCaseFolderID = message.selectedCaseFolderID;

        browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
            const fileNumber = String(message.content);

            getCases(result.username, result.password, result.serverAddress).then(data => {
                const caseId = findIdByFileNumber(data, fileNumber);

                if (caseId) {
                    sendOnlyMessageToServer(caseId, result.username, result.password, result.serverAddress);
                } else {
                    console.log('Keine übereinstimmende ID gefunden');
                }
            });
        });
    }

    if ((message.type === "saveAttachments") && (message.source === "popup"))  {
        console.log("Das eingegebene Aktenzeichen: " + message.content);
        selectedCaseFolderID = message.selectedCaseFolderID;

        browser.storage.local.get(["username", "password", "serverAddress", "selectedTags"]).then(result => {
            const fileNumber = String(message.content);

            getCases(result.username, result.password, result.serverAddress).then(data => {
                const caseId = findIdByFileNumber(data, fileNumber);

                if (caseId) {
                    sendAttachmentsToServer(caseId, result.username, result.password, result.serverAddress);
                } else {
                    console.log('Keine übereinstimmende ID gefunden');
                }
            });
            
        });   
    }

    if ((message.type === "saveToCaseAfterSend") && (message.source === "popup_compose")) {

        extensionUsed = true; // Nachricht soll nur gespeichert werden, wenn Extension genutzt

        console.log("Aktenzeichen: " + message.content);
        selectedCaseFolderID = message.selectedCaseFolderID;

        browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
            const fileNumber = String(message.content);

            getCases(result.username, result.password, result.serverAddress).then(data => {
                const caseIdToSaveToAfterSend = findIdByFileNumber(data, fileNumber);
                browser.storage.local.set({ caseIdToSaveToAfterSend: caseIdToSaveToAfterSend });
                console.log("caseIdToSaveToAfterSend: " + caseIdToSaveToAfterSend);
            });
        });
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

