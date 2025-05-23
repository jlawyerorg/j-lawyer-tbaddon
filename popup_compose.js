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
    const progressBar = document.getElementById("progressBar");

    await fillTagsList();
    
    // Automatisch nach Aktenzeichen im Betreff suchen
    await findFileNumberInComposeMessage();

    document.getElementById("searchInput").focus();
    
    // Überprüfen, ob der Code heute bereits ausgeführt wurde
    const today = new Date().toISOString().split('T')[0];
    const lastUpdate = await browser.storage.local.get("lastUpdate");
    if (lastUpdate.lastUpdate !== today) {
        updateData(feedback, progressBar);
    }

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
            updateData(feedback, progressBar);
        });
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
    } else if (message.type === "updateStatus") {
        const updateIndicator = document.getElementById("updateIndicator");
        if (updateIndicator) {
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

            // Beteiligte anzeigen
            displayParties(currentSelectedCase.id);

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

// Funktion zum Abrufen der Beteiligten einer Akte
async function getPartiesInCase(caseId, username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v1/cases/' + caseId + '/parties';

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
        console.log("Beteiligte der Akte " + caseId + " heruntergeladen:", data);
        return data;
    } catch (error) {
        console.error("Fehler beim Abrufen der Beteiligten:", error);
        throw error;
    }
}

// Funktion zum Anzeigen der Beteiligten einer Akte
async function displayParties(caseId) {
    try {
        if (!caseId) {
            console.log("Keine Case-ID vorhanden, kann Beteiligte nicht anzeigen");
            return;
        }

        const loginData = await browser.storage.local.get(["username", "password", "serverAddress"]);
        
        // Beteiligte abrufen
        const parties = await getPartiesInCase(caseId, loginData.username, loginData.password, loginData.serverAddress);
        
        // Container für die Beteiligten leeren
        const partiesListElement = document.getElementById("partiesList");
        partiesListElement.innerHTML = "";
        
        // Wenn keine Beteiligten vorhanden sind
        if (!parties || parties.length === 0) {
            const noPartiesElement = document.createElement("div");
            noPartiesElement.textContent = "Keine Beteiligten gefunden";
            partiesListElement.appendChild(noPartiesElement);
            return;
        }
        
        // Array für Beteiligte mit E-Mail-Adressen
        const partiesWithEmails = [];
        
        // Für jeden Beteiligten die Adressdetails abrufen
        for (const party of parties) {
            if (party.addressId) {
                try {
                    const addressDetails = await getAddressDetails(
                        party.addressId, 
                        loginData.username, 
                        loginData.password, 
                        loginData.serverAddress
                    );
                    
                    // Nur Beteiligte mit E-Mail-Adresse anzeigen
                    if (addressDetails.email) {
                        partiesWithEmails.push({
                            name: addressDetails.name,
                            firstName: addressDetails.firstName,
                            email: addressDetails.email,
                            involvementType: party.involvementType,
                            reference: party.reference // Referenz aus der Partei-Information hinzufügen
                        });
                    }
                } catch (error) {
                    console.error(`Fehler beim Abrufen der Adressdetails für ${party.addressId}:`, error);
                }
            }
        }
        
        // Beteiligte alphabetisch nach Namen sortieren
        partiesWithEmails.sort((a, b) => {
            const nameA = a.name + (a.firstName ? `, ${a.firstName}` : "");
            const nameB = b.name + (b.firstName ? `, ${b.firstName}` : "");
            return nameA.localeCompare(nameB);
        });
        
        // Beteiligten-Liste erstellen
        partiesWithEmails.forEach(party => {
            const div = document.createElement("div");
            div.className = "partyItem";
            
            // Namen formatieren
            let displayName = party.name;
            if (party.firstName) {
                displayName += `, ${party.firstName}`;
            }
            
            // Involvementtype als Badge hinzufügen
            let involvementBadge = "";
            if (party.involvementType) {
                involvementBadge = ` [${party.involvementType}]`;
            }
            
            // Referenz-Information hinzufügen, falls vorhanden
            let referenceInfo = "";
            if (party.reference) {
                referenceInfo = ` - Zeichen: ${party.reference}`;
            }
            
            div.textContent = `${displayName}${involvementBadge}${referenceInfo} (${party.email})`;
            div.setAttribute("data-email", party.email);
            div.setAttribute("data-name", displayName);
            
            // Referenz als Datenattribut speichern, falls vorhanden
            if (party.reference) {
                div.setAttribute("data-reference", party.reference);
            }
            
            // Event-Listener für Klick auf Beteiligten
            div.addEventListener("click", async function() {
                const email = this.getAttribute("data-email");
                const name = this.getAttribute("data-name");
                const reference = this.getAttribute("data-reference");
                
                try {
                    // Aktiven Tab im Compose-Fenster ermitteln
                    const tabs = await browser.tabs.query({active: true, currentWindow: true});
                    if (tabs.length === 0) {
                        console.log("Kein aktiver Tab gefunden.");
                        return;
                    }
                    
                    const tabId = tabs[0].id;
                    
                    // Aktuelle Compose-Details abrufen
                    const composeDetails = await browser.compose.getComposeDetails(tabId);
                    
                    // Aktualisierte Liste der Empfänger erstellen
                    let recipients = [];
                    if (composeDetails.to) {
                        if (Array.isArray(composeDetails.to)) {
                            recipients = [...composeDetails.to];
                        } else {
                            recipients = [composeDetails.to];
                        }
                    }
                    
                    // Neuen Empfänger formatieren und hinzufügen
                    const formattedRecipient = `${name} <${email}>`;
                    
                    // Prüfen, ob der Empfänger bereits in der Liste ist
                    const emailExists = recipients.some(recipient => {
                        if (typeof recipient === 'string') {
                            return recipient.includes(email);
                        } else if (recipient.nodeId) {
                            return false; // NodeID kann nicht geprüft werden ohne weitere Infos
                        }
                        return false;
                    });
                    
                    // Nur hinzufügen, wenn die E-Mail noch nicht in der Liste ist
                    if (!emailExists) {
                        recipients.push(formattedRecipient);
                    }
                    
                    // Betreff aktualisieren, wenn eine Referenz vorhanden ist
                    let updatedSubject = composeDetails.subject || "";
                    if (reference) {
                        // Prüfen, ob die Referenz bereits im Betreff vorhanden ist
                        if (!updatedSubject.includes(reference)) {
                            // Referenz zum Betreff hinzufügen mit dem Format "Zeichen: [referenz]"
                            updatedSubject = updatedSubject.trim() ? `${updatedSubject.trim()} (Zeichen: ${reference})` : `Zeichen: ${reference}`;
                        }
                    }
                    
                    // Compose-Details aktualisieren (Empfänger und möglicherweise Betreff)
                    const updateDetails = {
                        to: recipients
                    };
                    
                    // Betreff nur hinzufügen, wenn er geändert wurde
                    if (updatedSubject !== composeDetails.subject) {
                        updateDetails.subject = updatedSubject;
                    }
                    
                    await browser.compose.setComposeDetails(tabId, updateDetails);
                    
                    // Feedback-Nachricht vorbereiten
                    let feedbackMessage = `E-Mail-Adresse hinzugefügt: ${formattedRecipient}`;
                    if (reference && updatedSubject !== composeDetails.subject) {
                        feedbackMessage += `, Zeichen "${reference}" zum Betreff hinzugefügt`;
                    }
                    
                    // Feedback anzeigen
                    const feedback = document.getElementById("feedback");
                    feedback.textContent = !emailExists ? feedbackMessage : 
                        `E-Mail-Adresse existiert bereits: ${email}${reference ? `, Zeichen "${reference}" zum Betreff hinzugefügt` : ""}`;
                    feedback.style.color = !emailExists ? "green" : "orange";
                    
                    // Feedback nach 3 Sekunden zurücksetzen
                    setTimeout(() => {
                        feedback.textContent = "";
                    }, 3000);
                } catch (error) {
                    console.error("Fehler beim Aktualisieren des Compose-Fensters:", error);
                    
                    // Fehlermeldung anzeigen
                    const feedback = document.getElementById("feedback");
                    feedback.textContent = "Fehler beim Aktualisieren des Compose-Fensters";
                    feedback.style.color = "red";
                }
            });
            
            partiesListElement.appendChild(div);
        });
        
    } catch (error) {
        console.error("Fehler beim Anzeigen der Beteiligten:", error);
        
        // Fehlermeldung anzeigen
        const partiesListElement = document.getElementById("partiesList");
        partiesListElement.innerHTML = "";
        
        const errorElement = document.createElement("div");
        errorElement.textContent = "Fehler beim Laden der Beteiligten";
        errorElement.style.color = "red";
        partiesListElement.appendChild(errorElement);
    }
}

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

// Funktion zum Abrufen der Kontaktdetails anhand der Adress-ID
async function getAddressDetails(addressId, username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v2/contacts/' + addressId;

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
        console.log("Kontaktdetails für Adresse " + addressId + " heruntergeladen:", data);
        return data;
    } catch (error) {
        console.error("Fehler beim Abrufen der Kontaktdetails:", error);
        throw error;
    }
}

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
                await browser.storage.local.set({ cases: casesRaw });
                console.log("Cases heruntergeladen: " + casesRaw);
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

