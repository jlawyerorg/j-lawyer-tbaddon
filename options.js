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



document.getElementById("saveButton").addEventListener("click", function () {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const serverAddress = document.getElementById("serverAddress").value;

  browser.storage.local.set({
    username: username,
    password: password,
    serverAddress: serverAddress,
  }).then(() => {  // Nach dem erfolgreichen Speichern wird der Button-Text geändert => Usability
    // testServerConnection(username, password, serverAddress);
    document.getElementById("saveButton").value = "Login gespeichert";
  });
});

document.getElementById("viewLogButton").addEventListener("click", async function () {
    let activityLog = await browser.storage.local.get("activityLog");
    activityLog = activityLog.activityLog || [];
    if (activityLog.length === 0) {
        alert("Keine Aktivitäten protokolliert.");
    } else {
        const logWindow = window.open("", "Activity Log", "width=600,height=400");
        logWindow.document.write("<html><head><title>Aktivitätsprotokoll</title></head><body>");
        logWindow.document.write("<h2>Aktivitätsprotokoll</h2>");
        logWindow.document.write("<table border='1' style='width:100%; border-collapse: collapse;'>");
        logWindow.document.write("<tr><th>Zeitstempel</th><th>Aktion</th><th>Details</th></tr>");
        activityLog.forEach(entry => {
            logWindow.document.write("<tr>");
            logWindow.document.write(`<td>${new Date(entry.timestamp).toLocaleString()}</td>`);
            logWindow.document.write(`<td>${entry.action}</td>`);
            logWindow.document.write(`<td>${JSON.stringify(entry.details, null, 2)}</td>`);
            logWindow.document.write("</tr>");
        });
        logWindow.document.write("</table>");
        logWindow.document.write("</body></html>");
        logWindow.document.close();
    }
});

document.getElementById("clearLogButton").addEventListener("click", async function () {
    await browser.storage.local.remove("activityLog");
    alert("Aktivitätsprotokoll gelöscht");
});

// Beim Laden der Optionen-Seite, werden die gespeicherten Werte in die Eingabefelder gesetzt
document.addEventListener("DOMContentLoaded", function () {
  browser.storage.local.get(["username", "password", "serverAddress", "documentTag"]).then(result => {
    document.getElementById("username").value = result.username || "";
    document.getElementById("password").value = result.password || "";
    document.getElementById("serverAddress").value = result.serverAddress || "";
  });
});



// function testServerConnection(username, password, serverAddress) {
//   const url = serverAddress + '/j-lawyer-io/rest/v6/security/users';

//   const headers = new Headers();
//   headers.append('Authorization', 'Basic ' + btoa('' + username + ':' + password + ''));
//   headers.append('Content-Type', 'application/json');

//   return fetch(url, {
//     method: 'GET',
//     headers: headers
//   }).then(response => {
//     if (!response.ok) {
//       document.getElementById("testServerConnection").value = "Verbindung gescheitert";
//       throw new Error('Network response was not ok');
//     }
//     document.getElementById("testServerConnection").value = "Verbindung erfolgreich";
//     return response.json();
//   });
// }