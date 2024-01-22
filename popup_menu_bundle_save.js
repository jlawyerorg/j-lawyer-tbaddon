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


//  ************************* ZUORDNEN DIALOG *************************

let currentSelectedCase = null;  // Speichert den aktuell ausgewählten Case
let selectedIndex = -1; // Tastaturnavigation durch Suchergebnisse
let currentMessageToSaveID = null;  // Speichert die ID der Nachricht, die gespeichert werden soll
let caseFolders = {};  // Speichert die Ordner des aktuell ausgewählten Cases
let selectedCaseFolderID = null;  // Speichert den aktuell ausgewählten Ordner des aktuell ausgewählten Cases


document.addEventListener("DOMContentLoaded", async function () {
    const recommendCaseButton = document.getElementById("recommendCaseButton");
    const feedback = document.getElementById("feedback");
    const customizableLabel = document.getElementById("customizableLabel");
    const updateDataButton = document.getElementById("updateDataButton");


    await fillTagsList();

    // Setzt den Fokus auf das Suchfeld
    document.getElementById("searchInput").focus();

    // Code für den recommendCaseButton
    if (recommendCaseButton && customizableLabel) {
        recommendCaseButton.addEventListener("click", function () {

            if (!currentSelectedCase) {
                feedback.textContent = "Kein passendes Aktenzeichen gefunden!";
                feedback.style.color = "red";
                return;
            }

            browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
                browser.runtime.sendMessage({
                    type: "case",
                    source:  "popup_menu_bundle_save",
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


    // Speichern der ausgewählten Etiketten in "selectedTags"
    const tagsSelect = document.getElementById("tagsSelect");
    let selectedTags = [];
    tagsSelect.addEventListener("change", function () {
        selectedTags = Array.from(tagsSelect.selectedOptions).map(option => option.value);
        console.log("Ausgewählte Tags:", selectedTags);
        browser.storage.local.set({
            selectedTags: selectedTags
        });
    });


    // Event Listener für den "Daten aktualisieren" Button
    if (updateDataButton) {
        updateDataButton.addEventListener("click", async function () {
            browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
                feedback.textContent = "Daten werden aktualisiert...";
                feedback.style.color = "blue";
                getTags(result.username, result.password, result.serverAddress).then(() => {
                    fillTagsList();
                    feedback.textContent = "Daten aktualisiert!";
                    feedback.style.color = "green";
                });
                getCasesFromSelection(result.username, result.password, result.serverAddress).then(data => {
                    const casesRaw = data;
                    browser.storage.local.set({
                        cases: casesRaw
                    });
                    console.log("Cases heruntergeladen: " + casesRaw);
                    feedback.textContent = "Daten aktualisiert!";
                    feedback.style.color = "green";
                });
                
                
                feedback.textContent = "Daten aktualisiert!";
                feedback.style.color = "green";
            });
            
        });
        
    }

    // Code, um die options.html in einem neuen Tab zu öffnen
    const settingsButton = document.getElementById("settingsButton");
    if (settingsButton) {
        settingsButton.addEventListener("click", function () {
            browser.tabs.create({ url: "options.html" });
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


// Event-Listener für die Tastaturnavigation durch Suchergebnisse
document.addEventListener("keydown", function (event) {
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
            browser.storage.local.set({ 'documentTags': valuesArray });
            return valuesArray;
        });
}



// Event-Listener für die Suche
document.getElementById("searchInput").addEventListener("input", function () {
    const query = this.value.trim();
    if (query) {
        searchCases(query);
    } else {
        document.getElementById("resultsList").innerHTML = "";
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
        item.fileNumber.toUpperCase().includes(query)
    );

    // Ergebnisse basierend auf der längsten aufeinanderfolgenden Übereinstimmungslänge bewerten und sortieren
    results = results.map(item => {
        let nameMatchLength = getConsecutiveMatchCount(item.name.toUpperCase(), query);
        let fileNumberMatchLength = getConsecutiveMatchCount(item.fileNumber, query);
        return {
            ...item,
            matchLength: Math.max(nameMatchLength, fileNumberMatchLength)
        };
    }).filter(item => item.matchLength > 0)
    .sort((a, b) => b.matchLength - a.matchLength);

    let resultsHTML = "";
    results.forEach(item => {
        resultsHTML += `<div class="resultItem" data-id="${item.id}" data-tooltip="Lädt...">${item.name} (${item.fileNumber})</div>`;
    });

    document.getElementById("resultsList").innerHTML = resultsHTML;

    // Event-Listener für das Klicken auf ein Ergebniselement
    document.querySelectorAll(".resultItem").forEach(item => {
        item.addEventListener("click", async function () {
            currentSelectedCase = {
                id: this.getAttribute("data-id"),
                name: this.textContent.split(" (")[0],
                fileNumber: this.textContent.split("(")[1].split(")")[0]
            };
            
            caseMetaData = await getCaseMetaData(currentSelectedCase.id, loginData.username, loginData.password, loginData.serverAddress);
            
            console.log("Ausgewählter Fall:", currentSelectedCase);

            caseFolders = await getCaseFolders(currentSelectedCase.id, loginData.username, loginData.password, loginData.serverAddress);        
            console.log("caseFolders: " + caseFolders);
            displayTreeStructure(caseFolders);

            document.getElementById("resultsList").style.display = "none";

            // aktualisieren des Label "Recommended Case" mit der gefundenen Akte
            const customizableLabel = document.getElementById("customizableLabel");
            customizableLabel.textContent = currentSelectedCase.fileNumber + ": " + currentSelectedCase.name + " (" + caseMetaData.reason + " - " + caseMetaData.lawyer + ")";
        });
        item.addEventListener("mouseover", async function() {
            const caseId = this.getAttribute("data-id");
            const metaData = await getCaseMetaData(caseId, loginData.username, loginData.password, loginData.serverAddress);
            this.setAttribute("data-tooltip", metaData.reason);
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