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


let currentSelectedCase = null; 
let caseMetaData = {};



document.addEventListener('DOMContentLoaded', function () {
    const userSelect = document.getElementById('userSelect');
    const categorySelect = document.getElementById('categorySelect');
    const calendarSelect = document.getElementById('calendarSelect');
    const form = document.querySelector('form');
    const datumInput = document.getElementById('datum');
    const uhrzeitInput = document.getElementById('uhrzeit');
    const uhrzeitLabel = document.querySelector('label[for="uhrzeit"]');
    const endzeitInput = document.getElementById('endzeit');
    const endzeitLabel = document.querySelector('label[for="endzeit"]');
    const locationInput = document.getElementById('location');
    const beschreibungTextarea = document.getElementById('beschreibung');

    // Referenzen auf die optgroups    
    const fristOptgroup = document.getElementById('fristOptgroup');
    const eventOptgroup = document.getElementById('eventOptgroup');
    const followUpOptgroup = document.getElementById('followUpOptgroup');

    
    // Lade die Nutzer aus dem Speicher und füge sie hinzu
    browser
        .storage
        .local
        .get('users')   
        .then(storage => {
            console.log("Nutzer:", storage.users);
            addOptionsToUserSelect(userSelect, storage.users);
        });
   
 

    // Setze das Mindestdatum auf das heutige Datum
    datumInput.min = new Date().toISOString().split('T')[0];

    categorySelect.addEventListener('change', function () {
        const category = categorySelect.value.toLowerCase();
    
        // Leeren der vorhandenen Optionen aus allen optgroups
        for (const optgroup of calendarSelect.getElementsByTagName('optgroup')) {
            while (optgroup.firstChild) {
                optgroup.removeChild(optgroup.firstChild);
            }
        }
    
        // Verstecke die Zeitfelder standardmäßig
        uhrzeitInput.style.display = 'none';
        uhrzeitLabel.style.display = 'none';
        endzeitInput.style.display = 'none';
        endzeitLabel.style.display = 'none';
    
        // Lade Kalenderdaten aus dem Speicher und füge sie hinzu
        if (category === 'termin') {
            // Zeige die Zeitfelder für "Termin"
            uhrzeitInput.style.display = 'block';
            uhrzeitLabel.style.display = 'block';
            endzeitInput.style.display = 'block';
            endzeitLabel.style.display = 'block';
    
            // Lade eventCalendars aus dem Speicher
            browser.storage.local.get('eventCalendars').then(storage => {
                addOptionsToOptgroup(eventOptgroup, storage.eventCalendars);
            });
        } else if (category === 'wiedervorlage') {
            // Lade followUpCalendars aus dem Speicher
            browser.storage.local.get('followUpCalendars').then(storage => {
                addOptionsToOptgroup(followUpOptgroup, storage.followUpCalendars);
            });
        } else if (category === 'frist') {
            // Lade respiteCalendars aus dem Speicher
            browser.storage.local.get('respiteCalendars').then(storage => {
                addOptionsToOptgroup(fristOptgroup, storage.respiteCalendars);
            });
        }
    });
    
    
    

    form.addEventListener('submit', function (event) {
        event.preventDefault();

        // aktualsiere feedback in cal.html
        const feedback = document.getElementById('feedback');
        feedback.textContent = 'Gespeichert!';

        // Gebe die Werte in der Konsole aus
        console.log('Kategorie:', categorySelect.value);
        console.log('Verantwortlicher:', userSelect.value);
        console.log('Datum:', datumInput.value);
        if (categorySelect.value === 'termin') {
            console.log('Uhrzeit:', uhrzeitInput.value);
            console.log('Endzeit:', endzeitInput.value);
        }
        console.log('Kalender:', calendarSelect.value);
        console.log('Kalender-Name:', calendarSelect.options[calendarSelect.selectedIndex].text);
        console.log('Ort:', location.value)
        console.log('Beschreibung:', beschreibungTextarea.value);

        console.log('Akte-ID:', currentSelectedCase); 

        // Speichere die Werte in Variablen
        let calAssignee = userSelect.value
        let calCalendar= calendarSelect.value
        let calDescription = ""
        let beginDateUTC = ""
        let endDateUTC = ""        
        let calSummary = beschreibungTextarea.value

        let calType; 
        if (categorySelect.value === 'termin') {
            calType = 'EVENT';
            if (datumInput.value === "") {
                feedback.textContent = 'Bitte ein Datum angeben!';
                return
            }            
            if (uhrzeitInput.value === "") {
                feedback.textContent = 'Bitte eine Uhrzeit/Startzeit angeben!';
                return
            }
            if (endzeitInput.value === "") {
                feedback.textContent = 'Bitte eine Endzeit angeben!';
                return
            }
            beginDateUTC = convertToUTC(datumInput.value, uhrzeitInput.value)
            endDateUTC = convertToUTC(datumInput.value, endzeitInput.value)
        } else if (categorySelect.value === 'frist') {
            calType = 'RESPITE';
            beginDateUTC = convertToUTC(datumInput.value, "23:00")
            endDateUTC = convertToUTC(datumInput.value, "22:59")
        }
        else if (categorySelect.value === 'wiedervorlage') {
            calType = 'FOLLOW_UP';
            beginDateUTC = convertToUTC(datumInput.value, "23:00")
            endDateUTC = convertToUTC(datumInput.value, "22:59")
        } 



        // Kalendereintrag speichern
        setDueDate(calAssignee, beginDateUTC, calCalendar, endDateUTC, calSummary, locationInput.value, calType);
        logActivity('Kalendereintrag erstellt', {calAssignee, calCalendar, calSummary, calType})

    });

    // Initialisiere die Seite mit der Standardkategorie
    categorySelect.dispatchEvent(new Event('change'));
});


