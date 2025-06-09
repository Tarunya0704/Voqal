// Background service worker for Meeting Summary AI Extension

class MeetingSummaryBackground {
    constructor() {
        this.init();
    }

    init() {
        // Listen for extension installation
        chrome.runtime.onInstalled.addListener(() => {
            console.log('Meeting Summary AI Extension installed');
            this.initializeSettings();
        });

        // Listen for messages from content scripts or popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });

        // Listen for tab updates to inject content script if needed
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                this.handleTabUpdate(tabId, tab);
            }
        });

        // Handle extension icon click
        chrome.action.onClicked.addListener((tab) => {
            this.handleIconClick(tab);
        });
    }

    async initializeSettings() {
        const defaultSettings = {
            autoSummarize: true,
            language: 'auto',
            maxRecordingDuration: 7200, // 2 hours in seconds
            autoDetectMeetings: true,
            summaryFormat: 'detailed'
        };

        try {
            const existing = await chrome.storage.local.get('settings');
            if (!existing.settings) {
                await chrome.storage.local.set({ settings: defaultSettings });
            }
        } catch (error) {
            console.error('Error initializing settings:', error);
        }
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'GET_RECORDING_STATE':
                    const state = await this.getRecordingState();
                    sendResponse({ success: true, data: state });
                    break;

                case 'START_RECORDING':
                    const startResult = await this.startRecording(message.options);
                    sendResponse(startResult);
                    break;

                case 'STOP_RECORDING':
                    const stopResult = await this.stopRecording();
                    sendResponse(stopResult);
                    break;

                case 'PROCESS_AUDIO':
                    const processResult = await this.processAudioData(message.audioData);
                    sendResponse(processResult);
                    break;

                case 'SAVE_MEETING_DATA':
                    const saveResult = await this.saveMeetingData(message.data);
                    sendResponse(saveResult);
                    break;

                case 'GET_MEETING_HISTORY':
                    const history = await this.getMeetingHistory();
                    sendResponse({ success: true, data: history });
                    break;

                case 'DETECT_MEETING_PLATFORM':
                    const platform = await this.detectMeetingPlatform(sender.tab);
                    sendResponse({ success: true, platform });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async handleTabUpdate(tabId, tab) {
        // Check if the tab is a known meeting platform
        const meetingPlatforms = [
            'meet.google.com',
            'zoom.us',
            'teams.microsoft.com',
            'webex.com',
            'whereby.com',
            'jitsi.org'
        ];

        const isMeetingPlatform = meetingPlatforms.some(platform => 
            tab.url && tab.url.includes(platform)
        );

        if (isMeetingPlatform) {
            try {
                // Inject content script if not already present
                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['content.js']
                });

                // Update badge to indicate meeting detected
                chrome.action.setBadgeText({
                    text: '●',
                    tabId: tabId
                });
                chrome.action.setBadgeBackgroundColor({
                    color: '#4CAF50',
                    tabId: tabId
                });

                // Send notification about meeting detection
                this.notifyMeetingDetected(tab.url);
            } catch (error) {
                console.error('Error injecting content script:', error);
            }
        } else {
            // Clear badge for non-meeting tabs
            chrome.action.setBadgeText({
                text: '',
                tabId: tabId
            });
        }
    }

    async handleIconClick(tab) {
        // Open popup or perform default action
        console.log('Extension icon clicked on tab:', tab.url);
    }

    async getRecordingState() {
        try {
            const result = await chrome.storage.local.get('recordingState');
            return result.recordingState || { isRecording: false };
        } catch (error) {
            console.error('Error getting recording state:', error);
            return { isRecording: false };
        }
    }

    async startRecording(options = {}) {
        try {
            const recordingState = {
                isRecording: true,
                startTime: Date.now(),
                options: options
            };

            await chrome.storage.local.set({ recordingState });

            // Set badge to indicate recording
            chrome.action.setBadgeText({ text: 'REC' });
            chrome.action.setBadgeBackgroundColor({ color: '#FF5722' });

            return { success: true, message: 'Recording started' };
        } catch (error) {
            console.error('Error starting recording:', error);
            return { success: false, error: error.message };
        }
    }

    async stopRecording() {
        try {
            const recordingState = {
                isRecording: false,
                stopTime: Date.now()
            };

            await chrome.storage.local.set({ recordingState });

            // Clear recording badge
            chrome.action.setBadgeText({ text: '' });

            return { success: true, message: 'Recording stopped' };
        } catch (error) {
            console.error('Error stopping recording:', error);
            return { success: false, error: error.message };
        }
    }

    async processAudioData(audioData) {
        try {
            // This would be called from the popup to process recorded audio
            // The actual processing happens in the popup script
            return { success: true, message: 'Audio processing initiated' };
        } catch (error) {
            console.error('Error processing audio:', error);
            return { success: false, error: error.message };
        }
    }

    async saveMeetingData(data) {
        try {
            const timestamp = Date.now();
            const meetingId = `meeting_${timestamp}`;
            
            const meetingData = {
                id: meetingId,
                timestamp: timestamp,
                date: new Date().toISOString(),
                ...data
            };

            // Get existing meetings
            const result = await chrome.storage.local.get('meetings');
            const meetings = result.meetings || [];
            
            // Add new meeting
            meetings.unshift(meetingData);
            
            // Keep only last 50 meetings
            if (meetings.length > 50) {
                meetings.splice(50);
            }

            await chrome.storage.local.set({ meetings });

            return { success: true, meetingId };
        } catch (error) {
            console.error('Error saving meeting data:', error);
            return { success: false, error: error.message };
        }
    }

    async getMeetingHistory() {
        try {
            const result = await chrome.storage.local.get('meetings');
            return result.meetings || [];
        } catch (error) {
            console.error('Error getting meeting history:', error);
            return [];
        }
    }

    async detectMeetingPlatform(tab) {
        if (!tab || !tab.url) return 'unknown';

        const url = tab.url.toLowerCase();
        
        if (url.includes('meet.google.com')) return 'google-meet';
        if (url.includes('zoom.us')) return 'zoom';
        if (url.includes('teams.microsoft.com')) return 'microsoft-teams';
        if (url.includes('webex.com')) return 'webex';
        if (url.includes('whereby.com')) return 'whereby';
        if (url.includes('jitsi')) return 'jitsi';
        
        return 'unknown';
    }

    async notifyMeetingDetected(url) {
        try {
            const settings = await chrome.storage.local.get('settings');
            if (settings.settings && settings.settings.autoDetectMeetings) {
                // Could show a notification here if permissions allow
                console.log('Meeting platform detected:', url);
            }
        } catch (error) {
            console.error('Error showing meeting notification:', error);
        }
    }

    // Utility methods
    async clearOldData() {
        try {
            const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
            const result = await chrome.storage.local.get('meetings');
            const meetings = result.meetings || [];
            
            const recentMeetings = meetings.filter(meeting => 
                meeting.timestamp > thirtyDaysAgo
            );
            
            await chrome.storage.local.set({ meetings: recentMeetings });
        } catch (error) {
            console.error('Error clearing old data:', error);
        }
    }
}

// Initialize the background service worker
new MeetingSummaryBackground();

// Clean up old data periodically
setInterval(async () => {
    const background = new MeetingSummaryBackground();
    await background.clearOldData();
}, 24 * 60 * 60 * 1000); // Once per day