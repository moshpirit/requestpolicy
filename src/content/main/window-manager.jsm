/*
 * ***** BEGIN LICENSE BLOCK *****
 *
 * RequestPolicy - A Firefox extension for control over cross-site requests.
 * Copyright (c) 2008-2012 Justin Samuel
 * Copyright (c) 2014-2015 Martin Kimmerle
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more
 * details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see {tag: "http"://www.gnu.org/licenses}.
 *
 * ***** END LICENSE BLOCK *****
 */

let EXPORTED_SYMBOLS = ["rpWindowManager"];

let globalScope = this;


let rpWindowManager = (function(self) {

  const Ci = Components.interfaces;
  const Cc = Components.classes;
  const Cu = Components.utils;

  Cu.import("resource://gre/modules/Services.jsm", globalScope);
  Cu.import("resource://gre/modules/XPCOMUtils.jsm", globalScope);

  Cu.import("chrome://requestpolicy/content/lib/script-loader.jsm", globalScope);
  ScriptLoader.importModules([
    "lib/utils",
    "lib/utils/xul",
    "lib/utils/constants",
    "lib/environment"
  ], globalScope);

  // import the WindowListener
  Services.scriptloader.loadSubScriptWithOptions(
      "chrome://requestpolicy/content/main/window-manager.listener.js",
      {target: globalScope/*, ignoreCache: true*/});

  let styleSheets = [
    "chrome://requestpolicy/skin/requestpolicy.css",
    "chrome://requestpolicy/skin/toolbarbutton.css"
  ];

  let frameScriptURI = "chrome://requestpolicy/content/ui/frame.js?" +
      Math.random();



  function loadIntoWindow(window) {
    // ==================================
    // # 1 : add all XUL elements
    // --------------------------
    try {
      XULUtils.addTreeElementsToWindow(window, "mainTree");
    } catch (e) {
      Logger.warning(Logger.TYPE_ERROR,
                     "Couldn't add tree elements to window.");
    }


    // ==================================
    // # 2 : create a scope variable for RP for this window
    // ----------------------------------------------------
    window.requestpolicy = {};


    // ==================================
    // # 3 : load the overlay's and menu's javascript
    // ----------------------------------------------
    try {
      Services.scriptloader.loadSubScriptWithOptions(
          "chrome://requestpolicy/content/ui/overlay.js",
          {target: window/*, ignoreCache: true*/});
      Services.scriptloader.loadSubScriptWithOptions(
          "chrome://requestpolicy/content/ui/menu.js",
          {target: window/*, ignoreCache: true*/});
      Services.scriptloader.loadSubScriptWithOptions(
          "chrome://requestpolicy/content/ui/classicmenu.js",
          {target: window/*, ignoreCache: true*/});
    } catch (e) {
      Logger.warning(Logger.TYPE_ERROR,
                     "Error loading subscripts for window: " + e, e);
    }


    // ==================================
    // # 4 : toolbar button
    // --------------------
    try {
      self.addToolbarButtonToWindow(window);
    } catch (e) {
      Logger.warning(Logger.TYPE_ERROR, "Error while adding the toolbar " +
                     "button to the window: "+e, e);
    }


    // ==================================
    // # 5 : init the overlay
    // ----------------------
    try {
      // init and onWindowLoad must be called last, because they assume that
      // everything else is ready
      window.requestpolicy.overlay.init();
      window.requestpolicy.overlay.onWindowLoad();
    } catch (e) {
      Logger.warning(Logger.TYPE_ERROR,
                     "An error occurred while initializing the overlay: "+e, e);
    }

    // ==================================
    // # 6 : load frame scripts
    try {
      window.messageManager.loadFrameScript(frameScriptURI, true);
    } catch (e) {
      Logger.warning(Logger.TYPE_ERROR, "Error loading the frame script: "+e,e);
    }
  }

  function unloadFromWindow(window) {
    // # 6 : stop loading framescripts into new tabs
    // --------------------------
    // Note that it's not necessary to tell the framescripts'
    // environments to shut down. Instead:
    // - In case the window is closed, the will shut down on
    //   the ContentFrameMessageManager's "unload" event.
    // - In case the addon is being disabled or firefox gets quit,
    //   the ParentProcessEnvironment will send a message to all
    //   children.
    let mm = window.messageManager;
    mm.removeDelayedFrameScript(frameScriptURI);


    // # 5 : "shutdown" the overlay
    // ----------------------------
    if (window.requestpolicy) {
      window.requestpolicy.overlay.onWindowUnload();
    }


    // # 4 : remove the toolbarbutton
    // ------------------------------
    self.removeToolbarButtonFromWindow(window);


    // # 3 and 2 : remove the `requestpolicy` variable from the window
    // ---------------------------------------------------------
    // This wouldn't be needed when the window is closed, but this has to be
    // done when RP is being disabled.
    delete window.requestpolicy;


    // # 1 : remove all XUL elements
    XULUtils.removeTreeElementsFromWindow(window, "mainTree");
  }





  ProcessEnvironment.addStartupFunction(
      Environment.LEVELS.INTERFACE,
      function(data, reason) {
        forEachOpenWindow(loadIntoWindow);
        WindowListener.setLoadFunction(loadIntoWindow);
        WindowListener.setUnloadFunction(unloadFromWindow);
        WindowListener.startListening();
      });

  ProcessEnvironment.addStartupFunction(Environment.LEVELS.UI, loadStyleSheets);

  ProcessEnvironment.addShutdownFunction(
      Environment.LEVELS.INTERFACE,
      function() {
        forEachOpenWindow(unloadFromWindow);
        WindowListener.stopListening();
      });

  ProcessEnvironment.addShutdownFunction(Environment.LEVELS.UI,
                                         unloadStyleSheets);





  function loadStyleSheets() {
    let styleSheetService = Cc["@mozilla.org/content/style-sheet-service;1"]
        .getService(Ci.nsIStyleSheetService);

    for (let i = 0, len = styleSheets.length; i < len; i++) {
      let styleSheetURI = Services.io.newURI(styleSheets[i], null, null);
      styleSheetService.loadAndRegisterSheet(styleSheetURI,
          styleSheetService.USER_SHEET);
    }
  }
  function unloadStyleSheets() {
    // Unload stylesheets
    let styleSheetService = Cc["@mozilla.org/content/style-sheet-service;1"]
        .getService(Ci.nsIStyleSheetService);

    for (let i = 0, len = styleSheets.length; i < len; i++) {
      let styleSheetURI = Services.io.newURI(styleSheets[i], null, null);
      if (styleSheetService.sheetRegistered(styleSheetURI,
          styleSheetService.USER_SHEET)) {
        styleSheetService.unregisterSheet(styleSheetURI,
            styleSheetService.USER_SHEET);
      }
    }
  }

  function forEachOpenWindow(functionToCall) {
    // Apply a function to all open browser windows
    let windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements()) {
      functionToCall(windows.getNext().QueryInterface(Ci.nsIDOMWindow));
    }
  }


  return self;
}(rpWindowManager || {}));


// extend rpWindowManager
Services.scriptloader.loadSubScriptWithOptions(
    "chrome://requestpolicy/content/main/window-manager-toolbarbutton.js",
    {target: globalScope/*, ignoreCache: true*/});
