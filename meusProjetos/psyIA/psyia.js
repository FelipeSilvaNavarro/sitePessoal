/**
 * @fileoverview PsyIA — Inteligência em Saúde Mental.
 * Aplicação single-page de apoio emocional e análise clínica.
 * Dois modos: Apoio (chat conversacional) e Profissional (análise clínica estruturada).
 *
 * Stack: HTML/CSS/JS puro · Google Fonts · API Groq (llama-3.3-70b-versatile) · localStorage.
 */

// ─────────────────────────────────────────────
// CAMADA DE PERSISTÊNCIA
// ─────────────────────────────────────────────

/**
 * Singleton que abstrai todas as leituras e escritas no localStorage.
 *
 * Estrutura dos dados:
 * - `psyia_convs`     → `Array<{id, title, date, messages: {role, content}[]}>`
 * - `psyia_patients`  → `Array<{id, name, age, date, messages: {role, content}[]}>`
 * - `psyia_groq_key`  → `string` (chave em texto plano, visível em devtools)
 *
 * @namespace DB
 */
const DB = {
    /**
     * Lê e parseia um valor do localStorage.
     * @param {string} key - Chave do localStorage.
     * @param {*} def - Valor padrão caso a chave não exista ou falhe o parse.
     * @returns {*} Valor parseado ou `def`.
     */
    load (key, def) {
        try { return JSON.parse(localStorage.getItem(key)) || def }
        catch (e) { return def }
    },

    /**
     * Serializa e salva um valor no localStorage.
     * Erros de cota ou bloqueio são silenciados.
     * @param {string} key - Chave do localStorage.
     * @param {*} val - Valor a serializar e salvar.
     */
    save (key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)) }
        catch (e) { /* silencia erros de storage cheio ou bloqueado */ }
    },

    /** @returns {Array} Lista de conversas salvas. */
    convs () { return this.load('psyia_convs', []) },

    /** @param {Array} c - Array de conversas a persistir. */
    saveConvs (c) { this.save('psyia_convs', c) },

    /** @returns {Array} Lista de pacientes salvos. */
    patients () { return this.load('psyia_patients', []) },

    /** @param {Array} p - Array de pacientes a persistir. */
    savePatients (p) { this.save('psyia_patients', p) },

    /** @returns {string} Chave de API Groq salva, ou string vazia. */
    apiKey () { return localStorage.getItem('psyia_groq_key') || '' },

    /**
     * Persiste a chave de API Groq.
     * @param {string} k - Chave a salvar.
     */
    saveKey (k) { localStorage.setItem('psyia_groq_key', k) },
}


// ─────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────

/** @type {'support'|'pro'} Aba/modo atualmente ativo. */
let currentTab = 'support'

/** @type {string|null} ID da conversa ativa no modo Apoio. */
let currentConvId = null

/** @type {string|null} ID do paciente ativo no modo Profissional. */
let currentPatientId = null

/** @type {boolean} Bloqueia envios enquanto aguarda resposta da API. */
let isLoading = false

/** @type {string} Chave de API Groq em memória. */
let apiKey = DB.apiKey()


// ─────────────────────────────────────────────
// INICIALIZAÇÃO
// ─────────────────────────────────────────────

/**
 * Inicializa a aplicação ao carregar a página.
 * Preenche o campo de API key, renderiza as listas da sidebar,
 * carrega a conversa mais recente e configura o gesto de swipe mobile.
 */
function init () {
    if (apiKey) {
        document.getElementById('apiKeyInput').value = apiKey
        setApiStatus(true)
    }

    renderConvList()
    renderPatientList()

    const convs = DB.convs()
    if (convs.length > 0) {
        loadConversation(convs[ 0 ].id)
    }

    setupSwipe()
}


// ─────────────────────────────────────────────
// GERENCIAMENTO DA API KEY
// ─────────────────────────────────────────────

/**
 * Atualiza o indicador visual de status da chave de API na sidebar.
 * @param {boolean} ok - `true` exibe "Chave salva" em verde; `false` exibe aviso neutro.
 */
function setApiStatus (ok) {
    const s = document.getElementById('apiStatus')
    s.textContent = ok ? 'Chave salva' : 'Nenhuma chave salva'
    s.className = 'api-status' + (ok ? ' ok' : '')
}

/**
 * Lê a chave do campo de texto na sidebar desktop, persiste no DB
 * e fecha a sidebar (relevante para mobile).
 */
