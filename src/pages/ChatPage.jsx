import { useReducer, useRef, useState } from 'react'
import { createAgentApi } from '../lib/agentApi.js'
import { getChatSourceReferences } from '../lib/chatEvidence.js'
import { buildActiveChatMessages, chatReducer, createChatState } from '../lib/chatState.js'
import './ChatPage.css'

const agentApi = createAgentApi()

const OUTCOME_LABELS = Object.freeze({
  'needs-clarification': 'Preciso de um detalhe',
  confirmed: 'Cadastro confirmado',
  empty: 'Nenhum registro encontrado',
  denied: 'Ação não permitida',
  refused: 'Não concluído',
  'timed-out': 'Tempo esgotado',
  cancelled: 'Cancelada',
  failed: 'Falha',
  uncertain: 'Resultado incerto',
})

export function ChatMessage({ message }) {
  const isAssistant = message.role === 'assistant'
  const sources = getChatSourceReferences(message.evidence)
  const label = OUTCOME_LABELS[message.status]

  return (
    <article className={`agent-chat-message${isAssistant ? ' is-assistant' : ' is-user'}`}>
      <div className="agent-chat-message-meta">
        <span>{isAssistant ? 'FlowZenit' : 'Você'}</span>
        {label ? <span className={`agent-chat-outcome is-${message.status}`}>{label}</span> : null}
      </div>
      <p className="agent-chat-message-text">{message.text}</p>
      {sources.length > 0 ? (
        <details className="agent-chat-sources">
          <summary>{sources.length === 1 ? '1 referência' : `${sources.length} referências`}</summary>
          <ul>
            {sources.map(source => (
              <li key={source.key}>
                <span className="agent-chat-source-label">{source.label}</span>
                <span>{source.citation}</span>
                {source.displayText ? <span className="agent-chat-source-text">{source.displayText}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  )
}

function ChatPage() {
  const [draft, setDraft] = useState('')
  const [chat, dispatch] = useReducer(chatReducer, undefined, createChatState)
  const pendingRequest = useRef(false)
  const abortController = useRef(null)
  const requestSequence = useRef(0)

  async function handleSubmit(event) {
    event.preventDefault()
    const message = draft.trim()
    if (!message || pendingRequest.current) return

    const requestId = `turn-${Date.now()}-${++requestSequence.current}`
    const activeChatMessages = buildActiveChatMessages(chat.messages)
    const controller = new AbortController()
    pendingRequest.current = true
    abortController.current = controller
    dispatch({ type: 'submit', requestId, message })
    setDraft('')

    try {
      const response = await agentApi.sendTurn({
        message,
        activeChatMessages,
        signal: controller.signal,
      })
      dispatch({ type: 'resolve', requestId, response })
    } catch (error) {
      dispatch({ type: 'reject', requestId, error })
    } finally {
      if (abortController.current === controller) abortController.current = null
      pendingRequest.current = false
    }
  }

  function handleCancel() {
    abortController.current?.abort()
  }

  function handleComposerKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    if (!chat.pending && draft.trim()) event.currentTarget.form?.requestSubmit()
  }

  function handleNewConversation() {
    if (pendingRequest.current) return
    dispatch({ type: 'clear' })
    setDraft('')
  }

  return (
    <section className="agent-chat-page" aria-labelledby="agent-chat-title">
      <header className="agent-chat-heading">
        <div>
          <p className="agent-chat-eyebrow"><span /> ASSISTENTE FLOWZENIT</p>
          <h1 id="agent-chat-title">Chat</h1>
          <p className="agent-chat-intro">Consulte seus dados e faça cadastros em uma conversa.</p>
        </div>
        <div className="agent-chat-heading-actions">
          <span className="agent-chat-scope">SUPABASE + RAG</span>
          {chat.messages.length > 0 ? (
            <button
              className="agent-chat-new"
              type="button"
              onClick={handleNewConversation}
              disabled={chat.pending}
            >
              Nova conversa
            </button>
          ) : null}
        </div>
      </header>

      <div className="agent-chat-workspace">
        <div className="agent-chat-transcript" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversa com o assistente">
          {chat.messages.length === 0 ? (
            <div className="agent-chat-empty-state">
              <span className="agent-chat-mark" aria-hidden="true">F</span>
              <h2>O que você precisa resolver?</h2>
              <p>Pergunte sobre tarefas, subtarefas, rotinas ou documentos. Se quiser cadastrar algo, diga os detalhes na mesma mensagem.</p>
              <div className="agent-chat-suggestions" aria-label="Sugestões de perguntas">
                <button type="button" onClick={() => setDraft('O que está pendente?')}>O que está pendente?</button>
                <button type="button" onClick={() => setDraft('Quais rotinas tenho hoje?')}>Quais rotinas tenho hoje?</button>
                <button type="button" onClick={() => setDraft('Encontre informações sobre…')}>Buscar nos documentos</button>
              </div>
            </div>
          ) : chat.messages.map(message => <ChatMessage key={message.id} message={message} />)}
          {chat.pending ? (
            <div className="agent-chat-message is-assistant" role="status" aria-label="Aguardando resposta do agente">
              <div className="agent-chat-message-meta"><span>FlowZenit</span><span>Consultando</span></div>
              <span className="agent-chat-thinking" aria-hidden="true"><span /><span /><span /></span>
            </div>
          ) : null}
        </div>

        <form className="agent-chat-composer" onSubmit={handleSubmit}>
          <label className="agent-chat-sr-only" htmlFor="agent-chat-input">Sua mensagem</label>
          <textarea
            id="agent-chat-input"
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={chat.pending ? 'Aguarde a resposta…' : 'Pergunte ou peça um cadastro…'}
            rows={1}
            disabled={chat.pending}
          />
          {chat.pending ? (
            <button className="agent-chat-cancel" type="button" onClick={handleCancel}>
              Cancelar
            </button>
          ) : (
            <button type="submit" disabled={!draft.trim()} aria-label="Enviar mensagem">
              <span>Enviar</span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13M10 4l6 6-6 6" /></svg>
            </button>
          )}
        </form>

        <p className="agent-chat-keyboard-hint">Enter envia · Shift + Enter quebra linha</p>
        <p className="agent-chat-disclosure">
          <span aria-hidden="true">i</span>
          POC pública: o agente usa as permissões Supabase anon existentes. Mensagens ativas e dados relevantes podem ser enviados ao modelo configurado.
        </p>
      </div>
    </section>
  )
}

export default ChatPage
