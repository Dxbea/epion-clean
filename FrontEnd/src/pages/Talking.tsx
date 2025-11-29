import React, { JSX } from 'react'
import { FiSend } from 'react-icons/fi'
import Sidebar from '../components/Sidebar'

type Msg = { sender: 'ai'|'user'; text: string }

export default function ChatPage(): JSX.Element {
  const [messages, setMessages] = React.useState<Msg[]>([
    { sender: 'ai', text: 'Salut ! Pose-moi ta question.' },
  ])
  const [input, setInput] = React.useState('')
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim()) return

    const newMessage: Msg = { sender: 'user', text: input }
    setMessages((prev) => [...prev, newMessage])
    setInput('')

    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // ⚠️ Remplace par ta clé via .env (VITE_MISTRAL_KEY) et un proxy serveur côté backend.
          Authorization: `Bearer VOTRE_CLE_API_MISTRAL`,
        },
        body: JSON.stringify({
          model: 'mistral-tiny',
          messages: [
            ...messages.map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
            { role: 'user', content: newMessage.text },
          ],
          max_tokens: 200,
        }),
      })

      const data = await response.json()
      const aiReply = data?.choices?.[0]?.message?.content ?? "⚠️ Pas de réponse."
      setMessages((prev) => [...prev, { sender: 'ai', text: aiReply }])
    } catch (error) {
      console.error('Erreur API:', error)
      setMessages((prev) => [...prev, { sender: 'ai', text: "⚠️ Erreur de connexion à l'API" }])
    }
  }

  const handleKeyPress: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') sendMessage()
  }

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 ml-16 md:ml-56 p-4">
        <div className="flex flex-col h-screen bg-[#FAFAF7]">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, index) => (
              <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-xs md:max-w-md px-4 py-2 rounded-2xl text-sm md:text-base ${
                    msg.sender === 'user'
                      ? 'bg-black text-white rounded-br-none'
                      : 'bg-gray-200 text-black rounded-bl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t bg-[#FAFAF7]">
            <div className="flex items-center bg-black text-white rounded-full px-4 py-2">
              <input
                type="text"
                className="flex-1 bg-transparent outline-none placeholder-gray-400 text-sm md:text-base"
                placeholder="Écris ici..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
              />
              <button onClick={sendMessage} className="ml-2 p-2 rounded-full hover:bg-gray-800 transition">
                <FiSend size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