function saveKey () {
    const v = document.getElementById('apiKeyInput').value.trim()
    if (!v) return
    apiKey = v
    DB.saveKey(v)
    setApiStatus(true)
    closeSidebar()
}

/**
 * Abre o modal de API key no mobile, pré-preenchendo com o valor atual.
 * O focus é aplicado com delay para aguardar a animação do modal.
 */
function openApiModal () {
    document.getElementById('apiModalInp').value = apiKey
    document.getElementById('apiModalBg').classList.add('open')
    setTimeout(() => document.getElementById('apiModalInp').focus(), 120)
}

/** Fecha o modal de API key removendo a classe `.open`. */
function closeApiModal () {
    document.getElementById('apiModalBg').classList.remove('open')
}

/**
 * Salva a chave digitada no modal mobile, sincroniza com o campo
 * da sidebar desktop e fecha o modal.
 */
function saveKeyModal () {
    const v = document.getElementById('apiModalInp').value.trim()
    if (!v) return
    apiKey = v
    DB.saveKey(v)
    document.getElementById('apiKeyInput').value = v
    setApiStatus(true)
    closeApiModal()
}

// Fecha o modal ao clicar no fundo escuro (fora do card).
document.getElementById('apiModalBg').addEventListener('click', function (e) {
    if (e.target === this) closeApiModal()
})


// ─────────────────────────────────────────────
// CONTROLE DA SIDEBAR (Mobile)
// ─────────────────────────────────────────────

/**
 * Alterna o estado aberto/fechado da sidebar e do overlay no mobile.
 */
function toggleSidebar () {
    document.getElementById('sidebar').classList.toggle('open')
    document.getElementById('sidebarOverlay').classList.toggle('open')
}

/** Abre a sidebar e o overlay no mobile. */
function openSidebar () {
    document.getElementById('sidebar').classList.add('open')
    document.getElementById('sidebarOverlay').classList.add('open')
}

/** Fecha a sidebar e o overlay no mobile. */
function closeSidebar () {
    document.getElementById('sidebar').classList.remove('open')
    document.getElementById('sidebarOverlay').classList.remove('open')
}

/**
 * Configura detecção de gestos de swipe horizontal para abrir/fechar
 * a sidebar no mobile.
 *
 * Regras:
 * - Swipe da borda esquerda (`x < 28px`) para a direita (`dx > 45`) → abre.
 * - Swipe para a esquerda (`dx < -45`) com sidebar aberta → fecha.
 * - Deslocamento vertical (`dy > 55`) cancela o tracking (era scroll).
 */
function setupSwipe () {
    let sx = 0, sy = 0, track = false
    const sb = document.getElementById('sidebar')

    document.addEventListener('touchstart', e => {
        sx = e.touches[ 0 ].clientX
        sy = e.touches[ 0 ].clientY
        track = sx < 28 || sb.classList.contains('open')
    }, { passive: true })

    document.addEventListener('touchend', e => {
        if (!track) return
        const dx = e.changedTouches[ 0 ].clientX - sx
        const dy = Math.abs(e.changedTouches[ 0 ].clientY - sy)
        if (dy > 55) return
        if (dx > 45 && !sb.classList.contains('open')) openSidebar()
        else if (dx < -45 && sb.classList.contains('open')) closeSidebar()
    }, { passive: true })
}


// ─────────────────────────────────────────────
// ALTERNÂNCIA DE MODOS
// ─────────────────────────────────────────────

/**
 * Alterna entre os modos Apoio e Profissional.
 * Atualiza abas, painéis da sidebar, formulários de input, label da
 * topbar e carrega o conteúdo adequado para o modo selecionado.
 *
 * @param {'support'|'pro'} tab - Modo a ativar.
 */
function switchTab (tab) {
    currentTab = tab

    document.getElementById('tabSupport').classList.toggle('active', tab === 'support')
    document.getElementById('tabPro').classList.toggle('active', tab === 'pro')
    document.getElementById('panelSupport').classList.toggle('active', tab === 'support')
    document.getElementById('panelPro').classList.toggle('active', tab === 'pro')

    document.getElementById('simpleInput').style.display = tab === 'support' ? 'block' : 'none'
    document.getElementById('proInput').style.display = tab === 'pro' ? 'block' : 'none'

    document.getElementById('modeLabel').textContent = tab === 'support' ? 'Apoio Emocional' : 'Modo Profissional'
    document.getElementById('topbarAction').textContent = tab === 'support' ? '↺ Nova' : '↺ Limpar'

    if (tab === 'support') {
        const convs = DB.convs()
        if (convs.length > 0 && currentConvId) loadConversation(currentConvId)
        else if (convs.length > 0) loadConversation(convs[ 0 ].id)
        else renderWelcomeSupport()
    } else {
        if (currentPatientId) loadPatient(currentPatientId)
        else renderWelcomePro()
    }

    closeSidebar()
}

