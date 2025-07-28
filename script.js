class ParticleNetwork {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.particles = [];
            this.resize();
            window.addEventListener('resize', () => this.resize());
        }

        resize() {
            this.canvas.width = this.canvas.offsetWidth;
            this.canvas.height = this.canvas.offsetHeight;
            this.createParticles();
        }

        createParticles() {
            this.particles = [];
            const particleCount = Math.floor(this.canvas.width * this.canvas.height / 15000);
            for (let i = 0; i < particleCount; i++) {
                this.particles.push({
                    x: Math.random() * this.canvas.width,
                    y: Math.random() * this.canvas.height,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: (Math.random() - 0.5) * 0.5,
                    size: Math.random() * 2 + 1
                });
            }
        }

        animate() {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
                if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;

                this.ctx.fillStyle = 'rgba(59, 130, 246, 0.5)';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            });

            this.drawLines();
            requestAnimationFrame(() => this.animate());
        }

        drawLines() {
            for (let i = 0; i < this.particles.length; i++) {
                for (let j = i + 1; j < this.particles.length; j++) {
                    const p1 = this.particles[i];
                    const p2 = this.particles[j];
                    const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                    if (dist < 120) {
                        this.ctx.strokeStyle = `rgba(59, 130, 246, ${1 - dist / 120})`;
                        this.ctx.lineWidth = 0.5;
                        this.ctx.beginPath();
                        this.ctx.moveTo(p1.x, p1.y);
                        this.ctx.lineTo(p2.x, p2.y);
                        this.ctx.stroke();
                    }
                }
            }
        }
    }

    class ChatApp {
        constructor() {
            this.elements = {
                chatCanvas: document.getElementById('chat-canvas'),
                chatInput: document.getElementById('chat-input'),
                sendBtn: document.getElementById('send-btn'),
                newChatBtn: document.getElementById('new-chat-btn'),
                historyContainer: document.getElementById('history-container'),
                fileBtn: document.getElementById('file-btn'),
                fileInput: document.getElementById('file-input'),
                micBtn: document.getElementById('mic-btn'),
                exportChatBtn: document.getElementById('export-chat-btn'),
                sidebar: document.getElementById('sidebar'),
                openSidebarBtn: document.getElementById('open-sidebar-btn'),
                closeSidebarBtn: document.getElementById('close-sidebar-btn'),
                orb: document.getElementById('orb'),
                backgroundCanvas: document.getElementById('background-canvas'),
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

        loadSessions() {
            const key = 'crackit_ai_sessions_v2'; // Using a new key to avoid conflicts
            try {
                const sessions = localStorage.getItem(key);
                return sessions ? JSON.parse(sessions) : {};
            } catch (e) {
                console.error("Failed to parse chat history from localStorage:", e);
                localStorage.removeItem(key);
                return {};
            }
        }
        saveSessions() {
            const key = 'crackit_ai_sessions_v2';
            localStorage.setItem(key, JSON.stringify(this.state.sessions));
        }

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
            const particleNetwork = new ParticleNetwork(this.elements.backgroundCanvas);
            particleNetwork.animate();
        }
        
        addEventListeners() {
            this.elements.sendBtn.addEventListener('click', () => this.handleSendMessage());
            this.elements.chatInput.addEventListener('keypress', (e) => e.key === 'Enter' && this.handleSendMessage());
            this.elements.newChatBtn.addEventListener('click', () => this.handleNewChat());
            this.elements.exportChatBtn.addEventListener('click', () => this.handleExportChat());
            this.elements.fileBtn.addEventListener('click', () => this.elements.fileInput.click());
            this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
            this.elements.micBtn.addEventListener('click', () => this.toggleVoice());
            this.elements.openSidebarBtn.addEventListener('click', () => this.elements.sidebar.classList.remove('-translate-x-full'));
            this.elements.closeSidebarBtn.addEventListener('click', () => this.elements.sidebar.classList.add('-translate-x-full'));
            this.elements.historyContainer.addEventListener('click', (e) => {
                const historyButton = e.target.closest('.history-item');
                const deleteButton = e.target.closest('.delete-btn');
                if (deleteButton) { 
                    e.stopPropagation(); 
                    this.deleteSession(deleteButton.dataset.sessionId); 
                } 
                else if (historyButton) { 
                    this.switchSession(historyButton.dataset.sessionId); 
                }
            });
            this.elements.chatCanvas.addEventListener('click', (e) => {
                if (e.target.classList.contains('chat-bubble') || e.target.closest('.chat-bubble')) {
                    this.focusBubble(e.target.closest('.chat-bubble'));
                } else {
                    this.unfocusAllBubbles();
                }
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
                if (streamingMessage) streamingMessage.remove();
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
                this.elements.historyContainer.innerHTML = '<h2 class="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">History</h2>';
            }
            sortedKeys.forEach(id => {
                const session = sessions[id];
                const isActive = this.state.currentSessionId === id;
                const item = document.createElement('div');
                item.className = `history-item group flex items-center justify-between w-full text-left px-3 py-2 text-sm rounded-lg mb-1 cursor-pointer transition-colors ${isActive ? 'bg-blue-600 text-white font-semibold shadow-md' : 'text-slate-300 hover:bg-slate-800'}`;
                item.dataset.sessionId = id;
                item.innerHTML = `<span class="truncate">${session.title}</span><button data-session-id="${id}" class="delete-btn p-1 rounded ${isActive ? 'hover:bg-blue-700' : 'hover:bg-slate-700'} opacity-0 group-hover:opacity-100 transition-opacity"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>`;
                this.elements.historyContainer.appendChild(item);
            });
        }

        renderMessages() {
            Array.from(this.elements.chatCanvas.children).forEach(child => {
                if (child.id !== 'orb' && child.id !== 'background-canvas') child.remove();
            });
            const session = this.state.sessions[this.state.currentSessionId];
            if (!session || session.messages.length === 0) { 
                this.elements.orb.classList.remove('loading');
                return; 
            }
            session.messages.forEach(msg => this.addMessageToUI(msg));
        }

        addMessageToUI(message) {
            const { role, content } = message;
            const isUser = role === 'user';
            const msgDiv = document.createElement('div');
            msgDiv.className = `chat-bubble absolute w-64 p-4 rounded-2xl shadow-2xl transition-all duration-500 bg-slate-800/50 backdrop-blur-md border border-slate-700/80 z-20`;
            
            const avatar = `<div class="w-8 h-8 rounded-full ${isUser ? 'bg-slate-500' : 'bg-gradient-to-br from-blue-500 to-indigo-600'} flex items-center justify-center text-white font-bold flex-shrink-0 text-xs shadow-md">${isUser ? 'You' : 'AI'}</div>`;
            const messageContent = `<div class="bubble-content max-h-32 overflow-y-auto mt-2 text-sm text-slate-200 prose prose-sm prose-invert max-w-none">${marked.parse(content || "")}</div>`;
            
            msgDiv.innerHTML = `<div class="flex items-center gap-3">${avatar}<h3 class="font-semibold">${isUser ? 'Your Question' : 'AI Response'}</h3></div>${messageContent}`;
            
            this.positionBubble(msgDiv, role);
            this.elements.chatCanvas.appendChild(msgDiv);
        }
        
        positionBubble(element, role) {
            const canvas = this.elements.chatCanvas;
            const rect = canvas.getBoundingClientRect();
            const isUser = role === 'user';
            
            const userBubbles = document.querySelectorAll('.user-bubble').length;
            const aiBubbles = document.querySelectorAll('.ai-bubble').length;
            const index = isUser ? userBubbles : aiBubbles;

            const xOffset = isUser ? rect.width * 0.75 : rect.width * 0.25;
            const yOffset = (index * 120) % (rect.height - 200) + 100;

            element.classList.add(isUser ? 'user-bubble' : 'ai-bubble');
            element.style.left = `${xOffset - 128}px`;
            element.style.top = `${yOffset}px`;
            element.style.transform = `scale(0)`;
            setTimeout(() => {
                element.style.transform = `scale(1)`;
            }, 100);
        }

        focusBubble(bubble) {
            this.unfocusAllBubbles();
            bubble.classList.add('focused');
            bubble.querySelector('.bubble-content').classList.remove('max-h-32');
            bubble.querySelector('.bubble-content').classList.add('max-h-[60vh]');
        }

        unfocusAllBubbles() {
            document.querySelectorAll('.chat-bubble.focused').forEach(b => {
                b.classList.remove('focused');
                b.querySelector('.bubble-content').classList.add('max-h-32');
                b.querySelector('.bubble-content').classList.remove('max-h-[60vh]');
            });
        }

        updateLastBotMessage(text) {
            let lastBotMsgEl = document.querySelector('.streaming-message');
            if (!lastBotMsgEl) {
                const msgDiv = document.createElement('div');
                msgDiv.className = `chat-bubble absolute w-64 p-4 rounded-2xl shadow-2xl transition-all duration-500 bg-slate-800/50 backdrop-blur-md border border-slate-700/80 streaming-message z-20`;
                const avatar = `<div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0 text-xs shadow-md">AI</div>`;
                msgDiv.innerHTML = `<div class="flex items-center gap-3">${avatar}<h3 class="font-semibold">AI Response</h3></div><div class="bubble-content max-h-32 overflow-y-auto mt-2 text-sm text-slate-200 prose prose-sm prose-invert max-w-none"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
                this.positionBubble(msgDiv, 'assistant');
                this.elements.chatCanvas.appendChild(msgDiv);
                lastBotMsgEl = msgDiv;
            }
            lastBotMsgEl.querySelector('.prose').innerHTML = marked.parse(text + '▌');
        }

        setLoadingState(isLoading) {
            this.state.isLoading = isLoading;
            this.elements.chatInput.disabled = isLoading;
            this.elements.sendBtn.disabled = isLoading;
            if (isLoading) {
                this.elements.orb.classList.add('loading');
            } else {
                this.elements.orb.classList.remove('loading');
            }
        }

        sendToBot(text) {
            this.state.currentBotMessage = "";
            this.setLoadingState(true);
            const session = this.state.sessions[this.state.currentSessionId];
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
            
            session.messages.push({ role: 'assistant', content: '' });

            this.elements.chatInput.value = '';
            this.sendToBot(prompt);
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