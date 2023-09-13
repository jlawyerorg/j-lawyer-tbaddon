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


document.addEventListener("DOMContentLoaded", function() {
    const recommendCaseButton = document.getElementById("recommendCaseButton"); 
    const feedback = document.getElementById("feedback");
    const customizableLabel = document.getElementById("customizableLabel"); 
    const updateDataButton = document.getElementById("updateDataButton");
    const saveAttachmentsButton = document.getElementById("saveAttachmentsButton");
    
    
    fillTagsList();
    findFileNumberInRawMessage()

    // Setzt den Fokus auf das Suchfeld
    document.getElementById("searchInput").focus();    
    
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
                    content: currentSelectedCase.fileNumber, 
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
        saveAttachmentsButton.addEventListener("click", function() {
            
            const feedback = document.getElementById("feedback");

            browser.storage.local.get(["username", "password", "serverAddress"]).then(result => {
                browser.runtime.sendMessage({
                    type: "saveAttachments",
                    content: currentSelectedCase.fileNumber, 
                    username: result.username,
                    password: result.password,
                    serverAddress: result.serverAddress
                });

                // Setzt das Feedback zurück, während auf eine Antwort gewartet wird
                feedback.textContent = "Speichern...";
                feedback.style.color = "blue";
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
        updateDataButton.addEventListener("click", function() {
            fillTagsList();
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
                getTags(result.username, result.password, result.serverAddress);
                fillTagsList();
                feedback.textContent = "Daten aktualisiert!";
                feedback.style.color = "green";
            });            
        });
    }

    // Code, um die options.html in einem neuen Tab zu öffnen
    const settingsButton = document.getElementById("settingsButton");
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


async function findFileNumberInRawMessage() {
    // Nachrichteninhalt abrufen
    const messageData = await getDisplayedMessageFromActiveTab();
    console.log("Message Id: " + messageData.id);
  
    let rawMessage = await messenger.messages.getRaw(messageData.id);
    
    // die gespeicherte Daten aus browser.storage.local abrufen
    let storedData = await browser.storage.local.get("cases");
    
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

        // aktualisieren des Label "Recommended Case" mit dem gefundenen Aktenzeichen
        const customizableLabel = document.getElementById("customizableLabel");
        customizableLabel.textContent = item.name + ": " + item.fileNumber;

        return {
          id: item.id,
          name: item.name
        };
      }
    }
    console.log("Keine Übereinstimmung gefunden");
    return null;
}

function getDisplayedMessageFromActiveTab() {
    return browser.mailTabs.query({active: true, currentWindow: true})
    .then((tabs) => {
        if (tabs.length === 0) {
            // Wenn kein aktiver mailTab gefunden wird, versuchen Sie, den aktiven Tab im Fenster abzurufen
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


function getTags(username, password, serverAddress) {
    const url = serverAddress + '/j-lawyer-io/rest/v7/configuration/optiongroups/document.tags';
  
    const headers = new Headers();
    headers.append('Authorization', 'Basic ' + btoa(''+username+':'+ password+''));
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
        document.getElementById("resultsList").innerHTML = "";
    }
});



// Funktion zum Suchen von Fällen
async function searchCases(query) {
    document.getElementById("resultsList").style.display = "block";
    let storedData = await browser.storage.local.get("cases");
    let casesArray = storedData.cases;

    query = query.toUpperCase();
    let results = casesArray.filter(item => item.name.toUpperCase().includes(query));

    // Ergebnisse basierend auf der längsten aufeinanderfolgenden Übereinstimmungslänge bewerten und sortieren
    results = results.map(item => {
        return {
            ...item,
            matchLength: getConsecutiveMatchCount(item.name, query)
        };
    }).filter(item => item.matchLength > 0) // (Optional) Nur Ergebnisse mit einer Mindestübereinstimmungslänge anzeigen
    .sort((a, b) => b.matchLength - a.matchLength);

    let resultsHTML = "";
    results.forEach(item => {
        resultsHTML += `<div class="resultItem" data-id="${item.id}">${item.name} (${item.fileNumber})</div>`;
    });

    document.getElementById("resultsList").innerHTML = resultsHTML;

    // Event-Listener für das Klicken auf ein Ergebniselement
    document.querySelectorAll(".resultItem").forEach(item => {
        item.addEventListener("click", function() {
            currentSelectedCase = {
                id: this.getAttribute("data-id"),
                name: this.textContent.split(" (")[0],
                fileNumber: this.textContent.split("(")[1].split(")")[0]
            };
            console.log("Ausgewählter Fall:", currentSelectedCase);
            
            document.getElementById("resultsList").style.display = "none";

            // aktualisieren des Label "Recommended Case" mit der gefundenen Akte
            const customizableLabel = document.getElementById("customizableLabel");
            customizableLabel.textContent = currentSelectedCase.fileNumber + ": " + currentSelectedCase.name;
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
function fillTagsList() {
    
    browser.storage.local.get("documentTags").then(result => {
        const tagsSelect = document.getElementById("tagsSelect");
        if (result.documentTags && result.documentTags.length > 0) {
            result.documentTags.forEach(tag => {
                const option = document.createElement("option");
                option.value = tag;
                option.text = tag;
                tagsSelect.appendChild(option);
            });
        }
    });
}
