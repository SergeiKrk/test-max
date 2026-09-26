import { ConnectionScene } from './session/ConnectionScene';
import { useSession } from './session/useSession';
import { ChatPage } from './chat/ChatPage';

function App() {
  const { session, connectionState, error, connect, disconnect } = useSession();
  const [entered, setEntered] = useState(false);
  const onEntered = useCallback(() => setEntered(true), []);
  const onDisconnect = () => { setEntered(false); disconnect(); };

  return (
    <div className="app-shell">
      <main className="app-main app-main-connected">
        {session && entered ? (
          <ChatPage key={session.generation} session={session} onDisconnect={onDisconnect} />
        ) : (
          <ConnectionScene connectionState={connectionState} error={error} onConnect={connect} onEntered={onEntered} />
        )}
      </main>
    </div>
  );
}

export default App;
import { useCallback, useState } from 'react';
