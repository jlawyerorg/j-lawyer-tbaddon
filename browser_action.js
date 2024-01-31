browser.browserAction.onClicked.addListener(() => {
    browser.windows.create({
      url: "cal.html",
      type: "detached_panel", // oder "popup"
      width: 420, 
      height: 870  
    });
  });
  