/**
 * Executa a ação do botão principal da topbar conforme o modo ativo:
 * - Apoio → `newConversation()`
 * - Profissional → `clearPatientChat()`
 */
function handleTopbarAction () {
    if (currentTab === 'support') newConversation()
    else clearPatientChat()
}


// ─────────────────────────────────────────────
// GERENCIAMENTO DE CONVERSAS (Modo Apoio)
// ─────────────────────────────────────────────

/**
 * Cria uma nova conversa vazia e a torna ativa.
 * Se já existir uma conversa sem mensagens, reutiliza-a para evitar
 * acúmulo de entradas vazias ao clicar repetidamente em "Nova".
 */
function newConversation () {
    const convs = DB.convs()

    const emptyConv = convs.find(c => c.messages.length === 0)
    if (emptyConv) {
        currentConvId = emptyConv.id
        renderConvList()
        renderWelcomeSupport()
        closeSidebar()
        return
    }

    const id = 'conv_' + Date.now()
    convs.unshift({ id, title: 'Nova conversa', date: new Date().toLocaleDateString('pt-BR'), messages: [] })
    DB.saveConvs(convs)
    currentConvId = id
    renderConvList()
    renderWelcomeSupport()
    closeSidebar()
}

/**
 * Carrega uma conversa do DB e renderiza seu histórico no chat.
 * Se não houver mensagens, exibe a tela de boas-vindas.
 *
 * @param {string} id - ID da conversa a carregar.
 */
function loadConversation (id) {
    const convs = DB.convs()
    const conv = convs.find(c => c.id === id)
    if (!conv) return

    currentConvId = id
    renderConvList()

    const area = document.getElementById('chatArea')
    area.innerHTML = ''

    if (conv.messages.length === 0) {
        renderWelcomeSupport()
    } else {
        conv.messages.forEach(m => renderMessage(m.role === 'user' ? 'user' : 'ai', m.content))
        setTimeout(() => { area.scrollTop = area.scrollHeight }, 50)
    }
    closeSidebar()
}

/**
 * Remove uma conversa do DB. Se for a conversa ativa, carrega a próxima
 * disponível ou exibe boas-vindas.
 *
 * @param {string} id - ID da conversa a deletar.
 * @param {MouseEvent} e - Evento do clique (necessário para `stopPropagation`).
 */
function deleteConversation (id, e) {
    e.stopPropagation()
    let convs = DB.convs().filter(c => c.id !== id)
    DB.saveConvs(convs)

    if (currentConvId === id) {
        currentConvId = null
        if (convs.length > 0) loadConversation(convs[ 0 ].id)
        else renderWelcomeSupport()
    }
    renderConvList()
}

/**
 * Regenera o HTML completo da lista de conversas na sidebar a partir do DB.
 * Marca a conversa ativa com a classe `.active`.
 */
function renderConvList () {
    const convs = DB.convs()
    const el = document.getElementById('convList')

    if (convs.length === 0) {
        el.innerHTML = '<div style="padding:12px;font-size:10px;color:rgba(245,240,232,0.25);text-align:center">Nenhuma conversa ainda</div>'
        return
    }

    el.innerHTML = convs.map(c => `
    <div class="conv-item ${c.id === currentConvId ? 'active' : ''}" onclick="loadConversation('${c.id}')">
      <button class="conv-item-delete" onclick="deleteConversation('${c.id}',event)">x</button>
      <div class="conv-item-title">${escHtml(c.title)}</div>
      <div class="conv-item-meta">${c.date} · ${c.messages.length} msgs</div>
    </div>`
    ).join('')
}

/**
 * Persiste o histórico atualizado da conversa ativa no DB.
 * Auto-título: usa os primeiros 40 caracteres da primeira mensagem do usuário.
 * Chamada após cada mensagem do usuário e após cada resposta da IA.
 *
 * @param {Array<{role: string, content: string}>} messages - Histórico completo.
 */
