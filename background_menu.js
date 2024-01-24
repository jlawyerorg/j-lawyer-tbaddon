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


let messagesToSaveIds = null; 
let messagesToSaveObjects = null;
let menu_documentUploadedId = null;
let menu_lastMessageData = null;
let documentsToTag = null;
let documentCounter = 0;
let selectedCaseFolderID_bundle = null;

//  ************************* ZUORDNEN MENU ************************* 

// Erstellt einen Kontextmenüeintrag für ausgewählte Nachrichten
browser.menus.create({
    id: "mehrere_messages_zuordnen",
    title: "Nachrichten an j-Lawyer senden...",
    contexts: ["message_list"]
});


// Fügt einen Event-Listener hinzu, der ausgelöst wird, wenn der Menüeintrag angeklickt wird
browser.menus.onClicked.addListener(async (info, tab) => {
    
    if (info.menuItemId === "mehrere_messages_zuordnen") {
        let win = await browser.windows.create({
            url: browser.runtime.getURL("popup_menu_bundle_save.html"),
            type: "popup",
            width: 700,
            height: 650
        });
        

        let messages = await browser.mailTabs.getSelectedMessages(tab.id);
        console.log(messages);

        messagesToSaveObjects = messages;

        let result = messages.messages.map(message => ({id: message.id, subject: message.subject}));
        console.log(result);

        messagesToSaveIds = messages.messages.map(message => ({id: message.id}));
        console.log(messagesToSaveIds);
    }
});


//  **************************************************


async function sendEmailToServerFromSelection(singleMessageFromSelection, caseId, username, password, serverAddress) {
    console.log("Case ID: " + caseId);
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/document/create';
    
    messageId = singleMessageFromSelection.id;
    
    // Der Nachricht wird der Tag "veraktet" hinzugefügt
    addTagToMessageFromSelection(messageId, 'veraktet', '#000080');

    let rawMessage = await messenger.messages.getRaw(messageId);

    // Der Inhalt der Message wird zu Base64 codiert
    const emailContentBase64 = await messageToBase64(rawMessage);

    // Das Datum ermitteln, um es dem Dateinamen voranzustellen
    const today = getCurrentDateFormatted();

    // Dateinamen erstellen
    fileName = today + "_" + singleMessageFromSelection.author + singleMessageFromSelection.subject + documentCounter + ".eml";
    fileName = fileName.replace(/[\/\\:*?"<>|@]/g, '_');

    documentCounter++;

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
        menu_documentUploadedId = data.id;
        console.log("Dokument ID: " + data.id);

        updateDocumentFolderBundle(username, password, serverAddress);

        browser.runtime.sendMessage({ type: "success" });

        browser.storage.local.get(["username", "password", "serverAddress", "selectedTags"]).then(result => {
            // Überprüfen, ob documentTags nicht leer ist
            if (result.selectedTags && result.selectedTags.length > 0) {
                for (let documentTag of result.selectedTags) {
                    setDocumentTagFromSelection(result.username, result.password, result.serverAddress, documentTag); 
                }
            }
        });
    }).catch(error => {
        console.log('Error:', error);
        browser.runtime.sendMessage({ type: "error", content: error.rawMessage });
    });

}


function getCasesFromSelection(username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/list';

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
    });
}


function findIdByFileNumberFromSelection(data, fileNumber) {
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



function getCurrentDateFormatted() {
    const currentDate = new Date();

    const year = currentDate.getFullYear();

    let month = currentDate.getMonth() + 1;
    month = month < 10 ? '0' + month : month;

    let day = currentDate.getDate();
    day = day < 10 ? '0' + day : day;

    // Ergänzung für die Uhrzeit
    let hours = currentDate.getHours();
    hours = hours < 10 ? '0' + hours : hours;

    let minutes = currentDate.getMinutes();
    minutes = minutes < 10 ? '0' + minutes : minutes;

    let seconds = currentDate.getSeconds();
    seconds = seconds < 10 ? '0' + seconds : seconds;

    // Kombinieren von Datum und Uhrzeit im Format YYYY-MM-DD HH:MM:SS
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}




function setDocumentTagFromSelection(username, password, serverAddress, documentTag) {

    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
    headers.append('Content-Type', 'application/json');

    const id = menu_documentUploadedId;

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
            throw new Error('Network error' + response.status + response.statusText);
        }
        return response.json();
    });
}


async function updateDocumentFolderBundle(username, password, serverAddress) {

    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
    headers.append('Content-Type', 'application/json');

    const url = serverAddress + "/j-lawyer-io/rest/v1/cases/document/update";

    // den Payload erstellen
    const payload = {
        id: menu_documentUploadedId,
        folderId: selectedCaseFolderID_bundle 
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


async function addTagToMessageFromSelection(messageId, tagName, tagColor) {
    // Alle vorhandenen Tags abrufen
    const existingTags = await browser.messages.listTags();

    // Überprüfen, ob der Tag bereits existiert
    let tag = existingTags.find(t => t.tag === tagName);

    // Wenn der Tag nicht existiert, wird er erstellt
    if (!tag) {
        tag = await browser.messages.createTag(tagName, tagName, tagColor);
    }

    // Tag wird der Nachricht hinzugefügt
    await browser.messages.update(messageId, { tags: [tag.key] });
}



// Empfangen der Nachrichten vom Popup
browser.runtime.onMessage.addListener(async (message) => {
    if ((message.type === "fileNumber" || message.type === "case") && (message.source === "popup_menu_bundle_save")) {
        
        selectedCaseFolderID_bundle = message.selectedCaseFolderID;

        for (const key in messagesToSaveObjects.messages) {
            
            browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
                const fileNumber = String(message.content);
                console.log("Single Selected Message Key:", key, "Value:", messagesToSaveObjects.messages[key].id);

                getCasesFromSelection(result.username, result.password, result.serverAddress).then(data => {
                    const caseId = findIdByFileNumberFromSelection(data, fileNumber);
                    
                    if (caseId) {
                        singleMessageFromSelection = messagesToSaveObjects.messages[key];
                        sendEmailToServerFromSelection(singleMessageFromSelection, caseId, result.username, result.password, result.serverAddress);
                    } else {
                        console.log('Keine übereinstimmende ID gefunden');
                    }
                });
            });
        }
        documentCounter = 0;
    }
});






