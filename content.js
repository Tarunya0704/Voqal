// Content script for Meeting Summary AI Extension
// Injects into meeting platforms to enhance functionality

class MeetingContentScript {
    constructor() {
        this.platform = null;
        this.isInjected = false;
        this.init();
    }

    init() {
        if (this.isInjected) return;
        this.isInjected = true;

        this.detectPlatform();
        this.injectUI();
        this.setupEventListeners();
        this.observeMeetingState();
    }

    detectPlatform() {
        const url = window.location.href.toLowerCase();
        
        if (url.includes('meet.google.com')) {
            this.platform = 'google-meet';
        } else if (url.includes('zoom.us')) {
            this.platform = 'zoom';
        } else if (url.includes('teams.microsoft.com')) {
            this.platform = 'microsoft-teams';
        } else if (url.includes('webex.com')) {
            this.platform = 'webex';
        } else if (url.includes('whereby.com')) {
            this.platform = 'whereby';
        } else if (url.includes('jitsi')) {
            this.platform = 'jitsi';
        } else {
            this.platform = 'unknown';
        }
        
        console.log('Detected meeting platform:', this.platform);
    }

    injectUI() {
        // Create floating button for quick access
        const floatingButton = this.createFloatingButton();
        document.body.appendChild(floatingButton);

        // Inject meeting info banner if in active meeting
        setTimeout(() => {
            if (this.isMeetingActive()) {
                this.injectMeetingBanner();
            }
        }, 2000);
    }

    createFloatingButton() {
        const button = document.createElement('div');
        button.id = 'meeting-summary-float-btn';
        button.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 50px;
                padding: 12px 20px;
                cursor: pointer;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-weight: 600;
                font-size: 14px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                backdrop-filter: blur(10px);
                transition: all 0.3s ease;
                user-select: none;
                display: flex;
                align-items: center;
                gap: 8px;
            " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 25px rgba(0,0,0,0.4)'"
               onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 20px rgba(0,0,0,0.3)'"
               onclick="window.meetingSummaryExtension.toggleRecording()">
                <span style="font-size: 16px;">🎤</span>
                <span id="meeting-btn-text">Start Recording</span>
            </div>
        `;
        return button;
    }

    injectMeetingBanner() {
        const banner = document.createElement('div');
        banner.id = 'meeting-summary-banner';
        banner.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                z-index: 9999;
                background: rgba(102, 126, 234, 0.95);
                color: white;
                padding: 10px 20px;
                text-align: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                backdrop-filter: blur(10px);
                border-bottom: 1px solid rgba(255,255,255,0.2);
            ">
                <span>📝 Meeting Summary AI is ready to transcribe this meeting</span>
                <button onclick="this.parentElement.parentElement.remove()" style="
                    background: none;
                    border: none;
                    color: white;
                    font-size: 18px;
                    cursor: pointer;
                    margin-left: 15px;
                    padding: 0;
                ">×</button>
            </div>
        `;
        document.body.appendChild(banner);

        // Auto-hide banner after 10 seconds
        setTimeout(() => {
            const bannerEl = document.getElementById('meeting-summary-banner');
            if (bannerEl) {
                bannerEl.style.opacity = '0';
                bannerEl.style.transition = 'opacity 0.5s ease';
                setTimeout(() => bannerEl.remove(), 500);
            }
        }, 10000);
    }