function saveCurrentConv (messages) {
    if (!currentConvId) return
    const convs = DB.convs()
    const idx = convs.findIndex(c => c.id === currentConvId)
    if (idx === -1) return

    convs[ idx ].messages = messages

    const firstUser = messages.find(m => m.role === 'user')
    if (firstUser && convs[ idx ].title === 'Nova conversa') {
        convs[ idx ].title = firstUser.content.slice(0, 40) + (firstUser.content.length > 40 ? '…' : '')
    }

    DB.saveConvs(convs)
    renderConvList()
}


// ─────────────────────────────────────────────
// GERENCIAMENTO DE PACIENTES (Modo Profissional)
// ─────────────────────────────────────────────

/**
 * Cria um novo paciente via `prompt()` nativo.
 * Se o paciente ativo não tiver mensagens, reutiliza em vez de criar outro vazio.
 */
function newPatient () {
    if (currentPatientId) {
        const patients = DB.patients()
        const current = patients.find(p => p.id === currentPatientId)
        if (current && current.messages.length === 0) {
            renderWelcomePro(current.name)
            closeSidebar()
            return
        }
    }

    const name = prompt('Nome ou código do paciente:')
    if (!name || !name.trim()) return

    const id = 'pat_' + Date.now()
    const patients = DB.patients()
    patients.unshift({ id, name: name.trim(), age: '', date: new Date().toLocaleDateString('pt-BR'), messages: [] })
    DB.savePatients(patients)
    currentPatientId = id
    renderPatientList()
    renderWelcomePro()
    closeSidebar()
}

/**
 * Carrega um paciente do DB e renderiza seu histórico clínico no chat.
 * Se não houver mensagens, exibe a tela de boas-vindas do modo Pro.
 *
 * @param {string} id - ID do paciente a carregar.
 */
function loadPatient (id) {
    const patients = DB.patients()
    const pat = patients.find(p => p.id === id)
    if (!pat) return

    currentPatientId = id
    renderPatientList()

    const area = document.getElementById('chatArea')
    area.innerHTML = ''

    if (pat.messages.length === 0) {
        renderWelcomePro(pat.name)
    } else {
        pat.messages.forEach(m => renderMessage(m.role === 'user' ? 'user' : 'ai', m.content))
        setTimeout(() => { area.scrollTop = area.scrollHeight }, 50)
    }
    closeSidebar()
}

/**
 * Remove um paciente e todo seu histórico do DB após confirmação.
 * Exige `confirm()` por se tratar de dado clínico sensível.
 *
 * @param {string} id - ID do paciente a deletar.
 * @param {MouseEvent} e - Evento do clique (necessário para `stopPropagation`).
 */
function deletePatient (id, e) {
    e.stopPropagation()
    if (!confirm('Excluir este paciente e todo seu histórico?')) return

    let patients = DB.patients().filter(p => p.id !== id)
    DB.savePatients(patients)

    if (currentPatientId === id) {
        currentPatientId = null
        renderWelcomePro()
    }
    renderPatientList()
}

/**
 * Apaga apenas as mensagens do paciente ativo, mantendo seu registro na lista.
 * Exige confirmação antes de executar.
 */
function clearPatientChat () {
    if (!currentPatientId) return
    if (!confirm('Limpar o histórico deste paciente?')) return

    const patients = DB.patients()
    const idx = patients.findIndex(p => p.id === currentPatientId)
    if (idx === -1) return

    patients[ idx ].messages = []
    DB.savePatients(patients)
    renderWelcomePro(patients[ idx ].name)
}

/**
 * Regenera o HTML completo da lista de pacientes na sidebar a partir do DB.
 * Marca o paciente ativo com a classe `.active`.
 */
function renderPatientList () {
    const patients = DB.patients()
    const el = document.getElementById('patientList')

    if (patients.length === 0) {
        el.innerHTML = '<div style="padding:12px;font-size:10px;color:rgba(245,240,232,0.25);text-align:center">Nenhum paciente ainda</div>'
        return
    }

    el.innerHTML = patients.map(p => `
    <div class="patient-item ${p.id === currentPatientId ? 'active' : ''}" onclick="loadPatient('${p.id}')">
      <button class="patient-delete" onclick="deletePatient('${p.id}',event)">x</button>
      <div class="patient-name">${escHtml(p.name)}</div>
      <div class="patient-meta">${p.date} · ${p.messages.length} msgs</div>
    </div>`
    ).join('')
}

/**
 * Persiste o histórico atualizado do paciente ativo no DB.
 *
 * @param {Array<{role: string, content: string}>} messages - Histórico completo.
 */
