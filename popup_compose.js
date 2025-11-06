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
        recommendCaseButtonAfterSend.addEventListener("click", async function() {

            if (!currentSelectedCase) {
                feedback.textContent = "Kein passendes Aktenzeichen gefunden!";
                feedback.style.color = "red";
                return;
            }

            // Prüfe, ob Umbenennen erlaubt ist
            const settings = await browser.storage.local.get(["username", "password", "serverAddress", "allowRename"]);
            let customFilename = null;

            if (settings.allowRename) {
                // Zeige Rename-Dialog
                const tabs = await browser.tabs.query({active: true, currentWindow: true});
                if (tabs.length > 0) {
                    const tabId = tabs[0].id;
                    const composeDetails = await browser.compose.getComposeDetails(tabId);
                    const originalSubject = composeDetails.subject || "nachricht";
                    const originalFilename = `${originalSubject}.eml`;

                    customFilename = await showRenameDialog(originalFilename);

                    if (customFilename === null) {
                        // Benutzer hat abgebrochen
                        feedback.textContent = "Speichern abgebrochen";
                        feedback.style.color = "orange";
                        return;
                    }
                }
            }

            browser.runtime.sendMessage({
                type: "saveToCaseAfterSend",
                source: "popup_compose",
                content: currentSelectedCase.fileNumber,
                selectedCaseFolderID: selectedCaseFolderID,
                username: settings.username,
                password: settings.password,
                serverAddress: settings.serverAddress,
                currentSelectedCase: currentSelectedCase,
                customFilename: customFilename
            });

            feedback.textContent = "E-Mail wird nach dem Senden in der Akte gespeichert";
            feedback.style.color = "green";
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

    // Event-Handler für Suchergebnisse
    document.querySelectorAll(".resultItem").forEach(item => {
        item.addEventListener("click", async function() {
            // Setze die ausgewählte Akte basierend auf dem Klick
            const caseId = this.getAttribute("data-id");
            const caseName = this.getAttribute("data-name");
            const caseFileNumber = this.getAttribute("data-file-number");
            
            console.log("Ausgewählter Fall - ID:", caseId);
            console.log("Ausgewählter Fall - Name:", caseName);
            console.log("Ausgewählter Fall - Aktenzeichen:", caseFileNumber);
            
            currentSelectedCase = {
                id: caseId,
                name: caseName,
                fileNumber: caseFileNumber,
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

            // Aktualisiere den Betreff im Compose-Fenster
            try {
                // Aktiven Tab im Compose-Fenster ermitteln
                const tabs = await browser.tabs.query({active: true, currentWindow: true});
                if (tabs.length > 0) {
                    const tabId = tabs[0].id;
                    
                    // Aktuelle Compose-Details abrufen
                    const composeDetails = await browser.compose.getComposeDetails(tabId);
                    
                    console.log("Compose-Details:", composeDetails);
                    console.log("currentSelectedCase für Betreff:", currentSelectedCase);
                    
                    // Betreff nur aktualisieren, wenn die Aktenzeichen-Nummer noch nicht im Betreff steht
                    if (!composeDetails.subject || !composeDetails.subject.includes(currentSelectedCase.fileNumber)) {
                        // Neuen Betreff mit "Unser Zeichen: " und Falldaten erstellen
                        const newSubject = `Unser Zeichen: ${currentSelectedCase.name}, ${currentSelectedCase.fileNumber}`;
                        
                        // Compose-Details mit neuem Betreff aktualisieren
                        await browser.compose.setComposeDetails(tabId, { subject: newSubject });
                        
                        console.log("Betreff aktualisiert:", newSubject);
                    } else {
                        console.log("Betreff nicht aktualisiert, da die Aktenzeichen-Nummer bereits enthalten ist");
                    }
                } else {
                    console.error("Kein aktiver Tab gefunden für Betreff-Aktualisierung");
                }
            } catch (error) {
                console.error("Fehler beim Aktualisieren des Betreffs:", error);
            }

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

        browser.storage.local.set({ selectedCaseFolderIDAfterSend: selectedCaseFolderID });
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

// Hilfsfunktion: Extrahiert Empfänger-Name und E-Mail aus To/CC-Felder
function parseRecipientsFromComposeDetails(composeDetails) {
    const recipients = [];

    try {
        // Sammle alle Empfänger (To, Cc)
        const allRecipients = [...(composeDetails.to || []), ...(composeDetails.cc || [])];

        for (const recipient of allRecipients) {
            const parsed = {
                name: '',
                email: '',
                lastName: ''
            };

            // Format 1: "Max Mustermann" <max@example.com>
            const nameEmailMatch = recipient.match(/^"?([^"<]+)"?\s*<([^>]+)>/);
            if (nameEmailMatch) {
                parsed.name = nameEmailMatch[1].trim();
                parsed.email = nameEmailMatch[2].trim();

                // Extrahiere Nachnamen (letztes Wort)
                const nameParts = parsed.name.split(/\s+/);
                parsed.lastName = nameParts[nameParts.length - 1];
            } else {
                // Format 2: max@example.com (nur E-Mail)
                const emailOnlyMatch = recipient.match(/([^\s<>]+@[^\s<>]+)/);
                if (emailOnlyMatch) {
                    parsed.email = emailOnlyMatch[1].trim();

                    // Versuche Namen aus E-Mail zu extrahieren
                    const emailPrefix = parsed.email.split('@')[0];
                    parsed.name = emailPrefix.replace(/[._-]/g, ' ');
                    parsed.lastName = parsed.name.split(/\s+/).pop();
                }
            }

            if (parsed.email) {
                recipients.push(parsed);
            }
        }
    } catch (error) {
        console.log("Fehler beim Parsen der Empfänger:", error);
    }

    return recipients;
}

// Hilfsfunktion: Extrahiert Namen nach Slash (Edge-Case: /Name Format)
function extractSlashNames(text) {
    const slashPattern = /\/([A-Za-zÄÖÜäöüß]{3,})/g;
    const names = new Set();

    let match;
    while ((match = slashPattern.exec(text)) !== null) {
        names.add(match[1].toLowerCase());
    }

    return Array.from(names);
}

// Hilfsfunktion: Reverse-Suche - Findet Worte aus case.name im Text
function matchCaseNameInText(caseName, emailText) {
    if (!caseName || !emailText) return 0;

    // Extrahiere bedeutungsvolle Worte aus case.name (>3 Zeichen, keine Stopwords)
    const stopwords = ['und', 'oder', 'der', 'die', 'das', 'gegen', 'für', 'mit', 'von', 'bei'];
    const caseWords = caseName
        .split(/[\s\-_,;.()]+/)
        .filter(word => word.length > 3 && !stopwords.includes(word.toLowerCase()))
        .map(word => word.toLowerCase());

    if (caseWords.length === 0) return 0;

    const emailTextLower = emailText.toLowerCase();
    let matchedWords = 0;

    for (const word of caseWords) {
        if (emailTextLower.includes(word)) {
            matchedWords++;
        }
    }

    const matchRatio = matchedWords / caseWords.length;

    // Scoring basierend auf Match-Ratio
    if (matchRatio >= 1.0) {
        return 45; // Alle Worte gefunden
    } else if (matchRatio >= 0.5) {
        return 35; // Mindestens 50% der Worte
    } else if (matchRatio >= 0.3) {
        return 25; // 30-50% der Worte
    }

    return 0;
}

// Hilfsfunktion: Vergleicht Empfänger mit case.name (Fuzzy-Matching)
function matchRecipientWithCaseName(recipient, caseName) {
    if (!recipient.name && !recipient.email) return 0;
    if (!caseName) return 0;

    const caseNameLower = caseName.toLowerCase();
    let score = 0;

    // Strategie 1: Nachname im case.name
    if (recipient.lastName && recipient.lastName.length > 2) {
        const lastNameLower = recipient.lastName.toLowerCase();
        if (caseNameLower.includes(lastNameLower)) {
            score = 40;
            console.log(`Empfänger-Match (Nachname): "${recipient.lastName}" in "${caseName}"`);
            return score;
        }
    }

    // Strategie 2: Vollständiger Name
    if (recipient.name && recipient.name.length > 3) {
        const nameLower = recipient.name.toLowerCase();

        if (caseNameLower.includes(nameLower)) {
            score = 45;
            console.log(`Empfänger-Match (Voller Name): "${recipient.name}" in "${caseName}"`);
            return score;
        }

        // Einzelne Worte prüfen
        const nameWords = recipient.name.split(/\s+/).filter(word => word.length > 2);
        let matchedWords = 0;

        for (const word of nameWords) {
            if (caseNameLower.includes(word.toLowerCase())) {
                matchedWords++;
            }
        }

        if (nameWords.length > 0 && matchedWords >= nameWords.length / 2) {
            score = 30;
            console.log(`Empfänger-Match (Teil-Name): ${matchedWords}/${nameWords.length} Worte in "${caseName}"`);
            return score;
        }
    }

    // Strategie 3: E-Mail-Prefix
    if (recipient.email) {
        const emailPrefix = recipient.email.split('@')[0].toLowerCase();

        if (emailPrefix.length > 3 && caseNameLower.includes(emailPrefix)) {
            score = 25;
            console.log(`Empfänger-Match (E-Mail-Prefix): "${emailPrefix}" in "${caseName}"`);
            return score;
        }

        const emailParts = emailPrefix.split(/[._-]/).filter(part => part.length > 2);
        let matchedParts = 0;

        for (const part of emailParts) {
            if (caseNameLower.includes(part)) {
                matchedParts++;
            }
        }

        if (emailParts.length > 0 && matchedParts > 0) {
            score = 20;
            console.log(`Empfänger-Match (E-Mail-Teile): ${matchedParts}/${emailParts.length} Teile in "${caseName}"`);
            return score;
        }
    }

    return 0;
}

// Hilfsfunktion: Extrahiert potenzielle Aktenzeichen aus Text mit Regex-Mustern
function extractFileNumberPatterns(text) {
    const patterns = [
        // AZ: / Az.: / Aktenzeichen Präfixe mit verschiedenen Formaten
        /(?:AZ|Az|Aktenzeichen)[:\.\s]+([0-9]{1,4}[\/\-_][0-9]{1,6}(?:[\/\-_][A-Za-z0-9]+)?)/gi,
        // Bracket-Format: [2024/123] oder [2024-123-ABC]
        /\[([0-9]{1,4}[\/\-_][0-9]{1,6}(?:[\/\-_][A-Za-z0-9]+)?)\]/g,
        // Jahr/Nummer Format (häufigster Fall): 2024/123 oder 2024-123 etc.
        /\b([0-9]{2,4}[\/\-_][0-9]{1,6}(?:[\/\-_][A-Za-z0-9]+)?)\b/g
    ];

    const extractedNumbers = new Set();

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            // Match kann in Gruppe 1 sein (bei Präfix-Patterns) oder Gruppe 0 (bei direkten Patterns)
            const fileNumber = match[1] || match[0];
            if (fileNumber && fileNumber.trim()) {
                extractedNumbers.add(fileNumber.trim());
            }
        }
    }

    return Array.from(extractedNumbers);
}

// Hilfsfunktion: Berechnet Confidence-Prozent basierend auf Score
function calculateConfidence(score) {
    // Max Score: 100 (Betreff) + 15 (Empfänger-Bonus 30% von 45) = 115
    // Mapping Score → Confidence %
    if (score >= 100) return Math.min(100, Math.round(85 + (score - 100) * 1.5)); // 85-100%
    if (score >= 50) return Math.round(60 + (score - 50) * 0.5); // 60-85%
    if (score >= 25) return Math.round(40 + (score - 25) * 0.8); // 40-60%
    if (score >= 5) return Math.round(20 + (score - 5)); // 20-40%
    return Math.round(score * 4); // 0-20%
}

// Hilfsfunktion: Findet Top N Matches mit case-insensitive Suche und Regex-Fallback
function findBestMatchesInSubject(subject, casesArray, composeDetails, maxResults = 3) {
    // Performance: toLowerCase nur einmal
    const subjectLower = subject.toLowerCase();
    let extractedNumbers = null; // Lazy loading - nur bei Bedarf extrahieren

    // Parse Empfänger (To/CC) aus composeDetails
    const recipients = composeDetails ? parseRecipientsFromComposeDetails(composeDetails) : [];
    console.log("Parsed Recipients:", recipients);

    const allMatches = [];

    for (let item of casesArray) {
        const fileNumber = item.fileNumber;
        const fileNumberLower = fileNumber.toLowerCase();
        let score = 0;
        let method = '';
        let recipientScore = 0;

        // Exakte Suche (case-insensitive)
        if (subjectLower.includes(fileNumberLower)) {
            score = 100;
            method = 'Exakter Match im Betreff';
        } else {
            // Fallback: Regex-Extraktion (lazy - nur einmal ausführen)
            if (extractedNumbers === null) {
                extractedNumbers = extractFileNumberPatterns(subject);
            }

            for (const extracted of extractedNumbers) {
                if (extracted.toLowerCase() === fileNumberLower) {
                    score = 50;
                    method = 'Regex-Extraktion';
                    break;
                }
            }
        }

        // Reverse-Suche: case.name im Betreff
        let caseNameScore = 0;
        if (score === 0) { // Nur wenn kein Aktenzeichen gefunden
            caseNameScore = matchCaseNameInText(item.name, subject);
            if (caseNameScore > 0) {
                score = caseNameScore;
                method = 'case.name im Betreff';
            }
        }

        // Edge-Case: /Name Format im Betreff
        let slashNameScore = 0;
        if (score === 0) { // Nur wenn noch kein Match
            const slashNames = extractSlashNames(subject);
            if (slashNames.length > 0) {
                // Prüfe ob einer der slash-Namen in case.name vorkommt
                for (const name of slashNames) {
                    if (item.name.toLowerCase().includes(name)) {
                        slashNameScore = 35;
                        score = slashNameScore;
                        method = '/Name Format';
                        break;
                    }
                }
            }
        }

        // Empfänger-Matching: Vergleiche mit case.name
        // Prüfe alle Empfänger, nimm höchsten Score
        if (recipients.length > 0) {
            for (const recipient of recipients) {
                const currentRecipientScore = matchRecipientWithCaseName(recipient, item.name);
                if (currentRecipientScore > recipientScore) {
                    recipientScore = currentRecipientScore;
                }
            }
        }

        // Kombiniere Scores:
        // - Aktenzeichen (100-50): Höchste Priorität
        // - case.name Match (45-35): Mittlere Priorität
        // - Empfänger/Slash (40-35): Als Bonus oder Haupt-Score
        let finalScore = score;
        let matchType = method;

        if (score >= 50 && recipientScore > 0) {
            // Aktenzeichen + Empfänger: Bonus
            finalScore = score + Math.round(recipientScore * 0.3);
            matchType = method + ' + Empfänger-Bonus';
        } else if (score > 0 && score < 50 && recipientScore > 0) {
            // case.name/Regex + Empfänger: Addiere beide
            finalScore = score + recipientScore;
            matchType = method + ' + Empfänger';
        } else if (score === 0 && recipientScore > 0) {
            // Nur Empfänger: Verwende Empfänger-Score
            finalScore = recipientScore;
            matchType = 'Empfänger-Match';
        }

        // Sammle alle Matches mit Score > 0
        if (finalScore > 0) {
            allMatches.push({
                item: item,
                score: finalScore,
                method: matchType,
                recipientScore: recipientScore,
                confidence: calculateConfidence(finalScore)
            });
        }
    }

    // Sortiere nach Score (höchster zuerst)
    allMatches.sort((a, b) => b.score - a.score);

    // Gib Top N zurück
    const topMatches = allMatches.slice(0, maxResults);

    console.log(`Gefundene Matches: ${allMatches.length}, Top ${maxResults}:`, topMatches);

    return topMatches;
}

// Funktion: Wählt einen Vorschlag aus und lädt den Case
async function selectSuggestion(match, loginData, tabId) {
    const item = match.item;

    console.log("Vorschlag gewählt - ID: " + item.id);
    console.log("Vorschlag gewählt - Name: " + item.name);
    console.log("Match Score: " + match.score + ", Confidence: " + match.confidence + "%");

    currentSelectedCase = {
        id: item.id,
        name: item.name,
        fileNumber: item.fileNumber
    };

    // Lade Case-Details (metadata bereits vorhanden wenn aus displaySuggestions)
    let caseMetaData;
    if (match.metadata) {
        caseMetaData = match.metadata;
    } else {
        caseMetaData = await getCaseMetaData(item.id, loginData.username, loginData.password, loginData.serverAddress);
    }
    console.log("caseMetaData:", caseMetaData);

    // Aktualisiere den currentSelectedCase mit dem reason
    currentSelectedCase.reason = caseMetaData.reason;

    // Ordner des Cases laden
    caseFolders = await getCaseFolders(item.id, loginData.username, loginData.password, loginData.serverAddress);
    displayTreeStructure(caseFolders);

    // Beteiligte anzeigen
    displayParties(item.id);

    // Label aktualisieren
    const customizableLabel = document.getElementById("customizableLabel");
    if (customizableLabel) {
        customizableLabel.textContent = `${item.fileNumber}: ${item.name} (${caseMetaData.reason || '?'} - ${caseMetaData.lawyer || '?'})`;
    }

    // Automatisch Speichern nach Senden aktivieren
    browser.runtime.sendMessage({
        type: "saveToCaseAfterSend",
        source: "popup_compose",
        content: currentSelectedCase.fileNumber,
        selectedCaseFolderID: selectedCaseFolderID,
        username: loginData.username,
        password: loginData.password,
        serverAddress: loginData.serverAddress,
        currentSelectedCase: currentSelectedCase
    });

    // Feedback anzeigen
    const feedback = document.getElementById("feedback");
    feedback.textContent = "E-Mail wird nach dem Senden in der Akte gespeichert";
    feedback.style.color = "green";

    return {
        id: item.id,
        name: item.name,
        fileNumber: item.fileNumber,
        reason: caseMetaData.reason
    };
}

// Funktion: Zeigt Top-N Vorschläge im UI an
async function displaySuggestions(matches, loginData, tabId) {
    const suggestionsContainer = document.getElementById("suggestionsContainer");
    const suggestionsList = document.getElementById("suggestionsList");

    // Clear existing suggestions
    suggestionsList.innerHTML = '';

    if (!matches || matches.length === 0) {
        suggestionsContainer.style.display = 'block';
        suggestionsList.innerHTML = '<div class="suggestionItem noMatch">❌ Keine Vorschläge gefunden (bitte manuell suchen)</div>';
        return;
    }

    suggestionsContainer.style.display = 'block';

    // Lade Metadata für alle Vorschläge parallel
    console.log("Lade Metadata für Top-3 Vorschläge...");
    const metadataPromises = matches.map(match =>
        getCaseMetaData(match.item.id, loginData.username, loginData.password, loginData.serverAddress)
            .catch(err => {
                console.error(`Fehler beim Laden von Metadata für Case ${match.item.id}:`, err);
                return { reason: '?', lawyer: '?' };
            })
    );

    const metadataResults = await Promise.all(metadataPromises);

    matches.forEach((match, index) => {
        const item = match.item;
        const metadata = metadataResults[index];
        const div = document.createElement("div");
        div.className = "suggestionItem";

        // Confidence-Badge mit Farbe
        let confidenceClass = 'confidence-low';
        if (match.confidence >= 85) confidenceClass = 'confidence-high';
        else if (match.confidence >= 60) confidenceClass = 'confidence-medium';

        // Format (zweizeilig):
        // CaseName (FileNumber)          [XX%]
        // Reason - Lawyer
        div.innerHTML = `
            <span class="caseInfo">
                <strong>${item.name}</strong> (${item.fileNumber})
                <span class="caseDetails">${metadata.reason || '?'} - ${metadata.lawyer || '?'}</span>
            </span>
            <span class="confidenceBadge ${confidenceClass}">${match.confidence}%</span>
        `;

        // Speichere metadata im match-Objekt für später
        match.metadata = metadata;

        // Click-Handler
        div.addEventListener("click", async function() {
            // Entferne vorherige Selektion
            document.querySelectorAll(".suggestionItem").forEach(el => el.classList.remove("selected"));
            // Markiere als ausgewählt
            div.classList.add("selected");

            // Lade Case (metadata bereits vorhanden)
            await selectSuggestion(match, loginData, tabId);
        });

        suggestionsList.appendChild(div);
    });

    // Auto-select first suggestion if confidence >= 85%
    if (matches.length > 0 && matches[0].confidence >= 85) {
        console.log("Auto-selecting top suggestion (confidence >= 85%)");
        setTimeout(() => {
            suggestionsList.firstChild.click();
        }, 100);
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
        
        // Verwende neue Matching-Funktion für Top 3 Vorschläge
        const topMatches = findBestMatchesInSubject(subject, casesArray, composeDetails, 3);

        // Zeige Vorschläge im UI
        await displaySuggestions(topMatches, loginData, tabId);

        // Gib Top-Match zurück (für Kompatibilität)
        if (topMatches.length > 0) {
            return {
                id: topMatches[0].item.id,
                name: topMatches[0].item.name,
                fileNumber: topMatches[0].item.fileNumber
            };
        }

        console.log("Keine Übereinstimmung gefunden");
        return null;

        // LEGACY CODE entfernt - wird nicht mehr verwendet
        /*

        if (matchResult) {
            const item = matchResult.item;

            console.log("Aktenzeichen im Betreff gefunden:", item.fileNumber);
            console.log("Match Score:", matchResult.score);
            console.log("Match Methode:", matchResult.method);

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

            // Betreff aktualisieren, aber nur wenn die Aktenzeichen-Nummer nicht bereits im Betreff enthalten ist
            // (Wir haben bereits oben geprüft, dass die Nummer im Betreff ist, daher aktualisieren wir hier nicht)

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

            return {
                id: item.id,
                name: item.name,
                fileNumber: item.fileNumber,
                reason: caseMetaData.reason
            };
        }

        // Wenn kein Aktenzeichen gefunden wurde
        console.log("Kein Aktenzeichen im Betreff gefunden");
        return null;
        */
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

// Funktion zum Anzeigen des Rename-Dialogs
async function showRenameDialog(originalFilename) {
    return new Promise((resolve) => {
        const dialog = document.getElementById("renameDialog");
        const filenameInput = document.getElementById("filenameInput");
        const filenameSuggestion = document.getElementById("filenameSuggestion");
        const useSuggestionBtn = document.getElementById("useSuggestionBtn");
        const cancelRenameBtn = document.getElementById("cancelRenameBtn");
        const confirmRenameBtn = document.getElementById("confirmRenameBtn");

        // Zeitstempel-basierter Vorschlag
        const now = new Date();
        const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;

        // Dateiendung beibehalten
        const lastDotIndex = originalFilename.lastIndexOf('.');
        const extension = lastDotIndex > 0 ? originalFilename.substring(lastDotIndex) : '';
        const nameWithoutExt = lastDotIndex > 0 ? originalFilename.substring(0, lastDotIndex) : originalFilename;

        const suggestedFilename = `${timestamp}_${nameWithoutExt}${extension}`;

        // UI vorbereiten
        filenameInput.value = originalFilename;
        filenameSuggestion.textContent = suggestedFilename;
        dialog.style.display = "flex";
        filenameInput.focus();
        filenameInput.select();

        // Event Listener (einmalig)
        const cleanup = () => {
            dialog.style.display = "none";
            useSuggestionBtn.replaceWith(useSuggestionBtn.cloneNode(true));
            cancelRenameBtn.replaceWith(cancelRenameBtn.cloneNode(true));
            confirmRenameBtn.replaceWith(confirmRenameBtn.cloneNode(true));
        };

        // Vorschlag verwenden
        document.getElementById("useSuggestionBtn").addEventListener("click", function() {
            cleanup();
            resolve(suggestedFilename);
        }, { once: true });

        // Abbrechen
        document.getElementById("cancelRenameBtn").addEventListener("click", function() {
            cleanup();
            resolve(null); // null = abgebrochen
        }, { once: true });

        // Umbenennen bestätigen
        document.getElementById("confirmRenameBtn").addEventListener("click", function() {
            const newFilename = filenameInput.value.trim();
            cleanup();
            resolve(newFilename || originalFilename);
        }, { once: true });

        // Enter-Taste
        filenameInput.addEventListener("keypress", function(e) {
            if (e.key === "Enter") {
                const newFilename = filenameInput.value.trim();
                cleanup();
                resolve(newFilename || originalFilename);
            }
        }, { once: true });
    });
}