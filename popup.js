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



let currentSelectedCase = null;  // Speichert den aktuell ausgewählten Case
let caseMetaData = {};  // Speichert die Metadaten des aktuell ausgewählten Cases
let caseFolders = {};  // Speichert die Ordner des aktuell ausgewählten Cases
let selectedCaseFolderID = null;  // Speichert den aktuell ausgewählten Ordner des aktuell ausgewählten Cases
let emailTemplatesNames = {};  // Speichert die Email-Templates



// Tastaturnavigation durch Suchergebnisse
let selectedIndex = -1;

document.addEventListener("keydown", function(event) {
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
        selectedIndex = (selectedIndex - 1 + resultsElements.length) % resultsElements.length;
        resultsElements[selectedIndex].classList.add("selected");
    } else if (event.key === "Enter" && selectedIndex >= 0) {
        resultsElements[selectedIndex].click();
    }
});


// Debug-Check für AttachmentImageProcessor
console.log('popup.js loaded, AttachmentImageProcessor available:', !!window.AttachmentImageProcessor);

// Event Listener für Buttons
document.addEventListener("DOMContentLoaded", async function() {
    const recommendCaseButton = document.getElementById("recommendCaseButton"); 
    const feedback = document.getElementById("feedback");
    const customizableLabel = document.getElementById("customizableLabel"); 
    const updateDataButton = document.getElementById("updateDataButton");
    const saveAttachmentsButton = document.getElementById("saveAttachmentsButton");
    const progressBar = document.getElementById("progressBar");
    const imageEditToggle = document.getElementById("imageEditToggle");
    
    browser.storage.local.remove("selectedTags");
    await fillTagsList();
    
    // Bildbearbeitung Toggle laden
    const toggleState = await browser.storage.local.get("imageEditEnabled");
    imageEditToggle.checked = toggleState.imageEditEnabled || false;
    
    // Event Listener für Bildbearbeitung Toggle
    imageEditToggle.addEventListener("change", async function() {
        await browser.storage.local.set({ imageEditEnabled: this.checked });
        console.log("Image edit toggle set to:", this.checked);
    });
    
    findFileNumberInRawMessage()

    // Setzt den Fokus auf das Suchfeld
    document.getElementById("searchInput").focus();    

    // Überprüfen, ob der Code heute bereits ausgeführt wurde
    const today = new Date().toISOString().split('T')[0];
    const lastUpdate = await browser.storage.local.get("lastUpdate");
    if (lastUpdate.lastUpdate !== today) {
        updateData(feedback, progressBar);
    }

    // Code für den recommendCaseButton
    if (recommendCaseButton && customizableLabel) {
        recommendCaseButton.addEventListener("click", function() {
            
            if (!currentSelectedCase) {
                feedback.textContent = "Kein passendes Aktenzeichen gefunden!";
                feedback.style.color = "red";
                return;
            }
    
            browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
                browser.runtime.sendMessage({
                    type: "case",
                    source: "popup",
                    content: currentSelectedCase.fileNumber, 
                    selectedCaseFolderID: selectedCaseFolderID,
                    username: result.username,
                    password: result.password,
                    serverAddress: result.serverAddress
                    
                });
                // Setzt Feedback zurück, während auf eine Antwort gewartet wird
                feedback.textContent = "Speichern...";
                feedback.style.color = "blue";
            });
            feedback.textContent = "An empfohlene Akte gesendet!";
            feedback.style.color = "green";
        });
    }

    

    // Code für den saveOnlyMessageButton
    if (saveOnlyMessageButton && customizableLabel) {
        saveOnlyMessageButton.addEventListener("click", function() {
            
            if (!currentSelectedCase) {
                feedback.textContent = "Kein passendes Aktenzeichen gefunden!";
                feedback.style.color = "red";
                return;
            }

            browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
                browser.runtime.sendMessage({
                    type: "saveMessageOnly",
                    source: "popup",
                    content: currentSelectedCase.fileNumber, 
                    selectedCaseFolderID: selectedCaseFolderID,
                    username: result.username,
                    password: result.password,
                    serverAddress: result.serverAddress
                    
                });

                // Setzt Feedback zurück, während auf eine Antwort gewartet wird
                feedback.textContent = "Speichern...";
                feedback.style.color = "blue";
            });
            feedback.textContent = "An empfohlene Akte gesendet!";
            feedback.style.color = "green";
        });
    }

    // Event Listener für den 2. "Nur Anhänge speichern" Button
    if (saveAttachmentsButton && customizableLabel) {
        saveAttachmentsButton.addEventListener("click", async function() {
            
            const feedback = document.getElementById("feedback");

            if (!currentSelectedCase) {
                feedback.textContent = "Kein passendes Aktenzeichen gefunden!";
                feedback.style.color = "red";
                return;
            }

            try {
                const settings = await browser.storage.local.get(["username", "password", "serverAddress"]);
                const toggleState = await browser.storage.local.get("imageEditEnabled");
                
                if (toggleState.imageEditEnabled) {
                    // Überprüfung auf Bildanhänge vor der Bildbearbeitungslogik
                    feedback.textContent = "Überprüfe Anhänge...";
                    feedback.style.color = "blue";
                    
                    const messageData = await getDisplayedMessageFromActiveTab();
                    const attachments = await browser.messages.listAttachments(messageData.id);
                    
                    // Filtert Bild- und Nicht-Bildanhänge
                    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'];
                    const imageAttachments = attachments.filter(attachment => 
                        imageTypes.includes(attachment.contentType.toLowerCase()) || 
                        attachment.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp)$/)
                    );
                    const nonImageAttachments = attachments.filter(attachment => 
                        !imageTypes.includes(attachment.contentType.toLowerCase()) && 
                        !attachment.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp)$/)
                    );
                    
                    if (imageAttachments.length === 0) {
                        feedback.textContent = "Keine Bildanhänge in der Nachricht gefunden. Bildbearbeitung ist nur für Bilddateien verfügbar.";
                        feedback.style.color = "orange";
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
                        await new Promise(resolve => setTimeout(resolve, 100));
                        attempts++;
                    }
                    
                    if (!window.AttachmentImageProcessor) {
                        throw new Error("AttachmentImageProcessor konnte nicht geladen werden");
                    }
                    
                    const processor = new AttachmentImageProcessor();
                    await processor.processWithImageEditing(currentSelectedCase, selectedCaseFolderID);
                } else {
                    // Bestehende Logik beibehalten
                    browser.runtime.sendMessage({
                        type: "saveAttachments",
                        source: "popup",
                        content: currentSelectedCase.fileNumber, 
                        selectedCaseFolderID: selectedCaseFolderID,
                        username: settings.username,
                        password: settings.password,
                        serverAddress: settings.serverAddress
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
    tagsSelect.addEventListener("change", function() {
        selectedTags = Array.from(tagsSelect.selectedOptions).map(option => option.value);
        console.log("Ausgewählte Tags:", selectedTags);
        browser.storage.local.set({
            selectedTags: selectedTags
        });
    });



    // Event Listener für den "Daten aktualisieren" Button
    if (updateDataButton) {
        updateDataButton.addEventListener("click", async function() {
            updateData(feedback, progressBar);
        });
    }

    // die options.html in einem neuen Tab öffnen
    const settingsButton = document.getElementById("settingsButton");
    if (settingsButton) {
        settingsButton.addEventListener("click", function() {
            browser.tabs.create({url: "options.html"});
        });
    }

});

// Funktion zum Aktualisieren der Daten
async function updateData(feedback, progressBar) {
    progressBar.value = 0;
    progressBar.style.display = "block";

    try {
        const { username, password, serverAddress } = await browser.storage.local.get(["username", "password", "serverAddress"]);
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
                const today = new Date().toISOString().split('T')[0];
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
                const calendarsRaw = await getCalendars(username, password, serverAddress);
                await browser.storage.local.set({ calendars: calendarsRaw });

                // Kalenderdaten filtern und speichern
                const followUpCalendars = calendarsRaw.filter(calendar => calendar.eventType === 'FOLLOWUP')
                    .map(calendar => ({ id: calendar.id, displayName: calendar.displayName }));
                const respiteCalendars = calendarsRaw.filter(calendar => calendar.eventType === 'RESPITE')
                    .map(calendar => ({ id: calendar.id, displayName: calendar.displayName }));
                const eventCalendars = calendarsRaw.filter(calendar => calendar.eventType === 'EVENT')
                    .map(calendar => ({ id: calendar.id, displayName: calendar.displayName }));

                await browser.storage.local.set({
                    followUpCalendars,
                    respiteCalendars,
                    eventCalendars
                });

                console.log("Kalender heruntergeladen: " + calendarsRaw);
                updateProgress();
            })(),

            (async () => {
                const emailTemplates = (await getEmailTemplates(username, password, serverAddress))
                    .map((item, index) => ({ id: index + 1, name: item.name }))
                    .sort((a, b) => a.name.localeCompare(b.name));
                await browser.storage.local.set({ emailTemplates, emailTemplatesNames: emailTemplates });
                console.log("E-Mail-Vorlagen: ", emailTemplates);
                updateProgress();
            })(),

            (async () => {
                const users = (await getUsers(username, password, serverAddress)).filter(user => user.displayName);
                await browser.storage.local.set({ users: users.map(user => user.displayName) });
                console.log("Benutzer heruntergeladen: ", users);
                updateProgress();
            })()
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


// Funktion zum Suchen des Aktenzeichens in der Nachricht
// und Rückgabe des gefundenen Falls
async function findFileNumberInRawMessage() {
    // Nachrichteninhalt abrufen
    const messageData = await getDisplayedMessageFromActiveTab();
    console.log("Message Id: " + messageData.id);
  
    let rawMessage = await messenger.messages.getRaw(messageData.id);
    
    // die gespeicherte Daten aus browser.storage.local abrufen
    let storedData = await browser.storage.local.get("cases");
    let loginData = await browser.storage.local.get(["username", "password", "serverAddress"]);
    
    // die gespeicherten Daten in einem Array namens 'cases' 
    let casesArray = storedData.cases;
  
    for (let item of casesArray) {
      if (rawMessage.includes(item.fileNumber)) {
        
        currentSelectedCase = {
            id: item.id,
            name: item.name,
            fileNumber: item.fileNumber
          };


        console.log("Matching ID: " + item.id);
        console.log("Matching Name: " + item.name);
            
        caseMetaData = await getCaseMetaData(item.id, loginData.username, loginData.password, loginData.serverAddress);
        console.log("caseMetaData: " + caseMetaData.lawyer + " " + caseMetaData.reason);
        caseFolders = await getCaseFolders(item.id, loginData.username, loginData.password, loginData.serverAddress);        
        console.log("caseFolders: " + caseFolders);
        displayTreeStructure(caseFolders);

        // Aktualisieren des Label "Recommended Case" mit dem gefundenen Aktenzeichen
        const customizableLabel = document.getElementById("customizableLabel");
        customizableLabel.textContent = item.name + ": " + item.fileNumber + " (" + caseMetaData.reason + " - " + caseMetaData.lawyer + ")";

        return {
          id: item.id,
          name: item.name
        };
      }
    }
    console.log("Keine Übereinstimmung gefunden");
    return null;
}

// Funktion zum Abrufen der Nachrichten-ID des aktiven Tabs im Fenster 
// und Rückgabe der Nachricht mit dieser ID
function getDisplayedMessageFromActiveTab() {
    return browser.mailTabs.query({active: true, currentWindow: true})
    .then((tabs) => {
        if (tabs.length === 0) {
            // Wenn kein aktiver mailTab gefunden wird, wird versucht, den aktiven Tab im Fenster abzurufen
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


// Funktion zum Abrufen der Fälle / Akten
function getCases(username, password, serverAddress) {
    const url = serverAddress +'/j-lawyer-io/rest/v1/cases/list';
  
    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
    headers.append('Content-Type', 'application/json');
  
    return fetch(url, {
      method: 'GET',
      headers: headers,
      timeout: 30000
    }).then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    });
}


// Funktion zum Abrufen der am Server gespeicherten Dokumenten-Tags
async function getTags(username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v7/configuration/optiongroups/document.tags';
  
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
        const valuesArray = data.map(item => item.value);
        console.log("Tags heruntergeladen: " + valuesArray);
        // let tagsList = JSON.stringify(valuesArray)
        browser.storage.local.set({'documentTags': valuesArray});
        return valuesArray;
    });
}


// Funktion zum Abrufen der Metadaten eines Falls
async function getCaseMetaData(caseId, username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/' + caseId;

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
        let extractedData = {};

            if ('reason' in data && data.reason !== null) {
                extractedData.reason = data.reason;
            }
            
            if ('lawyer' in data && data.lawyer !== null) {
                extractedData.lawyer = data.lawyer;
            }
            extractedData;

        return extractedData;
    });
}