function saveCurrentPatient (messages) {
    if (!currentPatientId) return
    const patients = DB.patients()
    const idx = patients.findIndex(p => p.id === currentPatientId)
    if (idx === -1) return

    patients[ idx ].messages = messages
    DB.savePatients(patients)
    renderPatientList()
}


// ─────────────────────────────────────────────
// TELAS DE BOAS-VINDAS
// ─────────────────────────────────────────────

/**
 * Injeta a tela de boas-vindas do modo Apoio no `chatArea`,
 * com chips de atalho que disparam `sendHint()`.
 */
function renderWelcomeSupport () {
    document.getElementById('chatArea').innerHTML = `
    <div class="welcome" id="welcomeScreen">
      <div class="welcome-icon">🌿</div>
      <h2>Olá, estou <em>aqui</em> para você</h2>
      <p>Um espaço seguro para conversar, refletir e encontrar clareza. Como você está se sentindo hoje?</p>
      <div class="welcome-hints">
        <div class="hint-chip" onclick="sendHint('Estou me sentindo ansioso e não sei o motivo.')">Ansiedade</div>
        <div class="hint-chip" onclick="sendHint('Preciso de ajuda para lidar com a tristeza.')">Tristeza</div>
        <div class="hint-chip" onclick="sendHint('Tenho dificuldade em me relacionar com pessoas.')">Relacionamentos</div>
        <div class="hint-chip" onclick="sendHint('Quero entender melhor meus padrões de comportamento.')">Autoconhecimento</div>
      </div>
    </div>`
}

/**
 * Injeta a tela de boas-vindas do modo Profissional no `chatArea`.
 * Se `name` for fornecido, exibe o nome do paciente ativo e um chip
 * "Carregar exemplo" que preenche o formulário com dados fictícios via `fillExample()`.
 *
 * @param {string} [name] - Nome do paciente ativo (opcional).
 */
function renderWelcomePro (name) {
    const n = name ? `Paciente: <em>${escHtml(name)}</em>` : 'Modo <em>Profissional</em>'
    document.getElementById('chatArea').innerHTML = `
    <div class="welcome" id="welcomeScreen">
      <div class="welcome-icon">🧠</div>
      <h2>${n}</h2>
      <p>${name ? 'Insira informações clínicas abaixo para iniciar a análise.' : 'Selecione ou crie um paciente na barra lateral para começar.'}</p>
      ${!name ? '' : `<div class="welcome-hints"><div class="hint-chip" onclick="fillExample()">Carregar exemplo</div></div>`}
    </div>`
}

/**
 * Preenche o formulário do modo Profissional com um caso clínico fictício
 * para demonstração e treinamento da ferramenta.
 */
function fillExample () {
    document.getElementById('patientName').value = 'Paciente M.'
    document.getElementById('patientAge').value = '29 anos, feminino'
    document.getElementById('proText').value = 'Episódios de tristeza profunda há 6 meses, perda de interesse em atividades antes prazerosas, insônia de manutenção, fadiga constante e pensamentos negativos sobre o futuro. Nega ideação suicida. Histórico de ansiedade na adolescência. Isolamento social progressivo em home office.'
}


// ─────────────────────────────────────────────
// UTILITÁRIOS DE RENDERIZAÇÃO
// ─────────────────────────────────────────────

/**
 * Remove a tela de boas-vindas do DOM.
 * Chamada antes de adicionar a primeira mensagem de cada conversa.
 */
function hideWelcome () {
    document.getElementById('welcomeScreen')?.remove()
}

/**
 * Cria e anexa um elemento de mensagem ao `chatArea`.
 * Aplica `fmt()` para converter markdown simplificado em HTML.
 *
 * @param {'ai'|'user'} role - Determina o layout e estilo visual da mensagem.
 * @param {string} content - Conteúdo textual da mensagem (suporta markdown básico).
 * @returns {HTMLElement} O elemento de mensagem criado.
 */
function renderMessage (role, content) {
    const area = document.getElementById('chatArea')
    const div = document.createElement('div')
    div.className = `message ${role}`

    const av = role === 'ai'
        ? `<div class="avatar ai">🌿</div>`
        : `<div class="avatar user-av">👤</div>`

    div.innerHTML = `${av}<div class="bubble">${fmt(content)}</div>`
    area.appendChild(div)
    area.scrollTop = area.scrollHeight
    return div
}

