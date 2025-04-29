
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "storeMeetingData") {
      chrome.storage.local.set({lastMeeting: request.data});
    }
  });