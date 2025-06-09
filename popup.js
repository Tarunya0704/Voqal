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
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000
                } 
            });
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.processAudio(audioBlob);
            };
            
            this.mediaRecorder.start(1000); // Record in 1-second chunks
            this.isRecording = true;
            this.updateUI();
            
            // Auto-stop after 2 hours max
            setTimeout(() => {
                if (this.isRecording) {
                    this.stopRecording();
                }
            }, 2 * 60 * 60 * 1000);
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showStatus('Error: Could not access microphone', 'error');
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.isRecording = false;
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

            // Convert audio to the format expected by Whisper
            const audioBuffer = await audioBlob.arrayBuffer();
            const formData = new FormData();
            formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'audio.wav');
            formData.append('model', 'whisper-1');
            
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
                throw new Error(`Transcription failed: ${transcribeResponse.statusText}`);
            }

            const transcriptionData = await transcribeResponse.json();
            const transcript = transcriptionData.text;

            // Save transcript
            await this.saveTranscript(transcript);
            
            // Auto-summarize if enabled
            if (document.getElementById('autoSummarize').checked) {
                await this.generateSummaryFromTranscript(transcript);
            } else {
                this.showTranscript(transcript);
                document.getElementById('summarizeBtn').disabled = false;
            }

        } catch (error) {
            console.error('Error processing audio:', error);
            this.showStatus(`Error: ${error.message}`, 'error');
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
        
        statusText.textContent = message;
        statusIndicator.className = `status-indicator ${type}`;
        
        if (type === 'success') {
            setTimeout(() => {
                this.updateUI();
            }, 3000);
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