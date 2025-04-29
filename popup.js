document.addEventListener('DOMContentLoaded', function() {
    const analyzeBtn = document.getElementById('analyze-btn');
    const insightsDiv = document.getElementById('insights');
    
    analyzeBtn.addEventListener('click', function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "analyzeMeeting"}, function(response) {
          if (response) {
            document.getElementById('meeting-info').innerHTML = `
              <p>Meeting Platform: ${response.platform}</p>
              <p>Participants: ${response.participantCount || 'N/A'}</p>
            `;
            
            const insightsContent = document.getElementById('insights-content');
            insightsContent.innerHTML = `
              <p><strong>Duration:</strong> ${response.duration || 'N/A'}</p>
              <p><strong>Key Topics:</strong> ${response.topics ? response.topics.join(', ') : 'N/A'}</p>
              <p><strong>Action Items:</strong> ${response.actionItems || 'None detected'}</p>
            `;
            
            insightsDiv.classList.remove('hidden');
          }
        });
      });
    });
    
    // Load any saved meeting data
    chrome.storage.local.get(['lastMeeting'], function(result) {
      if (result.lastMeeting) {
        // Display previous meeting data
      }
    });
  });