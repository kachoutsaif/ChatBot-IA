document.addEventListener('DOMContentLoaded', function() {
    // Fonctions utilitaires
    function $(id) { return document.getElementById(id); }
    function $$(selector) { return document.querySelectorAll(selector); }

    // Éléments DOM
    const messageForm = $('messageForm');
    const messageInput = $('messageInput');
    const messagesBox = $('messagesBox');
    const newChatBtn = $('newChatBtn');
    const chatHistoryList = $('chatHistoryList');
    const userMenuBtn = $('userMenuBtn');
    const userMenuContent = $('userMenuContent');
    const clearConversationsBtn = $('clearConversations');
    const toggleThemeBtn = $('toggleTheme');
    const themeButtons = $$('.theme-btn');

    // Variables globales
    let currentChatId = null;
    let currentTheme = 'general';
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value;

    // Initialisation des initiales de l'utilisateur
    function initUserInitials() {
        const userMenuBtn = document.getElementById('userMenuBtn');
        const initialsSpan = userMenuBtn.querySelector('.user-initials');
        
        if (initialsSpan) {
            // Conservons les initiales générées par le serveur
            let initials = initialsSpan.textContent.trim();
            
            // Si les initiales sont vides, générons-les côté client
            if (!initials) {
                const fullName = userMenuBtn.getAttribute('data-username') || '';
                initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase();
            }
            
            // Si toujours vide, utilisez 'U'
            initialsSpan.textContent = initials || 'U';
        }
    }
    
    // Appelez cette fonction au chargement de la page
    document.addEventListener('DOMContentLoaded', initUserInitials);

    // Gestion des thèmes de conversation
    function setConversationTheme(theme) {
        currentTheme = theme;
        themeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
        sendMessage(`Changeons de sujet pour parler de ${theme}.`);
    }

    // Chargement des conversations
    function loadChats() {
        if (!chatHistoryList) return;
        chatHistoryList.innerHTML = '';
        
        (chatsData || []).forEach(chat => {
            const li = document.createElement('li');
            li.className = 'chat-item';
            li.dataset.chatId = chat.id;
            li.innerHTML = `
                <span class="chat-title">${chat.title}</span>
                <div class="chat-options">
                    <button class="chat-options-btn">⋮</button>
                    <div class="chat-options-menu">
                        <button class="chat-option rename-chat">Renommer</button>
                        <button class="chat-option delete-chat">Supprimer</button>
                    </div>
                </div>
            `;
            
            const chatTitle = li.querySelector('.chat-title');
            const optionsBtn = li.querySelector('.chat-options-btn');
            const optionsMenu = li.querySelector('.chat-options-menu');
            
            chatTitle.addEventListener('click', () => loadChat(chat.id));
            
            optionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                optionsMenu.classList.toggle('active');
            });
            
            li.querySelector('.rename-chat').addEventListener('click', (e) => {
                e.stopPropagation();
                renameChat(chat.id);
                optionsMenu.classList.remove('active');
            });
            
            li.querySelector('.delete-chat').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChat(chat.id);
                optionsMenu.classList.remove('active');
            });
            
            chatHistoryList.appendChild(li);
        });
    
        // Fermer tous les menus d'options ouverts lorsqu'on clique en dehors
        document.addEventListener('click', () => {
            const activeMenus = document.querySelectorAll('.chat-options-menu.active');
            activeMenus.forEach(menu => menu.classList.remove('active'));
        });
    }

    // Chargement d'un chat spécifique
    function loadChat(chatId) {
        currentChatId = chatId;
        fetch(`/get_chat/${chatId}/`)
            .then(response => response.json())
            .then(data => {
                if (messagesBox) {
                    messagesBox.innerHTML = '';
                    data.messages.forEach(msg => addMessage(msg.content, msg.is_user));
                }
            })
            .catch(error => console.error('Erreur lors du chargement du chat:', error));
    }

    // Envoi d'un message
    function sendMessage(message) {
        if (!message.trim()) return;
        
        addMessage(message, true);
        if (messageInput) messageInput.value = '';

        fetch('', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({ message, chat_id: currentChatId, theme: currentTheme })
        })
        .then(response => response.json())
        .then(data => {
            addMessage(data.response, false);
            currentChatId = data.chat_id;
            updateChatInList(data.chat_id, data.chat_title);
        })
        .catch(error => console.error('Erreur lors de l\'envoi du message:', error));
    }

    // Ajout d'un message à l'interface
    function addMessage(content, isUser) {
        if (!messagesBox) return;

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', isUser ? 'user-message' : 'ai-message');

        const initialsSpan = userMenuBtn.querySelector('.user-initials');
        const userInitials = initialsSpan ? initialsSpan.textContent : 'U';

        messageDiv.innerHTML = `
            <div class="message-icon">${isUser ? userInitials : 'AI'}</div>
            <div class="message-text">${content}</div>
        `;

        messagesBox.appendChild(messageDiv);
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    // Renommer un chat
    function renameChat(chatId) {
        const newTitle = prompt("Entrez un nouveau nom pour ce chat :");
        if (newTitle) {
            fetch(`/rename_chat/${chatId}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                body: JSON.stringify({ title: newTitle })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    updateChatInList(chatId, newTitle);
                }
            })
            .catch(error => console.error('Erreur lors du renommage du chat:', error));
        }
    }

    // Supprimer un chat
    function deleteChat(chatId) {
        if (confirm("Êtes-vous sûr de vouloir supprimer ce chat ?")) {
            fetch(`/delete_chat/${chatId}/`, {
                method: 'POST',
                headers: { 'X-CSRFToken': csrfToken }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    removeChatFromList(chatId);
                    if (currentChatId === chatId) {
                        currentChatId = null;
                        if (messagesBox) messagesBox.innerHTML = '';
                    }
                }
            })
            .catch(error => console.error('Erreur lors de la suppression du chat:', error));
        }
    }

    // Mettre à jour un chat dans la liste
    function updateChatInList(chatId, newTitle) {
        const chatItem = document.querySelector(`.chat-item[data-chat-id="${chatId}"]`);
        if (chatItem) {
            const titleSpan = chatItem.querySelector('.chat-title');
            if (titleSpan) titleSpan.textContent = newTitle;
        } else {
            loadChats();
        }
    }

    // Supprimer un chat de la liste
    function removeChatFromList(chatId) {
        const chatItem = document.querySelector(`.chat-item[data-chat-id="${chatId}"]`);
        if (chatItem) chatItem.remove();
    }

    // Effacer toutes les conversations
    function clearAllConversations() {
        if (confirm("Êtes-vous sûr de vouloir effacer toutes les conversations ?")) {
            fetch('/clear_all_chats/', {  // Assurez-vous que ce chemin correspond à votre configuration Django
                method: 'POST',
                headers: { 
                    'X-CSRFToken': csrfToken,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Erreur réseau');
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    if (chatHistoryList) chatHistoryList.innerHTML = '';
                    if (messagesBox) messagesBox.innerHTML = '';
                    currentChatId = null;
                    chatsData = [];
                    alert("Toutes les conversations ont été effacées.");
                } else {
                    throw new Error('La suppression a échoué');
                }
            })
            .catch(error => {
                console.error('Erreur lors de l\'effacement des conversations:', error);
                alert("Une erreur s'est produite lors de l'effacement des conversations.");
            });
        }
    }

    // Basculer le thème sombre/clair
    function toggleTheme() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    }

    // Event listeners
    if (messageForm) {
        messageForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const message = messageInput.value.trim();
            if (message) sendMessage(message);
        });
    }

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            currentChatId = null;
            if (messagesBox) {
                messagesBox.innerHTML = '';
                addMessage("Bonjour ! Comment puis-je vous aider aujourd'hui ?", false);
            }
        });
    }

    if (userMenuBtn) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenuContent.classList.toggle('show');
        });
    }

    if (clearConversationsBtn) {
        clearConversationsBtn.addEventListener('click', function(e) {
            e.preventDefault();
            clearAllConversations();
        });
    }

    if (toggleThemeBtn) {
        toggleThemeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleTheme();
        });
    }

    themeButtons.forEach(button => {
        button.addEventListener('click', () => {
            setConversationTheme(button.dataset.theme);
        });
    });

    // Fermer le menu utilisateur si on clique en dehors
    document.addEventListener('click', (e) => {
        if (userMenuContent && !userMenuBtn.contains(e.target) && !userMenuContent.contains(e.target)) {
            userMenuContent.classList.remove('show');
        }
    });

    // Initialisation
    initUserInitials();
    loadChats();

    // Appliquer le thème au chargement
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
    }
});