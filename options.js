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