    setupEventListeners() {
        // Listen for meeting state changes
        this.observeMeetingChanges();
        
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
        });

        // Expose global functions for UI interactions
        window.meetingSummaryExtension = {
            toggleRecording: () => this.toggleRecording(),
            startRecording: () => this.startRecording(),
            stopRecording: () => this.stopRecording(),
            getCurrentMeetingInfo: () => this.getCurrentMeetingInfo()
        };
    }

    observeMeetingState() {
        // Set up observers for different platforms
        switch (this.platform) {
            case 'google-meet':
                this.observeGoogleMeet();
                break;
            case 'zoom':
                this.observeZoom();
                break;
            case 'microsoft-teams':
                this.observeTeams();
                break;
            default:
                this.observeGeneric();
        }
    }

    observeGoogleMeet() {
        // Watch for Google Meet specific elements
        const observer = new MutationObserver((mutations) => {
            // Check for meeting start/end indicators
            const meetingElements = document.querySelectorAll('[data-meeting-title], [jsname="HlFzId"]');
            if (meetingElements.length > 0) {
                this.onMeetingStateChange('active');
            }

            // Check for participant changes
            const participantCount = document.querySelectorAll('[data-participant-id]').length;
            if (participantCount > 0) {
                this.updateParticipantInfo(participantCount);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });
    }

    observeZoom() {
        // Watch for Zoom specific elements
        const observer = new MutationObserver((mutations) => {
            const meetingContainer = document.querySelector('#meeting-app, .meeting-app');
            if (meetingContainer) {
                this.onMeetingStateChange('active');
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    observeTeams() {
        // Watch for Teams specific elements
        const observer = new MutationObserver((mutations) => {
            const callContainer = document.querySelector('[data-tid="calling-app"], .ts-calling-screen');
            if (callContainer) {
                this.onMeetingStateChange('active');
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    observeGeneric() {
        // Generic observer for unknown platforms
        const observer = new MutationObserver((mutations) => {
            // Look for common video/audio elements
            const mediaElements = document.querySelectorAll('video, audio');
            if (mediaElements.length > 0) {
                this.onMeetingStateChange('possible');
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    isMeetingActive() {
        switch (this.platform) {
            case 'google-meet':
                return document.querySelector('[data-meeting-title], [jsname="HlFzId"]') !== null;
            case 'zoom':
                return document.querySelector('#meeting-app, .meeting-app') !== null;
            case 'microsoft-teams':
                return document.querySelector('[data-tid="calling-app"], .ts-calling-screen') !== null;
            default:
                return document.querySelectorAll('video, audio').length > 0;
        }
    }

    getCurrentMeetingInfo() {
        const info = {
            platform: this.platform,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            isActive: this.isMeetingActive()
        };

        // Try to extract meeting title
        switch (this.platform) {
            case 'google-meet':
                const title = document.querySelector('[data-meeting-title]');
                if (title) info.title = title.textContent;
                break;
            case 'zoom':
                const zoomTitle = document.querySelector('.meeting-title, .meeting-topic');
                if (zoomTitle) info.title = zoomTitle.textContent;
                break;
            case 'microsoft-teams':
                const teamsTitle = document.querySelector('[data-tid="meeting-title"]');
                if (teamsTitle) info.title = teamsTitle.textContent;
                break;
        }

        // Try to get participant count
        const participants = this.getParticipantCount();
        if (participants > 0) info.participantCount = participants;

        return info;
    }

    getParticipantCount() {
        switch (this.platform) {
            case 'google-meet':
                return document.querySelectorAll('[data-participant-id]').length;
            case 'zoom':
                const zoomParticipants = document.querySelector('.participants-count');
                return zoomParticipants ? parseInt(zoomParticipants.textContent) : 0;
            case 'microsoft-teams':
                return document.querySelectorAll('[data-tid="participant-item"]').length;
            default:
                return 0;
        }
    }

    async toggleRecording() {
        const response = await chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' });
        
        if (response.success && response.data.isRecording) {
            await this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            const meetingInfo = this.getCurrentMeetingInfo();
            const response = await chrome.runtime.sendMessage({ 
                type: 'START_RECORDING',
                options: { meetingInfo }
            });

            if (response.success) {
                this.updateRecordingUI(true);
                this.showNotification('Recording started', 'success');
            } else {
                this.showNotification('Failed to start recording', 'error');
            }
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showNotification('Error starting recording', 'error');
        }
    }

    async stopRecording() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });

            if (response.success) {
                this.updateRecordingUI(false);
                this.showNotification('Recording stopped', 'success');
            } else {
                this.showNotification('Failed to stop recording', 'error');
            }
        } catch (error) {
            console.error('Error stopping recording:', error);
            this.showNotification('Error stopping recording', 'error');
        }
    }

    updateRecordingUI(isRecording) {
        const button = document.getElementById('meeting-summary-float-btn');
        const buttonText = document.getElementById('meeting-btn-text');
        
        if (button && buttonText) {
            if (isRecording) {
                button.style.background = 'linear-gradient(135deg, #ff4757 0%, #ff3742 100%)';
                buttonText.textContent = 'Stop Recording';
                button.style.animation = 'pulse 2s infinite';
            } else {
                button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                buttonText.textContent = 'Start Recording';
                button.style.animation = 'none';
            }
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.innerHTML = `
            <div style="
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 10001;
                background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                backdrop-filter: blur(10px);
                opacity: 0;
                transform: translateX(100%);
                transition: all 0.3s ease;
            ">${message}</div>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.firstElementChild.style.opacity = '1';
            notification.firstElementChild.style.transform = 'translateX(0)';
        }, 100);
        
        // Animate out and remove
        setTimeout(() => {
            notification.firstElementChild.style.opacity = '0';
            notification.firstElementChild.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    onMeetingStateChange(state) {
        console.log('Meeting state changed:', state);
        // Could trigger automatic recording based on settings
    }

    updateParticipantInfo(count) {
        // Update participant count in UI if needed
        console.log('Participant count:', count);
    }

    handleMessage(message, sender, sendResponse) {
        switch (message.type) {
            case 'GET_MEETING_INFO':
                sendResponse({ success: true, data: this.getCurrentMeetingInfo() });
                break;
            case 'INJECT_RECORDING_UI':
                this.updateRecordingUI(message.isRecording);
                sendResponse({ success: true });
                break;
            default:
                sendResponse({ success: false, error: 'Unknown message type' });
        }
    }

    observeMeetingChanges() {
        // Listen for URL changes (for SPAs)
        let currentUrl = window.location.href;
        const urlObserver = new MutationObserver(() => {
            if (window.location.href !== currentUrl) {
                currentUrl = window.location.href;
                this.detectPlatform();
            }
        });
        
        urlObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

// Initialize content script
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new MeetingContentScript();
    });
} else {
    new MeetingContentScript();
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.7; }
        100% { opacity: 1; }
    }
`;
document.head.appendChild(style);