// Event-Listener für die Suche
document.getElementById("searchInput").addEventListener("input", function() {
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
    let loginData = await browser.storage.local.get(["username", "password", "serverAddress"]);

    query = query.toUpperCase();
    
    let results = casesArray.filter(item => 
        item.name.toUpperCase().includes(query) || 
        item.fileNumber.toUpperCase().includes(query) ||
        (item.reason && item.reason.toUpperCase().includes(query))  // Neue Bedingung für reason
    );

    // Ergebnisse bewerten und sortieren basierend auf Übereinstimmungslänge
    results = results.map(item => {
        let nameMatchLength = getConsecutiveMatchCount(item.name.toUpperCase(), query);
        let fileNumberMatchLength = getConsecutiveMatchCount(item.fileNumber.toUpperCase(), query);
        let reasonMatchLength = item.reason ? 
            getConsecutiveMatchCount(item.reason.toUpperCase(), query) : 0;

        return {
            ...item,
            matchLength: Math.max(nameMatchLength, fileNumberMatchLength, reasonMatchLength)
        };
    }).filter(item => item.matchLength > 0)
    .sort((a, b) => b.matchLength - a.matchLength);

    const resultsListElement = document.getElementById("resultsList");
    while (resultsListElement.firstChild) {
        resultsListElement.removeChild(resultsListElement.firstChild);
    }

    results.forEach(item => {
        const div = document.createElement("div");
        div.className = "resultItem";
        div.setAttribute("data-id", item.id);
        div.textContent = `${item.name} (${item.fileNumber})`;
        if (item.reason) {
            div.textContent += ` - ${item.reason}`;
        }
        resultsListElement.appendChild(div);
    });
    
    // Event Handler für Suchergebnisse
    document.querySelectorAll(".resultItem").forEach(item => {
        item.addEventListener("click", async function() {
            currentSelectedCase = {
                id: this.getAttribute("data-id"),
                name: this.textContent.split(" (")[0],
                fileNumber: this.textContent.split("(")[1].split(")")[0],
                reason: item.getAttribute("data-tooltip")
            };
            
            caseMetaData = await getCaseMetaData(currentSelectedCase.id, loginData.username, loginData.password, loginData.serverAddress);
            
            caseFolders = await getCaseFolders(currentSelectedCase.id, loginData.username, loginData.password, loginData.serverAddress);        
            console.log("caseFolders:", caseFolders);
            displayTreeStructure(caseFolders);

            document.getElementById("resultsList").style.display = "none";

            // Label aktualisieren
            const customizableLabel = document.getElementById("customizableLabel");
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
            const sortedTags = result.documentTags.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })); // Tags alphabetisch sortieren (unabhängig von Groß- und Kleinschreibung)
            sortedTags.forEach(tag => {
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

// Funktion zum Erstellen eines Ordnerbaums einer Akte
function createTreeElement(obj) {
    if (!obj) return null; // Behandlung von null-Werten

    const element = document.createElement('div');
    element.className = 'treeItem';
    element.textContent = obj.name;
    element.style.paddingLeft = '20px';
    element.style.cursor = 'pointer';
    element.onclick = function(event) {
        // Verhindern, dass das Klick-Event sich nach oben durch den Baum fortpflanzt
        event.stopPropagation();

        // Entfernen der Auswahl von allen anderen Elementen
        const selectedElements = document.querySelectorAll('.treeItem.selectedItem');
        selectedElements.forEach(el => el.classList.remove('selectedItem'));

        // Hinzufügen der Auswahl zum aktuellen Element
        this.classList.add('selectedItem');

        selectedCaseFolderID = obj.id;
        console.log("Name des ausgewählten Ordners: " + obj.name);
        console.log("Id des ausgewählten Ordners: " + selectedCaseFolderID);
    };

    if (obj.children && obj.children.length > 0) {
        // Sortiert alphabetisch nach dem Namen
        obj.children.sort((a, b) => a.name.localeCompare(b.name));
        obj.children.forEach(child => {
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
    const treeContainer = document.getElementById('treeContainer');
    if (treeContainer) {
        treeContainer.innerHTML = ''; // Bestehenden Inhalt löschen
        treeContainer.appendChild(treeRoot);
    }
}


// Funktion zum Abrufen der Kalender vom Server
async function getCalendars(username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v4/calendars/list/'+ username;
    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    headers.append('Content-Type', 'application/json');
  
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json(); 

        data.forEach(calendar => {
            console.log('Kalender ID:', calendar.id);
            console.log('Anzeigename: (displayName)', calendar.displayName);
            console.log('Hintergrund:', calendar.background);
            console.log('Cloud-Host:', calendar.cloudHost);
            console.log('Cloud-Pfad:', calendar.cloudPath);
            console.log('Cloud-Port:', calendar.cloudPort);
            console.log('Cloud-SSL:', calendar.cloudSsl);
            console.log('Ereignistyp: (eventType - FOLLOWUP, RESPITE, EVENT)', calendar.eventType);
            console.log('Href:', calendar.href);
            console.log('-----------------------------------');
        });
        return data;
    } catch (error) {
        console.error('Fehler beim Abrufen der Kalender:', error);
    }
}

// Funktion zum Abrufen der Benutzer vom Server
async function getUsers(username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v6/security/users';
    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    headers.append('Content-Type', 'application/json');
  
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: headers
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json(); 

        return data;
    } catch (error) {
        console.error('Fehler beim Abrufen der User:', error);
    }
}


function getEmailTemplates(username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v6/templates/email';

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

async function logActivity(action, details) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, action, details };

    let activityLog = await browser.storage.local.get("activityLog");
    activityLog = activityLog.activityLog || [];
    activityLog.push(logEntry);

    await browser.storage.local.set({ activityLog });
}