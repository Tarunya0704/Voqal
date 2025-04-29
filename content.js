// Detect meeting platforms and extract basic info
function detectMeetingPlatform() {
    if (window.location.hostname.includes('meet.google.com')) {
      return {
        platform: 'Google Meet',
        participantCount: document.querySelectorAll('[data-participant-id]').length
      };
    } else if (window.location.hostname.includes('zoom.us')) {
      return {
        platform: 'Zoom',
        participantCount: document.querySelectorAll('.participants-item').length
      };
    } else if (window.location.hostname.includes('teams.microsoft.com')) {
      return {
        platform: 'Microsoft Teams',
        participantCount: document.querySelectorAll('.ts-participant-name').length
      };
    }
    return null;
  }
  
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action === "analyzeMeeting") {
      const meetingData = detectMeetingPlatform();
      
      // Simulate analysis (in a real extension, you'd call your API here)
      const insights = {
        duration: "45 minutes",
        topics: ["Project timeline", "Budget review", "Q2 goals"],
        actionItems: ["John to send report by Friday", "Team to review proposal"]
      };
      
      sendResponse({
        ...meetingData,
        ...insights
      });
    }
  });