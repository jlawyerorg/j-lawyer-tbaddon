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
let caseFolders = {};  // Speichert die Ordner des aktuell ausgewählten Cases
let selectedCaseFolderID = null;  // Speichert den aktuell ausgewählten Ordner des aktuell ausgewählten Cases
let emailTemplatesNames = {};  // Speichert die Email-Templates

document.addEventListener("DOMContentLoaded", async function() {
    browser.runtime.sendMessage({
        type: "checkUpdate",
        content: "check"
    });
    
    const recommendCaseButtonAfterSend = document.getElementById("recommendCaseButtonAfterSend"); 
    const feedback = document.getElementById("feedback");
    const customizableLabel = document.getElementById("customizableLabel"); 
    const updateDataButton = document.getElementById("updateDataButton");
    const settingsButton = document.getElementById("settingsButton");

    await fillTagsList();

    document.getElementById("searchInput").focus();
    
    // Code für den recommendCaseButtonAfterSend
    if (recommendCaseButtonAfterSend && customizableLabel) {
        recommendCaseButtonAfterSend.addEventListener("click", function() {
            
            if (!currentSelectedCase) {
                feedback.textContent = "Kein passendes Aktenzeichen gefunden!";
                feedback.style.color = "red";
                return;
            }
    
            browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
                browser.runtime.sendMessage({
                    type: "saveToCaseAfterSend",
                    source: "popup_compose",
                    content: currentSelectedCase.fileNumber, 
                    selectedCaseFolderID: selectedCaseFolderID,
                    username: result.username,
                    password: result.password,
                    serverAddress: result.serverAddress,
                    currentSelectedCase: currentSelectedCase
                });
    
                feedback.textContent = "E-Mail wird nach dem Senden in der Akte gespeichert";
                feedback.style.color = "green";
            });
            
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
            browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
                feedback.textContent = "Daten werden aktualisiert...";
                feedback.style.color = "blue";
                getCases(result.username, result.password, result.serverAddress).then(data => {
                    const casesRaw = data;
                    browser.storage.local.set({
                        cases: casesRaw
                    });
                    console.log("Cases heruntergeladen: " + casesRaw);
                    feedback.textContent = "Daten aktualisiert!";
                    feedback.style.color = "green";
                });
                getTags(result.username, result.password, result.serverAddress).then(() => {
                    fillTagsList();
                    feedback.textContent = "Daten aktualisiert!";
                    feedback.style.color = "green";
                });
                getCalendars(result.username, result.password, result.serverAddress).then(data => {
                    const calendarsRaw = data;
                    browser.storage.local.set({
                        calendars: calendarsRaw
                    });

                    // Kalenderdaten in jeweilige Arrays filtern und wieder speichern                    
                    // Filtern und Extrahieren der Daten für Wiedervorlagen
                    const followUpCalendars = calendarsRaw
                        .filter(calendar => calendar.eventType === 'FOLLOWUP')
                        .map(calendar => ({ id: calendar.id, displayName: calendar.displayName }));
                        console.log(followUpCalendars);
                        browser.storage.local.set({ followUpCalendars });
            
                    // Filtern und Extrahieren der Daten für Fristen
                    const respiteCalendars = calendarsRaw
                        .filter(calendar => calendar.eventType === 'RESPITE')
                        .map(calendar => ({ id: calendar.id, displayName: calendar.displayName }));
                        console.log(respiteCalendars);
                        browser.storage.local.set({ respiteCalendars });                        
            
                    // Filtern und Extrahieren der Daten für Termine
                    const eventCalendars = calendarsRaw
                        .filter(calendar => calendar.eventType === 'EVENT')
                        .map(calendar => ({ id: calendar.id, displayName: calendar.displayName }));
                        console.log(eventCalendars);
                        browser.storage.local.set({ eventCalendars });
                    console.log("Kalender heruntergeladen: " + calendarsRaw);                      
                        
                });
                getEmailTemplates(result.username, result.password, result.serverAddress).then(data => {
                    const emailTemplates = data.map((item, index) => ({ id: index + 1, name: item.name })).sort((a, b) => a.name.localeCompare(b.name));
                    browser.storage.local.set({ emailTemplatesNames: emailTemplates });
                    emailTemplates.forEach(template => console.log(`ID: ${template.id}, Name: ${template.name}`));
                    //save emailTemplates to storage with id and name
                    browser.storage.local.set({ emailTemplates });
                });  
                
                getUsers(result.username, result.password, result.serverAddress).then(data => {
                    const users = data.map(item => item.displayName);
                    
                    // clear users of empty strings
                    users.forEach((item, index) => {
                        if (item === "") {
                            users.splice(index, 1);
                        }
                    });

                    // save users to storage
                    browser.storage.local.set({
                        users: users
                    });
                    console.log("Benutzer heruntergeladen: " + users);
                });
                feedback.textContent = "Daten aktualisiert!";
                feedback.style.color = "green";
            });         
        });
    }

    if (message.type === "updateStatus") {
        const updateIndicator = document.getElementById("updateIndicator");
        const updateText = updateIndicator.querySelector(".update-text");
        
        // Entferne alle Status-Klassen
        updateIndicator.classList.remove("update-success", "update-error");
        
        switch(message.status) {
            case "start":
                updateIndicator.style.display = "flex";
                updateText.textContent = message.message;
                break;
                
            case "success":
                updateIndicator.classList.add("update-success");
                updateText.textContent = message.message;
                // Nach 3 Sekunden ausblenden
                setTimeout(() => {
                    updateIndicator.style.display = "none";
                }, 3000);
                break;
                
            case "error":
                updateIndicator.classList.add("update-error");
                updateText.textContent = message.message;
                // Nach 5 Sekunden ausblenden
                setTimeout(() => {
                    updateIndicator.style.display = "none";
                }, 5000);
                break;
        }
    }

    // Code, um die options.html in einem neuen Tab zu öffnen
    if (settingsButton) {
        settingsButton.addEventListener("click", function() {
            browser.tabs.create({url: "options.html"});
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
      timeOut: 30000
    }).then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    });
}


