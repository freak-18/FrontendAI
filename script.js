class ChatApp {
        constructor() {
            this.elements = {
                body: document.body,
                chatContainer: document.getElementById('chat-container'),
                chatInput: document.getElementById('chat-input'),
                sendBtn: document.getElementById('send-btn'),
                newChatBtn: document.getElementById('new-chat-btn'),
                historyContainer: document.getElementById('history-container'),
                fileBtn: document.getElementById('file-btn'),
                fileInput: document.getElementById('file-input'),
                micBtn: document.getElementById('mic-btn'),
                exportChatBtn: document.getElementById('export-chat-btn'),
            };
            this.state = {
                currentSessionId: null,
                isLoading: false,
                isListening: false,
                sessions: this.loadSessions(),
                currentBotMessage: "",
            };
            this.socket = io("https://backendai-m7jb.onrender.com");
            this.init();
        }

        loadSessions() { return JSON.parse(localStorage.getItem('ben_ai_history_v10')) || {}; }
        saveSessions() { localStorage.setItem('ben_ai_history_v10', JSON.stringify(this.state.sessions)); }

        init() {
            this.initSpeechRecognition();
            this.addEventListeners();
            this.initSocketListeners();

            const sessionKeys = Object.keys(this.state.sessions);
            if (sessionKeys.length > 0) {
                this.state.currentSessionId = sessionKeys.sort((a, b) => b.split('_')[1] - a.split('_')[1])[0];
            } else {
                this.handleNewChat(false);
            }
            this.render();
        }

        addEventListeners() {
            this.elements.sendBtn.addEventListener('click', () => this.handleSendMessage());
            this.elements.chatInput.addEventListener('keypress', (e) => e.key === 'Enter' && this.handleSendMessage());
            this.elements.newChatBtn.addEventListener('click', () => this.handleNewChat());
            this.elements.exportChatBtn.addEventListener('click', () => this.handleExportChat());
            this.elements.fileBtn.addEventListener('click', () => this.elements.fileInput.click());
            this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
            this.elements.micBtn.addEventListener('click', () => this.toggleVoice());
            this.elements.historyContainer.addEventListener('click', (e) => {
                const historyButton = e.target.closest('.history-item');
                const deleteButton = e.target.closest('.delete-btn');
                if (deleteButton) { e.stopPropagation(); this.deleteSession(deleteButton.dataset.sessionId); } 
                else if (historyButton) { this.switchSession(historyButton.dataset.sessionId); }
            });
        }
        
        initSocketListeners() {
            this.socket.on("reply", (data) => {
                this.state.currentBotMessage += data.token;
                this.updateLastBotMessage(this.state.currentBotMessage);
            });

            this.socket.on("end", () => {
                this.setLoadingState(false);
                const finalMessage = this.state.currentBotMessage.trim();
                const session = this.state.sessions[this.state.currentSessionId];
                if (session && session.messages.length > 0) {
                    session.messages[session.messages.length - 1].content = finalMessage;
                }
                this.saveSessions();
                this.state.currentBotMessage = "";
                const streamingMessage = document.querySelector('.streaming-message');
                if (streamingMessage) {
                    streamingMessage.classList.remove('streaming-message');
                }
            });

            this.socket.on("error", (data) => {
                const streamingMessage = document.querySelector('.streaming-message');
                if (streamingMessage) {
                    streamingMessage.remove();
                }
                this.addMessageToUI({ role: 'assistant', content: `**Error:** ${data.message}` });
                this.setLoadingState(false);
            });
        }

        render() { this.renderHistory(); this.renderMessages(); }

        renderHistory() {
            this.elements.historyContainer.innerHTML = '';
            const sessions = this.state.sessions;
            const sortedKeys = Object.keys(sessions).sort((a, b) => b.split('_')[1] - a.split('_')[1]);
            
            if (sortedKeys.length > 0) {
                this.elements.historyContainer.innerHTML = '<h2 class="text-xs font-semibold text-slate-500 uppercase tracking-wider px-2 mb-2">History</h2>';
            }

            sortedKeys.forEach(id => {
                const session = sessions[id];
                const isActive = this.state.currentSessionId === id;
                const item = document.createElement('div');
                item.className = `history-item group flex items-center justify-between w-full text-left px-3 py-2 text-sm rounded-lg mb-1 cursor-pointer transition-colors ${isActive ? 'bg-blue-600 text-white font-semibold' : 'text-slate-700 hover:bg-slate-100'}`;
                item.dataset.sessionId = id;
                item.innerHTML = `<span class="truncate">${session.title}</span><button data-session-id="${id}" class="delete-btn p-1 rounded ${isActive ? 'hover:bg-blue-700' : 'hover:bg-slate-200'} opacity-0 group-hover:opacity-100 transition-opacity"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>`;
                this.elements.historyContainer.appendChild(item);
            });
        }

        renderMessages() {
            this.elements.chatContainer.innerHTML = '';
            const session = this.state.sessions[this.state.currentSessionId];
            if (!session || session.messages.length === 0) { this.renderWelcomeScreen(); return; }
            session.messages.forEach(msg => this.addMessageToUI(msg));
            this.scrollToBottom();
        }

        renderWelcomeScreen() {
            this.elements.chatContainer.innerHTML = `<div class="text-center text-slate-500 h-full flex flex-col justify-center items-center"><div class="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg"><span class="text-white text-4xl font-bold">🤖</span></div><h2 class="text-2xl font-bold text-slate-800 mb-2">CRACKIT AI is ready to help</h2></div>`;
        }

        addMessageToUI(message) {
            const { role, content } = message;
            const isUser = role === 'user';
            const msgDiv = document.createElement('div');
            msgDiv.className = `flex gap-3 my-4 max-w-2xl message-bubble ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`;
            
            const avatar = `<div class="w-9 h-9 rounded-full ${isUser ? 'bg-slate-300' : 'bg-blue-600'} flex items-center justify-center text-white font-bold flex-shrink-0 text-xs shadow-md">${isUser ? 'You' : 'AI'}</div>`;
            
            const messageContent = marked.parse(content || "");

            msgDiv.innerHTML = `${avatar}<div class="p-4 rounded-lg shadow-sm ${isUser ? 'bg-blue-600 text-white' : 'bg-white text-slate-800'}"><div class="prose prose-sm max-w-none text-inherit">${messageContent}</div></div>`;
            
            this.elements.chatContainer.appendChild(msgDiv);
            this.scrollToBottom();
        }
        
        updateLastBotMessage(text) {
            let lastBotMsgEl = document.querySelector('.streaming-message');
            if (!lastBotMsgEl) {
                const msgDiv = document.createElement('div');
                msgDiv.className = `flex gap-3 my-4 max-w-2xl message-bubble mr-auto streaming-message`;
                msgDiv.innerHTML = `<div class="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold flex-shrink-0 text-xs shadow-md">AI</div><div class="p-4 rounded-lg shadow-sm bg-white text-slate-800"><div class="prose prose-sm max-w-none text-inherit"><div class="typing-indicator"><span></span><span></span><span></span></div></div></div>`;
                this.elements.chatContainer.appendChild(msgDiv);
                lastBotMsgEl = msgDiv;
            }
            lastBotMsgEl.querySelector('.prose').innerHTML = marked.parse(text + '▌');
            this.scrollToBottom();
        }

        scrollToBottom() { this.elements.chatContainer.scrollTop = this.elements.chatContainer.scrollHeight; }
        setLoadingState(isLoading) { this.state.isLoading = isLoading; this.elements.chatInput.disabled = isLoading; this.elements.sendBtn.disabled = isLoading; }

        sendToBot(text) {
            this.state.currentBotMessage = "";
            this.setLoadingState(true);
            const session = this.state.sessions[this.state.currentSessionId];
            
            // --- CRITICAL FIX ---
            // Create a clean copy of the history *before* the placeholder is added.
            const historyToSend = session.messages.slice(0, -1);
            
            this.socket.emit("chat", { message: text, user_id: "default", memory: historyToSend });
        }

        handleSendMessage(promptOverride = null) {
            const prompt = promptOverride || this.elements.chatInput.value.trim();
            if (!prompt || this.state.isLoading) return;

            const session = this.state.sessions[this.state.currentSessionId];
            if (session.messages.length === 0) { session.title = prompt.substring(0, 35) + (prompt.length > 35 ? '...' : ''); }
            
            const userMessage = { role: 'user', content: prompt };
            session.messages.push(userMessage);
            this.saveSessions();
            this.addMessageToUI(userMessage);
            
            this.elements.chatInput.value = '';
            this.sendToBot(prompt);
            
            // Add a placeholder for the AI's response after sending the message
            session.messages.push({ role: 'assistant', content: '' });
        }

        handleNewChat(render = true) {
            const newSessionId = `session_${Date.now()}`;
            this.state.sessions[newSessionId] = { title: "New Chat", messages: [] };
            this.state.currentSessionId = newSessionId;
            this.saveSessions();
            if(render) this.render();
        }

        switchSession(sessionId) { this.state.currentSessionId = sessionId; this.render(); }

        deleteSession(sessionId) {
            delete this.state.sessions[sessionId];
            if (this.state.currentSessionId === sessionId) {
                const remainingKeys = Object.keys(this.state.sessions).sort((a, b) => b.split('_')[1] - a.split('_')[1]);
                this.state.currentSessionId = remainingKeys.length > 0 ? remainingKeys[0] : null;
                if (!this.state.currentSessionId) { this.handleNewChat(false); }
            }
            this.saveSessions();
            this.render();
        }

        async handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            this.addMessageToUI({ role: 'assistant', content: 'Analyzing image...' });
            try {
                const worker = await Tesseract.createWorker();
                await worker.load();
                await worker.loadLanguage('eng');
                await worker.initialize('eng');
                const { data: { text } } = await worker.recognize(file);
                await worker.terminate();
                
                if (text && text.trim()) {
                    this.handleSendMessage(`[Image Content]: ${text.trim()}`);
                } else {
                    this.addMessageToUI({ role: 'assistant', content: 'Could not extract text from the image.' });
                }
            } catch (error) {
                console.error("OCR Error:", error);
                this.addMessageToUI({ role: 'assistant', content: 'An error occurred during image processing.' });
            }
        }

        initSpeechRecognition() {
            try {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                this.recognition = new SpeechRecognition();
                this.recognition.continuous = false;
                this.recognition.lang = 'en-US';
                
                this.recognition.onstart = () => {
                    this.state.isListening = true;
                    this.elements.micBtn.classList.add('mic-listening');
                };

                this.recognition.onend = () => {
                    this.state.isListening = false;
                    this.elements.micBtn.classList.remove('mic-listening');
                };

                this.recognition.onresult = (event) => {
                    const transcript = event.results[event.results.length - 1][0].transcript.trim();
                    this.elements.chatInput.value = transcript;
                    this.handleSendMessage();
                };

                this.recognition.onerror = (event) => {
                    console.error("Voice recognition error:", event.error);
                    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                        alert("Microphone permission was denied. Please allow microphone access in your browser settings.");
                    }
                };
            } catch (e) {
                console.warn("SpeechRecognition not supported");
                this.elements.micBtn.style.display = 'none';
            }
        }

        toggleVoice() {
            if (!this.recognition) return;
            if (this.state.isListening) {
                this.recognition.stop();
            } else {
                try { this.recognition.start(); } 
                catch(e) { console.error("Could not start recognition:", e); }
            }
        }
        
        handleExportChat() {
            const session = this.state.sessions[this.state.currentSessionId];
            if (!session || session.messages.length === 0) {
                alert("Nothing to export!");
                return;
            }

            let chatContent = `Chat Title: ${session.title}\n`;
            chatContent += `Exported on: ${new Date().toLocaleString()}\n`;
            chatContent += "========================================\n\n";

            session.messages.forEach(msg => {
                const prefix = msg.role === 'user' ? 'You' : 'AI';
                chatContent += `${prefix}:\n${msg.content}\n\n`;
                chatContent += "----------------------------------------\n\n";
            });

            const blob = new Blob([chatContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${session.title.replace(/ /g, '_')}.txt`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    }

    new ChatApp();