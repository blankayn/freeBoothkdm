import { useState } from 'react';
import { useCouple } from '../../state/coupleStore';
import { Button } from '../ui/Primitives';

/**
 * The couple-booth door: host a room, get a code, or join with your partner's.
 * Rendered above the camera once the user opts into the couple booth.
 */
export function RoomJoin({ onDone }: { onDone: () => void }) {
  const host = useCouple((s) => s.host);
  const join = useCouple((s) => s.join);
  const partner = useCouple((s) => s.partner);
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'choose' | 'host' | 'join'>('choose');

  const normalized = code
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, '')
    .slice(0, 5);

  if (mode === 'choose') {
    return (
      <div className="room-join" role="dialog" aria-label="Start a couple booth">
        <p className="room-join__title">Booth with your partner</p>
        <div className="room-join__row">
          <Button onClick={() => setMode('host')}>Host a room</Button>
          <Button variant="ghost" onClick={() => setMode('join')}>
            Join with a code
          </Button>
        </div>
      </div>
    );
  }

  if (mode === 'host') {
    const room = host();
    return (
      <div className="room-join" role="dialog" aria-label="Room code">
        <p className="room-join__title">Share this code</p>
        <p className="room-join__code" aria-label={`Room code ${room}`}>
          {room}
        </p>
        <p className="room-join__hint">
          {partner === 'live'
            ? 'Partner connected — entering the booth…'
            : 'Waiting for your partner…'}
        </p>
        {partner === 'live' ? (
          <Button onClick={onDone}>Enter the booth</Button>
        ) : (
          <Button variant="ghost" onClick={() => useCouple.getState().leave()}>
            Cancel
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="room-join" role="dialog" aria-label="Join a room">
      <p className="room-join__title">Enter your partner&rsquo;s code</p>
      <input
        className="room-join__input"
        value={normalized}
        onChange={(e) => setCode(e.target.value)}
        placeholder="ABCDE"
        aria-label="Room code"
        maxLength={5}
      />
      <div className="room-join__row">
        <Button
          disabled={normalized.length !== 5}
          onClick={() => {
            join(normalized);
            onDone();
          }}
        >
          Join
        </Button>
        <Button variant="ghost" onClick={() => setMode('choose')}>
          Back
        </Button>
      </div>
    </div>
  );
}
