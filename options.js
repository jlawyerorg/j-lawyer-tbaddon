document.getElementById("saveButton").addEventListener("click", function () {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const serverAddress = document.getElementById("serverAddress").value;
  const moveToTrash = document.getElementById("moveToTrash").checked;
  const allowRename = document.getElementById("allowRename").checked;
  const subjectTemplate = document.getElementById("subjectTemplate").value;

  browser.storage.local
    .set({
      username: username,
      password: password,
      serverAddress: serverAddress,
      moveToTrash: moveToTrash,
      allowRename: allowRename,
      subjectTemplate: subjectTemplate,
    })
    .then(() => {
      // Nach dem erfolgreichen Speichern wird der Button-Text geändert => Usability
      // testServerConnection(username, password, serverAddress);
      document.getElementById("saveButton").value = "Login gespeichert";
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
      logWindow.document.write(
        "<html><head><title>Aktivitätsprotokoll</title></head><body>",
      );
      logWindow.document.write("<h2>Aktivitätsprotokoll</h2>");
      logWindow.document.write(
        "<table border='1' style='width:100%; border-collapse: collapse;'>",
      );
      logWindow.document.write(
        "<tr><th>Zeitstempel</th><th>Aktion</th><th>Details</th></tr>",
      );
      activityLog.forEach((entry) => {
        logWindow.document.write("<tr>");
        logWindow.document.write(
          `<td>${new Date(entry.timestamp).toLocaleString()}</td>`,
        );
        logWindow.document.write(`<td>${entry.action}</td>`);
        logWindow.document.write(
          `<td>${JSON.stringify(entry.details, null, 2)}</td>`,
        );
        logWindow.document.write("</tr>");
      });
      logWindow.document.write("</table>");
      logWindow.document.write("</body></html>");
      logWindow.document.close();
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
      "subjectTemplate",
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
      document.getElementById("subjectTemplate").value =
        result.subjectTemplate || "";
    });
});