// Funktion zum Auslesen des Betreffs im Compose-Fenster und Suche nach einem Aktenzeichen
async function findFileNumberInComposeMessage() {
    try {
        // Aktiven Tab im Compose-Fenster ermitteln
        const tabs = await browser.tabs.query({active: true, currentWindow: true});
        if (tabs.length === 0) {
            console.log("Kein aktiver Tab gefunden.");
            return null;
        }
        
        const tabId = tabs[0].id;
        console.log("Aktive Tab-ID:", tabId);
        
        // Compose-Details aus dem aktiven Tab abrufen
        const composeDetails = await browser.compose.getComposeDetails(tabId);
        console.log("Compose-Details:", composeDetails);
        
        // Wenn kein Betreff vorhanden ist, frühzeitig beenden
        if (!composeDetails.subject || composeDetails.subject.trim() === "") {
            console.log("Nachricht hat keinen Betreff.");
            return null;
        }
        
        // In Betreff nach Aktenzeichen suchen
        const subject = composeDetails.subject;
        console.log("Betreff der Nachricht:", subject);
        
        // Gespeicherte Cases aus dem lokalen Storage holen
        let storedData = await browser.storage.local.get("cases");
        let loginData = await browser.storage.local.get(["username", "password", "serverAddress"]);
        
        // Die gespeicherten Cases in einem Array
        let casesArray = storedData.cases;
        
        // Wenn keine Cases vorhanden sind, beenden
        if (!casesArray || casesArray.length === 0) {
            console.log("Keine Cases im Storage gefunden.");
            return null;
        }
        
        // Durch alle Cases iterieren und prüfen, ob das Aktenzeichen im Betreff vorkommt
        for (let item of casesArray) {
            if (subject.includes(item.fileNumber)) {
                console.log("Aktenzeichen im Betreff gefunden:", item.fileNumber);
                
                // Case-Informationen speichern
                currentSelectedCase = {
                    id: item.id,
                    name: item.name,
                    fileNumber: item.fileNumber
                };
                
                console.log("Matching ID:", item.id);
                console.log("Matching Name:", item.name);
                
                // Weitere Metadaten und Ordner des Cases laden
                const caseMetaData = await getCaseMetaData(item.id, loginData.username, loginData.password, loginData.serverAddress);
                console.log("caseMetaData:", caseMetaData);
                
                // Aktualisiere den currentSelectedCase mit dem reason
                currentSelectedCase.reason = caseMetaData.reason;
                
                // Ordner des Cases laden
                caseFolders = await getCaseFolders(item.id, loginData.username, loginData.password, loginData.serverAddress);
                displayTreeStructure(caseFolders);
                
                // UI-Elemente aktualisieren
                const customizableLabel = document.getElementById("customizableLabel");
                const labelText = `${item.fileNumber}: ${item.name}${caseMetaData.reason ? ` - ${caseMetaData.reason}` : ''}`;
                customizableLabel.textContent = labelText;
                
                // Beteiligte anzeigen
                displayParties(item.id);
                
                // Automatisch Speichern nach Senden aktivieren
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
                    
                    // Feedback anzeigen
                    const feedback = document.getElementById("feedback");
                    feedback.textContent = "E-Mail wird nach dem Senden in der Akte gespeichert";
                    feedback.style.color = "green";
                });
                
                // Beteiligte anzeigen
                displayParties(item.id);
                
                return {
                    id: item.id,
                    name: item.name,
                    fileNumber: item.fileNumber
                };
            }
        }
        
        // Wenn kein Aktenzeichen gefunden wurde
        console.log("Kein Aktenzeichen im Betreff gefunden");
        return null;
    } catch (error) {
        console.error("Fehler bei der Suche nach Aktenzeichen:", error);
        return null;
    }
}

async function logActivity(action, details) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, action, details };

    let activityLog = await browser.storage.local.get("activityLog");
    activityLog = activityLog.activityLog || [];
    activityLog.push(logEntry);

    await browser.storage.local.set({ activityLog });
}