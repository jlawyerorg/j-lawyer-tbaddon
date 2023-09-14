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
let lastMessageData = null;
let extensionUsed = false;


function getDisplayedMessageFromActiveTab() {
    return browser.mailTabs.query({active: true, currentWindow: true})
    .then((tabs) => {
        if (tabs.length === 0) {
            // Wenn kein aktiver mailTab gefunden wird, den aktiven Tab im Fenster abrufen
            return browser.tabs.query({active: true, currentWindow: true});
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



async function sendEmailToServer(caseId, username, password, serverAddress) {
    console.log("Case ID: " + caseId);
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/document/create';

    const messageData = await getDisplayedMessageFromActiveTab();
    console.log("Message Id: " + messageData.id);

    addTagToMessage(messageData, 'veraktet', '#000080'); 

    let rawMessage = await messenger.messages.getRaw(messageData.id);

    // Der Inhalt der Message wird zu Base64 codiert
    const emailContentBase64 = await messageToBase64(rawMessage);

    // Das Datum ermitteln, um es dem Dateinamen voranzustellen
    const today = getCurrentDateFormatted();

    // Dateinamen erstellen
    fileName = today + "_" + messageData.subject + ".eml";
    fileName = fileName.replace("/", "_");

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
    headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
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
        browser.runtime.sendMessage({ type: "success" });
        

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
        
        // Das Datum ermitteln, um es dem Dateinamen voranzustellen
        const today = getCurrentDateFormatted();

        // Dateinamen erstellen
        fileName = today + "_" + att.name;
        fileName = fileName.replace("/", "_");

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
        headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
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
            browser.runtime.sendMessage({ type: "success" });
        
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

async function sendEmailToServerAfterSend(caseIdToSaveToAfterSend, username, password, serverAddress) {
    console.log("Es wird versucht, die Email in der Akte zu speichern");
    
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/document/create';

    rawMessage = await messenger.messages.getRaw(lastMessageData.messages[0].id);
    
    addTagToMessage(lastMessageData.messages[0], 'veraktet', '#000080');

    // Der Inhalt der Message wird zu Base64 codiert
    const emailContentBase64 = await messageToBase64(rawMessage);

    // Das Datum ermitteln, um es dem Dateinamen voranzustellen
    const today = getCurrentDateFormatted();

    // Dateinamen erstellen
    fileName = today + "_" + lastMessageData.messages[0].subject + ".eml";
    fileName = fileName.replace("/", "_");

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
    headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
    headers.append('Content-Type', 'application/json; charset=UTF-8');

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


function getCases(username, password, serverAddress) {
  const url = serverAddress +'/j-lawyer-io/rest/v1/cases/list';

  const headers = new Headers();
  headers.append('Authorization', 'Basic ' + btoa(''+username+':'+ password+''));
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
            reader.onload = function(event) {
                // Base64-String ohne den Anfangsteil "data:..." extrahieren
                let base64Message = event.target.result.split(',')[1];
                console.log(base64Message);
                resolve(base64Message);
            };
            reader.onerror = function(error) {
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
    
    // Die getMonth() Methode gibt einen Wert zwischen 0 (für Januar) und 11 (für Dezember) zurück. 
    // Daher ist 1 hinzufügen, um den korrekten Monat zu erhalten.
    let month = currentDate.getMonth() + 1;
    month = month < 10 ? '0' + month : month;  // Fügt eine führende Null hinzu, wenn der Monat kleiner als 10 ist

    let day = currentDate.getDate();
    day = day < 10 ? '0' + day : day;  // Fügt eine führende Null hinzu, wenn der Tag kleiner als 10 ist
    
    return `${year}-${month}-${day}`;
}



function setDocumentTag(username, password, serverAddress, documentTag) {
  
  const headers = new Headers();
  headers.append('Authorization', 'Basic ' + btoa(''+username+':'+ password+''));
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
        tag = await browser.messages.createTag('xksj', tagName,tagColor);
    }

    // Tag wird der Nachricht hinzugefügt
    await browser.messages.update(message.id, {tags: [tag.key]});
}



// Empfangen der Nachrichten vom Popup
browser.runtime.onMessage.addListener(async (message) => {
  if (message.type === "fileNumber" || message.type === "case") {  
    console.log("Das eingegeben Aktenzeichen: " + message.content);

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

  if (message.type === "saveAttachments") {
    console.log("Das eingegebene Aktenzeichen: " + message.content);

    browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
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

  if (message.type === "saveToCaseAfterSend") {  
    
    extensionUsed = true; // Nachricht soll nur gespeichert werden, wenn Extension genutzt

    console.log("Aktenzeichen: " + message.content);

    browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
      const fileNumber = String(message.content); 

      getCases(result.username, result.password, result.serverAddress).then(data => {
        const caseIdToSaveToAfterSend = findIdByFileNumber(data, fileNumber);
        browser.storage.local.set({caseIdToSaveToAfterSend: caseIdToSaveToAfterSend});
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
  


 
