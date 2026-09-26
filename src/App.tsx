import { MessageSquareText } from 'lucide-react';
import { ConnectionForm } from './session/ConnectionForm';
import { useSession } from './session/useSession';
import { ChatPage } from './chat/ChatPage';

function App() {
  const { session, connectionState, error, connect, disconnect } = useSession();

  return (
    <div className="app-shell">
      {!session && (
        <header className="app-header">
          <div className="brand"><MessageSquareText size={22} aria-hidden="true" /><span>Тестовый чат MAX</span></div>
          <span className="stage-label">GREEN-API</span>
        </header>
      )}
      <main className={`app-main${session ? ' app-main-connected' : ''}`}>
        {session ? (
          <ChatPage key={session.generation} session={session} onDisconnect={disconnect} />
        ) : (
          <ConnectionForm connectionState={connectionState} error={error} onConnect={connect} />
        )}
      </main>
    </div>
  );
}

export default App;