async function addOptionsToUserSelect(selectElement, users) {
    users.forEach(userName => {
        
        const option = document.createElement('option');
        option.textContent = userName;
        option.value = userName; // Optional
        selectElement.appendChild(option);
        
    });
}


async function addOptionsToOptgroup(optgroup, calendars) {
    calendars.forEach(calendar => {
        const option = document.createElement('option');
        option.value = calendar.id;
        option.textContent = calendar.displayName;
        optgroup.appendChild(option);
    });
}














// ----------------------- SUCHFUNKTION ----------------------- //


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
    // die gespeicherten Daten aus browser.storage.local abrufen
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

    const resultsListElement = document.getElementById("resultsList");
    // Zuerst den Inhalt von resultsList leeren
    while (resultsListElement.firstChild) {
        resultsListElement.removeChild(resultsListElement.firstChild);
    }

    results.forEach(item => {
        const div = document.createElement("div");
        div.className = "resultItem";
        div.setAttribute("data-id", item.id);
        div.setAttribute("data-tooltip", "Lädt...");
        div.textContent = `${item.name} (${item.fileNumber})`;
        resultsListElement.appendChild(div);
    });

    

    // Event-Listener für das Klicken auf ein Ergebniselement
    document.querySelectorAll(".resultItem").forEach(item => {
        item.addEventListener("click", async function() {
            currentSelectedCase = {
                id: this.getAttribute("data-id"),
                name: this.textContent.split(" (")[0],
                fileNumber: this.textContent.split("(")[1].split(")")[0]
            };
            caseMetaData = await getCaseMetaData(currentSelectedCase.id, loginData.username, loginData.password, loginData.serverAddress);
           
            console.log("Ausgewählter Fall:", currentSelectedCase);
            
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




// Funktion zum Konvertieren eines Datumsstrings in ein UTC-Datum
function convertToUTC(dateString, timeString) {
    // Kombiniert das Datum und die Uhrzeit zu einem vollständigen Datumsstring
    const dateTimeString = `${dateString}T${timeString}:00`;

    // Erstellt ein neues Date-Objekt aus dem kombinierten String
    const utcDate = new Date(dateTimeString);

    // Konvertiert das Datum in das ISO-Format und fügt 'Z[UTC]' hinzu
    const utcString = utcDate.toISOString().replace('.000', '') + '[UTC]';

    return utcString;
}










// ----------------------- KALENDEREINTRAG SPEICHERN ----------------------- //

async function setDueDate(calAssignee, calBeginDate, calCalendar, calEndDate, calSummary, calLocation, calType) {
    
    const loginData = await browser.storage.local.get(["username", "password", "serverAddress"]);
    const headers = new Headers();
    const loginBase64Encoded = btoa(unescape(encodeURIComponent(loginData.username + ':' + loginData.password)));
    headers.append('Authorization', 'Basic ' + loginBase64Encoded);
    // headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
    headers.append('Content-Type', 'application/json');


    const url = loginData.serverAddress + "/j-lawyer-io/rest/v6/cases/duedate/create"

    // den Payload erstellen
    const payload = {
        assignee: calAssignee,
        beginDate: calBeginDate,
        calendar: calCalendar,
        caseId: currentSelectedCase.id,
        description: "",
        done: false,
        endDate: calEndDate,
        location: calLocation,
        summary: calSummary,
        type: calType
    };

    console.log("Payload:", payload);

    fetch(url, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(payload)
    }).then(response => {
        if (!response.ok) {
            console.log(response)
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