function getTags(username, password, serverAddress) {
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
    
    // Event-Handler für Suchergebnisse
    document.querySelectorAll(".resultItem").forEach(item => {
        item.addEventListener("click", async function() {
            // Setze die ausgewählte Akte basierend auf dem Klick
            currentSelectedCase = {
                id: this.getAttribute("data-id"),
                name: this.textContent.split(" (")[0],
                fileNumber: this.textContent.split("(")[1].split(")")[0],
            };

            const loginData = await browser.storage.local.get(["username", "password", "serverAddress"]);
            
            // Hole die Metadaten des Falls, einschließlich `reason`
            const caseMetaData = await getCaseMetaData(currentSelectedCase.id, loginData.username, loginData.password, loginData.serverAddress);

            // Aktualisiere die `currentSelectedCase` mit dem `reason`
            currentSelectedCase.reason = caseMetaData.reason;

            // Lade die Ordner des ausgewählten Falls und aktualisiere die Struktur
            caseFolders = await getCaseFolders(currentSelectedCase.id, loginData.username, loginData.password, loginData.serverAddress);
            displayTreeStructure(caseFolders);

            // Aktualisiere das Label mit den Falldetails, einschließlich `reason`, falls vorhanden
            const customizableLabel = document.getElementById("customizableLabel");
            customizableLabel.textContent = `${currentSelectedCase.fileNumber}: ${currentSelectedCase.name} - ${currentSelectedCase.reason || "kein Grund angegeben"}`;

            // Führe die Aktion aus, die sonst der Button ausgelöst hätte
            browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
                browser.runtime.sendMessage({
                    type: "saveToCaseAfterSend",
                    source: "popup_compose",
                    content: currentSelectedCase.fileNumber,
                    selectedCaseFolderID: selectedCaseFolderID,
                    username: result.username,
                    password: result.password,
                    serverAddress: result.serverAddress,
                    currentSelectedCase: currentSelectedCase
                });

                // Setze Feedback-Text und -Farbe
                const feedback = document.getElementById("feedback");
                feedback.textContent = "E-Mail wird nach dem Senden in der Akte gespeichert";
                feedback.style.color = "green";
            });

            // Blende die Ergebnissliste aus
            document.getElementById("resultsList").style.display = "none";
        });
    });
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


async function getCalendars(username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v4/calendars/list/'+ username;
    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    headers.append('Content-Type', 'application/json');
  
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: headers,
            timeOut: 10000
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


async function getUsers(username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v6/security/users';
    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(username + ':' + password)));
    
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    headers.append('Content-Type', 'application/json');
  
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: headers,
            timeOut: 10000
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