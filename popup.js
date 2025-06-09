class MeetingSummaryPopup {
    constructor() {
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSettings();
        this.updateUI();
    }

    bindEvents() {
        document.getElementById('startBtn').addEventListener('click', () => this.startRecording());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopRecording());
        document.getElementById('summarizeBtn').addEventListener('click', () => this.generateSummary());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportSummary());
        document.getElementById('apiKey').addEventListener('input', (e) => this.saveApiKey(e.target.value));
        document.getElementById('autoSummarize').addEventListener('change', (e) => this.saveSettings());
        document.getElementById('language').addEventListener('change', (e) => this.saveSettings());
        
        // Check microphone permissions on load
        this.checkMicrophonePermissions();
    }

    async startRecording() {
        try {
            // First check if we're in a secure context
            if (!window.isSecureContext) {
                throw new Error('Microphone access requires HTTPS or localhost');
            }

            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Media devices not supported in this browser');
            }

            this.showStatus('Requesting microphone access...', 'processing');

            // Request microphone with specific constraints
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000,
                    channelCount: 1
                } 
            });
            
            // Check if we got a valid stream
            if (!stream || stream.getAudioTracks().length === 0) {
                throw new Error('No audio tracks available');
            }

            this.showStatus('Microphone access granted, starting recording...', 'processing');
            
            // Try different MIME types in order of preference
            const mimeTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/mp4',
                'audio/wav'
            ];

            let selectedMimeType = null;
            for (const mimeType of mimeTypes) {
                if (MediaRecorder.isTypeSupported(mimeType)) {
                    selectedMimeType = mimeType;
                    break;
                }
            }

            if (!selectedMimeType) {
                throw new Error('No supported audio format found');
            }

            console.log('Using MIME type:', selectedMimeType);
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: selectedMimeType
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                    console.log('Audio chunk received:', event.data.size, 'bytes');
                }
            };
            
            this.mediaRecorder.onstop = () => {
                console.log('Recording stopped, processing audio...');
                const audioBlob = new Blob(this.audioChunks, { type: selectedMimeType });
                console.log('Audio blob created:', audioBlob.size, 'bytes');
                this.processAudio(audioBlob);
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                this.showStatus(`Recording error: ${event.error.message}`, 'error');
            };
            
            this.mediaRecorder.start(1000); // Record in 1-second chunks
            this.isRecording = true;
            this.updateUI();
            this.showStatus('Recording in progress...', 'recording');
            
            // Auto-stop after 2 hours max
            this.recordingTimeout = setTimeout(() => {
                if (this.isRecording) {
                    console.log('Auto-stopping recording after 2 hours');
                    this.stopRecording();
                }
            }, 2 * 60 * 60 * 1000);
            
        } catch (error) {
            console.error('Error starting recording:', error);
            let errorMessage = 'Could not access microphone';
            
            if (error.name === 'NotAllowedError') {
                errorMessage = 'Microphone access denied. Please allow microphone permissions and try again.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'No microphone found. Please connect a microphone and try again.';
            } else if (error.name === 'NotReadableError') {
                errorMessage = 'Microphone is being used by another application.';
            } else if (error.name === 'OverconstrainedError') {
                errorMessage = 'Microphone constraints not supported.';
            } else if (error.name === 'SecurityError') {
                errorMessage = 'Microphone access blocked due to security policy.';
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            this.showStatus(errorMessage, 'error');
            this.isRecording = false;
            this.updateUI();
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.isRecording = false;
            
            // Clear timeout
            if (this.recordingTimeout) {
                clearTimeout(this.recordingTimeout);
                this.recordingTimeout = null;
            }
            
            this.updateUI();
            this.showStatus('Processing audio...', 'processing');
        }
    }

    async processAudio(audioBlob) {
        try {
            const apiKey = await this.getApiKey();
            if (!apiKey) {
                this.showStatus('Please enter your OpenAI API key', 'error');
                return;
            }

            if (!audioBlob || audioBlob.size === 0) {
                throw new Error('No audio data recorded');
            }

            console.log('Processing audio blob:', audioBlob.size, 'bytes, type:', audioBlob.type);
            this.showStatus('Transcribing audio with Whisper AI...', 'processing');

            // Convert audio blob to a format suitable for Whisper
            const formData = new FormData();
            formData.append('file', audioBlob, 'recording.webm');
            formData.append('model', 'whisper-1');
            formData.append('response_format', 'json');
            
            const language = document.getElementById('language').value;
            if (language !== 'auto') {
                formData.append('language', language);
            }

            // Transcribe with Whisper
            const transcribeResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                body: formData
            });

            if (!transcribeResponse.ok) {
                const errorData = await transcribeResponse.json().catch(() => ({}));
                throw new Error(`Transcription failed: ${transcribeResponse.status} ${transcribeResponse.statusText}. ${errorData.error?.message || ''}`);
            }

            const transcriptionData = await transcribeResponse.json();
            const transcript = transcriptionData.text;

            if (!transcript || transcript.trim().length === 0) {
                throw new Error('No speech detected in the recording');
            }

            console.log('Transcription successful:', transcript.length, 'characters');

            // Save transcript
            await this.saveTranscript(transcript);
            
            // Auto-summarize if enabled
            if (document.getElementById('autoSummarize').checked) {
                await this.generateSummaryFromTranscript(transcript);
            } else {
                this.showTranscript(transcript);
                document.getElementById('summarizeBtn').disabled = false;
                this.showStatus('Transcription complete! Click "Generate Summary" for AI summary.', 'success');
            }

        } catch (error) {
            console.error('Error processing audio:', error);
            let errorMessage = `Error: ${error.message}`;
            
            if (error.message.includes('401')) {
                errorMessage = 'Invalid API key. Please check your OpenAI API key.';
            } else if (error.message.includes('429')) {
                errorMessage = 'API rate limit exceeded. Please try again later.';
            } else if (error.message.includes('insufficient_quota')) {
                errorMessage = 'Insufficient OpenAI credits. Please add credits to your account.';
            }
            
            this.showStatus(errorMessage, 'error');
        }
    }

    async generateSummary() {
        const transcript = await this.getTranscript();
        if (transcript) {
            await this.generateSummaryFromTranscript(transcript);
        }
    }

    async generateSummaryFromTranscript(transcript) {
        try {
            const apiKey = await this.getApiKey();
            if (!apiKey) {
                this.showStatus('Please enter your OpenAI API key', 'error');
                return;
            }

            this.showStatus('Generating summary...', 'processing');

            const summaryPrompt = `Please provide a comprehensive summary of this meeting transcript. Include:

1. **Key Discussion Points**: Main topics discussed
2. **Decisions Made**: Any concrete decisions or agreements
3. **Action Items**: Tasks assigned with responsible parties (if mentioned)
4. **Important Dates/Deadlines**: Any mentioned dates or deadlines
5. **Follow-up Items**: Things that need further discussion

Transcript:
${transcript}

Please format the summary in a clear, organized manner with bullet points where appropriate.`;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'user',
                            content: summaryPrompt
                        }
                    ],
                    max_tokens: 1000,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                throw new Error(`Summary generation failed: ${response.statusText}`);
            }

            const data = await response.json();
            const summary = data.choices[0].message.content;

            this.showSummary(summary, transcript);
            await this.saveSummary(summary);
            this.showStatus('Summary generated successfully!', 'success');

        } catch (error) {
            console.error('Error generating summary:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
        }
    }

    showSummary(summary, transcript) {
        document.getElementById('summaryContent').innerHTML = this.formatSummary(summary);
        document.getElementById('transcriptContent').textContent = transcript;
        document.getElementById('summarySection').style.display = 'block';
    }

    showTranscript(transcript) {
        document.getElementById('transcriptContent').textContent = transcript;
        document.getElementById('summarySection').style.display = 'block';
        document.getElementById('summaryContent').innerHTML = '<em>Click "Generate Summary" to create a summary</em>';
    }

    formatSummary(summary) {
        // Convert markdown-like formatting to HTML
        return summary
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^/, '<p>')
            .replace(/$/, '</p>');
    }

    exportSummary() {
        const summary = document.getElementById('summaryContent').textContent;
        const transcript = document.getElementById('transcriptContent').textContent;
        
        const exportData = {
            timestamp: new Date().toISOString(),
            summary: summary,
            transcript: transcript
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `meeting-summary-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    updateUI() {
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');

        if (this.isRecording) {
            statusIndicator.className = 'status-indicator recording';
            statusText.textContent = 'Recording in progress...';
            startBtn.disabled = true;
            stopBtn.disabled = false;
        } else {
            statusIndicator.className = 'status-indicator idle';
            statusText.textContent = 'Ready to record';
            startBtn.disabled = false;
            stopBtn.disabled = true;
        }
    }

    showStatus(message, type) {
        const statusText = document.getElementById('statusText');
        const statusIndicator = document.getElementById('statusIndicator');
        const troubleshooting = document.getElementById('troubleshooting');
        
        statusText.textContent = message;
        statusIndicator.className = `status-indicator ${type}`;
        
        // Show troubleshooting for microphone errors
        if (type === 'error' && message.toLowerCase().includes('microphone')) {
            troubleshooting.style.display = 'block';
        } else {
            troubleshooting.style.display = 'none';
        }
        
        if (type === 'success') {
            setTimeout(() => {
                this.updateUI();
            }, 3000);
        }
    }

    async checkMicrophonePermissions() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                this.showStatus('Media devices not supported', 'error');
                return;
            }

            // Check if we're in a secure context
            if (!window.isSecureContext) {
                this.showStatus('Requires HTTPS connection', 'error');
                return;
            }

            // Try to get permission state
            if (navigator.permissions && navigator.permissions.query) {
                const result = await navigator.permissions.query({ name: 'microphone' });
                if (result.state === 'denied') {
                    this.showStatus('Microphone access denied', 'error');
                } else if (result.state === 'granted') {
                    this.showStatus('Microphone access granted', 'success');
                } else {
                    this.showStatus('Ready to record (will request microphone access)', 'idle');
                }
            }
        } catch (error) {
            console.log('Could not check microphone permissions:', error);
        }
    }

    // Storage methods
    async saveApiKey(apiKey) {
        await chrome.storage.local.set({ apiKey });
    }

    async getApiKey() {
        const result = await chrome.storage.local.get('apiKey');
        return result.apiKey;
    }

    async saveTranscript(transcript) {
        const timestamp = new Date().toISOString();
        await chrome.storage.local.set({ 
            lastTranscript: transcript,
            lastTranscriptTime: timestamp
        });
    }

    async getTranscript() {
        const result = await chrome.storage.local.get('lastTranscript');
        return result.lastTranscript;
    }

    async saveSummary(summary) {
        const timestamp = new Date().toISOString();
        await chrome.storage.local.set({ 
            lastSummary: summary,
            lastSummaryTime: timestamp
        });
    }

    async saveSettings() {
        const settings = {
            autoSummarize: document.getElementById('autoSummarize').checked,
            language: document.getElementById('language').value
        };
        await chrome.storage.local.set({ settings });
    }

    async loadSettings() {
        const result = await chrome.storage.local.get(['settings', 'apiKey']);
        
        if (result.settings) {
            document.getElementById('autoSummarize').checked = result.settings.autoSummarize;
            document.getElementById('language').value = result.settings.language;
        }
        
        if (result.apiKey) {
            document.getElementById('apiKey').value = result.apiKey;
        }
    }
}

// Initialize the popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MeetingSummaryPopup();
});