/**
 * Mini-parser de markdown para uso no chat.
 * Converte `**texto**` → `<strong>`, `*texto*` → `<em>`,
 * parágrafos separados por `\n\n` → `<p>` e `\n` internos → `<br>`.
 *
 * @param {string} text - Texto com marcações markdown básicas.
 * @returns {string} HTML formatado.
 */
function fmt (text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .split('\n\n')
        .filter(p => p.trim())
        .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('')
}

/**
 * Escapa caracteres HTML especiais para prevenir XSS ao inserir
 * dados do usuário diretamente em `innerHTML`.
 *
 * @param {string} s - String a escapar.
 * @returns {string} String com `&`, `<`, `>` e `"` escapados.
 */
function escHtml (s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/**
 * Adiciona o indicador de carregamento (três pontos animados) ao chat
 * enquanto aguarda a resposta da API.
 */
function showLoading () {
    hideWelcome()
    const area = document.getElementById('chatArea')
    const div = document.createElement('div')
    div.className = 'message ai'
    div.id = 'loadingMsg'
    div.innerHTML = `<div class="avatar ai">🌿</div><div class="bubble"><div class="loading-dots"><span></span><span></span><span></span></div></div>`
    area.appendChild(div)
    area.scrollTop = area.scrollHeight
}

/**
 * Remove o indicador de carregamento do DOM pelo ID `loadingMsg`.
 */
function removeLoading () {
    document.getElementById('loadingMsg')?.remove()
}

/**
 * Exibe um toast de erro vermelho no canto inferior direito
 * que some automaticamente após 5 segundos.
 *
 * @param {string} msg - Mensagem de erro a exibir.
 */
function showError (msg) {
    const t = document.createElement('div')
    t.className = 'error-toast'
    t.textContent = msg
    document.body.appendChild(t)
    setTimeout(() => t.remove(), 5000)
}

/**
 * Retorna uma Promise que resolve após `ms` milissegundos.
 * Usada para criar pausas no efeito typewriter.
 *
 * @param {number} ms - Duração em milissegundos.
 * @returns {Promise<void>}
 */
const sleep = ms => new Promise(r => setTimeout(r, ms))


// ─────────────────────────────────────────────
// EFEITO TYPEWRITER
// ─────────────────────────────────────────────

/**
 * Simula digitação progressiva da resposta da IA, token por token.
 *
 * O texto é dividido por espaços e cada token é acumulado e re-renderizado
 * com `fmt()`. O delay entre tokens varia conforme o tipo:
 * - Pontuação final (`. ! ? …`) → 220ms
 * - Pontuação média (`, ; : —`) → 100ms
 * - Espaços → 8ms
 * - Palavras longas (> 8 chars) → 56ms
 * - Padrão → 42ms
 *
 * Um cursor piscante (`.typing-cursor`) é exibido durante a digitação
 * e removido ao finalizar.
 *
 * @async
 * @param {string} text - Texto completo a exibir progressivamente.
 * @returns {Promise<void>}
 */
async function typeMessage (text) {
    hideWelcome()
    const area = document.getElementById('chatArea')
    const wrap = document.createElement('div')
    wrap.className = 'message ai'

    const bubble = document.createElement('div')
    bubble.className = 'bubble'
    wrap.innerHTML = `<div class="avatar ai">🌿</div>`
    wrap.appendChild(bubble)
    area.appendChild(wrap)

    const cursor = document.createElement('span')
    cursor.className = 'typing-cursor'

    const tokens = text.split(/(\s+)/)
    let displayed = ''

    for (const token of tokens) {
        displayed += token
        bubble.innerHTML = fmt(displayed)
        bubble.appendChild(cursor)
        area.scrollTop = area.scrollHeight

        let d = 42
        if (/[.!?…]/.test(token)) d = 220
        else if (/[,;:—]/.test(token)) d = 100
        else if (/^\s+$/.test(token)) d = 8
        else if (token.length > 8) d = 56

        await sleep(d)
    }

    cursor.remove()
    bubble.innerHTML = fmt(text)
    area.scrollTop = area.scrollHeight
}


// ─────────────────────────────────────────────
// UTILITÁRIOS DE INPUT
// ─────────────────────────────────────────────

/**
 * Ajusta a altura do textarea dinamicamente ao seu conteúdo.
 * Reseta para `auto` antes de ler `scrollHeight` para permitir encolher.
 * Limitado a 120px via CSS e programaticamente.
 *
 * @param {HTMLTextAreaElement} el - O textarea a redimensionar.
 */
function autoResize (el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

/**
 * Handler de teclado para o textarea do modo Apoio.
 * `Enter` sem `Shift` envia a mensagem; `Shift+Enter` cria nova linha.
 *
 * @param {KeyboardEvent} e - Evento de teclado.
 */
function handleKey (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendSupport()
    }
}

/**
 * Ativa ou desativa o estado de carregamento da UI.
 * Atualiza `isLoading` e desabilita os botões de envio/análise.
 *
 * @param {boolean} v - `true` para ativar o loading; `false` para desativar.
 */
function setLoading (v) {
    isLoading = v;
    [ 'sendBtn', 'analyzeBtn' ].forEach(id => {
        const el = document.getElementById(id)
        if (el) el.disabled = v
    })
}


// ─────────────────────────────────────────────
// ENVIO DE MENSAGEM — Modo Apoio
// ─────────────────────────────────────────────

/**
 * Envia uma mensagem no modo Apoio e exibe a resposta da IA com typewriter.
 *
 * Fluxo:
 * 1. Valida guards (loading, texto vazio, API key).
 * 2. Garante conversa ativa (cria se necessário).
 * 3. Renderiza a mensagem do usuário imediatamente.
 * 4. Salva no DB antes de aguardar a API (evita perda em caso de falha).
 * 5. Chama `callGroq()` e exibe a resposta com `typeMessage()`.
 * 6. Persiste a resposta da IA no DB.
 *
 * @async
 * @returns {Promise<void>}
 */
async function sendSupport () {
    if (isLoading) return

    const el = document.getElementById('simpleText')
    const text = el.value.trim()

    if (!text) return
    if (!apiKey) { showError('Insira sua chave API (botão API ou barra lateral)'); return }

    if (!currentConvId) newConversation()

    el.value = ''
    el.style.height = 'auto'
    hideWelcome()
    renderMessage('user', text)

    const convs = DB.convs()
    const conv = convs.find(c => c.id === currentConvId)
    const messages = conv ? [ ...conv.messages ] : []
    messages.push({ role: 'user', content: text })
    saveCurrentConv(messages)

    setLoading(true)
    showLoading()

    try {
        const reply = await callGroq(messages, 'support')
        removeLoading()
        await typeMessage(reply)
        messages.push({ role: 'assistant', content: reply })
        saveCurrentConv(messages)
    } catch (e) {
        removeLoading()
        showError('Erro: ' + e.message)
    }

    setLoading(false)
}

/**
 * Atalho dos chips de boas-vindas: preenche o textarea e envia imediatamente.
 *
 * @param {string} text - Texto pré-definido a enviar.
 */
function sendHint (text) {
    document.getElementById('simpleText').value = text
    sendSupport()
}


// ─────────────────────────────────────────────
// ENVIO DE ANÁLISE — Modo Profissional
// ─────────────────────────────────────────────

/**
 * Envia uma análise clínica no modo Profissional e exibe a resposta da IA.
 *
 * Fluxo:
 * 1. Valida guards (loading, notas vazias, API key).
 * 2. Cria paciente ativo se não existir, ou atualiza nome/idade se informados.
 * 3. Compõe mensagem estruturada em markdown com dados do formulário.
 * 4. Segue o mesmo fluxo de renderização e persistência do `sendSupport()`.
 *
 * @async
 * @returns {Promise<void>}
 */
async function sendPro () {
    if (isLoading) return

    const name = document.getElementById('patientName').value.trim()
    const age = document.getElementById('patientAge').value.trim()
    const notes = document.getElementById('proText').value.trim()

    if (!notes) return
    if (!apiKey) { showError('Insira sua chave API (botão API ou barra lateral)'); return }

    if (!currentPatientId) {
        const n = name || 'Paciente'
        const id = 'pat_' + Date.now()
        const patients = DB.patients()
        patients.unshift({ id, name: n, age: age || '', date: new Date().toLocaleDateString('pt-BR'), messages: [] })
        DB.savePatients(patients)
        currentPatientId = id
        renderPatientList()
    } else if (name) {
        const patients = DB.patients()
        const idx = patients.findIndex(p => p.id === currentPatientId)
        if (idx !== -1) {
            patients[ idx ].name = name
            if (age) patients[ idx ].age = age
            DB.savePatients(patients)
            renderPatientList()
        }
    }

    const userMsg = `**Paciente:** ${name || 'Não informado'} | **Perfil:** ${age || 'Não informado'}\n\n**Relato Clínico:**\n${notes}`

    document.getElementById('proText').value = ''
    document.getElementById('patientName').value = ''
    document.getElementById('patientAge').value = ''

    hideWelcome()
    renderMessage('user', userMsg)

    const patients = DB.patients()
    const pat = patients.find(p => p.id === currentPatientId)
    const messages = pat ? [ ...pat.messages ] : []
    messages.push({ role: 'user', content: userMsg })
    saveCurrentPatient(messages)

    setLoading(true)
    showLoading()

    try {
        const reply = await callGroq(messages, 'pro')
        removeLoading()
        await typeMessage(reply)
        messages.push({ role: 'assistant', content: reply })
        saveCurrentPatient(messages)
    } catch (e) {
        removeLoading()
        showError('Erro: ' + e.message)
    }

    setLoading(false)
}


// ─────────────────────────────────────────────
// INTEGRAÇÃO COM API GROQ
// ─────────────────────────────────────────────

/**
 * Envia o histórico de mensagens à API Groq e retorna a resposta do modelo.
 *
 * Usa o modelo `llama-3.3-70b-versatile` com system prompts distintos por modo:
 * - **support**: presença empática, 4 parágrafos fixos, `temperature: 0.80`.
 * - **pro**: análise clínica estruturada em 5 seções (DSM-5/CID-11), `temperature: 0.28`.
 *
 * Em caso de erro HTTP, tenta extrair a mensagem do JSON de resposta da API
 * e lança um `Error` com ela.
 *
 * @async
 * @param {Array<{role: string, content: string}>} msgs - Histórico completo da conversa.
 * @param {'support'|'pro'} mode - Modo que define o system prompt e a temperatura.
 * @returns {Promise<string>} Conteúdo textual da resposta do modelo.
 * @throws {Error} Se a requisição falhar ou a API retornar um erro.
 */
async function callGroq (msgs, mode) {

    const systemSupport = `Você é PsyIA — uma presença calorosa, empática e profundamente humana, especializada em saúde mental e bem-estar emocional.

Você é como um amigo de muita confiança que também entende profundamente de psicologia, do coração humano e de como o corpo e a mente funcionam. Você se importa de verdade com cada pessoa.

ESTRUTURA DE CADA RESPOSTA:

Parágrafo 1 — ACOLHIMENTO GENUÍNO
Reconheça e valide o sentimento com calor real e específico para aquele momento.

Parágrafo 2 — PRESENÇA E PROFUNDIDADE
Reflita algo sobre o que a pessoa está vivendo que vai além do óbvio.

Parágrafo 3 — SUGESTÃO NATURAL E ACOLHEDORA
Ofereça 1 ou 2 sugestões práticas e gentis de forma poética e humana — nunca como lista. Pense em coisas que o corpo e a mente precisam naquele momento: pausar, respirar, tomar água, se mover, sentir o presente, escrever, conversar com alguém.

Parágrafo 4 — CONVITE CALOROSO
Termine com um convite suave: "me conta mais...", "estou aqui...", "quando quiser continuar...".

CUIDADOS: sem listas com bullets, sem ser genérico, português brasileiro fluido e caloroso, 3-5 parágrafos separados.`

    const systemPro = `Você é PsyIA Pro, ferramenta de apoio à análise clínica para psicólogos habilitados.

Apresente análise estruturada com:
**1. Hipóteses Diagnósticas** — DSM-5/CID-11 por probabilidade com justificativa breve.
**2. Análise dos Sintomas** — padrões, duração, intensidade, etiologia.
**3. Fatores de Risco e Atenção** — comorbidades, cronicidade, pontos críticos.
**4. Abordagens Terapêuticas** — linhas teóricas e intervenções recomendadas.
**5. Avaliações Complementares** — instrumentos e encaminhamentos úteis.

Português técnico e preciso. Finalize reforçando que é ferramenta de apoio — não substitui o julgamento clínico.`

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [ { role: 'system', content: mode === 'support' ? systemSupport : systemPro }, ...msgs ],
            max_tokens: 850,
            temperature: mode === 'support' ? 0.80 : 0.28
        })
    })

    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error?.message || `HTTP ${res.status}`)
    }

    return (await res.json()).choices[ 0 ].message.content
}


// ─────────────────────────────────────────────
// INICIALIZA
// ─────────────────────────────────────────────
init()