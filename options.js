document.getElementById("saveButton").addEventListener("click", function () {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const serverAddress = document.getElementById("serverAddress").value;
  const moveToTrash = document.getElementById("moveToTrash").checked;
  const allowRename = document.getElementById("allowRename").checked;
  const performOcr = document.getElementById("performOcr").checked;
  const subjectTemplate = document.getElementById("subjectTemplate").value;
  const filenameTemplate = document.getElementById("filenameTemplate").value;

  browser.storage.local
    .set({
      username: username,
      password: password,
      serverAddress: serverAddress,
      moveToTrash: moveToTrash,
      allowRename: allowRename,
      performOcr: performOcr,
      subjectTemplate: subjectTemplate,
      filenameTemplate: filenameTemplate,
    })
    .then(() => {
      // Nach dem erfolgreichen Speichern wird der Button-Text geändert => Usability
      // testServerConnection(username, password, serverAddress);
      document.getElementById("saveButton").value = "gespeichert";
    });
});

document
  .getElementById("viewLogButton")
  .addEventListener("click", async function () {
    let activityLog = await browser.storage.local.get("activityLog");
    activityLog = activityLog.activityLog || [];
    if (activityLog.length === 0) {
      alert("Keine Aktivitäten protokolliert.");
    } else {
      const logWindow = window.open("", "Activity Log", "width=600,height=400");
      const logDocument = logWindow.document;
      logDocument.title = "Aktivitätsprotokoll";

      logDocument.body.style.fontFamily = "Arial, sans-serif";
      logDocument.body.style.backgroundColor = "#ffffff";
      logDocument.body.style.color = "#000000";
      logDocument.body.style.margin = "8px";

      const heading = logDocument.createElement("h2");
      heading.textContent = "Aktivitätsprotokoll";
      logDocument.body.appendChild(heading);

      const table = logDocument.createElement("table");
      table.setAttribute("border", "1");
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      table.style.backgroundColor = "#ffffff";
      table.style.color = "#000000";

      const headerRow = logDocument.createElement("tr");
      ["Zeitstempel", "Aktion", "Details"].forEach((headerText) => {
        const headerCell = logDocument.createElement("th");
        headerCell.textContent = headerText;
        headerCell.style.padding = "4px";
        headerCell.style.backgroundColor = "#f2f2f2";
        headerRow.appendChild(headerCell);
      });
      table.appendChild(headerRow);

      activityLog.forEach((entry) => {
        const row = logDocument.createElement("tr");
        const timestampCell = logDocument.createElement("td");
        const actionCell = logDocument.createElement("td");
        const detailsCell = logDocument.createElement("td");

        timestampCell.textContent = new Date(entry.timestamp).toLocaleString();
        actionCell.textContent = entry.action;
        detailsCell.textContent = JSON.stringify(entry.details, null, 2);

        timestampCell.style.padding = "4px";
        actionCell.style.padding = "4px";
        detailsCell.style.padding = "4px";
        detailsCell.style.whiteSpace = "pre-wrap";

        row.appendChild(timestampCell);
        row.appendChild(actionCell);
        row.appendChild(detailsCell);
        table.appendChild(row);
      });

      logDocument.body.appendChild(table);
    }
  });

document
  .getElementById("clearLogButton")
  .addEventListener("click", async function () {
    await browser.storage.local.remove("activityLog");
    alert("Aktivitätsprotokoll gelöscht");
  });

document
  .getElementById("viewUpdatesButton")
  .addEventListener("click", function () {
    window.open("updates.html", "_blank");
  });

// Beim Laden der Optionen-Seite, werden die gespeicherten Werte in die Eingabefelder gesetzt
document.addEventListener("DOMContentLoaded", function () {
  browser.storage.local
    .get([
      "username",
      "password",
      "serverAddress",
      "moveToTrash",
      "allowRename",
      "performOcr",
      "subjectTemplate",
      "filenameTemplate",
    ])
    .then((result) => {
      document.getElementById("username").value = result.username || "";
      document.getElementById("password").value = result.password || "";
      document.getElementById("serverAddress").value =
        result.serverAddress || "";
      document.getElementById("moveToTrash").checked =
        result.moveToTrash || false;
      document.getElementById("allowRename").checked =
        result.allowRename || false;
      document.getElementById("performOcr").checked =
        result.performOcr || false;
      document.getElementById("subjectTemplate").value =
        result.subjectTemplate || "";
      document.getElementById("filenameTemplate").value =
        result.filenameTemplate || "";
    });
});
